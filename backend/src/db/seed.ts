import { DatabaseSync } from "node:sqlite";
import { config } from "../config.js";
import {
  addDays,
  humanDate,
  newId,
  nowIso,
  todayInTz,
  getDb,
  withTransaction,
} from "./database.js";
import { ingestDocument } from "../rag/ingest.js";
import { syncKnowledgeBase } from "../rag/sync.js";
import { hashPassword } from "../services/auth.js";

/* ------------------------------------------------------------------ */
/* Faisal Hospital Pvt Ltd — Verified Healthcare Dataset               */
/* ------------------------------------------------------------------ */

export const DEPARTMENTS = [
  { id: "dept_derm", name: "Dermatology & Cosmetology", building: "New Building (545-A)", floor: "First Floor", description: "Skin, hair, aesthetic procedures and acne clinics" },
  { id: "dept_peds", name: "Pediatrics & Neonatology", building: "Main Building (544-A)", floor: "Ground Floor", description: "Child health, newborn care, immunizations and nursery" },
  { id: "dept_ortho", name: "Orthopedic Surgery", building: "New Building (545-A)", floor: "Ground Floor", description: "Bone, joint, spine, sports injury and fracture care" },
  { id: "dept_urology", name: "Urology & Stone Center", building: "New Building (545-A)", floor: "Ground Floor", description: "Kidney stones, prostate, lithotripsy, urological surgery" },
  { id: "dept_gyn", name: "Gynecology & Obstetrics", building: "Main Building (544-A)", floor: "First Floor", description: "Women's health, maternity, labor, prenatal and antenatal" },
  { id: "dept_surg", name: "General & Laparoscopic Surgery", building: "New Building (545-A)", floor: "First Floor", description: "Advanced laparoscopic, gallbladder, hernia and trauma surgery" },
  { id: "dept_neuro", name: "Neurology & Neurosurgery", building: "New Building (545-A)", floor: "Second Floor", description: "Brain, spine, stroke, laser spine surgery and headache clinic" },
  { id: "dept_pulm", name: "Pulmonology & Chest Medicine", building: "Main Building (544-A)", floor: "Ground Floor", description: "Lungs, asthma, tuberculosis, respiratory infections" },
  { id: "dept_cardio", name: "Cardiology", building: "New Building (545-A)", floor: "Ground Floor", description: "Cardiac consultations, ECG, Echocardiography and heart care" },
  { id: "dept_med", name: "Internal & General Medicine", building: "New Building (545-A)", floor: "Ground Floor", description: "General health, fever, diabetes, hypertension and routine checkups" },
];

export const DOCTORS = [
  {
    id: "doc_nadia",
    department_id: "dept_derm",
    name: "Dr. Nadia Ali",
    title: "Consultant Dermatologist & Skin Specialist",
    fee_pkr: 2500,
    room: "Room 102, New Building (545-A), First Floor",
    appointment_mode: "both",
    schedules: [
      { days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], start: "11:00", end: "14:00" },
    ],
  },
  {
    id: "doc_farah",
    department_id: "dept_derm",
    name: "Dr. Farah Khurram",
    title: "Consultant Skin Specialist",
    fee_pkr: 2000,
    room: "Room 104, New Building (545-A), First Floor",
    appointment_mode: "appointment_only",
    schedules: [
      { days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], start: "17:00", end: "20:00" },
    ],
  },
  {
    id: "doc_junaid",
    department_id: "dept_peds",
    name: "Dr. Junaid Ahmed",
    title: "Child Specialist & Consultant Pediatrician",
    fee_pkr: 2000,
    room: "Ground Floor near Nursery, Main Building (544-A)",
    appointment_mode: "both",
    schedules: [
      { days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], start: "18:00", end: "21:00" },
    ],
  },
  {
    id: "doc_aqsa",
    department_id: "dept_peds",
    name: "Dr. Aqsa Rafique",
    title: "Pediatrician & Neonatologist",
    fee_pkr: 2000,
    room: "Ground Floor near Nursery, Main Building (544-A)",
    appointment_mode: "both",
    schedules: [
      { days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], start: "10:00", end: "13:00" },
    ],
  },
  {
    id: "doc_usman",
    department_id: "dept_ortho",
    name: "Dr. Usman Akmal",
    title: "Consultant Orthopedic Surgeon",
    fee_pkr: 2500,
    room: "Ground Floor, New Building (545-A)",
    appointment_mode: "both",
    schedules: [
      { days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], start: "15:00", end: "18:00" },
    ],
  },
  {
    id: "doc_farhan",
    department_id: "dept_ortho",
    name: "Dr. Farhan Sarwar",
    title: "Consultant Orthopedic Surgeon",
    fee_pkr: 2000,
    room: "Ground Floor, New Building (545-A)",
    appointment_mode: "appointment_only",
    schedules: [
      { days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], start: "18:00", end: "20:00" },
    ],
  },
  {
    id: "doc_sohail",
    department_id: "dept_urology",
    name: "Prof. Dr. Muhammad Sohail",
    title: "Professor & Head of Urology",
    fee_pkr: 2500,
    room: "Room 22, Ground Floor, New Building (545-A)",
    appointment_mode: "appointment_only",
    schedules: [
      { days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], start: "20:00", end: "22:00" },
    ],
  },
  {
    id: "doc_zahid",
    department_id: "dept_urology",
    name: "Dr. Zahid Iqbal",
    title: "Consultant Urologist",
    fee_pkr: 2000,
    room: "Ground Floor, New Building (545-A)",
    appointment_mode: "both",
    schedules: [
      { days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], start: "11:00", end: "14:00" },
    ],
  },
  {
    id: "doc_akram",
    department_id: "dept_urology",
    name: "Dr. Akram Malik",
    title: "Consultant Urologist",
    fee_pkr: 2000,
    room: "Ground Floor, New Building (545-A)",
    appointment_mode: "both",
    schedules: [
      { days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], start: "17:00", end: "20:00" },
    ],
  },
  {
    id: "doc_abida",
    department_id: "dept_gyn",
    name: "Dr. Abida Javaid Awan",
    title: "Consultant Gynecologist & Obstetrician",
    fee_pkr: 2500,
    room: "First Floor, Main Building (544-A)",
    appointment_mode: "both",
    schedules: [
      { days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], start: "10:30", end: "14:00" },
      { days: ["Sunday"], start: "10:00", end: "14:00" },
    ],
  },
  {
    id: "doc_rizwana",
    department_id: "dept_gyn",
    name: "Dr. Rizwana Rizvi",
    title: "Consultant Gynecologist",
    fee_pkr: 2000,
    room: "First Floor, Main Building (544-A)",
    appointment_mode: "appointment_only",
    schedules: [
      { days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], start: "11:00", end: "12:30" },
      { days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], start: "17:00", end: "19:30" },
    ],
  },
  {
    id: "doc_farooq",
    department_id: "dept_surg",
    name: "Dr. Farooq Ahmad",
    title: "Consultant General & Laparoscopic Surgeon",
    fee_pkr: 2500,
    room: "First Floor, New Building (545-A)",
    appointment_mode: "both",
    schedules: [
      { days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], start: "14:00", end: "17:00" },
      { days: ["Sunday"], start: "11:00", end: "14:00" },
    ],
  },
  {
    id: "doc_abdullah",
    department_id: "dept_surg",
    name: "Dr. Abdullah Saeed",
    title: "Consultant Surgeon",
    fee_pkr: 2000,
    room: "First Floor, New Building (545-A)",
    appointment_mode: "both",
    schedules: [
      { days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], start: "18:00", end: "21:00" },
      { days: ["Sunday"], start: "19:00", end: "22:00" },
    ],
  },
  {
    id: "doc_bilal_w",
    department_id: "dept_neuro",
    name: "Dr. Muhammad Bilal Waheed",
    title: "Consultant Neurologist",
    fee_pkr: 2500,
    room: "Second Floor, New Building (545-A)",
    appointment_mode: "appointment_only",
    schedules: [
      { days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], start: "16:00", end: "19:30" },
    ],
  },
  {
    id: "doc_nazar",
    department_id: "dept_neuro",
    name: "Prof. Nazar Hussain",
    title: "Professor of Neurosurgery & Laser Spine Surgery",
    fee_pkr: 2500,
    room: "Second Floor, New Building (545-A)",
    appointment_mode: "appointment_only",
    schedules: [
      { days: ["Tuesday", "Thursday", "Friday"], start: "17:00", end: "20:00" },
    ],
  },
  {
    id: "doc_bilal_h",
    department_id: "dept_pulm",
    name: "Dr. Syed Bilal Hafeez",
    title: "Consultant Pulmonologist & Chest Specialist",
    fee_pkr: 2000,
    room: "Ground Floor, Main Building (544-A)",
    appointment_mode: "both",
    schedules: [
      { days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], start: "18:00", end: "21:00" },
    ],
  },
  {
    id: "doc_shakeel",
    department_id: "dept_cardio",
    name: "Dr. Shakeel Ahmad",
    title: "Consultant Cardiologist",
    fee_pkr: 2500,
    room: "New Building (545-A)",
    appointment_mode: "both",
    schedules: [
      { days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], start: "17:00", end: "20:00" },
    ],
  },
  {
    id: "doc_munir",
    department_id: "dept_med",
    name: "Dr. Munir Zafar",
    title: "Chief Director & Consultant Physician",
    fee_pkr: 2500,
    room: "New Building (545-A)",
    appointment_mode: "both",
    schedules: [
      { days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], start: "11:00", end: "15:00" },
    ],
  },
];

export const SERVICES = [
  {
    id: "svc_derm_nadia",
    doctor_id: "doc_nadia",
    name: "Dr. Nadia Ali (Dermatology)",
    description: "Dermatologist & Skin Specialist. Sits in New Building (545-A), First Floor. Mon–Sat 11:00 AM – 2:00 PM. Fee: PKR 2,500. Walk-in & appointment.",
    duration_min: 15,
    price_cents: 250000,
    aliases: ["nadia", "dr nadia", "nadia ali", "dermatology", "skin", "acne", "hair specialist", "hair loss", "aesthetic", "zild", "skin specialist"],
  },
  {
    id: "svc_derm_farah",
    doctor_id: "doc_farah",
    name: "Dr. Farah Khurram (Dermatology)",
    description: "Skin Specialist. Sits in New Building (545-A), First Floor. Mon–Fri 5:00 PM – 8:00 PM. Fee: PKR 2,000. Appointment preferred.",
    duration_min: 15,
    price_cents: 200000,
    aliases: ["farah", "dr farah", "farah khurram", "dermatology", "skin specialist", "zild"],
  },
  {
    id: "svc_peds_junaid",
    doctor_id: "doc_junaid",
    name: "Dr. Junaid Ahmed (General Pediatrics)",
    description: "Child Specialist. Sits in Main Building (544-A), Ground Floor near Nursery. Mon–Sat 6:00 PM – 9:00 PM. Fee: PKR 2,000. Appointment preferred.",
    duration_min: 15,
    price_cents: 200000,
    aliases: ["junaid", "dr junaid", "junaid ahmed", "pediatrics", "child specialist", "pediatrician", "bachon ke doctor", "kids"],
  },
  {
    id: "svc_peds_aqsa",
    doctor_id: "doc_aqsa",
    name: "Dr. Aqsa Rafique (Pediatrics & Neonatal)",
    description: "Pediatrician & Neonatologist. Sits in Main Building (544-A), Ground Floor near Nursery. Mon–Sat 10:00 AM – 1:00 PM. Fee: PKR 2,000. Walk-in & appointment.",
    duration_min: 15,
    price_cents: 200000,
    aliases: ["aqsa", "dr aqsa", "aqsa rafique", "pediatrics", "neonatal", "newborn", "bachon ki doctor"],
  },
  {
    id: "svc_ortho_usman",
    doctor_id: "doc_usman",
    name: "Dr. Usman Akmal (Orthopedic Surgery)",
    description: "Orthopedic Surgeon. Sits in New Building (545-A), Ground Floor. Mon–Sat 3:00 PM – 6:00 PM. Fee: PKR 2,500. Walk-in & appointment.",
    duration_min: 15,
    price_cents: 250000,
    aliases: ["usman", "dr usman", "usman akmal", "orthopedic", "bones", "joints", "fracture", "knee pain", "back pain", "haddian", "bone specialist"],
  },
  {
    id: "svc_ortho_farhan",
    doctor_id: "doc_farhan",
    name: "Dr. Farhan Sarwar (Orthopedic Surgery)",
    description: "Consultant Orthopedic Surgeon. Sits in New Building (545-A), Ground Floor. Mon–Fri 6:00 PM – 8:00 PM. Fee: PKR 2,000. Appointment preferred.",
    duration_min: 15,
    price_cents: 200000,
    aliases: ["farhan", "dr farhan", "farhan sarwar", "orthopedic", "bones", "joints", "haddian"],
  },
  {
    id: "svc_urology_sohail",
    doctor_id: "doc_sohail",
    name: "Prof. Dr. Muhammad Sohail (Urology)",
    description: "Professor & Head of Urology. Sits in New Building (545-A), Ground Floor, Room 22. Mon–Fri 8:00 PM – 10:00 PM. Fee: PKR 2,500. Appointment only.",
    duration_min: 15,
    price_cents: 250000,
    aliases: ["sohail", "prof sohail", "dr sohail", "muhammad sohail", "urology", "urologist", "kidney stone", "prostate"],
  },
  {
    id: "svc_urology_zahid",
    doctor_id: "doc_zahid",
    name: "Dr. Zahid Iqbal (Urology)",
    description: "Consultant Urologist. Sits in New Building (545-A), Ground Floor. Mon–Sat 11:00 AM – 2:00 PM. Fee: PKR 2,000. Walk-in & appointment.",
    duration_min: 15,
    price_cents: 200000,
    aliases: ["zahid", "dr zahid", "zahid iqbal", "urology", "kidney stone", "kidney specialist"],
  },
  {
    id: "svc_urology_akram",
    doctor_id: "doc_akram",
    name: "Dr. Akram Malik (Urology)",
    description: "Consultant Urologist. Sits in New Building (545-A), Ground Floor. Mon–Sat 5:00 PM – 8:00 PM. Fee: PKR 2,000. Walk-in & appointment.",
    duration_min: 15,
    price_cents: 200000,
    aliases: ["akram", "dr akram", "akram malik", "urology"],
  },
  {
    id: "svc_gyn_abida",
    doctor_id: "doc_abida",
    name: "Dr. Abida Javaid Awan (Gynecology & Obstetrics)",
    description: "Consultant Gynecologist & Obstetrician. Sits in Main Building (544-A), First Floor. Mon–Sat 10:30 AM – 2:00 PM and Sunday 10:00 AM – 2:00 PM. Fee: PKR 2,500. Walk-in & appointment.",
    duration_min: 15,
    price_cents: 250000,
    aliases: ["abida", "dr abida", "abida javaid", "abida awan", "gynecology", "obstetrics", "pregnancy", "women health", "lady doctor", "khawateen"],
  },
  {
    id: "svc_gyn_rizwana",
    doctor_id: "doc_rizwana",
    name: "Dr. Rizwana Rizvi (Gynecology & Obstetrics)",
    description: "Consultant Gynecologist. Sits in Main Building (544-A), First Floor. Mon–Sat 11:00 AM – 12:30 PM & 5:00 PM – 7:30 PM. Fee: PKR 2,000. Appointment preferred.",
    duration_min: 15,
    price_cents: 200000,
    aliases: ["rizwana", "dr rizwana", "rizwana rizvi", "gynecology", "lady doctor"],
  },
  {
    id: "svc_surg_farooq",
    doctor_id: "doc_farooq",
    name: "Dr. Farooq Ahmad (General & Laparoscopic Surgery)",
    description: "Consultant Surgeon. Sits in New Building (545-A), First Floor. Mon–Sat 2:00 PM – 5:00 PM and Sunday 11:00 AM – 2:00 PM. Fee: PKR 2,500. Walk-in & appointment.",
    duration_min: 15,
    price_cents: 250000,
    aliases: ["farooq", "dr farooq", "farooq ahmad", "general surgery", "laparoscopic surgery", "surgeon", "hernia", "gallbladder"],
  },
  {
    id: "svc_surg_abdullah",
    doctor_id: "doc_abdullah",
    name: "Dr. Abdullah Saeed (General & Laparoscopic Surgery)",
    description: "Consultant Surgeon. Sits in New Building (545-A), First Floor. Mon–Sat 6:00 PM – 9:00 PM and Sunday 7:00 PM – 10:00 PM. Fee: PKR 2,000. Walk-in & appointment.",
    duration_min: 15,
    price_cents: 200000,
    aliases: ["abdullah", "dr abdullah", "abdullah saeed", "general surgery", "surgeon"],
  },
  {
    id: "svc_neuro_bilal",
    doctor_id: "doc_bilal_w",
    name: "Dr. Muhammad Bilal Waheed (Neurology)",
    description: "Consultant Neurologist. Sits in New Building (545-A), Second Floor. Mon–Sat 4:00 PM – 7:30 PM. Fee: PKR 2,500. Appointment only.",
    duration_min: 15,
    price_cents: 250000,
    aliases: ["bilal", "dr bilal", "bilal waheed", "neurology", "neuro", "neurologist", "brain", "headache", "nerve"],
  },
  {
    id: "svc_neuro_nazar",
    doctor_id: "doc_nazar",
    name: "Prof. Nazar Hussain (Neurosurgery & Laser Spine)",
    description: "Professor of Neurosurgery & Laser Spine Surgery. Sits in New Building (545-A), Second Floor. Tue, Thu, Fri 5:00 PM – 8:00 PM. Fee: PKR 2,500. Appointment only.",
    duration_min: 15,
    price_cents: 250000,
    aliases: ["nazar", "prof nazar", "dr nazar", "nazar hussain", "neurosurgery", "spine surgery", "laser spine"],
  },
  {
    id: "svc_pulm_bilal",
    doctor_id: "doc_bilal_h",
    name: "Dr. Syed Bilal Hafeez (Pulmonology & Chest Medicine)",
    description: "Pulmonologist & Chest Specialist. Sits in Main Building (544-A), Ground Floor. Mon–Sat 6:00 PM – 9:00 PM. Fee: PKR 2,000. Walk-in & appointment.",
    duration_min: 15,
    price_cents: 200000,
    aliases: ["syed bilal", "dr bilal hafeez", "bilal hafeez", "pulmonology", "chest", "lungs", "asthma", "cough", "phephre"],
  },
  {
    id: "svc_cardio_shakeel",
    doctor_id: "doc_shakeel",
    name: "Dr. Shakeel Ahmad (Cardiology)",
    description: "Consultant Cardiologist. Sits in New Building (545-A). Fee: PKR 2,500. Cardiology consultation and Echocardiography.",
    duration_min: 15,
    price_cents: 250000,
    aliases: ["shakeel", "dr shakeel", "shakeel ahmad", "cardiology", "heart", "cardiologist", "dil"],
  },
  {
    id: "svc_med_munir",
    doctor_id: "doc_munir",
    name: "Dr. Munir Zafar (Internal & General Medicine)",
    description: "Chief Director & Consultant Physician. Sits in New Building (545-A). Fee: PKR 2,500. General health, fever, diabetes, routine checkup.",
    duration_min: 15,
    price_cents: 250000,
    aliases: ["munir", "dr munir", "munir zafar", "internal medicine", "general medicine", "physician", "general checkup"],
  },
];

const HOURS: Array<[string, string | null, string | null]> = [
  ["Monday", "09:00", "22:00"],
  ["Tuesday", "09:00", "22:00"],
  ["Wednesday", "09:00", "22:00"],
  ["Thursday", "09:00", "22:00"],
  ["Friday", "09:00", "22:00"],
  ["Saturday", "09:00", "22:00"],
  ["Sunday", "10:00", "22:00"],
];

const KB_DOCS: Array<{ id: string; title: string; category: string; content: string }> = [
  {
    id: "kb_identity",
    title: "Faisal Hospital Identity & Contact",
    category: "company",
    content: `# Faisal Hospital Pvt Ltd — Contact & Overview

Official full name: Faisal Hospital Pvt Ltd. Callers and the reception assistant refer to it as "Faisal Hospital".
City: Faisalabad, Pakistan.

Contact Numbers:
- Centralized Helpline (UAN): 111-119-119
- PTCL Landline: +92 41 8542214

Accident & Emergency (A&E) / Casualty is open 24 hours a day, 7 days a week.
Specialist outpatient (OPD) clinics run Monday through Saturday, with selected specialist clinics on Sunday.`,
  },
  {
    id: "kb_location",
    title: "Location, Buildings & Directions",
    category: "company",
    content: `# Location & Campus Layout

Faisal Hospital consists of two adjacent buildings:
- Main (Original) Building: 544-A, East Canal Road (Lower Canal Road East), Block A, People's Colony No. 1, Faisalabad, postal code 36000.
  Main entrance, Emergency Department (24/7), and primary registration desks are here.
- New Building Block: 545-A, East Canal Road, Faisalabad. Houses the Specialist OPD Tower and Advanced Surgical Center.
- Landmark: Right near the Abdullahpur Flyover / Abdullahpur Chowk.
- Connection: The two buildings are joined by an internal corridor. Patients can also park directly next door to the New Building.
- Wheelchair Accessibility: Wheelchair ramps and free wheelchair assistance with trained hospital porters are available at the main entrance of the Main Building (544-A).

Standard direction guide:
"Our main entrance, Emergency, and main registration desks are at 544-A, East Canal Road, near the Abdullahpur Flyover. If your doctor is in our New Building, you can walk through the connected internal corridor, or park right next door."`,
  },
  {
    id: "kb_departments",
    title: "Departments & Facilities",
    category: "services",
    content: `# Hospital Departments & Facilities

Main Building (544-A):
- Accident & Emergency (A&E) / Casualty: Open 24 hours, 7 days. Qualified Emergency Medical Officers (EMOs) and emergency doctors are on-duty around the clock, including late night and at 2:00 AM.
- Main Diagnostic Laboratory & Blood Bank: Open 24 hours, 7 days a week for all routine blood tests, pathology, and emergency laboratory investigations.
- Diagnostic Radiology Center: Digital X-Ray, Ultrasound, CT Scan.
- Faisal Pharmacy (In-house): Ground Floor, Main Building (544-A). Open 24 hours, 7 days a week for all outpatient, inpatient, and late-night emergency prescriptions.
- Wheelchair Assistance & Porters: Dedicated wheelchair assistants and patient porters are stationed at the main entrance of the Main Building (544-A) to assist patients upon arrival. Wheelchairs are provided free of charge.
- Child Vaccination & Immunization Clinic: Located in the Pediatrics Department on the Ground Floor of Main Building (544-A). Open Monday through Saturday from 9:00 AM to 2:00 PM for child vaccinations and newborn immunizations.
- Intensive Care Unit (ICU) and Medical ICU
- Neonatal ICU (NICU) and 24-hour Nursery: Ground Floor near Pediatrics
- Gynecology & Obstetrics Clinics: First Floor
- Pediatrics & Pulmonology Clinics: Ground Floor

New Building Block (545-A):
- Specialist OPD Tower (Consultation Chambers)
- Advanced Surgical Center & Operating Theaters (General Surgery, Urology, Laser Spine Surgery)
- Urology: Ground Floor (Prof. Dr. Muhammad Sohail Room 22, Dr. Zahid Iqbal, Dr. Akram Malik)
- Orthopedic Surgery: Ground Floor (Dr. Usman Akmal, Dr. Farhan Sarwar)
- General & Laparoscopic Surgery: First Floor (Dr. Farooq Ahmad, Dr. Abdullah Saeed)
- Dermatology & Skincare: First Floor (Dr. Nadia Ali, Dr. Farah Khurram)
- Neurology & Neurosurgery: Second Floor (Dr. Muhammad Bilal Waheed, Prof. Nazar Hussain)
- Cardiology & Echocardiography: Dr. Shakeel Ahmad
- Internal & General Medicine: Dr. Munir Zafar
- Corporate Desk (Panel patients & insurance claims)`,
  },
  {
    id: "kb_doctors",
    title: "Doctor Directory & Sitting Schedules",
    category: "services",
    content: `# Doctor Directory & OPD Schedules

All OPD appointment slots are 15 minutes.

Urology — New Building (545-A), Ground Floor:
- Prof. Dr. Muhammad Sohail (Head of Urology): Room 22, Mon–Fri 8:00 PM – 10:00 PM (Appointment only)
- Dr. Zahid Iqbal: Mon–Sat 11:00 AM – 2:00 PM (Walk-in & appointment)
- Dr. Akram Malik: Mon–Sat 5:00 PM – 8:00 PM (Walk-in & appointment)
- Sunday duty specialists: 12:00 PM – 2:00 PM (Walk-in only)

Gynecology & Obstetrics — Main Building (544-A), First Floor:
- Dr. Abida Javaid Awan: Mon–Sat 10:30 AM – 2:00 PM & Sunday 10:00 AM – 2:00 PM (Walk-in & appointment)
- Dr. Rizwana Rizvi: Mon–Sat 11:00 AM – 12:30 PM & 5:00 PM – 7:30 PM (Appointment preferred)
- Dr. Maria Saif: Sunday 12:00 PM – 2:00 PM (Walk-in only)
- Dr. Shafaq Kamran: Sunday on-call 6:00 PM – 11:00 PM (Emergency walk-in)

Pediatrics & Neonatal — Main Building (544-A), Ground Floor:
- Dr. Junaid Ahmed (General Pediatrics): Mon–Sat 6:00 PM – 9:00 PM (Appointment preferred)
- Dr. Aqsa Rafique (Pediatrics & Neonatal): Mon–Sat 10:00 AM – 1:00 PM (Walk-in & appointment)

General & Laparoscopic Surgery — New Building (545-A), First Floor:
- Dr. Farooq Ahmad: Mon–Sat 2:00 PM – 5:00 PM & Sunday 11:00 AM – 2:00 PM (Walk-in & appointment)
- Dr. Abdullah Saeed: Mon–Sat 6:00 PM – 9:00 PM & Sunday 7:00 PM – 10:00 PM (Walk-in & appointment)
- Dr. Samia Imtiaz: Sunday 5:00 PM – 7:00 PM (Walk-in only)

Neurology & Neurosurgery — New Building (545-A), Second Floor:
- Dr. Muhammad Bilal Waheed: Mon–Sat 4:00 PM – 7:30 PM (Appointment only)
- Prof. Nazar Hussain (Neurosurgery & Laser Spine): Tue, Thu, Fri 5:00 PM – 8:00 PM (Appointment only)

Orthopedic Surgery — New Building (545-A), Ground Floor:
- Dr. Usman Akmal: Mon–Sat 3:00 PM – 6:00 PM (Walk-in & appointment)
- Dr. Farhan Sarwar: Mon–Fri 6:00 PM – 8:00 PM (Appointment preferred)

Pulmonology & Chest Medicine — Main Building (544-A), Ground Floor:
- Dr. Syed Bilal Hafeez: Mon–Sat 6:00 PM – 9:00 PM (Walk-in & appointment)
- Dr. Bashir Ahmad: Sunday 10:00 AM – 1:30 PM (Walk-in only)

Dermatology & Aesthetic Skincare — New Building (545-A), First Floor:
- Dr. Nadia Ali: Mon–Sat 11:00 AM – 2:00 PM (Walk-in & appointment)
- Dr. Farah Khurram: Mon–Fri 5:00 PM – 8:00 PM (Appointment preferred)`,
  },
  {
    id: "kb_symptoms",
    title: "Symptom-to-Department Routing Guide",
    category: "policies",
    content: `# Symptom-to-Department Routing Guide (Non-Emergency)

Note: This routing is for guidance only and is not a medical diagnosis.

- Palpitations, blood pressure follow-up, heart concerns -> Cardiology (New Building)
- Cough, breathlessness, asthma, chest infection -> Pulmonology & Chest Medicine (Main Building)
- Skin rashes, acne, hair, aesthetic skincare -> Dermatology (New Building, First Floor)
- Bone, joint, fracture, back or knee pain -> Orthopedic Surgery (New Building, Ground Floor)
- Nerve problems, chronic headaches, spine surgical opinion -> Neurology / Neurosurgery (New Building, Second Floor)
- Urinary issues, kidney stones, prostate -> Urology (New Building, Ground Floor)
- Pregnancy, prenatal, maternal health -> Gynecology & Obstetrics (Main Building, First Floor)
- Children and newborn health -> Pediatrics (Main Building, Ground Floor)
- Hernia, gallbladder, surgical consultation -> General Surgery (New Building, First Floor)
- Fever, diabetes, general illness -> Internal & General Medicine (Dr. Munir Zafar, New Building)`,
  },
  {
    id: "kb_emergency",
    title: "Emergency Protocol & Red-Flag Symptoms",
    category: "policies",
    content: `# Emergency Department & Red-Flag Protocol

Emergency Location: Main Building, 544-A East Canal Road, near Abdullahpur Flyover.
Hours: Open 24 hours, 7 days a week.
Doctor Availability: Qualified Emergency Medical Officers (EMOs) and emergency trauma doctors are present and available on-duty 24 hours a day, 7 days a week, including at 2:00 AM and all night hours.

RED-FLAG EMERGENCY SYMPTOMS:
- Chest pain or acute chest pressure
- Difficulty breathing or severe shortness of breath
- Severe bleeding that will not stop
- Signs of stroke: facial drooping, arm weakness, slurred speech
- Loss of consciousness or unresponsiveness
- Seizures or convulsions
- Severe trauma, road traffic accident, head injury
- Severe pregnancy complications or acute labor signs
- Poisoning, overdose, or severe allergic reaction
- Suicidal intent or immediate risk of self-harm

REQUIRED EMERGENCY ACTION:
1. Advise the patient immediately to proceed straight to the 24/7 Emergency Department at 544-A East Canal Road near Abdullahpur Flyover.
2. Transfer to Emergency staff immediately.
3. If unable to travel safely, advise contacting public emergency services (Rescue 1122).
4. Do not attempt diagnosis, first aid, or medicine instructions.`,
  },
  {
    id: "kb_appointments",
    title: "Appointments & Registration Rules",
    category: "policies",
    content: `# Appointment Rules & Patient Registration

- Appointment duration: Exactly 15 minutes for all doctors.
- Booking type: Each patient receives a specific confirmed appointment time.
- Existing patients: Identified by Medical Record (MR) number or registered mobile phone.
- New patients: Can register by providing Full Name, Phone number, CNIC / B-Form, Age / Date of Birth, Gender, City, Emergency Contact, and Reason for visit.
- Walk-in only doctors: Certain doctors (e.g. Sunday duty urologists, Dr. Maria Saif, Dr. Samia Imtiaz) cannot be booked in advance; patients may walk in during their stated sitting hours.
- Cancellations and rescheduling: Handled through the assistant after identity verification.`,
  },
  {
    id: "kb_fees",
    title: "Doctor Consultation Fees & OPD Charges",
    category: "fees",
    content: `# Doctor Consultation Fees & OPD Charges

- Dr. Nadia Ali (Senior Consultant Dermatologist): Initial consultation fee is PKR 2,500. Follow-up visits within 10 days are PKR 1,500. Sitting hours: Mon–Sat 11:00 AM – 2:00 PM.
- Dr. Farah Khurram (Dermatology): Consultation fee is PKR 2,000. Sitting hours: Mon–Fri 5:00 PM – 8:00 PM.
- Dr. Junaid Ahmed (General Pediatrics): Consultation fee is PKR 2,000. Sitting hours: Mon–Sat 6:00 PM – 9:00 PM.
- Dr. Usman Akmal (Orthopedic Surgery): Consultation fee is PKR 2,500. Sitting hours: Mon–Sat 3:00 PM – 6:00 PM.
- Prof. Dr. Muhammad Sohail (Head of Urology): Consultation fee is PKR 2,500. Sitting hours: Mon–Fri 8:00 PM – 10:00 PM.
- Other Specialist OPD Consultations: Generally PKR 2,000 to PKR 2,500.
- 24/7 Emergency Medical Officer (Initial ER triage/assessment): PKR 1,000.
- Payment is accepted at the OPD registration counters via cash or debit/credit cards.`,
  },
  {
    id: "kb_unconfirmed",
    title: "Unconfirmed Policies & Privacy Fallbacks",
    category: "policies",
    content: `# Unconfirmed Information Policy

The following information has NOT been finalized by hospital administration and must NOT be quoted or estimated by the receptionist:
- Hospital-operated ambulance service details, charges, or response times
- Inpatient admission status or room/bed numbers (never disclosed)
- Insurance panel coverage or corporate refund policies
- Specific visiting hours for ICU, NICU, or General Wards
- Test report details (test results are never read out over phone/chat; patients must collect reports via authorized staff or the patient portal)

Approved fallback statement:
"I don't have that information right now. I can connect you with our team for confirmation."`,
  },
];

/* ------------------------- seed helpers --------------------------- */

function insertService(db: DatabaseSync, s: (typeof SERVICES)[number]) {
  db.prepare(
    `INSERT OR REPLACE INTO services (id, doctor_id, name, description, duration_min, price_cents, currency, aliases, active)
     VALUES (?, ?, ?, ?, ?, ?, 'PKR', ?, 1)`
  ).run(s.id, (s as { doctor_id?: string }).doctor_id ?? null, s.name, s.description, s.duration_min, s.price_cents, JSON.stringify(s.aliases));
}

function seedUsers(db: DatabaseSync) {
  const adminPass = hashPassword(config.adminDefaultPassword);
  db.prepare(
    `INSERT OR REPLACE INTO users (id, email, password_hash, salt, name, role, created_at)
     VALUES (?, ?, ?, ?, ?, 'admin', ?)`
  ).run("usr_admin_1", config.adminEmail.toLowerCase(), adminPass.hash, adminPass.salt, "Faisal Hospital Administrator", nowIso());

  const staffPass = hashPassword("Staff@Faisal2026");
  db.prepare(
    `INSERT OR REPLACE INTO users (id, email, password_hash, salt, name, role, created_at)
     VALUES (?, ?, ?, ?, ?, 'staff', ?)`
  ).run("usr_staff_1", "reception@faisalhospital.pk", staffPass.hash, staffPass.salt, "Front Desk Receptionist", nowIso());
}

function seedClinicalEntities(db: DatabaseSync) {
  const deptStmt = db.prepare(
    `INSERT OR REPLACE INTO departments (id, name, building, floor, description)
     VALUES (?, ?, ?, ?, ?)`
  );
  for (const d of DEPARTMENTS) {
    deptStmt.run(d.id, d.name, d.building, d.floor, d.description);
  }

  const docStmt = db.prepare(
    `INSERT OR REPLACE INTO doctors (id, department_id, name, title, fee_pkr, room, appointment_mode, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
  );
  const schedStmt = db.prepare(
    `INSERT OR REPLACE INTO doctor_schedules (id, doctor_id, day_of_week, start_time, end_time, slot_duration_min, active)
     VALUES (?, ?, ?, ?, ?, ?, 1)`
  );

  for (const doc of DOCTORS) {
    docStmt.run(doc.id, doc.department_id, doc.name, doc.title, doc.fee_pkr, doc.room, doc.appointment_mode);
    for (const sched of doc.schedules) {
      for (const day of sched.days) {
        const schedId = `sch_${doc.id}_${day.slice(0, 3).toLowerCase()}_${sched.start.replace(":", "")}`;
        schedStmt.run(schedId, doc.id, day, sched.start, sched.end, 15);
      }
    }
  }
}

const DEMO_PEOPLE: Array<[string, string, string]> = [
  ["Hamza Malik", "+923001234567", "hamza.malik@example.com"],
  ["Fatima Zahra", "+923219876543", "fatima.z@example.com"],
  ["Muhammad Usman", "+923334567890", "usman.m@example.com"],
  ["Ayesha Noor", "+923015551234", "ayesha.noor@example.com"],
  ["Zainab Bibi", "+923456789012", "zainab.b@example.com"],
  ["Ali Raza", "+923027894561", "ali.raza@example.com"],
  ["Bilal Tariq", "+923123456789", "bilal.t@example.com"],
  ["Maryam Siddiqui", "+923056789123", "maryam.s@example.com"],
  ["Hassan Ahmed", "+923224567891", "hassan.a@example.com"],
  ["Sana Javed", "+923034567892", "sana.javed@example.com"],
];

function nextApptId(db: DatabaseSync): string {
  const row = db.prepare(`SELECT id FROM appointments ORDER BY rowid DESC LIMIT 1`).get() as
    | { id: string }
    | undefined;
  const n = row ? parseInt(row.id.replace("APT-", ""), 10) + 1 : 1041;
  return `APT-${n}`;
}

function seedAppointments(db: DatabaseSync) {
  const today = todayInTz(config.businessTimezone);
  const plan: Array<{ dOff: number; time: string; svc: number; person: number; status: string; channel: string }> = [
    { dOff: 0, time: "11:30", svc: 0, person: 0, status: "confirmed", channel: "chat" }, // Dr. Nadia Ali
    { dOff: 0, time: "15:30", svc: 4, person: 1, status: "confirmed", channel: "voice" }, // Dr. Usman Akmal
    { dOff: 0, time: "18:30", svc: 2, person: 2, status: "confirmed", channel: "chat" }, // Dr. Junaid Ahmed
    { dOff: 1, time: "11:00", svc: 7, person: 3, status: "confirmed", channel: "voice" }, // Dr. Zahid Iqbal
    { dOff: 1, time: "16:00", svc: 13, person: 4, status: "confirmed", channel: "chat" }, // Dr. Bilal Waheed
    { dOff: 2, time: "12:00", svc: 9, person: 5, status: "confirmed", channel: "chat" }, // Dr. Abida Javaid
    { dOff: 2, time: "14:30", svc: 11, person: 6, status: "confirmed", channel: "voice" }, // Dr. Farooq Ahmad
    { dOff: 2, time: "18:15", svc: 15, person: 7, status: "confirmed", channel: "chat" }, // Dr. Syed Bilal Hafeez
    { dOff: 3, time: "20:15", svc: 6, person: 8, status: "confirmed", channel: "chat" }, // Prof. Sohail
    { dOff: -1, time: "11:15", svc: 0, person: 9, status: "completed", channel: "chat" },
  ];
  const insert = db.prepare(
    `INSERT INTO appointments (id, customer_id, customer_name, phone, email, service_id, service_name, date, time, duration_min, status, notes, channel, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?)`
  );
  for (const p of plan) {
    const svc = SERVICES[p.svc];
    const [name, phone, email] = DEMO_PEOPLE[p.person];
    const cid = newId("cus");
    const created = `${addDays(today, Math.min(p.dOff, 0) - 1)}T14:00:00.000Z`;
    db.prepare(`INSERT OR IGNORE INTO customers (id, name, phone, email, created_at) VALUES (?, ?, ?, ?, ?)`).run(
      cid, name, phone, email, created
    );
    insert.run(
      nextApptId(db), cid, name, phone, email, svc.id, svc.name,
      addDays(today, p.dOff), p.time, svc.duration_min, p.status, p.channel, created, created
    );
  }
}

type SeedMsg = { role: "user" | "assistant"; content: string; tools?: string[]; sources?: string[] };

function seedConversations(db: DatabaseSync) {
  const today = todayInTz(config.businessTimezone);
  const convs: Array<{
    person: number; channel: "chat" | "voice"; intent: string; outcome: string; status: string;
    escalated: boolean; dOff: number; t: string; msgs: SeedMsg[];
  }> = [
    {
      person: 0, channel: "chat", intent: "book_appointment", outcome: "booked", status: "resolved",
      escalated: false, dOff: 0, t: "10:02",
      msgs: [
        { role: "user", content: "Hi, I want to book an appointment with Dr. Nadia Ali tomorrow." },
        { role: "assistant", content: `Dr. Nadia Ali sits in our New Building, First Floor, from 11:00 AM to 2:00 PM. Available 15-minute slots for tomorrow (${humanDate(addDays(today, 1))}) include 11:15 AM, 11:45 AM, and 12:15 PM. Which time suits you?`, tools: ["check_availability"] },
        { role: "user", content: "11:45 AM please." },
        { role: "assistant", content: "Great — 11:45 AM. May I have your full name and phone number to confirm the booking?" },
        { role: "user", content: "Hamza Malik, 0300-1234567" },
        { role: "assistant", content: "Just to confirm: Dr. Nadia Ali (Dermatology) on Thursday at 11:45 AM for Hamza Malik (+92 300 1234567). Shall I proceed?", tools: ["collect_customer_information"] },
        { role: "user", content: "Yes, please confirm." },
        { role: "assistant", content: "Your appointment is confirmed with Dr. Nadia Ali for tomorrow at 11:45 AM. Reference number is APT-1044. Please arrive at the New Building (545-A) First Floor. Take care!", tools: ["book_appointment"] },
      ],
    },
    {
      person: 1, channel: "voice", intent: "emergency", outcome: "escalated", status: "escalated",
      escalated: true, dOff: 0, t: "09:30",
      msgs: [
        { role: "user", content: "My father is having severe chest pain and sweating." },
        { role: "assistant", content: "That sounds like it could be an emergency. Please come straight to our Emergency Department at 544-A, East Canal Road, near the Abdullahpur Flyover. It's open 24 hours. I'm connecting you to our Emergency team right now.", tools: ["escalate_to_human"] },
      ],
    },
    {
      person: 2, channel: "chat", intent: "location_info", outcome: "resolved", status: "resolved",
      escalated: false, dOff: 0, t: "14:15",
      msgs: [
        { role: "user", content: "Where is Faisal Hospital located?" },
        { role: "assistant", content: "Our main entrance, Emergency, and main registration desks are at 544-A, East Canal Road, near the Abdullahpur Flyover. If your doctor is in our New Building (545-A), you can walk through the connected internal corridor, or park right next door." },
      ],
    },
  ];

  const insertConv = db.prepare(
    `INSERT INTO conversations (id, customer_name, channel, status, intent, outcome, escalated, escalation_reason, started_at, ended_at, duration_s, summary)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertMsg = db.prepare(
    `INSERT INTO messages (conversation_id, role, content, tool_calls, sources, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  convs.forEach((c, i) => {
    const id = `conv_seed_${i + 1}`;
    const name = DEMO_PEOPLE[c.person][0];
    const started = `${addDays(today, c.dOff)}T${c.t}:00.000Z`;
    const dur = c.msgs.length * 20;
    insertConv.run(
      id, name, c.channel, c.status, c.intent, c.outcome, c.escalated ? 1 : 0,
      c.escalated ? "EMERGENCY_ROUTED: Patient describes red-flag symptoms" : null,
      started, started, dur,
      c.outcome === "booked" ? `Booked appointment for ${name}` : `${c.intent} — ${c.outcome}`
    );
    c.msgs.forEach((m, j) => {
      insertMsg.run(
        id, m.role, m.content,
        JSON.stringify((m.tools || []).map((t) => ({ tool: t }))),
        JSON.stringify(m.sources || []),
        `${addDays(today, c.dOff)}T${c.t}:${String(j).padStart(2, "0")}.000Z`
      );
    });
  });
}

function seedSettings(db: DatabaseSync) {
  const settings = {
    business: {
      name: "Faisal Hospital",
      tagline: "Faisal Hospital Pvt Ltd — People's Colony No. 1, Faisalabad",
      address: "544-A & 545-A, East Canal Road, People's Colony No. 1, Faisalabad, Pakistan (near Abdullahpur Flyover)",
      phone: "UAN: 111-119-119 / Landline: +92 41 8542214",
      email: "info@faisalhospital.com",
    },
    personality: {
      tone: "Warm, professional, respectful",
      formality: "polite",
      verbosity: "concise",
      traits: ["life_safety_first", "patient_privacy", "no_medical_diagnosis", "empathetic", "female_persona"],
    },
    voice: {
      provider: "web-speech-api",
      voice_name: "default",
      rate: 1.0,
      note: "Browser Web Speech API voice synthesis & recognition (English & Urdu compatible)",
    },
    appointment_rules: {
      slot_interval_min: 15,
      buffer_min: 0,
      max_days_ahead: 30,
      cancellation_notice_h: 24,
    },
    integrations: {
      hospital_emr: "demo-mock",
      emergency_dispatch: "ready",
      telephony_uan: "111-119-119",
      lab_portal: "authorized-only",
    },
  };
  const stmt = db.prepare(`INSERT OR REPLACE INTO kv_settings (key, value) VALUES (?, ?)`);
  for (const [k, v] of Object.entries(settings)) stmt.run(k, JSON.stringify(v));
}

/** Seed database with Faisal Hospital dataset. If force is true, replaces existing. */
export function seedDatabase(db: DatabaseSync, force = false) {
  withTransaction(db, () => {
    if (force) {
      db.prepare(`DELETE FROM appointments`).run();
      db.prepare(`DELETE FROM messages`).run();
      db.prepare(`DELETE FROM conversations`).run();
      db.prepare(`DELETE FROM customers`).run();
      db.prepare(`DELETE FROM services`).run();
      db.prepare(`DELETE FROM doctor_schedules`).run();
      db.prepare(`DELETE FROM doctors`).run();
      db.prepare(`DELETE FROM departments`).run();
      db.prepare(`DELETE FROM users`).run();
      db.prepare(`DELETE FROM business_hours`).run();
      db.prepare(`DELETE FROM kb_chunks_fts`).run();
      db.prepare(`DELETE FROM kb_chunks`).run();
      db.prepare(`DELETE FROM kb_documents`).run();
      db.prepare(`DELETE FROM kv_settings`).run();
    }

    seedUsers(db);
    seedClinicalEntities(db);

    for (const s of SERVICES) insertService(db, s);
    const hstmt = db.prepare(`INSERT OR REPLACE INTO business_hours (day, open, close) VALUES (?, ?, ?)`);
    for (const [day, open, close] of HOURS) hstmt.run(day, open, close);

    for (const d of KB_DOCS) ingestDocument(db, d.id, d.title, d.category, d.content);
    try { syncKnowledgeBase(db); } catch (e) { console.warn("[seed] KB markdown sync warning:", e); }

    seedAppointments(db);
    seedConversations(db);
    seedSettings(db);
  });
  console.log("[seed] Faisal Hospital clinical entities & dataset loaded successfully.");
}

export function seedIfEmpty(db: DatabaseSync) {
  const serviceCount = (db.prepare(`SELECT COUNT(*) AS c FROM services`).get() as { c: number }).c;
  const userCount = (db.prepare(`SELECT COUNT(*) AS c FROM users`).get() as { c: number }).c;
  const docCount = (db.prepare(`SELECT COUNT(*) AS c FROM doctors`).get() as { c: number }).c;
  if (serviceCount > 0 && userCount > 0 && docCount > 0) return;
  seedDatabase(db, false);
}

// If invoked directly from terminal: `tsx src/db/seed.ts`
const isCli = process.argv[1]?.includes("seed.ts") || process.argv[1]?.includes("seed.js");
if (isCli) {
  const db = getDb();
  seedDatabase(db, true);
}
