"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Loader } from "@/components/ui/Loader";
import { useToast } from "@/lib/toast";
import { call, fmt, KEY, useGo, type Experience, type ModelAnswer } from "./data";

// A timed behavioural answer: pick a story, answer out loud against the clock, tick the STAR self-check, then compare
// with the model answer (the role pack's version for that company where there is one).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
interface Next { prompt: { id: string; text: string; competencies: string[]; probes: string[]; signals: string; kind: string; job_id?: number; company?: string; reason?: string | null }; stories: string[]; has_answer: boolean }
const ZONES: [string, string][] = [["Keep going: a little short so far", "is-short"], ["In the zone", "is-good"], ["Start wrapping up", "is-long"], ["Over time: this will not count as clean", "is-over"]];
const NEED: Record<string, string> = { role: "your own role", result: "a concrete result", fit: "answering the question asked" };
let session = { n: 0, clean: 0, at: 0 };   // this sitting's tally, reset after half an hour away

export function DrillPage({ d, promptId }: { d: Experience; promptId: string | null }) {
  const q = useQuery<Next>({ queryKey: ["experience-next", promptId], queryFn: () => call("/drill/next", "POST", { exclude: [], prompt_id: promptId }), staleTime: Infinity });
  if (!q.data) return <Loader message="Choosing a prompt…" />;
  return <Drill d={d} next={q.data} />;
}

function Drill({ d, next }: { d: Experience; next: Next }) {
  const go = useGo();
  const toast = useToast();
  const qc = useQueryClient();
  const p = next.prompt;
  const [lo, hi] = d.target_seconds;
  const [stage, setStage] = useState<"prep" | "answer" | "check" | "done">("prep");
  const [storyId, setStoryId] = useState(next.stories[0] || "");
  const [seconds, setSeconds] = useState(0);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [text, setText] = useState("");
  const [result, setResult] = useState<Any>(null);
  const [saving, setSaving] = useState(false);
  const started = useRef(0);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (stage !== "answer") return;
    started.current = Date.now();
    const t = setInterval(() => setSeconds(Math.round((Date.now() - started.current) / 1000)), 250);
    return () => clearInterval(t);
  }, [stage]);

  const stop = async () => {
    const secs = Math.max(1, Math.round((Date.now() - started.current) / 1000));
    if (area.current) await (window as Any).Dictate?.settle?.(area.current);
    setSeconds(secs);
    setText(area.current?.value ?? text);
    setStage("check");
  };
  useEffect(() => {
    if (stage !== "answer") return;
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).tagName === "TEXTAREA" || (e.target as HTMLElement).tagName === "INPUT";
      if ((e.key === "Enter" && (e.ctrlKey || e.metaKey)) || (e.key === " " && !typing && (e.target as HTMLElement).tagName !== "BUTTON")) { e.preventDefault(); stop(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });   // eslint-disable-line react-hooks/exhaustive-deps

  const nextPrompt = async () => {
    const r = await call<Next>("/drill/next", "POST", { exclude: [p.id] });
    go("drill/" + r.prompt.id);
  };
  const save = async () => {
    setSaving(true);
    try {
      const res = await call<Any>("/drills", "POST", { prompt_id: p.id, story_id: storyId || null, seconds, checks, text, job_id: p.job_id ?? null });
      if (Date.now() - session.at > 30 * 60 * 1000) session = { n: 0, clean: 0, at: 0 };
      session = { n: session.n + 1, clean: session.clean + (res.drill.clean ? 1 : 0), at: Date.now() };
      setResult(res); setStage("done");
      qc.invalidateQueries({ queryKey: KEY });
    } catch (e) { toast((e as Error).message); } finally { setSaving(false); }
  };

  const ordered = [...next.stories.map((id) => d.stories.find((s) => s.id === id)), ...d.stories.filter((s) => !next.stories.includes(s.id))].filter(Boolean) as Experience["stories"];
  const story = d.stories.find((s) => s.id === storyId);
  const comps = p.competencies.map((c) => d.competencies.find((x) => x.id === c)?.title || c).join(" · ");

  if (stage === "prep") return (
    <>
      <div className="sd-page-intro"><span className="sd-eyebrow">TIMED ANSWER · {comps.toUpperCase()}{p.company ? ` · ${p.company.toUpperCase()}` : ""}</span><h2>“{p.text}”</h2>
        <p>Answer out loud, as you would in the interview. Aim for {fmt(lo)} to {fmt(hi)}.{next.has_answer ? " A model answer is waiting for you afterwards." : ""}</p>
        {p.reason && <p className="sd-muted">{p.reason}</p>}</div>
      <div className="tr-two">
        <section className="sd-panel"><h3>Which story will you tell?</h3>
          {p.kind !== "Story" && <p className="sd-muted">This one is about you rather than a single story, so &quot;no story&quot; is fine.</p>}
          <div className="tr-story-pick">
            {ordered.map((s) => (
              <label key={s.id} className={`tr-pick ${next.stories.includes(s.id) ? "is-suggested" : ""}`}><input type="radio" name="story" checked={storyId === s.id} onChange={() => setStoryId(s.id)} /> <span><b>{s.title}</b></span></label>
            ))}
            <label className="tr-pick"><input type="radio" name="story" checked={!storyId} onChange={() => setStoryId("")} /> <span>No story, improvise</span></label>
          </div>
          <div className="sd-actions"><button type="button" className="button is-primary" autoFocus onClick={() => { setSeconds(0); setStage("answer"); }}>Start the clock</button>
            <button type="button" className="button" onClick={nextPrompt}>Skip this prompt</button></div>
        </section>
        <aside className="tr-aside">
          <section className="sd-panel"><span className="sd-eyebrow">WHAT A STRONG ANSWER SHOWS</span><p>{p.signals}</p></section>
          {story && <section className="sd-panel tr-story-peek"><span className="sd-eyebrow">YOUR NOTES (HIDDEN WHILE YOU ANSWER)</span><h4>{story.title}</h4><p>{story.summary || story.situation}</p></section>}
        </aside>
      </div>
    </>
  );

  if (stage === "answer") {
    const z = seconds < lo ? 0 : seconds <= hi ? 1 : seconds <= d.max_clean_seconds ? 2 : 3;
    return (
      <>
        <div className="sd-page-intro"><span className="sd-eyebrow">ANSWERING</span><h2>“{p.text}”</h2></div>
        <section className="sd-panel tr-answering">
          <div className={`tr-clock ${ZONES[z][1]}`} aria-live="off">{fmt(seconds)}</div><p className="tr-zone" role="status">{ZONES[z][0]}</p>
          <div className="tr-clock-bar"><span style={{ width: `${Math.min(100, (100 * seconds) / d.max_clean_seconds)}%` }} /><i style={{ left: `${(100 * lo) / d.max_clean_seconds}%` }} /><i style={{ left: `${(100 * hi) / d.max_clean_seconds}%` }} /></div>
          <p className="sd-muted tr-bar-key">The marks are {fmt(lo)} and {fmt(hi)}. Past {fmt(d.max_clean_seconds)} an answer is too long to count.</p>
          <p className="sd-muted">Speak your answer. Optionally capture it below for {d.llm ? "coach feedback" : "your own review"}.</p>
          <textarea ref={area} className="textarea tr-transcript" data-dictate rows={6} maxLength={6000} placeholder="Optional: type or dictate what you said" defaultValue={text} />
          <div className="sd-actions"><button type="button" className="button is-primary" onClick={stop}>Stop</button><span className="sd-muted">Space or Ctrl+Enter stops</span></div>
        </section>
      </>
    );
  }

  if (stage === "check") {
    const on = Object.keys(checks).filter((k) => checks[k]);
    const missing = d.checks.filter((c) => c.required && !on.includes(c.key)).map((c) => NEED[c.key] || c.key);
    const more = Math.max(0, d.min_checks - on.length), long = seconds > d.max_clean_seconds, ok = !missing.length && !more && !long;
    return (
      <>
        <div className="sd-page-intro"><span className="sd-eyebrow">SELF-CHECK · {fmt(seconds)} {long ? "· TOO LONG" : seconds > hi ? "· A LITTLE LONG" : seconds < lo ? "· SHORT" : "· GOOD LENGTH"}</span><h2>How did that go?</h2>
          <p>Be honest: this decides when the prompt comes back. A clean answer needs at least five ticks, including role, result and fit, in under {fmt(d.max_clean_seconds)}.</p></div>
        <section className="sd-panel">
          <ul className="tr-checks">{d.checks.map((c) => (
            <li key={c.key}><label><input type="checkbox" checked={!!checks[c.key]} onChange={(e) => setChecks({ ...checks, [c.key]: e.target.checked })} /> <span>{c.text}{c.required && <span className="tr-req"> required</span>}</span></label></li>
          ))}</ul>
          <p className={`tr-verdict ${ok ? "is-ok" : ""}`} role="status" aria-live="polite">{ok ? "This will count as a clean answer." : `Not clean yet: ${[long ? `it ran past ${fmt(d.max_clean_seconds)}` : "", missing.length ? `still to show ${missing.join(", ")}` : "", more && !missing.length ? `tick ${more} more` : ""].filter(Boolean).join("; ")}.`}</p>
          <div className="sd-actions"><button type="button" className="button is-primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save and see the model answer"}</button></div>
        </section>
      </>
    );
  }

  const fb = result?.feedback, model: ModelAnswer | null = result?.model_answer;
  const others = (d.prompts.find((x) => x.id === p.id)?.answers || []).filter((a) => a.company && a.company !== model?.company);
  return (
    <>
      <div className="sd-page-intro"><span className="sd-eyebrow">{result.drill.clean ? "CLEAN ANSWER" : "NOT YET CLEAN"}</span><h2>{result.drill.clean ? "That counts." : "This prompt will come back soon."}</h2>
        <p>{result.drill.clean ? "It returns as it starts to fade." : "Compare with the model answer below, then try again on another day."}</p>
        {session.n > 1 && <p className="tr-session"><b>This sitting: {session.clean} clean of {session.n}.</b></p>}</div>
      {fb ? <section className="sd-panel"><h3>Coach feedback</h3><ul className="sd-rubric">{fb.checks.map((c: Any) => (
        <li key={c.key} className={c.met ? "is-right" : "is-missing"}><span>{c.met ? "✓" : "○"}</span><div><b>{d.checks.find((x) => x.key === c.key)?.text || c.key}</b><p>{c.note}</p></div></li>
      ))}</ul><p><b>Strongest:</b> {fb.strongest}</p><p><b>Change next time:</b> {fb.improve}</p></section>
        : result.message ? <p className="sd-muted">{result.message}</p> : null}
      {model ? <ModelAnswerPanel model={model} d={d} /> : <section className="sd-panel"><h3>No model answer yet</h3><p className="sd-muted">Job Scout writes them from your Notion stories; this question doesn&apos;t have one yet.</p></section>}
      {others.length > 0 && <OtherVersions promptId={p.id} others={others} d={d} />}
      {!model?.follow_ups?.length && <section className="sd-panel"><h3>The interviewer follows up</h3><p className="sd-muted">Answer each out loud in 30 to 60 seconds.</p><ol className="tr-plain">{p.probes.map((x) => <li key={x}>{x}</li>)}</ol></section>}
      <div className="sd-actions"><button type="button" className="button is-primary" onClick={nextPrompt}>Next prompt</button>
        {storyId && <button type="button" className="button" onClick={() => go("story/" + storyId)}>Open the story</button>}
        <button type="button" className="button" onClick={() => go("home")}>Overview</button></div>
    </>
  );
}

function ModelAnswerPanel({ model, d }: { model: ModelAnswer; d: Experience }) {
  const story = d.stories.find((s) => s.id === model.story_id);
  return (
    <section className="sd-panel ex-model">
      <h3>Model answer{model.company ? ` for ${model.company}` : ""}</h3>
      <p className="sd-muted">Built from your Notion notes{story ? `, using “${story.title}”` : ""}. Compare what you covered, not the wording.{model.stale ? " Your notes changed since it was written; Job Scout will refresh it." : ""}</p>
      {model.answer.split(/\n\s*\n/).map((para, i) => <p key={i}>{para}</p>)}
      <details className="sd-model"><summary>The 30-second version</summary><p>{model.short_answer}</p></details>
      {model.follow_ups.length > 0 && <><h4>Likely follow-ups</h4><ol className="tr-plain">{model.follow_ups.map((f) => <li key={f.question}><b>{f.question}</b> <span className="sd-muted">{f.answer}</span></li>)}</ol></>}
      {model.caveats && <p className="ex-caveat"><b>Careful:</b> {model.caveats}</p>}
    </section>
  );
}

function OtherVersions({ promptId, others, d }: { promptId: string; others: { company: string | null; job_id: number | null }[]; d: Experience }) {
  const [shown, setShown] = useState<ModelAnswer | null>(null);
  const toast = useToast();
  const load = async (jobId: number | null) => {
    try { setShown(await call<ModelAnswer>(`/answers/${promptId}${jobId !== null ? `?job_id=${jobId}` : ""}`)); } catch (e) { toast((e as Error).message); }
  };
  return (
    <>
      <div className="sd-actions"><span className="sd-muted">Tailored versions:</span>{others.map((o) => <button key={o.job_id} type="button" className="button is-small" onClick={() => load(o.job_id)}>{o.company}</button>)}</div>
      {shown && <ModelAnswerPanel model={shown} d={d} />}
    </>
  );
}
