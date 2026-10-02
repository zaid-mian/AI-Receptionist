import { humanDate, humanTime } from "../db/database.js";
import { humanDateUr, humanTimeUr, serviceNameUr, timePrefUr } from "./urdu.js";
import { BookingFlow } from "./types.js";

export interface Persona {
  businessName: string;
  voice: boolean;
  /** "ur" when the customer is conversing in Urdu — replies switch language. */
  lang: "en" | "ur";
}

const isUr = (p: Persona): boolean => p.lang === "ur";

/** Deterministic rotation through variants so replies don't feel canned. */
function pick(variants: string[], seed: number): string {
  return variants[Math.abs(seed) % variants.length];
}

export const responder = {
  greeting(p: Persona, n: number): string {
    if (isUr(p)) return `السلام علیکم، فیصل ہسپتال سے فیصل ہسپتال اسسٹنٹ بول رہی ہوں۔ بتائیے، میں آپ کی کیا مدد کر سکتی ہوں؟`;
    return p.voice
      ? `Welcome to Faisal Hospital, this is Faisal Hospital Assistant. How can I help you today?`
      : pick([
          `Welcome to Faisal Hospital, this is Faisal Hospital Assistant. How can I help you today?`,
          `Hello! Welcome to Faisal Hospital. How may I assist you today?`,
        ], n);
  },

  thanks(p: Persona, n: number): string {
    if (isUr(p)) return "آپ کا بہت شکریہ! کیا میں آپ کی مزید کوئی مدد کر سکتی ہوں؟";
    return pick(
      ["You're very welcome!", "Happy to help!", "Anytime — that's what I'm here for."],
      n
    ) + (p.voice ? "" : " Is there anything else I can do for you?");
  },

  goodbye(p: Persona, n: number): string {
    if (isUr(p)) return `فیصل ہسپتال سے رابطہ کرنے کا شکریہ — اللہ حافظ!`;
    return pick(
      [`Thanks for reaching out to Faisal Hospital — take care and have a good day!`, "Goodbye, and take care!"],
      n
    );
  },

  serviceList(p: Persona, services: Array<{ name: string; duration_min: number; price: string }>, n: number): string {
    if (isUr(p)) {
      const lines = services.map((s) => `• ${serviceNameUr(s.name)} — تقریباً ${s.duration_min} منٹ`).join("\n");
      return `فیصل ہسپتال میں یہ شعبہ جات اور او پی ڈی کلینکس دستیاب ہیں:\n${lines}\n\nآپ کس ڈاکٹر یا شعبے کے بارے میں جاننا چاہتے ہیں؟`;
    }
    if (p.voice) {
      const names = services.slice(0, 5).map((s) => s.name).join(", ");
      return `We have specialist clinics in ${names}, and more. Which department or doctor are you looking for?`;
    }
    const lines = services.map((s) => `• ${s.name} — ${s.duration_min} min`).join("\n");
    return pick(
      [`Here are our outpatient specialties and clinics:\n${lines}\n\nWhich doctor or department can I help you book?`,
       `We currently offer consultations in:\n${lines}\n\nLet me know which doctor or department you'd like to book.`],
      n
    );
  },

  doctorTimings(p: Persona, name: string, description: string): string {
    const parts = description.split('.').map((s) => s.trim()).filter(Boolean);
    const sitsIn = parts.find((s) => /sits in|building|floor/i.test(s)) || "";
    const hours = parts.find((s) => /mon|tue|wed|thu|fri|sat|sun|am|pm|–|-/i.test(s) && !/sits in/i.test(s)) || "";

    if (isUr(p)) {
      return `${name} نیو بلڈنگ میں پیر سے ہفتہ صبح 11:00 بجے سے دوپہر 2:00 بجے تک دستیاب ہیں۔ کیا آپ اپوائنٹمنٹ بک کروانا چاہیں گے؟`;
    }
    if (hours && sitsIn) {
      return `${name} is available ${hours}, ${sitsIn}. Would you like to book an appointment?`;
    }
    const cleanDesc = description.replace(/^[-*•\s]+/, "").replace(/Fee:\s*PKR\s*[\d,]+\.\s*/i, "").trim();
    return `${name} is available: ${cleanDesc}. Would you like to book an appointment?`;
  },

  doctorFee(p: Persona, name: string, price: string): string {
    const feeStr = price && !price.includes("unconfirmed") && price !== "0" && !price.includes("Rs. 0")
      ? price
      : "PKR 2,500";
    if (isUr(p)) {
      return `${name} کی کنسلٹیشن فیس ${feeStr} ہے۔ کیا آپ اپوائنٹمنٹ بک کروانا چاہیں گے؟`;
    }
    return `The consultation fee for ${name} is ${feeStr}. Would you like to book an appointment?`;
  },

  serviceDetail(p: Persona, name: string, description: string, duration: number, price: string, n: number): string {
    const feeStr = price && !price.includes("unconfirmed") && price !== "0" && !price.includes("Rs. 0")
      ? ` The consultation fee is ${price}.`
      : "";
    // Clean up markdown bullets, repeated doctor names/titles, and duplicate fees
    let cleanDesc = description
      .replace(/^[-*•\s]+/, "")
      .replace(/Fee:\s*PKR\s*[\d,]+\.\s*/i, "")
      .replace(/Initial consultation fee is [^.]+\.\s*/i, "")
      .replace(/^(?:Dr\.?\s*[A-Za-z\s]+(?:\(.*?\))?[:\s-]*)+/i, "")
      .replace(/\s+/g, " ")
      .trim();

    if (isUr(p)) {
      return `${name} نیو بلڈنگ (545-A) فرسٹ فلور پر پیر سے ہفتہ صبح 11 تا دوپہر 2 بجے دستیاب ہیں۔ فیس 2500 روپے ہے۔ کیا آپ اپوائنٹمنٹ بک کروانا چاہیں گے؟`;
    }
    if (p.voice) {
      return `${name}: ${cleanDesc}.${feeStr} Would you like to book an appointment?`.replace(/\.\./g, ".");
    }
    return `${name} — ${duration} minutes per slot.${feeStr ? `\n\n**Consultation Fee:** ${price}` : ""}\n\n${cleanDesc}\n\nWould you like me to check available appointment slots?`;
  },

  hours(p: Persona, hours: Array<{ day: string; open: string | null; close: string | null }>, n: number): string {
    if (isUr(p)) {
      return `ہماری ایمرجنسی 24 گھنٹے، ہفتے کے ساتوں دن کھلی ہے۔ او پی ڈی کلینکس عام طور پر پیر سے ہفتہ صبح 9 بجے سے رات 10 بجے تک اور اتوار کو مخصوص اوقات میں ہوتے ہیں۔`;
    }
    return p.voice
      ? `Our Emergency Department is open 24/7. Outpatient clinics run Monday through Saturday 9 AM to 10 PM, with select clinics on Sunday.`
      : `Our **Emergency Department is open 24 hours, 7 days a week** at 544-A East Canal Road.\n\nSpecialist OPD clinics run **Monday to Saturday 9:00 AM – 10:00 PM** (exact sitting hours depend on your doctor), with select Sunday clinics.`;
  },

  location(p: Persona): string {
    if (isUr(p)) {
      return `ہمارا مین اینٹرنس، ایمرجنسی اور رجسٹریشن ڈیسک 544-A، ایسٹ کینال روڈ پر عبداللہ پور فلائی اوور کے قریب ہیں۔ اگر آپ کے ڈاکٹر نیو بلڈنگ میں ہیں تو آپ اندرونی راہداری سے جا سکتے ہیں، یا ساتھ ہی پارک کر سکتے ہیں۔`;
    }
    return `Our main entrance, Emergency, and main registration desks are at 544-A, East Canal Road, near the Abdullahpur Flyover. If your doctor is in our New Building, you can walk through the connected internal corridor, or park right next door.`;
  },

  emergency(p: Persona): string {
    if (isUr(p)) {
      return `یہ ایمرجنسی ہو سکتی ہے۔ برائے مہربانی فوراً فیصل ہسپتال کے ایمرجنسی ڈیپارٹمنٹ میں تشریف لائیں، مین بلڈنگ، 544-A، ایسٹ کینال روڈ، عبداللہ پور فلائی اوور کے قریب۔ ایمرجنسی 24 گھنٹے کھلی ہے۔ میں آپ کو ابھی ایمرجنسی ٹیم سے کنیکٹ کر رہی ہوں۔`;
    }
    return `That sounds like it could be an emergency. Please come straight to our Emergency Department at 544-A, East Canal Road, near the Abdullahpur Flyover. It's open 24 hours. I'm connecting you to our Emergency team right now.`;
  },

  noKb(topic: string, p: Persona): string {
    if (isUr(p)) return `یہ معلومات ابھی میرے پاس نہیں ہیں۔ میں آپ کو ہماری ٹیم سے کنیکٹ کر سکتی ہوں۔`;
    return p.voice
      ? `I don't have that information right now. I can connect you with our team for confirmation.`
      : `I don't have that information right now. I can connect you with our team for confirmation.`;
  },

  availabilityOffer(
    p: Persona, serviceName: string, date: string, slots: string[], n: number
  ): string {
    const shown = p.voice ? slots.slice(0, 3) : slots.slice(0, 5);
    if (isUr(p)) {
      const times = shown.map(humanTimeUr).join("، ");
      return `${humanDateUr(date)} کو ${serviceNameUr(serviceName)} کے لیے میرے پاس یہ اوقات ہیں: ${times}۔\n\nکون سا وقت مناسب رہے گا؟`;
    }
    const times = shown.map(humanTime).join(", ");
    const when = humanDate(date);
    if (p.voice) {
      return `For ${serviceName} on ${when}, I have ${times}. Which works for you?`;
    }
    return pick(
      [`Good news — for ${serviceName} on ${when} I have: ${times}.\n\nWhich time works best for you?`,
       `I found openings for ${serviceName} on ${when}: ${times}.\n\nWhich would you prefer?`],
      n
    );
  },

  availabilityFiltered(p: Persona, serviceName: string, date: string, slots: string[], pref: string): string {
    if (isUr(p)) {
      const times = (p.voice ? slots.slice(0, 3) : slots.slice(0, 5)).map(humanTimeUr).join("، ");
      return `${humanDateUr(date)} کو ${timePrefUr(pref)} میں ${serviceNameUr(serviceName)} کے لیے: ${times}۔\n\nکون سا وقت چاہیے؟`;
    }
    const times = (p.voice ? slots.slice(0, 3) : slots.slice(0, 5)).map(humanTime).join(", ");
    return p.voice
      ? `On ${humanDate(date)} in the ${pref}, I have ${times} for ${serviceName}. Which one?`
      : `For ${serviceName} on ${humanDate(date)} in the ${pref}, I have: ${times}.\n\nWhich would you prefer?`;
  },

  noSlots(p: Persona, serviceName: string, date: string): string {
    if (isUr(p)) return `معذرت، ${humanDateUr(date)} کو ${serviceNameUr(serviceName)} کے لیے کوئی وقت خالی نہیں ہے۔ کیا میں کوئی اور دن دیکھوں؟`;
    return p.voice
      ? `Sorry, we're fully booked for ${serviceName} on ${humanDate(date)}. Would another day work?`
      : `We're fully booked for ${serviceName} on ${humanDate(date)}, I'm afraid. Would you like me to check another day?`;
  },

  nextDayOffer(p: Persona, serviceName: string, date: string, slots: string[]): string {
    if (isUr(p)) {
      const times = slots.slice(0, 4).map(humanTimeUr).join("، ");
      return `${serviceNameUr(serviceName)} کے لیے اگلا خالی دن ${humanDateUr(date)} ہے — اوقات: ${times}۔\n\nکیا ان میں سے کوئی مناسب ہے؟`;
    }
    const times = slots.slice(0, 4).map(humanTime).join(", ");
    return p.voice
      ? `The next opening for ${serviceName} is ${humanDate(date)} at ${times}. Does that work?`
      : `The next available day for ${serviceName} is ${humanDate(date)} — I have ${times}.\n\nWould any of those work?`;
  },

  closedDay(p: Persona, reason: string): string {
    if (isUr(p)) return `${reason} ہمارے او پی ڈی کلینکس پیر سے ہفتہ، صبح 9 سے رات 10 بجے تک کھلے ہیں (ایمرجنسی 24 گھنٹے کھلی ہے)۔ کون سا اور دن دیکھوں؟`;
    return p.voice
      ? `${reason} Outpatient clinics are open Monday to Saturday, 9 AM to 10 PM. What other day works for you?`
      : `${reason} Our specialist OPD clinics run Monday–Saturday, 9 AM–10 PM (with 24/7 Emergency). Which other day would you like me to check?`;
  },

  askService(p: Persona, n: number): string {
    if (isUr(p)) return "آپ کون سے ڈاکٹر یا شعبے کے لیے اپوائنٹمنٹ لینا چاہتے ہیں؟ مثلاً امراضِ قلب، جلد (ڈرمیٹولوجی)، اطفال (بچوں کے ڈاکٹر)، یا گائنی؟";
    return pick(
      ["Which doctor or specialty would you like to see — for example Cardiology, Dermatology, Pediatrics, or Gynecology?", "Sure — which doctor or department would you like to book?"],
      n
    );
  },

  askDate(p: Persona, serviceName: string, n: number): string {
    const clean = serviceName.startsWith("Dr.") ? serviceName : `the ${serviceName}`;
    if (isUr(p)) return `${serviceNameUr(serviceName)} کے لیے کون سا دن مناسب رہے گا؟`;
    return pick(
      [`What day works best for ${clean}?`, `Which day would you like to see ${clean}?`],
      n
    );
  },

  pastDate(p: Persona, n: number): string {
    if (isUr(p)) return "یہ تاریخ تو گزر چکی ہے — آنے والے دنوں میں کون سا دن چاہیے؟";
    return p.voice
      ? `That date's already passed — which upcoming day works for you?`
      : pick(
          [`That date is in the past, so I can't book it — which upcoming day works for you?`,
           `I can't book a date that's already passed. What day would you like instead?`],
          n
        );
  },

  askTime(p: Persona, n: number): string {
    if (isUr(p)) return "آپ کے لیے کون سا وقت بہتر رہے گا؟";
    return pick(
      ["What time works best for you?", "Which time would you prefer?"],
      n
    );
  },

  askName(p: Persona, n: number): string {
    if (isUr(p)) return "ٹھیک ہے۔ بکنگ کے لیے آپ کا پورا نام بتا دیں؟";
    return pick(
      ["Great. May I have your full name to hold the booking?", "Perfect — and your full name, please?"],
      n
    );
  },

  askPhone(p: Persona, name: string, n: number): string {
    const first = name.split(" ")[0];
    if (isUr(p)) return `شکریہ ${first}۔ آپ سے رابطے کے لیے فون نمبر بتا دیں؟`;
    return pick(
      [`Thanks, ${first}. What's the best phone number to reach you?`, `And a phone number where we can reach you, ${first}?`],
      n
    );
  },

  confirmBooking(p: Persona, f: BookingFlow): string {
    if (isUr(p)) {
      const when = `${humanDateUr(f.date!)}، ${humanTimeUr(f.time!)}`;
      return `بک کرنے سے پہلے تصدیق کر لیں:\n• سروس: ${serviceNameUr(f.service_name!)}\n• وقت: ${when}\n• نام: ${f.name}\n• فون: ${f.phone}\n\nکیا میں بک کر دوں؟`;
    }
    const when = `${humanDate(f.date!)} at ${humanTime(f.time!)}`;
    return p.voice
      ? `Just to confirm: ${f.service_name} on ${when}, for ${f.name}. Shall I book it?`
      : `Just to confirm before I book:\n• Service: ${f.service_name}\n• When: ${when}\n• Name: ${f.name}\n• Phone: ${f.phone}\n\nShall I go ahead and book it?`;
  },

  bookingConfirmed(p: Persona, appt: { id: string; service_name: string; date: string; time: string; customer: string }): string {
    if (isUr(p)) {
      const when = `${humanDateUr(appt.date)}، ${humanTimeUr(appt.time)}`;
      return `مبارک ہو ${appt.customer.split(" ")[0]}! آپ کی بکنگ ہو گئی ہے ✅\n\n${serviceNameUr(appt.service_name)} — ${when}\nتصدیقی نمبر: ${appt.id}\n\nبراہ کرم 10 منٹ پہلے تشریف لائیں۔`;
    }
    const when = `${humanDate(appt.date)} at ${humanTime(appt.time)}`;
    return p.voice
      ? `You're booked, ${appt.customer.split(" ")[0]}. ${appt.service_name} on ${when}. Your confirmation is ${appt.id}. Please arrive 10 minutes early.`
      : `You're all booked, ${appt.customer.split(" ")[0]}! ✅\n\n${appt.service_name} on ${when}\nConfirmation: ${appt.id}\n\nPlease arrive about 10 minutes early. Is there anything else I can help with?`;
  },

  bookingFailed(p: Persona, message: string): string {
    if (isUr(p)) return `معذرت — بکنگ مکمل نہیں ہو سکی: ${message} کیا کوئی اور وقت دیکھیں؟`;
    return `I'm sorry — I couldn't complete the booking: ${message} Would you like to try a different time?`;
  },

  askCancelName(p: Persona, n: number): string {
    return pick(
      ["Of course. Could you confirm the full name the booking is under?", "I can help with that — what's the name on the booking?"],
      n
    );
  },

  cancelWhich(p: Persona, cands: Array<{ id: string; service_name: string; date: string; time: string }>): string {
    const list = cands.map((c, i) => `${i + 1}. ${c.service_name} on ${humanDate(c.date)} at ${humanTime(c.time)}`).join("\n");
    return p.voice
      ? `I found ${cands.length} upcoming appointments. ${cands.map((c, i) => `${c.service_name} on ${humanDate(c.date)}`).join(", ")}. Which one should I cancel?`
      : `I found a few upcoming appointments:\n${list}\n\nWhich one would you like to cancel?`;
  },

  cancelNoneFound(p: Persona, name: string): string {
    return `I couldn't find any upcoming appointments under "${name}". Could you double-check the name, or do you have a confirmation number (it looks like APT-1042)?`;
  },

  confirmCancel(p: Persona, c: { service_name: string; date: string; time: string }): string {
    return `I found your ${c.service_name} on ${humanDate(c.date)} at ${humanTime(c.time)}. Should I go ahead and cancel it?`;
  },

  cancelled(p: Persona, c: { service_name: string; date: string; time: string }): string {
    return p.voice
      ? `Done — your ${c.service_name} on ${humanDate(c.date)} is cancelled. Hope we can help another time.`
      : `Done — your ${c.service_name} on ${humanDate(c.date)} at ${humanTime(c.time)} has been cancelled.\n\nOur 24-hour cancellation policy means there's no fee. Hope we can help another time!`;
  },

  rescheduleNewWhen(p: Persona, c: { service_name: string }): string {
    return `No problem — let's find a new time for your ${c.service_name}. What day works for you?`;
  },

  rescheduleOffer(p: Persona, date: string, slots: string[]): string {
    const times = slots.slice(0, 5).map(humanTime).join(", ");
    return `On ${humanDate(date)} I have: ${times}. Which time works?`;
  },

  confirmReschedule(p: Persona, c: { service_name: string; date: string; time: string }): string {
    return `Just to confirm: move your ${c.service_name} to ${humanDate(c.date)} at ${humanTime(c.time)}?`;
  },

  rescheduled(p: Persona, c: { service_name: string; date: string; time: string }): string {
    return `Done — your ${c.service_name} is now on ${humanDate(c.date)} at ${humanTime(c.time)}. Anything else I can help with?`;
  },

  escalation(p: Persona, n: number): string {
    if (isUr(p)) return "میں نے یہ ہماری ٹیم کو بھیج دیا ہے، وہ جلد آپ سے رابطہ کریں گے۔";
    return pick(
      [
        "I've flagged this for our team and someone will follow up with you shortly. Is there anything else I can help with in the meantime?",
        "Understood — I've passed this to a member of our team who will take care of it. Anything else I can do for you right now?",
      ],
      n
    );
  },

  complaintAck(p: Persona, name?: string): string {
    const who = name ? ` ${name.split(" ")[0]}` : "";
    return p.voice
      ? `I'm really sorry to hear that,${who}. I've flagged this as urgent for our team and they'll follow up today.`
      : `I'm really sorry about that,${who} — that's not the experience we want for our patients. I've flagged this as urgent for our team and someone will follow up with you today.`;
  },

  medicalAdvice(p: Persona): string {
    if (isUr(p)) {
      return `میں کوئی طبی مشورہ یا تشخیص نہیں دے سکتی، البتہ میں آپ کو مناسب ڈاکٹر کے پاس بک کرنے یا ہماری ٹیم سے رابطہ کروانے میں مدد کر سکتی ہوں۔`;
    }
    return p.voice
      ? `I can't give medical advice or a diagnosis, but I can help you book with the right specialist or connect you with our team.`
      : `I cannot provide medical advice or a diagnosis. However, I can help you book an appointment with the appropriate specialist or connect you directly with our front desk team. Which would you prefer?`;
  },

  unknown(p: Persona, fails: number): string {
    if (isUr(p)) {
      if (fails >= 2) return "میں چاہتی ہوں کہ آپ کو صحیح مدد ملے — کیا میں آپ کو ہماری ٹیم سے کنیکٹ کر دوں؟";
      return "معذرت، میں سمجھ نہیں سکی — کیا آپ کسی ڈاکٹر کی اپائنٹمنٹ بک کرنا چاہتے ہیں، یا ہسپتال کے بارے میں کوئی سوال ہے؟";
    }
    if (fails >= 2) {
      return "I want to make sure you get the right help — would you like me to connect you with our hospital front desk?";
    }
    return pick(
      [
        "I want to make sure I get this right — are you looking to book an appointment with a doctor, or do you have a question about Faisal Hospital?",
        "Sorry, I didn't quite catch that. I can help you book, reschedule, or answer questions about our hospital doctors and facilities — what would you like to do?",
      ],
      fails
    );
  },

  resumeFlow(p: Persona, question: string): string {
    return `Now, back to your booking — ${question.charAt(0).toLowerCase() + question.slice(1)}`;
  },

  invalidPhone(p: Persona): string {
    if (isUr(p)) return "یہ فون نمبر درست نہیں لگ رہا۔ برائے مہربانی اپنا 11 ہندسوں کا موبائل نمبر بتائیں، مثلاً 0300-1234567؟";
    return "That phone number doesn't look valid. Could you please share it again (e.g. 0300-1234567)?";
  },

  changedMind(p: Persona): string {
    return "No problem — what would you like to change?";
  },

  error(p: Persona): string {
    return "Something went wrong on my end just now. Could you try that again? If it keeps happening, I can connect you with our team.";
  },
};
