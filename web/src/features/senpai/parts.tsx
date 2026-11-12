"use client";
import { useStartBlock } from "./start";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
export const ACTIVITY: Record<string, string> = { check: "Check", retrieval: "Retrieval", implementation: "Implementation", explanation: "Explanation", design: "Design" };
export const pct = (x?: number) => `${Math.round((x || 0) * 100)}%`;
export const day = (ts?: number) => (ts ? new Date(ts * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "—");
export const when = (ts?: number) => (ts ? new Date(ts * 1000).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "never");
const hours = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? " " + (m % 60) + "m" : ""}` : `${m}m`);

export function Blocks({ blocks }: { blocks: Any[] }) {
  const start = useStartBlock();
  return (
    <ol className="sp-blocks">
      {blocks.map((b) => (
        <li key={b.id} className={`sp-block${b.done ? " is-done" : ""}`}>
          <div className="sp-block-main">
            <span className="sp-chip">{ACTIVITY[b.activity] || b.activity}</span><b>{b.title}</b><span className="sp-min">{b.minutes} min</span>
            {b.done && <span className="sp-chip is-good">Done</span>}
          </div>
          <p>{b.why}</p>
          {!b.done && <button type="button" className="button is-small" onClick={() => start(b.action)}>Start</button>}
        </li>
      ))}
    </ol>
  );
}

function Split({ sp }: { sp: Any }) {
  if (!sp?.buckets?.length) return null;
  return (
    <div className="sp-split" aria-label="This week's time split">
      <div className="sp-split-bar">{sp.buckets.map((b: Any) => <i key={b.id} className={`is-${b.id}`} style={{ width: pct(b.share) }} title={`${b.label} ${pct(b.share)}`} />)}</div>
      <ul className="sp-split-legend">
        {sp.buckets.map((b: Any) => <li key={b.id}><i className={`is-${b.id}`} />{b.label} <b>{pct(b.share)}</b> <span>{hours(b.minutes)}</span></li>)}
        <li className="sp-split-total">of {hours(sp.weekly_minutes)} a week</li>
      </ul>
      {sp.note && <p className="help">{sp.note}</p>}
    </div>
  );
}

export function Brief({ brief, extra, split = true }: { brief: Any; extra?: React.ReactNode; split?: boolean }) {
  const start = useStartBlock();
  if (!brief) return null;
  return (
    <section className="sp-brief">
      <div className="sp-today-head"><span className="dc-eyebrow">This week{brief.goal ? " · toward " + brief.goal : ""}</span>{extra}</div>
      {split ? <Split sp={brief.split} /> : brief.split?.note ? <p className="help">{brief.split.note}</p> : null}
      {brief.items?.length > 0 && (
        <ol className="sp-brief-items">
          {brief.items.map((it: Any) => (
            <li key={it.id} className="sp-brief-item">
              <div><span className="sp-chip">{it.label}</span><b>{it.title}</b><span className="sp-min">{it.minutes} min</span></div>
              <p>{it.why}</p>
              <button type="button" className="button is-small" onClick={() => start(it.action)}>{it.kind === "cv" ? "Start the interview" : "Start"}</button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
