import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Lock,
  MessageSquare,
  Calendar,
  Stethoscope,
  Phone,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  MapPin,
  ArrowRight,
  ShieldCheck,
  FlaskConical,
  Ambulance,
  Activity,
  Printer,
  ChevronLeft,
  Languages,
} from 'lucide-react';
import { api } from '../api/client';
import ChatPanel, { type ActionChip, type PopularSearch } from '../components/ChatPanel';
import { Skeleton, SkeletonCards } from '../components/Skeleton';
import '../styles/portal.css';

function formatWeekdayDate(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function getDayOfWeek(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
}

export interface DoctorSchedule {
  day: string;
  start_time: string;
  end_time: string;
  slot_duration_min: number;
}

export interface Doctor {
  id: string;
  name: string;
  title: string;
  fee_pkr: number;
  room: string | null;
  appointment_mode: string;
  department: {
    id: string;
    name: string;
    building: string;
    floor: string;
  };
  service_id: string | null;
  duration_min: number;
  schedules: DoctorSchedule[];
}

export interface Department {
  id: string;
  name: string;
  building: string;
  floor: string;
  description: string;
}

const ACTION_CHIPS: ActionChip[] = [
  { label: '🔍 Check Dr. Nadia Ali OPD Timings', prompt: 'What are the OPD timings and consultation fee for Dr. Nadia Ali?' },
  { label: '📅 Book OPD Appointment', prompt: 'I want to book an appointment with a doctor' },
  { label: '🚨 Emergency Gate Directions', prompt: 'Where is the 24/7 Emergency Department located and how do I reach Gate 1?' },
  { label: '💳 Sehat Card Info', prompt: 'Do you accept Government Sehat Sahulat Card and what treatments are covered under panel?' },
  { label: '🔬 Lab Test Rates', prompt: 'What are the diagnostic lab test timings and report collection policies?' },
];

const POPULAR_SEARCHES: PopularSearch[] = [
  { label: 'Cardiology OPD', prompt: 'Tell me about Cardiology OPD doctors, clinic days and consultation fees' },
  { label: 'Child Specialist', prompt: 'Who is the consultant child specialist (Pediatrician) on duty today?' },
  { label: 'Ultrasound Timings', prompt: 'What are the diagnostic ultrasound, CT scan, and digital X-ray timings?' },
  { label: 'Dialysis Unit', prompt: 'What are the Urology, kidney stone center and Dialysis unit facilities?' },
];

const FAQS = [
  { q: 'Is Dr. Nadia Ali available this week?', text: 'What is the weekly OPD schedule for Dr. Nadia Ali?' },
  { q: 'Where is the Emergency Department located?', text: 'Where is the 24/7 Emergency Department located and how do I reach Gate 1?' },
  { q: 'What doctors sit in Urology & Nephrology?', text: 'Who are the doctors in Urology and what are their shift hours and fees?' },
  { q: 'What are the visiting hours for CCU & ICU?', text: 'What are the visiting hours for the Intensive Care Unit (ICU) and general wards?' },
  { q: 'Do you accept Government Sehat Sahulat Card?', text: 'Do you accept the government Sehat Sahulat Card for admissions and treatments?' },
  { q: 'Can an elderly patient get a wheelchair at Gate 1?', text: 'Can an elderly patient get a free wheelchair and porter assistance upon arrival at Gate 1?' },
];

const FACILITIES = [
  {
    icon: '♿',
    title: 'Free Wheelchairs & Porters',
    desc: 'Stationed at Main Entrance (544-A) & Emergency Gate 1. Available 24 hours.',
    color: '#1d4ed8',
    bg: '#eff6ff',
  },
  {
    icon: '🚑',
    title: 'Emergency & Trauma Resuscitation',
    desc: 'Ground Floor East Wing, fully staffed with 24/7 dedicated surgeon on-call.',
    color: '#dc2626',
    bg: '#fef2f2',
  },
  {
    icon: '🔬',
    title: 'Diagnostic Lab & Pharmacy',
    desc: 'Main Building Ground Floor, temperature-controlled drug storage & digital dispensing.',
    color: '#0d9488',
    bg: '#f0fdfa',
  },
  {
    icon: '🅿',
    title: 'Parking & Valet Bay',
    desc: 'Adjacent multilevel secure parking lot next to New Building (545-A) with CCTV coverage.',
    color: '#475569',
    bg: '#f1f5f9',
  },
];

function todayDate(): string {
  const d = new Date();
  return d.toISOString().split('T')[0];
}

export default function PatientPortal() {
  const navigate = useNavigate();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDept, setSelectedDept] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'chat' | 'booking' | 'specialists' | 'diagnostics' | 'emergency'>('chat');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [resetSignal, setResetSignal] = useState(0);
  const [externalPrompt, setExternalPrompt] = useState<{ text: string; nonce: number } | null>(null);
  const [langPreference, setLangPreference] = useState<'en' | 'ur'>('en');

  // Booking Form State
  const [bookServiceId, setBookServiceId] = useState<string>('');
  const [bookDate, setBookDate] = useState<string>(todayDate());
  const [bookSlots, setBookSlots] = useState<string[]>([]);
  const [bookTime, setBookTime] = useState<string>('');
  const [bookName, setBookName] = useState<string>('');
  const [bookPhone, setBookPhone] = useState<string>('');
  const [bookNotes, setBookNotes] = useState<string>('');
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [bookSubmitting, setBookSubmitting] = useState(false);
  const [bookingConfirmation, setBookingConfirmation] = useState<{ id: string; doctor: string; date: string; time: string } | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);

  const selectedDoc = doctors.find((d) => d.service_id === bookServiceId);

  const upcomingDays = useMemo(() => {
    const list = [];
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      const fullDayName = d.toLocaleDateString('en-US', { weekday: 'long' });
      const dateNum = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      list.push({
        dateStr,
        dayName: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : dayName,
        fullDayName,
        dateNum,
      });
    }
    return list;
  }, []);

  const isDoctorSitting = useCallback((fullDayName: string) => {
    if (!selectedDoc || !selectedDoc.schedules || selectedDoc.schedules.length === 0) return true;
    return selectedDoc.schedules.some((s) => s.day.toLowerCase() === fullDayName.toLowerCase());
  }, [selectedDoc]);

  useEffect(() => {
    let alive = true;
    Promise.all([
      api.get<{ doctors: Doctor[] }>('/doctors'),
      api.get<{ departments: Department[] }>('/departments'),
    ])
      .then(([docRes, deptRes]) => {
        if (alive) {
          setDoctors(docRes.doctors);
          setDepartments(deptRes.departments);
          if (docRes.doctors[0]?.service_id) {
            setBookServiceId(docRes.doctors[0].service_id);
          }
        }
      })
      .catch((err) => console.error('Failed to load portal data:', err));

    return () => {
      alive = false;
    };
  }, []);

  // Fetch slots whenever service or date changes
  useEffect(() => {
    if (!bookServiceId || !bookDate) return;
    let alive = true;
    setSlotsLoading(true);
    setBookingError(null);

    api.get<{ slots: string[] }>(`/availability?service_id=${bookServiceId}&date=${bookDate}`)
      .then((res) => {
        if (alive) {
          setBookSlots(res.slots || []);
          if (res.slots && res.slots.length > 0) {
            setBookTime(res.slots[0]);
          } else {
            setBookTime('');
          }
        }
      })
      .catch((err) => {
        if (alive) {
          setBookSlots([]);
          setBookTime('');
          setBookingError(err.message || 'Doctor is off-duty or no slots available on this date.');
        }
      })
      .finally(() => {
        if (alive) setSlotsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [bookServiceId, bookDate]);

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookServiceId || !bookDate || !bookTime || !bookName || !bookPhone) {
      setBookingError('Please complete all required fields.');
      return;
    }

    setBookSubmitting(true);
    setBookingError(null);
    try {
      const res = await api.post<{ success: boolean; appointment: { id: string; service_name: string; date: string; time: string } }>(
        '/appointments',
        {
          service_id: bookServiceId,
          date: bookDate,
          time: bookTime,
          customer_name: bookName.trim(),
          phone: bookPhone.trim(),
          notes: bookNotes.trim() || undefined,
        }
      );
      if (res.success && res.appointment) {
        setBookingConfirmation({
          id: res.appointment.id,
          doctor: res.appointment.service_name,
          date: res.appointment.date,
          time: res.appointment.time,
        });
      }
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : 'Booking failed. Please try another slot.');
    } finally {
      setBookSubmitting(false);
    }
  };

  const handleSelectDoctorForBooking = (doc: Doctor) => {
    if (doc.service_id) {
      setBookServiceId(doc.service_id);
      setActiveTab('booking');
      window.scrollTo({ top: 440, behavior: 'smooth' });
    }
  };

  const handleTriggerUrdu = () => {
    setLangPreference('ur');
    setExternalPrompt({
      text: 'السلام علیکم، مجھے فیصل ہسپتال کے او پی ڈی شیڈول اور ڈاکٹرز کی معلومات چاہییں',
      nonce: Date.now(),
    });
    if (activeTab !== 'chat') setActiveTab('chat');
  };

  const filteredDoctors = doctors.filter((doc) => {
    if (selectedDept !== 'all' && doc.department.id !== selectedDept) return false;
    return true;
  });

  return (
    <div className="portal">
      {/* 1. TOP EMERGENCY & CASUALTY STRIP */}
      <div className="pt-strip">
        <div className="pt-strip-left">
          <span className="pt-strip-emergency">
            <span className="pt-strip-pulse" />
            24/7 Casualty: (041) 920-1431
          </span>
          <span>Direct Helpline: <strong>111-119-119</strong></span>
          <span style={{ opacity: 0.75 }}>Mall Road & East Canal Road, Faisalabad</span>
        </div>
        <div className="pt-strip-right">
          <div className="pt-lang-pill">
            <button
              type="button"
              onClick={() => setLangPreference('en')}
              className={`pt-lang-btn ${langPreference === 'en' ? 'active' : ''}`}
            >
              EN
            </button>
            <button
              type="button"
              onClick={handleTriggerUrdu}
              className={`pt-lang-btn ${langPreference === 'ur' ? 'active' : ''}`}
            >
              اردو
            </button>
          </div>
          <Link to="/admin/login" className="pt-staff-link">
            <Lock size={12} strokeWidth={2} /> Staff Portal
          </Link>
        </div>
      </div>

      {/* 2. STICKY GLASS NAVBAR */}
      <header className="pt-nav">
        <div className="pt-nav-inner">
          {/* Logo & Subtitle */}
          <Link to="/" className="pt-brand">
            <span className="pt-brand-mark">
              <Stethoscope size={20} strokeWidth={2.2} />
            </span>
            <span>
              <span className="pt-brand-name">Faisal Hospital</span><br />
              <span className="pt-brand-sub">Academic Medical Center & OPD</span>
            </span>
          </Link>

          {/* Center Navigation Tabs */}
          <nav className="pt-tabs-strip" aria-label="Patient desk sections">
            {([
              ['chat', MessageSquare, 'AI Receptionist'],
              ['booking', Calendar, 'Book Appointment'],
              ['specialists', Stethoscope, 'Doctors & Shifts'],
              ['diagnostics', FlaskConical, 'Diagnostic & Labs'],
              ['emergency', Ambulance, 'Emergency Care'],
            ] as const).map(([id, Icon, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={activeTab === id}
                onClick={() => setActiveTab(id)}
                className={`pt-tab-btn ${activeTab === id ? 'active' : ''}`}
              >
                <Icon size={14} aria-hidden="true" />
                <span>{label}</span>
                {id === 'chat' && <span className="pt-tab-live-dot" aria-hidden="true" />}
              </button>
            ))}
          </nav>

          {/* Right Action Buttons */}
          <div className="pt-nav-actions">
            <Link to="/voice" className="pt-btn-voice">
              <Phone size={14} color="#1d4ed8" strokeWidth={2.2} />
              <span>Voice Assistant</span>
              <span className="pulse-live" />
            </Link>
            <Link to="/" className="pt-btn-voice" title="Back to Overview">
              <ChevronLeft size={14} strokeWidth={2.2} />
              <span>Landing</span>
            </Link>
          </div>
        </div>
      </header>

      {/* 3. HERO INTRO SECTION & VOICE RECEPTIONIST BANNER */}
      <section className="pt-hero">
        <div className="pt-hero-inner">
          <div className="pt-eyebrow">
            <span className="dot" />
            Official Patient Care Desk · Real-time OPD Desk
          </div>

          <h1 className="pt-h1">
            Faisal Hospital <span className="grad">Patient Desk</span>
          </h1>

          <p className="pt-hero-desc">
            Consult in English or <span style={{ fontFamily: 'var(--font-urdu)', fontWeight: 600 }}>اردو</span> for consultant OPD shifts, booking verified appointments, checking diagnostic lab reports, or finding 24/7 emergency trauma care.
          </p>

          {/* Voice Receptionist Callout Banner */}
          <div className="pt-voice-banner">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div className="pt-voice-wave">
                <span /><span /><span /><span /><span />
              </div>
              <span style={{ fontSize: '0.85rem', color: '#1e40af', fontWeight: 600 }}>
                Voice Receptionist Live <span style={{ fontWeight: 400, color: 'var(--pt-ink-3)' }}>— Speak naturally in Urdu or English</span>
              </span>
            </div>
            <Link to="/voice" className="pt-voice-btn">
              <Phone size={13} strokeWidth={2.2} /> Start Voice Call
            </Link>
          </div>
        </div>
      </section>

      {/* 4. OPERATIONAL SHIFT CARDS ROW */}
      <section className="pt-shift-section">
        <div className="pt-shift-grid">
          {/* Card 1: Emergency & Casualty */}
          <div className="pt-shift-card emergency">
            <div>
              <div className="pt-shift-top">
                <span className="pt-shift-label" style={{ color: '#dc2626' }}>Emergency & Casualty</span>
                <span className="pt-shift-tag" style={{ background: '#fee2e2', color: '#991b1b' }}>Immediate Triage</span>
              </div>
              <div className="pt-shift-val">24/7 Active Gate 1</div>
              <div className="pt-shift-sub">Trauma resuscitation, acute CCU bypass, dedicated surgeons on-call</div>
            </div>
            <div className="pt-shift-bottom">
              <span style={{ color: '#dc2626', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Phone size={12} strokeWidth={2.4} /> 111-119-119
              </span>
              <span style={{ color: 'var(--pt-ink-3)', fontWeight: 500 }}>Rapid Dispatch</span>
            </div>
          </div>

          {/* Card 2: Morning OPD Shift */}
          <div className="pt-shift-card">
            <div>
              <div className="pt-shift-top">
                <span className="pt-shift-label" style={{ color: '#1d4ed8' }}>Morning OPD Shift</span>
                <span className="pt-shift-tag" style={{ background: '#e0f2fe', color: '#0369a1' }}>● Open</span>
              </div>
              <div className="pt-shift-val">09:00 AM – 02:00 PM</div>
              <div className="pt-shift-sub">Mon – Sat · General Medicine, Pediatrics, Cardiology Consultants</div>
            </div>
            <div className="pt-shift-bottom">
              <span style={{ color: 'var(--pt-ink-2)', fontWeight: 600 }}>32 Doctors On Duty</span>
              <span style={{ color: 'var(--pt-brand)', fontWeight: 600 }}>Counter 1–8</span>
            </div>
          </div>

          {/* Card 3: Evening OPD Shift */}
          <div className="pt-shift-card">
            <div>
              <div className="pt-shift-top">
                <span className="pt-shift-label" style={{ color: '#0f766e' }}>Evening OPD Shift</span>
                <span className="pt-shift-tag" style={{ background: '#ccfbf1', color: '#0f766e' }}>Tokens Live</span>
              </div>
              <div className="pt-shift-val">05:00 PM – 09:30 PM</div>
              <div className="pt-shift-sub">Specialist Surgical, Gynecology & Pediatric Clinics</div>
            </div>
            <div className="pt-shift-bottom">
              <span style={{ color: 'var(--pt-ink-2)', fontWeight: 500 }}>Evening Wing A & B</span>
              <span style={{ color: '#0f766e', fontWeight: 600 }}>Pre-booking Open</span>
            </div>
          </div>

          {/* Card 4: Central Diagnostics */}
          <div className="pt-shift-card">
            <div>
              <div className="pt-shift-top">
                <span className="pt-shift-label" style={{ color: 'var(--pt-ink-3)' }}>Central Diagnostics</span>
                <span className="pt-shift-tag" style={{ background: '#f1f5fa', color: 'var(--pt-ink-2)' }}>24/7 Sampling</span>
              </div>
              <div className="pt-shift-val">Pathology & Radiology</div>
              <div className="pt-shift-sub">Ground Floor Wing B · Digital Portal Sync & SMS Reports</div>
            </div>
            <div className="pt-shift-bottom">
              <span style={{ color: 'var(--pt-brand)', fontWeight: 600 }}>1.5T MRI / 64-Slice CT</span>
              <span style={{ color: 'var(--pt-ink-3)' }}>Reports &lt; 2 Hrs</span>
            </div>
          </div>
        </div>
      </section>

      {/* 5. MAIN WORKSPACE */}
      <main className="pt-workspace">
        <div className="pt-workspace-grid">
          {/* LEFT: ACTIVE TAB CONTENT */}
          <div>
            {/* TAB: CHAT */}
            {activeTab === 'chat' && (
              <div className="pt-card-elevated" style={{ height: '720px', display: 'flex', flexDirection: 'column' }}>
                <div className="pt-chat-head">
                  <div className="pt-chat-who">
                    <div className="pt-chat-avatar">
                      <Stethoscope size={18} strokeWidth={2.2} />
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="pt-chat-title">Faisal Hospital Assistant</span>
                        <span className="pt-chat-badge">
                          <span className="dot" />
                          Live SSE Stream
                        </span>
                      </div>
                      <div className="pt-chat-sub">Connected with HIS / OPD Registration Server</div>
                    </div>
                  </div>

                  <div className="pt-chat-actions">
                    <button
                      type="button"
                      onClick={handleTriggerUrdu}
                      className="pt-btn-urdu-chip"
                      title="اردو میں بات چیت شروع کریں"
                    >
                      <Languages size={14} aria-hidden="true" /> اردو میں پوچھیں
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConversationId(null);
                        setResetSignal((s) => s + 1);
                      }}
                      className="pt-btn-icon"
                      title="Start a new chat session"
                    >
                      <RefreshCw size={13} strokeWidth={2} />
                      <span>New chat</span>
                    </button>
                  </div>
                </div>

                <div className="pt-chat-ribbon">
                  Today · Shift Live Token Tracking Active
                </div>

                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                  <ChatPanel
                    channel="chat"
                    conversationId={conversationId}
                    onConversationId={setConversationId}
                    resetSignal={resetSignal}
                    externalPrompt={externalPrompt}
                    placeholder="Type your question in English or اردو (e.g. Doctor schedule, lab test, ICU fees)..."
                    greeting={`Welcome to Faisal Hospital! I am your 24/7 AI Clinical Desk Assistant. I can check doctor OPD schedules, reserve instant OPD appointment tokens, guide you to diagnostic wings, or verify Sehat Sahulat card coverage.\n\nآپ ڈاکٹرز کے کلینک کے اوقات، فیس اور ٹوکن کی معلومات اردو میں بھی معلوم کر سکتے ہیں۔ How may I assist you right now?`}
                    actionChips={ACTION_CHIPS}
                    popularSearches={POPULAR_SEARCHES}
                    onVoiceClick={() => navigate('/voice')}
                  />
                </div>
              </div>
            )}

            {/* TAB: BOOKING */}
            {activeTab === 'booking' && (
              <div className="pt-card-elevated pt-booking-pane">
                <div className="pt-pane-head">
                  <div>
                    <h2 className="pt-pane-title">Book an OPD Consultation</h2>
                    <p className="pt-pane-desc">
                      Select a confirmed specialist and pick a live 15-minute slot calculated according to their clinical shift.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('chat')}
                    className="pt-btn-urdu-chip"
                  >
                    ← Back to AI Desk
                  </button>
                </div>

                {bookingConfirmation ? (
                  <div className="pt-voucher">
                    <div className="no-print pt-voucher-icon">
                      <CheckCircle2 size={32} strokeWidth={2.4} />
                    </div>
                    <div className="slip-letterhead">
                      <div className="slip-hospital">FAISAL HOSPITAL</div>
                      <div className="slip-tagline">Academic Medical Center & OPD · East Canal Road, Faisalabad</div>
                      <div className="slip-title">APPOINTMENT SLIP</div>
                    </div>
                    <h3 className="no-print" style={{ margin: '0 0 8px', color: '#166534', fontWeight: 800 }}>Appointment Confirmed!</h3>
                    <p style={{ margin: '0 0 16px', fontSize: '0.94rem', color: '#15803d' }}>
                      Reference ID: <strong>{bookingConfirmation.id}</strong>
                    </p>
                    <div className="pt-voucher-details">
                      <div><strong>Patient:</strong> {bookName || '—'}</div>
                      <div><strong>Phone:</strong> {bookPhone || '—'}</div>
                      <div><strong>Specialist:</strong> {bookingConfirmation.doctor}</div>
                      <div><strong>Date:</strong> {bookingConfirmation.date}</div>
                      <div><strong>Time:</strong> {bookingConfirmation.time}</div>
                      <div><strong>Hospital Campus:</strong> Main Building (544-A) / Specialist Tower (545-A)</div>
                      <div style={{ marginTop: '10px', fontSize: '0.8rem', color: 'var(--pt-ink-3)' }}>
                        * Kindly arrive 10 minutes before your slot with your original CNIC / B-Form.
                      </div>
                    </div>
                    <div className="no-print" style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '24px' }}>
                      <button
                        type="button"
                        onClick={() => window.print()}
                        className="pt-btn-icon"
                        style={{ padding: '10px 20px', fontWeight: 600 }}
                      >
                        <Printer size={15} strokeWidth={2} /> Print Slip
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setBookingConfirmation(null);
                          setBookName('');
                          setBookPhone('');
                          setBookNotes('');
                        }}
                        className="pt-btn-submit"
                        style={{ width: 'auto', padding: '10px 24px', margin: 0 }}
                      >
                        Book Another Appointment
                      </button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleBookingSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    {bookingError && (
                      <div className="pt-alert pt-alert-danger" role="alert">
                        <AlertTriangle size={16} aria-hidden="true" />
                        <span>{bookingError}</span>
                      </div>
                    )}

                    <div className="pt-form-group">
                      <label htmlFor="book-service" className="pt-form-label">Select Specialist / Service *</label>
                      <select
                        id="book-service"
                        value={bookServiceId}
                        onChange={(e) => setBookServiceId(e.target.value)}
                        required
                        className="pt-select"
                      >
                        {doctors.map((d) => (
                          <option key={d.id} value={d.service_id ?? ''} disabled={!d.service_id}>
                            {d.name} — {d.title} (Fee: PKR {d.fee_pkr.toLocaleString()})
                          </option>
                        ))}
                      </select>

                      {selectedDoc && (
                        <div className="pt-doc-meta">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                              <Clock size={13} strokeWidth={2.2} /> Sitting Schedule:
                            </span>
                            <span style={{ background: '#ffffff', color: 'var(--pt-brand-deep)', padding: '2px 8px', borderRadius: '6px', fontWeight: 600, fontSize: '0.78rem', border: '1px solid #bfdbfe' }}>
                              {selectedDoc.schedules && selectedDoc.schedules.length > 0
                                ? selectedDoc.schedules.map((s) => `${s.day} (${s.start_time} - ${s.end_time})`).join(' • ')
                                : 'By appointment'}
                            </span>
                          </div>
                          <div style={{ color: 'var(--pt-ink-2)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 5 }}>
                            <MapPin size={13} strokeWidth={2.2} /> Room: {selectedDoc.room || `${selectedDoc.department.name}, ${selectedDoc.department.floor}`} • 15 min consultations
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="pt-form-group">
                      <div className="pt-field-label-row">
                        <label htmlFor="book-date" className="pt-form-label">Select Day & Date *</label>
                        {bookDate && (
                          <span className="pt-date-chip">
                            <Calendar size={12} strokeWidth={2} aria-hidden="true" /> {formatWeekdayDate(bookDate)}
                          </span>
                        )}
                      </div>

                      {/* Quick 7-Day Picker */}
                      <div className="pt-days-grid">
                        {upcomingDays.map((item) => {
                          const isSelected = bookDate === item.dateStr;
                          const onDuty = isDoctorSitting(item.fullDayName);
                          return (
                            <button
                              key={item.dateStr}
                              type="button"
                              onClick={() => setBookDate(item.dateStr)}
                              aria-pressed={isSelected}
                              className={`pt-day-card ${isSelected ? 'selected' : ''} ${!onDuty ? 'off-duty' : ''}`}
                            >
                              <span className="pt-day-name">{item.dayName}</span>
                              <span className="pt-day-date">{item.dateNum}</span>
                              <span className={`pt-day-badge ${onDuty ? 'on' : 'off'}`}>
                                {onDuty ? 'Sitting' : 'Off Duty'}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      <input
                        id="book-date"
                        type="date"
                        value={bookDate}
                        min={todayDate()}
                        onChange={(e) => setBookDate(e.target.value)}
                        required
                        className="pt-input"
                      />

                      {bookDate && !isDoctorSitting(getDayOfWeek(bookDate)) && selectedDoc && (
                        <div className="pt-alert pt-alert-warning" role="status" style={{ marginTop: 10 }}>
                          <AlertTriangle size={16} aria-hidden="true" />
                          <span>
                            <strong>{selectedDoc.name}</strong> does not sit on <strong>{getDayOfWeek(bookDate)}s</strong>. Please pick an active sitting day above.
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="pt-form-group">
                      <label className="pt-form-label">Available Shift Slots ({bookSlots.length}) *</label>
                      {slotsLoading ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: '8px' }}>
                          <Skeleton height="38px" borderRadius="8px" />
                          <Skeleton height="38px" borderRadius="8px" />
                          <Skeleton height="38px" borderRadius="8px" />
                          <Skeleton height="38px" borderRadius="8px" />
                        </div>
                      ) : bookSlots.length === 0 ? (
                        <div className="pt-empty">
                          No open slots on this date. Doctor may not be sitting or all slots are booked.
                        </div>
                      ) : (
                        <div className="pt-slots-grid">
                          {bookSlots.map((slot) => (
                            <button
                              type="button"
                              key={slot}
                              onClick={() => setBookTime(slot)}
                              aria-pressed={bookTime === slot}
                              className={`pt-slot-btn ${bookTime === slot ? 'selected' : ''}`}
                            >
                              {slot}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="pt-two-col">
                      <div>
                        <label htmlFor="book-name" className="pt-form-label">Patient Full Name *</label>
                        <input
                          id="book-name"
                          autoComplete="name"
                          type="text"
                          placeholder="e.g. Muhammad Hamza"
                          value={bookName}
                          onChange={(e) => setBookName(e.target.value)}
                          required
                          className="pt-input"
                        />
                      </div>
                      <div>
                        <label htmlFor="book-phone" className="pt-form-label">Contact Phone *</label>
                        <input
                          id="book-phone"
                          autoComplete="tel"
                          type="tel"
                          placeholder="0300-1234567"
                          value={bookPhone}
                          onChange={(e) => setBookPhone(e.target.value)}
                          required
                          className="pt-input"
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="book-notes" className="pt-form-label">Symptoms or Visit Notes (Optional)</label>
                      <textarea
                        id="book-notes"
                        placeholder="Brief details about your medical condition or visit purpose…"
                        value={bookNotes}
                        onChange={(e) => setBookNotes(e.target.value)}
                        rows={2}
                        className="pt-textarea"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={bookSubmitting || bookSlots.length === 0}
                      className="pt-btn-submit"
                    >
                      {bookSubmitting ? 'Confirming Appointment Token…' : 'Confirm & Reserve OPD Token'}
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* TAB: SPECIALISTS */}
            {activeTab === 'specialists' && (
              <div className="pt-card-elevated pt-specialists-pane">
                <div className="pt-pane-head">
                  <div>
                    <h2 className="pt-pane-title">Hospital Specialists & Weekly OPD Clinics</h2>
                    <p className="pt-pane-desc">
                      Browse our 18 verified clinical specialists, rooms, consultation fees, and visiting hours.
                    </p>
                  </div>
                </div>

                {/* Department Filter Pills */}
                <div className="pt-dept-filters">
                  <button
                    type="button"
                    onClick={() => setSelectedDept('all')}
                    aria-pressed={selectedDept === 'all'}
                    className={`pt-dept-pill ${selectedDept === 'all' ? 'active' : ''}`}
                  >
                    All ({doctors.length})
                  </button>
                  {departments.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setSelectedDept(d.id)}
                      aria-pressed={selectedDept === d.id}
                      className={`pt-dept-pill ${selectedDept === d.id ? 'active' : ''}`}
                    >
                      {d.name}
                    </button>
                  ))}
                </div>

                {doctors.length === 0 ? (
                  <SkeletonCards count={6} />
                ) : filteredDoctors.length === 0 ? (
                  <div className="pt-empty">
                    No consultant doctors found in the selected department.
                  </div>
                ) : (
                  <div className="pt-doctors-grid">
                    {filteredDoctors.map((doc) => (
                      <div key={doc.id} className="pt-doc-card">
                        <div>
                          <div className="pt-doc-card-head">
                            <div>
                              <h3 className="pt-doc-name">{doc.name}</h3>
                              <div className="pt-doc-title">{doc.title}</div>
                            </div>
                            <div className="pt-doc-fee">
                              PKR {doc.fee_pkr.toLocaleString()}
                            </div>
                          </div>

                          <div style={{ fontSize: '0.82rem', color: 'var(--pt-ink-2)', display: 'flex', flexDirection: 'column', gap: '3px', margin: '10px 0' }}>
                            <div><strong>Unit:</strong> {doc.department.name}</div>
                            <div style={{ color: 'var(--pt-ink-3)' }}><strong>Location:</strong> {doc.department.building}, {doc.room ?? 'OPD Room'}</div>
                          </div>

                          <div style={{ borderTop: '1px solid var(--pt-line-soft)', paddingTop: '10px' }}>
                            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--pt-ink-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
                              Weekly Shift Hours
                            </div>
                            <div className="pt-doc-schedules">
                              {doc.schedules.map((s, idx) => (
                                <span key={idx} className="pt-schedule-chip">
                                  {s.day}: {s.start_time} - {s.end_time}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleSelectDoctorForBooking(doc)}
                          className="pt-btn-book-doc"
                        >
                          Book With Doctor <ArrowRight size={14} strokeWidth={2.2} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB: DIAGNOSTICS */}
            {activeTab === 'diagnostics' && (
              <div className="pt-card-elevated" style={{ padding: '32px' }}>
                <h2 className="pt-pane-title">Central Diagnostics & 24/7 Pathology</h2>
                <p className="pt-pane-desc" style={{ marginBottom: '24px' }}>
                  Faisal Hospital houses advanced 24-hour diagnostic pathology, 64-slice CT, 1.5T MRI, and digital ultrasound suites.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px', marginBottom: '28px' }}>
                  <div className="pt-widget" style={{ background: '#f8faff' }}>
                    <div style={{ fontWeight: 800, color: 'var(--pt-ink)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.96rem' }}>
                      <FlaskConical size={18} color="#0d9488" strokeWidth={2.2} /> 24/7 Main Pathology & Blood Bank
                    </div>
                    <div style={{ fontSize: '0.84rem', color: 'var(--pt-ink-2)', lineHeight: 1.6 }}>
                      Ground Floor, Main Building (544-A). Routine and emergency blood tests, CBC, lipid profile, liver function, and emergency cross-matching.
                    </div>
                  </div>
                  <div className="pt-widget" style={{ background: '#f8faff' }}>
                    <div style={{ fontWeight: 800, color: 'var(--pt-ink)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.96rem' }}>
                      <Activity size={18} color="#1d4ed8" strokeWidth={2.2} /> Radiology & Imaging Suites
                    </div>
                    <div style={{ fontSize: '0.84rem', color: 'var(--pt-ink-2)', lineHeight: 1.6 }}>
                      Digital X-Ray, 4D Ultrasound, Color Doppler, 64-Slice CT Scan, and 1.5T MRI. Supervised by consultant radiologists.
                    </div>
                  </div>
                </div>

                <div style={{ background: 'var(--pt-brand-soft)', padding: '16px 22px', borderRadius: '12px', border: '1px solid #bfdbfe', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                  <span style={{ fontSize: '0.88rem', color: 'var(--pt-brand-deep)', fontWeight: 600 }}>
                    Have questions about test preparation, fasting, or pricing?
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('chat');
                      setExternalPrompt({ text: 'What are the diagnostic lab test timings and report delivery rules?', nonce: Date.now() });
                    }}
                    className="pt-btn pt-btn-primary"
                  >
                    Ask AI Assistant
                  </button>
                </div>
              </div>
            )}

            {/* TAB: EMERGENCY CARE */}
            {activeTab === 'emergency' && (
              <div className="pt-card-elevated" style={{ padding: '32px', borderColor: '#fecaca' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#fee2e2', color: '#991b1b', padding: '4px 12px', borderRadius: 'var(--pt-radius-full)', fontSize: '0.75rem', fontWeight: 800, marginBottom: 14 }}>
                  <Ambulance size={15} strokeWidth={2.2} /> 24 HOURS EMERGENCY & TRAUMA
                </div>
                <h2 className="pt-pane-title">Accident & Emergency Department (Gate 1)</h2>
                <p className="pt-pane-desc" style={{ marginBottom: '20px' }}>
                  Location: Main Building, 544-A East Canal Road, near Abdullahpur Flyover, Faisalabad.
                </p>

                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '18px 20px', marginBottom: '24px' }}>
                  <div style={{ fontWeight: 800, color: '#991b1b', marginBottom: 8, fontSize: '0.92rem' }}>
                    Red-Flag Emergency Symptoms:
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.84rem', color: '#7f1d1d', lineHeight: 1.7 }}>
                    <li>Acute chest pain, pressure, or symptoms of heart attack</li>
                    <li>Severe difficulty breathing or asthma exacerbation</li>
                    <li>Profuse bleeding, major burns, or road traffic trauma</li>
                    <li>Signs of stroke: facial drooping, arm numbness, slurred speech</li>
                    <li>Loss of consciousness, seizures, or acute poisoning</li>
                  </ul>
                </div>

                <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                  <a href="tel:111119119" className="pt-btn pt-btn-danger pt-btn-lg">
                    <Phone size={15} strokeWidth={2.2} aria-hidden="true" /> Call Emergency Helpline: 111-119-119
                  </a>
                  <a href="tel:0419201431" className="pt-btn pt-btn-danger-outline pt-btn-lg">
                    Casualty Desk: (041) 920-1431
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: SIDEBAR */}
          <div className="pt-sidebar">
            {/* Widget 1: FAQ */}
            <div className="pt-widget">
              <div className="pt-widget-title">
                <span>❔</span> Frequently Asked Questions
              </div>
              <div className="pt-widget-sub">Tap any question for instant AI verification</div>
              <div className="pt-faq-list">
                {FAQS.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setExternalPrompt({ text: item.text, nonce: Date.now() });
                      if (activeTab !== 'chat') setActiveTab('chat');
                    }}
                    className="pt-faq-btn"
                  >
                    <span style={{ color: 'var(--pt-brand)', fontWeight: 700 }}>•</span>
                    <span style={{ fontWeight: 500 }}>"{item.q}"</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Widget 2: Facilities */}
            <div className="pt-widget">
              <div className="pt-widget-title">
                <span>🏥</span> Facilities & Assistance
              </div>
              <div className="pt-widget-sub">Key services on hospital grounds</div>
              <div className="pt-facilities-list">
                {FACILITIES.map((f, i) => (
                  <div key={i} className="pt-facility-item">
                    <div
                      className="pt-facility-icon"
                      style={{ background: f.bg, color: f.color }}
                    >
                      {f.icon}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--pt-ink)', lineHeight: 1.3, fontSize: '0.84rem' }}>{f.title}</div>
                      <div style={{ color: 'var(--pt-ink-3)', marginTop: 2, lineHeight: 1.4, fontSize: '0.78rem' }}>{f.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Widget 3: Human Assistance */}
            <div className="pt-human-card">
              <div className="pt-human-title">
                <Phone size={14} strokeWidth={2.2} color="#93c5fd" />
                <span>Need Human Assistance?</span>
              </div>
              <div className="pt-human-sub">Reception & Nursing Staff Available</div>

              <p className="pt-human-desc">
                If you prefer speaking with a human receptionist for complex admissions, billing inquiries, or bed reservations:
              </p>

              <a href="tel:+92418542214" className="pt-btn-counter">
                Call Counter: +92 41 8542214
              </a>
              <a href="https://wa.me/923001234567" target="_blank" rel="noreferrer" className="pt-btn-wa">
                💬 WhatsApp Triage Desk
              </a>
            </div>
          </div>
        </div>
      </main>

      {/* 6. HOSPITAL LIVE STATUS TICKER */}
      <section className="pt-ticker-section">
        <div className="pt-ticker">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ color: '#dc2626', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span className="pt-strip-pulse" />
              CASUALTY WING: OPEN
            </span>
            <span style={{ color: 'var(--pt-line)' }}>|</span>
            <span style={{ color: 'var(--pt-ink-2)' }}>
              Bed Availability: <strong>ICU (3 Vacant)</strong> • <strong>General Ward (18 Vacant)</strong> • Dialysis Units Active
            </span>
          </div>
          <div style={{ color: 'var(--pt-brand)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <ShieldCheck size={15} strokeWidth={2.2} /> Punjab Healthcare Commission Regulated
          </div>
        </div>
      </section>

      {/* 7. COMPREHENSIVE FOOTER */}
      <footer className="pt-footer">
        <div className="pt-footer-grid">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <span className="pt-brand-mark" style={{ width: 32, height: 32 }}>
                <Stethoscope size={16} strokeWidth={2.2} />
              </span>
              <span style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--pt-ink)' }}>FAISAL HOSPITAL</span>
            </div>
            <p style={{ margin: 0, lineHeight: 1.6, color: 'var(--pt-ink-3)', fontSize: '0.82rem' }}>
              Advanced multi-specialty clinical infrastructure offering premier tertiary healthcare, 24/7 trauma response, and intelligent OPD consultation management in Faisalabad.
            </p>
          </div>

          <div>
            <div style={{ fontWeight: 800, color: 'var(--pt-ink)', marginBottom: '12px', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>
              Clinical Services
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.82rem', color: 'var(--pt-ink-2)' }}>
              <li>Trauma & Casualty Center (24/7)</li>
              <li>Outpatient Department (OPD Roster)</li>
              <li>Molecular Pathology & Imaging</li>
              <li>Cardiology & Nephrology Suites</li>
              <li>Tele-Triage & Digital Desk</li>
            </ul>
          </div>

          <div>
            <div style={{ fontWeight: 800, color: 'var(--pt-ink)', marginBottom: '12px', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>
              Patient & Visitor
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.82rem', color: 'var(--pt-ink-2)' }}>
              <li>AI Receptionist Guide</li>
              <li>OPD Timing: 08:00 AM - 10:00 PM</li>
              <li>Visiting Hours: 04:00 PM - 07:00 PM</li>
              <li>Wheelchair & Porter Booking</li>
              <li><Link to="/privacy" style={{ color: 'var(--pt-ink-2)', textDecoration: 'none' }}>Privacy & PHI Protection</Link></li>
            </ul>
          </div>

          <div>
            <div style={{ fontWeight: 800, color: 'var(--pt-ink)', marginBottom: '12px', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>
              Emergency Contacts
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', lineHeight: 1.4, fontSize: '0.82rem', color: 'var(--pt-ink-2)' }}>
              <div><strong style={{ color: '#dc2626' }}>Emergency:</strong> 111-119-119 / (041) 920-1431</div>
              <div><strong>Ambulance Dispatch:</strong> (041) 920-1432</div>
              <div><strong>Reception Landline:</strong> +92 41 8542214</div>
              <div style={{ color: 'var(--pt-ink-3)', fontSize: '0.75rem', marginTop: 4 }}>
                Address: East Canal Road & Mall Road Junction, People's Colony No. 1, Faisalabad
              </div>
            </div>
          </div>
        </div>

        <div className="pt-footer-sub">
          <div>
            © {new Date().getFullYear()} Faisal Hospital & Medical Research Institute. All rights reserved.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#16a34a', fontWeight: 600 }}>
              <span className="pt-tab-live-dot" />
              Live Clinical Dispatch Active
            </span>
            <span>•</span>
            <span>ISO 9001:2015 Certified</span>
            <span>•</span>
            <Link to="/terms" style={{ color: 'var(--pt-ink-3)', textDecoration: 'none' }}>Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
