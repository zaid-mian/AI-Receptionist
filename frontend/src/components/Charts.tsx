// Hand-rolled SVG charts — no chart library dependency.

const FONT = '11px Inter, sans-serif';

function niceMax(v: number): number {
  if (v <= 0) return 5;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  if (n <= 1) return pow;
  if (n <= 2) return 2 * pow;
  if (n <= 2.5) return 2.5 * pow;
  if (n <= 5) return 5 * pow;
  return 10 * pow;
}

export interface BarDatum {
  label: string;
  value: number;
}

export function BarChart({
  data,
  height = 240,
  color = '#4f46e5',
}: {
  data: BarDatum[];
  height?: number;
  color?: string;
}) {
  const W = 600;
  const H = height;
  const padL = 36;
  const padB = 34;
  const padT = 12;
  const max = niceMax(Math.max(...data.map((d) => d.value), 0));
  const plotW = W - padL - 16;
  const plotH = H - padT - padB;
  const bw = Math.min(54, (plotW / Math.max(data.length, 1)) * 0.55);
  const step = plotW / Math.max(data.length, 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Bar chart">
      {[0, 0.5, 1].map((f) => {
        const y = padT + plotH * (1 - f);
        return (
          <g key={f}>
            <line x1={padL} y1={y} x2={W - 16} y2={y} stroke="#e4e7ec" strokeWidth={1} />
            <text x={padL - 8} y={y + 4} textAnchor="end" fontSize={FONT} fill="#98a2b3">
              {Math.round(max * f)}
            </text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const bh = max === 0 ? 0 : (d.value / max) * plotH;
        const x = padL + step * i + (step - bw) / 2;
        const y = padT + plotH - bh;
        return (
          <g key={d.label}>
            <rect x={x} y={y} width={bw} height={bh} rx={4} fill={color} opacity={0.88}>
              <title>
                {d.label}: {d.value}
              </title>
            </rect>
            <text
              x={x + bw / 2}
              y={y - 6}
              textAnchor="middle"
              fontSize={FONT}
              fill="#344054"
              fontWeight={600}
            >
              {d.value}
            </text>
            <text
              x={x + bw / 2}
              y={H - 12}
              textAnchor="middle"
              fontSize={FONT}
              fill="#667085"
            >
              {d.label.length > 14 ? `${d.label.slice(0, 13)}…` : d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export interface LineSeries {
  name: string;
  color: string;
  values: number[];
}

export function LineChart({
  series,
  labels,
  height = 240,
}: {
  series: LineSeries[];
  labels: string[];
  height?: number;
}) {
  const W = 600;
  const H = height;
  const padL = 36;
  const padB = 30;
  const padT = 14;
  const all = series.flatMap((s) => s.values);
  const max = niceMax(Math.max(...all, 0));
  const plotW = W - padL - 16;
  const plotH = H - padT - padB;
  const n = Math.max(labels.length, 2);
  const x = (i: number) => padL + (plotW * i) / (n - 1);
  const y = (v: number) => padT + plotH * (1 - (max === 0 ? 0 : v / max));

  const tickIdx = labels.map((_, i) => i).filter((i) => i % Math.ceil(n / 7) === 0);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Line chart">
        {[0, 0.5, 1].map((f) => {
          const yy = padT + plotH * (1 - f);
          return (
            <g key={f}>
              <line x1={padL} y1={yy} x2={W - 16} y2={yy} stroke="#e4e7ec" strokeWidth={1} />
              <text x={padL - 8} y={yy + 4} textAnchor="end" fontSize={FONT} fill="#98a2b3">
                {Math.round(max * f)}
              </text>
            </g>
          );
        })}
        {series.map((s) => (
          <polyline
            key={s.name}
            points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
            fill="none"
            stroke={s.color}
            strokeWidth={2.2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {series.map((s) =>
          s.values.map((v, i) => (
            <circle key={`${s.name}-${i}`} cx={x(i)} cy={y(v)} r={3} fill={s.color}>
              <title>
                {s.name}: {labels[i]} ({v})
              </title>
            </circle>
          )),
        )}
        {tickIdx.map((i) => (
          <text
            key={i}
            x={x(i)}
            y={H - 10}
            textAnchor="middle"
            fontSize={FONT}
            fill="#667085"
          >
            {labels[i].slice(5)}
          </text>
        ))}
      </svg>
      <div className="chart-legend">
        {series.map((s) => (
          <span key={s.name}>
            <span className="swatch" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

export function DonutChart({
  segments,
  height = 220,
}: {
  segments: DonutSegment[];
  height?: number;
}) {
  const size = height;
  const r = size / 2 - 22;
  const c = 2 * Math.PI * r;
  const total = segments.reduce((a, s) => a + s.value, 0);

  let acc = 0;
  const arcs = segments.map((s) => {
    const frac = total === 0 ? 0 : s.value / total;
    const seg = { ...s, offset: acc, frac };
    acc += frac;
    return seg;
  });

  return (
    <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Donut chart">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef0f4" strokeWidth={26} />
        {arcs.map((s) => (
          <circle
            key={s.label}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={26}
            strokeDasharray={`${Math.max(s.frac * c - 2, 0)} ${c}`}
            strokeDashoffset={-s.offset * c + c / 4}
            strokeLinecap="butt"
          >
            <title>
              {s.label}: {s.value}
            </title>
          </circle>
        ))}
        <text
          x={size / 2}
          y={size / 2 - 4}
          textAnchor="middle"
          fontSize="24"
          fontWeight={700}
          fill="#101828"
        >
          {total}
        </text>
        <text x={size / 2} y={size / 2 + 18} textAnchor="middle" fontSize={FONT} fill="#667085">
          total
        </text>
      </svg>
      <div className="chart-legend" style={{ flexDirection: 'column', gap: 8, marginTop: 0 }}>
        {segments.map((s) => (
          <span key={s.label}>
            <span className="swatch" style={{ background: s.color }} />
            {s.label}: <strong className="tnum">{s.value}</strong>
            {total > 0 && (
              <span style={{ color: '#98a2b3' }}> ({Math.round((s.value / total) * 100)}%)</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
