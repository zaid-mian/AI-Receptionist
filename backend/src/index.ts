import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { getDb } from "./db/database.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { chatRouter } from "./routes/chat.js";
import { conversationsRouter } from "./routes/conversations.js";
import { appointmentsRouter } from "./routes/appointments.js";
import { knowledgeRouter } from "./routes/knowledge.js";
import { analyticsRouter } from "./routes/analytics.js";
import { settingsRouter } from "./routes/settings.js";
import { systemRouter } from "./routes/system.js";
import { ttsRouter } from "./routes/tts.js";
import { authRouter } from "./routes/auth.js";

const app = express();
app.use(cors({ origin: ["http://localhost:5173", "http://127.0.0.1:5173"] }));
app.use(express.json({ limit: "256kb" }));

// Warm the database (creates + seeds on first boot).
getDb();

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/chat", rateLimit(60, 60_000), chatRouter);
app.use("/api/v1/conversations", conversationsRouter);
app.use("/api/v1", appointmentsRouter); // /services, /business-hours, /availability, /appointments*
app.use("/api/v1/knowledge", knowledgeRouter);
app.use("/api/v1/analytics", analyticsRouter);
app.use("/api/v1/settings", settingsRouter);
app.use("/api/v1/tts", ttsRouter);
app.use("/api/v1", systemRouter); // /health, /system/status, /voice/config

app.use((_req, res) => {
  res.status(404).json({ error: { code: "not_found", message: "Unknown endpoint." } });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[api] unhandled error:", err);
  res.status(500).json({ error: { code: "internal", message: "Internal server error." } });
});

app.listen(config.port, () => {
  console.log(`[api] AI Receptionist backend on http://localhost:${config.port}`);
});
