import { CheckCircle2, CalendarX2 } from 'lucide-react';
import type { ChatAppointment } from '../api/types';
import { formatDateLong, formatTime12h } from '../utils/format';

/** Booking confirmation card rendered from a real `appointment` SSE event. */
export default function AppointmentCard({ event }: { event: ChatAppointment }) {
  const { action, appointment: a } = event;
  const isCancel = action === 'cancelled';
  const label =
    action === 'booked'
      ? 'Appointment booked'
      : action === 'rescheduled'
        ? 'Appointment rescheduled'
        : 'Appointment cancelled';

  return (
    <div className="appointment-confirm" role="status">
      <div className="ac-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {isCancel ? <CalendarX2 size={15} strokeWidth={2} /> : <CheckCircle2 size={15} strokeWidth={2} />}
        <span>{label}</span>
      </div>
      <dl className="ac-grid">
        <dt>Service</dt>
        <dd>{a.service_name}</dd>
        <dt>Date</dt>
        <dd>{formatDateLong(a.date)}</dd>
        <dt>Time</dt>
        <dd>{formatTime12h(a.time)}</dd>
        <dt>Customer</dt>
        <dd>{a.customer_name}</dd>
        <dt>Confirmation</dt>
        <dd className="tnum">{a.id}</dd>
      </dl>
    </div>
  );
}
