import { DatabaseSync } from "node:sqlite";
import { config } from "../config.js";
import { addDays, hhmmToMin, minToHhmm, todayInTz, weekdayOf } from "../db/database.js";

export interface DaySchedule {
  date: string;
  weekday: string;
  open: string;
  close: string;
  closed: boolean;
  reason?: string;
}

export function getDaySchedule(db: DatabaseSync, date: string): DaySchedule {
  const weekday = weekdayOf(date);
  const row = db.prepare(`SELECT open, close FROM business_hours WHERE day = ?`).get(weekday) as
    | { open: string | null; close: string | null }
    | undefined;
  if (!row || !row.open || !row.close) {
    return { date, weekday, open: "", close: "", closed: true, reason: `We're closed on ${weekday}s.` };
  }
  return { date, weekday, open: row.open, close: row.close, closed: false };
}

function getRules(db: DatabaseSync): { slot_interval_min: number; buffer_min: number; max_days_ahead: number } {
  const row = db.prepare(`SELECT value FROM kv_settings WHERE key = 'appointment_rules'`).get() as
    | { value: string }
    | undefined;
  if (!row) return { slot_interval_min: 15, buffer_min: 0, max_days_ahead: 30 };
  try {
    return JSON.parse(row.value);
  } catch {
    return { slot_interval_min: 15, buffer_min: 0, max_days_ahead: 30 };
  }
}

function getService(db: DatabaseSync, id: string) {
  // Check services table by id
  const svc = db.prepare(
    `SELECT id, doctor_id, name, duration_min FROM services WHERE id = ? AND active = 1`
  ).get(id) as { id: string; doctor_id: string | null; name: string; duration_min: number } | undefined;
  if (svc) return svc;

  // Fallback: check if id is a doctor_id directly
  const docSvc = db.prepare(
    `SELECT id, doctor_id, name, duration_min FROM services WHERE doctor_id = ? AND active = 1`
  ).get(id) as { id: string; doctor_id: string | null; name: string; duration_min: number } | undefined;
  return docSvc;
}

/**
 * Compute free start-times for a service/doctor on a date.
 *
 * Doctor-Aware Algorithm:
 * 1. If service is linked to a doctor, lookup doctor's specific OPD shifts for weekdayOf(date).
 *    - If doctor has no shift that day, return doctor_not_sitting.
 *    - Generate slots strictly inside doctor's shift window(s) (e.g. 11:00-14:00).
 * 2. If unlinked service, fallback to business opening hours.
 * 3. Filter out past slots, buffer overlaps, and existing confirmed appointments.
 */
export function listAvailableSlots(
  db: DatabaseSync,
  serviceId: string,
  date: string
): { ok: true; slots: string[]; schedule: DaySchedule } | { ok: false; error: string; code: string; schedule: DaySchedule } {
  const svc = getService(db, serviceId);
  if (!svc) {
    return { ok: false, code: "invalid_service", error: "Unknown service.", schedule: getDaySchedule(db, date) };
  }

  const weekday = weekdayOf(date);
  const rules = getRules(db);
  const today = todayInTz(config.businessTimezone);

  if (date < today) {
    return { ok: false, code: "past_date", error: "That date is in the past.", schedule: getDaySchedule(db, date) };
  }
  if (date > addDays(today, rules.max_days_ahead)) {
    return { ok: false, code: "too_far", error: `We only book up to ${rules.max_days_ahead} days ahead.`, schedule: getDaySchedule(db, date) };
  }

  // --- Doctor Shift Scheduling Path ---
  if (svc.doctor_id) {
    const doctor = db.prepare(
      `SELECT id, name, title, active FROM doctors WHERE id = ?`
    ).get(svc.doctor_id) as { id: string; name: string; title: string; active: number } | undefined;

    if (doctor && doctor.active) {
      const shifts = db.prepare(
        `SELECT start_time, end_time, slot_duration_min
         FROM doctor_schedules
         WHERE doctor_id = ? AND day_of_week = ? AND active = 1
         ORDER BY start_time`
      ).all(doctor.id, weekday) as Array<{ start_time: string; end_time: string; slot_duration_min: number }>;

      if (shifts.length === 0) {
        const closedSchedule: DaySchedule = {
          date,
          weekday,
          open: "",
          close: "",
          closed: true,
          reason: `${doctor.name} does not sit for consultations on ${weekday}s.`,
        };
        return {
          ok: false,
          code: "doctor_not_sitting",
          error: closedSchedule.reason!,
          schedule: closedSchedule,
        };
      }

      // Existing confirmed appointments for this doctor or service
      const existing = db.prepare(
        `SELECT time, duration_min FROM appointments
         WHERE date = ? AND (service_id = ? OR service_id IN (SELECT id FROM services WHERE doctor_id = ?))
           AND status = 'confirmed'`
      ).all(date, svc.id, doctor.id) as Array<{ time: string; duration_min: number }>;

      const blocked: Array<[number, number]> = existing.map((a) => {
        const s = hhmmToMin(a.time) - rules.buffer_min;
        const e = hhmmToMin(a.time) + a.duration_min + rules.buffer_min;
        return [s, e];
      });

      const slots: string[] = [];
      for (const shift of shifts) {
        const shiftOpen = hhmmToMin(shift.start_time);
        const shiftClose = hhmmToMin(shift.end_time);
        const interval = shift.slot_duration_min || svc.duration_min || rules.slot_interval_min;

        for (let t = shiftOpen; t + svc.duration_min <= shiftClose; t += interval) {
          const s = t - rules.buffer_min;
          const e = t + svc.duration_min + rules.buffer_min;
          const clash = blocked.some(([bs, be]) => s < be && bs < e);
          if (!clash) slots.push(minToHhmm(t));
        }
      }

      const docSchedule: DaySchedule = {
        date,
        weekday,
        open: shifts[0].start_time,
        close: shifts[shifts.length - 1].end_time,
        closed: false,
      };

      return { ok: true, slots, schedule: docSchedule };
    }
  }

  // --- Fallback: General Facility Business Hours Path ---
  const schedule = getDaySchedule(db, date);
  if (schedule.closed) {
    return { ok: false, code: "closed", error: schedule.reason ?? "Closed that day.", schedule };
  }

  const openMin = hhmmToMin(schedule.open);
  const closeMin = hhmmToMin(schedule.close);
  const existing = db.prepare(
    `SELECT time, duration_min FROM appointments WHERE date = ? AND service_id = ? AND status = 'confirmed'`
  ).all(date, svc.id) as Array<{ time: string; duration_min: number }>;

  const blocked: Array<[number, number]> = existing.map((a) => {
    const s = hhmmToMin(a.time) - rules.buffer_min;
    const e = hhmmToMin(a.time) + a.duration_min + rules.buffer_min;
    return [s, e];
  });

  const slots: string[] = [];
  for (let t = openMin; t + svc.duration_min <= closeMin; t += rules.slot_interval_min) {
    const s = t - rules.buffer_min;
    const e = t + svc.duration_min + rules.buffer_min;
    const clash = blocked.some(([bs, be]) => s < be && bs < e);
    if (!clash) slots.push(minToHhmm(t));
  }
  return { ok: true, slots, schedule };
}

export function isSlotFree(db: DatabaseSync, serviceId: string, date: string, time: string): boolean {
  const r = listAvailableSlots(db, serviceId, date);
  return r.ok && r.slots.includes(time);
}
