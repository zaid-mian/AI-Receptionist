/** Shared agent types. */

export type Intent =
  | "greeting" | "services_info" | "service_detail" | "hours_info"
  | "location_info" | "pricing_info" | "policy_info" | "faq"
  | "availability_check" | "book_appointment" | "cancel_appointment"
  | "reschedule_appointment" | "provide_details" | "human_request"
  | "complaint" | "medical_advice" | "emergency" | "smalltalk" | "goodbye" | "unknown";

export type Outcome = "resolved" | "booked" | "escalated" | "open";

export interface Entities {
  service_id?: string;
  service_name?: string;
  date?: string;            // YYYY-MM-DD
  time?: string;            // HH:MM 24h
  timePref?: "morning" | "afternoon" | "evening";
  slotIndex?: number;       // "the second one"
  name?: string;
  phone?: string;
  email?: string;
  confirmed?: boolean;      // yes
  declined?: boolean;       // no
  appointmentRef?: string;  // "APT-1042"
}

export interface NluResult {
  intent: Intent;
  entities: Entities;
  confidence: number; // 0..1 heuristic
}

export interface BookingFlow {
  action: "book" | "cancel" | "reschedule";
  service_id?: string;
  service_name?: string;
  date?: string;
  time?: string;
  timePref?: "morning" | "afternoon" | "evening";
  name?: string;
  phone?: string;
  email?: string;
  offered?: string[];
  offeredDate?: string;
  awaiting?: string;
  appointment_id?: string;
  candidates?: Array<{ id: string; service_name: string; date: string; time: string }>;
}

export interface AgentState {
  flow?: BookingFlow;
  fails?: number;       // consecutive unknown turns
  turns?: number;
  lang?: "en" | "ur";   // conversation language — sticks once Urdu is detected
  taken_over?: boolean;
  taken_over_by?: string;
  taken_over_at?: string;
}

export type AgentEventType =
  | "meta" | "tool" | "sources" | "token" | "appointment" | "escalation" | "done" | "error";

export interface AgentEvent {
  type: AgentEventType;
  data: Record<string, unknown>;
}

export interface ServiceRow {
  id: string;
  name: string;
  description: string;
  duration_min: number;
  price_cents: number;
  currency: string;
  aliases: string[];
}
