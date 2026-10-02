# API Contract — AI Receptionist (v1)

Base URL: `http://localhost:8787`
API prefix: `/api/v1`
All JSON. Errors: `{ "error": { "code": string, "message": string } }`.

## 1. Health & System

### `GET /api/v1/health`
```json
{ "status": "ok", "version": "0.1.0", "uptime_s": 123,
  "engine": "demo-brain", "db": "ok" }
```
`engine` is `"demo-brain"` unless `OPENAI_API_KEY` is set, then `"openai"`.

### `GET /api/v1/system/status`
```json
{
  "engine": "demo-brain",
  "components": [
    { "name": "API", "status": "operational" },
    { "name": "Database", "status": "operational" },
    { "name": "Knowledge / RAG", "status": "operational" },
    { "name": "AI engine", "status": "operational", "detail": "Local demo brain" },
    { "name": "Browser voice", "status": "operational", "detail": "Web Speech API" },
    { "name": "Telephony (PSTN)", "status": "not-configured", "detail": "Twilio interface ready" },
    { "name": "Calendar sync", "status": "demo-mock", "detail": "Demo implementation" }
  ]
}
```
`status` ∈ `operational | degraded | not-configured | demo-mock`.

## 2. Chat (SSE)

### `POST /api/v1/chat`
Request:
```json
{ "conversation_id": "optional", "message": "Hi, I want a cleaning tomorrow",
  "channel": "chat", "customer_name": "optional" }
```
`channel` ∈ `chat | voice`. Streams Server-Sent Events, one JSON object per event:

| event | payload |
|---|---|
| `meta` | `{ conversation_id, channel, engine }` |
| `tool` | `{ tool, label, phase: "started"\|"done", summary? }` — e.g. label `"Checking availability"` |
| `sources` | `{ sources: [{ doc_id, title, section }] }` |
| `token` | `{ text }` — streamed response chunks, concatenate in order |
| `appointment` | `{ action: "booked"\|"cancelled"\|"rescheduled", appointment: {...} }` |
| `escalation` | `{ reason }` |
| `done` | `{ intent, outcome, latency_ms }` |
| `error` | `{ code, message, recoverable }` |

`outcome` ∈ `resolved | booked | escalated | open`.
`intent` ∈ `greeting | services_info | service_detail | hours_info | location_info | pricing_info | policy_info | faq | availability_check | book_appointment | cancel_appointment | reschedule_appointment | provide_details | human_request | complaint | smalltalk | goodbye | unknown`.

Rate limit: 60 req/min/IP on this endpoint (429 with `error.code = "rate_limited"`).

## 3. Conversations

### `GET /api/v1/conversations?limit=50&status=&channel=&q=`
```json
{ "conversations": [
  { "id": "conv_...", "customer_name": "Sarah Miller", "channel": "voice",
    "started_at": "2026-09-23T10:02:11", "duration_s": 204,
    "intent": "book_appointment", "outcome": "booked", "status": "resolved",
    "message_count": 14, "escalated": false }
] }
```
`status` ∈ `open | resolved | escalated`.

### `GET /api/v1/conversations/:id`
```json
{ "conversation": { "...same as list item...", "summary": "..." },
  "messages": [
    { "id": 1, "role": "user", "content": "...", "created_at": "..." },
    { "id": 2, "role": "assistant", "content": "...",
      "tool_calls": [{ "tool": "check_availability", "label": "Checking availability" }],
      "sources": [{ "doc_id": "kb_1", "title": "Services", "section": "Teeth Cleaning" }],
      "created_at": "..." }
  ] }
```

### `POST /api/v1/conversations/:id/escalate`
Body `{ "reason": "optional" }` → `{ "ok": true, "status": "escalated" }`.

## 4. Services, Hours, Availability, Appointments

### `GET /api/v1/services`
```json
{ "services": [
  { "id": "svc_cleaning", "name": "Teeth Cleaning", "description": "...",
    "duration_min": 45, "price": 89, "currency": "USD", "aliases": ["cleaning","dental cleaning"] }
] }
```

### `GET /api/v1/business-hours`
```json
{ "timezone": "America/Chicago",
  "hours": [{ "day": "Monday", "open": "09:00", "close": "18:00" }] }
```

### `GET /api/v1/availability?service_id=svc_cleaning&date=2026-09-24`
```json
{ "service_id": "svc_cleaning", "date": "2026-09-24", "slots": ["09:00","09:30","14:00"] }
```
400 if the business is closed that day: `{ error: { code: "closed", message } }` with `"slots": []`.

### `GET /api/v1/appointments?date=2026-09-24&status=confirmed&upcoming=true`
```json
{ "appointments": [
  { "id": "APT-1042", "customer_name": "Sarah Miller", "phone": "+1 555-0142",
    "email": "sarah@example.com", "service_id": "svc_cleaning", "service_name": "Teeth Cleaning",
    "date": "2026-09-24", "time": "15:00", "duration_min": 45,
    "status": "confirmed", "notes": "", "created_at": "...", "channel": "chat" }
] }
```
`status` ∈ `confirmed | cancelled | completed | no_show`.

### `POST /api/v1/appointments`
Body `{ service_id, date: "YYYY-MM-DD", time: "HH:MM", customer_name, phone, email? }`
→ `201 { "success": true, "appointment": {...} }`
→ `409 { "success": false, "error": { "code": "slot_taken"|"closed"|"invalid", "message" } }`

### `PATCH /api/v1/appointments/:id`
Body `{ "action": "cancel" }` → `{ "success": true, "appointment": {...cancelled} }`
Body `{ "action": "reschedule", "date": "YYYY-MM-DD", "time": "HH:MM" }`
→ `{ "success": true, "appointment": {...} }` or 409 slot_taken.

### `GET /api/v1/appointments/calendar?month=2026-09`
```json
{ "month": "2026-09", "days": [{ "date": "2026-09-24", "count": 5 }] }
```

## 5. Knowledge Base

### `GET /api/v1/knowledge/documents`
```json
{ "documents": [
  { "id": "kb_1", "title": "Services & Pricing", "category": "services",
    "status": "indexed", "chunks": 14, "updated_at": "..." }
] }
```
`status` ∈ `indexed | processing | failed`. `category` ∈ `company | services | policies | faq | other`.

### `POST /api/v1/knowledge/documents`
Body `{ title, category, content }` → `201 { "document": {...} }` (auto re-indexed).

### `PUT /api/v1/knowledge/documents/:id`
Body `{ title?, category?, content? }` → `{ "document": {...} }`.

### `DELETE /api/v1/knowledge/documents/:id` → `{ "ok": true }`.

### `POST /api/v1/knowledge/reindex` → `{ "ok": true, "documents": 8, "chunks": 96 }`.

## 6. Analytics (all demo data — response includes `"demo_data": true`)

### `GET /api/v1/analytics/overview`
```json
{ "demo_data": true, "total_conversations": 128, "resolution_rate": 0.87,
  "appointments_booked": 34, "avg_response_latency_s": 1.2,
  "avg_conversation_duration_s": 196, "escalation_rate": 0.06 }
```

### `GET /api/v1/analytics/intents`
```json
{ "demo_data": true, "intents": [{ "intent": "book_appointment", "count": 41 }] }
```

### `GET /api/v1/analytics/timeseries?days=14`
```json
{ "demo_data": true,
  "days": [{ "date": "2026-09-10", "conversations": 9, "appointments": 3 }] }
```

## 7. Settings

### `GET /api/v1/settings`
```json
{
  "business": { "name": "NovaCare Dental", "tagline": "Your intelligent front desk",
    "address": "421 Meridian Ave, Austin, TX 78701", "phone": "+1 (512) 555-0184",
    "email": "hello@novacaredental.com" },
  "personality": { "tone": "professional", "formality": "friendly",
    "verbosity": "concise", "traits": ["patient","helpful"] },
  "voice": { "provider": "web-speech", "voice_name": "default", "rate": 1.0,
    "note": "Browser voice demo — not a PSTN telephone call" },
  "hours": [ { "day": "Monday", "open": "09:00", "close": "18:00" } ],
  "appointment_rules": { "slot_interval_min": 30, "buffer_min": 10,
    "max_days_ahead": 60, "cancellation_notice_h": 24 },
  "integrations": { "calendar": "demo-mock", "telephony": "not-configured",
    "crm": "not-configured", "email": "not-configured" },
  "environment": { "engine": "demo-brain", "db": "sqlite", "vector": "sqlite-fts5",
    "secrets_exposed": false }
}
```

### `PUT /api/v1/settings`
Partial body, e.g. `{ "business": { "phone": "..." } }` → `{ "settings": { ...full... } }`.

## 8. Voice

### `GET /api/v1/voice/config`
```json
{ "stt": "web-speech", "tts": "web-speech",
  "note": "Browser voice demo using the Web Speech API. This is not a PSTN telephone call.",
  "telephony": "not-configured" }
```

## Notes for implementers
- Never invent fields not listed here. If the frontend needs something missing, add a graceful fallback and note it in `frontend/FRONTEND_NOTES.md` — do not change this contract unilaterally.
- Times are local business time (`America/Chicago`), formatted `HH:MM` 24h on the wire; the frontend formats for display.
- Dates are `YYYY-MM-DD`.
