"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useHeading } from "@/lib/heading";
import { importWidget } from "@/lib/widget";
import { TAB_TITLES } from "@/lib/sections";
import { KeyCard, TopicNotes } from "@/components/topic/TopicNotes";

// Visualise: step-through animations of 46 algorithms and data structures. Topic text lives in /widgets/dsa/index.json;
// each animation is a prebuilt module (widgets/dsa/<id>.js, export mount(el) -> unmount) loaded only when its topic is
// opened. Nothing here touches the server or your practice data, and the tab works offline once its files are cached.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const Pill = ({ d }: { d: string }) => <span className={`vz-pill vz-${d}`}>{d}</span>;

export const useDsaIndex = () => useQuery({ queryKey: ["dsa-index"], staleTime: Infinity, queryFn: async () => { const r = await fetch("/widgets/dsa/index.json"); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); } });

function Stage({ id }: { id: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let unmount: (() => void) | undefined, alive = true;
    importWidget(`/widgets/dsa/${id}.js`).then((m) => { if (!alive || !host.current) return; host.current.innerHTML = ""; unmount = m.mount(host.current); }).catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; try { unmount?.(); } catch (e) { console.warn("Could not unmount animation", e); } };
  }, [id]);
  return <div className="vz-stage" data-stage ref={host}>{error ? <p className="vz-empty">Could not load this animation: {error}</p> : <p className="vz-empty">Loading…</p>}</div>;
}

export function VisualisePage({ topic }: { topic?: string }) {
  useHeading(...TAB_TITLES.visualise);
  const q = useDsaIndex();
  const [filter, setFilter] = useState({ q: "", cat: "" });
  if (q.isLoading) return <p className="vz-empty">Loading…</p>;
  if (q.error || !q.data) return <p className="vz-empty">Could not load the algorithm list ({(q.error as Error)?.message}). <button type="button" className="button" onClick={() => q.refetch()}>Retry</button></p>;
  const data: Any = q.data;
  const i = data.topics.findIndex((t: Any) => t.id === topic), t = data.topics[i];
  if (t) {
    const prev = data.topics[i - 1], next = data.topics[i + 1];
    return (
      <div className="vz vz-detail">
        <div className="vz-head">
          <Link className="button vz-back" href="/leetcode/visualise">← All algorithms</Link>
          <h2>{t.title} <Pill d={t.difficulty} /></h2>
          <span className="vz-nav">
            {prev ? <Link className="button" href={`/leetcode/visualise/${prev.id}`} aria-label={`Previous: ${prev.title}`}>‹</Link> : <button type="button" className="button" disabled aria-label="Previous">‹</button>}
            {next ? <Link className="button" href={`/leetcode/visualise/${next.id}`} aria-label={`Next: ${next.title}`}>›</Link> : <button type="button" className="button" disabled aria-label="Next">›</button>}
          </span>
        </div>
        <KeyCard t={t} />
        <Stage key={t.id} id={t.id} />
        <TopicNotes t={t} background={t.concept} practice={t.problems.length ? (
          <ul className="vz-links">{t.problems.map((p: Any) => <li key={p.title}><a href={p.slug ? `https://leetcode.com/problems/${encodeURIComponent(p.slug)}/` : `https://leetcode.com/problemset/?search=${encodeURIComponent(p.title)}`} target="_blank" rel="noopener noreferrer">{p.title} ↗</a></li>)}</ul>) : null} />
      </div>
    );
  }
  const shown = data.topics.filter((x: Any) => (!filter.cat || x.category === filter.cat) && (!filter.q || `${x.title} ${x.blurb} ${x.categoryLabel} ${x.problems.map((p: Any) => p.title).join(" ")}`.toLowerCase().includes(filter.q.toLowerCase())));
  return (
    <div className="vz">
      <div className="vz-bar">
        <input className="vz-search input" type="search" placeholder="Search algorithms or problems" value={filter.q} aria-label="Search algorithms" onChange={(e) => setFilter({ ...filter, q: e.target.value })} />
        <div className="vz-chips" role="group" aria-label="Category">
          <button type="button" className={`vz-chip${filter.cat ? "" : " is-on"}`} onClick={() => setFilter({ ...filter, cat: "" })}>All {data.topics.length}</button>
          {data.categories.map(([id, label]: string[]) => <button key={id} type="button" className={`vz-chip${filter.cat === id ? " is-on" : ""}`} onClick={() => setFilter({ ...filter, cat: id })}>{label}</button>)}
        </div>
      </div>
      <div className="vz-grid">
        {shown.map((x: Any) => (
          <Link key={x.id} className="vz-card" href={`/leetcode/visualise/${x.id}`}>
            <span className="vz-card-top"><strong>{x.title}</strong><Pill d={x.difficulty} /></span><span className="vz-card-blurb">{x.blurb}</span>
            <span className="vz-card-meta"><code>{x.time}</code><span>{x.categoryLabel}</span></span></Link>))}
        {!shown.length && <p className="vz-empty">Nothing matches. Clear the search or pick another category.</p>}
      </div>
    </div>
  );
}
