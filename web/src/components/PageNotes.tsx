"use client";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, streamApi } from "@/lib/api";
import { Markdown, StreamingMarkdown } from "@/components/chat/Chat";
import { useHeadingValue } from "@/lib/heading";
import { useOverview } from "@/lib/queries";
import { anchorOf, flatten, rangeOf, type Anchor } from "@/lib/page-anchor";

// Page notes: highlight text, ask the tutor about it in a small box beside it, and find the conversation there again
// next time. Markers are drawn over the page (the CSS Custom Highlight API plus fixed buttons), never inserted into it,
// so React and the legacy modules keep their DOM. Saved by server/page_notes.py.
type Turn = { role: "me" | "coach"; text: string };
type Context = { passage: string; section: string; headings: string[]; outline: string[] };
type Note = { id: string; path: string; quote: string; anchor: Anchor; turns: Turn[] };
type Draft = { range: Range; quote: string; anchor: Anchor; context: Context };
type Open = { id: string } | { draft: Draft };

const SKIP = "script, style, noscript, textarea, input, select, [contenteditable], .page-coach, .page-notes-ui";
const BLOCK = "p, li, td, th, dd, dt, blockquote, pre, h1, h2, h3, h4, h5, h6, figcaption, label, summary";
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);
const elementOf = (n: Node) => (n.nodeType === 1 ? (n as Element) : n.parentElement);
const shown = (n: Element) => n.getClientRects().length > 0;
const tidy = (s: string) => s.replace(/\n{3,}/g, "\n\n").trim();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const highlights = (): Map<string, unknown> | undefined => (globalThis as any).CSS?.highlights;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Highlight = (globalThis as any).Highlight as (new (...r: Range[]) => unknown) | undefined;

// What the model gets besides the highlight: the block it sits in, the nearest section around that, the headings
// above it and the page's outline. Enough to know what "this" refers to without sending the whole page.
function contextFor(range: Range, main: Element): Context {
  const start = elementOf(range.startContainer) ?? main;
  const block = start.closest(BLOCK) ?? start;
  const passage = tidy((block as HTMLElement).innerText || "");
  let sec: Element | null = block.parentElement;
  while (sec && sec !== main && !(sec.matches("section, article, aside, details, fieldset") && ((sec as HTMLElement).innerText || "").length > passage.length + 80)) sec = sec.parentElement;
  const heads = [...main.querySelectorAll<HTMLElement>("h1, h2, h3, h4")].filter((h) => shown(h) && !h.closest(SKIP));
  const trail: HTMLElement[] = [];
  for (const h of heads) {
    if (!(h.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING) && !h.contains(block)) break;
    while (trail.length && Number(trail[trail.length - 1].tagName[1]) >= Number(h.tagName[1])) trail.pop();
    trail.push(h);
  }
  const outline = [...new Set(heads.filter((h) => h.tagName !== "H4").map((h) => clip(h.innerText.trim(), 120)).filter(Boolean))];
  return {
    passage: clip(passage, 1800),
    section: clip(tidy(sec && sec !== main ? (sec as HTMLElement).innerText || "" : ""), 3800),
    headings: trail.slice(-6).map((h) => clip(h.innerText.trim(), 160)),
    outline: outline.slice(0, 36),
  };
}

// The outermost card (an element with a border or background) holding the passage, below <main>.
function cardOf(node: Node) {
  let card: Element | null = null;
  for (let el = elementOf(node); el && el.tagName !== "MAIN"; el = el.parentElement) {
    const cs = getComputedStyle(el);
    if (parseFloat(cs.borderRightWidth) > 0 || !/^(transparent|rgba\(0, 0, 0, 0\))$/.test(cs.backgroundColor)) card = el;
  }
  return card;
}

// Off to the right of the card holding the passage, level with its last line, so it never covers text. On a narrow
// screen with no room outside the card, inside its right edge.
function sideOf(range: Range) {
  const rects = range.getClientRects();
  if (!rects.length) return null;
  const last = rects[rects.length - 1];
  if (!last.width && !last.height) return null;
  const edge = (cardOf(range.endContainer) ?? elementOf(range.endContainer)?.closest(BLOCK))?.getBoundingClientRect().right ?? last.right;
  const x = edge + 34 <= window.innerWidth ? edge + 10 : Math.min(edge, window.innerWidth) - 30;
  return { x, y: last.top + last.height / 2 - 12, edge, last, first: rects[0] };
}

export function PageNotes() {
  const path = usePathname();
  const { title } = useHeadingValue();
  const enabled = !!useOverview().data?.llm_enabled;
  const qc = useQueryClient();
  const key = ["page-notes", path];
  const notes = useQuery<{ notes: Note[] }>({ queryKey: key, queryFn: () => api(`/page-notes?path=${encodeURIComponent(path)}`), staleTime: 60_000 }).data?.notes ?? [];
  const [selection, setSelection] = useState<Range | null>(null);
  const [anchors, setAnchors] = useState<Map<string, Range>>(new Map());
  const [open, setOpen] = useState<Open | null>(null);
  const [, setTick] = useState(0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // The highlight button follows the current selection inside the page.
  useEffect(() => {
    let timer = 0;
    const check = () => {
      const s = document.getSelection(), main = document.querySelector("main");
      if (!s || s.isCollapsed || !s.rangeCount || !main) return setSelection(null);
      const r = s.getRangeAt(0), text = r.toString().trim();
      const inside = main.contains(r.commonAncestorContainer) && !elementOf(r.startContainer)?.closest(SKIP) && !elementOf(r.endContainer)?.closest(SKIP);
      setSelection(inside && text.length >= 2 && text.length <= 1000 ? r.cloneRange() : null);
    };
    const later = () => { clearTimeout(timer); timer = window.setTimeout(check, 120); };
    document.addEventListener("selectionchange", later);
    return () => { clearTimeout(timer); document.removeEventListener("selectionchange", later); };
  }, []);

  // Find each saved passage again whenever the page or the notes change (lessons render after the route does).
  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;
    let timer = 0;
    const find = () => {
      const flat = flatten(main, SKIP), found = new Map<string, Range>();
      for (const n of notes) { const r = n.anchor && rangeOf(flat, n.anchor); if (r) found.set(n.id, r); }
      setAnchors(found);
    };
    find();
    const watch = new MutationObserver(() => { clearTimeout(timer); timer = window.setTimeout(find, 400); });
    watch.observe(main, { subtree: true, childList: true, characterData: true });
    return () => { clearTimeout(timer); watch.disconnect(); };
  }, [notes]);

  useEffect(() => {
    const all = highlights();
    if (!all || !Highlight) return;
    const draft = open && "draft" in open ? [open.draft.range] : [];
    all.set("page-notes", new Highlight(...anchors.values()));
    all.set("page-notes-draft", new Highlight(...draft));
    return () => { all.delete("page-notes"); all.delete("page-notes-draft"); };
  }, [anchors, open]);

  useEffect(() => {
    let frame = 0;
    const move = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => setTick((t) => t + 1)); };
    window.addEventListener("scroll", move, true);
    window.addEventListener("resize", move);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", move, true); window.removeEventListener("resize", move); };
  }, []);

  useEffect(() => { setOpen(null); }, [path]);

  const start = () => {
    const main = document.querySelector("main");
    if (!selection || !main) return;
    const anchor = anchorOf(flatten(main, SKIP), selection);
    if (!anchor) return;
    setOpen({ draft: { range: selection, quote: clip(selection.toString().trim(), 1000), anchor, context: contextFor(selection, main) } });
    document.getSelection()?.removeAllRanges();
    setSelection(null);
  };

  const saved = (note: Note) => qc.setQueryData<{ notes: Note[] }>(key, (d) => {
    const rest = (d?.notes ?? []).filter((n) => n.id !== note.id);
    return { notes: [...rest, note] };
  });
  const remove = async (id: string) => {
    setOpen(null);
    qc.setQueryData<{ notes: Note[] }>(key, (d) => ({ notes: (d?.notes ?? []).filter((n) => n.id !== id) }));
    await api(`/page-notes/${id}`, "DELETE").catch(() => qc.invalidateQueries({ queryKey: key }));
  };

  if (!mounted) return null;
  const button = selection && !open ? sideOf(selection) : null;
  const placed: { x: number; y: number }[] = [];
  const markers = [...anchors].flatMap(([id, r]) => {
    const at = sideOf(r);
    if (!at || at.y < 64 || at.y > window.innerHeight - 10) return [];
    while (placed.some((p) => Math.abs(p.y - at.y) < 20 && Math.abs(p.x - at.x) < 20)) at.x += 24;
    placed.push(at);
    return [{ id, at }];
  });
  if (button) while (placed.some((p) => Math.abs(p.y - button.y) < 24 && Math.abs(p.x - button.x) < 26)) button.x += 30;
  const openNote = open && "id" in open ? notes.find((n) => n.id === open.id) : undefined;
  const openRange = open ? ("draft" in open ? open.draft.range : anchors.get(open.id)) : undefined;

  return createPortal(
    <>
      {button && (
        <button className="page-notes-ui page-notes-ask" type="button" style={{ left: button.x, top: button.y }} title="Ask the tutor about this"
          aria-label="Ask the tutor about the highlighted text" onMouseDown={(e) => e.preventDefault()} onClick={start}>
          <NoteIcon />
        </button>
      )}
      {markers.map(({ id, at }) => (
        <button key={id} className={`page-notes-ui page-notes-marker${open && "id" in open && open.id === id ? " is-open" : ""}`} type="button"
          style={{ left: at.x, top: at.y }} title="Open your question about this passage" aria-label="Open the note on this passage"
          onClick={() => setOpen(open && "id" in open && open.id === id ? null : { id })}>
          <NoteIcon />
        </button>
      ))}
      {open && (openNote || "draft" in open) && (
        <NotePopover key={"id" in open ? open.id : "draft"} range={openRange} note={openNote} draft={"draft" in open ? open.draft : undefined}
          enabled={enabled} path={path} page={(title || "").slice(0, 160)} onSaved={(n) => {
            saved(n);
            setOpen((o) => { if (o && "draft" in o) { const r = o.draft.range; setAnchors((m) => new Map(m).set(n.id, r)); return { id: n.id }; } return o; });
          }}
          onDelete={openNote ? () => remove(openNote.id) : undefined} onClose={() => setOpen(null)} />
      )}
    </>,
    document.body,
  );
}

function NoteIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4Z" /><path d="M8 9h8M8 12.5h5" /></svg>;
}

type PopProps = {
  range?: Range; note?: Note; draft?: Draft; enabled: boolean; path: string; page: string;
  onSaved: (n: Note) => void; onDelete?: () => void; onClose: () => void;
};

function NotePopover({ range, note, draft, enabled, path, page, onSaved, onDelete, onClose }: PopProps) {
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  const [live, setLive] = useState<{ me: string; reply: string } | null>(null);
  const [error, setError] = useState(enabled ? "" : "AI coaching is unavailable. Check the coach configuration in Settings.");
  const turns = note?.turns ?? [];

  useEffect(() => { input.current?.focus(); }, []);
  useLayoutEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [turns.length, live?.reply]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); onClose(); } };
    const down = (e: MouseEvent) => { if (!(e.target as Element).closest?.(".page-notes-ui")) onClose(); };
    document.addEventListener("keydown", key, true);
    document.addEventListener("mousedown", down);
    return () => { document.removeEventListener("keydown", key, true); document.removeEventListener("mousedown", down); };
  }, [onClose]);

  const send = async () => {
    const message = text.trim();
    if (!message || live || !enabled) return;
    setText(""); setError(""); setLive({ me: message, reply: "" });
    const body = note ? { id: note.id, message }
      : { message, path, page, quote: draft!.quote, anchor: draft!.anchor, context: draft!.context };
    let reply = "";
    try {
      await streamApi("/page-notes/ask", body, (e) => {
        if (e.type === "text") { reply += e.text; setLive({ me: message, reply }); }
        else if (e.type === "done" && e.note) onSaved(e.note);
      });
      setLive(null);
    } catch (e) {
      setLive(null); setText(message); setError((e as Error).message);
    }
  };

  // Beside the card, level with the passage, when there is room to its right; otherwise below the passage, or above
  // it near the bottom of the window.
  const rects = range?.getClientRects();
  const side = range ? sideOf(range) : null;
  const width = Math.min(380, window.innerWidth - 16);
  const tall = Math.min(460, window.innerHeight * 0.7);
  const room = side ? Math.min(width, window.innerWidth - side.edge - 44 - 12) : 0;
  const style: CSSProperties = { width };
  if (rects?.length && side && room >= 260) {
    style.left = side.edge + 44; style.width = room;
    style.top = Math.max(72, Math.min(side.first.top - 12, window.innerHeight - tall - 8));
  } else if (rects?.length) {
    const first = rects[0], last = rects[rects.length - 1];
    style.left = Math.max(8, Math.min(last.left, window.innerWidth - width - 8));
    if (window.innerHeight - last.bottom > 300 || first.top < 300) style.top = Math.min(last.bottom + 8, window.innerHeight - 200);
    else style.bottom = window.innerHeight - first.top + 8;
  } else { style.right = 16; style.bottom = 16; }

  const quote = note?.quote ?? draft?.quote ?? "";
  return (
    <div ref={box} className="page-notes-ui page-notes-pop" style={style} role="dialog" aria-label="Question about the highlighted text"
      onKeyDown={(e) => e.nativeEvent.stopImmediatePropagation()}>
      <div className="page-notes-head">
        <blockquote className="page-notes-quote">{clip(quote, 220)}</blockquote>
        {onDelete && <button className="button is-ghost is-small" type="button" title="Delete this note" onClick={onDelete}>Delete</button>}
        <button className="page-notes-close" type="button" aria-label="Close" onClick={onClose}>&times;</button>
      </div>
      {(turns.length > 0 || live) && (
        <div ref={log} className="page-notes-log">
          {turns.map((t, i) => t.role === "me" ? <p key={i} className="page-notes-me">{t.text}</p> : <Markdown key={i} text={t.text} />)}
          {live && <><p className="page-notes-me">{live.me}</p>{live.reply ? <StreamingMarkdown text={live.reply} /> : <p className="page-notes-wait">Thinking…</p>}</>}
        </div>
      )}
      {error && <p className="page-notes-error" role="status">{error}</p>}
      <form className="page-notes-compose" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <textarea ref={input} rows={2} value={text} onChange={(e) => setText(e.target.value)} disabled={!enabled} aria-label="Your question"
          placeholder={turns.length ? "Ask a follow-up…" : "Ask about this…"}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} />
        <button className="button is-small" type="submit" disabled={!text.trim() || !!live || !enabled}>Ask</button>
      </form>
    </div>
  );
}
