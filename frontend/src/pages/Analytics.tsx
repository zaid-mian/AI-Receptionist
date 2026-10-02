import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Info, TrendingUp, PieChart, BarChart3 } from 'lucide-react';
import { api, isApiError } from '../api/client';
import type { AnalyticsOverview, ConversationSummary, IntentCount, TimeseriesDay } from '../api/types';
import { usePageMeta } from '../layout/PageMeta';
import MetricCard from '../components/MetricCard';
import DemoDataBadge from '../components/DemoDataBadge';
import EmptyState from '../components/EmptyState';
import { Skeleton, SkeletonMetrics } from '../components/Skeleton';
import { BarChart, DonutChart, LineChart } from '../components/Charts';
import { formatDuration, humanize } from '../utils/format';

const OUTCOME_COLORS: Record<string, string> = {
  booked: '#4f46e5',
  resolved: '#059669',
  escalated: '#b45309',
  open: '#94a3b8',
};

export default function Analytics() {
  usePageMeta('Analytics', { demoBadge: true });

  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [intents, setIntents] = useState<IntentCount[]>([]);
  const [series, setSeries] = useState<TimeseriesDay[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, ic, ts, convs] = await Promise.all([
        api.get<AnalyticsOverview>('/analytics/overview'),
        api.get<{ demo_data: boolean; intents: IntentCount[] }>('/analytics/intents'),
        api.get<{ demo_data: boolean; days: TimeseriesDay[] }>('/analytics/timeseries?days=14'),
        api.get<{ conversations: ConversationSummary[] }>('/conversations?limit=100'),
      ]);
      setOverview(ov);
      setIntents(ic.intents);
      setSeries(ts.days);
      setConversations(convs.conversations);
    } catch (err) {
      setError(isApiError(err) ? err.message : 'Failed to load analytics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const outcomeSegments = useMemo(() => {
    const tally: Record<string, number> = {};
    for (const c of conversations) tally[c.outcome] = (tally[c.outcome] ?? 0) + 1;
    return Object.entries(tally)
      .map(([label, value]) => ({ label: humanize(label), value, color: OUTCOME_COLORS[label] ?? '#64748b' }))
      .sort((a, b) => b.value - a.value);
  }, [conversations]);

  const topIntents = useMemo(
    () =>
      [...intents]
        .sort((a, b) => b.count - a.count)
        .slice(0, 8)
        .map((i) => ({ label: humanize(i.intent), value: i.count })),
    [intents],
  );

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Analytics</h1>
          <div className="sub">How the receptionist is performing.</div>
        </div>
        <div className="actions">
          <DemoDataBadge />
        </div>
      </div>

      <div className="escalation-banner" style={{ marginBottom: 16 }} role="note">
        <Info size={16} strokeWidth={2} />
        <span>
          <strong>All figures on this page are generated demo data</strong> for illustration - they do
          not represent real business performance.
        </span>
      </div>

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <SkeletonMetrics count={6} />
          <div className="card chart-card" style={{ padding: 24 }}>
            <Skeleton height="18px" width="30%" style={{ marginBottom: 16 }} />
            <Skeleton height="220px" />
          </div>
        </div>
      )}
      {error && !loading && (
        <div className="error-state card">
          <div className="error-icon" aria-hidden="true">
            <AlertCircle size={28} strokeWidth={1.5} />
          </div>
          <div className="error-title">Couldn&apos;t load analytics</div>
          <div className="error-desc">{error}</div>
          <button className="btn btn-secondary" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      {!loading && !error && overview && (
        <>
          <div className="analytics-grid">
            <MetricCard label="Total conversations" value={String(overview.total_conversations)} hint="demo data" />
            <MetricCard label="Resolution rate" value={`${Math.round(overview.resolution_rate * 100)}%`} hint="demo data" />
            <MetricCard label="Appointments booked" value={String(overview.appointments_booked)} hint="demo data" />
            <MetricCard
              label="Avg response latency"
              value={overview.avg_response_latency_s != null ? `${overview.avg_response_latency_s.toFixed(1)}s` : '-'}
              hint="demo data"
            />
            <MetricCard label="Avg conversation duration" value={formatDuration(overview.avg_conversation_duration_s)} hint="demo data" />
            <MetricCard label="Escalation rate" value={`${Math.round(overview.escalation_rate * 100)}%`} hint="demo data" />
          </div>

          <div className="analytics-charts">
            <div className="card chart-card">
              <h3>Activity: Last 14 Days</h3>
              <div className="chart-sub">Conversations vs appointments booked · demo data</div>
              {series.length === 0 ? (
                <EmptyState icon={<TrendingUp size={24} strokeWidth={1.5} />} title="No activity data" description="Nothing to chart yet." />
              ) : (
                <LineChart
                  labels={series.map((d) => d.date)}
                  series={[
                    { name: 'Conversations', color: '#2563eb', values: series.map((d) => d.conversations) },
                    { name: 'Appointments', color: '#059669', values: series.map((d) => d.appointments) },
                  ]}
                />
              )}
            </div>

            <div className="card chart-card">
              <h3>Outcomes</h3>
              <div className="chart-sub">From recent conversations · live data</div>
              {outcomeSegments.length === 0 ? (
                <EmptyState icon={<PieChart size={24} strokeWidth={1.5} />} title="No conversations" description="Outcome data appears once conversations exist." />
              ) : (
                <DonutChart segments={outcomeSegments} />
              )}
            </div>
          </div>

          <div className="card chart-card" style={{ marginTop: 16 }}>
            <h3>Top customer intents</h3>
            <div className="chart-sub">What customers ask about most · demo data</div>
            {topIntents.length === 0 ? (
              <EmptyState icon={<BarChart3 size={24} strokeWidth={1.5} />} title="No intent data" description="Intent breakdown appears once analytics are available." />
            ) : (
              <BarChart data={topIntents} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
