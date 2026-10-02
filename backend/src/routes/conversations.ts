import { Router } from "express";
import { getDb, nowIso } from "../db/database.js";
import { liveHub, LiveEvent } from "../services/liveHub.js";

export const conversationsRouter = Router();

function toPublic(row: Record<string, unknown>) {
  let agentState: Record<string, unknown> = {};
  try {
    agentState = JSON.parse(String(row.agent_state ?? "{}"));
  } catch {
    agentState = {};
  }

  return {
    id: row.id,
    customer_name: row.customer_name,
    channel: row.channel,
    started_at: row.started_at,
    duration_s: row.duration_s,
    intent: row.intent,
    outcome: row.outcome,
    status: row.status,
    escalated: !!row.escalated,
    escalation_reason: row.escalation_reason,
    summary: row.summary,
    taken_over: Boolean(agentState.taken_over),
    taken_over_by: (agentState.taken_over_by as string) || null,
    taken_over_at: (agentState.taken_over_at as string) || null,
  };
}

/**
 * GET /api/v1/conversations/live-stream
 * Real-time Server-Sent Events stream for Front Desk & Reception Operator Desks.
 */
conversationsRouter.get("/live-stream", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(": connected\n\n");

  const listener = (event: LiveEvent) => {
    try {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
    } catch {
      // client disconnected
    }
  };

  liveHub.on("live_event", listener);

  const heartbeat = setInterval(() => {
    try {
      res.write(": heartbeat\n\n");
    } catch {
      clearInterval(heartbeat);
    }
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    liveHub.off("live_event", listener);
  });
});

/** GET /api/v1/conversations?limit=&status=&channel=&q= */
conversationsRouter.get("/", (req, res) => {
  const db = getDb();
  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "50"), 10) || 50, 1), 200);
  const where: string[] = [];
  const params: Array<string | number> = [];
  if (req.query.status && ["open", "resolved", "escalated"].includes(String(req.query.status))) {
    where.push("status = ?"); params.push(String(req.query.status));
  }
  if (req.query.channel && ["chat", "voice"].includes(String(req.query.channel))) {
    where.push("channel = ?"); params.push(String(req.query.channel));
  }
  if (req.query.q) {
    where.push("(customer_name LIKE ? OR summary LIKE ? OR intent LIKE ?)");
    const q = `%${req.query.q}%`;
    params.push(q, q, q);
  }
  const sql = `SELECT *, (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = conversations.id) AS message_count
               FROM conversations ${where.length ? "WHERE " + where.join(" AND ") : ""}
               ORDER BY started_at DESC LIMIT ?`;
  const rows = db.prepare(sql).all(...params, limit) as Array<Record<string, unknown>>;
  res.json({ conversations: rows.map((r) => ({ ...toPublic(r), message_count: r.message_count })) });
});

/** GET /api/v1/conversations/:id */
conversationsRouter.get("/:id", (req, res) => {
  const db = getDb();
  const conv = db.prepare(`SELECT * FROM conversations WHERE id = ?`).get(req.params.id) as
    | Record<string, unknown> | undefined;
  if (!conv) return res.status(404).json({ error: { code: "not_found", message: "Conversation not found." } });
  const messages = db.prepare(
    `SELECT id, role, content, tool_calls, sources, created_at FROM messages WHERE conversation_id = ? ORDER BY id`
  ).all(req.params.id) as Array<Record<string, unknown>>;
  res.json({
    conversation: toPublic(conv),
    messages: messages.map((m) => ({
      ...m,
      tool_calls: JSON.parse(String(m.tool_calls ?? "[]")),
      sources: JSON.parse(String(m.sources ?? "[]")),
    })),
  });
});

/**
 * POST /api/v1/conversations/:id/takeover
 * Receptionist operator claims control of conversation; halts autonomous AI responses.
 */
conversationsRouter.post("/:id/takeover", (req, res) => {
  const db = getDb();
  const conv = db.prepare(`SELECT * FROM conversations WHERE id = ?`).get(req.params.id) as
    | Record<string, unknown> | undefined;
  if (!conv) return res.status(404).json({ error: { code: "not_found", message: "Conversation not found." } });

  let state: Record<string, unknown> = {};
  try {
    state = JSON.parse(String(conv.agent_state ?? "{}"));
  } catch {
    state = {};
  }

  const operatorName = typeof req.body?.operator_name === "string" && req.body.operator_name.trim()
    ? req.body.operator_name.trim()
    : "Front Desk Receptionist";

  state.taken_over = true;
  state.taken_over_by = operatorName;
  state.taken_over_at = nowIso();

  db.prepare(`UPDATE conversations SET agent_state = ?, status = 'open' WHERE id = ?`)
    .run(JSON.stringify(state), req.params.id);

  const notice = `Human receptionist (${operatorName}) took over this conversation.`;
  db.prepare(
    `INSERT INTO messages (conversation_id, role, content, tool_calls, sources, created_at)
     VALUES (?, 'system', ?, '[]', '[]', ?)`
  ).run(req.params.id, notice, nowIso());

  liveHub.broadcast("takeover", {
    conversation_id: req.params.id,
    taken_over: true,
    operator: operatorName,
  });
  liveHub.broadcast("message", {
    conversation_id: req.params.id,
    role: "system",
    content: notice,
    created_at: nowIso(),
  });
  liveHub.broadcast("conversation_update", {
    conversation_id: req.params.id,
    status: "open",
    taken_over: true,
    taken_over_by: operatorName,
  });

  res.json({ ok: true, taken_over: true, operator: operatorName });
});

/**
 * POST /api/v1/conversations/:id/release
 * Hands control back to autonomous AI Receptionist.
 */
conversationsRouter.post("/:id/release", (req, res) => {
  const db = getDb();
  const conv = db.prepare(`SELECT * FROM conversations WHERE id = ?`).get(req.params.id) as
    | Record<string, unknown> | undefined;
  if (!conv) return res.status(404).json({ error: { code: "not_found", message: "Conversation not found." } });

  let state: Record<string, unknown> = {};
  try {
    state = JSON.parse(String(conv.agent_state ?? "{}"));
  } catch {
    state = {};
  }

  state.taken_over = false;
  delete state.taken_over_by;
  delete state.taken_over_at;

  db.prepare(`UPDATE conversations SET agent_state = ? WHERE id = ?`)
    .run(JSON.stringify(state), req.params.id);

  const notice = "Conversation handed back to AI Receptionist.";
  db.prepare(
    `INSERT INTO messages (conversation_id, role, content, tool_calls, sources, created_at)
     VALUES (?, 'system', ?, '[]', '[]', ?)`
  ).run(req.params.id, notice, nowIso());

  liveHub.broadcast("takeover", {
    conversation_id: req.params.id,
    taken_over: false,
  });
  liveHub.broadcast("message", {
    conversation_id: req.params.id,
    role: "system",
    content: notice,
    created_at: nowIso(),
  });
  liveHub.broadcast("conversation_update", {
    conversation_id: req.params.id,
    taken_over: false,
    taken_over_by: null,
  });

  res.json({ ok: true, taken_over: false });
});

/**
 * POST /api/v1/conversations/:id/reply
 * Operator sends manual reply directly into patient conversation thread.
 */
conversationsRouter.post("/:id/reply", (req, res) => {
  const db = getDb();
  const conv = db.prepare(`SELECT * FROM conversations WHERE id = ?`).get(req.params.id) as
    | Record<string, unknown> | undefined;
  if (!conv) return res.status(404).json({ error: { code: "not_found", message: "Conversation not found." } });

  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!message) {
    return res.status(400).json({ error: { code: "invalid_message", message: "Message cannot be empty." } });
  }

  const operatorName = typeof req.body?.operator_name === "string" && req.body.operator_name.trim()
    ? req.body.operator_name.trim()
    : "Receptionist";

  db.prepare(
    `INSERT INTO messages (conversation_id, role, content, tool_calls, sources, created_at)
     VALUES (?, 'assistant', ?, '[]', '[]', ?)`
  ).run(req.params.id, message, nowIso());

  db.prepare(`UPDATE conversations SET ended_at = ?, summary = ? WHERE id = ?`)
    .run(nowIso(), `Operator reply: ${message.slice(0, 80)}`, req.params.id);

  liveHub.broadcast("message", {
    conversation_id: req.params.id,
    role: "assistant",
    content: message,
    operator: operatorName,
    created_at: nowIso(),
  });
  liveHub.broadcast("conversation_update", {
    conversation_id: req.params.id,
    last_message: message,
    sender: "operator",
  });

  res.json({ ok: true });
});

/** POST /api/v1/conversations/:id/escalate */
conversationsRouter.post("/:id/escalate", (req, res) => {
  const db = getDb();
  const conv = db.prepare(`SELECT id, status FROM conversations WHERE id = ?`).get(req.params.id) as
    | { id: string; status: string } | undefined;
  if (!conv) return res.status(404).json({ error: { code: "not_found", message: "Conversation not found." } });
  const reason = typeof req.body?.reason === "string" ? req.body.reason.slice(0, 300) : "Manually escalated from dashboard";
  db.prepare(
    `UPDATE conversations SET escalated = 1, escalation_reason = ?, status = 'escalated', outcome = 'escalated', ended_at = ? WHERE id = ?`
  ).run(reason, nowIso(), req.params.id);

  liveHub.broadcast("escalation", {
    conversation_id: req.params.id,
    reason,
  });
  liveHub.broadcast("conversation_update", {
    conversation_id: req.params.id,
    status: "escalated",
    escalated: true,
    escalation_reason: reason,
  });

  res.json({ ok: true, status: "escalated" });
});
