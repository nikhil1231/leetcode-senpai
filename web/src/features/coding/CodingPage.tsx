"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useHeading } from "@/lib/heading";
import { useToast } from "@/lib/toast";
import { Loader, LoadError } from "@/components/ui/Loader";
import { Workspace } from "./Workspace";
import { CATEGORY_BLURBS, CATEGORY_LABELS, type Attempt, type Exercise, type Mode, type Overview } from "./types";

interface Session { attempt: Attempt; exercise: Exercise }
const TABS: [Mode, string, string][] = [["reading", "Code Reading", "Understand, trace and debug a repository you have never seen. No AI helper."], ["assisted", "AI-Assisted", "Solve a task with an AI partner that is usually right, and sometimes isn't."]];
const KEY = "senpai:coding-mode";
const ago = (t: number) => { const d = Date.now() / 1000 - t; return d < 3600 ? `${Math.max(1, Math.round(d / 60))} min ago` : d < 86400 ? `${Math.round(d / 3600)} h ago` : `${Math.round(d / 86400)} d ago`; };

export function CodingPage() {
  useHeading("Coding practice", "Read, debug and repair code you have never seen");
  const qc = useQueryClient();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>("reading");
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => { const s = localStorage.getItem(KEY); if (s === "assisted" || s === "reading") setMode(s); }, []);
  const ov = useQuery<Overview>({ queryKey: ["coding", "overview"], queryFn: () => api("/coding/overview"), refetchInterval: (q) => (q.state.data && Object.values(q.state.data.modes).some((m) => m.generating) ? 8000 : 60_000) });

  const start = useMutation({
    mutationFn: (b: { category?: string; new?: boolean }) => api<Session>(`/coding/${mode}/start`, "POST", b),
    onSuccess: (s) => { setSession(s); qc.invalidateQueries({ queryKey: ["coding"] }); },
    onError: (e) => toast((e as Error).message),
  });
  const resume = async (id: string) => { try { setSession(await api<Session>(`/coding/attempts/${id}`)); } catch (e) { toast((e as Error).message); } };

  if (session) {
    return (
      <section className="tab cw-tab" id="tab-coding">
        <Workspace key={session.attempt.id} exercise={session.exercise} attempt={session.attempt}
          onAttempt={(a) => setSession((s) => (s ? { ...s, attempt: a } : s))}
          onNext={(category) => start.mutate({ category, new: true })} />
      </section>
    );
  }
  if (ov.isLoading) return <section className="tab"><Loader /></section>;
  if (ov.error || !ov.data) return <section className="tab"><LoadError error={ov.error} retry={() => ov.refetch()} /></section>;
  const m = ov.data.modes[mode];
  const info = TABS.find((t) => t[0] === mode)!;
  return (
    <section className="tab cw-home" id="tab-coding">
      <div className="cw-tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={mode === id} className={`cw-tabbtn ${mode === id ? "is-on" : ""}`} type="button"
            onClick={() => { setMode(id); localStorage.setItem(KEY, id); }}>{label}</button>
        ))}
      </div>
      <p className="help">{info[2]}</p>
      <div className="cw-card">
        <div className="cw-card-main">
          <div>
            {m.overreliance && <p className="cw-flaw is-missed">Recently you took a flawed suggestion without catching it. Slow down on the next one: read the patch, and run the tests before you trust it.</p>}
            <div className="cw-kicker">Level {m.level} of 5 · {m.attempts} done{m.recent_score != null ? ` · recent average ${m.recent_score}` : ""}</div>
            <h2>{m.open ? "You have an exercise open" : "A fresh repository, ready now"}</h2>
            <p className="cw-note">{ov.data.model ? (m.ready >= m.target ? `${m.ready} new ones are checked and waiting.` : m.generating ? `Preparing more in the background (${m.ready} ready).` : `${m.ready} ready.`) : "No model is configured, so you get the hand-written exercises."}{m.error ? ` The last attempt to make one failed: ${m.error}` : ""}</p>
          </div>
          <div className="cw-card-go">
            {m.open && <button className="button is-primary" type="button" onClick={() => resume(m.open!)}>Continue</button>}
            <button className={`button ${m.open ? "" : "is-primary"}`} type="button" disabled={start.isPending} onClick={() => start.mutate({ new: !!m.open })}>{start.isPending ? "Opening…" : m.open ? "Start another" : "Start"}</button>
          </div>
        </div>
        {(
          <div className="cw-cats">
            {(mode === "reading" ? ["comprehension", "localisation", "repair"] : ["feature", "bugfix"]).map((c) => (
              <button key={c} type="button" className="cw-cat" disabled={start.isPending} onClick={() => start.mutate({ category: c, new: !!m.open })}>
                <b>{CATEGORY_LABELS[c]}</b><span>{CATEGORY_BLURBS[c]}</span>
                <em>{m.by_category[c] == null ? "not tried" : `average ${m.by_category[c]}`}</em>
              </button>
            ))}
          </div>
        )}
      </div>
      <h3 className="section-title">Recent</h3>
      {ov.data.recent.filter((r) => r.mode === mode).length === 0 ? <p className="empty">Nothing yet. Your first exercise takes about ten minutes.</p> : (
        <ul className="cw-recent">
          {ov.data.recent.filter((r) => r.mode === mode).map((r) => (
            <li key={r.id}><button type="button" onClick={() => resume(r.id)}><span>{r.title}</span><span className="cw-note">{CATEGORY_LABELS[r.category]} · level {r.difficulty}</span>
              <b>{r.score ?? "–"}</b><span className="cw-note">{ago(r.submitted_at)}</span></button></li>
          ))}
        </ul>
      )}
    </section>
  );
}
