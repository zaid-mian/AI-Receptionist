import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, MessageSquare } from 'lucide-react';
import { api, isApiError, qs } from '../api/client';
import type { ConversationSummary } from '../api/types';
import { usePageMeta } from '../layout/PageMeta';
import DataTable, { type Column } from '../components/DataTable';
import EmptyState from '../components/EmptyState';
import { SkeletonTable } from '../components/Skeleton';
import { channelBadge, outcomeBadge, statusBadge } from '../utils/badges';
import { formatClockTime, formatDuration, humanize, timeAgo } from '../utils/format';

export default function Conversations() {
  usePageMeta('Conversations');
  const navigate = useNavigate();

  const [rows, setRows] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [channel, setChannel] = useState('');
  const [query, setQuery] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(query.trim()), 350);
    return () => window.clearTimeout(t);
  }, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get<{ conversations: ConversationSummary[] }>(
        `/conversations${qs({ limit: '50', status: status || undefined, channel: channel || undefined, q: debouncedQ || undefined })}`,
      );
      setRows(r.conversations);
    } catch (err) {
      setError(isApiError(err) ? err.message : 'Failed to load conversations.');
    } finally {
      setLoading(false);
    }
  }, [status, channel, debouncedQ]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: Column<ConversationSummary>[] = useMemo(
    () => [
      {
        key: 'customer_name',
        label: 'Customer',
        sortable: true,
        render: (c) => <span className="cell-main">{c.customer_name || 'Unknown caller'}</span>,
      },
      {
        key: 'started_at',
        label: 'Time',
        sortable: true,
        sortValue: (c) => c.started_at,
        render: (c) => (
          <div>
            <div className="tnum">{timeAgo(c.started_at)}</div>
            <div className="cell-sub tnum">{formatClockTime(c.started_at)}</div>
          </div>
        ),
      },
      {
        key: 'duration_s',
        label: 'Duration',
        sortable: true,
        sortValue: (c) => c.duration_s,
        render: (c) => <span className="tnum">{formatDuration(c.duration_s)}</span>,
      },
      { key: 'channel', label: 'Channel', render: (c) => channelBadge(c.channel) },
      { key: 'intent', label: 'Intent', render: (c) => humanize(c.intent) },
      { key: 'outcome', label: 'Outcome', render: (c) => outcomeBadge(c.outcome) },
      { key: 'status', label: 'Status', render: (c) => statusBadge(c.status) },
    ],
    [],
  );

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Conversations</h1>
          <div className="sub">Every chat and voice call, with full transcripts.</div>
        </div>
      </div>

      <div className="filter-bar">
        <div>
          <label htmlFor="c-status" className="sr-only">Filter by status</label>
          <select id="c-status" className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
            <option value="escalated">Escalated</option>
          </select>
        </div>
        <div>
          <label htmlFor="c-channel" className="sr-only">Filter by channel</label>
          <select id="c-channel" className="select" value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="">All channels</option>
            <option value="chat">Chat</option>
            <option value="voice">Voice</option>
          </select>
        </div>
        <div>
          <label htmlFor="c-search" className="sr-only">Search conversations</label>
          <input
            id="c-search"
            className="input"
            placeholder="Search customer or content…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {loading && <SkeletonTable rows={6} cols={6} />}
      {error && !loading && (
        <div className="error-state card">
          <div className="error-icon" aria-hidden="true">
            <AlertCircle size={28} strokeWidth={1.5} />
          </div>
          <div className="error-title">Couldn&apos;t load conversations</div>
          <div className="error-desc">{error}</div>
          <button className="btn btn-secondary" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}
      {!loading && !error && (
        <DataTable<ConversationSummary>
          columns={columns}
          rows={rows}
          rowKey={(c) => c.id}
          onRowClick={(c) => navigate(`/conversations/${c.id}`)}
          empty={
            <div className="card">
              <EmptyState
                icon={<MessageSquare size={24} strokeWidth={1.5} />}
                title="No conversations found"
                description="Try adjusting the filters, or start a new conversation with the AI receptionist."
                action={
                  <button className="btn btn-primary btn-sm" onClick={() => navigate('/receptionist')}>
                    Start chatting
                  </button>
                }
              />
            </div>
          }
        />
      )}
    </div>
  );
}
