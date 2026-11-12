"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { navigate } from "@/lib/navigate";
import { useStartBlock } from "@/features/senpai/start";

// "Do this next": the one recommendation, shared by Today, Tutor and every section Home. The server (senpai/next) picks the
// open block from whichever bucket is furthest behind its weekly share. Never in the critical path: a failed read draws nothing.
export interface Block { title: string; minutes?: number; activity: string; bucket: string; why?: string; action: unknown }
export interface Standing { id: string; label: string; target_min: number; served_min: number; ratio?: number }
export interface Next { primary: Block | null; alternatives: Block[]; reason: string; note?: string; session_complete?: boolean; standing: Standing[] }

export const useNext = () => useQuery<Next>({ queryKey: ["api", "/senpai/next"], queryFn: () => api("/senpai/next"), staleTime: 15_000, retry: false });

const ACTIVITY: Record<string, string> = { check: "Check", retrieval: "Retrieval", implementation: "Implementation", explanation: "Explanation", design: "Design" };
const meta = (b: Block, label: string) => [ACTIVITY[b.activity] || b.activity, b.minutes ? b.minutes + " min" : "", label].filter(Boolean).join(" · ");
const labelOf = (d: Next, id: string) => d.standing.find((r) => r.id === id)?.label || "";

function WeekBars({ d }: { d: Next }) {
  const rows = d.standing.filter((r) => r.target_min > 0);
  if (!rows.length) return null;
  return (
    <ul className="nu-week" aria-label="This week against the time split">
      {rows.map((r) => (
        <li key={r.id} className={d.primary?.bucket === r.id ? "is-next" : ""}>
          <span>{r.label}</span>
          <i className="nu-bar" role="img" aria-label={`${r.label}: ${r.served_min} of ${r.target_min} minutes`}><b style={{ width: `${Math.min(100, Math.round((r.ratio || 0) * 100))}%` }} /></i>
          <em>{r.served_min}<small>/{r.target_min}m</small></em>
        </li>
      ))}
    </ul>
  );
}

// The full card: Overview, Today and Tutor.
export function NextUpCard() {
  const { data: d } = useNext();
  const start = useStartBlock();
  if (!d) return null;
  if (!d.primary) {
    return (
      <section className="nu-card is-clear">
        <span className="dc-eyebrow">Do this next</span>
        <h2>{d.session_complete ? "Today's session is done" : "Nothing is queued"}</h2>
        <p className="nu-why">{d.note || (d.session_complete ? "Everything planned for today is finished. Prepare another session in Senpai if you want more, or stop here." : "Open Senpai to prepare a session.")}</p>
        <div className="nu-actions"><button type="button" className="button" onClick={() => navigate("/leetcode/senpai")}>Open Senpai</button></div>
        <WeekBars d={d} />
      </section>
    );
  }
  const p = d.primary;
  return (
    <section className="nu-card">
      <span className="dc-eyebrow">Do this next</span>
      <h2>{p.title}</h2>
      <p className="nu-meta">{meta(p, labelOf(d, p.bucket))}</p>
      <p className="nu-why">{d.reason}</p>
      {p.why && <p className="nu-sub">{p.why}</p>}
      <div className="nu-actions">
        <button type="button" className="button is-primary" onClick={() => start(p.action)}>Start</button>
        {d.alternatives.map((a, i) => (
          <button key={i} type="button" className="button is-ghost nu-alt" title={a.why || ""} onClick={() => start(a.action)}>Or: {a.title} <small>{a.minutes} min</small></button>
        ))}
      </div>
      <WeekBars d={d} />
    </section>
  );
}

// A slim line for section Homes, which have their own, section-specific suggestion.
export function NextUpBanner() {
  const { data: d } = useNext();
  const start = useStartBlock();
  if (!d?.primary) return null;
  const p = d.primary;
  return (
    <div className="nu-banner">
      <div>
        <span className="dc-eyebrow">Your plan&apos;s next step</span>
        <b>{p.title}</b> <span className="nu-meta">{meta(p, labelOf(d, p.bucket))}</span>
        <p className="nu-why">{d.reason}</p>
      </div>
      <button type="button" className="button is-small" onClick={() => start(p.action)}>Start</button>
    </div>
  );
}
