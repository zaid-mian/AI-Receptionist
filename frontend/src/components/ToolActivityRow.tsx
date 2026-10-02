import { Check } from 'lucide-react';

export default function ToolActivityRow({
  label,
  phase,
  summary,
}: {
  label: string;
  phase: 'started' | 'done';
  summary?: string;
}) {
  return (
    <div className="tool-activity" aria-live="polite">
      {phase === 'done' ? (
        <span className="check" aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center' }}>
          <Check size={12} strokeWidth={2.5} />
        </span>
      ) : (
        <span className="tool-spinner" aria-hidden="true" />
      )}
      <span>{phase === 'done' ? label : `${label}…`}</span>
      {phase === 'done' && summary && <span className="tool-summary">· {summary}</span>}
    </div>
  );
}
