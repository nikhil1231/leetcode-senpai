"use client";
import { useState } from "react";
import { pageLabel, staticPages } from "@/lib/pages";
import { clearUsage, usageSummary } from "@/lib/usage";
import { useToast } from "@/lib/toast";

const fmt = (sec: number | null) => (sec == null ? "—" : sec < 90 ? sec + " s" : Math.round(sec / 60) + " min");

// Friction metrics, kept in this browser only: how long from opening the app to the first thing you do, which pages
// get visited, and which never do. Nothing leaves the device.
export function UsageSettings() {
  const toast = useToast();
  const [, bump] = useState(0);
  const s = usageSummary();
  const pages = staticPages();
  const name: Record<string, string> = Object.fromEntries(pages.map((p) => [p.key, pageLabel(p)]));
  const never = pages.filter((p) => !s.visits[p.key]).map(pageLabel);
  const top = Object.entries(s.visits).sort((a, b) => b[1].n - a[1].n).slice(0, 8);
  return (
    <>
      <div className="section-title" id="settings-Usage" style={{ scrollMarginTop: 84 }}>Usage</div>
      <p className="help">Kept in this browser only, so a phone and a laptop each have their own. It shows how much friction the daily loop has and which pages never get opened.</p>
      <dl className="plan-stats usage-stats">
        <div><dt>Open → first action</dt><dd>{fmt(s.medianFirstAction)}</dd></div>
        <div><dt>Sessions with an action</dt><dd>{Math.round(s.actedShare * 100)}%</dd></div>
        <div><dt>Pages per session</dt><dd>{s.pagesPerSession.toFixed(1)}</dd></div>
        <div><dt>Sessions recorded</dt><dd>{s.sessions}</dd></div>
      </dl>
      {top.length > 0 && <><p className="small"><b>Most visited</b></p><ul className="usage-list">{top.map(([k, v]) => <li key={k}><span>{name[k] || k}</span><b>{v.n}</b></li>)}</ul></>}
      {never.length > 0 && <><p className="small"><b>Never opened here</b> · {never.length} of {pages.length}</p><p className="help">{never.join(" · ")}</p></>}
      <div className="buttons"><button className="button is-ghost is-small" type="button" onClick={() => { clearUsage(); bump((n) => n + 1); toast("Usage data cleared"); }}>Reset usage data</button></div>
    </>
  );
}
