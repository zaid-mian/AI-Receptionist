-- AI Receptionist schema (SQLite, incl. FTS5 for knowledge retrieval)
PRAGMA journal_mode = WAL;

-- Staff and Administrative Users
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Hospital Departments & Clinical Units
CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  building TEXT NOT NULL,
  floor TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT ''
);

-- Doctors & Specialist Consultants
CREATE TABLE IF NOT EXISTS doctors (
  id TEXT PRIMARY KEY,
  department_id TEXT NOT NULL REFERENCES departments(id),
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  fee_pkr INTEGER NOT NULL DEFAULT 2000,
  room TEXT,
  appointment_mode TEXT NOT NULL DEFAULT 'both',
  active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_doctors_dept ON doctors(department_id, active);

-- Doctor OPD Shift Schedules (Weekly Recurring)
CREATE TABLE IF NOT EXISTS doctor_schedules (
  id TEXT PRIMARY KEY,
  doctor_id TEXT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  day_of_week TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  slot_duration_min INTEGER NOT NULL DEFAULT 15,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_doc_sched ON doctor_schedules(doctor_id, day_of_week, active);

CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  doctor_id TEXT REFERENCES doctors(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  duration_min INTEGER NOT NULL,
  price_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'PKR',
  aliases TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS business_hours (
  day TEXT PRIMARY KEY,
  open TEXT,
  close TEXT
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  customer_id TEXT REFERENCES customers(id),
  customer_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  service_id TEXT REFERENCES services(id),
  service_name TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  duration_min INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed',
  notes TEXT NOT NULL DEFAULT '',
  channel TEXT NOT NULL DEFAULT 'chat',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_appt_date ON appointments(date, status);
CREATE INDEX IF NOT EXISTS idx_appt_customer ON appointments(customer_id);
CREATE INDEX IF NOT EXISTS idx_appt_service ON appointments(service_id, date, status);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  customer_name TEXT,
  channel TEXT NOT NULL DEFAULT 'chat',
  status TEXT NOT NULL DEFAULT 'open',
  intent TEXT,
  outcome TEXT,
  escalated INTEGER NOT NULL DEFAULT 0,
  escalation_reason TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  duration_s INTEGER NOT NULL DEFAULT 0,
  summary TEXT NOT NULL DEFAULT '',
  agent_state TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_conv_status ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_conv_started ON conversations(started_at);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  tool_calls TEXT NOT NULL DEFAULT '[]',
  sources TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, id);

CREATE TABLE IF NOT EXISTS kb_documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'indexed',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kb_chunks (
  chunk_id TEXT PRIMARY KEY,
  doc_id TEXT NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  section TEXT NOT NULL,
  content TEXT NOT NULL,
  ord INTEGER NOT NULL
);

-- Full-text retrieval index over knowledge chunks (porter stemming).
CREATE VIRTUAL TABLE IF NOT EXISTS kb_chunks_fts USING fts5(
  chunk_id, doc_id, title, section, content, tokenize='porter'
);

CREATE TABLE IF NOT EXISTS kv_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS turn_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL,
  latency_ms INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
