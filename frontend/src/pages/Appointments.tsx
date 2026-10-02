import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Calendar as CalendarIcon, AlertCircle } from 'lucide-react';
import { api, isApiError, qs } from '../api/client';
import type { Appointment, Availability, Service } from '../api/types';
import { usePageMeta } from '../layout/PageMeta';
import DataTable, { type Column } from '../components/DataTable';
import CalendarMonth from '../components/CalendarMonth';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';
import { SkeletonTable } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { statusBadge } from '../utils/badges';
import { formatDateLong, formatDateRelative, formatTime12h, toISODate } from '../utils/format';

const STATUS_OPTIONS = ['', 'confirmed', 'cancelled', 'completed', 'no_show'];

/* ------------------------------------------------------------------ */
/* Slot picker shared by the New and Reschedule dialogs                */
/* ------------------------------------------------------------------ */
function SlotPicker({
  serviceId,
  date,
  selected,
  onSelect,
}: {
  serviceId: string;
  date: string;
  selected: string;
  onSelect: (t: string) => void;
}) {
  const [slots, setSlots] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!serviceId || !date) {
      setSlots(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    api
      .get<Availability>(`/availability${qs({ service_id: serviceId, date })}`)
      .then((a) => {
        if (!alive) return;
        setSlots(a.slots);
        if (a.slots.length > 0 && !a.slots.includes(selected)) onSelect(a.slots[0]);
      })
      .catch((err) => {
        if (!alive) return;
        setSlots([]);
        setError(isApiError(err) ? err.message : 'Could not load availability.');
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId, date]);

  if (loading) return <Spinner size="sm" label="Checking availability…" />;
  if (error) return <div className="error-desc">{error}</div>;
  if (slots && slots.length === 0)
    return <div className="card-sub">No availability for this service on this date.</div>;
  if (!slots) return null;

  return (
    <div className="slot-grid" role="radiogroup" aria-label="Available times">
      {slots.map((t) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={selected === t}
          className={`slot-btn${selected === t ? ' selected' : ''}`}
          onClick={() => onSelect(t)}
        >
          {formatTime12h(t)}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* New appointment dialog                                               */
/* ------------------------------------------------------------------ */
function NewAppointmentModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [services, setServices] = useState<Service[]>([]);
  const [serviceId, setServiceId] = useState('');
  const [date, setDate] = useState(toISODate(new Date()));
  const [time, setTime] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ services: Service[] }>('/services')
      .then((r) => {
        setServices(r.services);
        if (r.services.length > 0) setServiceId(r.services[0].id);
      })
      .catch(() => setFormError('Could not load services.'));
  }, []);

  const valid = serviceId && date && time && name.trim() && phone.trim();

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    setFormError(null);
    try {
      const r = await api.post<{ success: boolean; appointment: Appointment }>('/appointments', {
        service_id: serviceId,
        date,
        time,
        customer_name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      toast('success', `Appointment ${r.appointment.id} booked for ${formatDateLong(date)} at ${formatTime12h(time)}.`);
      onCreated();
      onClose();
    } catch (err) {
      setFormError(isApiError(err) ? err.message : 'Booking failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="New appointment"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => void submit()} disabled={!valid || saving}>
            {saving ? 'Booking…' : 'Book appointment'}
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="na-service">Service</label>
        <select id="na-service" className="select" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} - {s.duration_min} min · PKR {s.price}
            </option>
          ))}
        </select>
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor="na-date">Date</label>
          <input
            id="na-date"
            type="date"
            className="input"
            value={date}
            min={toISODate(new Date())}
            onChange={(e) => {
              setDate(e.target.value);
              setTime('');
            }}
          />
        </div>
        <div className="field">
          <label>Time</label>
          <SlotPicker serviceId={serviceId} date={date} selected={time} onSelect={setTime} />
        </div>
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor="na-name">Customer name *</label>
          <input id="na-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
        </div>
        <div className="field">
          <label htmlFor="na-phone">Phone *</label>
          <input id="na-phone" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555-0100" />
        </div>
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor="na-email">Email</label>
          <input id="na-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" />
        </div>
        <div className="field">
          <label htmlFor="na-notes">Notes</label>
          <input id="na-notes" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        </div>
      </div>
      {formError && <div className="error-desc">{formError}</div>}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Reschedule dialog                                                    */
/* ------------------------------------------------------------------ */
function RescheduleModal({
  appointment,
  onClose,
  onDone,
}: {
  appointment: Appointment;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [date, setDate] = useState(appointment.date);
  const [time, setTime] = useState(appointment.time);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async () => {
    if (saving || !date || !time) return;
    setSaving(true);
    setFormError(null);
    try {
      await api.patch(`/appointments/${appointment.id}`, { action: 'reschedule', date, time });
      toast('success', `Appointment ${appointment.id} moved to ${formatDateLong(date)} at ${formatTime12h(time)}.`);
      onDone();
      onClose();
    } catch (err) {
      setFormError(isApiError(err) ? err.message : 'Reschedule failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`Reschedule ${appointment.id}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => void submit()} disabled={saving || !date || !time}>
            {saving ? 'Saving…' : 'Confirm reschedule'}
          </button>
        </>
      }
    >
      <div className="card-sub" style={{ marginBottom: 14 }}>
        {appointment.customer_name} · {appointment.service_name}
      </div>
      <div className="field">
        <label htmlFor="rs-date">New date</label>
        <input
          id="rs-date"
          type="date"
          className="input"
          value={date}
          min={toISODate(new Date())}
          onChange={(e) => {
            setDate(e.target.value);
            setTime('');
          }}
        />
      </div>
      <div className="field">
        <label>New time</label>
        <SlotPicker serviceId={appointment.service_id} date={date} selected={time} onSelect={setTime} />
      </div>
      {formError && <div className="error-desc">{formError}</div>}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Main page                                                            */
/* ------------------------------------------------------------------ */
export default function Appointments() {
  usePageMeta('Appointments', { newConversation: true });
  const toast = useToast();

  const [tab, setTab] = useState<'list' | 'calendar'>('list');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [rescheduling, setRescheduling] = useState<Appointment | null>(null);
  const [cancelling, setCancelling] = useState<Appointment | null>(null);

  const [month, setMonth] = useState(() => toISODate(new Date()).slice(0, 7));
  const [calCounts, setCalCounts] = useState<Record<string, number>>({});
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [dayAppointments, setDayAppointments] = useState<Appointment[]>([]);
  const [dayLoading, setDayLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get<{ appointments: Appointment[] }>(
        `/appointments${qs({ date: dateFilter || undefined, status: statusFilter || undefined })}`,
      );
      setAppointments(r.appointments);
    } catch (err) {
      setError(isApiError(err) ? err.message : 'Failed to load appointments.');
    } finally {
      setLoading(false);
    }
  }, [dateFilter, statusFilter]);

  useEffect(() => {
    if (tab === 'list') void load();
  }, [tab, load]);

  const loadCalendar = useCallback(async () => {
    try {
      const r = await api.get<{ month: string; days: { date: string; count: number }[] }>(
        `/appointments/calendar?month=${month}`,
      );
      const map: Record<string, number> = {};
      for (const d of r.days) map[d.date] = d.count;
      setCalCounts(map);
    } catch {
      setCalCounts({});
    }
  }, [month]);

  useEffect(() => {
    if (tab === 'calendar') void loadCalendar();
  }, [tab, loadCalendar]);

  const selectDay = useCallback(async (date: string) => {
    setSelectedDay(date);
    setDayLoading(true);
    try {
      const r = await api.get<{ appointments: Appointment[] }>(`/appointments${qs({ date })}`);
      setDayAppointments(r.appointments);
    } catch {
      setDayAppointments([]);
    } finally {
      setDayLoading(false);
    }
  }, []);

  const confirmCancel = async () => {
    if (!cancelling) return;
    try {
      await api.patch(`/appointments/${cancelling.id}`, { action: 'cancel' });
      toast('success', `Appointment ${cancelling.id} cancelled.`);
      setCancelling(null);
      void load();
      if (selectedDay) void selectDay(selectedDay);
      void loadCalendar();
    } catch (err) {
      toast('error', isApiError(err) ? err.message : 'Cancellation failed.');
    }
  };

  const columns: Column<Appointment>[] = useMemo(
    () => [
      {
        key: 'customer_name',
        label: 'Customer',
        sortable: true,
        render: (a) => (
          <div>
            <div className="cell-main">{a.customer_name}</div>
            <div className="cell-sub tnum">{a.phone}</div>
          </div>
        ),
      },
      { key: 'service_name', label: 'Service', sortable: true, render: (a) => a.service_name },
      {
        key: 'date',
        label: 'Date',
        sortable: true,
        render: (a) => <span className="tnum">{formatDateRelative(a.date)}</span>,
      },
      { key: 'time', label: 'Time', sortable: true, render: (a) => <span className="tnum">{formatTime12h(a.time)}</span> },
      { key: 'status', label: 'Status', render: (a) => statusBadge(a.status) },
      {
        key: 'actions',
        label: 'Actions',
        align: 'right',
        render: (a) =>
          a.status === 'confirmed' ? (
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button className="btn btn-sm btn-secondary" onClick={() => setRescheduling(a)}>
                Reschedule
              </button>
              <button className="btn btn-sm btn-secondary" onClick={() => setCancelling(a)}>
                Cancel
              </button>
            </div>
          ) : (
            <span className="cell-sub">-</span>
          ),
      },
    ],
    [],
  );

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Appointments</h1>
          <div className="sub">Schedule, reschedule, and manage verified patient visits across departments.</div>
        </div>
        <div className="actions">
          <button className="btn btn-primary" onClick={() => setShowNew(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Plus size={14} strokeWidth={2} /> New appointment
          </button>
        </div>
      </div>

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'list'} className={`tab${tab === 'list' ? ' active' : ''}`} onClick={() => setTab('list')}>
          List
        </button>
        <button role="tab" aria-selected={tab === 'calendar'} className={`tab${tab === 'calendar' ? ' active' : ''}`} onClick={() => setTab('calendar')}>
          Calendar
        </button>
      </div>

      {tab === 'list' && (
        <>
          <div className="filter-bar">
            <div>
              <label htmlFor="flt-date" className="sr-only">Filter by date</label>
              <input id="flt-date" type="date" className="input" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
            </div>
            <div>
              <label htmlFor="flt-status" className="sr-only">Filter by status</label>
              <select id="flt-status" className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s === '' ? 'All statuses' : s.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
            {(dateFilter || statusFilter) && (
              <button className="btn btn-ghost btn-sm" onClick={() => { setDateFilter(''); setStatusFilter(''); }}>
                Clear filters
              </button>
            )}
          </div>

          {loading && <SkeletonTable rows={6} cols={6} />}
          {error && !loading && (
            <div className="error-state card">
              <div className="error-icon" aria-hidden="true">
                <AlertCircle size={28} strokeWidth={1.5} />
              </div>
              <div className="error-title">Couldn&apos;t load appointments</div>
              <div className="error-desc">{error}</div>
              <button className="btn btn-secondary" onClick={() => void load()}>
                Retry
              </button>
            </div>
          )}
          {!loading && !error && (
            <DataTable<Appointment>
              columns={columns}
              rows={appointments}
              rowKey={(a) => a.id}
              empty={
                <div className="card">
                  <EmptyState
                    icon={<CalendarIcon size={24} strokeWidth={1.5} />}
                    title="No appointments found"
                    description="Try adjusting the filters, or book a new appointment."
                    action={
                      <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Plus size={13} strokeWidth={2} /> New appointment
                      </button>
                    }
                  />
                </div>
              }
            />
          )}
        </>
      )}

      {tab === 'calendar' && (
        <div className="two-col">
          <div className="card card-pad">
            <CalendarMonth
              month={month}
              counts={calCounts}
              selected={selectedDay ?? undefined}
              onSelect={(d) => void selectDay(d)}
              onMonthChange={setMonth}
            />
          </div>
          <div className="card card-pad">
            <div className="panel-head">
              <h2>{selectedDay ? formatDateLong(selectedDay) : 'Select a day'}</h2>
            </div>
            {!selectedDay && (
              <EmptyState icon={<CalendarIcon size={24} strokeWidth={1.5} />} title="No day selected" description="Click a day in the calendar to see its appointments." />
            )}
            {selectedDay && dayLoading && <Spinner size="sm" label="Loading…" />}
            {selectedDay && !dayLoading && dayAppointments.length === 0 && (
              <EmptyState icon={<CalendarIcon size={24} strokeWidth={1.5} />} title="No appointments" description={`Nothing scheduled for ${formatDateLong(selectedDay)}.`} />
            )}
            {selectedDay && !dayLoading && dayAppointments.length > 0 && (
              <div className="appt-day-list">
                {dayAppointments.map((a) => (
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
      )}

      {showNew && <NewAppointmentModal onClose={() => setShowNew(false)} onCreated={() => { void load(); void loadCalendar(); }} />}
      {rescheduling && (
        <RescheduleModal
          appointment={rescheduling}
          onClose={() => setRescheduling(null)}
          onDone={() => { void load(); void loadCalendar(); if (selectedDay) void selectDay(selectedDay); }}
        />
      )}
      {cancelling && (
        <Modal
          title="Cancel appointment"
          onClose={() => setCancelling(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setCancelling(null)}>
                Keep it
              </button>
              <button className="btn btn-danger" onClick={() => void confirmCancel()}>
                Yes, cancel
              </button>
            </>
          }
        >
          <p style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>
            Cancel <strong>{cancelling.service_name}</strong> for <strong>{cancelling.customer_name}</strong> on{' '}
            <strong>{formatDateLong(cancelling.date)}</strong> at <strong>{formatTime12h(cancelling.time)}</strong>?
            This action cannot be undone.
          </p>
        </Modal>
      )}
    </div>
  );
}
