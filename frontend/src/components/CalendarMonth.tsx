import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface CalendarMonthProps {
  /** "YYYY-MM" */
  month: string;
  /** date "YYYY-MM-DD" -> appointment count */
  counts: Record<string, number>;
  selected?: string;
  onSelect: (date: string) => void;
  onMonthChange: (month: string) => void;
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export default function CalendarMonth({ month, counts, selected, onSelect, onMonthChange }: CalendarMonthProps) {
  const [y, m] = month.split('-').map(Number);

  const cells = useMemo(() => {
    const first = new Date(y, m - 1, 1);
    const startDow = first.getDay();
    const daysInMonth = new Date(y, m, 0).getDate();
    const daysInPrev = new Date(y, m - 1, 0).getDate();
    const out: { date: string; day: number; inMonth: boolean }[] = [];
    for (let i = startDow - 1; i >= 0; i--) {
      const d = daysInPrev - i;
      const pm = m === 1 ? 12 : m - 1;
      const py = m === 1 ? y - 1 : y;
      out.push({ date: `${py}-${pad(pm)}-${pad(d)}`, day: d, inMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      out.push({ date: `${y}-${pad(m)}-${pad(d)}`, day: d, inMonth: true });
    }
    while (out.length % 7 !== 0 || out.length < 35) {
      const last = out[out.length - 1];
      const [ly, lm, ld] = last.date.split('-').map(Number);
      const next = new Date(ly, lm - 1, ld + 1);
      out.push({
        date: `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`,
        day: next.getDate(),
        inMonth: false,
      });
      if (out.length >= 42) break;
    }
    return out;
  }, [y, m]);

  const todayStr = useMemo(() => {
    const t = new Date();
    return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
  }, []);

  const monthLabel = new Date(y, m - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const shift = (delta: number) => {
    const d = new Date(y, m - 1 + delta, 1);
    onMonthChange(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  };

  return (
    <div>
      <div className="panel-head">
        <h2>{monthLabel}</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm btn-secondary" onClick={() => shift(-1)} aria-label="Previous month" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, padding: 0 }}>
            <ChevronLeft size={14} strokeWidth={2} />
          </button>
          <button className="btn btn-sm btn-secondary" onClick={() => shift(1)} aria-label="Next month" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, padding: 0 }}>
            <ChevronRight size={14} strokeWidth={2} />
          </button>
        </div>
      </div>
      <div className="cal-grid" role="grid" aria-label={monthLabel}>
        {DOW.map((d) => (
          <div key={d} className="cal-dow">
            {d}
          </div>
        ))}
        {cells.map((c) => (
          <button
            key={c.date}
            role="gridcell"
            aria-selected={selected === c.date}
            className={`cal-day${c.inMonth ? '' : ' other-month'}${c.date === todayStr ? ' today' : ''}${
              selected === c.date ? ' selected' : ''
            }`}
            disabled={!c.inMonth}
            onClick={() => onSelect(c.date)}
          >
            <span className="cal-num">{c.day}</span>
            {(counts[c.date] ?? 0) > 0 && <span className="cal-count tnum">{counts[c.date]}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
