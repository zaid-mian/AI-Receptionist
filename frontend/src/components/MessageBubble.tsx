import { AlertTriangle } from 'lucide-react';
import type { ChatAppointment, ChatOutcome, ChatSource } from '../api/types';
import ToolActivityRow from './ToolActivityRow';
import SourceChips from './SourceChips';
import AppointmentCard from './AppointmentCard';

export interface ToolEntry {
  tool: string;
  label: string;
  phase: 'started' | 'done';
  summary?: string;
}

export interface ChatMessageItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  pending?: boolean;
  tools?: ToolEntry[];
  sources?: ChatSource[];
  appointment?: ChatAppointment;
  escalated?: string;
  latencyMs?: number;
  outcome?: ChatOutcome;
}

function AssistantAvatar() {
  return (
    <span className="msg-avatar" aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M2.5 10.5v-2a5.5 5.5 0 0 1 11 0v2"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <rect x="1.5" y="10" width="3" height="4.5" rx="1.4" fill="currentColor" />
        <rect x="11.5" y="10" width="3" height="4.5" rx="1.4" fill="currentColor" />
        <path d="M13 14.5a3 3 0 0 1-3 1.5H8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function UserAvatar() {
  return (
    <span className="msg-avatar" aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="5.2" r="2.7" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M2.8 13.6a5.2 5.2 0 0 1 10.4 0"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

export default function MessageBubble({ message }: { message: ChatMessageItem }) {
  const m = message;
  return (
    <div className={`msg-row ${m.role}`}>
      {m.role === 'assistant' ? <AssistantAvatar /> : <UserAvatar />}
      <div className="msg-body">
        {m.tools?.map((t) => (
          <ToolActivityRow key={t.tool} label={t.label} phase={t.phase} summary={t.summary} />
        ))}
        {m.content && <div className="msg-bubble">{m.content}</div>}
        {m.pending && !m.content && (
          <div className="typing-indicator" aria-label="Assistant is typing">
            <span />
            <span />
            <span />
          </div>
        )}
        {m.sources && m.sources.length > 0 && <SourceChips sources={m.sources} />}
        {m.appointment && <AppointmentCard event={m.appointment} />}
        {m.escalated && (
          <div className="escalation-banner" role="alert">
            <AlertTriangle size={15} strokeWidth={2} />
            <span>
              <strong>Handed to a human.</strong> {m.escalated}
            </span>
          </div>
        )}
        {m.latencyMs !== undefined && m.latencyMs > 0 && (
          <div className="msg-meta tnum">
            {(m.latencyMs / 1000).toFixed(1)}s response
          </div>
        )}
      </div>
    </div>
  );
}
