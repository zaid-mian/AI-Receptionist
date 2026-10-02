import { DatabaseSync } from "node:sqlite";
import { config } from "../config.js";
import { buildSystemPrompt } from "./systemPrompt.js";
import { Persona } from "./responder.js";
import { AgentEvent, Intent, Outcome } from "./types.js";
import { TOOL_LABELS, ToolResult } from "../tools/tools.js";

type DoTool = (name: string, args: Record<string, unknown>) => Generator<AgentEvent, ToolResult, unknown>;

export interface OpenAiTurnResult {
  text: string;
  intent: Intent;
  outcome: Outcome;
  sources: Array<{ doc_id: string; title: string; section: string }>;
  appointmentEvent: { action: string; appointment: Record<string, unknown> } | null;
  escalationReason: string | null;
  toolCalls: Array<{ tool: string; label: string }>;
  tokensStreamed?: boolean;
}

const FUNCTION_SCHEMAS: Record<string, { description: string; parameters: Record<string, unknown> }> = {
  search_knowledge_base: {
    description: "Search the hospital knowledge base for hospital info, services, policies, and FAQs.",
    parameters: { type: "object", properties: { query: { type: "string" }, limit: { type: "integer" } }, required: ["query"] },
  },
  get_business_hours: {
    description: "Get hospital visiting and OPD hours.",
    parameters: { type: "object", properties: {} },
  },
  get_departments: {
    description: "List all hospital clinical departments and their locations.",
    parameters: { type: "object", properties: {} },
  },
  get_doctor_schedules: {
    description: "Look up doctor shift timings, OPD schedule days, and consultation fees by doctor name or department.",
    parameters: {
      type: "object",
      properties: {
        doctor_name: { type: "string", description: "Name of the doctor to look up (e.g. Nadia, Sohail)" },
        department_name: { type: "string", description: "Department name (e.g. Cardiology, Pediatrics)" },
      },
    },
  },
  get_services: {
    description: "List bookable clinical services with consultation fee and duration.",
    parameters: { type: "object", properties: {} },
  },
  check_availability: {
    description: "Check free appointment slots for a service/doctor on a date (YYYY-MM-DD).",
    parameters: {
      type: "object",
      properties: { service_id: { type: "string" }, date: { type: "string", description: "YYYY-MM-DD" } },
      required: ["service_id", "date"],
    },
  },
  book_appointment: {
    description: "Book an appointment. Only call after the customer confirmed the booking details.",
    parameters: {
      type: "object",
      properties: {
        service_id: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD" },
        time: { type: "string", description: "HH:MM" },
        customer_name: { type: "string" },
        phone: { type: "string" },
        email: { type: "string" },
        notes: { type: "string" },
      },
      required: ["service_id", "date", "time", "customer_name", "phone"],
    },
  },
  cancel_appointment: {
    description: "Cancel a confirmed appointment by ID (e.g. APT-1042).",
    parameters: { type: "object", properties: { appointment_id: { type: "string" } }, required: ["appointment_id"] },
  },
  reschedule_appointment: {
    description: "Move a confirmed appointment to a new date and time.",
    parameters: {
      type: "object",
      properties: { appointment_id: { type: "string" }, date: { type: "string" }, time: { type: "string" } },
      required: ["appointment_id", "date", "time"],
    },
  },
  collect_customer_information: {
    description: "Validate and store customer contact details.",
    parameters: { type: "object", properties: { name: { type: "string" }, phone: { type: "string" }, email: { type: "string" }, notes: { type: "string" } } },
  },
  escalate_to_human: {
    description: "Hand the conversation to a human team member with a reason.",
    parameters: { type: "object", properties: { reason: { type: "string" } }, required: ["reason"] },
  },
};

/**
 * Stream lines from an SSE response body without external dependencies.
 */
async function* readSseLines(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("data: ")) {
          const payload = trimmed.slice(6).trim();
          if (payload === "[DONE]") return;
          yield payload;
        }
      }
    }
    if (buffer.trim().startsWith("data: ")) {
      const payload = buffer.trim().slice(6).trim();
      if (payload !== "[DONE]") yield payload;
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Executes a ReAct agent turn using true token-by-token SSE streaming.
 */
export async function* runOpenAiTurn(
  db: DatabaseSync,
  convId: string,
  userText: string,
  channel: "chat" | "voice",
  persona: Persona,
  doTool: DoTool
): AsyncGenerator<AgentEvent, OpenAiTurnResult, unknown> {
  const result: OpenAiTurnResult = {
    text: "", intent: "unknown", outcome: "open", sources: [],
    appointmentEvent: null, escalationReason: null, toolCalls: [],
    tokensStreamed: false,
  };

  const system = buildSystemPrompt({
    businessName: persona.businessName,
    services: "Cardiology, Dermatology, Pediatrics, Gynecology & Obstetrics, Orthopedic Surgery, Urology, General Surgery, Neurology, Pulmonology, Internal Medicine",
    hours: "Mon–Sat 9:00 AM – 10:00 PM, Sun 10:00 AM – 10:00 PM. Emergency & Trauma open 24/7 at Gate 1, 544-A East Canal Road.",
    channel,
  });

  const history = db.prepare(
    `SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 6`
  ).all(convId).reverse() as Array<{ role: string; content: string }>;

  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: system },
    ...history.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userText },
  ];

  const tools = Object.entries(FUNCTION_SCHEMAS).map(([name, s]) => ({
    type: "function",
    function: { name, description: s.description, parameters: s.parameters },
  }));

  let finalText = "";
  for (let iter = 0; iter < 6; iter++) {
    const baseUrl = config.openaiBaseUrl ? config.openaiBaseUrl.replace(/\/+$/, "") : "https://api.openai.com/v1";
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.openaiApiKey}`,
        "HTTP-Referer": "http://localhost:5173",
        "X-Title": "Faisal Hospital AI Receptionist",
      },
      body: JSON.stringify({
        model: config.openaiModel,
        messages,
        tools,
        tool_choice: "auto",
        temperature: 0.4,
        max_tokens: config.openaiMaxTokens,
        stream: true,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[llm] LLM request failed (${res.status}):`, errText);
      throw new Error(`LLM request failed (${res.status}): ${errText}`);
    }

    if (!res.body) {
      throw new Error("No response body received from LLM stream");
    }

    let iterContent = "";
    const toolCallsAcc: Record<number, { id: string; name: string; arguments: string }> = {};

    for await (const payload of readSseLines(res.body)) {
      let chunk: {
        choices?: Array<{
          delta?: {
            content?: string | null;
            tool_calls?: Array<{
              index?: number;
              id?: string;
              function?: { name?: string; arguments?: string };
            }>;
          };
          finish_reason?: string | null;
        }>;
      };
      try {
        chunk = JSON.parse(payload);
      } catch {
        continue;
      }

      const choice = chunk.choices?.[0];
      if (!choice) continue;

      if (choice.delta?.tool_calls) {
        for (const tc of choice.delta.tool_calls) {
          const idx = tc.index ?? 0;
          if (!toolCallsAcc[idx]) {
            toolCallsAcc[idx] = { id: tc.id ?? "", name: tc.function?.name ?? "", arguments: "" };
          }
          if (tc.id) toolCallsAcc[idx].id = tc.id;
          if (tc.function?.name) toolCallsAcc[idx].name += tc.function.name;
          if (tc.function?.arguments) toolCallsAcc[idx].arguments += tc.function.arguments;
        }
      }

      if (choice.delta?.content) {
        iterContent += choice.delta.content;
        yield { type: "token", data: { text: choice.delta.content } };
        result.tokensStreamed = true;
      }
    }

    const toolCallsList = Object.values(toolCallsAcc);
    if (toolCallsList.length > 0) {
      messages.push({
        role: "assistant",
        content: iterContent || null,
        tool_calls: toolCallsList.map((tc) => ({
          id: tc.id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          type: "function",
          function: { name: tc.name, arguments: tc.arguments },
        })),
      });

      for (const tc of toolCallsList) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.arguments);
        } catch {
          args = {};
        }
        const r: ToolResult = yield* doTool(tc.name, args);
        result.toolCalls.push({ tool: tc.name, label: TOOL_LABELS[tc.name] ?? tc.name });
        trackSideEffects(tc.name, r, result);
        if (tc.name === "search_knowledge_base" && result.sources.length) {
          yield { type: "sources", data: { sources: result.sources } };
        }
        messages.push({
          role: "tool",
          tool_call_id: tc.id || `call_${Date.now()}`,
          content: JSON.stringify(r.success ? r.data : { error: r.error }),
        });
      }
      continue;
    }

    finalText = iterContent;
    break;
  }

  result.text = finalText || "I'm sorry — I couldn't put together a reply just now. Could you try again?";
  if (!result.tokensStreamed && result.text) {
    yield { type: "token", data: { text: result.text } };
    result.tokensStreamed = true;
  }

  result.intent = guessIntent(result);
  result.outcome = result.escalationReason ? "escalated" : result.appointmentEvent ? "booked" : "resolved";
  return result;
}

function trackSideEffects(name: string, r: ToolResult, result: OpenAiTurnResult): void {
  if (!r.success) return;
  const d = r.data as Record<string, unknown>;
  if (name === "search_knowledge_base") {
    const results = (d.results as Array<{ doc_id: string; title: string; section: string }>) ?? [];
    const seen = new Map(result.sources.map((s) => [s.doc_id, s]));
    for (const x of results) if (!seen.has(x.doc_id)) result.sources.push({ doc_id: x.doc_id, title: x.title, section: x.section });
  }
  if (name === "book_appointment") {
    result.appointmentEvent = {
      action: "booked",
      appointment: { id: d.appointment_id, service_name: d.service, date: d.date, time: d.time, customer_name: d.customer, status: "confirmed" },
    };
  }
  if (name === "cancel_appointment") {
    result.appointmentEvent = { action: "cancelled", appointment: { id: d.appointment_id, status: "cancelled" } };
  }
  if (name === "reschedule_appointment") {
    result.appointmentEvent = { action: "rescheduled", appointment: { id: d.appointment_id, date: d.date, time: d.time, status: "confirmed" } };
  }
  if (name === "escalate_to_human") result.escalationReason = String(d.reason ?? "escalated");
}

function guessIntent(result: OpenAiTurnResult): Intent {
  if (result.escalationReason) return "human_request";
  if (result.appointmentEvent?.action === "booked") return "book_appointment";
  if (result.appointmentEvent?.action === "cancelled") return "cancel_appointment";
  if (result.appointmentEvent?.action === "rescheduled") return "reschedule_appointment";
  const tools = result.toolCalls.map((t) => t.tool);
  if (tools.includes("check_availability")) return "availability_check";
  if (tools.includes("search_knowledge_base")) return "faq";
  if (tools.includes("get_services") || tools.includes("get_departments") || tools.includes("get_doctor_schedules")) return "services_info";
  if (tools.includes("get_business_hours")) return "hours_info";
  return "unknown";
}
