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
  HeartPulse,
  User,
  FlaskConical,
  Ambulance,
  Activity,
} from 'lucide-react';
import { api } from '../api/client';
import ChatPanel, { type ActionChip, type PopularSearch } from '../components/ChatPanel';
import { Skeleton, SkeletonCards } from '../components/Skeleton';

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
  { icon: MessageSquare, q: 'Is Dr. Nadia Ali available this week?', text: 'What is the weekly OPD schedule for Dr. Nadia Ali?' },
  { icon: MapPin, q: 'Where is the Emergency Department located?', text: 'Where is the 24/7 Emergency Department located and how do I reach Gate 1?' },
  { icon: Stethoscope, q: 'What doctors sit in Urology & Nephrology?', text: 'Who are the doctors in Urology and what are their shift hours and fees?' },
  { icon: Clock, q: 'What are the visiting hours for CCU & ICU?', text: 'What are the visiting hours for the Intensive Care Unit (ICU) and general wards?' },
  { icon: ShieldCheck, q: 'Do you accept Government Sehat Sahulat Card?', text: 'Do you accept the government Sehat Sahulat Card for admissions and treatments?' },
  { icon: HeartPulse, q: 'Can an elderly patient get a wheelchair at Gate 1?', text: 'Can an elderly patient get a free wheelchair and porter assistance upon arrival at Gate 1?' },
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
      window.scrollTo({ top: 460, behavior: 'smooth' });
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
    <div style={{ minHeight: '100vh', background: '#f8fafc', color: '#0f172a', fontFamily: 'var(--font-sans)' }}>
      {/* 1. TOP EMERGENCY & CASUALTY STRIP */}
      <div style={{
        background: '#070b14',
        color: '#e2e8f0',
        padding: '7px 24px',
        fontSize: '0.8125rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '8px',
        borderBottom: '1px solid rgba(255,255,255,0.08)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#f87171', fontWeight: 600 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', display: 'inline-block', boxShadow: '0 0 8px #ef4444' }} />
            24/7 Casualty: (041) 920-1431
          </span>
          <span style={{ color: '#cbd5e1' }}>Direct Helpline: <strong>111-119-119</strong></span>
          <span style={{ color: '#94a3b8' }}>Mall Road & East Canal Road, Faisalabad, Punjab</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: '16px',
            padding: '2px',
            gap: '2px'
          }}>
            <button
              type="button"
              onClick={() => setLangPreference('en')}
              style={{
                background: langPreference === 'en' ? '#1d4ed8' : 'transparent',
                color: langPreference === 'en' ? '#ffffff' : '#94a3b8',
                border: 'none',
                borderRadius: '14px',
                padding: '2px 8px',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              EN
            </button>
            <button
              type="button"
              onClick={handleTriggerUrdu}
              style={{
                background: langPreference === 'ur' ? '#1d4ed8' : 'transparent',
                color: langPreference === 'ur' ? '#ffffff' : '#94a3b8',
                border: 'none',
                borderRadius: '14px',
                padding: '2px 8px',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              اردو
            </button>
          </div>
          <Link
            to="/admin/login"
            style={{
              color: '#93c5fd',
              textDecoration: 'none',
              fontWeight: 500,
              padding: '3px 9px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Lock size={12} strokeWidth={2} /> Staff Portal
          </Link>
        </div>
      </div>

      {/* 2. MAIN HOSPITAL NAVIGATION HEADER */}
      <header style={{
        background: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        padding: '12px 24px',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
      }}>
        <div style={{ maxWidth: '1240px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          {/* Logo & Subtitle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }} onClick={() => setActiveTab('chat')}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '6px',
              background: '#0f172a',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              border: '1px solid #1e293b'
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: '1.1875rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.1, letterSpacing: '-0.015em' }}>
                FAISAL HOSPITAL
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500, letterSpacing: '0.01em' }}>
                Academic Medical Center & OPD
              </div>
            </div>
          </div>

          {/* Center Navigation Tabs */}
          <nav style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              onClick={() => setActiveTab('chat')}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: activeTab === 'chat' ? '1px solid #0f172a' : '1px solid transparent',
                background: activeTab === 'chat' ? '#0f172a' : 'transparent',
                color: activeTab === 'chat' ? '#ffffff' : '#334155',
                fontSize: '0.84375rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.12s ease'
              }}
            >
              AI Receptionist
            </button>
            <button
              onClick={() => setActiveTab('booking')}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: activeTab === 'booking' ? '1px solid #0f172a' : '1px solid transparent',
                background: activeTab === 'booking' ? '#0f172a' : 'transparent',
                color: activeTab === 'booking' ? '#ffffff' : '#334155',
                fontSize: '0.84375rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.12s ease'
              }}
            >
              Book Appointment
            </button>
            <button
              onClick={() => setActiveTab('specialists')}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: activeTab === 'specialists' ? '1px solid #0f172a' : '1px solid transparent',
                background: activeTab === 'specialists' ? '#0f172a' : 'transparent',
                color: activeTab === 'specialists' ? '#ffffff' : '#334155',
                fontSize: '0.84375rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.12s ease'
              }}
            >
              Doctors & OPD Shifts
            </button>
            <button
              onClick={() => setActiveTab('diagnostics')}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: activeTab === 'diagnostics' ? '1px solid #0f172a' : '1px solid transparent',
                background: activeTab === 'diagnostics' ? '#0f172a' : 'transparent',
                color: activeTab === 'diagnostics' ? '#ffffff' : '#334155',
                fontSize: '0.84375rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.12s ease'
              }}
            >
              Diagnostic & Labs
            </button>
            <button
              onClick={() => setActiveTab('emergency')}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: activeTab === 'emergency' ? '1px solid #0f172a' : '1px solid transparent',
                background: activeTab === 'emergency' ? '#0f172a' : 'transparent',
                color: activeTab === 'emergency' ? '#ffffff' : '#334155',
                fontSize: '0.84375rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.12s ease'
              }}
            >
              Emergency Care
            </button>
          </nav>

          {/* Right Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Link
              to="/voice"
              style={{
                padding: '7px 14px',
                borderRadius: '20px',
                textDecoration: 'none',
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                color: '#334155',
                fontSize: '0.8125rem',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
              }}
            >
              <Phone size={14} color="#1d4ed8" strokeWidth={2.2} />
              <span>Voice Assistant</span>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} />
            </Link>
            <button
              type="button"
              onClick={() => {
                setActiveTab('booking');
                window.scrollTo({ top: 460, behavior: 'smooth' });
              }}
              style={{
                padding: '8px 18px',
                borderRadius: '6px',
                border: 'none',
                background: '#026aa7',
                color: '#ffffff',
                fontSize: '0.8125rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              Book Visit
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin/login')}
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                background: '#f1f5f9',
                border: '1px solid #cbd5e1',
                color: '#475569',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
              title="Staff & Operator Login"
            >
              <User size={16} strokeWidth={2} />
            </button>
          </div>
        </div>
      </header>

      {/* 3. HERO INTRO SECTION & VOICE RECEPTIONIST BANNER */}
      <section style={{
        background: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        padding: '36px 24px 28px'
      }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: '#f1f5f9',
            color: '#1e40af',
            padding: '4px 14px',
            borderRadius: '20px',
            border: '1px solid #cbd5e1',
            fontSize: '0.78125rem',
            fontWeight: 600,
            marginBottom: '14px'
          }}>
            <ShieldCheck size={14} strokeWidth={2} color="#1d4ed8" />
            Official Patient Care Desk • Automated OPD Scheduling & Triage Enquiry
          </div>

          <h1 style={{
            fontSize: '2.375rem',
            fontWeight: 800,
            margin: '0 0 10px 0',
            color: '#0f172a',
            letterSpacing: '-0.025em',
            lineHeight: 1.15
          }}>
            Welcome to Faisal Hospital AI Receptionist
          </h1>

          <p style={{
            maxWidth: '740px',
            margin: '0 auto 22px',
            color: '#475569',
            fontSize: '1rem',
            lineHeight: 1.55
          }}>
            Consult in English or اردو for consultant OPD shifts, booking verified appointments, checking diagnostic lab reports, or finding 24/7 emergency trauma care.
          </p>

          {/* Voice Receptionist Available Callout Banner */}
          <div style={{
            maxWidth: '620px',
            margin: '0 auto 12px',
            background: '#f0f7ff',
            border: '1px solid #bfdbfe',
            borderRadius: '30px',
            padding: '6px 10px 6px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            boxShadow: '0 1px 3px rgba(37,99,235,0.06)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3, color: '#2563eb' }}>
                <span style={{ width: 3, height: 12, background: '#2563eb', borderRadius: 2 }} />
                <span style={{ width: 3, height: 18, background: '#2563eb', borderRadius: 2 }} />
                <span style={{ width: 3, height: 8, background: '#2563eb', borderRadius: 2 }} />
                <span style={{ width: 3, height: 16, background: '#2563eb', borderRadius: 2 }} />
                <span style={{ width: 3, height: 10, background: '#2563eb', borderRadius: 2 }} />
              </div>
              <span style={{ fontSize: '0.84375rem', color: '#1e40af', fontWeight: 600 }}>
                Voice Receptionist Available <span style={{ fontWeight: 400, color: '#475569' }}>— Click to speak in Urdu or English</span>
              </span>
            </div>
            <Link
              to="/voice"
              style={{
                background: '#0f172a',
                color: '#ffffff',
                border: 'none',
                borderRadius: '20px',
                padding: '7px 16px',
                fontSize: '0.8125rem',
                fontWeight: 600,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap'
              }}
            >
              Start Voice Call
            </Link>
          </div>
        </div>
      </section>

      {/* 4. OPERATIONAL SHIFT CARDS ROW (4 CARDS) */}
      <section style={{ maxWidth: '1240px', margin: '28px auto 0', padding: '0 24px' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '14px',
        }}>
          {/* Card 1: Emergency & Casualty */}
          <div style={{
            background: '#ffffff',
            padding: '16px 18px',
            borderRadius: '8px',
            border: '1px solid #fecaca',
            boxShadow: 'var(--shadow-xs)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '8px'
          }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Emergency & Casualty
                </span>
                <span style={{ fontSize: '0.6875rem', background: '#fee2e2', color: '#991b1b', padding: '2px 7px', borderRadius: '4px', fontWeight: 600 }}>
                  Immediate Triage
                </span>
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>
                24/7 Active Gate 1
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 3 }}>
                Trauma team, resuscitation bay, acute CCU bypass
              </div>
            </div>
            <div style={{ borderTop: '1px solid #fee2e2', paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
              <span style={{ color: '#dc2626', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Phone size={12} strokeWidth={2.2} /> 111-119-119
              </span>
              <span style={{ color: '#64748b' }}>Rapid Dispatch</span>
            </div>
          </div>

          {/* Card 2: Morning OPD Shift */}
          <div style={{
            background: '#ffffff',
            padding: '16px 18px',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            boxShadow: 'var(--shadow-xs)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '8px'
          }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Morning OPD Shift
                </span>
                <span style={{ fontSize: '0.6875rem', background: '#e0f2fe', color: '#0369a1', padding: '2px 7px', borderRadius: '4px', fontWeight: 600 }}>
                  ● Open
                </span>
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>
                09:00 AM – 02:00 PM
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 3 }}>
                Mon – Sat • General Medicine & Senior Consultants
              </div>
            </div>
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
              <span style={{ color: '#334155', fontWeight: 600 }}>32 Doctors On Duty</span>
              <span style={{ color: '#1d4ed8', fontWeight: 600 }}>Counter 1-8</span>
            </div>
          </div>

          {/* Card 3: Evening OPD Shift */}
          <div style={{
            background: '#ffffff',
            padding: '16px 18px',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            boxShadow: 'var(--shadow-xs)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '8px'
          }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#0f766e', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Evening OPD Shift
                </span>
                <span style={{ fontSize: '0.6875rem', background: '#ccfbf1', color: '#0f766e', padding: '2px 7px', borderRadius: '4px', fontWeight: 600 }}>
                  Tokens Live
                </span>
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>
                05:00 PM – 09:30 PM
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 3 }}>
                Specialist Surgical, Gynecology & Pediatric Clinics
              </div>
            </div>
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
              <span style={{ color: '#334155', fontWeight: 500 }}>Evening OPD Wing A & B</span>
              <span style={{ color: '#0f766e', fontWeight: 600 }}>Pre-booking Open</span>
            </div>
          </div>

          {/* Card 4: Central Diagnostics */}
          <div style={{
            background: '#ffffff',
            padding: '16px 18px',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            boxShadow: 'var(--shadow-xs)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '8px'
          }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Central Diagnostics
                </span>
                <span style={{ fontSize: '0.6875rem', background: '#f1f5f9', color: '#334155', padding: '2px 7px', borderRadius: '4px', fontWeight: 600 }}>
                  24/7 Sampling
                </span>
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>
                Pathology & Radiology
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 3 }}>
                Ground Floor Wing B • Digital Portal Sync & SMS Reports
              </div>
            </div>
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
              <span style={{ color: '#1d4ed8', fontWeight: 600 }}>1.5T MRI / 64-Slice CT</span>
              <span style={{ color: '#64748b' }}>Reports &lt; 2 Hrs</span>
            </div>
          </div>
        </div>
      </section>

      {/* 5. MAIN INTERACTIVE WORKSPACE (TWO COLUMNS) */}
      <main style={{ maxWidth: '1240px', margin: '24px auto', padding: '0 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 350px', gap: '24px', alignItems: 'start' }}>
          {/* LEFT COLUMN: ACTIVE TAB CONTENT */}
          <div>
            {/* TAB: AI RECEPTIONIST CHAT */}
            {activeTab === 'chat' && (
              <div style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                overflow: 'hidden',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                height: '710px',
                display: 'flex',
                flexDirection: 'column'
              }}>
                {/* Chat Header Bar */}
                <div style={{
                  padding: '12px 20px',
                  background: '#ffffff',
                  borderBottom: '1px solid #e2e8f0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexShrink: 0
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      background: '#0f172a',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Stethoscope size={16} strokeWidth={2.2} />
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#0f172a' }}>Faisal Hospital Assistant</span>
                        <span style={{
                          fontSize: '0.6875rem',
                          background: '#dcfce7',
                          color: '#15803d',
                          padding: '1px 7px',
                          borderRadius: '10px',
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#16a34a' }} />
                          Live SSE Stream
                        </span>
                      </div>
                      <div style={{ fontSize: '0.71875rem', color: '#64748b' }}>
                        Connected with HIS / OPD Registration Server
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={handleTriggerUrdu}
                      style={{
                        background: '#f8fafc',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        padding: '4px 10px',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                        color: '#1e40af',
                        fontWeight: 600
                      }}
                      title="اردو میں بات چیت شروع کریں"
                    >
                      اردو میں پوچھیں 文A
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConversationId(null);
                        setResetSignal((s) => s + 1);
                      }}
                      style={{
                        background: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        padding: '4px 8px',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                        color: '#475569',
                      }}
                      title="Start a new chat session"
                    >
                      <RefreshCw size={13} strokeWidth={2} />
                    </button>
                  </div>
                </div>

                {/* Sub-header Date Ribbon */}
                <div style={{
                  background: '#f8fafc',
                  borderBottom: '1px solid #f1f5f9',
                  textAlign: 'center',
                  padding: '4px 0',
                  fontSize: '0.71875rem',
                  color: '#64748b',
                  fontWeight: 500
                }}>
                  Today • Shift Live Token Tracking Active
                </div>

                {/* Chat Conversation Engine */}
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

            {/* TAB: DIRECT APPOINTMENT BOOKING */}
            {activeTab === 'booking' && (
              <div style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '28px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div>
                    <h2 style={{ fontSize: '1.375rem', fontWeight: 800, margin: '0 0 4px 0', color: '#0f172a' }}>
                      Book an OPD Consultation
                    </h2>
                    <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b' }}>
                      Select a confirmed specialist and pick a live 15-minute slot calculated according to their clinical shift.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('chat')}
                    style={{
                      background: '#eff6ff',
                      border: '1px solid #bfdbfe',
                      color: '#1d4ed8',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Back to AI Desk
                  </button>
                </div>

                {bookingConfirmation ? (
                  <div style={{
                    padding: '24px',
                    borderRadius: '8px',
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    textAlign: 'center'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
                      <CheckCircle2 size={36} color="#16a34a" strokeWidth={2} />
                    </div>
                    <h3 style={{ margin: '0 0 8px 0', color: '#166534', fontWeight: 800 }}>Appointment Confirmed!</h3>
                    <p style={{ margin: '0 0 16px 0', fontSize: '0.9375rem', color: '#15803d' }}>
                      Reference ID: <strong>{bookingConfirmation.id}</strong>
                    </p>
                    <div style={{ background: '#ffffff', padding: '16px', borderRadius: '8px', border: '1px solid #dcfce7', textAlign: 'left', fontSize: '0.875rem', lineHeight: 1.6, color: '#334155' }}>
                      <div><strong>Specialist:</strong> {bookingConfirmation.doctor}</div>
                      <div><strong>Date:</strong> {bookingConfirmation.date}</div>
                      <div><strong>Time:</strong> {bookingConfirmation.time}</div>
                      <div><strong>Hospital Campus:</strong> Main Building (544-A) / Specialist Tower (545-A)</div>
                      <div style={{ marginTop: '8px', fontSize: '0.8125rem', color: '#64748b' }}>
                        * Kindly arrive 10 minutes before your slot with your original CNIC / B-Form.
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setBookingConfirmation(null);
                        setBookName('');
                        setBookPhone('');
                        setBookNotes('');
                      }}
                      style={{
                        marginTop: '20px',
                        padding: '10px 20px',
                        borderRadius: '6px',
                        border: 'none',
                        background: '#16a34a',
                        color: '#ffffff',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Book Another Appointment
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleBookingSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {bookingError && (
                      <div style={{ padding: '12px', borderRadius: '6px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '0.875rem' }}>
                        {bookingError}
                      </div>
                    )}

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                        Select Specialist / Service *
                      </label>
                      <select
                        value={bookServiceId}
                        onChange={(e) => setBookServiceId(e.target.value)}
                        required
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          fontSize: '0.875rem',
                          outline: 'none',
                          background: '#ffffff'
                        }}
                      >
                        {doctors.map((d) => (
                          <option key={d.id} value={d.service_id ?? ''} disabled={!d.service_id}>
                            {d.name} — {d.title} (Fee: PKR {d.fee_pkr.toLocaleString()})
                          </option>
                        ))}
                      </select>

                      {selectedDoc && (
                        <div style={{
                          marginTop: '8px',
                          padding: '10px 14px',
                          background: '#f8fafc',
                          borderRadius: '6px',
                          border: '1px solid #e2e8f0',
                          fontSize: '0.8125rem',
                          color: '#334155',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600, color: '#0f172a', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <Clock size={13} strokeWidth={2} /> Sitting Schedule:
                            </span>
                            <span style={{
                              background: '#e0e7ff',
                              color: '#4338ca',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontWeight: 600,
                              fontSize: '0.75rem'
                            }}>
                              {selectedDoc.schedules && selectedDoc.schedules.length > 0
                                ? selectedDoc.schedules.map((s) => `${s.day} (${s.start_time} - ${s.end_time})`).join(' • ')
                                : 'By appointment'}
                            </span>
                          </div>
                          <div style={{ color: '#64748b', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <MapPin size={13} strokeWidth={2} /> Room: {selectedDoc.room || `${selectedDoc.department.name}, ${selectedDoc.department.floor}`} • 15 min consultations
                          </div>
                        </div>
                      )}
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#334155', margin: 0 }}>
                          Select Day & Date *
                        </label>
                        {bookDate && (
                          <span style={{ fontSize: '0.78rem', color: '#1d4ed8', fontWeight: 600, background: '#eff6ff', padding: '2px 8px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <Calendar size={12} strokeWidth={2} /> {formatWeekdayDate(bookDate)}
                          </span>
                        )}
                      </div>

                      {/* Quick 7-Day Picker */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(76px, 1fr))',
                        gap: '6px',
                        marginBottom: '8px'
                      }}>
                        {upcomingDays.map((item) => {
                          const isSelected = bookDate === item.dateStr;
                          const onDuty = isDoctorSitting(item.fullDayName);
                          return (
                            <button
                              key={item.dateStr}
                              type="button"
                              onClick={() => setBookDate(item.dateStr)}
                              style={{
                                padding: '8px 4px',
                                borderRadius: '6px',
                                border: isSelected
                                  ? '2px solid #1d4ed8'
                                  : onDuty
                                  ? '1px solid #cbd5e1'
                                  : '1px dashed #e2e8f0',
                                background: isSelected
                                  ? '#eff6ff'
                                  : onDuty
                                  ? '#ffffff'
                                  : '#f8fafc',
                                cursor: 'pointer',
                                textAlign: 'center',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '2px',
                                opacity: onDuty ? 1 : 0.6,
                                transition: 'all 0.15s ease'
                              }}
                            >
                              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: isSelected ? '#1d4ed8' : '#334155' }}>
                                {item.dayName}
                              </span>
                              <span style={{ fontSize: '0.75rem', color: isSelected ? '#1d4ed8' : '#64748b' }}>
                                {item.dateNum}
                              </span>
                              <span style={{
                                fontSize: '0.625rem',
                                fontWeight: 600,
                                color: onDuty ? '#16a34a' : '#94a3b8',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 3
                              }}>
                                {onDuty ? 'Sitting' : 'Off Duty'}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      <input
                        type="date"
                        value={bookDate}
                        min={todayDate()}
                        onChange={(e) => setBookDate(e.target.value)}
                        required
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          fontSize: '0.875rem',
                          outline: 'none',
                          background: '#ffffff'
                        }}
                      />

                      {bookDate && !isDoctorSitting(getDayOfWeek(bookDate)) && selectedDoc && (
                        <div style={{
                          marginTop: '8px',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          background: '#fffbeb',
                          border: '1px solid #fef3c7',
                          fontSize: '0.78rem',
                          color: '#b45309',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}>
                          <AlertTriangle size={14} color="#b45309" strokeWidth={2} />
                          <span>
                            <strong>{selectedDoc.name}</strong> does not sit on <strong>{getDayOfWeek(bookDate)}s</strong>. Please pick an active sitting day above.
                          </span>
                        </div>
                      )}
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                        Available Shift Slots ({bookSlots.length}) *
                      </label>
                      {slotsLoading ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '8px', padding: '4px 0' }}>
                          <Skeleton height="34px" borderRadius="var(--radius-sm)" />
                          <Skeleton height="34px" borderRadius="var(--radius-sm)" />
                          <Skeleton height="34px" borderRadius="var(--radius-sm)" />
                          <Skeleton height="34px" borderRadius="var(--radius-sm)" />
                        </div>
                      ) : bookSlots.length === 0 ? (
                        <div style={{ fontSize: '0.8125rem', color: '#ef4444', padding: '8px 0' }}>
                          No open slots on this date. Doctor may not be sitting or all slots are booked.
                        </div>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '8px', maxHeight: '160px', overflowY: 'auto', padding: '4px' }}>
                          {bookSlots.map((slot) => (
                            <button
                              type="button"
                              key={slot}
                              onClick={() => setBookTime(slot)}
                              style={{
                                padding: '8px',
                                borderRadius: '6px',
                                border: bookTime === slot ? '2px solid #1d4ed8' : '1px solid #cbd5e1',
                                background: bookTime === slot ? '#eff6ff' : '#ffffff',
                                color: bookTime === slot ? '#1d4ed8' : '#334155',
                                fontWeight: bookTime === slot ? 700 : 500,
                                fontSize: '0.8125rem',
                                cursor: 'pointer'
                              }}
                            >
                              {slot}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                          Patient Full Name *
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Muhammad Hamza"
                          value={bookName}
                          onChange={(e) => setBookName(e.target.value)}
                          required
                          style={{
                            width: '100%',
                            padding: '9px 12px',
                            borderRadius: '6px',
                            border: '1px solid #cbd5e1',
                            fontSize: '0.875rem',
                            outline: 'none'
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                          Contact Phone (e.g. 0300-1234567) *
                        </label>
                        <input
                          type="tel"
                          placeholder="0300-1234567"
                          value={bookPhone}
                          onChange={(e) => setBookPhone(e.target.value)}
                          required
                          style={{
                            width: '100%',
                            padding: '9px 12px',
                            borderRadius: '6px',
                            border: '1px solid #cbd5e1',
                            fontSize: '0.875rem',
                            outline: 'none'
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                        Symptoms or Visit Notes (Optional)
                      </label>
                      <textarea
                        placeholder="Brief details about your medical condition or visit purpose…"
                        value={bookNotes}
                        onChange={(e) => setBookNotes(e.target.value)}
                        rows={2}
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          fontSize: '0.875rem',
                          outline: 'none',
                          resize: 'vertical'
                        }}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={bookSubmitting || bookSlots.length === 0}
                      style={{
                        padding: '12px',
                        borderRadius: '6px',
                        border: 'none',
                        background: '#1d4ed8',
                        color: '#ffffff',
                        fontSize: '0.9375rem',
                        fontWeight: 700,
                        cursor: bookSubmitting || bookSlots.length === 0 ? 'not-allowed' : 'pointer',
                        opacity: bookSubmitting || bookSlots.length === 0 ? 0.6 : 1,
                        marginTop: '4px'
                      }}
                    >
                      {bookSubmitting ? 'Confirming Appointment Token…' : 'Confirm & Reserve OPD Token'}
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* TAB: SPECIALISTS & OPD SHIFTS */}
            {activeTab === 'specialists' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <h2 style={{ fontSize: '1.375rem', fontWeight: 800, margin: '0 0 4px 0', color: '#0f172a' }}>
                      Hospital Specialists & Weekly OPD Clinics
                    </h2>
                    <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b' }}>
                      Browse our 18 verified clinical specialists, rooms, consultation fees, and visiting hours.
                    </p>
                  </div>

                  {/* Department Filter Pills */}
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => setSelectedDept('all')}
                      style={{
                        padding: '5px 12px',
                        borderRadius: '16px',
                        border: '1px solid',
                        borderColor: selectedDept === 'all' ? '#1d4ed8' : '#cbd5e1',
                        background: selectedDept === 'all' ? '#1d4ed8' : '#ffffff',
                        color: selectedDept === 'all' ? '#ffffff' : '#475569',
                        fontSize: '0.78125rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      All ({doctors.length})
                    </button>
                    {departments.map((d) => (
                      <button
                        key={d.id}
                        onClick={() => setSelectedDept(d.id)}
                        style={{
                          padding: '5px 12px',
                          borderRadius: '16px',
                          border: '1px solid',
                          borderColor: selectedDept === d.id ? '#1d4ed8' : '#cbd5e1',
                          background: selectedDept === d.id ? '#1d4ed8' : '#ffffff',
                          color: selectedDept === d.id ? '#ffffff' : '#475569',
                          fontSize: '0.78125rem',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        {d.name}
                      </button>
                    ))}
                  </div>
                </div>

                {doctors.length === 0 ? (
                  <SkeletonCards count={6} />
                ) : filteredDoctors.length === 0 ? (
                  <div style={{ padding: '32px', textAlign: 'center', color: '#64748b', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                    No consultant doctors found in the selected department.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px' }}>
                    {filteredDoctors.map((doc) => (
                      <div
                        key={doc.id}
                        style={{
                          background: '#ffffff',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                          padding: '16px',
                          boxShadow: 'var(--shadow-xs)',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          gap: '12px'
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                            <div>
                              <h3 style={{ margin: '0 0 2px 0', fontSize: '0.96875rem', fontWeight: 700, color: '#0f172a' }}>
                                {doc.name}
                              </h3>
                              <div style={{ fontSize: '0.8125rem', color: '#1d4ed8', fontWeight: 600 }}>
                                {doc.title}
                              </div>
                            </div>
                            <div style={{ background: '#f1f5f9', color: '#0f172a', fontWeight: 700, padding: '3px 8px', borderRadius: '4px', fontSize: '0.75rem', border: '1px solid #e2e8f0' }}>
                              PKR {doc.fee_pkr.toLocaleString()}
                            </div>
                          </div>

                          <div style={{ fontSize: '0.8125rem', color: '#64748b', display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '8px' }}>
                            <div><strong>Unit:</strong> {doc.department.name}</div>
                            <div><strong>Location:</strong> {doc.department.building}, {doc.room ?? 'OPD Room'}</div>
                          </div>

                          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '8px' }}>
                            <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>
                              Weekly Shift Hours
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                              {doc.schedules.map((s, idx) => (
                                <span
                                  key={idx}
                                  style={{
                                    background: '#eff6ff',
                                    color: '#1d4ed8',
                                    border: '1px solid #dbeafe',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    fontSize: '0.71875rem',
                                    fontWeight: 500
                                  }}
                                >
                                  {s.day}: {s.start_time} - {s.end_time}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => handleSelectDoctorForBooking(doc)}
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            borderRadius: '6px',
                            border: '1px solid #1d4ed8',
                            background: '#eff6ff',
                            color: '#1d4ed8',
                            fontSize: '0.8125rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6
                          }}
                        >
                          Book With Doctor <ArrowRight size={13} strokeWidth={2} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB: DIAGNOSTICS & LABS */}
            {activeTab === 'diagnostics' && (
              <div style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '28px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
              }}>
                <h2 style={{ fontSize: '1.375rem', fontWeight: 800, margin: '0 0 6px 0', color: '#0f172a' }}>
                  Central Diagnostics & 24/7 Pathology
                </h2>
                <p style={{ margin: '0 0 20px 0', fontSize: '0.875rem', color: '#64748b' }}>
                  Faisal Hospital houses advanced 24-hour diagnostic pathology, 64-slice CT, 1.5T MRI, and digital ultrasound suites.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                  <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <FlaskConical size={16} color="#0d9488" strokeWidth={2.2} /> 24/7 Main Pathology & Blood Bank
                    </div>
                    <div style={{ fontSize: '0.8125rem', color: '#475569', lineHeight: 1.5 }}>
                      Ground Floor, Main Building (544-A). Routine and emergency blood tests, CBC, lipid profile, liver function, and emergency cross-matching.
                    </div>
                  </div>
                  <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Activity size={16} color="#1d4ed8" strokeWidth={2.2} /> Radiology & Imaging Suites
                    </div>
                    <div style={{ fontSize: '0.8125rem', color: '#475569', lineHeight: 1.5 }}>
                      Digital X-Ray, 4D Ultrasound, Color Doppler, 64-Slice CT Scan, and 1.5T MRI. Supervised by consultant radiologists.
                    </div>
                  </div>
                </div>

                <div style={{ background: '#eff6ff', padding: '14px 18px', borderRadius: '8px', border: '1px solid #bfdbfe', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                  <span style={{ fontSize: '0.84375rem', color: '#1e40af', fontWeight: 600 }}>
                    Have questions about test preparation, fasting, or pricing?
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('chat');
                      setExternalPrompt({ text: 'What are the diagnostic lab test timings and report delivery rules?', nonce: Date.now() });
                    }}
                    style={{
                      background: '#1d4ed8',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '6px 14px',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Ask AI Assistant
                  </button>
                </div>
              </div>
            )}

            {/* TAB: EMERGENCY CARE */}
            {activeTab === 'emergency' && (
              <div style={{
                background: '#ffffff',
                border: '1px solid #fecaca',
                borderRadius: '12px',
                padding: '28px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
              }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fee2e2', color: '#991b1b', padding: '3px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700, marginBottom: 12 }}>
                  <Ambulance size={14} strokeWidth={2.2} /> 24 HOURS EMERGENCY & TRAUMA
                </div>
                <h2 style={{ fontSize: '1.375rem', fontWeight: 800, margin: '0 0 6px 0', color: '#0f172a' }}>
                  Accident & Emergency Department (Gate 1)
                </h2>
                <p style={{ margin: '0 0 20px 0', fontSize: '0.875rem', color: '#64748b' }}>
                  Location: Main Building, 544-A East Canal Road, near Abdullahpur Flyover, Faisalabad.
                </p>

                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
                  <div style={{ fontWeight: 700, color: '#991b1b', marginBottom: 6 }}>
                    Red-Flag Emergency Symptoms:
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.8125rem', color: '#7f1d1d', lineHeight: 1.6 }}>
                    <li>Acute chest pain, pressure, or symptoms of heart attack</li>
                    <li>Severe difficulty breathing or asthma exacerbation</li>
                    <li>Profuse bleeding, major burns, or road traffic trauma</li>
                    <li>Signs of stroke: facial drooping, arm numbness, slurred speech</li>
                    <li>Loss of consciousness, seizures, or acute poisoning</li>
                  </ul>
                </div>

                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <a
                    href="tel:111119119"
                    style={{
                      background: '#dc2626',
                      color: '#ffffff',
                      textDecoration: 'none',
                      padding: '10px 18px',
                      borderRadius: '6px',
                      fontWeight: 700,
                      fontSize: '0.875rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8
                    }}
                  >
                    <Phone size={15} strokeWidth={2.2} /> Call Emergency Helpline: 111-119-119
                  </a>
                  <a
                    href="tel:0419201431"
                    style={{
                      background: '#ffffff',
                      color: '#dc2626',
                      border: '1px solid #dc2626',
                      textDecoration: 'none',
                      padding: '10px 18px',
                      borderRadius: '6px',
                      fontWeight: 700,
                      fontSize: '0.875rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8
                    }}
                  >
                    Casualty Desk: (041) 920-1431
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: SIDEBAR (FAQ + FACILITIES + HUMAN ASSISTANCE) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Card 1: Frequently Asked Questions */}
            <div style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '16px 18px',
              boxShadow: 'var(--shadow-xs)'
            }}>
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '0.9375rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>❔</span> Frequently Asked Questions
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
                  Tap any question for instant AI verification
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                {FAQS.map((item, idx) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setExternalPrompt({ text: item.text, nonce: Date.now() });
                        if (activeTab !== 'chat') setActiveTab('chat');
                      }}
                      style={{
                        padding: '9px 12px',
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '6px',
                        fontSize: '0.8125rem',
                        color: '#0f172a',
                        textAlign: 'left',
                        cursor: 'pointer',
                        lineHeight: 1.4,
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 8,
                        transition: 'all 0.15s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#f8fafc';
                        e.currentTarget.style.borderColor = '#cbd5e1';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#ffffff';
                        e.currentTarget.style.borderColor = '#e2e8f0';
                      }}
                    >
                      <Icon size={14} style={{ flexShrink: 0, marginTop: 2, color: '#2563eb' }} strokeWidth={2} />
                      <span style={{ fontWeight: 500 }}>"{item.q}"</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Card 2: Facilities & Assistance */}
            <div style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '16px 18px',
              boxShadow: 'var(--shadow-xs)'
            }}>
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '0.9375rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>🏥</span> Facilities & Assistance
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
                  Key services on hospital grounds
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {FACILITIES.map((f, i) => (
                  <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', fontSize: '0.78125rem' }}>
                    <div style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '6px',
                      background: f.bg,
                      color: f.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '13px',
                      flexShrink: 0
                    }}>
                      {f.icon}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: '#0f172a', lineHeight: 1.3 }}>{f.title}</div>
                      <div style={{ color: '#64748b', marginTop: 2, lineHeight: 1.4 }}>{f.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Card 3: Need Human Assistance? (Dark Navy Card) */}
            <div style={{
              background: '#091424',
              border: '1px solid #1e293b',
              borderRadius: '12px',
              padding: '18px 20px',
              color: '#ffffff',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                <div style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Phone size={13} strokeWidth={2.2} color="#93c5fd" />
                </div>
                <div style={{ fontWeight: 800, fontSize: '0.96875rem', color: '#ffffff' }}>
                  Need Human Assistance?
                </div>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '10px', paddingLeft: '34px' }}>
                Reception & Nursing Staff Available
              </div>

              <p style={{ fontSize: '0.78125rem', color: '#cbd5e1', lineHeight: 1.45, margin: '0 0 14px' }}>
                If you prefer speaking with a human receptionist for complex admissions, billing inquiries, or bed reservations:
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <a
                  href="tel:+92418542214"
                  style={{
                    display: 'block',
                    background: '#ffffff',
                    color: '#0f172a',
                    fontWeight: 700,
                    fontSize: '0.8125rem',
                    textAlign: 'center',
                    padding: '9px 12px',
                    borderRadius: '6px',
                    textDecoration: 'none',
                    transition: 'all 0.12s ease'
                  }}
                >
                  Call Counter: +92 41 8542214
                </a>
                <a
                  href="https://wa.me/923001234567"
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'block',
                    background: '#055138',
                    border: '1px solid #06694a',
                    color: '#ffffff',
                    fontWeight: 600,
                    fontSize: '0.8125rem',
                    textAlign: 'center',
                    padding: '9px 12px',
                    borderRadius: '6px',
                    textDecoration: 'none',
                    transition: 'all 0.12s ease'
                  }}
                >
                  💬 WhatsApp Triage Desk
                </a>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* 6. HOSPITAL LIVE STATUS TICKER BAR */}
      <section style={{ maxWidth: '1240px', margin: '16px auto 0', padding: '0 24px' }}>
        <div style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          padding: '10px 18px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px',
          fontSize: '0.78125rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ color: '#dc2626', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#dc2626', display: 'inline-block' }} />
              CASUALTY WING: OPEN
            </span>
            <span style={{ color: '#cbd5e1' }}>|</span>
            <span style={{ color: '#475569' }}>
              Bed Availability: <strong>ICU (3 Vacant)</strong> • <strong>General Ward (18 Vacant)</strong> • Dialysis Units Active
            </span>
          </div>
          <div style={{ color: '#1d4ed8', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <ShieldCheck size={14} strokeWidth={2.2} /> Punjab Healthcare Commission Regulated
          </div>
        </div>
      </section>

      {/* 7. COMPREHENSIVE 4-COLUMN FOOTER */}
      <footer style={{
        background: '#ffffff',
        borderTop: '1px solid #e2e8f0',
        padding: '48px 24px 20px',
        marginTop: '36px',
        fontSize: '0.8125rem',
        color: '#475569'
      }}>
        <div style={{
          maxWidth: '1240px',
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '28px',
          marginBottom: '32px'
        }}>
          {/* Brand Column */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <div style={{
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                background: '#0f172a',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700
              }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </div>
              <div style={{ fontWeight: 800, fontSize: '1rem', color: '#0f172a' }}>FAISAL HOSPITAL</div>
            </div>
            <p style={{ margin: 0, lineHeight: 1.5, color: '#64748b', fontSize: '0.78125rem' }}>
              Advanced multi-specialty clinical infrastructure offering premier tertiary healthcare, 24/7 trauma response, and intelligent OPD consultation management in Faisalabad.
            </p>
          </div>

          {/* Clinical Services */}
          <div>
            <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '10px', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.04em' }}>
              Clinical Services
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <li>Trauma & Casualty Center (24/7)</li>
              <li>Outpatient Department (OPD Roster)</li>
              <li>Molecular Pathology & Imaging</li>
              <li>Cardiology & Nephrology Suites</li>
              <li>Tele-Triage & Digital Desk</li>
            </ul>
          </div>

          {/* Patient & Visitor */}
          <div>
            <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '10px', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.04em' }}>
              Patient & Visitor
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <li>AI Receptionist Guide</li>
              <li>OPD Timing: 08:00 AM - 10:00 PM</li>
              <li>Visiting Hours: 04:00 PM - 07:00 PM</li>
              <li>Wheelchair & Porter Booking</li>
              <li><Link to="/privacy" style={{ color: '#475569', textDecoration: 'none' }}>Privacy & PHI Protection</Link></li>
            </ul>
          </div>

          {/* Emergency Contacts */}
          <div>
            <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '10px', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.04em' }}>
              Emergency Contacts
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', lineHeight: 1.4 }}>
              <div><strong style={{ color: '#dc2626' }}>Emergency:</strong> 111-119-119 / (041) 920-1431</div>
              <div><strong>Ambulance Dispatch:</strong> (041) 920-1432</div>
              <div><strong>Reception Landline:</strong> +92 41 8542214</div>
              <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: 4 }}>
                Address: East Canal Road & Mall Road Junction, People's Colony No. 1, Faisalabad
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Sub-footer */}
        <div style={{
          borderTop: '1px solid #f1f5f9',
          paddingTop: '16px',
          maxWidth: '1240px',
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          fontSize: '0.75rem',
          color: '#64748b'
        }}>
          <div>
            © {new Date().getFullYear()} Faisal Hospital & Medical Research Institute. All rights reserved.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#16a34a', fontWeight: 600 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a' }} />
              Live Clinical Dispatch Active
            </span>
            <span>•</span>
            <span>ISO 9001:2015 Certified</span>
            <span>•</span>
            <Link to="/terms" style={{ color: '#64748b', textDecoration: 'none' }}>Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
