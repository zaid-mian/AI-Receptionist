import { addDays, todayInTz } from "../db/database.js";
import { config } from "../config.js";

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, sept: 9, october: 10, oct: 10,
  november: 11, nov: 11, december: 12, dec: 12,
};
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function refToday(): string {
  return todayInTz(config.businessTimezone);
}

/**
 * Parse natural-language dates into YYYY-MM-DD.
 * Handles: today, tomorrow, day after tomorrow, weekday names (this/next),
 * "Sept 24", "24th September", ISO and US numeric dates.
 */
export function parseDate(text: string): string | null {
  const t = text.toLowerCase();
  const today = refToday();

  if (/\btoday\b/.test(t) || /\btonight\b/.test(t)) return today;
  if (/\btomorrow\b/.test(t) || /\btmrw\b/.test(t)) return addDays(today, 1);
  if (/day after tomorrow/.test(t)) return addDays(today, 2);
  if (/\byesterday\b/.test(t)) return addDays(today, -1);

  // "next Monday" -> Monday of next week; "last Monday" -> most recent Monday;
  // "this Friday"/"Friday" -> upcoming
  const wdMatch = t.match(/\b(?:(this|next|last)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (wdMatch) {
    const qualifier = wdMatch[1];
    const target = WEEKDAYS.indexOf(wdMatch[2]);
    const [y, m, d] = today.split("-").map(Number);
    const now = new Date(Date.UTC(y, m - 1, d));
    const cur = now.getUTCDay();
    if (qualifier === "last") {
      let delta = -((cur - target + 7) % 7);
      if (delta === 0) delta = -7; // "last friday" when today is friday -> 7 days ago
      return addDays(today, delta);
    }
    let delta = (target - cur + 7) % 7;
    if (qualifier === "next") {
      delta = delta === 0 ? 7 : delta + 7;
      // "next friday" when today is friday -> 7 days; when today is monday -> 11 days
    } else if (qualifier === "this" && delta === 0) {
      delta = 0; // this friday when today is friday -> today
    }
    return addDays(today, delta);
  }

  // "September 24th" / "sept 24"
  const m1 = t.match(
    /\b(january|february|march|april|may|june|july|august|september|sept|october|oct|november|nov|december|dec)\s+(\d{1,2})(?:st|nd|rd|th)?\b/
  );
  if (m1) return monthDayToDate(MONTHS[m1[1]], parseInt(m1[2], 10), today);

  // "24th of september"
  const m2 = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+of\s+(january|february|march|april|may|june|july|august|september|sept|october|oct|november|nov|december|dec)\b/);
  if (m2) return monthDayToDate(MONTHS[m2[2]], parseInt(m2[1], 10), today);

  // ISO 2026-09-24
  const m3 = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m3) return `${m3[1]}-${m3[2]}-${m3[3]}`;

  // US 09/24/2026 or 09/24
  const m4 = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (m4) {
    const mm = m4[1].padStart(2, "0");
    const dd = m4[2].padStart(2, "0");
    let yyyy = m4[3] ? (m4[3].length === 2 ? "20" + m4[3] : m4[3]) : today.slice(0, 4);
    let cand = `${yyyy}-${mm}-${dd}`;
    if (cand < today && !m4[3]) cand = `${Number(yyyy) + 1}-${mm}-${dd}`;
    return cand;
  }
  return null;
}

function monthDayToDate(month: number, day: number, today: string): string | null {
  if (day < 1 || day > 31) return null;
  const year = Number(today.slice(0, 4));
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  let cand = `${year}-${mm}-${dd}`;
  if (cand < today) cand = `${year + 1}-${mm}-${dd}`; // roll to next year
  return cand;
}
