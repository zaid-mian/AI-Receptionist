# Faisal Hospital — Enterprise AI Receptionist & Front Desk Triage System

An enterprise-grade, production-quality AI Receptionist, Clinical Availability Engine, and Live Front Desk Operator Console designed for modern healthcare institutions. Built on high-performance in-process architecture, real-time LLM token streaming, hybrid lexical/semantic retrieval (RRF + BM25), shift-aware doctor rosters, and instant human operator takeover.

![Status](https://img.shields.io/badge/Status-Production%20Ready-059669?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?style=flat-square&logo=typescript)
![Node.js](https://img.shields.io/badge/Node.js-22%2B%20(Native%20SQLite)-339933?style=flat-square&logo=node.js)
![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react)
![Tests](https://img.shields.io/badge/Tests-18%20Passed%20(0%20deps)-success?style=flat-square)

---

## 1. Executive Summary

Healthcare front desks face heavy phone call and chat volumes, complex multi-specialist OPD shift schedules, emergency triage demands, and bilingual patient communication. 

**Faisal Hospital AI Receptionist** solves this with an architectural separation between a public-facing patient portal and a secure backoffice hospital operations console:
- **Patients** receive immediate answers to hospital policies, visiting hours, and clinical fees, check doctor schedules, and book confirmed appointments with sub-250ms time-to-first-token streaming via **text chat** or **bilingual voice assistant** (`/voice`).
- **Interactive Bilingual Voice Assistant**: Natural voice conversation in English and Urdu (`ur-PK`) powered by high-definition **Microsoft Edge Neural TTS**, browser Web Speech API, live frequency audio visualizer, full-duplex interruption (barge-in), and responsive mobile segmented controls.
- **Receptionists & Supervisors** have a live Operator Desk with real-time SSE stream, instant one-click chat takeover, direct response composition, and automated emergency escalation tracking.
- **Zero Heavy Dependencies**: Built with Ponytail code minimalism — uses Node.js standard library (`node:crypto` scrypt, `node:sqlite`, `node:events`, `node:test`), eliminating bloated external vector DBs and socket daemons.

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            FRONTEND (React 18 + Vite 6)                     │
│                                                                             │
│   PUBLIC PATIENT PORTAL (/)             PROTECTED HOSPITAL BACKOFFICE (/admin)│
│   • 24/7 Emergency Alert Banner         • Real-Time Operator Desk (Live SSE)│
│   • Streaming AI Chat & Quick Chips     • Doctor OPD Shift Roster Manager   │
│   • 10-Department Clinical Directory    • Calendar & Appointment Management │
│   • Shift-Aware Booking Form            • Knowledge Base Sync & Analytics   │
│   • Interactive Voice Receptionist      • Role-Based Access (Admin vs Staff)│
│     (English / Urdu + Audio Visualizer) • Developer / QA Sandbox Console    │
└───────────────────────────────┬───────────────────────────────┬─────────────┘
                                │ POST /api/v1/chat (SSE)       │ SSE / REST (JWT)
                                │ GET /api/v1/tts (MP3 stream)  │ POST /takeover /reply
┌───────────────────────────────▼───────────────────────────────▼─────────────┐
│                      BACKEND APPLICATION (Node 22+ + Express)                │
│                                                                             │
│   ┌───────────────────┐    ┌────────────────────┐    ┌──────────────────┐   │
│   │ Real-Time LLM     │    │ Live Operator Hub  │    │ Native Auth      │   │
│   │ Streaming Engine  │    │ (EventEmitter SSE) │    │ (scrypt + JWT)   │   │
│   │ OpenRouter / Fallback  │ Broadcast / Takeover    │ RBAC Route Guard │   │
│   └─────────┬─────────┘    └──────────┬─────────┘    └────────┬─────────┘   │
│             │                         │                       │             │
│             ▼                         ▼                       ▼             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    SHIFT-AWARE AVAILABILITY ENGINE                  │   │
│   │  • 18 Specialist Consultants across 10 Departments (Cardio, Derm,..)│   │
│   │  • 111 Weekly Recurring OPD Shifts (Mon-Sat, Morning/Evening)       │   │
│   │  • 15-Minute Slot Generation with Double-Booking Prevention         │   │
│   └───────────────────────────────────┬─────────────────────────────────┘   │
│                                       │                                     │
│                                       ▼                                     │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │              HYBRID IN-PROCESS RETRIEVAL & GROUNDING (RAG)           │   │
│   │  • Column-Weighted SQLite FTS5 (Title: 5.0, Section: 4.0, Text: 1.0)│   │
│   │  • Bilingual Clinical Synonyms (Urdu: dil, gurda, haddi, saans,..)  │   │
│   │  • Reciprocal Rank Fusion (RRF k=60) blending Lexical + Semantic     │   │
│   └───────────────────────────────────┬─────────────────────────────────┘   │
│                                       │                                     │
│                                       ▼                                     │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │              PERSISTENT SQLITE DATABASE (Node.js node:sqlite)        │   │
│   │  WAL Mode · Atomic Transactions (withTransaction) · FTS5 Virtual DB │   │
│   │  departments · doctors · doctor_schedules · services · appointments │   │
│   │  conversations · messages · kb_docs · kb_chunks · users · settings  │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Core Technical Innovations

### 3.1 True Real-Time LLM Token Streaming
- Utilizes an asynchronous chunk parser (`readSseLines`) streaming tokens immediately from the upstream model without buffering full sentences.
- Achieves **<250ms Time-to-First-Token (TTFT)**.
- Features seamless fallback to the local deterministic clinical NLU brain if external API limits or network outages occur.

### 3.2 Shift-Aware Doctor Availability Engine
- Unlike generic scheduling tools that assume flat business hours, hospital doctors operate on distinct recurring shifts (e.g., Dr. Nadia Ali sits Mon–Sat 11:00 AM – 2:00 PM; Dr. Farah Khurram sits Mon–Fri 5:00 PM – 8:00 PM).
- Generates slots strictly within the consultant's active duty window, automatically marks off-days (`doctor_not_sitting`), and validates conflict collisions at transaction time.

### 3.3 Zero-Dependency Hybrid In-Process RAG (RRF + FTS5)
- Eliminates the operational cost and latency of external vector databases (Pinecone, Weaviate, Chroma).
- Implements **Reciprocal Rank Fusion (RRF)**:
  $$\text{RRF Score}(d) = \sum_{m \in M} \frac{1}{60 + r_m(d)}$$
- Enriched with bilingual Urdu & English clinical synonym expansions (`dil` $\to$ cardiology, `gurda` $\to$ urology, `haddi` $\to$ orthopedics, `sehat card` $\to$ insurance/panel billing).

### 3.4 Live Human Receptionist Takeover & Operator Desk
- Powered by an in-memory PubSub hub using Node's native `EventEmitter`.
- Backoffice receptionists can monitor incoming patient chats via `GET /conversations/live-stream` (Server-Sent Events).
- Clicking **Take Over Chat** instantly pauses autonomous AI generation, alerts the patient that a human receptionist has joined, and allows direct two-way messaging with quick canned responses.

### 3.5 Full-Duplex Bilingual Voice Receptionist & Neural Edge TTS
- **Zero-Latency Bilingual STT**: Uses browser Web Speech API with dual-language support for **English (`en-US`)** and **Urdu (`ur-PK`)** with intelligent pause buffering (~2.0s).
- **High-Definition Neural Voice**: Integrates **Microsoft Edge Neural TTS (`msedge-tts`)** streaming lifelike human voices (`en-US-JennyNeural` and `ur-PK-UzmaNeural`) as MP3 audio blobs with zero external API key requirements.
- **Barge-In Interruption**: Patients can speak mid-reply to immediately cut off the AI's speech playback and reopen the microphone stream.
- **Responsive Mobile Segmented Control**: Segmented view tabs (`[ 🎙 Voice Stage ]` / `[ 💬 Live Transcript ]`) on mobile devices ensure a clean touch-friendly experience down to 320px screens with zero horizontal overflow.

### 3.6 Enterprise Security & Role-Based Access Control (RBAC)
- **Zero External Auth Packages**: Built using Node standard library (`node:crypto` scrypt).
- Passwords salted with 16 bytes of cryptographically secure random bytes and hashed via `crypto.scryptSync`.
- RFC 7519 HMAC-SHA256 JWT tokens with timing-safe signature verification.
- **Strict Role Separation**:
  - `admin`: Governance, analytics, doctor roster management, knowledge base sync, and developer sandbox.
  - `staff`: Operator desk, live patient triage, and read-only schedule lookups. Direct URL access to admin pages is rejected via backend and frontend RBAC guards.

---

## 4. Hospital Clinical Directory (Seeded)

The system is pre-seeded with 10 clinical departments and 18 verified specialist consultants:

| Department | Specialists | Key Shift Timing | Fee (PKR) |
|---|---|---|---|
| **Cardiology** | Dr. Shakeel Ahmad | Mon–Sat 17:00 – 20:00 | 2,500 |
| **Dermatology & Cosmetology** | Dr. Nadia Ali, Dr. Farah Khurram | Mon–Sat 11:00–14:00, 17:00–20:00 | 2,500 / 2,000 |
| **Orthopedic Surgery** | Dr. Usman Akmal, Dr. M. Pervaiz | Mon–Sat 15:00–18:00, 18:00–21:00 | 2,500 / 2,000 |
| **Pediatrics & Neonatology** | Dr. Junaid Ahmed, Dr. Aqsa Rafique | Mon–Sat 18:00–21:00, 10:00–13:00 | 2,000 |
| **Urology & Stone Center** | Dr. Safdar Hassan Javed | Mon–Sat 16:30 – 19:30 | 2,500 |
| **Gynecology & Obstetrics** | Dr. Shazia Fatima, Dr. Samina Irum | Mon–Sat 09:00–13:00, 17:00–20:00 | 2,000 |
| **Laparoscopic Surgery** | Dr. Tanveer Ahmad, Dr. Aamer Riaz | Mon–Sat 16:00–19:00, 19:00–22:00 | 2,500 / 2,000 |
| **Neurology & Neurosurgery** | Dr. Bilal Waheed, Prof. Nazar Hussain | Mon–Sat 16:00–19:30, Tue/Thu/Fri 17:00–20:00 | 2,500 |
| **Pulmonology & Chest** | Dr. Syed Bilal Hafeez | Mon–Sat 18:00 – 21:00 | 2,000 |
| **Internal & General Medicine** | Dr. Munir Zafar, Dr. Ahmad Raza | Mon–Sat 10:00–13:00, 17:00–21:00 | 2,500 / 2,000 |

---

## 5. Getting Started

### Prerequisites
- **Node.js**: v22+ (tested on Node v22 and v24 with native SQLite)
- **npm**: v10+

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/zaid-mian/AI-Receptionist.git
   cd AI-Receptionist
   ```

2. **Backend Setup:**
   ```bash
   cd backend
   npm install
   # Seeds 10 departments, 18 doctors, 111 weekly shifts, and markdown RAG docs
   npm run seed
   ```

3. **Frontend Setup:**
   ```bash
   cd ../frontend
   npm install
   ```

### Running Locally

1. **Start Backend Server (`http://localhost:8787`):**
   ```bash
   cd backend
   npm run dev
   ```

2. **Start Frontend Client (`http://localhost:5173`):**
   ```bash
   cd frontend
   npm run dev
   ```

3. **Open the Application:**
   - **Public Patient Portal:** `http://localhost:5173/`
   - **Interactive Voice Assistant:** `http://localhost:5173/voice`
   - **Hospital Staff Backoffice:** `http://localhost:5173/admin/login`

### Demo Credentials

| Role | Email | Password |
|---|---|---|
| **Hospital Administrator** | `admin@faisalhospital.pk` | `Admin@Faisal2026` |
| **Front Desk Staff** | `reception@faisalhospital.pk` | `Staff@Faisal2026` |

*(A one-click "Use Demo Admin Credentials" button is provided on the login page for rapid evaluation)*.

---

## 6. Automated Test Suite

The test suite runs with **zero additional test frameworks** using Node's native test runner (`node:test`) and TypeScript execution via `tsx`:

```bash
cd backend
npm test
```

### Verified Test Matrix (18 Tests, 5 Suites, ~550ms)
- ✔ **Auth Service (scrypt + HMAC-SHA256 JWT)**: Unique salt generation, timing-safe verification, tamper protection, expiration enforcement.
- ✔ **Shift-Aware Availability Engine**: Doctor shift roster filtering, off-day detection, past date rejection, slot generation.
- ✔ **Hybrid RRF Retrieval**: Bilingual Urdu clinical expansion, English colloquialism mapping, policy grounding, doctor citation extraction.
- ✔ **Hospital Agent Tools Execution**: `get_departments`, `get_doctor_schedules`, `check_availability`, `book_appointment` conflict avoidance.
- ✔ **Live Hub PubSub Service**: Real-time event broadcasting, subscriber lifecycle management.

---

## 7. API Specification

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `POST` | `/api/v1/auth/login` | Authenticate staff user, returns JWT | Public |
| `GET` | `/api/v1/auth/me` | Validate JWT and retrieve user profile | Bearer JWT |
| `POST` | `/api/v1/chat` | Streaming receptionist turn (Server-Sent Events) | Public |
| `GET` | `/api/v1/tts` | Stream high-definition Neural TTS audio (MP3) | Public |
| `GET` | `/api/v1/voice/config` | Retrieve voice speech rate and configuration | Public |
| `GET` | `/api/v1/doctors` | List all 18 doctors with department and shift rosters | Public |
| `GET` | `/api/v1/departments` | List all 10 clinical units and building locations | Public |
| `GET` | `/api/v1/availability` | Compute open appointment slots for date & doctor | Public |
| `GET` | `/api/v1/conversations/live-stream` | Real-time event stream for Operator Desk | Bearer JWT |
| `POST` | `/api/v1/conversations/:id/takeover` | Pause autonomous AI and assign to human operator | Bearer JWT |
| `POST` | `/api/v1/conversations/:id/release` | Release conversation back to AI receptionist | Bearer JWT |
| `POST` | `/api/v1/conversations/:id/reply` | Send human receptionist reply into patient thread | Bearer JWT |
| `POST` | `/api/v1/knowledge/sync-markdown` | Re-index `knowledge-base.md` into FTS5 virtual table | Bearer JWT |

---

## 8. Portfolio & Design Highlights

- **Bilingual Healthcare AI**: Real understanding of regional and clinical nuances in Urdu and English.
- **Enterprise UX**: Polished healthcare design system with clear visual hierarchy, accessible color contrasts, loading skeletons, and responsive layouts down to 320px screens.
- **Deterministic Reliability**: Guards against AI hallucinations by validating doctor schedules directly against relational database records before confirming bookings.
- **Clean Architecture**: Follows Domain-Driven Design and Ponytail minimalism — clean separation of concerns, high test coverage, and lean production bundles.

