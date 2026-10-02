import { Router } from "express";
import { config, engineName } from "../config.js";
import { getDb } from "../db/database.js";

export const systemRouter = Router();

const bootTime = Date.now();

/** GET /api/v1/health */
systemRouter.get("/health", (_req, res) => {
  let dbStatus = "ok";
  try { getDb().prepare(`SELECT 1`).get(); } catch { dbStatus = "error"; }
  res.json({
    status: dbStatus === "ok" ? "ok" : "degraded",
    version: config.version,
    uptime_s: Math.floor((Date.now() - bootTime) / 1000),
    engine: engineName,
    db: dbStatus,
  });
});

/** GET /api/v1/system/status */
systemRouter.get("/system/status", (_req, res) => {
  let dbOk = true;
  try { getDb().prepare(`SELECT 1`).get(); } catch { dbOk = false; }
  res.json({
    engine: engineName,
    components: [
      { name: "API", status: "operational" },
      { name: "Database", status: dbOk ? "operational" : "degraded", detail: "SQLite" },
      { name: "Knowledge / RAG", status: dbOk ? "operational" : "degraded", detail: "SQLite FTS5" },
      {
        name: "AI engine",
        status: "operational",
        detail: engineName === "openai" ? "OpenAI connected" : "Local demo brain (no API key)",
      },
      { name: "Browser voice", status: "operational", detail: "Web Speech API" },
      { name: "Telephony (PSTN)", status: "not-configured", detail: "Twilio interface ready — not connected" },
      { name: "Calendar sync", status: "demo-mock", detail: "Demo implementation — no external sync" },
    ],
  });
});

/** GET /api/v1/voice/config */
systemRouter.get("/voice/config", (_req, res) => {
  res.json({
    stt: "web-speech",
    tts: "web-speech",
    note: "Browser voice demo using the Web Speech API (English + Urdu, with barge-in). This is not a PSTN telephone call.",
    telephony: "not-configured",
  });
});
