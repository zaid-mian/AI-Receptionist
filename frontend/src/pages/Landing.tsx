import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Mic,
  MessageSquare,
  CalendarCheck2,
  Languages,
  Radio,
  Siren,
  Database,
  BarChart3,
  ArrowRight,
  CheckCircle2,
  Stethoscope,
  PhoneCall,
  Sparkles,
  ChevronRight,
  ShieldCheck,
  Printer,
  RotateCcw,
} from 'lucide-react';
import ChatPanel from '../components/ChatPanel';
import '../styles/landing.css';

/* Scroll-reveal on intersection */
function useRevealRoot() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const els = root.querySelectorAll('.reveal');
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('is-visible');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return ref;
}

const HERO_CHIPS = [
  { label: 'OPD timings', prompt: 'What are the OPD timings and consultation fee for Dr. Nadia Ali?' },
  { label: 'Book a visit', prompt: 'I want to book an appointment with a cardiologist tomorrow' },
  { label: 'اردو میں پوچھیں', prompt: 'مجھے بچوں کے ڈاکٹر کے اوقات بتائیں' },
];

const FEATURES = [
  {
    icon: Languages, color: '#1d4ed8',
    title: 'Truly bilingual — English & اردو',
    desc: 'Patients converse in English or Urdu (Roman or Urdu script). Voice, chat and understanding all switch languages mid-conversation.',
    tag: 'NLP',
  },
  {
    icon: Mic, color: '#0e7c6b',
    title: 'Voice receptionist',
    desc: 'Browser-based voice calls with neural text-to-speech, live audio visualizer and barge-in — patients can interrupt, just like a real call.',
    tag: 'Voice AI',
  },
  {
    icon: CalendarCheck2, color: '#7c3aed',
    title: 'Shift-aware scheduling engine',
    desc: '18 consultants, 111 weekly OPD shifts, 15-minute slots. Double-booking is impossible by construction — the engine, not the LLM, owns the calendar.',
    tag: 'Deterministic',
  },
  {
    icon: Radio, color: '#dc2626',
    title: 'Live operator takeover',
    desc: 'Every conversation streams to the operator desk over SSE. One click and a human takes over mid-chat — the AI hands off gracefully.',
    tag: 'Human-in-loop',
  },
  {
    icon: Siren, color: '#ea580c',
    title: 'Emergency triage escalation',
    desc: 'Urgent language is detected and escalated instantly with a tracked handoff — emergencies never wait in a chatbot queue.',
    tag: 'Safety',
  },
  {
    icon: Database, color: '#0f766e',
    title: 'Grounded answers, zero hallucinations',
    desc: 'Hybrid lexical + semantic retrieval over the hospital knowledge base. Every factual answer carries its source — the model never invents fees or timings.',
    tag: 'RAG',
  },
];

const STEPS = [
  {
    title: 'Patient asks, any way they like',
    desc: 'Type in the chat, or tap to speak in English or اردو. The agent parses intent, dates and departments — even "day after tomorrow" in Roman Urdu.',
    code: 'POST /api/v1/chat → SSE',
  },
  {
    title: 'Agent reasons, tools act',
    desc: 'The agent streams its thinking as visible tool activity — checking shifts, searching the knowledge base, verifying slot availability. Deterministic tools, never LLM guesswork.',
    code: 'tools: get_slots · book · kb_search',
  },
  {
    title: 'Books, answers, or escalates',
    desc: 'Confirmed appointments land in SQLite instantly. Emergencies escalate to a human operator with full context. Everything is logged for audit.',
    code: 'SQLite · SSE operator desk',
  },
];

const ARCH = [
  { t: 'Patient', s: 'Chat · Voice · Portal', hot: false },
  { t: 'Agent', s: 'LLM + streaming SSE', hot: true },
  { t: 'Tools', s: 'Scheduling · KB · Triage', hot: true },
  { t: 'SQLite', s: 'Slots · Doctors · Logs', hot: false },
  { t: 'Operator', s: 'Live takeover desk', hot: false },
];

export default function Landing() {
  const rootRef = useRevealRoot();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [resetSignal, setResetSignal] = useState(0);

  return (
    <div className="landing" ref={rootRef}>
      {/* emergency strip */}
      <div className="ld-strip">
        <span><span className="pulse" /> <strong>24/7 Casualty:</strong> (041) 920-1431</span>
        <span>Helpline <strong>111-119-119</strong></span>
        <span style={{ opacity: 0.75 }}>East Canal Road, Faisalabad</span>
      </div>

      {/* nav */}
      <nav className="ld-nav">
        <div className="ld-nav-inner">
          <Link to="/" className="ld-brand">
            <span className="ld-brand-mark"><Stethoscope size={20} strokeWidth={2.2} /></span>
            <span>
              <span className="ld-brand-name">Faisal Hospital</span><br />
              <span className="ld-brand-sub">AI Receptionist</span>
            </span>
          </Link>
          <div className="ld-nav-links">
            <a href="#features">Capabilities</a>
            <a href="#bilingual">Bilingual</a>
            <a href="#how">How it works</a>
            <a href="#architecture">Architecture</a>
          </div>
          <div className="ld-nav-cta">
            <Link to="/admin/login" className="ld-btn ld-btn-ghost" style={{ padding: '9px 16px' }}>Staff login</Link>
            <Link to="/portal" className="ld-btn ld-btn-primary" style={{ padding: '9px 16px' }}>
              Open live demo <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </nav>

      {/* hero */}
      <header className="ld-hero">
        <div className="ld-hero-grid">
          <div>
            <span className="ld-eyebrow reveal"><span className="dot" /> Live demo · no signup · no API key</span>
            <h1 className="ld-h1 reveal reveal-d1">
              The front desk<br />that <span className="grad">never sleeps.</span>
            </h1>
            <p className="ld-sub reveal reveal-d2">
              A bilingual AI receptionist for hospital front desks — it answers in English or{' '}
              <span className="urdu-inline">اردو</span>, checks real doctor OPD shifts, books verified
              appointments, and hands emergencies to a human in one click. Try it right now — the chat
              beside you is live.
            </p>
            <div className="ld-hero-ctas reveal reveal-d2">
              <Link to="/portal" className="ld-btn ld-btn-primary ld-btn-lg">
                <MessageSquare size={17} /> Talk to the receptionist
              </Link>
              <Link to="/voice" className="ld-btn ld-btn-ghost ld-btn-lg">
                <PhoneCall size={17} /> Try voice mode
              </Link>
            </div>
            <div className="ld-stats reveal reveal-d3">
              <div className="ld-stat"><b>24/7</b><span>always answering</span></div>
              <div className="ld-stat"><b>&lt;250ms</b><span>first token streamed</span></div>
              <div className="ld-stat"><b>EN + اردو</b><span>bilingual voice & chat</span></div>
              <div className="ld-stat"><b>111</b><span>weekly OPD shifts</span></div>
            </div>
          </div>

          <div className="ld-demo-wrap reveal reveal-d2">
            <div className="ld-float f1">
              <span className="ic" style={{ background: '#16a34a' }}><CheckCircle2 size={17} /></span>
              <span>Appointment booked<small>Cardiology · Tomorrow 10:15 AM</small></span>
            </div>
            <div className="ld-float f2">
              <span className="ic" style={{ background: '#1d4ed8' }}><Languages size={17} /></span>
              <span style={{ fontFamily: 'var(--font-urdu)' }}>ٹوکن کنفرم ہو گیا<small style={{ fontFamily: 'var(--font-sans)' }}>confirmed in Urdu</small></span>
            </div>
            <div className="ld-demo-card">
              <div className="ld-demo-head">
                <div className="who">
                  <span className="ava"><Stethoscope size={17} /></span>
                  <span><b>Faisal Hospital Assistant</b><small>AI Receptionist · OPD Desk</small></span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    type="button"
                    className="ld-btn ld-btn-ghost ld-btn-sm"
                    onClick={() => { setConversationId(null); setResetSignal((s) => s + 1); }}
                    title="Start a new chat"
                  >
                    <RotateCcw size={12} /> New chat
                  </button>
                  <span className="ld-live"><span className="dot" /> LIVE</span>
                </div>
              </div>
              <div className="ld-demo-body">
                <ChatPanel
                  channel="chat"
                  conversationId={conversationId}
                  onConversationId={setConversationId}
                  resetSignal={resetSignal}
                  greeting={'Assalam-o-Alaikum! I\'m the Faisal Hospital AI receptionist. Ask me about doctor timings, book an appointment, or type in اردو — try one:'}
                  placeholder="Ask in English or اردو…"
                  actionChips={HERO_CHIPS}
                />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* tech strip */}
      <div className="ld-tech reveal">
        <div className="ld-tech-inner">
          <span className="t"><b>React 18</b> streaming UI</span>
          <span className="t"><b>Node 22</b> native SQLite</span>
          <span className="t"><b>SSE</b> token streaming</span>
          <span className="t"><b>Edge Neural TTS</b> Urdu + English voice</span>
          <span className="t"><b>Zero</b> vector DBs · zero socket daemons</span>
        </div>
      </div>

      {/* features */}
      <section className="ld-section" id="features">
        <div className="ld-kicker reveal">Capabilities</div>
        <h2 className="ld-h2 reveal">Everything a front desk does.<br />Automated, audited, bilingual.</h2>
        <p className="ld-lead reveal">Not a chatbot bolted onto a website — a complete front-desk system with a patient portal, an operator console, and a deterministic scheduling engine the AI is not allowed to overrule.</p>
        <div className="ld-grid">
          {FEATURES.map((f, i) => (
            <div className={`ld-card reveal reveal-d${i % 3}`} key={f.title}>
              <span className="ic" style={{ background: f.color }}><f.icon size={21} strokeWidth={2} /></span>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
              <span className="tag">{f.tag}</span>
            </div>
          ))}
        </div>
      </section>

      {/* bilingual */}
      <section className="ld-section" id="bilingual" style={{ paddingTop: 0 }}>
        <div className="ld-bilingual reveal">
          <div>
            <div className="ld-kicker">Bilingual by design</div>
            <h2 className="ld-h2">Half the patients speak Urdu.<br />So does the receptionist.</h2>
            <p className="ld-lead">
              Roman Urdu, Urdu script, or English — often mixed in one sentence. The agent detects
              language per message, replies in kind, and renders Urdu in proper Nastaliq type with
              right-to-left layout. Voice works in both languages too.
            </p>
            <Link to="/voice" className="ld-btn ld-btn-white">
              <Mic size={16} /> Hear the Urdu voice
            </Link>
          </div>
          <div className="ld-chat-mock">
            <div className="ld-msg user">Do you have a child specialist available today?</div>
            <div className="ld-msg bot">Yes — Dr. Ayesha Khan (Pediatrics) is in OPD today 5:00–9:30 PM, Room 12. Shall I book a token?</div>
            <div className="ld-msg user urdu" dir="rtl">جی، ٹوکن بک کر دیں</div>
            <div className="ld-msg bot urdu" dir="rtl">ٹوکن کنفرم ہو گیا ہے — کل شام 6:30 بجے، کمرہ 12۔ براہ کرم 10 منٹ پہلے تشریف لائیں۔</div>
          </div>
        </div>
      </section>

      {/* how it works */}
      <section className="ld-section" id="how" style={{ paddingTop: 0 }}>
        <div className="ld-kicker reveal">How it works</div>
        <h2 className="ld-h2 reveal">Ask. The agent acts.<br />Humans stay in control.</h2>
        <p className="ld-lead reveal">The LLM reasons and talks — deterministic tools own every fact, slot and booking. That separation is what makes it safe to put in front of patients.</p>
        <div className="ld-steps">
          {STEPS.map((s, i) => (
            <div className={`ld-step reveal reveal-d${i}`} key={s.title}>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
              <p style={{ marginTop: 12 }}><code>{s.code}</code></p>
            </div>
          ))}
        </div>
      </section>

      {/* architecture */}
      <section className="ld-section" id="architecture" style={{ paddingTop: 0 }}>
        <div className="ld-arch reveal">
          <div className="ld-kicker">Under the hood</div>
          <h2 className="ld-h2" style={{ marginBottom: 6 }}>Boring technology, on purpose.</h2>
          <p className="ld-lead" style={{ marginBottom: 0 }}>
            No vector database, no socket daemon, no GPU. Node's native SQLite, an event emitter for
            live updates, and hybrid BM25 + semantic retrieval in-process. The whole backend runs on
            five npm dependencies — and the test suite runs with zero.
          </p>
          <div className="ld-arch-flow">
            {ARCH.map((n, i) => (
              <div key={n.t} style={{ display: 'flex', alignItems: 'stretch', flex: 1, minWidth: 0 }}>
                <div className={`ld-arch-node${n.hot ? ' hot' : ''}`} style={{ flex: 1 }}>
                  <b>{n.t}</b><span>{n.s}</span>
                </div>
                {i < ARCH.length - 1 && (
                  <span className="ld-arch-arrow"><ChevronRight size={18} /></span>
                )}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 18, marginTop: 26, flexWrap: 'wrap', fontSize: '0.84rem', color: 'var(--ld-ink-2)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><ShieldCheck size={15} color="#16a34a" /> 19 tests · 5 suites · ~3s</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><BarChart3 size={15} color="#1d4ed8" /> Operator analytics included</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><Sparkles size={15} color="#7c3aed" /> Works with or without an LLM key</span>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="ld-section" style={{ paddingTop: 0 }}>
        <div className="ld-cta reveal">
          <h2>Meet your new front desk.</h2>
          <p>Open the patient portal — book a real appointment, switch to Urdu, or take over as the operator.</p>
          <div className="row">
            <Link to="/portal" className="ld-btn ld-btn-white ld-btn-lg">
              <MessageSquare size={17} /> Open the live portal
            </Link>
            <Link to="/portal" className="ld-btn ld-btn-outline-w ld-btn-lg">
              <Printer size={17} /> Book & print a slip
            </Link>
          </div>
        </div>
      </section>

      {/* footer */}
      <footer className="ld-footer">
        <div className="ld-footer-inner">
          <div style={{ maxWidth: 320 }}>
            <Link to="/" className="ld-brand" style={{ marginBottom: 12 }}>
              <span className="ld-brand-mark"><Stethoscope size={20} strokeWidth={2.2} /></span>
              <span>
                <span className="ld-brand-name">Faisal Hospital</span><br />
                <span className="ld-brand-sub">AI Receptionist</span>
              </span>
            </Link>
            <p style={{ marginTop: 12, lineHeight: 1.6 }}>Bilingual AI front desk — chat, voice, scheduling, triage and live operator takeover.</p>
          </div>
          <div className="cols">
            <div>
              <h4>Demo</h4>
              <ul>
                <li><Link to="/portal">Patient portal</Link></li>
                <li><Link to="/voice">Voice assistant</Link></li>
                <li><Link to="/admin/login">Operator desk</Link></li>
              </ul>
            </div>
            <div>
              <h4>Project</h4>
              <ul>
                <li><a href="https://github.com/zaid-mian/AI-Receptionist" target="_blank" rel="noreferrer">GitHub repository</a></li>
                <li><Link to="/privacy">Privacy policy</Link></li>
                <li><Link to="/terms">Terms of service</Link></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="ld-disclaimer">
          Demo project for portfolio purposes. "Faisal Hospital" is a fictional dataset — doctors, schedules and fees are sample data, not a real medical institution. Not medical advice; emergencies should call local emergency services.
        </div>
      </footer>
    </div>
  );
}
