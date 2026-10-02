import { useNavigate } from 'react-router-dom';
import { Menu, MessageSquarePlus } from 'lucide-react';
import DemoDataBadge from './DemoDataBadge';

export default function Topbar({
  title,
  onMenu,
  showDemoBadge,
  showNewConversation,
}: {
  title: string;
  onMenu: () => void;
  showDemoBadge?: boolean;
  showNewConversation?: boolean;
}) {
  const navigate = useNavigate();

  return (
    <header className="topbar">
      <button className="hamburger" onClick={onMenu} aria-label="Open navigation menu">
        <Menu size={18} strokeWidth={2} />
      </button>
      <div className="topbar-title">{title}</div>
      {showDemoBadge && <DemoDataBadge />}
      <div className="topbar-spacer" />
      {showNewConversation && (
        <button
          className="btn btn-primary btn-sm"
          onClick={() => navigate('/admin/receptionist', { state: { newAt: Date.now() } })}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <MessageSquarePlus size={14} strokeWidth={2} />
          <span>New Conversation</span>
        </button>
      )}
    </header>
  );
}
