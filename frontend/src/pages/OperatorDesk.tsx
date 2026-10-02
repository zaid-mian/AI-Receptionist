import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Radio,
  AlertTriangle,
  UserCheck,
  User,
  Bot,
  Send,
  ArrowRightLeft,
  Headphones,
  MessageSquare,
  ShieldAlert,
  Info,
} from 'lucide-react';
import { api, isApiError } from '../api/client';
import type { ConversationDetail, ConversationMessage, ConversationSummary } from '../api/types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { usePageMeta } from '../layout/PageMeta';
import Spinner from '../components/Spinner';
import { formatClockTime, formatDuration, humanize, timeAgo } from '../utils/format';

const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ||
  'http://localhost:8787';

const CANNED_REPLIES = [
  { label: 'Urdu Greeting', text: 'السلام علیکم! میں فیصل ہسپتال کے فرنٹ ڈیسک سے بول رہا ہوں۔ میں آپ کی کیا مدد کر سکتا ہوں؟' },
  { label: 'English Greeting', text: 'Assalam-o-Alaikum! Welcome to Faisal Hospital reception desk. How may I assist you today?' },
  { label: 'Checking Schedule', text: 'Please hold for a moment while I check the consultant schedule in our clinical roster.' },
  { label: 'Bring CNIC', text: 'Kindly bring your original CNIC / B-Form and any previous medical reports when visiting the hospital.' },
  { label: '24/7 Emergency', text: 'Our Emergency & Trauma Centre is active 24/7 at Basement Floor 1. Ambulance Helpline: 051-111-324-725.' },
  { label: 'Counter Token', text: 'Your request has been registered at the front desk. Please visit Counter 3 in Main OPD for your appointment token slip.' },
];

export default function OperatorDesk() {
  usePageMeta('Operator Desk (Live)');
  const { user } = useAuth();
  const toast = useToast();

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'escalated' | 'taken_over' | 'open'>('all');
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [liveConnected, setLiveConnected] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;

  // Load conversation list
  const loadList = useCallback(async () => {
    try {
      const res = await api.get<{ conversations: ConversationSummary[] }>('/conversations?limit=60');
      setConversations(res.conversations);
      if (!selectedIdRef.current && res.conversations.length > 0) {
        setSelectedId(res.conversations[0].id);
      }
    } catch (err) {
      console.error('Failed to load conversation list:', err);
    } finally {
      setLoadingList(false);
    }
  }, []);

  // Load conversation detail
  const loadDetail = useCallback(async (id: string) => {
    setLoadingDetail(true);
    try {
      const res = await api.get<ConversationDetail>(`/conversations/${encodeURIComponent(id)}`);
      setDetail(res);
    } catch (err) {
      toast('error', isApiError(err) ? err.message : 'Failed to load conversation messages.');
    } finally {
      setLoadingDetail(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (selectedId) {
      void loadDetail(selectedId);
    } else {
      setDetail(null);
    }
  }, [selectedId, loadDetail]);

  // Auto-scroll message feed
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [detail?.messages]);

  // Real-time SSE Connection
  useEffect(() => {
    const sseUrl = `${API_BASE}/api/v1/conversations/live-stream`;
    const es = new EventSource(sseUrl);

    es.onopen = () => {
      setLiveConnected(true);
    };

    es.onerror = () => {
      setLiveConnected(false);
    };

    // On new message
    es.addEventListener('message', (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data) as {
          conversation_id: string;
          role: 'user' | 'assistant' | 'system';
          content: string;
          created_at: string;
          operator?: string | boolean;
        };

        // If message is for currently active conversation, append it
        if (selectedIdRef.current && data.conversation_id === selectedIdRef.current) {
          setDetail((prev) => {
            if (!prev) return prev;
            const newMsg: ConversationMessage = {
              id: Date.now(),
              role: data.role,
              content: data.content,
              created_at: data.created_at || new Date().toISOString(),
            };
            return {
              ...prev,
              messages: [...prev.messages, newMsg],
            };
          });
        }

        // Update list preview
        setConversations((prev) =>
          prev.map((c) =>
            c.id === data.conversation_id
              ? { ...c, summary: data.content.slice(0, 80) }
              : c
          )
        );
      } catch (err) {
        console.warn('Failed to parse live message SSE event:', err);
      }
    });

    // On conversation update
    es.addEventListener('conversation_update', (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data) as {
          conversation_id: string;
          last_message?: string;
          taken_over?: boolean;
          taken_over_by?: string | null;
          status?: string;
          escalated?: boolean;
          escalation_reason?: string;
        };

        setConversations((prev) =>
          prev.map((c) => {
            if (c.id !== data.conversation_id) return c;
            return {
              ...c,
              summary: data.last_message || c.summary,
              taken_over: data.taken_over !== undefined ? data.taken_over : c.taken_over,
              taken_over_by: data.taken_over_by !== undefined ? data.taken_over_by : c.taken_over_by,
              status: (data.status as any) || c.status,
              escalated: data.escalated !== undefined ? data.escalated : c.escalated,
              escalation_reason: data.escalation_reason || c.escalation_reason,
            };
          })
        );

        if (selectedIdRef.current === data.conversation_id) {
          setDetail((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              conversation: {
                ...prev.conversation,
                taken_over: data.taken_over !== undefined ? data.taken_over : prev.conversation.taken_over,
                taken_over_by: data.taken_over_by !== undefined ? data.taken_over_by : prev.conversation.taken_over_by,
                status: (data.status as any) || prev.conversation.status,
                escalated: data.escalated !== undefined ? data.escalated : prev.conversation.escalated,
                escalation_reason: data.escalation_reason || prev.conversation.escalation_reason,
              },
            };
          });
        }
      } catch (err) {
        console.warn('Failed to parse conversation_update SSE event:', err);
      }
    });

    // On takeover event
    es.addEventListener('takeover', (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data) as { conversation_id: string; taken_over: boolean; operator?: string };
        setConversations((prev) =>
          prev.map((c) =>
            c.id === data.conversation_id
              ? { ...c, taken_over: data.taken_over, taken_over_by: data.operator ?? null }
              : c
          )
        );
        if (selectedIdRef.current === data.conversation_id) {
          setDetail((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              conversation: {
                ...prev.conversation,
                taken_over: data.taken_over,
                taken_over_by: data.operator ?? null,
              },
            };
          });
        }
      } catch (err) {
        console.warn('Failed to parse takeover SSE event:', err);
      }
    });

    // On escalation event
    es.addEventListener('escalation', (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data) as { conversation_id: string; reason: string };
        toast('info', `Emergency Escalation in conversation ${data.conversation_id.slice(0, 12)}: ${data.reason}`);
        void loadList();
      } catch (err) {
        console.warn('Failed to parse escalation SSE event:', err);
      }
    });

    return () => {
      es.close();
    };
  }, [loadList, toast]);

  // Take over action
  const handleTakeover = async () => {
    if (!selectedId || actionInProgress) return;
    setActionInProgress(true);
    const opName = user?.name || 'Reception Desk Staff';
    try {
      await api.post(`/conversations/${encodeURIComponent(selectedId)}/takeover`, {
        operator_name: opName,
      });
      toast('success', `Control assumed by ${opName}. AI paused.`);
      await loadDetail(selectedId);
      await loadList();
    } catch (err) {
      toast('error', isApiError(err) ? err.message : 'Takeover failed.');
    } finally {
      setActionInProgress(false);
    }
  };

  // Hand back to AI action
  const handleRelease = async () => {
    if (!selectedId || actionInProgress) return;
    setActionInProgress(true);
    try {
      await api.post(`/conversations/${encodeURIComponent(selectedId)}/release`, {});
      toast('info', 'Control released back to autonomous AI Receptionist.');
      await loadDetail(selectedId);
      await loadList();
    } catch (err) {
      toast('error', isApiError(err) ? err.message : 'Release failed.');
    } finally {
      setActionInProgress(false);
    }
  };

  // Escalate action
  const handleEscalate = async () => {
    if (!selectedId || actionInProgress) return;
    setActionInProgress(true);
    try {
      await api.post(`/conversations/${encodeURIComponent(selectedId)}/escalate`, {
        reason: 'Hospital front desk supervisor escalated this patient.',
      });
      toast('info', 'Conversation marked as Escalated.');
      await loadDetail(selectedId);
      await loadList();
    } catch (err) {
      toast('error', isApiError(err) ? err.message : 'Escalation failed.');
    } finally {
      setActionInProgress(false);
    }
  };

  // Send reply as human receptionist
  const handleSendReply = async () => {
    const text = replyText.trim();
    if (!selectedId || !text || sendingReply) return;
    setSendingReply(true);

    try {
      // Auto-takeover if not already taken over
      if (!detail?.conversation.taken_over) {
        await api.post(`/conversations/${encodeURIComponent(selectedId)}/takeover`, {
          operator_name: user?.name || 'Reception Desk Staff',
        });
      }

      await api.post(`/conversations/${encodeURIComponent(selectedId)}/reply`, {
        message: text,
        operator_name: user?.name || 'Front Desk Staff',
      });

      setReplyText('');
      await loadDetail(selectedId);
      await loadList();
    } catch (err) {
      toast('error', isApiError(err) ? err.message : 'Failed to send operator reply.');
    } finally {
      setSendingReply(false);
    }
  };

  // Filtered conversation list
  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      if (filterTab === 'escalated' && !c.escalated) return false;
      if (filterTab === 'taken_over' && !c.taken_over) return false;
      if (filterTab === 'open' && c.status !== 'open') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const nameMatch = (c.customer_name || '').toLowerCase().includes(q);
        const summaryMatch = (c.summary || '').toLowerCase().includes(q);
        const intentMatch = (c.intent || '').toLowerCase().includes(q);
        const idMatch = c.id.toLowerCase().includes(q);
        return nameMatch || summaryMatch || intentMatch || idMatch;
      }
      return true;
    });
  }, [conversations, filterTab, searchQuery]);

  const stats = useMemo(() => {
    return {
      total: conversations.length,
      escalated: conversations.filter((c) => c.escalated).length,
      takenOver: conversations.filter((c) => c.taken_over).length,
      open: conversations.filter((c) => c.status === 'open').length,
    };
  }, [conversations]);

  const activeConv = detail?.conversation;

  return (
    <div className="operator-desk-layout">
      {/* Top Console Bar */}
      <div className="operator-header">
        <div>
          <div className="operator-title-row">
            <h1>Front Desk Operator & Triage Console</h1>
            <span className={`live-feed-pill ${liveConnected ? 'connected' : 'disconnected'}`}>
              <span className="pulsing-dot" />
              {liveConnected ? 'Real-Time SSE Feed Active' : 'Connecting to Live Feed…'}
            </span>
          </div>
          <div className="operator-sub">
            Monitor real-time patient interactions, handle clinical escalations, and seamlessly take over chats with zero downtime.
          </div>
        </div>

        <div className="operator-stats-grid">
          <div className="op-stat-card">
            <div className="op-stat-val">{stats.total}</div>
            <div className="op-stat-lbl">Total Inbound</div>
          </div>
          <div className="op-stat-card critical">
            <div className="op-stat-val">{stats.escalated}</div>
            <div className="op-stat-lbl" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <AlertTriangle size={13} /> Escalated
            </div>
          </div>
          <div className="op-stat-card takeover">
            <div className="op-stat-val">{stats.takenOver}</div>
            <div className="op-stat-lbl" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <UserCheck size={13} /> Under Human Care
            </div>
          </div>
          <div className="op-stat-card active">
            <div className="op-stat-val">{stats.open}</div>
            <div className="op-stat-lbl" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <Radio size={13} /> Open Threads
            </div>
          </div>
        </div>
      </div>

      {/* Main Split Screen */}
      <div className="operator-workspace">
        {/* Left Side: Live Inbound Queue */}
        <aside className="operator-queue-panel">
          <div className="queue-controls">
            <div className="queue-search-wrap">
              <input
                type="text"
                className="input input-sm"
                placeholder="Search patient, query or intent…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="queue-tabs">
              <button
                className={`queue-tab ${filterTab === 'all' ? 'active' : ''}`}
                onClick={() => setFilterTab('all')}
              >
                All ({conversations.length})
              </button>
              <button
                className={`queue-tab ${filterTab === 'escalated' ? 'active' : ''}`}
                onClick={() => setFilterTab('escalated')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                <AlertTriangle size={12} /> Escalated ({stats.escalated})
              </button>
              <button
                className={`queue-tab ${filterTab === 'taken_over' ? 'active' : ''}`}
                onClick={() => setFilterTab('taken_over')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                <UserCheck size={12} /> Operator ({stats.takenOver})
              </button>
              <button
                className={`queue-tab ${filterTab === 'open' ? 'active' : ''}`}
                onClick={() => setFilterTab('open')}
              >
                Active ({stats.open})
              </button>
            </div>
          </div>

          <div className="queue-list">
            {loadingList ? (
              <div className="loading-center" style={{ padding: '40px 0' }}>
                <Spinner label="Loading live stream queue…" />
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="queue-empty">No conversations matching this filter.</div>
            ) : (
              filteredConversations.map((c) => {
                const isSelected = c.id === selectedId;
                return (
                  <div
                    key={c.id}
                    className={`queue-item ${isSelected ? 'selected' : ''} ${c.escalated ? 'is-escalated' : ''} ${c.taken_over ? 'is-takeover' : ''}`}
                    onClick={() => setSelectedId(c.id)}
                  >
                    <div className="queue-item-top">
                      <span className="queue-item-name">{c.customer_name || 'Anonymous Patient'}</span>
                      <span className="queue-item-time">{timeAgo(c.started_at)}</span>
                    </div>

                    <div className="queue-item-meta">
                      <span className="queue-badge channel">{c.channel}</span>
                      <span className="queue-badge intent">{humanize(c.intent || 'General Inquiry')}</span>

                      {c.escalated && (
                        <span className="queue-badge escalated" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <AlertTriangle size={11} /> Escalated
                        </span>
                      )}
                      {c.taken_over && (
                        <span className="queue-badge takeover" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <UserCheck size={11} /> Operator Active
                        </span>
                      )}
                    </div>

                    <div className="queue-item-snippet">
                      {c.summary || 'New conversation started…'}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* Right Side: Conversation Transcript & Operator Controls */}
        <section className="operator-chat-panel">
          {!activeConv || !detail ? (
            <div className="chat-empty-state">
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px', color: 'var(--ink-4, #94a3b8)' }}>
                <MessageSquare size={36} strokeWidth={1.5} />
              </div>
              <div style={{ fontWeight: 600, fontSize: '1.05rem', color: '#1e293b', marginBottom: '6px' }}>
                No Conversation Selected
              </div>
              <div style={{ color: '#64748b', fontSize: '0.875rem' }}>
                Choose a conversation from the live queue on the left to monitor the transcript or take over.
              </div>
            </div>
          ) : (
            <>
              {/* Active Conversation Banner & Controls */}
              <div className="chat-header-bar">
                <div className="chat-patient-info">
                  <div className="chat-patient-title">
                    <span className="patient-name">{activeConv.customer_name || 'Anonymous Patient'}</span>
                    <span className="patient-id">({activeConv.id})</span>
                    <span className={`status-pill ${activeConv.status}`}>{activeConv.status.toUpperCase()}</span>
                  </div>
                  <div className="chat-patient-sub">
                    <span>Started: {formatClockTime(activeConv.started_at)}</span>
                    <span>•</span>
                    <span>Duration: {formatDuration(activeConv.duration_s)}</span>
                    <span>•</span>
                    <span>Channel: {activeConv.channel}</span>
                    <span>•</span>
                    <span>Intent: {humanize(activeConv.intent || 'general')}</span>
                  </div>
                </div>

                <div className="chat-actions-group">
                  {activeConv.taken_over ? (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={handleRelease}
                      disabled={actionInProgress}
                      title="Return patient to autonomous AI Receptionist"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                      <ArrowRightLeft size={13} strokeWidth={2} /> Hand Back to AI
                    </button>
                  ) : (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={handleTakeover}
                      disabled={actionInProgress}
                      title="Pause AI and take over live messaging"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Headphones size={13} strokeWidth={2} /> Take Over Chat
                    </button>
                  )}

                  {!activeConv.escalated && (
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={handleEscalate}
                      disabled={actionInProgress}
                      title="Mark as emergency/clinical escalation"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                      <ShieldAlert size={13} strokeWidth={2} /> Escalate
                    </button>
                  )}
                </div>
              </div>

              {/* Status Alert Banner */}
              {activeConv.taken_over && (
                <div className="takeover-active-alert">
                  <span className="takeover-icon" style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <UserCheck size={16} strokeWidth={2} />
                  </span>
                  <div>
                    <strong>Human Operator Mode Active:</strong> You ({activeConv.taken_over_by || user?.name || 'Reception Staff'}) are directly answering this patient. Autonomous AI turns are paused.
                  </div>
                </div>
              )}

              {activeConv.escalated && (
                <div className="escalation-active-alert">
                  <span className="takeover-icon" style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <AlertTriangle size={16} strokeWidth={2} />
                  </span>
                  <div>
                    <strong>Clinical Escalation Alert:</strong> {activeConv.escalation_reason || 'This conversation requires human front desk supervision.'}
                  </div>
                </div>
              )}

              {/* Message Transcript Thread */}
              <div className="chat-messages-container">
                {loadingDetail ? (
                  <div className="loading-center" style={{ padding: '60px 0' }}>
                    <Spinner label="Loading conversation thread…" />
                  </div>
                ) : detail.messages.length === 0 ? (
                  <div className="queue-empty">No messages recorded in this conversation yet.</div>
                ) : (
                  detail.messages.map((m, idx) => {
                    const isUser = m.role === 'user';
                    const isSystem = m.role === 'system';

                    if (isSystem) {
                      return (
                        <div key={idx} className="system-notice-row">
                          <span className="system-notice-badge">
                            <Info size={12} style={{ display: 'inline', marginRight: 4 }} />
                            {m.content}
                          </span>
                        </div>
                      );
                    }

                    return (
                      <div key={idx} className={`chat-bubble-row ${isUser ? 'user' : 'assistant'}`}>
                        <div className="bubble-avatar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {isUser ? (
                            <User size={14} strokeWidth={2} />
                          ) : activeConv.taken_over ? (
                            <UserCheck size={14} strokeWidth={2} />
                          ) : (
                            <Bot size={14} strokeWidth={2} />
                          )}
                        </div>
                        <div className="bubble-content-wrap">
                          <div className="bubble-sender-name">
                            {isUser
                              ? activeConv.customer_name || 'Patient'
                              : activeConv.taken_over
                              ? `Receptionist (${activeConv.taken_over_by || 'Staff'})`
                              : 'AI Receptionist'}
                            <span className="bubble-time">{formatClockTime(m.created_at)}</span>
                          </div>
                          <div className={`chat-bubble-box ${isUser ? 'user' : 'assistant'}`}>
                            {m.content}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick Canned Hospital Replies */}
              <div className="canned-replies-bar">
                <span className="canned-label">Quick Responses:</span>
                <div className="canned-chips-scroll">
                  {CANNED_REPLIES.map((c, i) => (
                    <button
                      key={i}
                      type="button"
                      className="canned-chip"
                      onClick={() => setReplyText(c.text)}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Operator Reply Composer */}
              <div className="operator-composer-bar">
                <textarea
                  className="composer-textarea"
                  rows={2}
                  placeholder={
                    activeConv.taken_over
                      ? 'Type response as Front Desk Receptionist… (Ctrl+Enter to send)'
                      : 'Type response (sending will automatically take over chat from AI)…'
                  }
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || !e.shiftKey)) {
                      e.preventDefault();
                      void handleSendReply();
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn btn-primary composer-send-btn"
                  onClick={handleSendReply}
                  disabled={!replyText.trim() || sendingReply}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Send size={13} strokeWidth={2} />
                  <span>{sendingReply ? 'Sending…' : 'Send as Receptionist'}</span>
                </button>
              </div>
            </>
          )}
        </section>
      </div>

      {/* Scoped CSS styling for Operator Desk */}
      <style>{`
        .operator-desk-layout {
          display: flex;
          flex-direction: column;
          height: calc(100vh - var(--topbar-h, 60px) - 32px);
          gap: 16px;
        }

        .operator-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #ffffff;
          padding: 16px 20px;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04);
        }

        .operator-title-row {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .operator-title-row h1 {
          font-size: 1.35rem;
          font-weight: 700;
          color: #0f172a;
          margin: 0;
        }

        .operator-sub {
          font-size: 0.82rem;
          color: #64748b;
          margin-top: 4px;
        }

        .live-feed-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 0.75rem;
          font-weight: 600;
          padding: 3px 8px;
          border-radius: var(--radius-sm);
        }

        .live-feed-pill.connected {
          background: #ecfdf5;
          color: #047857;
          border: 1px solid #a7f3d0;
        }

        .live-feed-pill.disconnected {
          background: #fef2f2;
          color: #b91c1c;
          border: 1px solid #fecaca;
        }

        .pulsing-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #10b981;
          box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
          animation: pulseDot 2s infinite;
        }

        @keyframes pulseDot {
          0% {
            transform: scale(0.95);
            box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
          }
          70% {
            transform: scale(1);
            box-shadow: 0 0 0 6px rgba(16, 185, 129, 0);
          }
          100% {
            transform: scale(0.95);
            box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
          }
        }

        .operator-stats-grid {
          display: flex;
          gap: 12px;
        }

        .op-stat-card {
          padding: 8px 14px;
          border-radius: 8px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          text-align: center;
          min-width: 85px;
        }

        .op-stat-card.critical {
          background: #fff1f2;
          border-color: #fecdd3;
        }
        .op-stat-card.critical .op-stat-val { color: #e11d48; }

        .op-stat-card.takeover {
          background: #f5f3ff;
          border-color: #ddd6fe;
        }
        .op-stat-card.takeover .op-stat-val { color: #7c3aed; }

        .op-stat-card.active {
          background: #f0fdf4;
          border-color: #bbf7d0;
        }
        .op-stat-card.active .op-stat-val { color: #16a34a; }

        .op-stat-val {
          font-size: 1.2rem;
          font-weight: 700;
          color: #0f172a;
          line-height: 1.2;
        }

        .op-stat-lbl {
          font-size: 0.68rem;
          font-weight: 600;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }

        .operator-workspace {
          display: flex;
          gap: 16px;
          flex: 1;
          min-height: 0;
        }

        .operator-queue-panel {
          width: 380px;
          background: #ffffff;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04);
        }

        .queue-controls {
          padding: 12px;
          border-bottom: 1px solid #e2e8f0;
          background: #fafafa;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .queue-tabs {
          display: flex;
          gap: 4px;
          overflow-x: auto;
          scrollbar-width: none;
        }

        .queue-tabs::-webkit-scrollbar { display: none; }

        .queue-tab {
          font-size: 0.75rem;
          padding: 4px 8px;
          border-radius: 6px;
          border: 1px solid transparent;
          background: transparent;
          color: #64748b;
          cursor: pointer;
          white-space: nowrap;
          font-weight: 500;
        }

        .queue-tab.active {
          background: #ffffff;
          color: #0f172a;
          border-color: #cbd5e1;
          font-weight: 600;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }

        .queue-list {
          flex: 1;
          overflow-y: auto;
          padding: 8px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .queue-empty {
          text-align: center;
          padding: 40px 16px;
          color: #94a3b8;
          font-size: 0.85rem;
        }

        .queue-item {
          padding: 10px 12px;
          border-radius: 8px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          cursor: pointer;
          transition: all 0.15s ease;
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .queue-item:hover {
          border-color: #cbd5e1;
          background: #f8fafc;
        }

        .queue-item.selected {
          border-color: var(--accent);
          background: var(--accent-soft);
          box-shadow: 0 0 0 1px var(--accent);
        }

        .queue-item.is-escalated {
          border-color: #fca5a5;
          background: #fff5f5;
        }

        .queue-item.is-takeover {
          border-color: #bfdbfe;
          background: #eff6ff;
        }

        .queue-item-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .queue-item-name {
          font-weight: 600;
          font-size: 0.88rem;
          color: #1e293b;
        }

        .queue-item-time {
          font-size: 0.72rem;
          color: #94a3b8;
        }

        .queue-item-meta {
          display: flex;
          gap: 4px;
          flex-wrap: wrap;
        }

        .queue-badge {
          font-size: 0.68rem;
          padding: 2px 6px;
          border-radius: 4px;
          font-weight: 500;
        }

        .queue-badge.channel { background: #f1f5f9; color: #475569; }
        .queue-badge.intent { background: #e0f2fe; color: #0369a1; }
        .queue-badge.escalated { background: #fee2e2; color: #b91c1c; font-weight: 600; }
        .queue-badge.takeover { background: #ede9fe; color: #6d28d9; font-weight: 600; }

        .queue-item-snippet {
          font-size: 0.78rem;
          color: #64748b;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .operator-chat-panel {
          flex: 1;
          background: #ffffff;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04);
        }

        .chat-empty-state {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 40px;
        }

        .chat-header-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 18px;
          border-bottom: 1px solid #e2e8f0;
          background: #f8fafc;
        }

        .chat-patient-title {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .patient-name {
          font-weight: 700;
          font-size: 1rem;
          color: #0f172a;
        }

        .patient-id {
          font-size: 0.78rem;
          color: #94a3b8;
          font-family: monospace;
        }

        .status-pill {
          font-size: 0.68rem;
          font-weight: 700;
          padding: 2px 7px;
          border-radius: 4px;
        }

        .status-pill.open { background: #dcfce7; color: #15803d; }
        .status-pill.resolved { background: #e0e7ff; color: #4338ca; }
        .status-pill.escalated { background: #fee2e2; color: #b91c1c; }

        .chat-patient-sub {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.75rem;
          color: #64748b;
          margin-top: 2px;
        }

        .chat-actions-group {
          display: flex;
          gap: 8px;
        }

        .takeover-active-alert {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 16px;
          background: #ede9fe;
          color: #5b21b6;
          border-bottom: 1px solid #ddd6fe;
          font-size: 0.83rem;
        }

        .escalation-active-alert {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 16px;
          background: #fee2e2;
          color: #991b1b;
          border-bottom: 1px solid #fecaca;
          font-size: 0.83rem;
        }

        .takeover-icon {
          font-size: 1.15rem;
        }

        .chat-messages-container {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 14px;
          background: #fafafa;
        }

        .system-notice-row {
          display: flex;
          justify-content: center;
          margin: 6px 0;
        }

        .system-notice-badge {
          font-size: 0.75rem;
          background: #e2e8f0;
          color: #475569;
          padding: 2px 8px;
          border-radius: var(--radius-sm);
          font-weight: 500;
        }

        .chat-bubble-row {
          display: flex;
          gap: 10px;
          max-width: 82%;
        }

        .chat-bubble-row.user {
          align-self: flex-start;
        }

        .chat-bubble-row.assistant {
          align-self: flex-end;
          flex-direction: row-reverse;
        }

        .bubble-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.95rem;
          flex-shrink: 0;
        }

        .chat-bubble-row.assistant .bubble-avatar {
          background: #e0e7ff;
        }

        .bubble-content-wrap {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .chat-bubble-row.assistant .bubble-content-wrap {
          align-items: flex-end;
        }

        .bubble-sender-name {
          font-size: 0.72rem;
          font-weight: 600;
          color: #64748b;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .bubble-time {
          font-size: 0.68rem;
          font-weight: normal;
          color: #94a3b8;
        }

        .chat-bubble-box {
          padding: 10px 14px;
          border-radius: 12px;
          font-size: 0.88rem;
          line-height: 1.45;
          word-break: break-word;
        }

        .chat-bubble-box.user {
          background: #ffffff;
          color: #1e293b;
          border: 1px solid #e2e8f0;
          border-top-left-radius: 2px;
          box-shadow: 0 1px 2px rgba(0,0,0,0.03);
        }

        .chat-bubble-box.assistant {
          background: #4f46e5;
          color: #ffffff;
          border-top-right-radius: 2px;
          box-shadow: 0 1px 2px rgba(79, 70, 229, 0.2);
        }

        .canned-replies-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          background: #ffffff;
          border-top: 1px solid #f1f5f9;
        }

        .canned-label {
          font-size: 0.72rem;
          font-weight: 600;
          color: #94a3b8;
          white-space: nowrap;
        }

        .canned-chips-scroll {
          display: flex;
          gap: 6px;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .canned-chips-scroll::-webkit-scrollbar { display: none; }

        .canned-chip {
          font-size: 0.73rem;
          background: #f1f5f9;
          color: #334155;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 3px 10px;
          cursor: pointer;
          white-space: nowrap;
          transition: background 0.15s ease;
        }

        .canned-chip:hover {
          background: #e2e8f0;
        }

        .operator-composer-bar {
          display: flex;
          gap: 10px;
          padding: 12px 16px;
          background: #ffffff;
          border-top: 1px solid #e2e8f0;
        }

        .composer-textarea {
          flex: 1;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 8px 12px;
          font-size: 0.88rem;
          font-family: inherit;
          resize: none;
          outline: none;
          transition: border-color 0.15s ease;
        }

        .composer-textarea:focus {
          border-color: #6366f1;
          box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
        }

        .composer-send-btn {
          align-self: flex-end;
          padding: 8px 16px;
          white-space: nowrap;
        }
      `}</style>
    </div>
  );
}
