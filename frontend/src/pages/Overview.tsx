import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Mic,
  MessageSquare,
  Calendar,
  ArrowRight,
  AlertCircle,
} from 'lucide-react';
import { api, isApiError } from '../api/client';
import type { AnalyticsOverview, Appointment, ConversationSummary } from '../api/types';
import { usePageMeta } from '../layout/PageMeta';
import MetricCard from '../components/MetricCard';
import DemoDataBadge from '../components/DemoDataBadge';
import EmptyState from '../components/EmptyState';
import { Skeleton, SkeletonMetrics, SkeletonTable } from '../components/Skeleton';
import { outcomeBadge, statusBadge } from '../utils/badges';
import { formatDuration, formatTime12h, timeAgo, toISODate } from '../utils/format';

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'P';
}

export default function Overview() {
  usePageMeta('Overview', { demoBadge: true, newConversation: true });
  const navigate = useNavigate();

  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, convs, appts] = await Promise.all([
        api.get<AnalyticsOverview>('/analytics/overview'),
        api.get<{ conversations: ConversationSummary[] }>('/conversations?limit=5'),
        api.get<{ appointments: Appointment[] }>('/appointments?upcoming=true'),
      ]);
      setOverview(ov);
      setConversations(convs.conversations);
      setAppointments(appts.appointments);
    } catch (err) {
      setError(isApiError(err) ? err.message : 'Failed to load overview data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const today = toISODate(new Date());
  const todaysAppointments = appointments
    .filter((a) => a.date === today && a.status === 'confirmed')
    .sort((a, b) => a.time.localeCompare(b.time));

  return (
    <div>
      {/* Executive Hero Banner */}
      <div className="overview-hero">
        <div>
          <h1>Faisal Hospital Executive Suite</h1>
          <div className="sub">
            Hospital Front Desk & Autonomous Clinical Scheduling · Faisal Hospital Pvt Ltd, Faisalabad
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="operational-pill">
              <span className="status-dot green" aria-hidden="true" /> Live Front Desk Active
            </span>
            <DemoDataBadge />
          </div>
        </div>
        <div className="actions">
          <button
            className="btn btn-primary"
            onClick={() => navigate('/admin/voice')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '7px' }}
          >
            <Mic size={15} strokeWidth={2} />
            <span>Launch Voice Demo</span>
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => navigate('/admin/receptionist', { state: { newAt: Date.now() } })}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '7px' }}
          >
            <MessageSquare size={15} strokeWidth={2} />
            <span>Test Receptionist</span>
          </button>
        </div>
      </div>

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <SkeletonMetrics count={4} />
          <div className="overview-cols">
            <div className="card card-pad">
              <Skeleton height="18px" width="35%" style={{ marginBottom: 16 }} />
              <SkeletonTable rows={4} cols={3} />
            </div>
            <div className="card card-pad">
              <Skeleton height="18px" width="35%" style={{ marginBottom: 16 }} />
              <SkeletonTable rows={4} cols={3} />
            </div>
          </div>
        </div>
      )}

      {error && !loading && (
        <div className="error-state card">
          <div className="error-icon" aria-hidden="true">
            <AlertCircle size={24} color="#dc2626" />
          </div>
          <div className="error-title">Couldn&apos;t load the dashboard</div>
          <div className="error-desc">{error}</div>
          <button className="btn btn-secondary" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Key Metrics Grid */}
          <div className="metric-grid">
            <MetricCard
              label="Conversations"
              value={overview ? String(overview.total_conversations) : '-'}
              hint="patient interactions tracked"
            />
            <MetricCard
              label="Upcoming Appointments"
              value={String(appointments.filter((a) => a.status === 'confirmed').length)}
              hint="scheduled confirmed visits"
            />
            <MetricCard
              label="Avg Response Time"
              value={
                overview?.avg_response_latency_s != null
                  ? `${overview.avg_response_latency_s.toFixed(1)}s`
                  : '< 250ms'
              }
              hint="real-time streaming latency"
            />
            <MetricCard
              label="Resolution Rate"
              value={overview ? `${Math.round(overview.resolution_rate * 100)}%` : '-'}
              hint="queries handled autonomously"
            />
          </div>

          {/* Two-Column Activity Overview */}
          <div className="overview-cols">
            {/* Recent Conversations */}
            <div className="card card-pad">
              <div className="panel-head">
                <h2>Recent Patient Conversations</h2>
                <Link
                  to="/admin/conversations"
                  className="btn btn-ghost btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                >
                  <span>View all</span>
                  <ArrowRight size={13} strokeWidth={2} />
                </Link>
              </div>
              {conversations.length === 0 ? (
                <EmptyState
                  icon={<MessageSquare size={22} strokeWidth={1.75} />}
                  title="No conversations yet"
                  description="Patient inquiries from the web portal will appear here live."
                  action={
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => navigate('/admin/receptionist')}
                    >
                      Open Test Receptionist
                    </button>
                  }
                />
              ) : (
                <div className="conv-list">
                  {conversations.map((c) => (
                    <div
                      key={c.id}
                      className="conv-row"
                      onClick={() => navigate(`/admin/conversations/${c.id}`)}
                      role="link"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && navigate(`/admin/conversations/${c.id}`)}
                    >
                      <div className="conv-avatar" aria-hidden="true">
                        {initials(c.customer_name || 'Patient')}
                      </div>
                      <div className="conv-main">
                        <div className="conv-name">{c.customer_name || 'Patient Inquiry'}</div>
                        <div className="conv-desc">
                          {c.intent.replace(/_/g, ' ')} · {formatDuration(c.duration_s)} ·{' '}
                          {c.channel}
                        </div>
                      </div>
                      {outcomeBadge(c.outcome)}
                      <span className="conv-time">{timeAgo(c.started_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Today's Appointments */}
            <div className="card card-pad">
              <div className="panel-head">
                <h2>Today&apos;s OPD Schedule</h2>
                <Link
                  to="/admin/appointments"
                  className="btn btn-ghost btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                >
                  <span>View calendar</span>
                  <ArrowRight size={13} strokeWidth={2} />
                </Link>
              </div>
              {todaysAppointments.length === 0 ? (
                <EmptyState
                  icon={<Calendar size={22} strokeWidth={1.75} />}
                  title="No consultations scheduled today"
                  description="Confirmed patient bookings for today will appear here."
                  action={
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => navigate('/admin/appointments')}
                    >
                      Book Consultation
                    </button>
                  }
                />
              ) : (
                <div>
                  {todaysAppointments.slice(0, 5).map((a) => (
                    <div key={a.id} className="appt-row">
                      <div className="appt-time tnum">{formatTime12h(a.time)}</div>
                      <div className="appt-main">
                        <div className="appt-name">{a.customer_name}</div>
                        <div className="appt-service">{a.service_name}</div>
                      </div>
                      {statusBadge(a.status)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
