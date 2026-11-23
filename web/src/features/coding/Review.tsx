"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { inlineHtml, mdHtml as mdToHtml } from "@/lib/lesson-md";
import { useToast } from "@/lib/toast";
import { refToken } from "./refs";
import { Diff, Rows } from "./TestPanel";
import { AI_DIMENSIONS, CATEGORY_LABELS, type Attempt } from "./types";

const Text = ({ text }: { text: string }) => <span dangerouslySetInnerHTML={{ __html: inlineHtml(text) }} />;
const Lines = ({ items }: { items: string[] }) => (items.length ? <ul>{items.map((x, i) => <li key={i}><Text text={x} /></li>)}</ul> : null);

export function ReviewPanel({ attempt, onAttempt, onOpen, onNext, category }: {
  attempt: Attempt; onAttempt: (a: Attempt) => void; onOpen: (p: string, a?: number, b?: number) => void; onNext: (category?: string) => void; category: string;
}) {
  const toast = useToast();
  const [ticked, setTicked] = useState<string[]>([]);
  const r = attempt.result, rev = attempt.review;
  const met = new Map((r?.findings || []).map((f) => [f.id, f]));
  const selfMark = async () => {
    try { onAttempt((await api(`/coding/attempts/${attempt.id}/mark`, "POST", { met: ticked })).attempt); } catch (e) { toast((e as Error).message); }
  };
  return (
    <section className="cw-review" aria-label="Review">
      <div className="cw-review-head">
        {r ? (
          <div className="cw-scores">
            <div className="cw-score"><b>{r.score}</b><span>Correctness</span></div>
            {r.process != null && <div className="cw-score"><b>{r.process}</b><span>{attempt.mode === "assisted" ? "Working with AI" : "Reasoning"}</span></div>}
            {attempt.hints_used > 0 && <div className="cw-score"><b>{attempt.hints_used}</b><span>Hints used</span></div>}
          </div>
        ) : <p className="cw-note">The examiner is not available, so this one is marked by you: tick what your explanation covered.</p>}
        <div className="cw-next">
          <button className="button is-primary" type="button" onClick={() => onNext()}>Next exercise</button>
          <button className="button" type="button" onClick={() => onNext(category)}>Another {CATEGORY_LABELS[category]?.toLowerCase()}</button>
        </div>
      </div>
      {r?.summary && <p className="cw-summary"><Text text={r.summary} /></p>}
      {!!r?.takeaways?.length && <section className="cw-takeaways" aria-label="Take into your next exercise">
        <h3>Take into your next exercise</h3>
        <ol>{r.takeaways.map((t, i) => <li key={i}>
          <h4><Text text={t.principle} /></h4>
          <p className="cw-note"><b>In this attempt:</b> <Text text={t.evidence} /></p>
          <p><b>Next time:</b> <Text text={t.next_time} /></p>
        </li>)}</ol>
      </section>}
      {r && <div className="cw-coaching">
        {r.strengths.length > 0 && <section><h3>Keep doing</h3><Lines items={r.strengths} /></section>}
        {r.misconceptions.length > 0 && <section><h3>Concepts to clarify</h3><Lines items={r.misconceptions} /></section>}
      </div>}
      {r && <details className="cw-review-section"><summary>Feedback details</summary>
        {r.process_note && attempt.mode !== "assisted" && <p><b>Reasoning:</b> <Text text={r.process_note} /></p>}
        {!!r.omissions?.length && <><h3>Not yet demonstrated</h3><Lines items={r.omissions} /></>}
        {!!r.communication?.length && <><h3>Explaining your reasoning</h3><Lines items={r.communication} /></>}
        {!r.takeaways?.length && r.improve.length > 0 && <><h3>Advice from this review</h3><Lines items={r.improve} /></>}
      </details>}
      {r?.tests && (
        <details className="cw-review-section" open={r.tests.timed_out || r.tests.hidden_summary.passed < r.tests.hidden_summary.total || r.tests.visible_summary.passed < r.tests.visible_summary.total}>
          <summary>Tests · {r.tests.visible_summary.passed + r.tests.hidden_summary.passed}/{r.tests.visible_summary.total + r.tests.hidden_summary.total} passed{r.tests.timed_out ? " · timed out" : ""}</summary>
          <p className="cw-note">Visible {r.tests.visible_summary.passed} of {r.tests.visible_summary.total}, hidden {r.tests.hidden_summary.passed} of {r.tests.hidden_summary.total}.
            {r.test_score != null && r.explanation_score != null ? ` Marked 65% on the code and 35% on your explanation of it (${r.test_score} and ${r.explanation_score}).` : ""}</p>
          <details open={r.tests.hidden_summary.passed < r.tests.hidden_summary.total}><summary>Hidden tests</summary><Rows rows={r.tests.hidden} /></details>
          <details><summary>Visible tests</summary><Rows rows={r.tests.visible} /></details>
        </details>
      )}
      {rev && (
        <>
          <details className="cw-review-section" open={!r}><summary>Marking breakdown · {r ? `${rev.findings.filter(f => met.get(f.id)?.met).length}/${rev.findings.length} covered` : "mark your answer"}</summary>
          <ul className="cw-findings">
            {rev.findings.map((f) => {
              const m = met.get(f.id);
              return (
                <li key={f.id} className={m ? (m.met ? "is-met" : "is-missed") : ""}>
                  {!r && <input type="checkbox" aria-label={`I covered: ${f.text}`} checked={ticked.includes(f.id)} onChange={(e) => setTicked(e.target.checked ? [...ticked, f.id] : ticked.filter((x) => x !== f.id))} />}
                  <span className="cw-verdict">{m ? (m.met ? "Covered" : "Missed") : f.key ? "Essential" : "Also"}</span>
                  <div><Text text={f.text} />{m?.note ? <p className="cw-finding-note"><Text text={m.note} /></p> : null}</div>
                  <span className="cw-chips">{f.locations.map((l, i) => <button key={i} type="button" className="cw-chip" onClick={() => onOpen(l.path, l.start, l.end)}>{refToken(l).slice(1, -1)}</button>)}</span>
                </li>
              );
            })}
          </ul>
          {!r && <button className="button is-primary" type="button" onClick={selfMark}>Save my marking</button>}
          </details>
          {rev.ai && (
            <details className="cw-review-section"><summary>How you worked with the assistant</summary>
              <p className="cw-note">{rev.ai.prompts} message{rev.ai.prompts === 1 ? "" : "s"}, {rev.ai.applied} patch{rev.ai.applied === 1 ? "" : "es"} applied. This is marked apart from the code.</p>
              {rev.ai.planted ? (
                <div className={`cw-flaw ${rev.ai.detected ? "is-caught" : "is-missed"}`}>
                  <b>{rev.ai.detected ? "You caught the planted mistake." : "A mistake was planted, and it got through."}</b>
                  <p>The assistant was set to give you a flawed answer: {rev.ai.description}</p>
                  {rev.ai.tell && <p><b>What would have caught it:</b> {rev.ai.tell}</p>}
                  {rev.ai.mistake_note && <p>{rev.ai.mistake_note}</p>}
                </div>
              ) : <div className="cw-flaw is-caught"><b>No mistake was planted this time.</b><p>The assistant was set to help correctly, so trusting a sound suggestion was fine here. Good practice is to check anyway, and cheaply.</p></div>}
              {rev.ai.dims && <ul className="cw-dims">{Object.entries(rev.ai.dims).map(([k, v]) => <li key={k}><span>{AI_DIMENSIONS[k] ?? k}</span><b>{v.score}</b><span className="cw-note">{v.note}</span></li>)}</ul>}
              {rev.ai.assistant_review && <p>{rev.ai.assistant_review}</p>}
              {rev.ai.improve && rev.ai.improve.length > 0 && <><h3>To change next time</h3><Lines items={rev.ai.improve} /></>}
              {rev.chat && rev.chat.length > 0 && <details><summary>The conversation</summary>{rev.chat.filter((m) => m.role !== "event").map((m, i) => <div key={i} className={`cw-msg is-${m.role}`}><b>{m.role === "user" ? "You" : "Assistant"}</b><div className="cw-md" dangerouslySetInnerHTML={{ __html: mdToHtml(m.text) }} /></div>)}</details>}
            </details>
          )}
          <details className="cw-review-section"><summary>Walkthrough and explanation</summary>
          {rev.expected_behaviour && <><h3>Expected behaviour</h3><div className="cw-md" dangerouslySetInnerHTML={{ __html: mdToHtml(rev.expected_behaviour) }} /></>}
          {rev.execution_path && <><h3>The path through the code</h3><div className="cw-md cw-pre" dangerouslySetInnerHTML={{ __html: mdToHtml(rev.execution_path) }} /></>}
          {rev.root_cause && <><h3>Root cause</h3><div className="cw-md" dangerouslySetInnerHTML={{ __html: mdToHtml(rev.root_cause) }} /></>}
          {rev.interactions && <><h3>What is easy to overlook</h3><div className="cw-md" dangerouslySetInnerHTML={{ __html: mdToHtml(rev.interactions) }} /></>}
          </details>
          {(rev.your_diff !== undefined || rev.reference_diff || rev.fix_summary) && <details className="cw-review-section"><summary>Your change and the reference fix</summary>
          {rev.your_diff !== undefined && <><h3>Your change</h3><Diff text={rev.your_diff || ""} empty="You did not change any code." /></>}
          {rev.reference_diff && <><h3>The reference fix</h3><Diff text={rev.reference_diff} /></>}
          {rev.fix_summary && <><h3>The fix</h3><div className="cw-md" dangerouslySetInnerHTML={{ __html: mdToHtml(rev.fix_summary) }} /></>}
          </details>}
          <details className="cw-review-section"><summary>A model answer</summary><div className="cw-md" dangerouslySetInnerHTML={{ __html: mdToHtml(rev.model_answer) }} /></details>
        </>
      )}
    </section>
  );
}
