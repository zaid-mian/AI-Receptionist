import { useState } from 'react';
import { BrowserRouter, Outlet, Route, Routes, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import { ToastProvider } from './components/Toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import RequireAuth from './components/RequireAuth';
import RequireRole from './components/RequireRole';
import { PageMetaProvider, type PageMeta } from './layout/PageMeta';
import PatientPortal from './pages/PatientPortal';
import Login from './pages/Login';
import Overview from './pages/Overview';
import Receptionist from './pages/Receptionist';
import Voice from './pages/Voice';
import Appointments from './pages/Appointments';
import DoctorsManager from './pages/DoctorsManager';
import Conversations from './pages/Conversations';
import ConversationDetail from './pages/ConversationDetail';
import Knowledge from './pages/Knowledge';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import OperatorDesk from './pages/OperatorDesk';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';
import { ErrorBoundary } from './components/ErrorBoundary';

function AdminHome() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user?.role === 'staff') {
    return <Navigate to="/admin/operator" replace />;
  }
  return <Overview />;
}

function AdminShell() {
  const [meta, setMeta] = useState<PageMeta>({ title: 'Overview' });
  const [navOpen, setNavOpen] = useState(false);

  return (
    <PageMetaProvider value={setMeta}>
      <div className="app">
        <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
        <div className="main">
          <Topbar
            title={meta.title}
            onMenu={() => setNavOpen(true)}
            showDemoBadge={meta.demoBadge}
            showNewConversation={meta.newConversation}
          />
          <main className="content">
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </PageMetaProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            {/* Public Patient-Facing Routes */}
            <Route path="/" element={<PatientPortal />} />
            <Route path="/voice" element={<Voice />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="/admin/login" element={<Login />} />

            {/* Protected Hospital Administrative Backoffice */}
            <Route path="/admin" element={<RequireAuth />}>
              <Route element={<AdminShell />}>
                {/* Dynamic index: Overview for admin, Operator Desk for staff */}
                <Route index element={<AdminHome />} />

                {/* Shared Operations (Admin & Staff) */}
                <Route path="operator" element={<OperatorDesk />} />
                <Route path="appointments" element={<Appointments />} />
                <Route path="doctors" element={<DoctorsManager />} />
                <Route path="conversations" element={<Conversations />} />
                <Route path="conversations/:id" element={<ConversationDetail />} />

                {/* Restricted to Admin: Management, Governance, System & QA Sandbox */}
                <Route element={<RequireRole allowedRoles={['admin']} fallbackPath="/admin/operator" />}>
                  <Route path="analytics" element={<Analytics />} />
                  <Route path="knowledge" element={<Knowledge />} />
                  <Route path="settings" element={<Settings />} />
                  {/* Developer / QA Sandbox */}
                  <Route path="receptionist" element={<Receptionist />} />
                  <Route path="voice" element={<Voice />} />
                </Route>
              </Route>
            </Route>

            {/* Legacy redirect support */}
            <Route path="/overview" element={<Navigate to="/admin" replace />} />
            <Route path="/receptionist" element={<Navigate to="/admin/receptionist" replace />} />
            <Route path="/appointments" element={<Navigate to="/admin/appointments" replace />} />
            <Route path="/conversations" element={<Navigate to="/admin/conversations" replace />} />
            <Route path="/knowledge" element={<Navigate to="/admin/knowledge" replace />} />
            <Route path="/analytics" element={<Navigate to="/admin/analytics" replace />} />
            <Route path="/settings" element={<Navigate to="/admin/settings" replace />} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
