"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { useHeading } from "@/lib/heading";
import { mdToHtml } from "@/lib/md";
import { useOverview } from "@/lib/queries";
import { TAB_TITLES } from "@/lib/sections";
import { Loader } from "@/components/ui/Loader";

export function PlaybookPage() {
  useHeading(...TAB_TITLES.playbook);
  const topics = useQuery({ queryKey: ["api", "/topics"], queryFn: () => api("/topics") });
  const [pick, setPick] = useState<string | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  if (topics.isLoading) return <Loader message="Loading playbooks…" />;
  const list: { category: string }[] = topics.data || [];
  if (!list.length) return <p className="empty">Solve some problems first.</p>;
  const category = pick ?? list[0].category;
  return (
    <>
      <div className="field has-addons">
        <div className="control is-expanded"><div className="select is-fullwidth"><select value={category} onChange={(e) => setPick(e.target.value)}>{list.map((t) => <option key={t.category} value={t.category}>{t.category}</option>)}</select></div></div>
        <div className="control"><button className="button is-primary" onClick={() => setShown(category)}>Open</button></div>
      </div>
      <PlaybookBody category={shown ?? list[0].category} />
    </>
  );
}

function PlaybookBody({ category }: { category: string }) {
  const qc = useQueryClient();
  const llm = useOverview().data?.llm_enabled;
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ["api", "playbook", category], queryFn: () => api(`/playbook/${encodeURIComponent(category)}`) });
  if (q.isLoading) return <div id="pb-body"><Loader message="Loading playbook…" /></div>;
  const r = q.data;
  return (
    <div id="pb-body">
      {r.playbook ? <>
        <div className="playbook" dangerouslySetInnerHTML={{ __html: mdToHtml(r.playbook.content_md) }} />
        <p className="small">Generated from {r.playbook.attempt_count_at_generation} attempts.{r.stale ? " New attempts since — regenerate for a refresh." : ""}</p></>
        : <p className="empty">No playbook yet for {category}.</p>}
      {r.can_generate ? (
        <button id="pb-gen" className="button is-primary mt-3" disabled={busy}
          onClick={async () => { setBusy(true); await api(`/playbook/${encodeURIComponent(category)}/regenerate`, "POST"); await qc.invalidateQueries({ queryKey: ["api", "playbook", category] }); setBusy(false); }}>
          {busy ? <><span className="spinner spinner-sm" /> Synthesizing…</> : r.playbook ? "Regenerate" : "Generate playbook"}</button>
      ) : !llm ? <p className="small">Enable the coach to synthesize playbooks.</p> : null}
    </div>
  );
}
