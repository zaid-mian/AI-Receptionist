import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { newId, nowIso, withTransaction } from "../db/database.js";
import { searchKnowledge } from "../rag/retrieval.js";
import { isSlotFree, listAvailableSlots } from "../services/availability.js";

/* ------------------------------------------------------------------ */
/* Tool infrastructure                                                 */
/* ------------------------------------------------------------------ */

export interface ToolContext {
  db: DatabaseSync;
  conversationId: string;
  channel: string;
}

export interface ToolResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string };
}

export interface ToolDef {
  name: string;
  description: string;
  schema: z.ZodTypeAny;
  execute: (ctx: ToolContext, args: Record<string, unknown>) => ToolResult;
}

function ok(data: Record<string, unknown> = {}): ToolResult {
  return { success: true, data };
}
function fail(code: string, message: string): ToolResult {
  return { success: false, error: { code, message } };
}

export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  // Pakistani formats: 03001234567 (11 digits, starts with 03) -> +92 300 1234567
  if (digits.length === 11 && digits.startsWith("03")) {
    return `+92 ${digits.slice(1, 4)} ${digits.slice(4)}`;
  }
  // 923001234567 (12 digits, starts with 92) -> +92 300 1234567
  if (digits.length === 12 && digits.startsWith("923")) {
    return `+92 ${digits.slice(2, 5)} ${digits.slice(5)}`;
  }
  const trimmed = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (trimmed.length < 7 || trimmed.length > 15) return null;
  return trimmed.length === 10
    ? `+1 ${trimmed.slice(0, 3)}-${trimmed.slice(3, 6)}-${trimmed.slice(6)}`
    : `+${trimmed}`;
}

function nextAppointmentId(db: DatabaseSync): string {
  const row = db.prepare(`SELECT id FROM appointments ORDER BY rowid DESC LIMIT 1`).get() as
    | { id: string }
    | undefined;
  const n = row ? parseInt(row.id.replace("APT-", ""), 10) + 1 : 1041;
  return `APT-${n}`;
}

/* ------------------------------------------------------------------ */
/* Tool definitions                                                    */
/* ------------------------------------------------------------------ */

const search_knowledge_base: ToolDef = {
  name: "search_knowledge_base",
  description: "Search the business knowledge base for company info, services, policies, FAQs.",
  schema: z.object({ query: z.string().min(1), limit: z.number().int().min(1).max(10).default(5) }),
  execute: (ctx, args) => {
    const { query, limit } = search_knowledge_base.schema.parse(args);
    const chunks = searchKnowledge(ctx.db, query, { limit });
    return ok({
      results: chunks.map((c) => ({
        doc_id: c.doc_id, title: c.title, section: c.section,
        snippet: c.snippet.replace(/<\/?b>/g, ""), content: c.content,
      })),
      count: chunks.length,
    });
  },
};

const get_business_hours: ToolDef = {
  name: "get_business_hours",
  description: "Get the business opening hours for each day of the week.",
  schema: z.object({}),
  execute: (ctx) => {
    const hours = ctx.db.prepare(`SELECT day, open, close FROM business_hours`).all();
    return ok({ timezone: "Asia/Karachi", hours });
  },
};

const get_services: ToolDef = {
  name: "get_services",
  description: "List bookable services with price and duration.",
  schema: z.object({}),
  execute: (ctx) => {
    const services = ctx.db.prepare(
      `SELECT id, name, description, duration_min, price_cents, currency FROM services WHERE active = 1`
    ).all() as Array<Record<string, unknown>>;
    return ok({
      services: services.map((s) => {
        const cents = s.price_cents as number;
        const price = cents === 0 ? "Fee unconfirmed (contact desk)" : `Rs. ${(cents / 100).toFixed(0)}`;
        return {
          ...s,
          price,
        };
      }),
    });
  },
};

const check_availability: ToolDef = {
  name: "check_availability",
  description: "Check free appointment slots for a service on a date (YYYY-MM-DD).",
  schema: z.object({ service_id: z.string(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  execute: (ctx, args) => {
    const { service_id, date } = check_availability.schema.parse(args);
    const r = listAvailableSlots(ctx.db, service_id, date);
    if (!r.ok) return fail(r.code, r.error);
    return ok({ service_id, date, slots: r.slots, weekday: r.schedule.weekday });
  },
};

const book_appointment: ToolDef = {
  name: "book_appointment",
  description: "Book an appointment. Only call after the customer confirmed the details.",
  schema: z.object({
    service_id: z.string(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^\d{2}:\d{2}$/),
    customer_name: z.string().min(2),
    phone: z.string().min(7),
    email: z.string().optional(),
    notes: z.string().optional(),
  }),
  execute: (ctx, args) => {
    const a = book_appointment.schema.parse(args);
    const phone = normalizePhone(a.phone);
    if (!phone) return fail("invalid_phone", "That phone number doesn't look valid. Please check it and try again.");
    const svc = ctx.db.prepare(`SELECT id, name, duration_min FROM services WHERE id = ? AND active = 1`).get(a.service_id) as
      | { id: string; name: string; duration_min: number } | undefined;
    if (!svc) return fail("invalid_service", "Unknown service.");
    if (!isSlotFree(ctx.db, a.service_id, a.date, a.time)) {
      const alt = listAvailableSlots(ctx.db, a.service_id, a.date);
      return fail("slot_taken", `Sorry — ${a.time} is no longer free. ${alt.ok && alt.slots.length ? "Nearby openings: " + alt.slots.slice(0, 4).join(", ") + "." : "No other openings that day."}`);
    }
    const id = nextAppointmentId(ctx.db);
    const now = nowIso();
    const customerId = newId("cus");

    withTransaction(ctx.db, () => {
      ctx.db.prepare(`INSERT INTO customers (id, name, phone, email, created_at) VALUES (?, ?, ?, ?, ?)`)
        .run(customerId, a.customer_name, phone, a.email ?? null, now);
      const appt = {
        id, customer_id: customerId, customer_name: a.customer_name, phone, email: a.email ?? null,
        service_id: svc.id, service_name: svc.name, date: a.date, time: a.time,
        duration_min: svc.duration_min, status: "confirmed", notes: a.notes ?? "",
        channel: ctx.channel, created_at: now, updated_at: now,
      };
      ctx.db.prepare(
        `INSERT INTO appointments (id, customer_id, customer_name, phone, email, service_id, service_name, date, time, duration_min, status, notes, channel, created_at, updated_at)
         VALUES (@id, @customer_id, @customer_name, @phone, @email, @service_id, @service_name, @date, @time, @duration_min, @status, @notes, @channel, @created_at, @updated_at)`
      ).run(appt);
    });

    return ok({
      appointment_id: id, date: a.date, time: a.time,
      customer: a.customer_name, service: svc.name, status: "confirmed",
    });
  },
};

const cancel_appointment: ToolDef = {
  name: "cancel_appointment",
  description: "Cancel a confirmed appointment by its ID (e.g. APT-1042).",
  schema: z.object({ appointment_id: z.string() }),
  execute: (ctx, args) => {
    const { appointment_id } = cancel_appointment.schema.parse(args);
    const appt = ctx.db.prepare(`SELECT * FROM appointments WHERE id = ?`).get(appointment_id) as
      | Record<string, unknown> | undefined;
    if (!appt) return fail("not_found", `I couldn't find appointment ${appointment_id}.`);
    if (appt.status !== "confirmed") return fail("invalid_state", `That appointment is already ${appt.status}.`);
    ctx.db.prepare(`UPDATE appointments SET status = 'cancelled', updated_at = ? WHERE id = ?`).run(nowIso(), appointment_id);
    return ok({ appointment_id, status: "cancelled", customer: appt.customer_name, date: appt.date, time: appt.time });
  },
};

const reschedule_appointment: ToolDef = {
  name: "reschedule_appointment",
  description: "Move a confirmed appointment to a new date/time.",
  schema: z.object({
    appointment_id: z.string(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^\d{2}:\d{2}$/),
  }),
  execute: (ctx, args) => {
    const { appointment_id, date, time } = reschedule_appointment.schema.parse(args);
    const appt = ctx.db.prepare(`SELECT * FROM appointments WHERE id = ?`).get(appointment_id) as
      | { status: string; service_id: string; customer_name: string } | undefined;
    if (!appt) return fail("not_found", `I couldn't find appointment ${appointment_id}.`);
    if (appt.status !== "confirmed") return fail("invalid_state", `That appointment is ${appt.status} and can't be moved.`);
    if (!isSlotFree(ctx.db, appt.service_id, date, time)) {
      return fail("slot_taken", `Sorry — ${time} on ${date} isn't free. Please pick another time.`);
    }
    ctx.db.prepare(`UPDATE appointments SET date = ?, time = ?, updated_at = ? WHERE id = ?`)
      .run(date, time, nowIso(), appointment_id);
    return ok({ appointment_id, status: "confirmed", date, time, customer: appt.customer_name });
  },
};

const collect_customer_information: ToolDef = {
  name: "collect_customer_information",
  description: "Validate and store customer contact details collected during the conversation.",
  schema: z.object({
    name: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    notes: z.string().optional(),
  }),
  execute: (ctx, args) => {
    const a = collect_customer_information.schema.parse(args);
    const collected: string[] = [];
    if (a.name) collected.push("name");
    let phone: string | null = null;
    if (a.phone) {
      phone = normalizePhone(a.phone);
      if (!phone) return fail("invalid_phone", "That phone number doesn't look valid.");
      collected.push("phone");
    }
    if (a.email) {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a.email)) return fail("invalid_email", "That email address doesn't look valid.");
      collected.push("email");
    }
    if (a.notes) collected.push("notes");
    const customerId = newId("cus");
    ctx.db.prepare(`INSERT INTO customers (id, name, phone, email, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(customerId, a.name ?? "Unknown", phone, a.email ?? null, a.notes ?? "", nowIso());
    return ok({ customer_id: customerId, collected });
  },
};

const escalate_to_human: ToolDef = {
  name: "escalate_to_human",
  description: "Hand the conversation to a human team member with a reason.",
  schema: z.object({ reason: z.string().min(3) }),
  execute: (ctx, args) => {
    const { reason } = escalate_to_human.schema.parse(args);
    ctx.db.prepare(
      `UPDATE conversations SET escalated = 1, escalation_reason = ?, status = 'escalated', outcome = 'escalated' WHERE id = ?`
    ).run(reason, ctx.conversationId);
    return ok({ status: "escalated", reason });
  },
};

const get_departments: ToolDef = {
  name: "get_departments",
  description: "Get all hospital clinical departments and their locations.",
  schema: z.object({}),
  execute: (ctx) => {
    const depts = ctx.db.prepare(
      `SELECT id, name, building, floor, description FROM departments ORDER BY name ASC`
    ).all();
    return ok({ departments: depts, count: depts.length });
  },
};

const get_doctor_schedules: ToolDef = {
  name: "get_doctor_schedules",
  description: "Get doctor shift schedules, consultation fees, and visiting hours by doctor name or department.",
  schema: z.object({
    doctor_name: z.string().optional(),
    department_name: z.string().optional(),
  }),
  execute: (ctx, args) => {
    const a = get_doctor_schedules.schema.parse(args ?? {});
    let query = `
      SELECT d.id, d.name, d.title, d.fee_pkr, d.room, dept.name AS department,
             ds.day_of_week, ds.start_time, ds.end_time
      FROM doctors d
      JOIN departments dept ON d.department_id = dept.id
      LEFT JOIN doctor_schedules ds ON d.id = ds.doctor_id AND ds.active = 1
      WHERE d.active = 1
    `;
    const params: string[] = [];
    if (a.doctor_name) {
      query += ` AND lower(d.name) LIKE ?`;
      params.push(`%${a.doctor_name.trim().toLowerCase()}%`);
    }
    if (a.department_name) {
      query += ` AND (lower(dept.name) LIKE ? OR lower(dept.id) LIKE ?)`;
      params.push(`%${a.department_name.trim().toLowerCase()}%`, `%${a.department_name.trim().toLowerCase()}%`);
    }
    query += ` ORDER BY d.name, CASE ds.day_of_week
      WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3
      WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 WHEN 'Saturday' THEN 6 WHEN 'Sunday' THEN 7 ELSE 8 END`;
    const rows = ctx.db.prepare(query).all(...params) as Array<{
      id: string; name: string; title: string; fee_pkr: number; room: string;
      department: string; day_of_week: string | null; start_time: string | null; end_time: string | null;
    }>;

    const doctorsMap = new Map<string, {
      id: string; name: string; title: string; fee_pkr: number; room: string; department: string;
      schedules: Array<{ day: string; hours: string }>;
    }>();

    for (const r of rows) {
      if (!doctorsMap.has(r.id)) {
        doctorsMap.set(r.id, {
          id: r.id, name: r.name, title: r.title, fee_pkr: r.fee_pkr, room: r.room,
          department: r.department, schedules: [],
        });
      }
      if (r.day_of_week && r.start_time && r.end_time) {
        doctorsMap.get(r.id)!.schedules.push({
          day: r.day_of_week,
          hours: `${r.start_time} - ${r.end_time}`,
        });
      }
    }

    const doctors = Array.from(doctorsMap.values());
    return ok({ doctors, count: doctors.length });
  },
};

export const TOOLS: Record<string, ToolDef> = {
  search_knowledge_base,
  get_business_hours,
  get_services,
  get_departments,
  get_doctor_schedules,
  check_availability,
  book_appointment,
  cancel_appointment,
  reschedule_appointment,
  collect_customer_information,
  escalate_to_human,
};

/** Friendly UI label for a tool, shown as activity (never chain-of-thought). */
export const TOOL_LABELS: Record<string, string> = {
  search_knowledge_base: "Searching knowledge base",
  get_business_hours: "Checking business hours",
  get_services: "Looking up services",
  get_departments: "Checking hospital departments",
  get_doctor_schedules: "Checking doctor OPD schedule",
  check_availability: "Checking availability",
  book_appointment: "Booking your appointment",
  cancel_appointment: "Cancelling appointment",
  reschedule_appointment: "Rescheduling appointment",
  collect_customer_information: "Saving your details",
  escalate_to_human: "Connecting you with our team",
};

/** Find upcoming confirmed appointments for a customer name (fuzzy). */
export function findAppointmentsByName(db: DatabaseSync, name: string) {
  const like = `%${name.trim().toLowerCase()}%`;
  return db.prepare(
    `SELECT * FROM appointments WHERE lower(customer_name) LIKE ? AND status = 'confirmed' AND date >= date('now') ORDER BY date, time`
  ).all(like) as Array<Record<string, unknown>>;
}
