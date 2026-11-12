import type { CSSProperties, ReactNode } from "react";

// The hand-rolled SVG/CSS charts of the old app, as components. No chart library: the shapes are simple and the CSS
// classes (chart-bar-*, fc-*, radar, linechart) already style them.

export interface BarDatum { label: string; value: number; hint?: string; color?: string; display?: ReactNode }

export function Bars({ data, max }: { data: BarDatum[]; max?: number }) {
  if (!data.length) return <p className="empty">No data yet.</p>;
  const top = max || Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="chart-bars">
      {data.map((d) => (
        <div className="chart-bar-row" key={d.label} title={d.hint || String(d.value)}>
          <span className="chart-bar-label">{d.label}</span>
          <span className="chart-bar-track"><span className="chart-bar-fill" style={{ width: `${Math.round((d.value / top) * 100)}%`, background: d.color || "var(--accent)" }} /></span>
          <span className="chart-bar-val">{d.display != null ? d.display : d.value}</span>
        </div>
      ))}
    </div>
  );
}

export interface DumbbellDatum { label: string; from: number; to: number; display?: string; color?: string; hint?: string; meta?: ReactNode }

// Hollow dot = from, filled dot = to, joined by a segment in the row's colour, on one shared axis.
export function Dumbbells({ data, max, legend }: { data: DumbbellDatum[]; max?: number; legend?: string }) {
  if (!data.length) return <p className="empty">No data yet.</p>;
  const top = max || Math.max(...data.flatMap((d) => [d.from, d.to]), 1);
  const pct = (v: number) => Math.max(0, Math.min(100, (v / top) * 100));
  return (
    <div className="chart-bars chart-dumbbells">
      {data.map((d) => {
        const a = pct(d.from), b = pct(d.to);
        return (
          <div className="chart-dumbbell-row" key={d.label} title={d.hint || ""}>
            <span className="chart-bar-label">{d.label}</span>
            <span className="chart-dumbbell-track" style={{ "--c": d.color || "var(--accent)" } as CSSProperties}>
              <span className="chart-dumbbell-seg" style={{ left: `${Math.min(a, b)}%`, width: `${Math.abs(a - b)}%` }} />
              <span className="chart-dumbbell-dot is-from" style={{ left: `${a}%` }} />
              <span className="chart-dumbbell-dot is-to" style={{ left: `${b}%` }} />
            </span>
            <span className="chart-bar-val">{d.display || ""}</span>
            <span className="chart-group-meta">{d.meta}</span>
          </div>
        );
      })}
      <div className="chart-dumbbell-row chart-dumbbell-axis">
        <span>{legend && <span className="chart-dumbbell-legend">{legend}</span>}</span>
        <span className="chart-dumbbell-ticks">{Array.from({ length: Math.floor(top) + 1 }, (_, i) => <span key={i} style={{ left: `${pct(i)}%` }}>{i}</span>)}</span>
      </div>
    </div>
  );
}

export function Forecast({ fc }: { fc?: { counts: number[]; start: string; overdue?: number; days: number } }) {
  if (!fc?.counts) return null;
  const max = Math.max(...fc.counts, 1);
  const start = new Date(fc.start + "T00:00:00");
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return (
    <div className="forecast">
      {fc.overdue ? <div className="fc-overdue">{fc.overdue} overdue</div> : null}
      <div className="fc-grid">
        {fc.counts.map((c, i) => {
          const d = new Date(start); d.setDate(d.getDate() + i);
          const intensity = c === 0 ? 0 : 0.25 + 0.75 * (c / max);
          return <div className="fc-cell" key={i} title={`${fmt(d)}: ${c} due`} style={{ background: c ? `rgba(124,134,255,${intensity.toFixed(2)})` : "var(--track)" }}><span className="fc-n">{c || ""}</span></div>;
        })}
      </div>
      <div className="fc-axis"><span>{fmt(start)}</span><span>+{fc.days}d</span></div>
    </div>
  );
}

export interface RadarSeries { category: string; mastery: number; mastery_past?: number }
export function Radar({ series, size = 260 }: { series: RadarSeries[]; size?: number }) {
  if (!series.length) return <p className="empty">Solve a few problems to see your mastery radar.</p>;
  const cx = size / 2, cy = size / 2, R = size / 2 - 46, n = series.length;
  const pt = (i: number, r: number) => { const a = (Math.PI * 2 * i) / n - Math.PI / 2; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; };
  const points = (f: (s: RadarSeries) => number) => series.map((s, i) => pt(i, R * Math.max(0.02, f(s))).map((v) => v.toFixed(1)).join(",")).join(" ");
  const ring = (frac: number) => <polygon key={frac} points={series.map((_, i) => pt(i, R * frac).map((v) => v.toFixed(1)).join(",")).join(" ")} fill="none" stroke="var(--line)" strokeWidth="1" />;
  return (
    <>
      <svg viewBox={`0 0 ${size} ${size}`} className="radar" role="img" aria-label="Mastery radar">
        {[0.33, 0.66, 1].map(ring)}
        <polygon points={points((s) => s.mastery_past || 0)} fill="rgba(118,127,149,0.14)" stroke="var(--muted)" strokeWidth="2" strokeLinejoin="round" />
        <polygon points={points((s) => s.mastery || 0)} fill="rgba(124,134,255,0.26)" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
        {series.map((s, i) => { const [x, y] = pt(i, R + 20); return <text key={i} x={x.toFixed(1)} y={y.toFixed(1)} textAnchor="middle" dominantBaseline="middle" fontSize="9.5" fill="var(--muted)" fontWeight="500">{s.category.replace(/ .*/, "").slice(0, 8)}</text>; })}
      </svg>
      <div className="legend"><span className="dot-accent" />now <span className="dot-muted" />30 days ago</div>
    </>
  );
}

const LINE_COLORS: Record<string, string> = { Easy: "var(--green)", Medium: "var(--amber)", Hard: "var(--red)", Unknown: "var(--muted)" };
export function Lines({ series, valueKey = "median_min", yLabel = "min" }: { series: Record<string, Record<string, number | string>[]>; valueKey?: string; yLabel?: string }) {
  const names = Object.keys(series).filter((k) => (series[k] || []).length);
  if (!names.length) return <p className="empty">Not enough timed solves yet.</p>;
  const W = 460, H = 180, pad = 28;
  const weeks = Array.from(new Set(names.flatMap((n) => series[n].map((d) => String(d.week))))).sort();
  const xOf = (w: string) => pad + (weeks.indexOf(w) / Math.max(1, weeks.length - 1)) * (W - pad * 2);
  const maxY = Math.max(...names.flatMap((n) => series[n].map((d) => Number(d[valueKey]))), 1);
  const yOf = (v: number) => H - pad - (v / maxY) * (H - pad * 2);
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="linechart">
        <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="var(--line)" />
        <text x={pad} y="14" fontSize="9.5" fill="var(--muted)" fontWeight="500">{yLabel} (max {maxY.toFixed(0)})</text>
        {names.map((n) => {
          const color = LINE_COLORS[n] || "var(--accent)";
          return (
            <g key={n}>
              <polyline points={series[n].map((d) => `${xOf(String(d.week)).toFixed(1)},${yOf(Number(d[valueKey])).toFixed(1)}`).join(" ")} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              {series[n].map((d, i) => <circle key={i} cx={xOf(String(d.week)).toFixed(1)} cy={yOf(Number(d[valueKey])).toFixed(1)} r="3" fill={color} />)}
            </g>
          );
        })}
      </svg>
      <div className="legend small">{names.map((n) => <span key={n} style={{ color: LINE_COLORS[n] || "var(--accent)" }}>● {n} </span>)}</div>
    </>
  );
}
