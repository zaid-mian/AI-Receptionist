import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, AlertTriangle, ArrowLeft, MessageSquare } from 'lucide-react';
import { api, isApiError } from '../api/client';
import type { ConversationDetail as Detail } from '../api/types';
import { usePageMeta } from '../layout/PageMeta';
import MessageBubble, { type ChatMessageItem } from '../components/MessageBubble';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';
import { useToast } from '../components/Toast';
import { channelBadge, outcomeBadge, statusBadge } from '../utils/badges';
import { formatClockTime, formatDateLong, formatDuration, humanize } from '../utils/format';

let seq = 1;

export default function ConversationDetail() {
  usePageMeta('Conversation');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [escalating, setEscalating] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const r = await api.get<Detail>(`/conversations/${encodeURIComponent(id)}`);
      setDetail(r);
    } catch (err) {
      setError(isApiError(err) ? err.message : 'Failed to load conversation.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const escalate = async () => {
    if (!id || escalating) return;
    setEscalating(true);
    try {
      await api.post(`/conversations/${encodeURIComponent(id)}/escalate`, {
        reason: 'Manually escalated from the dashboard.',
      });
      toast('success', 'Conversation escalated to a human agent.');
      await load();
    } catch (err) {
      toast('error', isApiError(err) ? err.message : 'Escalation failed.');
    } finally {
      setEscalating(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-center" role="status">
        <Spinner label="Loading conversation…" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="error-state card">
        <div className="error-icon" aria-hidden="true">
          <AlertCircle size={28} strokeWidth={1.5} />
        </div>
        <div className="error-title">Couldn&apos;t load this conversation</div>
        <div className="error-desc">{error ?? 'Not found.'}</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={() => navigate('/conversations')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <ArrowLeft size={13} strokeWidth={2} /> Back to list
          </button>
          <button className="btn btn-secondary" onClick={() => void load()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const c = detail.conversation;
  const items: ChatMessageItem[] = detail.messages.map((m) => ({
    id: `h_${m.id}_${seq++}`,
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.content,
    tools: m.tool_calls?.map((t) => ({ ...t, phase: 'done' as const })),
    sources: m.sources,
  }));

  return (
    <div style={{ maxWidth: 880, margin: '0 auto' }}>
      <div className="detail-head">
        <button className="btn btn-secondary btn-sm" onClick={() => navigate('/conversations')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <ArrowLeft size={13} strokeWidth={2} /> All conversations
        </button>
        <div style={{ flex: 1 }} />
        {c.status === 'open' && (
          <button className="btn btn-secondary btn-sm" onClick={() => void escalate()} disabled={escalating} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={13} strokeWidth={2} /> {escalating ? 'Escalating…' : 'Escalate to human'}
          </button>
        )}
      </div>

      {c.escalated && (
        <div className="escalation-banner" role="alert" style={{ marginBottom: 16 }}>
          <AlertTriangle size={16} strokeWidth={2} />
          <span>
            <strong>This conversation was escalated to a human agent.</strong>
            {c.summary ? ` ${c.summary}` : ''}
          </span>
        </div>
      )}

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="panel-head">
          <h2>{c.customer_name || 'Unknown caller'}</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            {statusBadge(c.status)}
            {outcomeBadge(c.outcome)}
            {channelBadge(c.channel)}
          </div>
        </div>
        <div className="detail-meta-grid">
          <div className="detail-meta-item">
            <div className="k">Started</div>
            <div className="v tnum">
              {formatDateLong(c.started_at.slice(0, 10))} · {formatClockTime(c.started_at)}
            </div>
          </div>
          <div className="detail-meta-item">
            <div className="k">Duration</div>
            <div className="v tnum">{formatDuration(c.duration_s)}</div>
          </div>
          <div className="detail-meta-item">
            <div className="k">Intent</div>
            <div className="v">{humanize(c.intent)}</div>
          </div>
          <div className="detail-meta-item">
            <div className="k">Messages</div>
            <div className="v tnum">{c.message_count}</div>
          </div>
        </div>
        {c.summary && <div className="card-sub">Summary: {c.summary}</div>}
      </div>

      <div className="card">
        <div className="transcript-thread" role="log" aria-label="Conversation transcript">
          {items.length === 0 ? (
            <EmptyState icon={<MessageSquare size={24} strokeWidth={1.5} />} title="No messages" description="This conversation has no messages yet." />
          ) : (
            items.map((m) => <MessageBubble key={m.id} message={m} />)
          )}
        </div>
      </div>
    </div>
  );
}
