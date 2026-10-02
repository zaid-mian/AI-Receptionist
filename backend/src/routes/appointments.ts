import { Router } from "express";
import { z } from "zod";
import { getDb, todayInTz } from "../db/database.js";
import { config } from "../config.js";
import { listAvailableSlots } from "../services/availability.js";
import { TOOLS, ToolContext } from "../tools/tools.js";

export const appointmentsRouter = Router();

function publicAppt(a: Record<string, unknown>) {
  return {
    id: a.id, customer_name: a.customer_name, phone: a.phone, email: a.email,
    service_id: a.service_id, service_name: a.service_name,
    date: a.date, time: a.time, duration_min: a.duration_min,
    status: a.status, notes: a.notes, channel: a.channel, created_at: a.created_at,
  };
}

/** GET /api/v1/services */
appointmentsRouter.get("/services", (_req, res) => {
  const db = getDb();
  const services = db.prepare(
    `SELECT id, name, description, duration_min, price_cents, currency, aliases FROM services WHERE active = 1`
  ).all() as Array<Record<string, unknown>>;
  res.json({
    services: services.map((s) => ({
      id: s.id, name: s.name, description: s.description,
      duration_min: s.duration_min,
      price: (s.price_cents as number) === 0 ? "Fee unconfirmed" : `Rs. ${((s.price_cents as number) / 100).toFixed(0)}`,
      currency: s.currency, aliases: JSON.parse(String(s.aliases)),
    })),
  });
});

/** GET /api/v1/business-hours */
appointmentsRouter.get("/business-hours", (_req, res) => {
  const db = getDb();
  const hours = db.prepare(`SELECT day, open, close FROM business_hours`).all();
  res.json({ timezone: config.businessTimezone, hours });
});

/** GET /api/v1/departments */
appointmentsRouter.get("/departments", (_req, res) => {
  const db = getDb();
  const depts = db.prepare(`SELECT id, name, building, floor, description FROM departments ORDER BY name ASC`).all();
  res.json({ departments: depts });
});

/** GET /api/v1/doctors */
appointmentsRouter.get("/doctors", (req, res) => {
  const db = getDb();
  const deptId = req.query.department_id as string | undefined;
  let query = `
    SELECT d.id, d.name, d.title, d.fee_pkr, d.room, d.appointment_mode,
           dept.id AS department_id, dept.name AS department_name, dept.building, dept.floor,
           s.id AS service_id, s.duration_min
    FROM doctors d
    JOIN departments dept ON d.department_id = dept.id
    LEFT JOIN services s ON s.doctor_id = d.id AND s.active = 1
    WHERE d.active = 1
  `;
  const params: string[] = [];
  if (deptId) {
    query += ` AND d.department_id = ?`;
    params.push(deptId);
  }
  query += ` ORDER BY dept.name, d.name`;
  const rows = db.prepare(query).all(...params) as Array<Record<string, unknown>>;

  const schedules = db.prepare(`
    SELECT doctor_id, day_of_week, start_time, end_time, slot_duration_min
    FROM doctor_schedules
    WHERE active = 1
    ORDER BY CASE day_of_week
      WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3
      WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 WHEN 'Saturday' THEN 6 WHEN 'Sunday' THEN 7 ELSE 8 END
  `).all() as Array<{ doctor_id: string; day_of_week: string; start_time: string; end_time: string; slot_duration_min: number }>;

  const scheduleMap = new Map<string, Array<{ day: string; start_time: string; end_time: string; slot_duration_min: number }>>();
  for (const s of schedules) {
    if (!scheduleMap.has(s.doctor_id)) scheduleMap.set(s.doctor_id, []);
    scheduleMap.get(s.doctor_id)!.push({
      day: s.day_of_week,
      start_time: s.start_time,
      end_time: s.end_time,
      slot_duration_min: s.slot_duration_min,
    });
  }

  const doctors = rows.map((r) => ({
    id: r.id,
    name: r.name,
    title: r.title,
    fee_pkr: r.fee_pkr,
    room: r.room,
    appointment_mode: r.appointment_mode,
    department: {
      id: r.department_id,
      name: r.department_name,
      building: r.building,
      floor: r.floor,
    },
    service_id: r.service_id,
    duration_min: r.duration_min ?? 15,
    schedules: scheduleMap.get(r.id as string) ?? [],
  }));

  res.json({ doctors });
});

/** GET /api/v1/availability?service_id=&date= */
appointmentsRouter.get("/availability", (req, res) => {
  const db = getDb();
  const { service_id, date } = req.query;
  if (typeof service_id !== "string" || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: { code: "invalid_params", message: "service_id and date=YYYY-MM-DD are required." } });
  }
  const r = listAvailableSlots(db, service_id, date);
  if (!r.ok) {
    return res.status(400).json({ error: { code: r.code, message: r.error }, slots: [] });
  }
  res.json({ service_id, date, slots: r.slots });
});

/** GET /api/v1/appointments?date=&status=&upcoming= */
appointmentsRouter.get("/appointments", (req, res) => {
  const db = getDb();
  const where: string[] = [];
  const params: Array<string | number> = [];
  if (req.query.date) { where.push("date = ?"); params.push(String(req.query.date)); }
  if (req.query.status && ["confirmed", "cancelled", "completed", "no_show"].includes(String(req.query.status))) {
    where.push("status = ?"); params.push(String(req.query.status));
  }
  if (req.query.upcoming === "true") {
    where.push("date >= ? AND status = 'confirmed'"); params.push(todayInTz(config.businessTimezone));
  }
  const rows = db.prepare(
    `SELECT * FROM appointments ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY date, time`
  ).all(...params) as Array<Record<string, unknown>>;
  res.json({ appointments: rows.map(publicAppt) });
});

/** GET /api/v1/appointments/calendar?month=YYYY-MM */
appointmentsRouter.get("/appointments/calendar", (req, res) => {
  const db = getDb();
  const month = typeof req.query.month === "string" && /^\d{4}-\d{2}$/.test(req.query.month)
    ? req.query.month
    : todayInTz(config.businessTimezone).slice(0, 7);
  const rows = db.prepare(
    `SELECT date, COUNT(*) AS count FROM appointments
     WHERE substr(date, 1, 7) = ? AND status = 'confirmed' GROUP BY date`
  ).all(month) as Array<{ date: string; count: number }>;
  res.json({ month, days: rows });
});

const bookSchema = z.object({
  service_id: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  customer_name: z.string().min(2).max(80),
  phone: z.string().min(7).max(30),
  email: z.string().email().optional(),
  notes: z.string().max(500).optional(),
});

/** POST /api/v1/appointments — direct booking (dashboard use; chat uses the agent). */
appointmentsRouter.post("/appointments", (req, res) => {
  const parsed = bookSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: "invalid_body", message: parsed.error.issues[0]?.message ?? "Invalid request." } });
  }
  const db = getDb();
  const ctx: ToolContext = { db, conversationId: "dashboard", channel: "dashboard" };
  const result = TOOLS.book_appointment.execute(ctx, parsed.data);
  if (!result.success) return res.status(409).json({ success: false, error: result.error });
  const appt = db.prepare(`SELECT * FROM appointments WHERE id = ?`).get((result.data as { appointment_id: string }).appointment_id);
  res.status(201).json({ success: true, appointment: publicAppt(appt as Record<string, unknown>) });
});

/** PATCH /api/v1/appointments/:id — { action: "cancel" } or { action: "reschedule", date, time } */
appointmentsRouter.patch("/appointments/:id", (req, res) => {
  const db = getDb();
  const ctx: ToolContext = { db, conversationId: "dashboard", channel: "dashboard" };
  const { action } = req.body ?? {};
  let result;
  if (action === "cancel") {
    result = TOOLS.cancel_appointment.execute(ctx, { appointment_id: req.params.id });
  } else if (action === "reschedule") {
    const p = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string().regex(/^\d{2}:\d{2}$/) }).safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: { code: "invalid_body", message: "date and time are required." } });
    result = TOOLS.reschedule_appointment.execute(ctx, { appointment_id: req.params.id, ...p.data });
  } else {
    return res.status(400).json({ error: { code: "invalid_action", message: "action must be 'cancel' or 'reschedule'." } });
  }
  if (!result.success) {
    const code = result.error!.code === "not_found" ? 404 : 409;
    return res.status(code).json({ success: false, error: result.error });
  }
  const appt = db.prepare(`SELECT * FROM appointments WHERE id = ?`).get(req.params.id);
  res.json({ success: true, appointment: publicAppt(appt as Record<string, unknown>) });
});
