import { DatabaseSync } from "node:sqlite";
import { config, engineName } from "../config.js";
import {
  nowIso, todayInTz, humanDate, humanTime, addDays, newId,
} from "../db/database.js";
import { classify } from "./nlu.js";
import { detectUrdu, humanDateUr, humanTimeUr } from "./urdu.js";
import { responder, Persona } from "./responder.js";
import { TOOLS, TOOL_LABELS, findAppointmentsByName, normalizePhone, ToolContext, ToolResult } from "../tools/tools.js";
import { searchKnowledge, sourcesOf, RetrievedChunk } from "../rag/retrieval.js";
import { listAvailableSlots } from "../services/availability.js";
import { AgentEvent, AgentState, BookingFlow, Intent, Outcome } from "./types.js";
import { runOpenAiTurn } from "./llm.js";
import { liveHub } from "../services/liveHub.js";

/* ------------------------------------------------------------------ */
/* Conversation + state helpers                                        */
/* ------------------------------------------------------------------ */

export function getOrCreateConversation(
  db: DatabaseSync, id: string | undefined, channel: string, customerName?: string
): { id: string; created: boolean } {
  if (id) {
    const row = db.prepare(`SELECT id FROM conversations WHERE id = ?`).get(id);
    if (row) return { id, created: false };
  }
  const cid = newId("conv");
  db.prepare(
    `INSERT INTO conversations (id, customer_name, channel, status, started_at, agent_state)
     VALUES (?, ?, ?, 'open', ?, '{}')`
  ).run(cid, customerName ?? null, channel, nowIso());
  return { id: cid, created: true };
}

function loadState(db: DatabaseSync, convId: string): AgentState {
  const row = db.prepare(`SELECT agent_state FROM conversations WHERE id = ?`).get(convId) as
    | { agent_state: string } | undefined;
  try { return row ? (JSON.parse(row.agent_state) as AgentState) : {}; }
  catch { return {}; }
}

function saveState(db: DatabaseSync, convId: string, state: AgentState): void {
  db.prepare(`UPDATE conversations SET agent_state = ? WHERE id = ?`).run(JSON.stringify(state), convId);
}

function getBusinessName(db: DatabaseSync): string {
  try {
    const row = db.prepare(`SELECT value FROM kv_settings WHERE key = 'business'`).get() as { value: string };
    return (JSON.parse(row.value).name as string) || "Faisal Hospital";
  } catch { return "Faisal Hospital"; }
}

function saveMessage(
  db: DatabaseSync, convId: string, role: string, content: string,
  toolCalls: Array<Record<string, unknown>> = [], sources: Array<Record<string, unknown>> = []
): void {
  db.prepare(
    `INSERT INTO messages (conversation_id, role, content, tool_calls, sources, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(convId, role, content, JSON.stringify(toolCalls), JSON.stringify(sources), nowIso());
}

function toolSummary(name: string, result: ToolResult): string {
  if (!result.success) return "failed";
  const d = (result.data ?? {}) as Record<string, unknown>;
  switch (name) {
    case "check_availability": return `${(d.slots as string[] ?? []).length} slots found`;
    case "book_appointment": return `${d.appointment_id} booked`;
    case "cancel_appointment": return `${d.appointment_id} cancelled`;
    case "reschedule_appointment": return `${d.appointment_id} moved`;
    case "search_knowledge_base": return `${d.count} sources found`;
    case "escalate_to_human": return "escalated";
    default: return "done";
  }
}

/* ------------------------------------------------------------------ */
/* Turn runner                                                         */
/* ------------------------------------------------------------------ */

let openAiExhaustedUntil = 0;

export async function* runTurn(
  db: DatabaseSync,
  conversationId: string | undefined,
  userText: string,
  channel: "chat" | "voice",
  customerName?: string
): AsyncGenerator<AgentEvent> {
  const t0 = Date.now();
  const { id: convId } = getOrCreateConversation(db, conversationId, channel, customerName);
  yield { type: "meta", data: { conversation_id: convId, channel, engine: engineName } };

  saveMessage(db, convId, "user", userText);
  liveHub.broadcast("message", {
    conversation_id: convId,
    role: "user",
    content: userText,
    created_at: nowIso(),
  });
  liveHub.broadcast("conversation_update", {
    conversation_id: convId,
    last_message: userText,
    sender: "user",
  });

  const state = loadState(db, convId);
  state.turns = (state.turns ?? 0) + 1;

  if (state.taken_over) {
    const isUrdu = state.lang === "ur" || detectUrdu(userText);
    const holdMsg = isUrdu
      ? "آپ کی گفتگو ہمارے لائیو ریسپشنسٹ کے سپرد ہے۔ وہ جلد آپ کو جواب دیں گے۔"
      : "A human receptionist has taken over this conversation and will reply to you shortly.";

    yield { type: "token", data: { text: holdMsg } };
    yield { type: "done", data: { intent: "human_request", outcome: "open", latency_ms: Date.now() - t0 } };
    return;
  }
  // Language sticks for the conversation once Urdu is detected — the whole
  // reply pipeline (responder templates, dates, service names) switches.
  if (state.lang !== "ur" && detectUrdu(userText)) state.lang = "ur";
  const persona: Persona = {
    businessName: getBusinessName(db),
    voice: channel === "voice",
    lang: state.lang === "ur" ? "ur" : "en",
  };
  const ctx: ToolContext = { db, conversationId: convId, channel };

  // Collected during the turn; persisted with the assistant message.
  const toolCalls: Array<{ tool: string; label: string }> = [];
  let sources: Array<{ doc_id: string; title: string; section: string }> = [];
  let appointmentEvent: { action: string; appointment: Record<string, unknown> } | null = null;
  let escalationReason: string | null = null;
  let intent: Intent = "unknown";
  let outcome: Outcome = "open";
  let reply = "";

  /** Execute a tool with streaming activity events. */
  function* doTool(name: string, args: Record<string, unknown>): Generator<AgentEvent, ToolResult, unknown> {
    const label = TOOL_LABELS[name] ?? name;
    yield { type: "tool", data: { tool: name, label, phase: "started" } };
    let result: ToolResult;
    try {
      result = TOOLS[name].execute(ctx, TOOLS[name].schema.parse(args));
    } catch (e) {
      result = { success: false, error: { code: "tool_error", message: e instanceof Error ? e.message : "Tool failed" } };
    }
    toolCalls.push({ tool: name, label });
    yield { type: "tool", data: { tool: name, label, phase: "done", summary: toolSummary(name, result) } };
    return result;
  }

  let handled = false;
  let tokensStreamed = false;
  try {
    const isExhausted = Date.now() < openAiExhaustedUntil;
    if (engineName === "openai" && !isExhausted) {
      try {
        const r = yield* runOpenAiTurn(db, convId, userText, channel, persona, doTool);
        reply = r.text; intent = r.intent; outcome = r.outcome;
        sources = r.sources; appointmentEvent = r.appointmentEvent; escalationReason = r.escalationReason;
        toolCalls.push(...r.toolCalls);
        tokensStreamed = Boolean(r.tokensStreamed);
        handled = true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("402") || msg.includes("credits") || msg.includes("limit exceeded")) {
          openAiExhaustedUntil = Date.now() + 60_000;
          console.warn("[agent] OpenRouter credit limit reached. Temporarily using high-speed hospital engine for 60s.");
        } else {
          console.warn("[agent] OpenRouter/LLM error, seamlessly falling back to local hospital engine:", msg);
        }
      }
    }
    if (!handled) {
      const nlu = classify(db, userText, state);
      intent = nlu.intent;
      const r = yield* handleIntent(db, convId, state, persona, nlu.intent, nlu.entities as never, doTool, userText);
      reply = r.reply; outcome = r.outcome;
      sources = r.sources; appointmentEvent = r.appointmentEvent; escalationReason = r.escalationReason;
      if (r.intent) intent = r.intent;
    }
    if (intent !== "unknown") state.fails = 0;
  } catch (e) {
    console.error("[agent] turn failed:", e);
    reply = responder.error(persona);
    outcome = "open";
  }

  // Persist turn
  saveMessage(db, convId, "assistant", reply, toolCalls, sources);
  saveState(db, convId, state);
  const status = outcome === "escalated" ? "escalated" : outcome === "open" ? "open" : "resolved";
  db.prepare(
    `UPDATE conversations SET status = ?, intent = ?, outcome = ?, ended_at = ?,
       duration_s = CAST((julianday(?) - julianday(started_at)) * 86400 AS INTEGER),
       customer_name = COALESCE(customer_name, ?), summary = ?
     WHERE id = ?`
  ).run(status, intent, outcome, nowIso(), nowIso(), state.flow?.name ?? null,
    `${intent} — ${outcome}`, convId);

  liveHub.broadcast("message", {
    conversation_id: convId,
    role: "assistant",
    content: reply,
    tool_calls: toolCalls,
    sources,
    created_at: nowIso(),
  });
  liveHub.broadcast("conversation_update", {
    conversation_id: convId,
    last_message: reply,
    sender: "assistant",
    intent,
    outcome,
    status,
  });
  if (escalationReason) {
    liveHub.broadcast("escalation", {
      conversation_id: convId,
      reason: escalationReason,
    });
  }

  if (sources.length && !handled) yield { type: "sources", data: { sources } };

  // Stream the reply if not already streamed in real time by the LLM
  if (!tokensStreamed && reply) {
    const chunks = reply.match(/\S+\s*/g) ?? [reply];
    let buf = "";
    for (const c of chunks) {
      buf += c;
      if (buf.length >= 24 || /[.!?]\s*$/.test(buf)) {
        yield { type: "token", data: { text: buf } };
        buf = "";
        await new Promise((r) => setTimeout(r, 9));
      }
    }
    if (buf) yield { type: "token", data: { text: buf } };
  }

  if (appointmentEvent) yield { type: "appointment", data: appointmentEvent };
  if (escalationReason) yield { type: "escalation", data: { reason: escalationReason } };
  const latencyMs = Date.now() - t0;
  try {
    db.prepare(`INSERT INTO turn_metrics (conversation_id, latency_ms, created_at) VALUES (?, ?, ?)`)
      .run(convId, latencyMs, nowIso());
  } catch { /* metrics must never break a turn */ }
  yield { type: "done", data: { intent, outcome, latency_ms: latencyMs } };
}

/* ------------------------------------------------------------------ */
/* Intent routing (local demo brain)                                   */
/* ------------------------------------------------------------------ */

interface TurnResult {
  reply: string;
  outcome: Outcome;
  sources: Array<{ doc_id: string; title: string; section: string }>;
  appointmentEvent: { action: string; appointment: Record<string, unknown> } | null;
  escalationReason: string | null;
  intent?: Intent;
}

type DoTool = (name: string, args: Record<string, unknown>) => Generator<AgentEvent, ToolResult, unknown>;

function emptyTurn(reply: string, outcome: Outcome): TurnResult {
  return { reply, outcome, sources: [], appointmentEvent: null, escalationReason: null };
}

function* handleIntent(
  db: DatabaseSync, convId: string, state: AgentState, persona: Persona,
  intent: Intent, e: Record<string, string | number | boolean | undefined>,
  doTool: DoTool, userText: string
): Generator<AgentEvent, TurnResult, unknown> {
  const n = state.turns ?? 0;
  const flow = state.flow;

  // A pending flow + an informational question: answer it directly without hijacking or nagging the user.
  if (flow && ["hours_info", "location_info", "pricing_info", "policy_info", "faq", "services_info", "service_detail"].includes(intent)) {
    return yield* answerInfo(db, state, persona, intent, e, doTool, n, userText);
  }

  switch (intent) {
    case "greeting": return emptyTurn(responder.greeting(persona, n), "resolved");
    case "smalltalk": return emptyTurn(responder.thanks(persona, n), "resolved");
    case "goodbye": return emptyTurn(responder.goodbye(persona, n), "resolved");

    case "services_info":
    case "service_detail":
    case "hours_info":
    case "location_info":
    case "pricing_info":
    case "policy_info":
    case "faq":
      return yield* answerInfo(db, state, persona, intent, e, doTool, n, userText);

    case "availability_check":
      return yield* handleAvailability(db, state, persona, e, doTool, n, false);

    case "book_appointment":
      return yield* handleBookFlow(db, state, persona, e, doTool, n, userText);

    case "provide_details": {
      const flowIntent: Intent =
        flow?.action === "book" ? "book_appointment"
        : flow?.action === "cancel" ? "cancel_appointment"
        : flow?.action === "reschedule" ? "reschedule_appointment" : "provide_details";
      if (flow?.action === "book") {
        const r = yield* handleBookFlow(db, state, persona, e, doTool, n, userText);
        r.intent = flowIntent; return r;
      }
      if (flow?.action === "cancel") {
        const r = yield* handleCancelFlow(db, state, persona, e, doTool, n);
        r.intent = flowIntent; return r;
      }
      if (flow?.action === "reschedule") {
        const r = yield* handleRescheduleFlow(db, state, persona, e, doTool, n);
        r.intent = flowIntent; return r;
      }
      return emptyTurn(responder.unknown(persona, state.fails ?? 0), "open");
    }

    case "cancel_appointment":
      return yield* handleCancelFlow(db, state, persona, e, doTool, n);

    case "reschedule_appointment":
      return yield* handleRescheduleFlow(db, state, persona, e, doTool, n);

    case "human_request": {
      const reason = `Customer asked for a human (${userText.slice(0, 120)})`;
      yield* doTool("escalate_to_human", { reason });
      state.flow = undefined;
      return { reply: responder.escalation(persona, n), outcome: "escalated", sources: [], appointmentEvent: null, escalationReason: reason };
    }

    case "complaint": {
      const reason = `Complaint: ${userText.slice(0, 160)}`;
      const ack = responder.complaintAck(persona, state.flow?.name);
      yield* doTool("escalate_to_human", { reason });
      state.flow = undefined;
      return { reply: `${ack} ${responder.escalation(persona, n)}`, outcome: "escalated", sources: [], appointmentEvent: null, escalationReason: reason };
    }

    case "emergency": {
      const reason = `EMERGENCY_ROUTED: Patient describes red-flag symptoms (${userText.slice(0, 160)})`;
      yield* doTool("escalate_to_human", { reason });
      state.flow = undefined;
      return {
        reply: responder.emergency(persona),
        outcome: "escalated",
        sources: [],
        appointmentEvent: null,
        escalationReason: reason,
      };
    }

    case "medical_advice":
      state.fails = 0;
      return emptyTurn(responder.medicalAdvice(persona), "open");

    default: {
      // Unparseable input while a flow is active → let the flow handle it
      // (re-ask / re-offer) instead of dropping the conversation context.
      if (flow?.action === "book") {
        const r = yield* handleBookFlow(db, state, persona, e, doTool, n);
        r.intent = "book_appointment"; return r;
      }
      if (flow?.action === "cancel") {
        const r = yield* handleCancelFlow(db, state, persona, e, doTool, n);
        r.intent = "cancel_appointment"; return r;
      }
      if (flow?.action === "reschedule") {
        const r = yield* handleRescheduleFlow(db, state, persona, e, doTool, n);
        r.intent = "reschedule_appointment"; return r;
      }
      const fails = (state.fails ?? 0) + 1;
      state.fails = fails;
      return emptyTurn(responder.unknown(persona, fails), "open");
    }
  }
}

/** What the pending flow still needs, phrased as the next question. */
function pendingQuestion(persona: Persona, flow: BookingFlow, n: number): string | null {
  if (flow.action === "book") {
    if (!flow.service_id) return responder.askService(persona, n);
    if (!flow.date) return responder.askDate(persona, flow.service_name ?? "appointment", n);
    if (!flow.time) return responder.askTime(persona, n);
    if (!flow.name) return responder.askName(persona, n);
    if (!flow.phone) return responder.askPhone(persona, flow.name ?? "there", n);
    return "Shall I go ahead and book it?";
  }
  if (flow.action === "cancel" && !flow.appointment_id) return responder.askCancelName(persona, n);
  if (flow.action === "reschedule" && !flow.appointment_id) return responder.askCancelName(persona, n);
  return null;
}

/* ------------------------------------------------------------------ */
/* Information answering (RAG)                                         */
/* ------------------------------------------------------------------ */

function* answerInfo(
  db: DatabaseSync, state: AgentState, persona: Persona, intent: Intent,
  e: Record<string, string | number | boolean | undefined>,
  doTool: DoTool, n: number, userText: string
): Generator<AgentEvent, TurnResult, unknown> {
  // Deterministic sources first.
  if (intent === "services_info") {
    const r = yield* doTool("get_services", {});
    if (!r.success) return emptyTurn(responder.error(persona), "open");
    const services = (r.data!.services as Array<{ id: string; name: string; duration_min: number; price: string; description?: string }>);

    const userLow = userText.toLowerCase();
    const askingOther = /other\s+(than|then|doctor|doc)|different\s+doctor|someone\s+else/i.test(userLow);

    // If already in a flow and asking about other doctors in that department
    if (askingOther && state.flow?.service_id) {
      const currentId = state.flow.service_id;
      const currentSvc = services.find((s) => s.id === currentId);
      const deptMatch = currentSvc?.name.match(/\((.*?)\)/);
      const dept = deptMatch ? deptMatch[1].toLowerCase() : "";
      const otherSvcs = services.filter((s) => s.id !== currentId && (dept ? s.name.toLowerCase().includes(dept) : true));
      if (otherSvcs.length > 0) {
        const alt = otherSvcs[0];
        state.flow.service_id = alt.id;
        state.flow.service_name = alt.name;
        state.flow.awaiting = "date";
        if (persona.voice) {
          return emptyTurn(
            `In ${deptMatch ? deptMatch[1] : "that department"}, we also have ${alt.name.split(" (")[0]}. Would you like to check available days for ${alt.name.split(" (")[0]}?`,
            "open"
          );
        }
        return emptyTurn(
          `Yes! In ${deptMatch ? deptMatch[1] : "that department"}, we also have **${alt.name}**.\n\nWould you like to check available days for ${alt.name}?`,
          "open"
        );
      } else {
        state.flow.service_id = undefined;
        state.flow.service_name = undefined;
        state.flow.awaiting = "service";
        return emptyTurn(
          persona.voice
            ? "We have specialists in Cardiology, Pediatrics, Gynecology, Urology, and Orthopedics. Which department would you like?"
            : "We have specialists available across several outpatient departments at Faisal Hospital:\n\n• **Cardiology** (Dr. Shakeel Ahmad)\n• **Pediatrics** (Dr. Junaid Ahmed, Dr. Aqsa Rafique)\n• **Gynecology** (Dr. Abida Javaid, Dr. Rizwana Rizvi)\n• **Urology** (Prof. Dr. Muhammad Sohail, Dr. Zahid Iqbal)\n• **Orthopedics** (Dr. Usman Akmal, Dr. Farhan Sarwar)\n\nWhich department or doctor would you like to consult?",
          "open"
        );
      }
    }

    // If asking about a specific department's doctors (e.g. "which dermatologist", "is any dermatologist available")
    const deptKeywords = [
      { key: "dermatol|skin|derma|acne|zild", name: "Dermatology" },
      { key: "pediatric|paediatric|child|kids|baby|bachon", name: "Pediatrics" },
      { key: "gynecol|gynaecol|gynae|obs|women|pregnancy|aurat", name: "Gynecology" },
      { key: "cardio|heart|dil", name: "Cardiology" },
      { key: "orthoped|ortho|bone|joint|fracture|haddi", name: "Orthopedic Surgery" },
      { key: "neuro|brain|nerve|spine|dimagh", name: "Neurology" },
      { key: "pulmono|pulmo|chest|lung|saans", name: "Pulmonology" },
      { key: "uro|kidney|bladder|masana|gurda", name: "Urology" },
      { key: "ent|ear|nose|throat|kaan|gala|naak", name: "ENT" },
      { key: "surg|laparoscop|operation", name: "General & Laparoscopic Surgery" },
      { key: "medicine|general physician|medical specialist", name: "Internal & General Medicine" },
    ];
    const matchedDept = deptKeywords.find((d) => new RegExp(`(${d.key})`, "i").test(userLow));
    if (matchedDept) {
      const deptDocs = services.filter((s) => s.name.toLowerCase().includes(matchedDept.name.toLowerCase()));
      if (deptDocs.length > 0) {
        if (persona.voice) {
          const names = deptDocs.map((s) => s.name.split(" (")[0]).join(" and ");
          state.flow = { action: "book", awaiting: "service" };
          return emptyTurn(
            `In ${matchedDept.name}, we have ${names}. Would you like to book an appointment with one of them?`,
            "open"
          );
        }
        const lines = deptDocs.map((s, idx) => {
          const desc = s.description ? s.description : `${s.duration_min} min consultation`;
          return `${idx + 1}. **${s.name}**\n   ${desc}`;
        }).join("\n\n");
        state.flow = { action: "book", awaiting: "service" };
        return emptyTurn(
          `In ${matchedDept.name}, we have ${deptDocs.length} specialists available at Faisal Hospital:\n\n${lines}\n\nWhich doctor would you like to book an appointment with?`,
          "open"
        );
      }
    }

    const list = responder.serviceList(persona, services, n);
    // Asked about something we don't offer ("do you offer acupuncture?") — say so, then list.
    const askedUnknown = !e.service_id && /do you (offer|do|provide|have)/i.test(userText);
    return emptyTurn(askedUnknown ? `We don't offer that service, I'm afraid. ${list}` : list, "resolved");
  }
  if (intent === "hours_info") {
    const r = yield* doTool("get_business_hours", {});
    if (!r.success) return emptyTurn(responder.error(persona), "open");
    return emptyTurn(responder.hours(persona, r.data!.hours as never, n), "resolved");
  }
  if (intent === "location_info") {
    return emptyTurn(responder.location(persona), "resolved");
  }
  if (intent === "pricing_info") {
    const userLow = userText.toLowerCase();
    if (/emergency|er\b|triage/i.test(userLow)) {
      return emptyTurn(
        persona.lang === "ur"
          ? "ہماری 24 گھنٹے ایمرجنسی میں ابتدائی چیک اپ اور ٹریج کی فیس 1000 روپے ہے۔"
          : "Initial consultation and triage fee at our 24/7 Emergency Department is PKR 1,000.",
        "resolved"
      );
    }
    if (e.service_id) {
      const r = yield* doTool("get_services", {});
      const svc = ((r.data!.services as Array<never>) ?? []).find((s) => (s as { id: string }).id === e.service_id) as
        | { name: string; duration_min: number; price: string; description: string } | undefined;
      if (svc) return emptyTurn(responder.doctorFee(persona, svc.name, svc.price), "resolved");
    }
  }
  if (intent === "service_detail" && e.service_id) {
    const r = yield* doTool("get_services", {});
    const svc = ((r.data!.services as Array<never>) ?? []).find((s) => (s as { id: string }).id === e.service_id) as
      | { name: string; duration_min: number; price: string; description: string } | undefined;
    if (svc) {
      const userLow = userText.toLowerCase();
      const isTimingOnly = /time|timing|timings|hour|hours|schedule|when|days|routine|shuru|khatam|waqt|auqat/i.test(userLow) && !/fee|fees|cost|price|pricing|charge|charges|how much|rate/i.test(userLow);
      const isFeeOnly = /fee|fees|cost|price|pricing|charge|charges|how much|rate/i.test(userLow) && !/time|timing|timings|hour|hours|schedule|when|days/i.test(userLow);

      if (isTimingOnly) {
        return emptyTurn(responder.doctorTimings(persona, svc.name, svc.description), "resolved");
      }
      if (isFeeOnly) {
        return emptyTurn(responder.doctorFee(persona, svc.name, svc.price), "resolved");
      }

      // General detail inquiry
      const kb = yield* doTool("search_knowledge_base", { query: `${e.service_name} details duration`, limit: 3 });
      const chunks = kb.success ? (kb.data!.results as RetrievedChunk[]) : [];
      const sources = sourcesOf(chunks);
      let desc = svc.description ?? "";
      if (chunks.length > 0) {
        const doctorName = svc.name.replace(/\s*\(.*?\)/, "").trim();
        const matchedLine = chunks
          .flatMap((c) => c.content.split("\n"))
          .find((line) => line.toLowerCase().includes(doctorName.toLowerCase()));
        if (matchedLine) {
          desc = matchedLine.replace(/^[-*•\s]+/, "").trim();
        }
      }
      const t: TurnResult = emptyTurn(responder.serviceDetail(persona, svc.name, desc || svc.description, svc.duration_min, svc.price, n), "resolved");
      t.sources = sources;
      return t;
    }
  }

  // RAG fallback for everything else — search the user's own words.
  const kb = yield* doTool("search_knowledge_base", { query: userText, limit: 4 });
  const chunks = kb.success ? (kb.data!.results as RetrievedChunk[]) : [];
  const sources = sourcesOf(chunks);
  if (!chunks.length) {
    const topic = intent === "policy_info" ? "that policy" : "that";
    return { ...emptyTurn(responder.noKb(topic, persona), "open"), sources: [] };
  }
  const answer = composeKbAnswer(chunks, persona, userText);
  return { ...emptyTurn(answer, "resolved"), sources };
}

/** Compose a grounded, concise answer from retrieved chunks (no invention, only what was asked). */
function composeKbAnswer(chunks: RetrievedChunk[], persona: Persona, userText: string): string {
  if (!chunks.length) return responder.noKb("that", persona);

  const userLow = userText.toLowerCase();

  // 1. Direct facility / service exact answers for high-frequency patient queries:
  // Emergency Doctor / 24/7 ER availability / 2:00 AM (Check emergency first)
  if (/emergency|casualty|a&e|\ber\b/i.test(userLow) || (/2:00|at night|night doctor|late night/i.test(userLow) && /doctor|physician|duty|available/i.test(userLow))) {
    if (persona.lang === "ur") {
      return "جی ہاں، ہماری ایمرجنسی مین بلڈنگ (544-A) میں 24 گھنٹے کھلی ہے اور رات 2 بجے بھی ایمرجنسی میڈیکل آفیسر اور ڈاکٹرز ڈیوٹی پر موجود ہوتے ہیں۔";
    }
    return "Yes, our Accident & Emergency Department in the Main Building (544-A) is open 24/7, and qualified Emergency Medical Officers and doctors are on-duty around the clock, including at 2:00 AM.";
  }

  // Blood test / Laboratory (Strict \blabs?\b word boundary so 'available' does not match)
  if (/\blabs?\b|laboratory|blood\s*test|blood\s*bank|pathology/i.test(userLow)) {
    if (persona.lang === "ur") {
      return "جی ہاں، ہمارا مین لیبارٹری اور بلڈ بینک مین بلڈنگ (544-A) میں 24 گھنٹے کھلا رہتا ہے اور تمام ٹیسٹ چوبیس گھنٹے کیے جاتے ہیں۔";
    }
    return "Yes, our Main Diagnostic Laboratory & Blood Bank in the Main Building (544-A) is open 24 hours a day, 7 days a week for all routine and emergency blood tests.";
  }

  // Pharmacy / Medical store at night
  if (/pharmacy|medical\s*store|medicine/i.test(userLow)) {
    if (persona.lang === "ur") {
      return "جی ہاں، فیصل فارمیسی مین بلڈنگ (544-A) کے گراؤنڈ فلور پر رات سمیت 24 گھنٹے کھلی رہتی ہے۔";
    }
    return "Yes, Faisal Pharmacy on the Ground Floor of the Main Building (544-A) is open 24 hours a day, 7 days a week, including throughout the night.";
  }

  // Wheelchair assistance
  if (/wheelchair|wheel\s*chair|porter|entrance\s*assist/i.test(userLow)) {
    if (persona.lang === "ur") {
      return "جی ہاں، مین بلڈنگ (544-A) کے مرکزی دروازے پر مریضوں کے لیے وہیل چیئر اور عملے کی معاونت بالکل مفت دستیاب ہے۔";
    }
    return "Yes, wheelchair assistance and dedicated patient porters are available free of charge at the main entrance of our Main Building (544-A).";
  }

  // Child vaccination / Immunization
  if (/vaccin|immuniz|hifazati\s*teeky/i.test(userLow)) {
    if (persona.lang === "ur") {
      return "بچوں کی حفاظتی ٹیکہ جات (ویکسینیشن) کے لیے آپ مین بلڈنگ (544-A) کے گراؤنڈ فلور پر شعبہ اطفال میں پیر تا ہفتہ صبح 9:00 بجے سے دوپہر 2:00 بجے تک تشریف لا سکتے ہیں۔";
    }
    return "For child vaccination, our Child Immunization Clinic is located in the Pediatrics Department on the Ground Floor of the Main Building (544-A), open Monday through Saturday from 9:00 AM to 2:00 PM.";
  }
  // 2. Intelligent snippet extraction from knowledge base chunks
  const stopWords = new Set(["is", "your", "the", "a", "an", "do", "you", "we", "at", "in", "on", "for", "to", "of", "and", "or", "what", "where", "when", "which", "how", "who", "are", "can", "please", "tell", "me", "there"]);
  const queryWords = userLow.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !stopWords.has(w));

  let bestLine = "";
  let maxScore = 0;

  for (const chunk of chunks) {
    if (chunk.doc_id === "kb_unconfirmed" || chunk.title.toLowerCase().includes("unconfirmed")) {
      continue;
    }
    const lines = chunk.content.split("\n").map((l) => l.trim()).filter((l) => l.length > 10 && !l.startsWith("#"));
    for (const line of lines) {
      const lineLow = line.toLowerCase();
      let score = 0;
      for (const qw of queryWords) {
        if (lineLow.includes(qw)) score += 1;
      }
      if (score > maxScore) {
        maxScore = score;
        bestLine = line;
      }
    }
  }

  if (bestLine && maxScore >= 2) {
    const clean = bestLine.replace(/^[-*•\d.]+\s*/, "").trim();
    if (persona.voice) {
      return clean.length > 220 ? clean.slice(0, 220).trimEnd() + "..." : clean;
    }
    return clean;
  }

  return responder.noKb("that", persona);
}

/* ------------------------------------------------------------------ */
/* Availability                                                        */
/* ------------------------------------------------------------------ */

function filterByPref(slots: string[], pref?: string): string[] {
  if (!pref) return slots;
  const [lo, hi] = pref === "morning" ? [9, 12] : pref === "afternoon" ? [12, 17] : [17, 19];
  return slots.filter((s) => {
    const h = parseInt(s.split(":")[0], 10);
    return h >= lo && h < hi;
  });
}

function* handleAvailability(
  db: DatabaseSync, state: AgentState, persona: Persona,
  e: Record<string, string | number | boolean | undefined>,
  doTool: DoTool, n: number, fromBooking: boolean
): Generator<AgentEvent, TurnResult, unknown> {
  const serviceId = e.service_id as string | undefined;
  const serviceName = (e.service_name as string | undefined) ?? "appointment";
  if (!serviceId) {
    state.flow = { action: "book", awaiting: "service" };
    return emptyTurn(responder.askService(persona, n), "open");
  }
  const date = e.date as string | undefined;
  if (!date) {
    state.flow = { action: "book", service_id: serviceId, service_name: serviceName, awaiting: "date" };
    return emptyTurn(responder.askDate(persona, serviceName, n), "open");
  }
  if (date < todayInTz(config.businessTimezone)) {
    return emptyTurn(responder.pastDate(persona, n), "open");
  }
  const r = yield* doTool("check_availability", { service_id: serviceId, date });
  if (!r.success) {
    const code = r.error!.code;
    if (code === "closed") {
      state.flow = { action: "book", service_id: serviceId, service_name: serviceName, awaiting: "date" };
      return emptyTurn(responder.closedDay(persona, r.error!.message), "open");
    }
    return emptyTurn(`I couldn't check that date: ${r.error!.message}`, "open");
  }
  const slots = filterByPref(r.data!.slots as string[], e.timePref as string | undefined);
  if (!slots.length) {
    // Try the next few days automatically — a good receptionist does this.
    for (let i = 1; i <= 7; i++) {
      const d2 = addDays(date, i);
      const r2 = listAvailableSlots(db, serviceId, d2);
      if (r2.ok && r2.slots.length) {
        const s2 = filterByPref(r2.slots, e.timePref as string | undefined);
        if (s2.length) {
          state.flow = { action: "book", service_id: serviceId, service_name: serviceName, date: d2, offered: s2, offeredDate: d2, awaiting: "time" };
          return emptyTurn(
            `${responder.noSlots(persona, serviceName, date)} ${responder.nextDayOffer(persona, serviceName, d2, s2)}`,
            "open"
          );
        }
      }
    }
    return emptyTurn(responder.noSlots(persona, serviceName, date), "open");
  }
  // Remember the offer so "the second one" / "3 PM" resolves, and booking can continue.
  state.flow = { action: "book", service_id: serviceId, service_name: serviceName, date, offered: slots, offeredDate: date, awaiting: "time", timePref: e.timePref as never };
  const reply = e.timePref
    ? responder.availabilityFiltered(persona, serviceName, date, slots, e.timePref as string)
    : responder.availabilityOffer(persona, serviceName, date, slots, n);
  return emptyTurn(reply, "open");
}

/* ------------------------------------------------------------------ */
/* Booking flow                                                        */
/* ------------------------------------------------------------------ */

function mergeFlowEntities(flow: BookingFlow, e: Record<string, string | number | boolean | undefined>): void {
  if (e.service_id && !flow.service_id) { flow.service_id = e.service_id as string; flow.service_name = e.service_name as string; }
  if (e.date && flow.awaiting !== "time") flow.date = e.date as string;
  if (e.timePref && !flow.time) flow.timePref = e.timePref as BookingFlow["timePref"];
  if (e.name && !flow.name) flow.name = e.name as string;
  if (e.phone && !flow.phone) flow.phone = normalizePhone(e.phone as string) ?? (e.phone as string);
  if (e.email && !flow.email) flow.email = e.email as string;
}

function* handleBookFlow(
  db: DatabaseSync, state: AgentState, persona: Persona,
  e: Record<string, string | number | boolean | undefined>,
  doTool: DoTool, n: number, userText?: string
): Generator<AgentEvent, TurnResult, unknown> {
  if (!state.flow || state.flow.action !== "book") {
    state.flow = {
      action: "book",
      service_id: e.service_id as string | undefined,
      service_name: e.service_name as string | undefined,
      date: e.date as string | undefined,
      timePref: e.timePref as BookingFlow["timePref"],
      awaiting: undefined,
    };
  }
  const flow = state.flow;
  mergeFlowEntities(flow, e);

  // Resolve "the second one" / explicit time against the offered slots.
  if (!flow.time && flow.offered?.length) {
    if (typeof e.slotIndex === "number" && flow.offered[e.slotIndex]) {
      flow.time = flow.offered[e.slotIndex];
    } else if (e.time && flow.offered.includes(e.time as string)) {
      flow.time = e.time as string;
    } else if (e.time && flow.offeredDate) {
      // "3 PM" when we offered 15:30 — accept close matches within the offered set.
      const want = (e.time as string).slice(0, 2);
      const near = flow.offered.find((s) => s.startsWith(want));
      if (near && !e.timePref) flow.time = near;
      // Explicit time outside the offered set: set it anyway so validation
      // below reports honestly ("not available") instead of re-offering forever.
      else if (!e.timePref) flow.time = e.time as string;
    }
  } else if (!flow.time && e.time && !flow.offered) {
    flow.time = e.time as string; // will be validated by check_availability
  }

  // Declined at confirmation → let them change something.
  if (e.declined && flow.awaiting === "confirm_book") {
    flow.time = undefined; flow.offered = undefined; flow.awaiting = "time";
    return emptyTurn(responder.changedMind(persona), "open");
  }

  if (!flow.service_id) {
    flow.awaiting = "service";
    const userLow = (userText ?? "").toLowerCase();
    if (/which|what|list|who|tell me|available|consultation|option|show|data/i.test(userLow)) {
      const services = db.prepare(`SELECT name, description, duration_min FROM services WHERE active = 1 LIMIT 5`).all() as Array<{ name: string; description: string; duration_min: number }>;
      if (persona.voice) {
        return emptyTurn(
          "We have specialists available in Dermatology, Pediatrics, Orthopedic Surgery, Urology, and Gynecology. For example, Dr. Nadia Ali in Dermatology or Dr. Junaid in Pediatrics. Which doctor or specialty would you like to consult?",
          "open"
        );
      }
      const lines = services.map((s, idx) => `${idx + 1}. **${s.name}**\n   ${s.description ? s.description.split('.')[0] : s.duration_min + ' min'}`).join('\n\n');
      return emptyTurn(
        `We have several specialists available for consultation at Faisal Hospital:\n\n${lines}\n\nWhich doctor or department would you like to book?`,
        "open"
      );
    }
    return emptyTurn(responder.askService(persona, n), "open");
  }
  if (!flow.date) {
    flow.awaiting = "date";
    return emptyTurn(responder.askDate(persona, flow.service_name ?? "appointment", n), "open");
  }
  // Past date (e.g. "yesterday", "last Monday") → say so plainly, ask again.
  if (flow.date < todayInTz(config.businessTimezone)) {
    flow.date = undefined; flow.awaiting = "date";
    return emptyTurn(responder.pastDate(persona, n), "open");
  }

  // Need a time: (re)check availability when we have no offer for this date.
  if (!flow.time) {
    if (!flow.offered || flow.offeredDate !== flow.date) {
      const r = yield* doTool("check_availability", { service_id: flow.service_id, date: flow.date });
      if (!r.success) {
        if (r.error!.code === "closed") {
          flow.date = undefined; flow.awaiting = "date";
          return emptyTurn(responder.closedDay(persona, r.error!.message), "open");
        }
        return emptyTurn(`I couldn't check that date: ${r.error!.message}`, "open");
      }
      const slots = filterByPref(r.data!.slots as string[], flow.timePref);
      if (!slots.length) {
        for (let i = 1; i <= 7; i++) {
          const d2 = addDays(flow.date, i);
          const r2 = listAvailableSlots(db, flow.service_id, d2);
          if (r2.ok && r2.slots.length) {
            const s2 = filterByPref(r2.slots, flow.timePref);
            if (s2.length) {
              const requestedDate = flow.date; // keep the original for the "fully booked" line
              flow.date = d2; flow.offered = s2; flow.offeredDate = d2; flow.awaiting = "time";
              return emptyTurn(
                `${responder.noSlots(persona, flow.service_name!, requestedDate)} ${responder.nextDayOffer(persona, flow.service_name!, d2, s2)}`,
                "open"
              );
            }
          }
        }
        flow.awaiting = "date";
        return emptyTurn(responder.noSlots(persona, flow.service_name!, flow.date), "open");
      }
      flow.offered = slots; flow.offeredDate = flow.date;
    }
    // timePref given but no explicit time → if exactly the flow just learned a pref, present filtered.
    if (flow.timePref && flow.offered) {
      flow.awaiting = "time";
      return emptyTurn(responder.availabilityFiltered(persona, flow.service_name!, flow.date, flow.offered, flow.timePref), "open");
    }
    flow.awaiting = "time";
    return emptyTurn(responder.availabilityOffer(persona, flow.service_name!, flow.date, flow.offered!, n), "open");
  }

  // Validate the chosen time is actually free (never trust, always verify).
  const check = listAvailableSlots(db, flow.service_id, flow.date);
  if (!check.ok || !check.slots.includes(flow.time)) {
    // Distinguish a real race (time was offered, then taken) from a time that
    // was never available — the message must not claim a race that didn't happen.
    const wasOffered = !!flow.offered?.includes(flow.time);
    flow.time = undefined; flow.offered = undefined; flow.offeredDate = undefined; flow.awaiting = "time";
    const r = yield* doTool("check_availability", { service_id: flow.service_id, date: flow.date });
    const slots = r.success ? (r.data!.slots as string[]) : [];
    flow.offered = slots; flow.offeredDate = flow.date;
    const ur = persona.lang === "ur";
    const stillHave = slots.length
      ? ur
        ? `${humanDateUr(flow.date)} کو اب بھی یہ اوقات خالی ہیں: ${slots.slice(0, 4).map(humanTimeUr).join("، ")}۔`
        : `I still have ${slots.slice(0, 4).map(humanTime).join(", ")} on ${humanDate(flow.date)}.`
      : ur
        ? "اس دن اب کچھ خالی نہیں ہے — کیا کوئی اور دن دیکھیں؟"
        : "Nothing left that day — want to try another day?";
    const msg = wasOffered
      ? ur
        ? `معذرت — یہ وقت ابھی بک ہو گیا ہے۔ ${stillHave}`
        : `That time just got taken — sorry about that. ${stillHave}`
      : ur
        ? `معذرت، یہ وقت دستیاب نہیں ہے۔ ${stillHave}`
        : `That time isn't available, I'm afraid. ${stillHave}`;
    return emptyTurn(msg, "open");
  }

  if (!flow.name) {
    flow.awaiting = "name";
    return emptyTurn(responder.askName(persona, n), "open");
  }
  if (!flow.phone) {
    flow.awaiting = "phone";
    return emptyTurn(responder.askPhone(persona, flow.name, n), "open");
  }

  if (flow.awaiting !== "confirm_book") {
    flow.awaiting = "confirm_book";
    return emptyTurn(responder.confirmBooking(persona, flow), "open");
  }
  if (e.confirmed) {
    const r = yield* doTool("book_appointment", {
      service_id: flow.service_id, date: flow.date, time: flow.time,
      customer_name: flow.name, phone: flow.phone, email: flow.email,
    });
    if (!r.success) {
      flow.awaiting = "time"; flow.time = undefined;
      return emptyTurn(responder.bookingFailed(persona, r.error!.message), "open");
    }
    const d = r.data as { appointment_id: string; date: string; time: string; customer: string; service: string };
    const appt = { id: d.appointment_id, service_name: d.service, date: d.date, time: d.time, customer: d.customer };
    state.flow = undefined; state.fails = 0;
    return {
      reply: responder.bookingConfirmed(persona, appt),
      outcome: "booked", sources: [],
      appointmentEvent: { action: "booked", appointment: { ...appt, customer_name: d.customer, phone: flow.phone, status: "confirmed" } },
      escalationReason: null,
    };
  }
  // Answered something else at confirmation → re-ask.
  return emptyTurn(responder.confirmBooking(persona, flow), "open");
}

/* ------------------------------------------------------------------ */
/* Cancel / reschedule flows                                           */
/* ------------------------------------------------------------------ */

function* resolveAppointment(
  db: DatabaseSync, state: AgentState, persona: Persona,
  e: Record<string, string | number | boolean | undefined>,
  n: number, action: "cancel" | "reschedule"
): Generator<AgentEvent, { flow: BookingFlow; reply: string; done: boolean; outcome: Outcome; appointmentEvent: { action: string; appointment: Record<string, unknown> } | null }, unknown> {
  const flow = state.flow!;
  const noEvent = null;

  // Direct reference like APT-1042.
  if (e.appointmentRef && !flow.appointment_id) {
    const appt = db.prepare(`SELECT * FROM appointments WHERE id = ? AND status = 'confirmed'`).get(String(e.appointmentRef)) as
      | Record<string, unknown> | undefined;
    if (appt) {
      flow.appointment_id = appt.id as string;
      flow.service_name = appt.service_name as string;
      flow.date = appt.date as string; flow.time = appt.time as string;
      flow.name = appt.customer_name as string;
    } else {
      return { flow, reply: `I couldn't find a confirmed appointment ${e.appointmentRef}. Want to try the name the booking is under?`, done: false, outcome: "open", appointmentEvent: noEvent };
    }
  }

  if (!flow.appointment_id) {
    if (e.name) flow.name = e.name as string;
    if (!flow.name) {
      flow.awaiting = "name";
      return { flow, reply: responder.askCancelName(persona, n), done: false, outcome: "open", appointmentEvent: noEvent };
    }
    const cands = findAppointmentsByName(db, flow.name).map((a) => ({
      id: a.id as string, service_name: a.service_name as string,
      date: a.date as string, time: a.time as string,
    }));
    if (!cands.length) {
      const tried = flow.name;
      flow.name = undefined; flow.awaiting = "name";
      return { flow, reply: responder.cancelNoneFound(persona, tried), done: false, outcome: "open", appointmentEvent: noEvent };
    }
    if (cands.length === 1) {
      Object.assign(flow, { appointment_id: cands[0].id, service_name: cands[0].service_name, date: cands[0].date, time: cands[0].time });
    } else {
      // Disambiguate.
      if (typeof e.slotIndex === "number" && cands[e.slotIndex]) {
        const c = cands[e.slotIndex];
        Object.assign(flow, { appointment_id: c.id, service_name: c.service_name, date: c.date, time: c.time });
      } else if (e.appointmentRef) {
        const c = cands.find((c) => c.id === e.appointmentRef);
        if (c) Object.assign(flow, { appointment_id: c.id, service_name: c.service_name, date: c.date, time: c.time });
      } else {
        flow.candidates = cands; flow.awaiting = "which_appointment";
        return { flow, reply: responder.cancelWhich(persona, cands), done: false, outcome: "open", appointmentEvent: noEvent };
      }
    }
  }

  if (action === "cancel" && flow.awaiting !== "confirm_cancel") {
    flow.awaiting = "confirm_cancel";
    return { flow, reply: responder.confirmCancel(persona, flow as never), done: false, outcome: "open", appointmentEvent: noEvent };
  }
  return { flow, reply: "", done: true, outcome: "open", appointmentEvent: noEvent };
}

function* handleCancelFlow(
  db: DatabaseSync, state: AgentState, persona: Persona,
  e: Record<string, string | number | boolean | undefined>,
  doTool: DoTool, n: number
): Generator<AgentEvent, TurnResult, unknown> {
  if (!state.flow || state.flow.action !== "cancel") {
    state.flow = { action: "cancel", name: e.name as string | undefined };
  }
  const r = yield* resolveAppointment(db, state, persona, e, n, "cancel");
  if (!r.done) return emptyTurn(r.reply, r.outcome);
  const flow = r.flow;

  if (e.declined) {
    state.flow = undefined;
    return emptyTurn("No problem — I've left your appointment as is. Anything else I can help with?", "resolved");
  }
  if (!e.confirmed) {
    flow.awaiting = "confirm_cancel";
    return emptyTurn(responder.confirmCancel(persona, flow as never), "open");
  }
  const res = yield* doTool("cancel_appointment", { appointment_id: flow.appointment_id });
  if (!res.success) return emptyTurn(`I couldn't cancel it: ${res.error!.message}`, "open");
  const d = res.data as { appointment_id: string };
  const appt = db.prepare(`SELECT service_name, date, time FROM appointments WHERE id = ?`).get(d.appointment_id) as
    { service_name: string; date: string; time: string };
  state.flow = undefined;
  return {
    reply: responder.cancelled(persona, appt),
    outcome: "resolved", sources: [],
    appointmentEvent: { action: "cancelled", appointment: { id: d.appointment_id, status: "cancelled", ...appt } },
    escalationReason: null,
  };
}

function* handleRescheduleFlow(
  db: DatabaseSync, state: AgentState, persona: Persona,
  e: Record<string, string | number | boolean | undefined>,
  doTool: DoTool, n: number
): Generator<AgentEvent, TurnResult, unknown> {
  if (!state.flow || state.flow.action !== "reschedule") {
    state.flow = { action: "reschedule", name: e.name as string | undefined };
  }
  const flow = state.flow;

  // Step 1: identify the appointment (unless we already have one and are picking a new time).
  if (!flow.appointment_id) {
    const r = yield* resolveAppointment(db, state, persona, e, n, "reschedule");
    if (!r.done) return emptyTurn(r.reply, r.outcome);
  }

  // Step 2: new date/time.
  if (e.date) flow.date = undefined; // new target date overrides old booking date
  let newTime = e.time as string | undefined;
  if (!newTime && typeof e.slotIndex === "number" && flow.offered?.length) {
    newTime = flow.offered[e.slotIndex as number];
  }
  // Time-only reply ("2 PM") after we offered slots → it refers to the offered date.
  const newDate = (e.date as string | undefined) ?? (newTime && flow.offeredDate ? flow.offeredDate : undefined);

  if (flow.awaiting === "confirm_reschedule") {
    if (e.confirmed) {
      const res = yield* doTool("reschedule_appointment", {
        appointment_id: flow.appointment_id, date: flow.date, time: flow.time,
      });
      if (!res.success) {
        flow.awaiting = "new_datetime";
        return emptyTurn(`That didn't work: ${res.error!.message} What other day works for you?`, "open");
      }
      const appt = { service_name: flow.service_name!, date: flow.date!, time: flow.time! };
      state.flow = undefined;
      return {
        reply: responder.rescheduled(persona, appt),
        outcome: "resolved", sources: [],
        appointmentEvent: { action: "rescheduled", appointment: { id: flow.appointment_id, status: "confirmed", ...appt } },
        escalationReason: null,
      };
    }
    if (e.declined) {
      flow.awaiting = "new_datetime";
      return emptyTurn("No problem — what day and time would work instead?", "open");
    }
    return emptyTurn(responder.confirmReschedule(persona, { service_name: flow.service_name!, date: flow.date!, time: flow.time! }), "open");
  }

  if (!newDate) {
    flow.awaiting = "new_datetime";
    return emptyTurn(responder.rescheduleNewWhen(persona, { service_name: flow.service_name! }), "open");
  }
  // We have a new date; need a time.
  const svcId = (db.prepare(`SELECT service_id FROM appointments WHERE id = ?`).get(flow.appointment_id as string) as { service_id: string }).service_id;
  if (!newTime) {
    const r = yield* doTool("check_availability", { service_id: svcId, date: newDate });
    if (!r.success) {
      flow.awaiting = "new_datetime";
      return emptyTurn(r.error!.code === "closed" ? responder.closedDay(persona, r.error!.message) : `I couldn't check that date: ${r.error!.message}`, "open");
    }
    const slots = r.data!.slots as string[];
    if (!slots.length) {
      flow.awaiting = "new_datetime";
      return emptyTurn(`We're fully booked on ${humanDate(newDate)}. What other day works for you?`, "open");
    }
    flow.date = newDate; flow.offered = slots; flow.offeredDate = newDate; flow.awaiting = "new_datetime";
    return emptyTurn(responder.rescheduleOffer(persona, newDate, slots), "open");
  }
  // Have both → validate then confirm.
  const check = listAvailableSlots(db, svcId, newDate);
  if (!check.ok || !check.slots.includes(newTime)) {
    flow.awaiting = "new_datetime";
    const slots = check.ok ? check.slots.slice(0, 5).map(humanTime).join(", ") : "";
    return emptyTurn(`That time isn't free, sorry. ${slots ? `On ${humanDate(newDate)} I have: ${slots}.` : ""} Which works?`, "open");
  }
  flow.date = newDate; flow.time = newTime; flow.awaiting = "confirm_reschedule";
  return emptyTurn(responder.confirmReschedule(persona, { service_name: flow.service_name!, date: newDate, time: newTime }), "open");
}
