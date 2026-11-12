"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useRoute } from "@/lib/nav";
import { useToast } from "@/lib/toast";
import { Modal } from "@/components/ui/Modal";

// Study prompt: copy a topic and what you hold of it, to paste into a voice chatbot's live chat. The text comes from
// /api/study-prompt; no model writes it. The import button takes the bot's debrief back: a preview of what it would
// record, then one click to save it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
export interface StudyScope { section: string; category?: string; topic?: string; family?: string; lesson?: string }
const KB = ["system-design", "fundamentals", "ai"];
const ICON = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12Z" /><path d="M9 10.5v3M12 9v6M15 10.5v3" /></svg>;

export async function copyStudyPrompt(scope: StudyScope, toast: (m: string) => void) {
  let session: unknown = null;
  const text = api("/study-prompt", "POST", scope).then((r) => { session = r.session; return r.prompt as string; });
  try {
    try {
      // Safari keeps the click's permission only if the write starts now, with the text to follow.
      if (!window.ClipboardItem || !navigator.clipboard?.write) throw new Error("no ClipboardItem");
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": text.then((t) => new Blob([t], { type: "text/plain" })) })]);
    } catch {
      await navigator.clipboard.writeText(await text);
    }
    toast(session ? 'Study prompt copied. Paste it into your chatbot and start a live chat. Afterwards, type "debrief" and bring the reply back with the import button.'
      : "Study prompt copied. Paste it into your chatbot, then start a live chat.");
  } catch (e) {
    const err = (await text.then(() => e, (x) => x)) as { status?: number; message: string };
    if (err.message !== "auth") toast(err.status === 404 ? "Nothing to study here yet." : "Could not copy the study prompt: " + err.message);
  }
}

export function useCopyStudyPrompt() {
  const toast = useToast();
  return (scope: StudyScope) => copyStudyPrompt(scope, toast);
}

export function StudyPromptButton({ scope, label }: { scope: StudyScope; label: string }) {
  const copy = useCopyStudyPrompt();
  const text = `Copy a voice-chat study prompt${label ? " for " + label : ""}`;
  return (
    <button type="button" className="study-copy" aria-label={text} title={text}
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); copy(scope); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") e.stopPropagation(); }}>{ICON}</button>
  );
}

// The page's own topic, from where you are: a lesson, a course section, or the LeetCode map.
export function usePageScope(): StudyScope | null {
  const { section, segments } = useRoute();
  if (KB.includes(section)) return segments[0] === "lesson" && segments[1] ? { section, lesson: segments[1] } : { section };
  if (section === "leetcode" && ["topics", "insights"].includes(segments[0])) return { section: "leetcode" };
  return null;
}

export function StudyTopButtons() {
  const scope = usePageScope();
  const copy = useCopyStudyPrompt();
  const [open, setOpen] = useState(false);
  if (!scope) return null;
  return (
    <>
      <button id="btn-study-import" className="study-copy is-top study-top" type="button" aria-label="Import a study debrief"
        title="Import a study debrief: paste what the chatbot said you got right and wrong" onClick={() => setOpen(true)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5" /><path d="M4 17v3h16v-3" /></svg>
      </button>
      <button id="btn-study-prompt" className="study-copy is-top study-top" type="button" aria-label="Copy a voice-chat study prompt for this page"
        title="Copy a study prompt for this topic: paste it into a chatbot's live voice chat" onClick={() => copy(scope)}>{ICON}</button>
      {open && <ImportDialog onClose={() => setOpen(false)} />}
    </>
  );
}

const MARK: Record<string, string> = { right: "✓", partial: "~", wrong: "✗" };

function ImportDialog({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<Any>(null);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const t = text.trim();
    if (!t) { setPreview(null); setError(""); return; }
    timer.current = setTimeout(async () => {
      try {
        const p = await api("/study-prompt/debrief", "POST", { text: t });
        setPreview(p); setError("");
        if (!p.changes.length && !p.imported_at) setError("No graded P-lines found under the SENPAI-DEBRIEF line.");
      } catch (e) { if ((e as Error).message !== "auth") { setError((e as Error).message); setPreview(null); } }
    }, 350);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [text]);

  const done = preview && preview.imported_at && !preview.applied;
  const save = async () => {
    try {
      const p = await api("/study-prompt/debrief", "POST", { text: text.trim(), apply: true });
      if (!p.applied) { setPreview(p); return; }
      onClose();
      toast(`Saved: ${p.counts.right} right, ${p.counts.partial} partial, ${p.counts.wrong} wrong.`);
      window.dispatchEvent(new CustomEvent("study-imported", { detail: p }));
    } catch (e) { if ((e as Error).message !== "auth") setError((e as Error).message); }
  };
  return (
    <Modal open onClose={onClose} cardClassName="study-import-card" title="Import a study session" subtitle={'After the voice chat, type "debrief" to the chatbot and paste its whole reply here.'}>
      <textarea id="study-import-text" className="input textarea" spellCheck={false} placeholder="SENPAI-DEBRIEF session=…" value={text} autoFocus onChange={(e) => setText(e.target.value)} />
      {error && <p id="study-import-error" className="quickstart-error">{error}</p>}
      <div id="study-import-preview" className="study-preview">
        {preview && (
          <>
            <p className="study-preview-head">{done ? `This session was already imported on ${new Date(preview.imported_at * 1000).toLocaleString()}. Nothing new to save.`
              : `${preview.counts.right} right, ${preview.counts.partial} partial, ${preview.counts.wrong} wrong${preview.resolves ? ` · closes ${preview.resolves} old mistake${preview.resolves === 1 ? "" : "s"}` : ""}. Right answers count as held but unconfirmed until a Quickfire check; misses count in full.`}</p>
            {preview.changes.map((ch: Any, i: number) => (
              <div className="study-change" key={i}><span className={`study-mark is-${ch.verdict}`} aria-label={ch.verdict}>{MARK[ch.verdict]}</span>
                <div><b>{ch.ref}</b> {ch.claim}<span className="small">{ch.lesson_title} · {ch.depth}{ch.note ? ` · “${ch.note}”` : ""}{ch.opens ? (ch.opens.kind === "gap" ? " · opens a gap" : " · opens a misconception") : ch.resolves ? " · closes an old mistake" : ""}</span></div></div>))}
            {preview.notes.length > 0 && <p className="small">Notes kept: {preview.notes.join(" · ")}</p>}
            {preview.skipped.length > 0 && <p className="small">Skipped {preview.skipped.length} line{preview.skipped.length === 1 ? "" : "s"} it could not read: {preview.skipped.slice(0, 4).join(" · ")}</p>}
          </>
        )}
      </div>
      <div className="overlay-actions">
        <button className="button is-ghost" type="button" onClick={onClose}>Cancel</button>
        <button id="study-import-save" className="button is-primary" type="button" disabled={!preview || !!done || !preview.changes.length} onClick={save}>Save to my progress</button>
      </div>
    </Modal>
  );
}
