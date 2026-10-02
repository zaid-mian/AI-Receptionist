import { Router } from "express";
import { getDb } from "../db/database.js";
import { runTurn } from "../agent/agent.js";

export const chatRouter = Router();

/**
 * POST /api/v1/chat — streaming receptionist turn (Server-Sent Events).
 * Body: { conversation_id?, message, channel: "chat"|"voice", customer_name? }
 */
chatRouter.post("/", async (req, res) => {
  const body = req.body ?? {};
  const { conversation_id, message, customer_name } = body;
  const channel = body.channel ?? "chat";

  if (typeof message !== "string" || !message.trim() || message.length > 2000) {
    return res.status(400).json({
      error: { code: "invalid_message", message: "Message must be between 1 and 2000 characters." },
    });
  }
  if (channel !== "chat" && channel !== "voice") {
    return res.status(400).json({ error: { code: "invalid_channel", message: "channel must be 'chat' or 'voice'." } });
  }
  if (conversation_id !== undefined && typeof conversation_id !== "string") {
    return res.status(400).json({ error: { code: "invalid_conversation", message: "conversation_id must be a string." } });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  const db = getDb();
  try {
    for await (const ev of runTurn(db, conversation_id, message.trim(), channel, customer_name)) {
      res.write(`event: ${ev.type}\ndata: ${JSON.stringify(ev.data)}\n\n`);
    }
  } catch (err) {
    console.error("[chat] stream failed:", err);
    res.write(
      `event: error\ndata: ${JSON.stringify({ code: "internal", message: "Something went wrong on our end.", recoverable: true })}\n\n`
    );
  }
  res.end();
});
