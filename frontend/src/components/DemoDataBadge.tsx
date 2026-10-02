import { Info } from 'lucide-react';

/** Small pill marking a number/widget as sample data. */
export default function DemoDataBadge({ label = 'Demo data' }: { label?: string }) {
  return (
    <span className="demo-badge" title="Sample data for demonstration: not real business metrics" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <Info size={11} strokeWidth={2} />
      <span>{label}</span>
    </span>
  );
}
