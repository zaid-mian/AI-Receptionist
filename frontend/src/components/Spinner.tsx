export default function Spinner({
  size = 'md',
  label,
}: {
  size?: 'sm' | 'md';
  label?: string;
}) {
  return (
    <span
      role="status"
      aria-live="polite"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
    >
      <span className={`spinner${size === 'sm' ? ' sm' : ''}`} aria-hidden="true" />
      {label && <span className="card-sub">{label}</span>}
    </span>
  );
}
