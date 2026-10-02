import { DatabaseSync } from "node:sqlite";
import { parseDate } from "./dateParser.js";
import { normalizeUrduInput } from "./urdu.js";
import { AgentState, Entities, Intent, NluResult, ServiceRow } from "./types.js";

/* ------------------------------------------------------------------ */
/* Entity extraction                                                   */
/* ------------------------------------------------------------------ */

function loadServices(db: DatabaseSync): ServiceRow[] {
  const rows = db.prepare(`SELECT * FROM services WHERE active = 1`).all() as Array<{
    id: string; name: string; description: string; duration_min: number;
    price_cents: number; currency: string; aliases: string;
  }>;
  return rows.map((r) => ({ ...r, aliases: JSON.parse(r.aliases) as string[] }));
}

/** Roots and synonyms mapped to department keys for robust fuzzy detection */
const SPECIALTY_ROOTS: Array<{ stems: string[]; key: string }> = [
  { stems: ["dermatolog", "derma", "skin", "acne", "hair", "zild"], key: "dermatology" },
  { stems: ["pediatric", "paediatric", "child", "children", "kids", "baby", "bachon", "neonat", "newborn"], key: "pediatrics" },
  { stems: ["gynecolog", "gynaecolog", "gynae", "gyne", "obgyn", "obs", "women", "pregnancy", "hamal", "aurat", "female doc"], key: "gynecology" },
  { stems: ["cardiolog", "cardiac", "heart", "dil"], key: "cardiology" },
  { stems: ["orthopedic", "orthopaedic", "ortho", "bone", "joint", "fracture", "haddi", "haddian"], key: "orthopedic" },
  { stems: ["neurolog", "neuro", "brain", "dimagh", "nerve"], key: "neurology" },
  { stems: ["pulmonolog", "pulmo", "lung", "chest spec", "saans"], key: "pulmonology" },
  { stems: ["urolog", "kidney", "bladder", "masana", "gurda"], key: "urology" },
  { stems: ["ent", "ear nose", "throat", "kaan", "gala", "naak"], key: "ent" },
  { stems: ["surgeon", "surgery", "laparoscopic", "laparoscopy", "operation"], key: "general surgery" },
];

function matchWordBoundary(text: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
  return re.test(text);
}

/** Longest-alias-match service detection with medical root-stem fallback. */
export function extractService(db: DatabaseSync, text: string): { id: string; name: string } | null {
  let best: { id: string; name: string; len: number } | null = null;
  const services = loadServices(db);

  // 1. Direct candidate alias/name matching with strict word boundary
  for (const s of services) {
    const candidates = [s.name.toLowerCase(), ...s.aliases.map((a) => a.toLowerCase())];
    for (const c of candidates) {
      if (c.length >= 3 && matchWordBoundary(text, c) && (!best || c.length > best.len)) {
        best = { id: s.id, name: s.name, len: c.length };
      }
    }
  }
  if (best) return { id: best.id, name: best.name };

  // 2. Specialty root stem matching with word/prefix boundary for short stems
  for (const root of SPECIALTY_ROOTS) {
    if (root.stems.some((stem) => stem.length <= 4 ? matchWordBoundary(text, stem) : text.toLowerCase().includes(stem))) {
      const match = services.find((s) =>
        s.aliases.some((a) => a.toLowerCase().includes(root.key)) ||
        s.name.toLowerCase().includes(root.key)
      );
      if (match) return { id: match.id, name: match.name };
    }
  }

  return null;
}

export function extractTime(text: string): { time?: string; timePref?: "morning" | "afternoon" | "evening" } {
  const t = text.toLowerCase();
  // "3 PM", "3:30pm", "15:00"
  const m = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (m) {
    let h = parseInt(m[1], 10);
    const min = m[2] ? parseInt(m[2], 10) : 0;
    if (m[3] === "pm" && h < 12) h += 12;
    if (m[3] === "am" && h === 12) h = 0;
    if (h >= 0 && h < 24 && min < 60) {
      return { time: `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}` };
    }
  }
  const m24 = t.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (m24) {
    return { time: `${m24[1].padStart(2, "0")}:${m24[2]}` };
  }
  // "around 3" / "at 3"
  const mBare = t.match(/\b(?:around|about|at|for)\s+(\d{1,2})\b/);
  if (mBare) {
    const h = parseInt(mBare[1], 10);
    if (h >= 1 && h <= 12) {
      // Business hours are 9-18: 9-11 -> AM, 12/1-6 -> PM
      const h24 = h >= 9 && h <= 11 ? h : h === 12 ? 12 : h + 12;
      return { time: `${String(h24).padStart(2, "0")}:00` };
    }
  }
  if (/\bmorning\b/.test(t)) return { timePref: "morning" };
  if (/\bafternoon\b/.test(t)) return { timePref: "afternoon" };
  if (/\bevening\b/.test(t)) return { timePref: "evening" };
  return {};
}

export function extractSlotIndex(text: string): number | undefined {
  const t = text.toLowerCase();
  const ords: Array<[RegExp, number]> = [
    [/\bfirst\b|\b1st\b/, 0], [/\bsecond\b|\b2nd\b/, 1], [/\bthird\b|\b3rd\b/, 2],
    [/\bfourth\b|\b4th\b/, 3], [/\bfifth\b|\b5th\b/, 4],
  ];
  for (const [re, i] of ords) if (re.test(t)) return i;
  return undefined;
}

export function extractName(text: string, awaitingName: boolean): string | undefined {
  const patterns = [
    /(?:my name is|i'm|im|this is|it's)\s+([a-z]+(?:\s+[a-z]+){0,2})/i,
    /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\.?$/,
    // Urdu-script name, e.g. "علی رضا" (used when the customer answers in Urdu).
    /^([\u0600-\u06FF]+(?:\s+[\u0600-\u06FF]+){0,2})\.?$/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const name = m[1].trim().replace(/\s+/g, " ");
      if (!/^(yes|no|ok|okay|sure|thanks|please)$/i.test(name)) {
        return name.split(" ").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
      }
    }
  }
  if (awaitingName) {
    // Bare "Sarah Miller" typed as the whole message.
    const cleaned = text.replace(/[^a-zA-Z\s'.-]/g, "").trim();
    const words = cleaned.split(/\s+/).filter((w) => /^[A-Z][a-z'.-]*$/.test(w) || /^[a-z]+$/.test(w));
    if (words.length >= 2 && words.length <= 3 && cleaned.length >= 4 && cleaned.length <= 40) {
      const low = cleaned.toLowerCase();
      if (!/(book|cancel|appointment|tomorrow|today|monday|tuesday|wednesday|thursday|friday)/.test(low)) {
        return words.map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
      }
    }
  }
  return undefined;
}

export function extractPhone(text: string): string | undefined {
  const m = text.match(/(\+?1?[\s\-.]?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4})/);
  if (m) return m[1];
  const m2 = text.match(/\b\d{7,15}\b/);
  return m2 ? m2[0] : undefined;
}

export function extractEmail(text: string): string | undefined {
  const m = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
  return m ? m[0] : undefined;
}

export function extractConfirmation(text: string): { confirmed?: boolean; declined?: boolean } {
  const t = text.trim().toLowerCase();
  if (/^(yes|yeah|yep|sure|ok|okay|sounds good|please do|go ahead|book it|confirm|confirmed|correct|that'?s right|perfect|do it|please)\b/.test(t)) {
    return { confirmed: true };
  }
  if (/^(no|nope|not yet|don'?t|cancel|never mind|nevermind|actually no|stop)\b/.test(t)) {
    return { declined: true };
  }
  return {};
}

export function extractAppointmentRef(text: string): string | undefined {
  const m = text.toUpperCase().match(/\bAPT-?\d{3,6}\b/);
  return m ? m[0].replace("APT", "APT-").replace("APT--", "APT-") : undefined;
}

/* ------------------------------------------------------------------ */
/* Intent classification                                               */
/* ------------------------------------------------------------------ */

const has = (t: string, ...words: string[]) => words.some((w) => t.includes(w));

export function classify(db: DatabaseSync, text: string, state: AgentState): NluResult {
  // Urdu normalization first: Urdu-script and Roman-Urdu input is mapped to
  // the English keywords below, so one tested pipeline serves both languages.
  const normalized = normalizeUrduInput(text);
  const t = ` ${normalized.toLowerCase().trim()} `;
  const entities: Entities = {};
  let intent: Intent = "unknown";
  let confidence = 0.4;

  // --- entities first (cheap, useful everywhere) ---
  const svc = extractService(db, normalized);
  if (svc) { entities.service_id = svc.id; entities.service_name = svc.name; }
  const date = parseDate(normalized);
  if (date) entities.date = date;
  const { time, timePref } = extractTime(normalized);
  if (time) entities.time = time;
  if (timePref) entities.timePref = timePref;
  const slotIndex = extractSlotIndex(normalized);
  if (slotIndex !== undefined) entities.slotIndex = slotIndex;
  const phone = extractPhone(normalized);
  if (phone) entities.phone = phone;
  const email = extractEmail(normalized);
  if (email) entities.email = email;
  const ref = extractAppointmentRef(normalized);
  if (ref) entities.appointmentRef = ref;
  const { confirmed, declined } = extractConfirmation(normalized);
  if (confirmed) entities.confirmed = true;
  if (declined) entities.declined = true;
  const awaiting = state.flow?.awaiting;
  const name = extractName(normalized, awaiting === "name");
  if (name) entities.name = name;

  // --- PRIORITY 1: Red-flag emergencies (Life safety always first per Faisal Hospital rules) ---
  if (has(
    t,
    "chest pain", "chest discomfort", "heart attack", "chhati mein dard", "seene mein dard", "dil ka daura",
    "difficulty breathing", "shortness of breath", "cant breathe", "can't breathe", "saans lene", "saans phool",
    "severe bleeding", "bleeding heavily", "khoon beh",
    "stroke", "face drooping", "slurred speech", "falij",
    "unconscious", "passed out", "unresponsive", "behosh",
    "seizure", "seizures", "convulsion", "jhatke", "mirgi",
    "severe trauma", "road accident", "car crash", "hadsa",
    "poison", "poisoning", "overdose", "zehar",
    "suicide", "suicidal", "kill myself", "self harm", "khudkushi"
  )) {
    return { intent: "emergency", entities, confidence: 1.0 };
  }

  // --- a pending flow usually means the user is answering our question ---
  if (state.flow && awaiting && !/^(hi|hello|hey)\b/.test(t.trim())) {
    const flowIntent = classifyFlowContinuation(t, entities, awaiting);
    if (flowIntent) return { intent: flowIntent, entities, confidence: 0.85 };
  }

  // --- explicit escalation / complaint ---
  if (has(t, "human", "real person", "real human", "someone from", "your staff", "your team", "manager", "supervisor", "call me back", "talk to somebody", "talk to someone")) {
    return { intent: "human_request", entities, confidence: 0.95 };
  }
  if (has(t, "terrible", "awful", "horrible", "worst", "disgusting", "complaint", "i want to complain", "unacceptable", "ridiculous", "charged twice", "double charg", "overcharged", "scam", "sue", "angry", "furious")) {
    return { intent: "complaint", entities, confidence: 0.9 };
  }

  // --- medical advice guard (dental triage, not diagnosis) ---
  if (has(t, "is this serious", "should i worry", "diagnose", "what's wrong with", "what is wrong with", "do i need a root canal", "is it infected", "will i lose my tooth", "how bad is")) {
    return { intent: "medical_advice", entities, confidence: 0.85 };
  }

  // --- cancel / reschedule before book (they share the word "appointment") ---
  // ("cancellation policy" is a policy question, not a cancellation request)
  if (has(t, "reschedul", "move my appointment", "change my appointment", "different time", "different day", "push back", "postpone")) {
    return { intent: "reschedule_appointment", entities, confidence: 0.9 };
  }
  if (has(t, "cancel", "called off", "call off") && !has(t, "policy", "policies")) {
    return { intent: "cancel_appointment", entities, confidence: 0.9 };
  }

  // --- emergency doctor / casualty / 24-hour ER questions ---
  if (has(t, "emergency doctor", "emergency physician", " er doctor ", "casualty doctor", "doctor at night", "doctor available at night", " emergency at 2 ", "available at 2", "available at night", "emergency open", "casualty open", " er open ", "emergency at night", "accident & emergency", "accident and emergency")) {
    return { intent: "faq", entities, confidence: 0.95 };
  }

  // --- hospital facility & amenity inquiries (wheelchair, vaccination, lab, pharmacy) ---
  if (has(t, "wheelchair", "vaccin", "immuniz", "laboratory", "blood test", "blood bank", "pharmacy", "medical store", "lab test")) {
    intent = "faq"; confidence = 0.95;
  } else if (svc && has(t, "time", "timing", "timings", "hour", "hours", "schedule", "when", "days", "how long", "how much time", "duration", "take", "include", "tell me about", "what is", "what's", "what are", "involve", "fee", "cost", "price", "charge", "rate", "fees")) {
    intent = "service_detail"; confidence = 0.95;
  } else if (has(t,
    "what services", "services do you", "what services do you offer", "what do you offer", "what do you do", "list of services", "what treatments",
    "what doctor", "what doctors", "which doctor", "which doctors", "kind of doctor", "kinds of doctor", "type of doctor", "types of doctor",
    "doctor available", "doctors available", "doctor is available", "doctors are available", "doctor list", "doctors list", "list of doctors", "list of doctor",
    "who are your doctors", "who is the doctor", "who are the doctors", "available doctors", "available doctor", "who is available", "who are available",
    "specialist available", "specialists available", "what specialist", "which specialist", "what specialists", "which specialists",
    "specialties", "specialities", "departments", "which departments", "what departments", "clinic list", "clinics",
    "which dermatologist", "all dermatologist", "all dermatologists", "any dermatologist", "dermatologist available", "dermatologist is available",
    "pediatrician available", "cardiologist available", "gynecologist available", "urologist available",
    "show me all", "shoe me all", "tell me which",
    "other doctor", "other doc", "another doctor", "another doc", "any other doctor", "is any other doctor", "is any doctor", "any doctor available",
    "other then", "other than", "someone else", "different doctor",
    "consultation available", "consultations available", "available for consultation", "consultation is available", "any consultation", "which data is available",
    "consultant available", "consultants available",
    "kon se doctor", "doctor kon kon se", "doctors ki list"
  )) {
    intent = "services_info"; confidence = 0.95;
  } else if (has(t, "how much", "how-much", "cost", "price", "pricing", "charge", "fee", "expensive")) {
    intent = "pricing_info"; confidence = 0.85;
  } else if (has(t, "hours", "what time do you", "when are you open", "when do you open", "when do you close", "are you open", "open on", "open this", "open 24", "24 hours", "24/7", "open at night", "open late")) {
    intent = "hours_info"; confidence = 0.9;
  } else if (has(t, "where are you", "address", "located", "location", "directions", "parking", "park")) {
    intent = "location_info"; confidence = 0.85;
  } else if (has(t, "cancel", "cancellation", "refund", "policy", "policies", "insurance", "payment", "pay")) {
    // "cancel my appointment" was already routed above; this is policy info.
    intent = "policy_info"; confidence = 0.8;
  } else if (svc && has(t, "price", "cost")) {
    intent = "pricing_info"; confidence = 0.8;
  } else if (has(t, "kid", "child", "anxious", "anxiety", "nervous", "scared", "first visit", "new patient", "toothache", "pain", "broken tooth", "knocked")
             || (has(t, "emergency", "emergencies") && !has(t, "appointment", "book", "schedul", "availab", "opening"))) {
    intent = "faq"; confidence = 0.7;
  }

  // --- booking / availability (after info intents) ---
  if (intent === "unknown") {
    const bookingWords = has(t, "book", "schedule", "reserve", "slot", "appointment", "set up", "set me up", "sign me up", "make an appointment");
    const availWords = has(t, "availab", "opening", "any time", "free", "openings") && !has(t, "hours");
    const askingAvailability = availWords
      || (has(t, "do you have") && (entities.date || has(t, "tomorrow", "today", "week", "friday", "monday", "saturday", "sunday")));
    if (askingAvailability) {
      intent = "availability_check"; confidence = 0.8;
    } else if (bookingWords && !has(t, "cancel")) {
      intent = "book_appointment"; confidence = 0.85;
    }
  }

  // --- conversational ---
  if (intent === "unknown") {
    // Only a *standalone* greeting counts — "Hi, I need a cleaning" is a request.
    if (/^(hi|hey|hello|good morning|good afternoon|good evening|howdy)[!.,\s]*$/.test(t.trim())) { intent = "greeting"; confidence = 0.95; }
    else if (has(t, "thank", "thanks", "thx", "appreciated")) { intent = "smalltalk"; confidence = 0.9; }
    else if (has(t, "bye", "goodbye", "see you", "have a good", "good night")) { intent = "goodbye"; confidence = 0.9; }
    else if (has(t, "who are you", "your name", "what can you do", "help")) { intent = "faq"; confidence = 0.6; }
    else if (t.trim().length < 3) { intent = "unknown"; confidence = 0.2; }
  }

  // Bare service/date mention with booking-adjacent context nudges to booking.
  if (intent === "unknown" && (svc || date) && has(t, "need", "want", "looking for", "get a", "get my")) {
    intent = "book_appointment"; confidence = 0.6;
  }

  // Question-shaped but unrecognized → let the knowledge base try.
  if (intent === "unknown" && /^(do|does|is|are|can|could|would|will|what|whats|what's|where|when|why|how|which|who|have|has)\b/.test(t.trim())) {
    intent = "faq"; confidence = 0.55;
  }

  return { intent, entities, confidence };
}

/** When a flow is awaiting an answer, map the reply to the right intent. */
function classifyFlowContinuation(t: string, e: Entities, awaiting: string): Intent | null {
  switch (awaiting) {
    case "service":
      if (/what|when|which|how much|fee|cost|price|time|timing|timings|hour|hours|schedule|where|days|who/i.test(t)) {
        return null; // Route to informational handlers
      }
      return e.service_id ? "provide_details" : null;
    case "date":
      if (/what|when|which|how much|fee|cost|price|time|timing|timings|hour|hours|schedule|where|days|who/i.test(t) && !e.date) {
        return null; // Route to informational handlers
      }
      return e.date ? "provide_details" : null;
    case "time":
      return e.time !== undefined || e.slotIndex !== undefined || e.timePref ? "provide_details" : null;
    case "name":
      return e.name ? "provide_details" : null;
    case "phone":
      return e.phone ? "provide_details" : null;
    case "email":
      return e.email ? "provide_details" : null;
    case "confirm_book":
    case "confirm_cancel":
    case "confirm_reschedule":
      return e.confirmed || e.declined ? "provide_details" : null;
    case "which_appointment":
      return e.appointmentRef || e.slotIndex !== undefined || e.date ? "provide_details" : null;
    case "new_datetime":
      return e.date || e.time ? "provide_details" : null;
    default:
      return null;
  }
}
