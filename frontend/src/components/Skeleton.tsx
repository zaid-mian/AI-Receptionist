export function Skeleton({
  width,
  height,
  borderRadius = 'var(--radius-sm)',
  className = '',
  style = {},
}: {
  width?: string | number;
  height?: string | number;
  borderRadius?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{
        width: width ?? '100%',
        height: height ?? '16px',
        borderRadius,
        ...style,
      }}
      aria-hidden="true"
    />
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="table-wrap" aria-busy="true" aria-label="Loading data">
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', background: '#fafbfc' }}>
        <Skeleton width="160px" height="14px" />
      </div>
      <div style={{ padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '16px', alignItems: 'center' }}>
            {Array.from({ length: cols }).map((__, c) => (
              <Skeleton key={c} height="13px" width={c === 0 ? '70%' : c === cols - 1 ? '40%' : '85%'} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }} aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Skeleton width="55%" height="16px" />
            <Skeleton width="25%" height="18px" borderRadius="4px" />
          </div>
          <Skeleton width="40%" height="12px" />
          <Skeleton width="85%" height="12px" />
          <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: '10px' }}>
            <Skeleton width="100%" height="28px" borderRadius="4px" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonMetrics({ count = 4 }: { count?: number }) {
  return (
    <div className="metric-grid" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="metric-card" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px' }}>
          <Skeleton width="45%" height="12px" />
          <Skeleton width="60%" height="28px" />
          <Skeleton width="70%" height="11px" />
        </div>
      ))}
    </div>
  );
}

