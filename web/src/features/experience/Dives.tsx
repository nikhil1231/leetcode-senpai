"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { inlineMd } from "@/lib/inline-md";
import { mdToHtml } from "@/lib/md";
import { useToast } from "@/lib/toast";
import { call, isHeld, KEY, STATUS_LABEL, useGo, type Experience, type Status } from "./data";

// Deep dives: the technical follow-ups on your own work, graded against key points, with a model answer. A pack whose
// results disagree with your Notion tracker offers to suggest the change (it waits in Job Scout for approval).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const Dot = ({ s }: { s: Status }) => <span className={`tr-dot is-${s}`} role="img" aria-label={STATUS_LABEL[s]} title={STATUS_LABEL[s]} />;

export function DivesPage({ d }: { d: Experience }) {
  const go = useGo();
  return (
    <>
      <div className="sd-page-intro"><span className="sd-eyebrow">DEEP DIVES</span><h2>The questions after &quot;tell me about it&quot;</h2>
        <p>Packs on the technology behind your stories, with model answers. Answer in writing as you would say it.</p></div>
      <p className="tr-legend" aria-label="Status key">{(["solid", "learning", "fading", "shaky", "unseen"] as Status[]).map((k) => <span key={k}><Dot s={k} /> {STATUS_LABEL[k]}</span>)}</p>
      {d.packs.map((p) => {
        const held = p.questions.filter((q) => isHeld(q.status)).length, next = p.questions.find((q) => !isHeld(q.status));
        return (
          <section key={p.id} className="sd-panel" id={"pack-" + p.id}>
            <div className="tr-pack-head"><div><h3>{p.title}</h3><p className="sd-muted">{p.blurb}</p></div>
              <div className="tr-pack-meter"><span className="tr-pack-count"><b>{held}</b>/{p.questions.length} held</span>
                <span className="tr-comp-held" role="img" aria-label={`${held} of ${p.questions.length} held`}><i style={{ width: `${(100 * held) / p.questions.length}%` }} /></span>
                {next ? <button type="button" className={`button ${held ? "" : "is-primary"}`} onClick={() => go("dive/" + next.id)}>{held ? "Next question" : "Start"}</button> : <span className="sd-muted">All held</span>}</div></div>
            <ul className="tr-list">{p.questions.map((q) => (
              <li key={q.id} className="tr-dive-row"><Dot s={q.status} /><button type="button" className="tr-link" onClick={() => go("dive/" + q.id)}>{q.prompt}</button><small className="sd-muted tr-st">{STATUS_LABEL[q.status]}</small></li>
            ))}</ul>
          </section>
        );
      })}
      <TrackerPanel d={d} />
    </>
  );
}

function TrackerPanel({ d }: { d: Experience }) {
  const toast = useToast();
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const rows = d.tracker.filter((t) => t.suggested && t.suggested !== t.state);
  if (!d.tracker.length) return null;
  const suggest = async (topic: string, state: string) => {
    try {
      await call("/tracker-proposal", "POST", { topic, state, evidence: `Deep-dive results in Senpai suggest ${state}.` });
      setSent((s) => ({ ...s, [topic]: true })); toast("Sent to Job Scout for your approval");
    } catch (e) { toast((e as Error).message); }
  };
  return (
    <section className="sd-panel">
      <h3>Your Notion tracker</h3>
      <p className="sd-muted">The Technical-knowledge tracker in Notion is where your level on each topic is recorded. Where your answers here say something different, you can suggest a change; it waits in Job Scout until you approve it.</p>
      <ul className="tr-topic-list">{d.tracker.map((t) => (
        <li key={t.topic}><span>{t.topic}</span><span className={`tr-tag ${t.state === "Needs work" ? "is-warn" : ""}`}>{t.state || "Unassessed"}</span>
          {rows.includes(t) && (sent[t.topic] ? <span className="sd-muted">Sent</span>
            : <button type="button" className="button is-small" onClick={() => suggest(t.topic, t.suggested!)}>Suggest {t.suggested}</button>)}</li>
      ))}</ul>
    </section>
  );
}

const MARK: Record<string, [string, string]> = { covered: ["✓", "is-right"], partial: ["◐", "is-partial"], missing: ["○", "is-missing"], incorrect: ["✗", "is-wrong"] };

export function DivePage({ d, id }: { d: Experience; id: string }) {
  const go = useGo();
  const qc = useQueryClient();
  const area = useRef<HTMLTextAreaElement>(null);
  const [res, setRes] = useState<Any>(null);
  const [busy, setBusy] = useState(false);
  const [self, setSelf] = useState<Record<number, boolean>>({});
  const [selfDone, setSelfDone] = useState<Any>(null);
  const pack = d.packs.find((p) => p.questions.some((q) => q.id === id));
  if (!pack) return <section className="sd-panel"><h3>Unknown deep-dive question</h3></section>;
  const q = pack.questions.find((x) => x.id === id)!, i = pack.questions.indexOf(q), next = pack.questions[i + 1];
  const check = async () => {
    if (!area.current) return;
    await (window as Any).Dictate?.settle?.(area.current);
    const text = area.current.value.trim();
    if (text.length < 15) { area.current.focus(); return; }
    setBusy(true);
    try { setRes(await call<Any>("/dives/" + q.id, "POST", { text })); qc.invalidateQueries({ queryKey: KEY }); } finally { setBusy(false); }
  };
  const recordSelf = async () => {
    const covered = Object.values(self).filter(Boolean).length;
    setSelfDone({ covered, ...(await call<Any>(`/dives/attempts/${res.attempt.id}/self`, "POST", { covered })) });
    qc.invalidateQueries({ queryKey: KEY });
  };
  return (
    <>
      <div className="sd-breadcrumb"><button type="button" className="button" onClick={() => go("dives")}>← Deep dives</button><span>/ {pack.title}</span></div>
      <div className="sd-page-intro"><span className="sd-eyebrow">QUESTION {i + 1} OF {pack.questions.length}</span><h2>{q.prompt}</h2></div>
      <section className="sd-panel">
        <textarea ref={area} className="textarea" data-dictate rows={9} maxLength={4000} disabled={!!res} autoFocus
          onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); check(); } }}
          placeholder="Answer as you would out loud: mechanism first, then the failure modes and trade-offs." />
        <div className="sd-actions"><button type="button" className="button is-primary" disabled={busy || !!res} onClick={check}>{res ? "Checked" : busy ? "Checking…" : "Check my answer"}</button><span className="sd-muted">Write before you look · Ctrl+Enter checks</span></div>
        {res && (
          <div className="tr-dive-result">
            {res.grade ? (
              <>
                <ul className="sd-rubric">{res.grade.points.map((p: Any, k: number) => <li key={k} className={MARK[p.status][1]}><span>{MARK[p.status][0]}</span><div><b>{inlineMd(p.point)}</b><p>{inlineMd(p.note)}</p></div></li>)}</ul>
                <p>{inlineMd(res.grade.feedback)}</p>
              </>
            ) : res.message ? <p className="sd-muted">{res.message}</p> : null}
            <details className="sd-model" open={!res.grade}><summary>Model answer</summary><div dangerouslySetInnerHTML={{ __html: mdToHtml(res.model) }} /></details>
            {res.grade ? <p className="sd-muted">{res.attempt.clean ? "Counts as held." : "Comes back soon."}</p> : (
              <>
                <p><b>Tick the points your answer covered:</b></p>
                <ul className="sd-rubric is-self">{res.points.map((p: string, k: number) => <li key={k}><label><input type="checkbox" checked={!!self[k]} disabled={!!selfDone} onChange={(e) => setSelf({ ...self, [k]: e.target.checked })} /> {inlineMd(p)}</label></li>)}</ul>
                <div className="sd-actions">{selfDone ? <span className="sd-muted">{selfDone.covered} of {res.points.length}. {selfDone.clean ? "Counts as held." : "Comes back soon."}</span>
                  : <button type="button" className="button is-primary" onClick={recordSelf}>Record self-check</button>}</div>
              </>
            )}
          </div>
        )}
      </section>
      <div className="sd-actions">{next ? <button type="button" className="button" onClick={() => go("dive/" + next.id)}>Next question →</button> : <button type="button" className="button" onClick={() => go("dives")}>Back to deep dives</button>}</div>
    </>
  );
}
