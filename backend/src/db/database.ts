import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { seedIfEmpty } from "./seed.js";

const here = dirname(fileURLToPath(import.meta.url));

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  mkdirSync(config.dataDir, { recursive: true });
  const path = join(config.dataDir, "receptionist.db");
  const fresh = !existsSync(path);
  db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  const schemaPath = existsSync(join(here, "schema.sql"))
    ? join(here, "schema.sql")
    : join(here, "../../src/db/schema.sql");
  const schema = readFileSync(schemaPath, "utf8");
  db.exec(schema);

  // Safe migration for existing databases
  try {
    const cols = db.prepare("PRAGMA table_info(services)").all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === "doctor_id")) {
      db.exec("ALTER TABLE services ADD COLUMN doctor_id TEXT REFERENCES doctors(id);");
    }
  } catch {
    // Migration is non-fatal if table already updated
  }

  // Seed synchronously before returning: callers (and tests) can rely on
  // seeded data existing the moment getDb() returns. (Circular import with
  // seed.js is safe — both modules only use each other's bindings at runtime.)
  seedIfEmpty(db);
  return db;
}

/** Execute a synchronous callback within an atomic SQLite transaction. */
export function withTransaction<T>(database: DatabaseSync, fn: () => T): T {
  database.exec("BEGIN IMMEDIATE;");
  try {
    const res = fn();
    database.exec("COMMIT;");
    return res;
  } catch (err) {
    database.exec("ROLLBACK;");
    throw err;
  }
}

/** Current timestamp in ISO format (UTC). Display formatting happens client-side. */
export function nowIso(): string {
  return new Date().toISOString();
}

/** YYYY-MM-DD for "today" in the business timezone. */
export function todayInTz(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Add n days to a YYYY-MM-DD date string. */
export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/** Weekday name (Monday..Sunday) for a YYYY-MM-DD date. */
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export function weekdayOf(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** "HH:MM" -> minutes since midnight. */
export function hhmmToMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** minutes since midnight -> "HH:MM". */
export function minToHhmm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Human "3:00 PM" for "15:00". */
export function humanTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Human "Thursday, Sep 24" for "2026-09-24". */
export function humanDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const wd = dt.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  const md = dt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${wd}, ${md}`;
}

let idCounter = 0;
/** Short unique id with prefix, e.g. conv_9f3ka2, kb_x81m. */
export function newId(prefix: string): string {
  idCounter = (idCounter + 1) % 46656;
  const rand = Math.random().toString(36).slice(2, 8);
  const cnt = idCounter.toString(36).padStart(3, "0");
  return `${prefix}_${rand}${cnt}`;
}
