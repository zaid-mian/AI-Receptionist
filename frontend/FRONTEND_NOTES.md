# Frontend Notes — API Contract Gaps & Fallbacks

The frontend follows `docs/API_CONTRACT.md` exactly and invents no endpoints.
Where the contract didn't provide something the UI needed, the fallback below
was used instead of changing the contract.

## 1. Analytics "Outcome distribution" donut (Analytics page)
- **Gap:** No analytics endpoint returns outcome counts. `GET /api/v1/analytics/overview`
  has rates but no per-outcome breakdown.
- **Fallback:** The donut is computed client-side by tallying `outcome` over
  `GET /api/v1/conversations?limit=100` (live data, labeled as such). If the list
  is empty, an empty state is shown instead of a chart.
- **Suggested contract addition:** `GET /api/v1/analytics/outcomes` returning
  `{ demo_data, outcomes: [{ outcome, count }] }`.

## 2. Overview "Calls Today" metric
- **Gap:** `GET /api/v1/analytics/overview` exposes `total_conversations` (all
  time) but no per-day call count.
- **Fallback:** The first KPI card is labeled **"Conversations"** with hint
  "all time · demo data" instead of "Calls Today", to avoid mislabeling. The
  14-day timeseries could be summed client-side for a "last 14 days" figure, but
  that would still not be "today".
- **Suggested contract addition:** `calls_today` (or a `date` filter on the
  overview endpoint).

## 3. Knowledge document full text ("View source" / Edit prefill)
- **Gap:** `GET /api/v1/knowledge/documents` and the POST/PUT responses return
  document metadata (`id, title, category, status, chunks, updated_at`) but no
  `content` field. There is no `GET /api/v1/knowledge/documents/:id`.
- **Fallback:** The frontend keeps a session-local cache of text the user
  uploads or edits, and shows it in "View source". For documents created outside
  this session, "View source" shows metadata plus an explanatory note, and the
  Edit dialog starts with an empty content box plus a hint to paste the full
  updated text.
- **Suggested contract addition:** include `content` in the POST/PUT responses,
  or add `GET /api/v1/knowledge/documents/:id`.

## 4. SSE `sources` event shape on conversation history
- **Gap:** `GET /api/v1/conversations/:id` returns message-level `sources` as
  `[{ doc_id, title, section }]` — matching the chat `sources` event — so this
  one needed no fallback. Documented here only to confirm the assumption held.

## 5. Voice greeting
- The spoken greeting ("Hi, thanks for calling NovaCare Dental…") is a
  frontend string, not a backend `meta` event. If the backend later provides a
  per-business greeting, `VoiceCall.tsx` `GREETING` should be replaced with it.

## Non-gaps (verified against the contract)
- Chat SSE via POST with manual `event:`/`data:` parsing (EventSource can't
  POST) — implemented in `src/api/client.ts` `postSSE`.
- `POST /api/v1/chat` `error` event (with `recoverable`) vs HTTP-level errors —
  both handled: stream errors render an inline error bar with Retry; transport
  failures throw `ApiError` with a "backend unreachable" message.
- Rate limiting (429 `rate_limited`) surfaces through the same `ApiError` path.
- All times render from wire format (`HH:MM` 24h, `YYYY-MM-DD`) via
  `src/utils/format.ts`; no timezone conversion is applied (business-local).
