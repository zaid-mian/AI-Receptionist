// Small formatting helpers. Times/dates arrive on the wire as local business
// time (HH:MM 24h, YYYY-MM-DD); this module only formats for display.

/** "15:00" -> "3:00 PM" */
export function formatTime12h(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = mStr ?? '00';
  if (Number.isNaN(h)) return hhmm;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${suffix}`;
}

/** "2026-09-24" -> "Sep 24, 2026" */
export function formatDateLong(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  if (!y || !m || !d) return yyyyMmDd;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "2026-09-24" -> "Tomorrow, Sep 24" style relative label when near. */
export function formatDateRelative(yyyyMmDd: string, now = new Date()): string {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  if (!y || !m || !d) return yyyyMmDd;
  const target = new Date(y, m - 1, d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
  const base = target.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (diffDays === 0) return `Today, ${base}`;
  if (diffDays === 1) return `Tomorrow, ${base}`;
  if (diffDays === -1) return `Yesterday, ${base}`;
  return target.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** 204 -> "3m 24s" */
export function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${Math.round(totalSeconds)}s`;
  const m = Math.floor(totalSeconds / 60);
  const s = Math.round(totalSeconds % 60);
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

/** "2026-09-23T10:02:11" -> "2 min ago" */
export function timeAgo(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diffS = Math.max(0, Math.floor((now - t) / 1000));
  if (diffS < 60) return 'just now';
  if (diffS < 3600) {
    const m = Math.floor(diffS / 60);
    return `${m} min ago`;
  }
  if (diffS < 86400) {
    const h = Math.floor(diffS / 3600);
    return `${h} hr ago`;
  }
  const d = Math.floor(diffS / 86400);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

/** "2026-09-23T10:02:11" -> "10:02 AM" */
export function formatClockTime(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** seconds -> "MM:SS" */
export function formatTimer(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** "book_appointment" -> "Book appointment" */
export function humanize(s: string): string {
  return s
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** "YYYY-MM-DD" for a Date */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
