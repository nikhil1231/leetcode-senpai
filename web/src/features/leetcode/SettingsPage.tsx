"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useHeading } from "@/lib/heading";
import { TAB_TITLES } from "@/lib/sections";
import { useToast } from "@/lib/toast";
import { Loader, LoadError } from "@/components/ui/Loader";
import { AIModels } from "./AIModels";
import { UsageSettings } from "./UsageSettings";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const MODES = [["mixed", "Mixed"], ["retrieval", "Retrieval"], ["learn", "Learn"], ["interview", "Interview conditions"]];
const DEPTHS = [["balanced", "Balanced"], ["deep", "Deep (fewer, longer)"], ["broad", "Broad (more, shorter)"]];
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function Field({ label, children, htmlFor }: { label: React.ReactNode; children: React.ReactNode; htmlFor?: string }) {
  return <div className="settings-field"><label htmlFor={htmlFor}>{label}</label>{children}</div>;
}
const Sel = ({ value, onChange, options, id }: { value: string | number; onChange: (v: string) => void; options: (string | number)[][]; id?: string }) =>
  <div className="select is-fullwidth"><select id={id} value={value} onChange={(e) => onChange(e.target.value)}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>;

export function SettingsPage() {
  useHeading(...TAB_TITLES.settings);
  const q = useQuery({ queryKey: ["api", "/config"], queryFn: () => api("/config") });
  if (q.isLoading) return <Loader message="Loading settings…" />;
  if (q.error || !q.data) return <LoadError error={q.error} retry={() => q.refetch()} />;
  return <SettingsForm c={q.data} />;
}

const JUMP = ["Senpai", "Voice", "LeetCode account", "AI models", "Scheduling & weighting", "Weekly goals", "Discover thresholds", "Usage", "Data", "Account"];

function SettingsForm({ c }: { c: Any }) {
  const qc = useQueryClient();
  const toast = useToast();
  const refresh = () => qc.invalidateQueries();
  const [s, setS] = useState<Any>({
    target_job: c.target_job || "", senpai_charter: c.senpai_charter || "", senpai_weekly_minutes: c.senpai_weekly_minutes, senpai_session_minutes: c.senpai_session_minutes,
    senpai_mode: c.senpai_mode, senpai_depth: c.senpai_depth, senpai_focus_note: c.senpai_focus_note || "", daily_coach_enabled: !!c.daily_coach_enabled,
    daily_coach_timezone: c.daily_coach_timezone || "UTC", daily_coach_time: c.daily_coach_time || "00:05", senpai_weekly_day: +c.senpai_weekly_day,
    senpai_learning_rate: c.senpai_learning_rate, senpai_max_weekly_shift: c.senpai_max_weekly_shift, senpai_max_focus: c.senpai_max_focus,
    senpai_focus_cooldown_days: c.senpai_focus_cooldown_days, senpai_min_evidence_weeks: c.senpai_min_evidence_weeks,
  });
  const set = (k: string) => (v: unknown) => setS((o: Any) => ({ ...o, [k]: v }));
  const num = (k: string, props: Any = {}) => <input className="input" type="number" value={s[k]} onChange={(e) => set(k)(e.target.value)} {...props} />;
  const [status, setStatus] = useState("");
  const [voice, setVoice] = useState({ tutor: c.voice_tutor || "", feedback: c.voice_feedback || "" });
  const [voiceStatus, setVoiceStatus] = useState("");
  const [sample, setSample] = useState<string | null>(null);
  const defaults = c.voice_defaults || {};
  const [lc, setLc] = useState({ username: c.username || "", session: "", csrf: "" });
  useEffect(() => {   // arriving from a link to a section (the coach pill opens AI models)
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, []);
  const [sched, setSched] = useState<Any>({
    review_limit: c.review_limit, new_limit: c.new_limit, drill_limit: c.drill_limit, drill_min_signal: c.drill_min_signal, weakness_weight: c.weakness_weight,
    breadth_weight: c.breadth_weight, mistake_weight: c.mistake_weight, goal_reviews_per_week: c.goal_reviews_per_week, goal_new_per_week: c.goal_new_per_week,
    discover_min_like_ratio: c.discover_min_like_ratio, discover_min_votes: c.discover_min_votes,
  });
  const sch = (k: string, label: string, step?: string) => <div className="settings-field"><label>{label}</label><input className="input" type="number" step={step} value={sched[k]} onChange={(e) => setSched({ ...sched, [k]: e.target.value })} /></div>;
  const [dataStatus, setDataStatus] = useState<React.ReactNode>("");
  const [busy, setBusy] = useState("");

  const saveSenpai = async () => {
    setBusy("senpai"); setStatus("Saving…");
    try {
      const n = (k: string) => Number(s[k]);
      await api("/config", "POST", {
        ...(c.target_job_source === "job_scout" ? {} : { target_job: s.target_job }),
        daily_coach_enabled: s.daily_coach_enabled, daily_coach_timezone: String(s.daily_coach_timezone).trim(), daily_coach_time: s.daily_coach_time,
        senpai_charter: s.senpai_charter, senpai_weekly_minutes: n("senpai_weekly_minutes"), senpai_session_minutes: n("senpai_session_minutes"), senpai_mode: s.senpai_mode,
        senpai_depth: s.senpai_depth, senpai_focus_note: s.senpai_focus_note, senpai_weekly_day: n("senpai_weekly_day"), senpai_learning_rate: n("senpai_learning_rate"),
        senpai_max_weekly_shift: n("senpai_max_weekly_shift"), senpai_max_focus: n("senpai_max_focus"), senpai_focus_cooldown_days: n("senpai_focus_cooldown_days"),
        senpai_min_evidence_weeks: n("senpai_min_evidence_weeks"),
      });
      setStatus("Senpai saved."); toast("Senpai saved"); refresh();
    } catch (e) { setStatus((e as Error).message); } finally { setBusy(""); }
  };
  const saveVoice = async () => {
    setBusy("voice"); setVoiceStatus("Saving…");
    try {
      const saved = await api("/config", "POST", { voice_tutor: voice.tutor, voice_feedback: voice.feedback });
      setVoice({ tutor: saved.voice_tutor || defaults.tutor || "", feedback: saved.voice_feedback || defaults.feedback || "" });
      setVoiceStatus("Saved. Writing a sample in the new voice…"); setSample("…");
      const r = await api("/voice/sample", "POST", {});
      setSample(r.text); setVoiceStatus(`Saved. Sample from ${r.model}:`);
    } catch (e) { setVoiceStatus((e as Error).message); setSample((x) => (x === "…" ? null : x)); } finally { setBusy(""); }
  };
  const saveAccount = async () => {
    await api("/config", "POST", { username: lc.username });
    if (lc.session.trim() || lc.csrf.trim()) await api("/leetcode-auth", "POST", { session: lc.session.trim(), csrf: lc.csrf.trim() || null });
    toast("Saved"); setLc({ ...lc, session: "", csrf: "" }); refresh();
  };
  const saveSched = async () => {
    try {
      await api("/config", "POST", { ...Object.fromEntries(Object.entries(sched).map(([k, v]) => [k, Number(v)])) });
      toast("Settings saved"); refresh();
    } catch (e) { toast((e as Error).message); }
  };
  const run = async (name: string, path: string, body: unknown, fmt: (r: Any) => string) => {
    setBusy(name); setDataStatus(<><span className="spinner spinner-sm" /> Working…</>);
    try { const r = await api(path, "POST", body); setDataStatus(fmt(r)); refresh(); } catch (e) { setDataStatus((e as Error).message); } finally { setBusy(""); }
  };
  const access = c.auth_mode === "access";

  return (
    <>
      <nav className="settings-jump" aria-label="Settings sections">
        {JUMP.map((j) => <a key={j} href={`#settings-${j}`} onClick={(e) => { e.preventDefault(); document.getElementById(`settings-${j}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>{j}</a>)}
      </nav>
      <div className="section-title" id="settings-Senpai" style={{ scrollMarginTop: 84 }}>Senpai</div>
      <Field label="Career target" htmlFor="cfg-target-job">
        {c.target_job_source === "job_scout" ? (
          <><p className="dc-goal-copy">{c.target_job || ""}</p><p className="help">Synced from Job Scout, which owns your career target. <a href={c.job_scout_settings_url || "#"} target="_blank" rel="noopener">Edit it in Job Scout</a>.</p></>
        ) : (
          <><textarea id="cfg-target-job" className="input" rows={4} maxLength={4000} value={s.target_job} onChange={(e) => set("target_job")(e.target.value)}
            placeholder="Senior backend engineer on a distributed-systems team. Describe the role, seniority, and interview or on-the-job expectations." />
            <p className="help">{c.job_scout_configured ? "Job Scout has no career target yet; set it there and Senpai will sync it. Until then this one is used." : "Job Scout is not connected on this server, so the target is kept here."}</p></>
        )}
      </Field>
      <Field label="Senpai charter" htmlFor="cfg-senpai-charter">
        <textarea id="cfg-senpai-charter" className="input" rows={5} maxLength={3000} value={s.senpai_charter} onChange={(e) => set("senpai_charter")(e.target.value)} />
        <p className="help">How you want your learning planned: what to prioritise and how hard to push. Senpai follows it; what Senpai may change on its own is enforced by the limits below, not by this text. How the tutor <em>talks</em> (tone, phrases to avoid, no em dashes) is under <a href="#settings-Voice" onClick={(e) => { e.preventDefault(); document.getElementById("settings-Voice")?.scrollIntoView({ behavior: "smooth" }); }}>Voice</a>.</p>
      </Field>
      <div className="settings-row">
        <Field label="Learning time / week (min)">{num("senpai_weekly_minutes", { min: 30, max: 3000 })}</Field>
        <Field label="Session length (min)">{num("senpai_session_minutes", { min: 10, max: 240 })}</Field>
        <Field label="Default mode"><Sel value={s.senpai_mode} onChange={set("senpai_mode")} options={MODES} /></Field>
        <Field label="Depth"><Sel value={s.senpai_depth} onChange={set("senpai_depth")} options={DEPTHS} /></Field>
      </div>
      <Field label="Your focus, in your words (optional)"><input className="input" maxLength={1000} value={s.senpai_focus_note} onChange={(e) => set("senpai_focus_note")(e.target.value)} placeholder="e.g. graphs feel shaky; design interviews in three weeks" /></Field>
      <div className="settings-field"><label><input type="checkbox" checked={s.daily_coach_enabled} onChange={(e) => set("daily_coach_enabled")(e.target.checked)} /> Generate daily reviews automatically</label></div>
      <div className="settings-row">
        <Field label="Timezone"><input className="input" value={s.daily_coach_timezone} onChange={(e) => set("daily_coach_timezone")(e.target.value)} placeholder="Europe/London" /></Field>
        <Field label="Daily review time"><input className="input" type="time" value={s.daily_coach_time} required onChange={(e) => set("daily_coach_time")(e.target.value)} /></Field>
        <Field label="Weekly review day"><Sel value={s.senpai_weekly_day} onChange={set("senpai_weekly_day")} options={DAYS.map((d, i) => [i + 1, d])} /></Field>
      </div>
      <details className="settings-field"><summary>Senpai&apos;s limits</summary>
        <p className="help">What Senpai may change without asking. Anything beyond these, removing protected objectives, or more time, waits for your approval.</p>
        <div className="settings-row">
          <Field label="Learning rate">{num("senpai_learning_rate", { step: 0.05, min: 0, max: 1 })}</Field>
          <Field label="Max weekly shift">{num("senpai_max_weekly_shift", { step: 0.01, min: 0, max: 0.5 })}</Field>
          <Field label="Max focus">{num("senpai_max_focus", { min: 1, max: 6 })}</Field>
          <Field label="Focus cooldown (days)">{num("senpai_focus_cooldown_days", { min: 0, max: 60 })}</Field>
          <Field label="Weeks of evidence for a new priority">{num("senpai_min_evidence_weeks", { min: 1, max: 8 })}</Field>
        </div></details>
      <div className="buttons"><button className="button is-primary" type="button" disabled={busy === "senpai"} onClick={saveSenpai}>Save Senpai</button></div>
      <p className="help" role="status" aria-live="polite">{status}</p>

      <div className="section-title" id="settings-Voice" style={{ scrollMarginTop: 84 }}>Voice</div>
      <p className="help">How the tutor and every bit of feedback sound. Saved here, it&apos;s used from the next message on. Clear a box to go back to the built-in voice.</p>
      <Field label="In conversation (the tutor)"><textarea className="input" rows={7} maxLength={3000} value={voice.tutor} onChange={(e) => setVoice({ ...voice, tutor: e.target.value })} /></Field>
      <Field label="In feedback (graded answers, Telegram, reports)"><textarea className="input" rows={5} maxLength={3000} value={voice.feedback} onChange={(e) => setVoice({ ...voice, feedback: e.target.value })} /></Field>
      <div className="buttons"><button className="button is-primary" type="button" disabled={busy === "voice"} onClick={saveVoice}>Update voice</button>
        <button className="button is-ghost" type="button" onClick={() => { setVoice({ tutor: defaults.tutor || "", feedback: defaults.feedback || "" }); setVoiceStatus("Built-in voice loaded; Update voice to use it."); }}>Built-in voice</button></div>
      <p className="help" role="status" aria-live="polite">{voiceStatus}</p>
      {sample !== null && <div className="voice-sample"><p className="voice-sample-prompt"><strong>Sample:</strong> {c.voice_sample_prompt || ""}</p><div className="voice-sample-text">{sample}</div></div>}

      <div className="section-title" id="settings-LeetCode account" style={{ scrollMarginTop: 84 }}>LeetCode account</div>
      <Field label="Username"><input className="input" value={lc.username} onChange={(e) => setLc({ ...lc, username: e.target.value })} /></Field>
      <Field label={`LEETCODE_SESSION cookie ${c.leetcode_session_set ? "✅ set (all devices)" : "(not set)"}`}>
        <input className="input" type="password" value={lc.session} onChange={(e) => setLc({ ...lc, session: e.target.value })} placeholder={c.leetcode_session_set ? "••• leave blank to keep" : "paste cookie value"} />
        <div className="help">Saved to your account in Firestore and shared by every device; the last save wins. Unlocks % beaten, code, wrong-attempt counts, and Discover.</div></Field>
      <Field label="csrftoken cookie"><input className="input" type="password" value={lc.csrf} onChange={(e) => setLc({ ...lc, csrf: e.target.value })} placeholder={c.leetcode_csrf_set ? "••• leave blank to keep" : "paste csrftoken"} /></Field>
      <div className="buttons"><button className="button is-primary" onClick={saveAccount}>Save</button>
        <button className="button is-ghost" onClick={async () => { await api("/leetcode-auth", "DELETE"); toast("Cookie cleared"); refresh(); }}>Clear cookie</button></div>

      <div className="section-title" id="settings-AI models" style={{ scrollMarginTop: 84 }}>AI models</div>
      <AIModels />
      <p className="help">The OpenRouter key stays on the server in OPENROUTER_API_KEY. Current status: {c.llm_enabled ? "enabled" : "disabled"}.</p>

      <div className="section-title" id="settings-Scheduling & weighting" style={{ scrollMarginTop: 84 }}>Scheduling &amp; weighting</div>
      <div className="settings-row">{sch("review_limit", "Reviews / day")}{sch("new_limit", "New / day")}{sch("drill_limit", "Drills / day")}</div>
      <div className="settings-row">{sch("weakness_weight", "Weakness weight", "0.1")}{sch("breadth_weight", "Breadth weight", "0.1")}{sch("mistake_weight", "Mistake weight", "0.1")}{sch("drill_min_signal", "Min drill signal", "0.01")}</div>
      <div className="section-title" id="settings-Weekly goals" style={{ scrollMarginTop: 84 }}>Weekly goals</div>
      <div className="settings-row">{sch("goal_reviews_per_week", "Reviews / week")}{sch("goal_new_per_week", "New / week")}</div>
      <div className="section-title" id="settings-Discover thresholds" style={{ scrollMarginTop: 84 }}>Discover thresholds</div>
      <div className="settings-row">{sch("discover_min_like_ratio", "Min like-ratio", "0.01")}{sch("discover_min_votes", "Min votes")}</div>
      <button className="button is-primary" onClick={saveSched}>Save settings</button>

      <UsageSettings />

      <div className="section-title" id="settings-Data" style={{ scrollMarginTop: 84 }}>Data</div>
      <div className="buttons">
        <button className="button is-ghost" disabled={!!busy} onClick={() => run("backfill", "/import/history", { limit: 20 }, (r) => (r.error ? "Error: " + r.error : `Added ${r.added} past solves (scanned ${r.scanned}).`))}>Backfill recent history</button>
        <button className="button is-ghost" disabled={!!busy} onClick={() => run("sweep", "/enrich/sweep", { limit: 20 }, (r) => (r.llm ? `Enriched ${r.enriched}, ${r.remaining} remaining.` : "Coach not enabled."))}>Run coach enrichment now</button>
      </div>
      <div className="help" id="settings-status">{dataStatus}</div>

      <div className="section-title" id="settings-Account" style={{ scrollMarginTop: 84 }}>Account</div>
      {access ? <><p className="help">Signed in: Cloudflare Access</p><div className="buttons"><a className="button is-ghost" href="/cdn-cgi/access/logout">Sign out</a></div></>
        : <p className="help">Running in local mode — there is no session to sign out of.</p>}
    </>
  );
}
