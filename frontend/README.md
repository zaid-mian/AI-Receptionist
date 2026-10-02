# AI Receptionist — Frontend

React 18 + Vite + TypeScript + react-router-dom. Hand-crafted CSS (no UI
framework), hand-rolled SVG charts (no chart library).

## Setup

```bash
cd frontend
npm install
npm run dev      # vite dev server on http://localhost:5173
npm run build    # type-check + production build -> dist/
```

The backend must be running at `http://localhost:8787` (override with
`VITE_API_BASE`, e.g. `VITE_API_BASE=http://localhost:8787 npm run dev`).

## Structure

```
src/
  api/
    client.ts   # typed fetch wrapper (get/post/patch/put/del) + postSSE
                # (POST+SSE parser for /api/v1/chat, since EventSource can't POST)
    types.ts    # types mirroring docs/API_CONTRACT.md exactly
  components/   # one file per component
    Sidebar.tsx / Topbar.tsx / MetricCard.tsx / Badge.tsx / DemoDataBadge.tsx
    ChatPanel.tsx / MessageBubble.tsx / ToolActivityRow.tsx / SourceChips.tsx
    AppointmentCard.tsx / VoiceCall.tsx / TranscriptLine.tsx
    DataTable.tsx / CalendarMonth.tsx / Charts.tsx (Bar/Line/Donut, SVG)
    Modal.tsx / Toast.tsx / EmptyState.tsx / Spinner.tsx / StatList.tsx
  pages/
    Overview.tsx  Receptionist.tsx (chat)  Voice.tsx  Appointments.tsx
    Conversations.tsx  ConversationDetail.tsx  Knowledge.tsx
    Analytics.tsx  Settings.tsx
  layout/PageMeta.tsx  # pages drive the shared Topbar (title, badges, actions)
  styles/  tokens.css  components.css  pages.css
  utils/  format.ts  badges.tsx
  types/  web-speech.d.ts  # minimal Web Speech API typings
```

## Routes

| Route | Page |
|---|---|
| `/` | Overview dashboard |
| `/receptionist` | Live chat with the AI receptionist (streaming SSE) |
| `/voice` | Browser voice call (Web Speech STT + TTS) |
| `/appointments` | List + calendar, book / reschedule / cancel |
| `/conversations` | Filterable history |
| `/conversations/:id` | Transcript detail, escalation |
| `/knowledge` | Document CRUD + reindex |
| `/analytics` | KPIs + SVG charts (demo data labeled) |
| `/settings` | Business, personality, voice, hours, rules, integrations |

## Notes

- Every button performs a real API call or navigation — no dead buttons, no TODOs.
- Demo data is always labeled with the "Demo data" pill; live data (appointments,
  conversations, knowledge docs, settings) is real backend state.
- Contract gaps and the fallbacks used are documented in `FRONTEND_NOTES.md`.
- Responsive: sidebar collapses to a hamburger menu under 900px.
