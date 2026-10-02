import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Send, Mic } from 'lucide-react';
import { api, isApiError, postSSE } from '../api/client';
import type { ChatChannel, ChatEvent } from '../api/types';
import MessageBubble, { type ChatMessageItem } from './MessageBubble';

let seq = 1;
const nextId = () => `msg_${Date.now()}_${seq++}`;

export interface ActionChip {
  label: string;
  prompt: string;
}

export interface PopularSearch {
  label: string;
  prompt: string;
}

interface ChatPanelProps {
  channel: ChatChannel;
  conversationId: string | null;
  onConversationId: (id: string) => void;
  /** Increment to wipe the thread and start a fresh conversation. */
  resetSignal: number;
  greeting?: string;
  placeholder?: string;
  /** Set to dispatch a message programmatically (e.g. quick-prompt chips). */
  externalPrompt?: { text: string; nonce: number } | null;
  /** Fired when a streamed assistant turn finishes (or fails). */
  onTurnDone?: () => void;
  actionChips?: ActionChip[];
  popularSearches?: PopularSearch[];
  onVoiceClick?: () => void;
}

/**
 * Streaming chat panel. Talks to POST /api/v1/chat (POST+SSE) and renders
 * meta / tool / sources / token / appointment / escalation / done events.
 * Never exposes chain-of-thought — only high-level tool labels and sources.
 */
export default function ChatPanel({
  channel,
  conversationId,
  onConversationId,
  resetSignal,
  greeting,
  placeholder = 'Type your message…',
  externalPrompt,
  onTurnDone,
  actionChips,
  popularSearches,
  onVoiceClick,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessageItem[]>(() =>
    greeting ? [{ id: nextId(), role: 'assistant', content: greeting }] : [],
  );
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [failedMessage, setFailedMessage] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const convIdRef = useRef<string | null>(conversationId);
  convIdRef.current = conversationId;
  const onConvIdRef = useRef(onConversationId);
  onConvIdRef.current = onConversationId;
  const onTurnDoneRef = useRef(onTurnDone);
  onTurnDoneRef.current = onTurnDone;

  // Fresh conversation: abort in-flight stream, clear thread, re-seed greeting.
  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setSending(false);
    setStreamError(null);
    setFailedMessage(null);
    setInput('');
    setMessages(greeting ? [{ id: nextId(), role: 'assistant', content: greeting }] : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  // Never leave a stream hanging when the panel unmounts.
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  // Poll conversation messages to receive live human operator replies
  useEffect(() => {
    if (!conversationId) return;
    let alive = true;
    const checkOperatorReplies = async () => {
      if (sending) return;
      try {
        const res = await api.get<{ conversation: unknown; messages: Array<{ id: number; role: string; content: string; tool_calls?: unknown[]; sources?: unknown[] }> }>(
          `/conversations/${encodeURIComponent(conversationId)}`
        );
        if (!alive || !res?.messages) return;

        const dbAssistantMsgs = res.messages.filter((m: { role: string }) => m.role === 'assistant');
        setMessages((current: ChatMessageItem[]) => {
          const curAssistantCount = current.filter((m: ChatMessageItem) => m.role === 'assistant' && !m.pending && m.content).length;
          if (dbAssistantMsgs.length > curAssistantCount) {
            const missing = dbAssistantMsgs.slice(curAssistantCount);
            if (missing.length === 0) return current;
            const newItems: ChatMessageItem[] = missing.map((m: { id: number; content: string; tool_calls?: unknown[]; sources?: unknown[] }) => ({
              id: `op_${m.id}_${Date.now()}`,
              role: 'assistant',
              content: m.content,
              tools: Array.isArray(m.tool_calls) ? (m.tool_calls as any) : undefined,
              sources: Array.isArray(m.sources) ? (m.sources as any) : undefined,
            }));
            return [...current, ...newItems];
          }
          return current;
        });
      } catch {
        // silent
      }
    };

    const timer = setInterval(checkOperatorReplies, 2500);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [conversationId, sending]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
  };

  const patchAssistant = useCallback((id: string, fn: (m: ChatMessageItem) => ChatMessageItem) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? fn(m) : m)));
  }, []);

  const handleEvent = useCallback(
    (assistantId: string, ev: ChatEvent) => {
      switch (ev.event) {
        case 'meta':
          onConvIdRef.current(ev.data.conversation_id);
          break;
        case 'tool': {
          const t = ev.data;
          patchAssistant(assistantId, (m) => {
            const tools = [...(m.tools ?? [])];
            const entry = { tool: t.tool, label: t.label, phase: t.phase, summary: t.summary };
            const i = tools.findIndex((x) => x.tool === t.tool);
            if (i >= 0) tools[i] = entry;
            else tools.push(entry);
            return { ...m, tools };
          });
          break;
        }
        case 'sources':
          patchAssistant(assistantId, (m) => ({ ...m, sources: ev.data.sources }));
          break;
        case 'token':
          patchAssistant(assistantId, (m) => ({ ...m, content: m.content + ev.data.text }));
          break;
        case 'appointment':
          patchAssistant(assistantId, (m) => ({ ...m, appointment: ev.data }));
          break;
        case 'escalation':
          patchAssistant(assistantId, (m) => ({ ...m, escalated: ev.data.reason }));
          break;
        case 'done':
          patchAssistant(assistantId, (m) => ({
            ...m,
            pending: false,
            latencyMs: ev.data.latency_ms,
            outcome: ev.data.outcome,
          }));
          break;
        case 'error':
          setStreamError(ev.data.message);
          patchAssistant(assistantId, (m) => ({ ...m, pending: false }));
          break;
      }
    },
    [patchAssistant],
  );

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || sending) return;
      setStreamError(null);
      setFailedMessage(null);
      stickRef.current = true;

      const userMsg: ChatMessageItem = { id: nextId(), role: 'user', content: text };
      const assistantId = nextId();
      const assistantMsg: ChatMessageItem = {
        id: assistantId,
        role: 'assistant',
        content: '',
        pending: true,
      };
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setInput('');
      setSending(true);

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        await postSSE(
          '/chat',
          {
            conversation_id: convIdRef.current ?? undefined,
            message: text,
            channel,
          },
          (ev) => handleEvent(assistantId, ev),
          ctrl.signal,
        );
        // Stream ended — make sure no message is stuck in "typing" state.
        patchAssistant(assistantId, (m) => ({ ...m, pending: false }));
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        const msg = isApiError(err) ? err.message : 'Something went wrong. Please try again.';
        setStreamError(msg);
        setFailedMessage(text);
        patchAssistant(assistantId, (m) => ({
          ...m,
          pending: false,
          content:
            m.content ||
            'Sorry, I ran into an issue connecting to the hospital system. Please try again, or ask me to transfer you to the reception operator.',
        }));
      } finally {
        if (abortRef.current === ctrl) abortRef.current = null;
        setSending(false);
        onTurnDoneRef.current?.();
      }
    },
    [sending, channel, handleEvent, patchAssistant],
  );

  const retry = () => {
    if (failedMessage) {
      // Remove the failed assistant placeholder, then re-send.
      setMessages((prev) => prev.filter((m) => !(m.role === 'assistant' && m.pending !== true && m.content === '')));
      void send(failedMessage);
    }
  };

  // Programmatic sends (quick prompts). Route through a ref so the effect
  // below doesn't need to re-subscribe on every keystroke.
  const sendRef = useRef(send);
  sendRef.current = send;
  const lastPromptNonce = useRef(0);
  useEffect(() => {
    if (externalPrompt && externalPrompt.nonce !== lastPromptNonce.current) {
      lastPromptNonce.current = externalPrompt.nonce;
      void sendRef.current(externalPrompt.text);
    }
  }, [externalPrompt]);

  const lastAssistantStreaming = messages.some((m) => m.role === 'assistant' && m.pending);

  return (
    <div className="chat-panel card">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="chat-messages"
        role="log"
        aria-live="polite"
        aria-label="Conversation"
      >
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        {actionChips && actionChips.length > 0 && messages.length <= 1 && (
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            marginTop: '2px',
            marginLeft: '42px',
            marginBottom: '8px'
          }}>
            {actionChips.map((chip, i) => (
              <button
                key={i}
                type="button"
                onClick={() => void send(chip.prompt)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: '20px',
                  padding: '6px 14px',
                  fontSize: '0.8125rem',
                  color: '#1e40af',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#eff6ff';
                  e.currentTarget.style.borderColor = '#93c5fd';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#f8fafc';
                  e.currentTarget.style.borderColor = '#cbd5e1';
                }}
              >
                <span>{chip.label}</span>
              </button>
            ))}
          </div>
        )}
        {sending && !lastAssistantStreaming && (
          <div className="msg-row assistant">
            <div className="typing-indicator" aria-label="Assistant is thinking">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
      </div>

      {streamError && (
        <div className="chat-error" role="alert">
          <AlertCircle size={15} strokeWidth={2} />
          <span>{streamError}</span>
          {failedMessage && (
            <button className="btn btn-sm btn-secondary" onClick={retry}>
              Retry
            </button>
          )}
        </div>
      )}

      <form
        className="chat-input-bar"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        style={{ position: 'relative', display: 'flex', alignItems: 'center' }}
      >
        {onVoiceClick && (
          <button
            type="button"
            onClick={onVoiceClick}
            title="Start Voice Receptionist"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#64748b',
              padding: '8px 10px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--radius-sm)',
              transition: 'color 0.15s ease'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#1d4ed8'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#64748b'; }}
          >
            <Mic size={18} strokeWidth={2} />
          </button>
        )}
        <label htmlFor="chat-input" className="sr-only">
          Message the AI receptionist
        </label>
        <input
          id="chat-input"
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          disabled={sending}
          style={{ flex: 1 }}
        />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={sending || !input.trim()}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: '#026aa7',
            borderColor: '#026aa7',
            padding: '8px 18px',
            borderRadius: 'var(--radius-sm)',
            fontWeight: 600
          }}
        >
          <Send size={13} strokeWidth={2} />
          <span>{sending ? 'Sending…' : 'Send'}</span>
        </button>
      </form>

      {popularSearches && popularSearches.length > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 18px 12px',
          fontSize: '0.75rem',
          color: '#64748b',
          flexWrap: 'wrap',
          borderTop: '1px solid #f1f5f9'
        }}>
          <span style={{ fontWeight: 600, color: '#334155', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            Popular Searches:
          </span>
          {popularSearches.map((s, idx) => (
            <span key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {idx > 0 && <span style={{ color: '#cbd5e1' }}>•</span>}
              <button
                type="button"
                onClick={() => void send(s.prompt)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  color: '#2563eb',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  textUnderlineOffset: '2px'
                }}
              >
                {s.label}
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
