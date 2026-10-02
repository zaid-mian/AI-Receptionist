// Types mirroring docs/API_CONTRACT.md exactly. Never invent fields not in the contract.

export type EngineStatus = 'operational' | 'degraded' | 'not-configured' | 'demo-mock';

export interface SystemComponent {
  name: string;
  status: EngineStatus;
  detail?: string;
}

export interface SystemStatus {
  engine: string;
  components: SystemComponent[];
}

export interface HealthResponse {
  status: string;
  version: string;
  uptime_s: number;
  engine: string;
  db: string;
}

// ---------- Chat (SSE) ----------

export type ChatChannel = 'chat' | 'voice';
export type ChatOutcome = 'resolved' | 'booked' | 'escalated' | 'open';

export interface ChatRequest {
  conversation_id?: string;
  message: string;
  channel: ChatChannel;
  customer_name?: string;
}

export interface ChatMeta {
  conversation_id: string;
  channel: ChatChannel;
  engine: string;
}

export interface ChatToolCall {
  tool: string;
  label: string;
  phase: 'started' | 'done';
  summary?: string;
}

export interface ChatSource {
  doc_id: string;
  title: string;
  section?: string;
}

export interface ChatAppointment {
  action: 'booked' | 'cancelled' | 'rescheduled';
  appointment: Appointment;
}

export interface ChatEscalation {
  reason: string;
}

export interface ChatDone {
  intent: string;
  outcome: ChatOutcome;
  latency_ms: number;
}

export interface ChatErrorPayload {
  code: string;
  message: string;
  recoverable: boolean;
}

export type ChatEvent =
  | { event: 'meta'; data: ChatMeta }
  | { event: 'tool'; data: ChatToolCall }
  | { event: 'sources'; data: { sources: ChatSource[] } }
  | { event: 'token'; data: { text: string } }
  | { event: 'appointment'; data: ChatAppointment }
  | { event: 'escalation'; data: ChatEscalation }
  | { event: 'done'; data: ChatDone }
  | { event: 'error'; data: ChatErrorPayload };

// ---------- Conversations ----------

export type ConversationStatus = 'open' | 'resolved' | 'escalated';

export interface ConversationSummary {
  id: string;
  customer_name: string;
  channel: ChatChannel;
  started_at: string;
  duration_s: number;
  intent: string;
  outcome: ChatOutcome;
  status: ConversationStatus;
  message_count: number;
  escalated: boolean;
  escalation_reason?: string | null;
  taken_over?: boolean;
  taken_over_by?: string | null;
  taken_over_at?: string | null;
  summary?: string;
}

export interface ConversationMessage {
  id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tool_calls?: { tool: string; label: string }[];
  sources?: ChatSource[];
  created_at: string;
}

export interface ConversationDetail {
  conversation: ConversationSummary & { summary?: string };
  messages: ConversationMessage[];
}

// ---------- Services / hours / appointments ----------

export interface Service {
  id: string;
  name: string;
  description: string;
  duration_min: number;
  price: number;
  currency: string;
  aliases: string[];
}

export interface BusinessDay {
  day: string;
  open: string;
  close: string;
}

export interface BusinessHours {
  timezone: string;
  hours: BusinessDay[];
}

export interface Availability {
  service_id: string;
  date: string;
  slots: string[];
}

export type AppointmentStatus = 'confirmed' | 'cancelled' | 'completed' | 'no_show';

export interface Appointment {
  id: string;
  customer_name: string;
  phone: string;
  email: string;
  service_id: string;
  service_name: string;
  date: string;
  time: string;
  duration_min: number;
  status: AppointmentStatus;
  notes: string;
  created_at: string;
  channel: string;
}

export interface CreateAppointmentBody {
  service_id: string;
  date: string;
  time: string;
  customer_name: string;
  phone: string;
  email?: string;
  notes?: string;
}

// ---------- Knowledge base ----------

export type DocStatus = 'indexed' | 'processing' | 'failed';
export type DocCategory = 'company' | 'services' | 'policies' | 'faq' | 'other';

export interface KnowledgeDocument {
  id: string;
  title: string;
  category: DocCategory;
  status: DocStatus;
  chunks: number;
  updated_at: string;
}

// ---------- Analytics (all demo data) ----------

export interface AnalyticsOverview {
  demo_data: boolean;
  total_conversations: number;
  resolution_rate: number;
  appointments_booked: number;
  avg_response_latency_s: number | null;
  avg_conversation_duration_s: number;
  escalation_rate: number;
}

export interface IntentCount {
  intent: string;
  count: number;
}

export interface TimeseriesDay {
  date: string;
  conversations: number;
  appointments: number;
}

// ---------- Settings ----------

export interface Settings {
  business: {
    name: string;
    tagline: string;
    address: string;
    phone: string;
    email: string;
  };
  personality: {
    tone: string;
    formality: string;
    verbosity: string;
    traits: string[];
  };
  voice: {
    provider: string;
    voice_name: string;
    rate: number;
    note: string;
  };
  hours: BusinessDay[];
  appointment_rules: {
    slot_interval_min: number;
    buffer_min: number;
    max_days_ahead: number;
    cancellation_notice_h: number;
  };
  integrations: {
    calendar: string;
    telephony: string;
    crm: string;
    email: string;
  };
  environment: {
    engine: string;
    db: string;
    vector: string;
    secrets_exposed: boolean;
  };
}

export interface VoiceConfig {
  stt: string;
  tts: string;
  note: string;
  telephony: string;
}
