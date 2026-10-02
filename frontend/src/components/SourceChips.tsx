import type { ChatSource } from '../api/types';

/** Safe, high-level source attribution — never exposes prompts or reasoning. */
export default function SourceChips({ sources }: { sources: ChatSource[] }) {
  if (sources.length === 0) return null;
  return (
    <div className="source-chips">
      <span className="source-chips-label">Knowledge sources used:</span>
      {sources.map((s) => (
        <span key={`${s.doc_id}-${s.section ?? s.title}`} className="source-chip" title={s.section}>
          {s.title}
          {s.section ? ` · ${s.section}` : ''}
        </span>
      ))}
    </div>
  );
}
