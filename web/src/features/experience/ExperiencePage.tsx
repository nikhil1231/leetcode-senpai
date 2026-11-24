"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { SectionHome } from "@/components/SectionHome";
import { LoadError, Loader } from "@/components/ui/Loader";
import { useHeading } from "@/lib/heading";
import { mdToHtml } from "@/lib/md";
import { useToast } from "@/lib/toast";
import { DivePage, DivesPage } from "./Dives";
import { DrillPage } from "./Drill";
import { call, inDays, KEY, STATUS_LABEL, useExperience, useGo, when, type Experience, type Story } from "./data";

// Experience: your stories (from Notion, via Job Scout), timed behavioural answers with model answers to compare
// against, and technical deep dives. Views: home, stories, story/<id>, drill[/<prompt>], dives, dive/<id>, mistakes.
const TITLES: Record<string, string> = { home: "Home", stories: "Story bank", story: "Story", drill: "Timed answers", dives: "Deep dives", dive: "Deep dive", mistakes: "Mistakes book" };

export function ExperiencePage({ view, arg }: { view: string; arg: string | null }) {
  useHeading(TITLES[view] || "Experience", "Experience");
  const q = useExperience();
  if (q.error) return <LoadError error={q.error} retry={() => q.refetch()} />;
  if (!q.data) return <Loader />;
  const d = q.data;
  if (view === "stories") return <StoriesPage d={d} />;
  if (view === "story" && arg) return <StoryPage d={d} id={arg} />;
  if (view === "drill") return <DrillPage key={arg || "next"} d={d} promptId={arg} />;
  if (view === "dives") return <DivesPage d={d} />;
  if (view === "dive" && arg) return <DivePage key={arg} d={d} id={arg} />;
  if (view === "mistakes") return <MistakesPage d={d} />;
  return <Home d={d} />;
}

const Chips = ({ ids, d }: { ids: string[]; d: Experience }) => (
  <>{ids.map((id) => <span key={id} className="tr-tag">{d.competencies.find((c) => c.id === id)?.title || id}</span>)}</>
);

function Home({ d }: { d: Experience }) {
  const go = useGo();
  const f = d.focus, gaps = d.coverage.filter((c) => !c.stories.length);
  const nextP = d.prompts.find((p) => p.id === d.next_prompt);
  const top = f.active ? f.ranked[0] : null;
  const dive = d.packs.flatMap((p) => p.questions.map((q) => ({ p, q }))).find((x) => x.q.status !== "solid" && x.q.status !== "learning");
  const next = !d.stories.length
    ? { kicker: "Start here", title: "Add your first story in Notion", why: <>Stories live in Notion (Interviews → Behavioural → Stories) so Job Scout can use them too. Once one is there, it shows here within a few hours.</>,
        button: <a className="button is-primary" href={d.links.notion_stories} target="_blank" rel="noreferrer">Open Stories in Notion</a> }
    : top
      ? { kicker: "For your next interviews", title: top.text, why: <>{top.for.length ? <>Counts for <b>{top.for.join(" and ")}</b>. </> : null}Answer it out loud against the clock, then compare with the model answer.</>,
          button: <button type="button" className="button is-primary" onClick={() => go("drill/" + top.id)}>Answer it now</button> }
      : { kicker: "Practise out loud", title: nextP?.text || "A timed answer", why: <>A timed answer, then a STAR self-check and the model answer to compare with. Aim for 1:30 to 3:00.</>,
          button: <button type="button" className="button is-primary" onClick={() => go("drill")}>Start a timed answer</button> };
  const alts = [
    { title: `Story bank · ${d.stories.length} stor${d.stories.length === 1 ? "y" : "ies"}`, why: gaps.length ? `${gaps.length} competenc${gaps.length === 1 ? "y has" : "ies have"} no story yet.` : "Every competency has a story.", onClick: () => go("stories") },
    dive ? { title: "Deep dive: " + dive.q.prompt.slice(0, 70), why: `Next in ${dive.p.title}.`, onClick: () => go("dive/" + dive.q.id) }
      : { title: "Deep dives", why: "Every deep dive is held. They come back as they fade.", onClick: () => go("dives") },
  ];
  return (
    <SectionHome section="experience" next={next} alts={alts} extra={f.active ? <ThisWeek d={d} /> : undefined}
      stats={[["Stories", d.stories.length], ["Uncovered", gaps.length, gaps.length > 0]]}
      below={<><OutOfStep d={d} /><Coverage d={d} /><Recent d={d} /></>} />
  );
}

function ThisWeek({ d }: { d: Experience }) {
  const go = useGo();
  const f = d.focus, story = (id: string) => d.stories.find((s) => s.id === id);
  return (
    <section className="sd-panel ex-week">
      <span className="sd-eyebrow">YOUR APPLICATIONS · WHAT TO PRACTISE</span>
      <ul className="ex-apps">
        {f.applications.map((a) => (
          <li key={a.job_id}><b>{a.company}</b> <span className="sd-muted">{a.round_label.toLowerCase()} {inDays(a.days)}</span>
            {!a.has_pack && <a className="tr-link ex-pack" href={d.links.job.replace("{job_id}", String(a.job_id))} target="_blank" rel="noreferrer">make a role pack</a>}</li>
        ))}
      </ul>
      {f.shared_themes.length > 0 && <p className="sd-muted">Shared across them: {f.shared_themes.map((t) => <span key={t} className="tr-tag">{t}</span>)}</p>}
      {f.stories.length > 0 && <p><b>Stories to rehearse:</b> {f.stories.map((id, i) => <span key={id}>{i ? ", " : ""}<button type="button" className="tr-link" onClick={() => go("story/" + id)}>{story(id)?.title || id}</button></span>)}</p>}
      <ol className="ex-ranked">
        {f.ranked.slice(0, 5).map((r) => (
          <li key={r.id}><button type="button" className="tr-link" onClick={() => go("drill/" + r.id)}>{r.text}</button>
            {r.for.length > 0 && <small className="sd-muted"> · {r.for.join(", ")}</small>}</li>
        ))}
      </ol>
      <p className="sd-muted">Sooner rounds count for more. Once a round has passed, that application only counts for what comes next.</p>
    </section>
  );
}

function OutOfStep({ d }: { d: Experience }) {
  const toast = useToast();
  const [sent, setSent] = useState<Record<string, boolean>>({});
  if (!d.drift.length) return null;
  const suggest = async (topic: string, state: string) => {
    try {
      await call("/tracker-proposal", "POST", { topic, state, evidence: `Deep-dive results in Senpai suggest ${state}.` });
      setSent((s) => ({ ...s, [topic]: true }));
      toast("Sent to Job Scout for your approval");
    } catch (e) { toast((e as Error).message); }
  };
  return (
    <section className="sd-panel">
      <h3>Out of step</h3>
      <p className="sd-muted">Notion holds your stories and questions, Job Scout writes the answers, and Senpai tracks practice. This is where they disagree.</p>
      <ul className="tr-plain">
        {d.drift.map((x, i) => (
          <li key={i}>{x.text} <span className="sd-muted">{x.fix}</span>
            {x.kind === "tracker" && x.topic && x.state && (sent[x.topic]
              ? <span className="sd-muted"> Sent.</span>
              : <> <button type="button" className="button is-small" onClick={() => suggest(x.topic!, x.state!)}>Suggest {x.state}</button></>)}</li>
        ))}
      </ul>
      <p className="sd-muted"><a href={d.links.review} target="_blank" rel="noreferrer">Review suggestions in Job Scout</a>{d.notion.fetched_at ? ` · Notion material synced ${when(d.notion.fetched_at)}` : ""}</p>
    </section>
  );
}

function Coverage({ d }: { d: Experience }) {
  const rows = [...d.coverage].sort((a, b) => Number(!!a.stories.length) - Number(!!b.stories.length) || a.held / (a.prompts || 1) - b.held / (b.prompts || 1));
  return (
    <section className="tr-cat">
      <div className="tr-cat-head"><h3>Competency coverage</h3><p className="sd-muted">Every behavioural question tests one or two of these. A gap is a question you would have to improvise. Gaps first.</p></div>
      <ul className="tr-comps">
        {rows.map((c) => (
          <li key={c.id} className={`tr-comp-tile ${c.stories.length ? "" : "is-gap"}`}>
            <div className="tr-comp-top"><b>{c.title}</b><span className={`tr-tag ${c.stories.length ? "" : "is-warn"}`}>{c.stories.length ? `${c.stories.length} stor${c.stories.length === 1 ? "y" : "ies"}` : "no story"}</span></div>
            <p className="sd-muted">{c.blurb}</p>
            <div className="tr-comp-foot"><span className="tr-comp-held" role="img" aria-label={`${c.held} of ${c.prompts} prompts held`}><i style={{ width: `${c.prompts ? (100 * c.held) / c.prompts : 0}%` }} /></span><small>{c.held}/{c.prompts} prompts held</small></div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Recent({ d }: { d: Experience }) {
  if (!d.recent_drills.length) return null;
  const text = (id: string) => d.prompts.find((p) => p.id === id)?.text || "A prompt";
  return (
    <section className="sd-panel tr-recent"><h3>Recent timed answers</h3>
      <ul>{d.recent_drills.slice(0, 5).map((r) => (
        <li key={r.id}><span className={`tr-dot is-${r.clean ? "solid" : "shaky"}`} role="img" aria-label={r.clean ? "Clean" : "Not clean"} /><span>{text(r.prompt_id).slice(0, 70)}</span><em>{Math.floor(r.seconds / 60)}:{String(r.seconds % 60).padStart(2, "0")}</em><small>{when(r.at)}</small></li>
      ))}</ul>
    </section>
  );
}

function StoriesPage({ d }: { d: Experience }) {
  const go = useGo();
  return (
    <>
      <div className="sd-page-intro"><span className="sd-eyebrow">STORY BANK · {d.stories.length}</span><h2>Your stories</h2>
        <p>They live in Notion, so Job Scout can use them for role packs and model answers. Edit them there; this page shows the latest copy and how much you have practised each.</p></div>
      <div className="sd-actions"><a className="button is-primary" href={d.links.notion_stories} target="_blank" rel="noreferrer">Open Stories in Notion</a>
        <a className="button" href={d.links.notion_questions} target="_blank" rel="noreferrer">Question bank</a></div>
      {d.stories.length ? (
        <div className="tr-story-grid">
          {d.stories.map((s) => (
            <button key={s.id} type="button" className="sd-lesson-card tr-story-card" onClick={() => go("story/" + s.id)}>
              <span className="sd-eyebrow">{s.drills ? `PRACTISED ${s.drills}× · LAST ${when(s.last_drilled).toUpperCase()}` : "NOT PRACTISED YET"}</span>
              <h3>{s.title}</h3>
              <div><Chips ids={s.competencies} d={d} />{s.status !== "Ready" && <span className="tr-tag is-warn">{s.source === "local" ? "only in Senpai" : s.status}</span>}</div>
              <span><span>{(s.summary || s.result || "").slice(0, 160)}</span><span>Open →</span></span>
            </button>
          ))}
        </div>
      ) : <section className="sd-panel"><h3>No stories yet</h3><p className="sd-muted">Add one in Notion; it shows here after the next Job Scout sync.</p></section>}
      <Questions d={d} />
    </>
  );
}

function Questions({ d }: { d: Experience }) {
  const go = useGo();
  return (
    <section className="sd-panel">
      <h3>The question bank</h3>
      <p className="sd-muted">From Notion, plus the questions your role packs added. A marked question has a model answer to compare with after you try it.</p>
      <ul className="tr-list">
        {d.prompts.map((p) => (
          <li key={p.id} className="tr-dive-row"><span className={`tr-dot is-${p.status}`} role="img" aria-label={STATUS_LABEL[p.status]} />
            <button type="button" className="tr-link" onClick={() => go("drill/" + p.id)}>{p.text}</button>
            <small className="sd-muted tr-st">{p.company ? p.company + " · " : ""}{p.answers.length ? "model answer" : ""}</small></li>
        ))}
      </ul>
    </section>
  );
}

function StoryPage({ d, id }: { d: Experience; id: string }) {
  const go = useGo();
  const toast = useToast();
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const s = d.stories.find((x) => x.id === id);
  if (!s) return <section className="sd-panel"><h3>Story not found</h3><p className="sd-muted">It may have been renamed or removed in Notion.</p></section>;
  const practise = d.prompts.find((p) => p.competencies.some((c) => s.competencies.includes(c)) && p.kind === "Story");
  const send = async () => {
    setBusy(true);
    try {
      await call("/notion-note", "POST", { story_id: s.id, text: note.trim() });
      setNote(""); toast("Sent to Job Scout; approve it there to add it to the Notion page");
      qc.invalidateQueries({ queryKey: KEY });
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <>
      <div className="sd-breadcrumb"><button type="button" className="button" onClick={() => go("stories")}>← Story bank</button></div>
      <div className="sd-page-intro"><span className="sd-eyebrow">{[s.employer, s.period].filter(Boolean).join(" · ").toUpperCase() || "STORY"}</span><h2>{s.title}</h2>
        <p><Chips ids={s.competencies} d={d} />{s.status !== "Ready" && <span className="tr-tag is-warn">{s.source === "local" ? "only in Senpai" : s.status}</span>}</p></div>
      <div className="tr-two">
        <section className="sd-panel">
          {s.summary && <p><b>{s.summary}</b></p>}
          {s.source === "notion"
            ? <div className="ex-story-body" dangerouslySetInnerHTML={{ __html: mdToHtml(s.body || "") }} />
            : (["situation", "task", "action", "result", "reflection"] as const).filter((k) => s[k]).map((k) => <p key={k}><b>{k[0].toUpperCase() + k.slice(1)}:</b> {s[k]}</p>)}
        </section>
        <aside className="tr-aside">
          <section className="sd-panel"><span className="sd-eyebrow">PRACTISE</span>
            <p className="sd-muted">{s.drills ? `Told ${s.drills} time${s.drills === 1 ? "" : "s"}, last on ${when(s.last_drilled)}.` : "Not told against the clock yet."}</p>
            <div className="sd-actions">{practise && <button type="button" className="button is-primary" onClick={() => go("drill/" + practise.id)}>Answer a question with it</button>}
              {s.url && <a className="button" href={s.url} target="_blank" rel="noreferrer">Edit in Notion</a>}</div></section>
          {s.source === "notion" ? (
            <section className="sd-panel"><span className="sd-eyebrow">REMEMBERED SOMETHING?</span>
              <p className="sd-muted">A detail, a number or a correction. It goes to Job Scout&apos;s review queue, and once you approve it, it is added to this story&apos;s Notion page.</p>
              <textarea className="textarea" data-dictate rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: the rollout covered the Mongo estate first." />
              <div className="sd-actions"><button type="button" className="button" disabled={busy || note.trim().length < 10} onClick={send}>Suggest for Notion</button></div></section>
          ) : <section className="sd-panel"><span className="sd-eyebrow">ONLY IN SENPAI</span><p className="sd-muted">Written here before stories moved to Notion. Copy it into the Notion Stories database so Job Scout can use it.</p></section>}
        </aside>
      </div>
    </>
  );
}

function MistakesPage({ d }: { d: Experience }) {
  const go = useGo();
  const { fix, confirm } = d.mistakes;
  const row = (v: { id: string; kind: string; label: string; topic_title?: string }) => (
    <li key={v.id} className="tr-mistake"><div><span className="sd-eyebrow">{v.topic_title} · {v.kind}</span><p>{v.label}</p></div>
      <button type="button" className="button" onClick={() => go(v.kind === "prompt" ? "drill/" + v.id.slice(7) : "dive/" + v.id.slice(5))}>{v.kind === "prompt" ? "Answer again" : "Try again"}</button></li>
  );
  return (
    <>
      <div className="sd-page-intro"><span className="sd-eyebrow">MISTAKES BOOK</span><h2>What to practise again</h2><p>Prompts you answered poorly and deep dives you missed. Clear them on a later day.</p></div>
      {!fix.length && !confirm.length && <section className="sd-panel"><h3>Nothing to fix</h3><p className="sd-muted">Anything you get wrong lands here, and stays until you get it right on a later day.</p></section>}
      {fix.length > 0 && <section className="sd-panel"><h3>To fix <span className="tr-count">{fix.length}</span></h3><p className="sd-muted">Your latest answer was wrong.</p><ul className="tr-list">{fix.map(row)}</ul></section>}
      {confirm.length > 0 && <section className="sd-panel"><h3>To confirm <span className="tr-count">{confirm.length}</span></h3><p className="sd-muted">Fixed on the day you missed it. Get it right again on a later day to clear it.</p><ul className="tr-list">{confirm.map(row)}</ul></section>}
    </>
  );
}

export type { Story };
