import { useEffect, useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  BarChart3,
  Headphones,
  Calendar,
  MessageSquare,
  Stethoscope,
  BookOpen,
  Settings,
  FlaskConical,
  Mic,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  LogOut,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../api/client';
import type { EngineStatus, SystemStatus } from '../api/types';
import { useAuth } from '../context/AuthContext';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
  badgeType?: 'live' | 'manage' | 'roster' | 'sandbox' | 'default';
  end?: boolean;
}

interface NavSection {
  title: string;
  isSandbox?: boolean;
  items: NavItem[];
}

function dotFor(status: EngineStatus): string {
  if (status === 'operational') return 'green';
  if (status === 'degraded') return 'amber';
  if (status === 'not-configured' || status === 'demo-mock') return 'gray';
  return 'red';
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('') || 'FH';
}

export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, logout } = useAuth();
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const s = await api.get<SystemStatus>('/system/status');
        if (alive) setStatus(s);
      } catch {
        // Sidebar status is non-critical
      }
    };
    void load();
    const t = window.setInterval(load, 30000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);

  const degraded = status?.components.some((c) => c.status === 'degraded');
  const dot = !status ? 'red' : degraded ? 'amber' : 'green';

  // Role-Based Navigation Sections (Enterprise SaaS hierarchy)
  const sections: NavSection[] = user?.role === 'staff'
    ? [
        {
          title: 'Front Desk Operations',
          items: [
            { to: '/admin/operator', label: 'Operator Desk', icon: Headphones, badge: 'Live', badgeType: 'live' },
            { to: '/admin/appointments', label: 'Appointments', icon: Calendar },
            { to: '/admin/conversations', label: 'Conversations', icon: MessageSquare },
            { to: '/admin/doctors', label: 'Doctor Roster', icon: Stethoscope, badge: 'Read-Only', badgeType: 'roster' },
          ],
        },
      ]
    : [
        {
          title: 'Hospital Management',
          items: [
            { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
            { to: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
          ],
        },
        {
          title: 'Front Desk Operations',
          items: [
            { to: '/admin/operator', label: 'Operator Desk', icon: Headphones, badge: 'Live', badgeType: 'live' },
            { to: '/admin/appointments', label: 'Appointments', icon: Calendar },
            { to: '/admin/conversations', label: 'Conversations', icon: MessageSquare },
          ],
        },
        {
          title: 'Clinical Governance',
          items: [
            { to: '/admin/doctors', label: 'Doctor OPD Shifts', icon: Stethoscope, badge: 'Manage', badgeType: 'manage' },
            { to: '/admin/knowledge', label: 'Knowledge Base', icon: BookOpen },
          ],
        },
        {
          title: 'System Administration',
          items: [
            { to: '/admin/settings', label: 'Settings', icon: Settings },
          ],
        },
        {
          title: 'Developer / QA Sandbox',
          isSandbox: true,
          items: [
            { to: '/admin/receptionist', label: 'Test Receptionist', icon: FlaskConical, badge: 'QA Tool', badgeType: 'sandbox' },
            { to: '/admin/voice', label: 'Voice Demo', icon: Mic, badge: 'Voice QA', badgeType: 'sandbox' },
          ],
        },
      ];

  return (
    <>
      {open && <button className="sidebar-backdrop" onClick={onClose} aria-label="Close menu" />}
      <aside className={`sidebar${open ? ' open' : ''}`} aria-label="Main navigation">
        {/* Brand Header */}
        <div className="sidebar-logo" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 'var(--radius-sm)',
                background: '#1d4ed8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                flexShrink: 0,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 4v16m-8-8h16" />
              </svg>
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#f8fafc', lineHeight: 1.15 }}>
                Faisal Hospital
              </div>
              <div style={{ fontSize: '0.6875rem', color: '#64748b', fontWeight: 500 }}>
                Administration Suite
              </div>
            </div>
          </div>
          <Link
            to="/"
            style={{
              fontSize: '0.75rem',
              color: '#93c5fd',
              textDecoration: 'none',
              background: 'rgba(255, 255, 255, 0.05)',
              padding: '4px 9px',
              borderRadius: '6px',
              fontWeight: 500,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              marginTop: '4px',
              transition: 'all 120ms ease',
            }}
          >
            <ArrowLeft size={12} strokeWidth={2} />
            <span>View Patient Portal</span>
          </Link>
        </div>

        {/* Navigation Sections */}
        <nav className="sidebar-nav">
          {sections.map((section, sIdx) => (
            <div key={sIdx} className={section.isSandbox ? 'sidebar-sandbox-box' : undefined}>
              <div className="sidebar-section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>{section.title}</span>
                {section.isSandbox && <span className="sidebar-sandbox-badge">Dev / QA</span>}
              </div>

              {section.items.map((item) => {
                const IconComponent = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) => `sidebar-nav-item${isActive ? ' active' : ''}`}
                    onClick={onClose}
                  >
                    <IconComponent size={16} strokeWidth={2} className="sidebar-nav-icon" />
                    <span style={{ flex: 1 }}>{item.label}</span>
                    {item.badge && (
                      <span
                        className="sidebar-role-pill"
                        style={{
                          background:
                            item.badgeType === 'live'
                              ? 'rgba(239, 68, 68, 0.15)'
                              : item.badgeType === 'manage'
                              ? 'rgba(59, 130, 246, 0.15)'
                              : item.badgeType === 'roster'
                              ? 'rgba(16, 185, 129, 0.15)'
                              : item.badgeType === 'sandbox'
                              ? 'rgba(245, 158, 11, 0.15)'
                              : 'rgba(255, 255, 255, 0.08)',
                          color:
                            item.badgeType === 'live'
                              ? '#fca5a5'
                              : item.badgeType === 'manage'
                              ? '#93c5fd'
                              : item.badgeType === 'roster'
                              ? '#6ee7b7'
                              : item.badgeType === 'sandbox'
                              ? '#fcd34d'
                              : '#cbd5e1',
                          border: `1px solid ${
                            item.badgeType === 'live'
                              ? 'rgba(239, 68, 68, 0.3)'
                              : item.badgeType === 'manage'
                              ? 'rgba(59, 130, 246, 0.3)'
                              : item.badgeType === 'roster'
                              ? 'rgba(16, 185, 129, 0.3)'
                              : item.badgeType === 'sandbox'
                              ? 'rgba(245, 158, 11, 0.3)'
                              : 'rgba(255, 255, 255, 0.12)'
                          }`,
                        }}
                      >
                        {item.badge}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        {/* User Card (Linear / Cal.com minimal footer) */}
        {user && (
          <div
            style={{
              margin: '10px 12px',
              padding: '10px 12px',
              borderRadius: '10px',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0, flex: 1 }}>
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  background: user.role === 'admin' ? '#2563eb' : '#059669',
                  color: '#ffffff',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {getInitials(user.name)}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    color: '#f8fafc',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    lineHeight: 1.2,
                  }}
                >
                  {user.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px' }}>
                  <span
                    style={{
                      fontSize: '0.625rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      padding: '0 4px',
                      borderRadius: '3px',
                      background: user.role === 'admin' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                      color: user.role === 'admin' ? '#93c5fd' : '#6ee7b7',
                    }}
                  >
                    {user.role === 'admin' ? 'Admin' : 'Staff'}
                  </span>
                  <span style={{ fontSize: '0.6875rem', color: '#64748b' }}>
                    {user.role === 'admin' ? 'Full Access' : 'Front Desk'}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={logout}
              title="Sign Out"
              aria-label="Sign Out"
              style={{
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                color: '#fca5a5',
                cursor: 'pointer',
                padding: '6px 8px',
                borderRadius: '6px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                fontSize: '0.75rem',
                fontWeight: 500,
                transition: 'all 120ms ease',
              }}
            >
              <LogOut size={13} strokeWidth={2} />
              <span>Exit</span>
            </button>
          </div>
        )}

        {/* Engine Status Bar */}
        <div className="sidebar-status">
          <button
            className="sidebar-status-head"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
          >
            <span className={`status-dot ${dot}`} aria-hidden="true" />
            <span style={{ flex: 1 }}>{status ? 'AI Engine Active' : 'Connecting…'}</span>
            <span className="chev" aria-hidden="true">
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
          </button>
          {status && (
            <div className="sidebar-status-body">
              <div className="sidebar-engine">Engine: {status.engine}</div>
              {expanded &&
                status.components.map((c) => (
                  <div key={c.name} className="sidebar-status-row" title={c.detail}>
                    <span className={`status-dot ${dotFor(c.status)}`} aria-hidden="true" />
                    <span className="name">{c.name}</span>
                    <span className="pill-mini">{c.status}</span>
                  </div>
                ))}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
