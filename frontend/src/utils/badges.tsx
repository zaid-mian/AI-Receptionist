import Badge from '../components/Badge';

/** Shared status/outcome pill mappings so every page renders them identically. */

export function statusBadge(status: string) {
  if (status === 'resolved' || status === 'confirmed' || status === 'indexed' || status === 'completed')
    return <Badge variant="success">{label(status)}</Badge>;
  if (status === 'escalated' || status === 'processing') return <Badge variant="warning">{label(status)}</Badge>;
  if (status === 'cancelled' || status === 'failed') return <Badge variant="danger">{label(status)}</Badge>;
  if (status === 'open') return <Badge variant="info">Open</Badge>;
  return <Badge variant="neutral">{label(status)}</Badge>;
}

export function outcomeBadge(outcome: string) {
  if (outcome === 'booked') return <Badge variant="accent">Booked</Badge>;
  if (outcome === 'resolved') return <Badge variant="success">Resolved</Badge>;
  if (outcome === 'escalated') return <Badge variant="warning">Escalated</Badge>;
  return <Badge variant="neutral">Open</Badge>;
}

export function channelBadge(channel: string) {
  return <Badge variant={channel === 'voice' ? 'accent' : 'info'}>{channel === 'voice' ? 'Voice' : 'Chat'}</Badge>;
}

function label(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
}
