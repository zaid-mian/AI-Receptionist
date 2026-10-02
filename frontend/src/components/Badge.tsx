type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'neutral';

export default function Badge({
  variant = 'neutral',
  children,
}: {
  variant?: BadgeVariant;
  children: React.ReactNode;
}) {
  return <span className={`badge badge-${variant}`}>{children}</span>;
}
