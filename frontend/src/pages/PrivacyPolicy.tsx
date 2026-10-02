import { Link } from 'react-router-dom';
import { ArrowLeft, Shield } from 'lucide-react';

export default function PrivacyPolicy() {
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
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Patient Information & Data Governance</div>
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
            <Shield size={20} strokeWidth={2} />
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Clinical Governance</span>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#0f172a', marginBottom: '12px' }}>
            Patient Privacy & Health Data Policy
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '24px' }}>
            Last updated: October 2026 • Faisal Hospital Pvt Ltd, Faisalabad, Pakistan
          </p>

          <section style={{ display: 'flex', flexDirection: 'column', gap: '20px', lineHeight: 1.6, fontSize: '0.9375rem', color: '#334155' }}>
            <div>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#0f172a', marginBottom: '6px' }}>1. Information We Collect</h2>
              <p>
                When you use the Faisal Hospital AI Receptionist or book an Outpatient Department (OPD) appointment, we collect:
              </p>
              <ul style={{ paddingLeft: '20px', marginTop: '6px' }}>
                <li><strong>Patient Identification:</strong> Full name, contact telephone number, and optional email address.</li>
                <li><strong>Appointment Details:</strong> Selected clinical consultant, department, date, and preferred time slot.</li>
                <li><strong>Inquiry Records:</strong> Text and voice transcripts generated during receptionist interactions for booking verification and quality assurance.</li>
              </ul>
            </div>

            <div>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#0f172a', marginBottom: '6px' }}>2. How Your Information Is Used</h2>
              <p>
                All data collected through this portal is used strictly for clinical and operational purposes:
              </p>
              <ul style={{ paddingLeft: '20px', marginTop: '6px' }}>
                <li>Confirming and managing your consultation booking with hospital consultants.</li>
                <li>Transmitting appointment tokens and schedule notifications.</li>
                <li>Ensuring seamless handover to emergency triage or human receptionists when escalation is required.</li>
                <li>We do not sell, rent, or share patient information with third-party advertisers.</li>
              </ul>
            </div>

            <div>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#0f172a', marginBottom: '6px' }}>3. Data Storage & Hospital System Security</h2>
              <p>
                Patient records are stored in hospital database systems located in Pakistan, compliant with local healthcare confidentiality regulations. Access is restricted to authorized hospital receptionists, OPD desk officers, and medical administrators via role-based access control (RBAC).
              </p>
            </div>

            <div>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#0f172a', marginBottom: '6px' }}>4. Emergency & Medical Disclaimer</h2>
              <p>
                The AI Receptionist is an administrative scheduling and inquiry service. It is not an automated diagnostic system. If you or a family member are experiencing a life-threatening medical emergency, call our Emergency Department hotline immediately at <strong>111-119-119</strong> or visit our 24/7 Casualty at 544-A East Canal Road, Faisalabad.
              </p>
            </div>

            <div>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#0f172a', marginBottom: '6px' }}>5. Hospital Administration Inquiries</h2>
              <p>
                For questions regarding patient records or privacy inquiries, contact the Faisal Hospital Information Desk:
              </p>
              <p style={{ marginTop: '4px', color: '#475569' }}>
                UAN Helpline: 111-119-119 • Landline: +92 41 8542214 • Address: 544-A East Canal Road, near Abdullahpur Flyover, People's Colony No. 1, Faisalabad.
              </p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
