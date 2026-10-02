import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db/database.js";
import { config, engineName } from "../config.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const settingsRouter = Router();

const ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function readSettings(db: ReturnType<typeof getDb>) {
  const out: Record<string, unknown> = {};
  for (const row of db.prepare(`SELECT key, value FROM kv_settings`).all() as Array<{ key: string; value: string }>) {
    try { out[row.key] = JSON.parse(row.value); } catch { out[row.key] = row.value; }
  }
  const hours = db.prepare(`SELECT day, open, close FROM business_hours`).all() as Array<{ day: string; open: string | null; close: string | null }>;
  out.hours = ORDER.map((d) => hours.find((h) => h.day === d) ?? { day: d, open: null, close: null });
  out.environment = {
    engine: engineName,
    db: "sqlite",
    vector: "sqlite-fts5",
    timezone: config.businessTimezone,
    secrets_exposed: false,
  };
  return out;
}

/** GET /api/v1/settings */
settingsRouter.get("/", (_req, res) => {
  res.json(readSettings(getDb()));
});

const settingsSchema = z.object({
  business: z.object({
    name: z.string().min(2).max(80).optional(),
    tagline: z.string().max(120).optional(),
    address: z.string().max(200).optional(),
    phone: z.string().max(40).optional(),
    email: z.string().email().optional(),
  }).optional(),
  personality: z.object({
    tone: z.enum(["professional", "friendly", "concise"]).optional(),
    formality: z.string().max(40).optional(),
    verbosity: z.string().max(40).optional(),
    traits: z.array(z.string().max(40)).max(8).optional(),
  }).optional(),
  voice: z.object({
    voice_name: z.string().max(80).optional(),
    rate: z.number().min(0.5).max(2).optional(),
  }).optional(),
  hours: z.array(z.object({
    day: z.string(),
    open: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
    close: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  })).optional(),
  appointment_rules: z.object({
    slot_interval_min: z.number().int().min(10).max(120).optional(),
    buffer_min: z.number().int().min(0).max(60).optional(),
    max_days_ahead: z.number().int().min(1).max(365).optional(),
    cancellation_notice_h: z.number().int().min(0).max(168).optional(),
  }).optional(),
}).strict();

/** PUT /api/v1/settings — partial update (admin only) */
settingsRouter.put("/", requireAuth, requireRole(["admin"]), (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: "invalid_body", message: parsed.error.issues[0]?.message ?? "Invalid settings." } });
  }
  const db = getDb();
  const data = parsed.data;
  const merge = (key: string, patch: unknown) => {
    const cur = db.prepare(`SELECT value FROM kv_settings WHERE key = ?`).get(key) as { value: string } | undefined;
    const merged = { ...(cur ? JSON.parse(cur.value) : {}), ...(patch as Record<string, unknown>) };
    db.prepare(`INSERT OR REPLACE INTO kv_settings (key, value) VALUES (?, ?)`).run(key, JSON.stringify(merged));
  };
  if (data.business) merge("business", data.business);
  if (data.personality) merge("personality", data.personality);
  if (data.voice) merge("voice", data.voice);
  if (data.appointment_rules) merge("appointment_rules", data.appointment_rules);
  if (data.hours) {
    const stmt = db.prepare(`INSERT OR REPLACE INTO business_hours (day, open, close) VALUES (?, ?, ?)`);
    for (const h of data.hours) {
      if (!ORDER.includes(h.day)) continue;
      stmt.run(h.day, h.open, h.close);
    }
  }
  res.json({ settings: readSettings(db) });
});
