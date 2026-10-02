import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Mic, FileText, ArrowLeft, ShieldCheck, Sparkles } from 'lucide-react';
import { api } from '../api/client';
import type { Settings, VoiceConfig } from '../api/types';
import { usePageMeta } from '../layout/PageMeta';
import VoiceCall from '../components/VoiceCall';
import TranscriptLine from '../components/TranscriptLine';
import EmptyState from '../components/EmptyState';

interface Turn {
  id: string;
  who: 'user' | 'ai';
  text: string;
  interim?: boolean;
}

let seq = 1;
const uid = () => `t_${Date.now()}_${seq++}`;

export default function Voice() {
  const location = useLocation();
  const isPublic = location.pathname === '/voice';

  usePageMeta(isPublic ? 'Voice Receptionist' : 'Voice Demo');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [speechRate, setSpeechRate] = useState(1.0);
  const [note, setNote] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'call' | 'transcript'>('call');
  const aiTurnId = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [s, v] = await Promise.all([
          api.get<Settings>('/settings'),
          api.get<VoiceConfig>('/voice/config'),
        ]);
        if (!alive) return;
        if (typeof s.voice?.rate === 'number') setSpeechRate(s.voice.rate);
        setNote(v.note);
      } catch {
        // Voice works without backend config; keep defaults.
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns]);

  const handleUserTurn = useCallback((text: string) => {
    aiTurnId.current = null;
    const clean = text.trim();
    if (!clean) return;
    setTurns((prev) => [
      ...prev.filter((t) => !t.interim),
      { id: uid(), who: 'user', text: clean },
    ]);
  }, []);

  const handleAiToken = useCallback((full: string) => {
    const text = full.trim();
    if (!text) return;
    setTurns((prev) => {
      const existingIdx = aiTurnId.current
        ? prev.findIndex((t) => t.id === aiTurnId.current)
        : -1;
      if (existingIdx >= 0) {
        const next = [...prev];
        next[existingIdx] = { ...next[existingIdx], text };
        return next;
      }
      const id = uid();
      aiTurnId.current = id;
      return [...prev.filter((t) => !t.interim), { id, who: 'ai', text }];
    });
  }, []);

  const handleInterim = useCallback((text: string) => {
    setTurns((prev) => {
      const base = prev.filter((t) => !t.interim);
      if (!text || !text.trim()) return base;
      return [...base, { id: '__interim', who: 'user', text: text.trim(), interim: true }];
    });
  }, []);

  const content = (
    <>
      {isPublic ? (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
            <h1 style={{ fontSize: 'clamp(1.25rem, 3.5vw, 1.75rem)', fontWeight: 800, color: 'var(--ink-1)', letterSpacing: '-0.02em', margin: 0 }}>
              Faisal Hospital Voice AI Assistant
            </h1>
            <span className="badge badge-accent" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
              <Sparkles size={12} /> Live Web Speech & Neural TTS
            </span>
          </div>
          <div className="sub" style={{ fontSize: '0.875rem', color: 'var(--ink-3)', maxWidth: 760, lineHeight: 1.5 }}>
            Speak naturally with our automated medical receptionist in English or Urdu (اردو).
            Inquire about consultant doctor OPD schedules, department locations, diagnostic lab timings, or book an appointment.
          </div>
        </div>
      ) : (
        <div className="page-head">
          <div>
            <h1>Voice Demo</h1>
            <div className="sub">
              Talk to the AI receptionist in your browser (in English or اردو). Same agent, same
              tools, same booking flow as text chat. You can interrupt the AI mid-reply.
            </div>
          </div>
        </div>
      )}

      {/* Mobile Tab Switcher: Only displayed on screens <= 860px */}
      <div className="voice-mobile-tabs" role="tablist" aria-label="Voice layout view">
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === 'call'}
          className={`voice-tab-btn ${mobileTab === 'call' ? 'active' : ''}`}
          onClick={() => setMobileTab('call')}
        >
          <Mic size={15} /> Voice Stage
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === 'transcript'}
          className={`voice-tab-btn ${mobileTab === 'transcript' ? 'active' : ''}`}
          onClick={() => setMobileTab('transcript')}
        >
          <FileText size={15} /> Live Transcript {turns.length > 0 && <span className="tab-badge">{turns.length}</span>}
        </button>
      </div>

      <div className={`voice-layout ${mobileTab === 'call' ? 'show-call' : 'show-transcript'}`}>
        <div className="voice-col-call">
          <div className="card">
            <VoiceCall
              speechRate={speechRate}
              onUserTurn={handleUserTurn}
              onAiToken={handleAiToken}
              onInterim={handleInterim}
            />
          </div>
        </div>

        <div className="voice-col-transcript">
          <div className="card voice-transcript-card">
            <div className="card-pad" style={{ borderBottom: '1px solid var(--border-soft)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <div>
                <div className="card-title">Live Transcript</div>
                <div className="card-sub">Real-time bilingual speech and audio transmission log.</div>
              </div>
              {turns.length > 0 && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setTurns([])}
                  style={{ fontSize: 11.5, padding: '4px 8px' }}
                >
                  Clear log
                </button>
              )}
            </div>
            <div ref={scrollRef} className="transcript-panel" role="log" aria-live="polite" aria-label="Voice transcript">
              {turns.length === 0 ? (
                <EmptyState
                  icon={<Mic size={24} strokeWidth={1.5} />}
                  title="No transcript yet"
                  description="Press “Start Voice Conversation” and speak naturally. Your words and the AI's replies will appear here in real time."
                />
              ) : (
                turns.map((t) => (
                  <TranscriptLine key={t.id} who={t.who} text={t.text} interim={t.interim} />
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {note && (
        <div className="card-sub" style={{ marginTop: 14 }}>
          {note}
        </div>
      )}

      {isPublic && (
        <div style={{ marginTop: 24, padding: '14px 18px', background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8125rem', color: 'var(--ink-3)' }}>
            <ShieldCheck size={16} color="#059669" />
            <span>Faisal Hospital Medical Center · All voice conversations are encrypted and confidential.</span>
          </div>
          <Link to="/" style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}>
            Return to Main Patient Portal →
          </Link>
        </div>
      )}
    </>
  );

  if (isPublic) {
    return (
      <div className="voice-page-wrapper public">
        {/* Top Emergency Strip */}
        <div style={{
          background: '#070b14',
          color: '#e2e8f0',
          padding: '6px 16px',
          fontSize: '0.78125rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px',
          borderBottom: '1px solid rgba(255,255,255,0.08)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#f87171', fontWeight: 600 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
              24/7 Emergency: (041) 920-1431
            </span>
            <span style={{ color: '#cbd5e1' }}>Direct Helpline: <strong>111-119-119</strong></span>
          </div>
          <div style={{ color: '#94a3b8' }}>
            Faisalabad, Punjab
          </div>
        </div>

        {/* Public Header */}
        <header className="voice-public-header">
          <div className="voice-public-header-inner">
            <Link to="/" className="voice-back-btn">
              <ArrowLeft size={15} /> Back to Portal
            </Link>
            <div className="voice-hospital-badge">
              <span className="voice-pulse-dot" />
              <strong>FAISAL HOSPITAL</strong>
              <span style={{ color: 'var(--ink-4)' }}>·</span>
              <span style={{ color: 'var(--ink-3)' }}>Voice Receptionist</span>
            </div>
            <div className="voice-emergency-hint">
              Casualty: <strong>1122</strong>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="voice-main-container">
          {content}
        </main>
      </div>
    );
  }

  return (
    <div className="voice-page-wrapper admin">
      {content}
    </div>
  );
}
