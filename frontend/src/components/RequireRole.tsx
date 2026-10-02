import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import { useEffect, useRef } from 'react';

interface RequireRoleProps {
  allowedRoles: Array<'admin' | 'staff'>;
  fallbackPath?: string;
  message?: string;
}

/**
 * Route Guard: Ensures the authenticated user possesses an allowed role.
 * If unauthorized, immediately redirects to fallbackPath and triggers a warning toast.
 */
export default function RequireRole({
  allowedRoles,
  fallbackPath = '/admin/operator',
  message = 'Access restricted to Hospital Administrators.'
}: RequireRoleProps) {
  const { user, loading } = useAuth();
  const toast = useToast();
  const notified = useRef(false);

  useEffect(() => {
    if (!loading && user && !allowedRoles.includes(user.role) && !notified.current) {
      notified.current = true;
      toast('error', message);
    }
  }, [loading, user, allowedRoles, message, toast]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-subtle, #f8fafc)' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="status-dot green" style={{ width: 14, height: 14, margin: '0 auto 12px' }} />
          <p style={{ color: 'var(--text-muted, #64748b)', fontSize: '0.875rem' }}>Verifying role authorization…</p>
        </div>
      </div>
    );
  }

  if (!user || !allowedRoles.includes(user.role)) {
    return <Navigate to={fallbackPath} replace />;
  }

  return <Outlet />;
}
