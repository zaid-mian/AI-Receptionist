import { Router } from "express";
import { getDb } from "../db/database.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const analyticsRouter = Router();

// Hospital executive analytics are restricted to Administrators
analyticsRouter.use(requireAuth, requireRole(["admin"]));

/**
 * All analytics here are computed live from the database.
 * The dataset ships with seeded demo conversations/appointments, so every
 * response carries demo_data: true and the UI badges it as demo data.
 */
const DEMO = { demo_data: true } as const;

/** GET /api/v1/analytics/overview */
analyticsRouter.get("/overview", (_req, res) => {
  const db = getDb();
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM conversations`).get() as { c: number }).c;
  const resolved = (db.prepare(
    `SELECT COUNT(*) AS c FROM conversations WHERE outcome IN ('resolved','booked')`
  ).get() as { c: number }).c;
  const booked = (db.prepare(
    `SELECT COUNT(*) AS c FROM appointments WHERE status = 'confirmed'`
  ).get() as { c: number }).c;
  const escalated = (db.prepare(`SELECT COUNT(*) AS c FROM conversations WHERE escalated = 1`).get() as { c: number }).c;
  const avgDur = (db.prepare(`SELECT AVG(duration_s) AS a FROM conversations WHERE duration_s > 0`).get() as { a: number | null }).a;
  const avgLat = (db.prepare(`SELECT AVG(latency_ms) AS a FROM turn_metrics`).get() as { a: number | null }).a;

  res.json({
    ...DEMO,
    total_conversations: total,
    resolution_rate: total ? resolved / total : 0,
    appointments_booked: booked,
    // Measured from real turns; null until the first live conversation runs.
    avg_response_latency_s: avgLat != null ? Math.round(avgLat / 100) / 10 : null,
    avg_conversation_duration_s: avgDur != null ? Math.round(avgDur) : 0,
    escalation_rate: total ? escalated / total : 0,
  });
});

/** GET /api/v1/analytics/intents */
analyticsRouter.get("/intents", (_req, res) => {
  const db = getDb();
  const rows = db.prepare(
    `SELECT COALESCE(intent, 'unknown') AS intent, COUNT(*) AS count
     FROM conversations GROUP BY intent ORDER BY count DESC`
  ).all();
  res.json({ ...DEMO, intents: rows });
});

/** GET /api/v1/analytics/timeseries?days=14 */
analyticsRouter.get("/timeseries", (req, res) => {
  const db = getDb();
  const days = Math.min(Math.max(parseInt(String(req.query.days ?? "14"), 10) || 14, 1), 90);
  const rows = db.prepare(
    `WITH RECURSIVE d(n) AS (
       SELECT 0 UNION ALL SELECT n+1 FROM d WHERE n < ?
     )
     SELECT date('now', '-' || n || ' days') AS date,
       (SELECT COUNT(*) FROM conversations WHERE substr(started_at, 1, 10) = date('now', '-' || n || ' days')) AS conversations,
       (SELECT COUNT(*) FROM appointments WHERE substr(created_at, 1, 10) = date('now', '-' || n || ' days') AND status != 'cancelled') AS appointments
     FROM d ORDER BY date`
  ).all(days - 1) as Array<{ date: string; conversations: number; appointments: number }>;
  res.json({ ...DEMO, days: rows });
});
