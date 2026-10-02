import { Link } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';

export default function TermsOfService() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #f8fafc)', color: 'var(--ink, #0f172a)' }}>
      {/* Top Header */}
      <header style={{ background: '#ffffff', borderBottom: '1px solid #e2e8f0', padding: '16px 24px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              background: '#1d4ed8',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 6v12M6 12h12" />
              </svg>
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: '#0f172a' }}>Faisal Hospital</div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Patient Rights & OPD Consultation Terms</div>
            </div>
          </div>
          <Link
            to="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.8125rem',
              color: '#1d4ed8',
              fontWeight: 500,
              textDecoration: 'none',
            }}
          >
            <ArrowLeft size={14} /> Back to Patient Portal
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '36px 24px' }}>
        <div className="card" style={{ padding: '32px 36px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', color: '#1d4ed8' }}>
            <FileText size={20} strokeWidth={2} />
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Hospital Regulations</span>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#0f172a', marginBottom: '12px' }}>
            Terms of Patient Care & OPD Consultation
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '24px' }}>
            Effective: October 2026 • Faisal Hospital Pvt Ltd, Faisalabad, Pakistan
          </p>

          <section style={{ display: 'flex', flexDirection: 'column', gap: '20px', lineHeight: 1.6, fontSize: '0.9375rem', color: '#334155' }}>
            <div>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#0f172a', marginBottom: '6px' }}>1. Scope of the Reception Service</h2>
              <p>
                The Faisal Hospital AI Receptionist is an automated administrative interface provided to assist patients, families, and attendants with:
              </p>
              <ul style={{ paddingLeft: '20px', marginTop: '6px' }}>
                <li>Reviewing consultant schedules, room assignments, and clinical department locations.</li>
                <li>Verifying standard consultation fees in Pakistani Rupees (PKR).</li>
                <li>Reserving confirmed 15-minute OPD consultation time slots.</li>
              </ul>
            </div>

            <div>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#0f172a', marginBottom: '6px' }}>2. Consultation Appointments & Arrival Protocol</h2>
              <p>
                Patients booking appointments via this platform agree to arrive at the specified building (Main Building 544-A or New Building 545-A) at least <strong>15 minutes prior</strong> to the scheduled time slot for token verification and vital checks at the triage desk.
              </p>
            </div>

            <div>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#0f172a', marginBottom: '6px' }}>3. Cancellation & Rescheduling Policy</h2>
              <p>
                If you cannot attend your scheduled appointment, please notify the hospital operator or reschedule via the portal at least 2 hours in advance to release the slot for awaiting patients.
              </p>
            </div>

            <div>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#0f172a', marginBottom: '6px' }}>4. Emergency Services</h2>
              <p>
                Emergency and trauma admissions do not require an advance booking. Our 24/7 Casualty department operates on an immediate clinical triage basis. Call <strong>111-119-119</strong> for ambulance dispatch or immediate emergency notification.
              </p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
