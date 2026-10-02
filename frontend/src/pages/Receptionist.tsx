import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Mic, MessageSquare, RefreshCw, Play, Square, ArrowRight } from 'lucide-react';
import { usePageMeta } from '../layout/PageMeta';
import { api } from '../api/client';
import ChatPanel from '../components/ChatPanel';

const QUICK_PROMPTS = [
  'Where is the Emergency Department located?',
  'What doctors sit in Urology?',
  'Do you have an appointment with Dr. Nadia Ali tomorrow?',
];

/** Guided demo: drives the REAL chat pipeline through the canonical booking
 *  scenario, narrating what the agent is doing at each step. The time slot is
 *  chosen from live availability at demo start, so the demo never collides
 *  with an existing booking. */
const DEMO_CAPTIONS = [
  'The patient asks naturally. The agent identifies the doctor/department, the date, and checks real availability in the database.',
  'The patient picks an available slot. The agent validates the slot is still free before moving on; it never books blind.',
  'The agent collects the patient\u2019s name to hold the booking.',
  '…and a contact number. Then it summarizes everything and asks for explicit confirmation; nothing is booked without it.',
  'Only now does the agent execute the booking tool. Watch the confirmation appear, and find the appointment under Appointments.',
];

const DEMO_DONE_CAPTION =
  'Done: A verified hospital booking, executed against the live database. The conversation is saved, and the dashboard and analytics update immediately.';

const DEMO_NAME = 'Hamza Malik';
const DEMO_PHONE = '0300-1234567';

/** Tomorrow's date (YYYY-MM-DD) in the business timezone. */
function businessTomorrow(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(Date.now() + 24 * 3600 * 1000).map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function humanTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

const GREETING =
  "Welcome to Faisal Hospital, this is Faisal Hospital Assistant. I can help you check doctor schedules, book appointments, and guide you to our departments. How can I help you today?";

export default function Receptionist() {
  usePageMeta('Live Receptionist', { newConversation: true });
  const navigate = useNavigate();
  const location = useLocation();

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [resetSignal, setResetSignal] = useState(0);
  const [prompt, setPrompt] = useState<{ text: string; nonce: number } | null>(null);
  const [demoStep, setDemoStep] = useState<number | null>(null);
  const [demoNotice, setDemoNotice] = useState<string | null>(null);
  const demoSaysRef = useRef<string[]>([]);
  const demoActiveRef = useRef(false);

  // "New Conversation" from the topbar navigates here with fresh state.
  useEffect(() => {
    const state = location.state as { newAt?: number } | null;
    if (state?.newAt) {
      setConversationId(null);
      setResetSignal((n) => n + 1);
      navigate('/receptionist', { replace: true, state: {} });
    }
  }, [location.state, navigate]);

  const newConversation = () => {
    stopDemo();
    setConversationId(null);
    setResetSignal((n) => n + 1);
  };

  const startDemo = async () => {
    setDemoNotice(null);
    let slot: string | null = null;
    try {
      const date = businessTomorrow();
      const r = await api.get<{ slots: string[] }>(
        `/availability?service_id=svc_derm_nadia&date=${date}`,
      );
      slot = r.slots[0] ?? null;
    } catch {
      slot = null;
    }
    if (!slot) {
      setDemoNotice('No availability tomorrow for Dr. Nadia Ali: please check another doctor.');
      return;
    }
    const says = [
      'Hi, I would like to book an appointment with Dr. Nadia Ali tomorrow.',
      humanTime(slot),
      DEMO_NAME,
      DEMO_PHONE,
      'Yes, please book it',
    ];
    demoActiveRef.current = true;
    demoSaysRef.current = says;
    setConversationId(null);
    setResetSignal((n) => n + 1);
    setDemoStep(0);
    // Let the reset render first, then dispatch the opening line.
    window.setTimeout(() => {
      if (demoActiveRef.current) setPrompt({ text: says[0], nonce: Date.now() });
    }, 350);
  };

  const stopDemo = () => {
    demoActiveRef.current = false;
    demoSaysRef.current = [];
    setDemoStep(null);
  };

  /** Advance the guided demo when each assistant turn finishes. */
  const handleTurnDone = () => {
    if (!demoActiveRef.current) return;
    setDemoStep((prev) => {
      if (prev === null) return prev;
      const next = prev + 1;
      if (next >= DEMO_CAPTIONS.length) {
        demoActiveRef.current = false;
        return DEMO_CAPTIONS.length; // finished state
      }
      window.setTimeout(() => {
        const say = demoSaysRef.current[next];
        if (demoActiveRef.current && say) setPrompt({ text: say, nonce: Date.now() });
      }, 900);
      return next;
    });
  };

  const demoFinished = demoStep !== null && demoStep >= DEMO_CAPTIONS.length;

  return (
    <div style={{ maxWidth: 880, margin: '0 auto' }}>
      <div className="receptionist-head">
        <h1>AI Receptionist (QA Sandbox)</h1>
        <div className="sub">Interactive clinical QA sandbox: test multi-turn queries, services, and live bookings.</div>
        <div className="receptionist-actions">
          <button className="btn btn-primary" onClick={() => navigate('/voice')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Mic size={14} strokeWidth={2} /> Start Voice
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => document.getElementById('chat-input')?.focus()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <MessageSquare size={14} strokeWidth={2} /> Start Chat
          </button>
          <button className="btn btn-ghost" onClick={newConversation} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={13} strokeWidth={2} /> New conversation
          </button>
          {demoStep === null ? (
            <button className="btn btn-secondary" onClick={startDemo} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Play size={13} strokeWidth={2} /> Run guided demo
            </button>
          ) : (
            <button className="btn btn-secondary" onClick={stopDemo} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Square size={13} strokeWidth={2} /> Stop demo
            </button>
          )}
        </div>
        {demoNotice && (
          <div className="demo-banner" role="alert">
            <span className="demo-pill">GUIDED DEMO</span>
            <span>{demoNotice}</span>
          </div>
        )}
        {demoStep !== null && (
          <div className="demo-banner" role="status">
            <span className="demo-pill">GUIDED DEMO</span>
            <span>
              {demoStep < DEMO_CAPTIONS.length ? DEMO_CAPTIONS[demoStep] : DEMO_DONE_CAPTION}
            </span>
            {demoFinished && (
              <button className="btn btn-sm btn-primary" onClick={() => navigate('/appointments')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                View in Appointments <ArrowRight size={13} strokeWidth={2} />
              </button>
            )}
          </div>
        )}
        <div className="quick-prompts" aria-label="Suggested questions">
          {QUICK_PROMPTS.map((q) => (
            <button
              key={q}
              className="prompt-chip"
              onClick={() => setPrompt({ text: q, nonce: Date.now() })}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      <ChatPanel
        channel="chat"
        conversationId={conversationId}
        onConversationId={setConversationId}
        resetSignal={resetSignal}
        greeting={GREETING}
        externalPrompt={prompt}
        onTurnDone={handleTurnDone}
        placeholder="Ask about services, hours, or booking…"
      />

      {conversationId && (
        <div className="card-sub" style={{ marginTop: 10, textAlign: 'center' }}>
          Conversation <span className="tnum">{conversationId}</span> · saved automatically
        </div>
      )}
    </div>
  );
}
