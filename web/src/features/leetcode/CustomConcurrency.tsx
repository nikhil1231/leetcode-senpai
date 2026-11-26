"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { shortLocalDate } from "@/lib/format";
import { useToast } from "@/lib/toast";
import { Loader, LoadError } from "@/components/ui/Loader";
import { Modal } from "@/components/ui/Modal";
import { useStartFlow } from "./useStartFlow";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const Level = ({ level }: { level: number }) => <span className="cc-level" title={`Level ${level} of 5`}>L{level}</span>;

// Generated Java concurrency questions, listed apart from LeetCode's own: two kept ready, made in the background and
// checked by running them before they appear here. Starting one puts it in your library and opens the in-app editor.
export function CustomConcurrency({ onStarted }: { onStarted: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const start = useStartFlow();
  const [busy, setBusy] = useState("");
  const [discarding, setDiscarding] = useState<Any>(null);
  const key = ["api", "concurrency-overview"];
  const q = useQuery({ queryKey: key, queryFn: () => api("/concurrency/overview"), refetchInterval: (s) => (s.state.data?.generating ? 5000 : false) });
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  const open = async (item: Any) => {
    setBusy(item.id);
    try {
      const r = await api(`/concurrency/${item.id}/start`, "POST");
      onStarted();
      start(r.slug, "adhoc", "", r.title, r.category);
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't start that question."); }
    finally { setBusy(""); refresh(); }
  };
  const generate = async () => {
    try { await api("/concurrency/generate", "POST"); toast("Writing another question. It appears here once it has passed its checks."); }
    catch (e) { toast(e instanceof Error ? e.message : "Couldn't ask for another question."); }
    refresh();
  };

  if (q.isLoading) return <Loader message="Loading custom questions…" />;
  if (q.error) return <LoadError error={q.error} retry={() => q.refetch()} />;
  const d: Any = q.data;
  const row = (item: Any, actions: React.ReactNode, sub?: React.ReactNode, done = false) => (
    <li key={item.id} className={`topic-problem cc-row${done ? " is-done" : ""}`}>
      <span className="topic-problem-check" aria-hidden="true">{done && item.solved ? "✓" : ""}</span>
      <span className="topic-problem-title">{item.title}{sub && <span className="small">{sub}</span>}</span>
      <Level level={item.level} />
      <span className="topic-problem-state">{done && item.tool ? <span className="tag cc-tool" title={item.topic || ""}>{item.tool}</span> : null}</span>
      <span className="problem-actions">{actions}</span>
    </li>
  );
  const discardButton = (item: Any) => <button className="button is-small is-ghost cc-discard" type="button" title="Drop this question and make a replacement" onClick={() => setDiscarding(item)}>Discard</button>;
  const startButton = (item: Any, label: string, primary = false) => (
    <button className={`button is-small${primary ? " is-primary" : ""} topic-start`} type="button" disabled={busy === item.id} onClick={() => open(item)}>{label}</button>
  );
  const empty = !d.ready.length && !d.in_progress.length && !d.done.length;

  return (
    <section id="cc-custom" className="cc-custom" aria-labelledby="cc-custom-head">
      <div className="cc-head">
        <h3 id="cc-custom-head" className="topic-section-head small">Custom practice</h3>
        <span className="small cc-level-now">Level {d.level} of 5 · {d.level_label}</span>
        <button id="cc-generate" className="button is-small" type="button" disabled={!d.model} title={d.model ? "Write one more question now, beyond the usual two" : "Needs a model"} onClick={generate}>Generate</button>
      </div>
      <p className="small cc-note">Java questions written for you, each checked by running it before it appears: the reference solution passes every test 20 times over, and every planted mistake fails. Run tries the examples; Submit runs every test 20 times to catch races.</p>
      {d.generating && <p className="small cc-status"><span className="spinner" /> Writing and checking a question…</p>}
      {d.error && !d.generating && <p className="small missed cc-status">The last question didn&apos;t pass its checks: {d.error}</p>}
      {!d.model && <p className="small cc-status">New questions need a model, and none is configured. The ones below still run.</p>}
      {empty && !d.generating && <p className="empty">No custom questions yet.{d.model ? " The first two are on their way." : ""}</p>}
      {d.in_progress.length > 0 && <><h4 className="topic-section-head small">In progress <span>{d.in_progress.length}</span></h4>
        <ul className="topic-problems">{d.in_progress.map((i: Any) => row(i, <>{discardButton(i)}{startButton(i, i.active ? "Continue" : "Start", true)}</>, i.started_at ? `started ${shortLocalDate(i.started_at)}` : undefined))}</ul></>}
      {d.ready.length > 0 && <><h4 className="topic-section-head small">Ready <span>{d.ready.length}</span></h4>
        <ul className="topic-problems">{d.ready.map((i: Any, k: number) => row(i, <>{discardButton(i)}{startButton(i, "Start", !d.in_progress.length && k === 0)}</>))}</ul></>}
      {d.done.length > 0 && <><h4 className="topic-section-head small">Done <span>{d.done.length}</span></h4>
        <ul className="topic-problems">{d.done.map((i: Any) => row(i, <>{discardButton(i)}{startButton(i, "Again")}</>,
          `${i.attempts}× · last ${shortLocalDate(i.last_attempt_at)}${i.score != null ? ` · ${i.score}/5` : ""}${i.solved ? "" : " · not solved"}`, true))}</ul></>}
      {discarding && <DiscardModal item={discarding} reasons={d.reasons} onClose={() => setDiscarding(null)} onDone={() => { setDiscarding(null); refresh(); toast("Discarded. A replacement is on its way."); }} />}
    </section>
  );
}

function DiscardModal({ item, reasons, onClose, onDone }: { item: Any; reasons: { key: string; label: string }[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const send = async () => {
    try { await api(`/concurrency/${item.id}/discard`, "POST", { reason, note }); onDone(); }
    catch (e) { toast(e instanceof Error ? e.message : "Couldn't discard it."); }
  };
  return (
    <Modal open onClose={onClose} title="Discard this question">
      <p className="small">{item.title}. It leaves this list and your reviews; any attempts you made stay in your history. The reason is passed on to the next questions written for you.</p>
      <fieldset className="cc-reasons">
        <legend className="label-sm">Why?</legend>
        {reasons.map((r) => <label key={r.key} className="cc-reason"><input type="radio" name="cc-reason" value={r.key} checked={reason === r.key} onChange={() => setReason(r.key)} /> {r.label}</label>)}
      </fieldset>
      <label className="label-sm" htmlFor="cc-note">Anything to add <span className="help-inline">optional</span></label>
      <textarea id="cc-note" className="textarea" rows={2} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="e.g. the statement never said what a timed-out call returns" />
      <div className="overlay-actions">
        <button className="button is-ghost" type="button" onClick={onClose}>Keep it</button>
        <button id="cc-discard-confirm" className="button is-primary" type="button" disabled={!reason} onClick={send}>Discard</button>
      </div>
    </Modal>
  );
}
