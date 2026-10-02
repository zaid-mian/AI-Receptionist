import { Navigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-subtle, #f8fafc)' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="status-dot green" style={{ width: 14, height: 14, margin: '0 auto 12px' }} />
          <p style={{ color: 'var(--text-muted, #64748b)', fontSize: '0.875rem' }}>Verifying staff credentials…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/admin/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
