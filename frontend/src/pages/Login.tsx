import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { KeyRound, UserCheck, ArrowLeft, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/admin';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please provide your staff email and password.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await login(email.trim(), password);
      toast('success', 'Authenticated - Access granted to hospital backoffice');
      navigate(from, { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid credentials. Please verify and try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const fillDemoAdmin = () => {
    setEmail('admin@faisalhospital.pk');
    setPassword('Admin@Faisal2026');
    setError(null);
  };

  const fillDemoStaff = () => {
    setEmail('reception@faisalhospital.pk');
    setPassword('Staff@Faisal2026');
    setError(null);
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      background: '#f1f5f9',
      padding: '24px',
      color: '#0f172a',
      fontFamily: 'var(--font-sans)',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '400px',
        background: '#ffffff',
        border: '1px solid #cbd5e1',
        borderRadius: 'var(--radius-md)',
        padding: '32px',
        boxShadow: 'var(--shadow-xs)',
      }}>
        {/* Logo & Clinical Header */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '40px',
            height: '40px',
            borderRadius: 'var(--radius-sm)',
            background: '#1d4ed8',
            color: '#fff',
            marginBottom: '12px',
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 6v12M6 12h12" />
            </svg>
          </div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 4px 0', color: '#0f172a', letterSpacing: '-0.01em' }}>
            Faisal Hospital Backoffice
          </h1>
          <p style={{ margin: 0, fontSize: '0.8125rem', color: '#64748b' }}>
            Staff & Administrative Access Portal
          </p>
        </div>

        {error && (
          <div style={{
            padding: '10px 14px',
            borderRadius: 'var(--radius-sm)',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#b91c1c',
            fontSize: '0.8125rem',
            marginBottom: '18px',
            lineHeight: 1.4,
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              Staff Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. admin@faisalhospital.pk"
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                color: '#0f172a',
                fontSize: '0.875rem',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                color: '#0f172a',
                fontSize: '0.875rem',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '10px 16px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: '#1d4ed8',
              color: '#fff',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              marginTop: '4px',
              transition: 'background var(--transition)',
            }}
          >
            {loading ? 'Authenticating...' : 'Sign In to Backoffice'}
          </button>
        </form>

        <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textAlign: 'center' }}>
            Quick fill test credentials:
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button
              type="button"
              onClick={fillDemoAdmin}
              style={{
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                color: '#1d4ed8',
                borderRadius: 'var(--radius-sm)',
                padding: '7px 10px',
                fontSize: '0.75rem',
                cursor: 'pointer',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <KeyRound size={13} strokeWidth={2} /> Admin Demo
            </button>
            <button
              type="button"
              onClick={fillDemoStaff}
              style={{
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                color: '#047857',
                borderRadius: 'var(--radius-sm)',
                padding: '7px 10px',
                fontSize: '0.75rem',
                cursor: 'pointer',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <UserCheck size={13} strokeWidth={2} /> Staff Demo
            </button>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.6875rem',
            color: '#64748b',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            padding: '8px 10px',
            borderRadius: 'var(--radius-sm)',
            marginTop: '4px',
            lineHeight: 1.3,
          }}>
            <ShieldCheck size={14} color="#059669" style={{ flexShrink: 0 }} />
            <span>Authorized personnel only. Sessions are encrypted and audited.</span>
          </div>

          <Link
            to="/"
            style={{
              textAlign: 'center',
              color: '#64748b',
              fontSize: '0.8125rem',
              textDecoration: 'none',
              padding: '6px 0',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <ArrowLeft size={13} strokeWidth={2} /> Back to Patient Portal
          </Link>
        </div>
      </div>
    </div>
  );
}
