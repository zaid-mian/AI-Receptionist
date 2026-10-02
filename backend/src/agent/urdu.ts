/**
 * Urdu normalization layer — free, deterministic, no API calls.
 *
 * Strategy: map Urdu-script AND Roman-Urdu input onto the English keywords
 * the deterministic NLU already understands, then let the entire tested
 * English pipeline (intents, entities, flows, tools) run unchanged.
 *
 * Example: "مجھے کل 2 بجے دانتوں کی صفائی بک کرنی ہے"
 *       → "مجھے tomorrow at 2 teeth cleaning book کرنی ہے"
 *       → intent=book_appointment, date=tomorrow, time=14:00, service=cleaning
 *
 * Replacements are whole-word / whole-phrase only (space-padded), applied
 * longest-first, so English input is unaffected.
 */

const DIGITS: Record<string, string> = {
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
};

// [source phrase, english equivalent] — applied longest-first.
const PHRASES: Array<[string, string]> = [
  // --- greetings / politeness ---
  ["السلام علیکم", "hello"],
  ["آداب", "hello"],
  ["شکریہ", "thanks"],
  ["مہربانی", "thanks"],
  ["assalam o alaikum", "hello"],
  ["salam", "hello"],
  ["shukriya", "thanks"],
  // --- dates ---
  ["پرسوں", "day after tomorrow"],
  // NOTE: "کل"/"kal" handled specially below — it means yesterday OR tomorrow
  // depending on tense.
  ["آج", "today"],
  ["parson", "day after tomorrow"],
  ["aaj", "today"],
  // --- weekdays ---
  ["جمعرات", "thursday"],
  ["اتوار", "sunday"],
  ["منگل", "tuesday"],
  ["جمعہ", "friday"],
  ["ہفتہ", "saturday"],
  ["پیر", "monday"],
  ["بدھ", "wednesday"],
  ["jumerat", "thursday"],
  ["jumeraat", "thursday"],
  ["itwaar", "sunday"],
  ["itwar", "sunday"],
  ["mangal", "tuesday"],
  ["jumma", "friday"],
  ["juma", "friday"],
  ["hafta", "saturday"],
  ["peer", "monday"],
  ["budh", "wednesday"],
  // --- time of day ---
  ["سہ پہر", "afternoon"],
  ["دوپہر", "afternoon"],
  ["صبح", "morning"],
  ["شام", "evening"],
  ["seh pehar", "afternoon"],
  ["dopahar", "afternoon"],
  ["dopehar", "afternoon"],
  ["subah", "morning"],
  ["subha", "morning"],
  ["shaam", "evening"],
  ["sham", "evening"],
  // --- services & hospital departments ---
  ["یورولوجی", "urology"],
  ["دل کے ڈاکٹر", "cardiology"],
  ["امراض قلب", "cardiology"],
  ["امراض جلد", "dermatology"],
  ["جلد کے ڈاکٹر", "dermatology"],
  ["ہڈیوں کے ڈاکٹر", "orthopedics"],
  ["ہڈیاں", "orthopedics"],
  ["بچوں کے ڈاکٹر", "pediatrics"],
  ["بچوں کی بیماری", "pediatrics"],
  ["خواتین کے ڈاکٹر", "gynecology"],
  ["امراض نسواں", "gynecology"],
  ["جنرل سرجری", "general surgery"],
  ["سرجن", "surgeon"],
  ["پھیپھڑوں کے ڈاکٹر", "pulmonology"],
  ["سانس کے ڈاکٹر", "pulmonology"],
  ["دماغ کے ڈاکٹر", "neurology"],
  ["نیورولوجی", "neurology"],
  ["ایمرجنسی", "emergency"],
  ["ہنگامی", "emergency"],
  ["مشاورت", "consultation"],
  ["چیک اپ", "checkup"],
  ["معائنہ", "checkup"],
  // --- red flags (emergency) ---
  ["چھاتی میں درد", "chest pain"],
  ["سینے میں درد", "chest pain"],
  ["سانس میں دشواری", "difficulty breathing"],
  ["سانس پھولنا", "difficulty breathing"],
  ["خون بہہ رہا", "severe bleeding"],
  ["بے ہوش", "unconscious"],
  ["بے ہوشی", "unconscious"],
  ["فالج", "stroke"],
  ["جھٹکے", "seizures"],
  ["حادثہ", "trauma accident"],
  ["زہر", "poison"],
  ["خودکشی", "suicide"],
  ["seene mein dard", "chest pain"],
  ["chhati mein dard", "chest pain"],
  ["saans mein dushwari", "difficulty breathing"],
  ["saans phoolna", "difficulty breathing"],
  ["khoon beh raha", "severe bleeding"],
  ["behosh", "unconscious"],
  ["behoshi", "unconscious"],
  ["falij", "stroke"],
  ["jhatke", "seizures"],
  ["hadsa", "trauma accident"],
  ["zehar", "poison"],
  ["khudkushi", "suicide"],
  ["urology", "urology"],
  ["cardiology", "cardiology"],
  ["dermatology", "dermatology"],
  ["orthopedic", "orthopedics"],
  ["pediatrics", "pediatrics"],
  ["gynecology", "gynecology"],
  ["pulmonology", "pulmonology"],
  ["neurology", "neurology"],
  // --- booking verbs ---
  ["بک کرو", "book"],
  ["بک کرنا", "book"],
  ["اپائنٹمنٹ", "appointment"],
  ["ملاقات", "appointment"],
  ["بک", "book"],
  ["وقت", "time"],
  ["ٹائم", "time"],
  ["book karna", "book"],
  ["book karo", "book"],
  ["mulaqat", "appointment"],
  ["waqt", "time"],
  // --- manage existing bookings ---
  ["دوبارہ شیڈول", "reschedule"],
  ["منسوخ", "cancel"],
  ["کینسل", "cancel"],
  ["تبدیل", "reschedule"],
  ["mansookh", "cancel"],
  ["tabdeel", "reschedule"],
  // --- confirmation ---
  ["جی ہاں", "yes"],
  ["ٹھیک ہے", "yes"],
  ["ہاں", "yes"],
  ["جی", "yes"],
  ["نہیں", "no"],
  ["jee haan", "yes"],
  ["theek hai", "yes"],
  ["haan", "yes"],
  ["han", "yes"],
  ["jee", "yes"],
  ["naheen", "no"],
  ["nahin", "no"],
  ["nahi", "no"],
  // --- info ---
  ["ٹائمنگ", "hours"],
  ["اوقات", "hours"],
  ["کھلے", "open"],
  ["بند", "closed"],
  ["قیمت", "price"],
  ["فیس", "fee"],
  ["کہاں", "where"],
  ["پتہ", "address"],
  ["auqaat", "hours"],
  ["timing", "hours"],
  ["khulay", "open"],
  ["band", "closed"],
  ["qeemat", "price"],
  ["keemat", "price"],
  ["kahan", "where"],
  ["pata", "address"],
  // --- availability ---
  ["دستیاب", "available"],
  ["خالی", "available"],
  ["کتنے بجے", "what time"],
  ["dastyab", "available"],
  ["khaali", "available"],
  ["khali", "available"],
  ["kitne baje", "what time"],
  ["kab", "when"],
  // --- human handoff ---
  ["نمائندہ", "representative"],
  ["انسان", "human"],
  ["عملہ", "staff"],
  ["numainda", "representative"],
  ["insaan", "human"],
  ["amla", "staff"],
];

const SORTED = [...PHRASES].sort((a, b) => b[0].length - a[0].length);

/** True when the text contains Urdu-script characters. */
export function containsUrdu(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

// Distinctive Roman-Urdu markers (whole-word). Curated to avoid real English
// words ("peer" and "band" are deliberately excluded).
const ROMAN_MARKERS = [
  "aaj", "parson", "dopahar", "dopehar", "subah", "subha", "shaam", "baje",
  "safai", "shukriya", "mulaqat", "theek", "dastyab", "khaali", "khali",
  "auqaat", "qeemat", "keemat", "numainda", "insaan", "mashwarat", "moaina",
  "sufeidi", "jumerat", "jumeraat", "itwaar", "itwar", "mangal", "budh",
  "jumma", "juma", "hafta", "khulay", "waqt", "kitne", "assalam", "adaab",
  "kal", "haan", "jee",
];

/**
 * Language detection for replies: Urdu script, or clearly Roman-Urdu input.
 * Conservative — English is the default.
 */
export function detectUrdu(text: string): boolean {
  if (containsUrdu(text)) return true;
  const padded = ` ${text.toLowerCase()} `;
  return ROMAN_MARKERS.some((m) => padded.includes(` ${m} `));
}

/* ------------------------------------------------------------------ */
/* Urdu display helpers (dates, times, service names for Urdu replies) */
/* ------------------------------------------------------------------ */

const UR_WEEKDAYS = ["اتوار", "پیر", "منگل", "بدھ", "جمعرات", "جمعہ", "ہفتہ"];
const UR_MONTHS = [
  "جنوری", "فروری", "مارچ", "اپریل", "مئی", "جون",
  "جولائی", "اگست", "ستمبر", "اکتوبر", "نومبر", "دسمبر",
];

const UR_SERVICES: Record<string, string> = {
  "General Consultation": "جنرل مشاورت",
  "Urology Consultation": "یورولوجی مشاورت",
  "Gynecology & Obstetrics": "امراض نسواں و زچگی",
  "Pediatrics & Child Care": "امراض اطفال (بچے)",
  "Orthopedic Surgery": "امراض ہڈی و جوڑ",
  "Dermatology & Skin Care": "امراض جلد (سکن)",
  "General & Laparoscopic Surgery": "جنرل و لیپروسکوپک سرجری",
  "Neurology & Neurosurgery": "امراض دماغ و اعصاب",
  "Pulmonology & Chest Medicine": "امراض سینہ و پھیپھڑے",
  "Cardiology Consultation": "امراض قلب (کارڈیالوجی)",
  "Internal Medicine": "انٹرنل میڈیسن",
  "Emergency Consultation": "ایمرجنسی سروسز",
};

const UR_PREF: Record<string, string> = { morning: "صبح", afternoon: "دوپہر", evening: "شام" };

/** "2026-09-24" → "جمعرات، 24 ستمبر" */
export function humanDateUr(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return `${UR_WEEKDAYS[dt.getUTCDay()]}، ${d} ${UR_MONTHS[m - 1]}`;
}

/** "14:00" → "دوپہر 2:00 بجے" */
export function humanTimeUr(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const part = h < 12 ? "صبح" : h < 17 ? "دوپہر" : "شام";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${part} ${h12}:${String(m).padStart(2, "0")} بجے`;
}

export function serviceNameUr(name: string): string {
  return UR_SERVICES[name] ?? name;
}

export function timePrefUr(pref: string): string {
  return UR_PREF[pref] ?? pref;
}

/**
 * Normalize Urdu-script and Roman-Urdu input to English NLU keywords.
 * Safe to run on English text: replacements are whole-word only.
 */
export function normalizeUrduInput(text: string): string {
  let t = text;

  // 1. Urdu / Eastern-Arabic digits → ASCII (also fixes phone numbers).
  t = t.replace(/[۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩]/g, (d) => DIGITS[d] ?? d);

  // 2. Strip diacritics (tashkeel) that speakers sometimes include.
  t = t.replace(/[ً-ٰٖ]/g, "");

  // 3. "N بجے" / "N baje" → "at N" so the time parser's business-hours
  //    heuristic (9–11 AM, 12/1–6 PM) applies correctly.
  t = t.replace(/(\d+)\s*بجے/g, "at $1");
  t = t.replace(/(\d+)\s*baje\b/gi, "at $1");

  // 3b. "کل" / "kal" = yesterday (past tense) or tomorrow (future tense).
  // Booking requests default to future; explicit past markers flip it.
  const lower = t.toLowerCase();
  if (/(^|\s)کل(\s|$)/.test(` ${lower} `)) {
    const past = /تھا|تھی|تھے|آیا|آئی|آئے|چکا|چکی|ہوا|ہوئی|ہوئے/.test(lower);
    t = t.replace(/کل/g, past ? "yesterday" : "tomorrow");
  }
  if (/(^|\s)kal(\s|$)/.test(` ${lower} `)) {
    const past = /\b(tha|thi|the|aaya|aya|ai|aayi|hua|hui|chuka|chuki)\b/.test(lower);
    t = t.replace(/\bkal\b/gi, past ? "yesterday" : "tomorrow");
  }

  // 4. Phrase dictionary, longest-first, whole-word/phrase only.
  let padded = ` ${t.toLowerCase()} `;
  for (const [src, dst] of SORTED) {
    const needle = ` ${src.toLowerCase()} `;
    if (padded.includes(needle)) {
      padded = padded.split(needle).join(` ${dst} `);
    }
  }
  return padded.trim().replace(/\s+/g, " ");
}
