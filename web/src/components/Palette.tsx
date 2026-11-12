"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useNextLoader } from "@/components/nextup/useNextLoader";
import { useStartBlock } from "@/features/senpai/start";
import { staticPages, type PageEntry } from "@/lib/pages";
import { routeToPath } from "@/lib/sections";
import { useToast } from "@/lib/toast";
import { useUi } from "@/lib/ui-store";

// Command palette: Ctrl/Cmd-K (or "/") jumps to any page, lesson, simulator, exercise or problem, and runs a few actions.
interface Item { kind: "page" | "action" | "lesson" | "simulator" | "exercise" | "problem"; title: string; sub?: string; run: () => void }
const KIND: Record<string, string> = { page: "Page", action: "Action", lesson: "Lesson", simulator: "Simulator", exercise: "Exercise", problem: "Problem" };

// Every word must appear; titles that start with a word, or contain it at a word start, rank first.
function score(item: Item, words: string[]) {
  const t = item.title.toLowerCase().replace(/^\d+\s+/, ""), s = (item.sub || "").toLowerCase();
  let n = t.includes(words.join(" ")) ? 6 : 0;
  for (const w of words) {
    if (t.startsWith(w)) n += 6; else if (t.includes(" " + w)) n += 4; else if (t.includes(w)) n += 2; else if (s.includes(w)) n += 1; else return -1;
  }
  return n + (item.kind === "page" || item.kind === "action" ? 0.5 : 0);
}

export function Palette() {
  const { paletteOpen: open, setPalette, setQuickStart } = useUi();
  const router = useRouter();
  const toast = useToast();
  const start = useStartBlock();
  const loadNext = useNextLoader();
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const [dynamic, setDynamic] = useState<Item[] | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const last = useRef<HTMLElement | null>(null);

  const statics = useMemo<Item[]>(() => {
    const pages: Item[] = staticPages().map((p: PageEntry) => ({ kind: "page", title: p.title, sub: p.sub, run: () => router.push(p.href) }));
    const actions: Item[] = [
      { kind: "action", title: "Do this next", sub: "Your plan's next step", run: async () => { const d = await loadNext(); if (d?.primary) start(d.primary.action); else router.push("/leetcode/senpai"); } },
      { kind: "action", title: "See interview readiness across all sections", sub: "Overview", run: () => router.push("/readiness") },
      { kind: "action", title: "Start a System Design quickfire round", sub: "Practise", run: () => router.push("/system-design/quickfire") },
      { kind: "action", title: "Start any problem by URL, number or title", sub: "LeetCode", run: () => setQuickStart(true) },
      { kind: "action", title: "Open the design builder", sub: "System Design", run: () => router.push("/system-design/simulators/builder~builder") },
      { kind: "action", title: "Play Ripple Ops", sub: "System Design", run: () => router.push("/system-design/simulators/game~ripple") },
    ];
    return [...pages, ...actions];
  }, [router, start, loadNext, setQuickStart]);

  const build = async () => {
    if (dynamic) return;
    const get = (p: string) => fetch(p).then((r) => r.json());
    const [si, designs, ints, crs] = await Promise.allSettled([api("/search-index"), get("/walkthrough/index.json"), get("/simulators/internals.json"), get("/simulators/courses.json")]);
    const sim = (kind: string, id: string, title: string, sub: string): Item => ({ kind: "simulator", title, sub, run: () => router.push(`/system-design/simulators/${kind}~${id}`) });
    const items: Item[] = [];
    if (si.status === "fulfilled") {
      for (const i of si.value.items as { kind: Item["kind"]; title: string; sub?: string; route?: string }[]) {
        items.push({ ...i, run: i.route ? () => router.push(routeToPath(i.route as string)) : () => router.push(`/leetcode/problems?search=${encodeURIComponent(i.title)}`) });
      }
    }
    if (designs.status === "fulfilled") items.push(...designs.value.designs.map((d: { id: string; title: string }) => sim("design", d.id, d.title, "System design simulator")));
    if (ints.status === "fulfilled") items.push(...ints.value.topics.map((t: { id: string; title: string; categoryLabel?: string }) => sim("internals", t.id, t.title, "Simulator · " + (t.categoryLabel || ""))));
    if (crs.status === "fulfilled") items.push(...crs.value.items.map((t: { id: string; title: string; categoryLabel?: string }) => sim("course", t.id, t.title, "Simulator · " + (t.categoryLabel || ""))));
    setDynamic(items);
  };

  const all = useMemo(() => [...statics, ...(dynamic || [])], [statics, dynamic]);
  const results = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return all.filter((i) => i.kind === "action").concat(all.filter((i) => i.kind === "page").slice(0, 8));
    return all.map((i, k) => [i, score(i, words), k] as const).filter((x) => x[1] >= 0).sort((a, b) => b[1] - a[1] || a[2] - b[2]).slice(0, 40).map((x) => x[0]);
  }, [all, query]);

  useEffect(() => { if (open) { last.current = document.activeElement as HTMLElement; setQuery(""); setSel(0); setTimeout(() => input.current?.focus(), 0); build(); } else last.current?.focus?.(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open]);
  useEffect(() => { const t = setTimeout(build, 4000); return () => clearTimeout(t); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const typing = !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
      if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !useUi.getState().paletteOpen) { e.preventDefault(); setPalette(true); }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [setPalette]);
  useEffect(() => { document.getElementById(`pal-${sel}`)?.scrollIntoView({ block: "nearest" }); }, [sel, results]);

  if (!open) return null;
  const choose = (i: number) => {
    const r = results[i];
    if (!r) return;
    setPalette(false);
    try { r.run(); } catch { toast("Could not open that"); }
  };
  return (
    <div id="palette" className="palette" onMouseDown={(e) => { if (e.target === e.currentTarget) setPalette(false); }}>
      <div className="pal-card" role="dialog" aria-modal="true" aria-label="Search">
        <input ref={input} className="pal-input" type="text" role="combobox" aria-expanded="true" aria-controls="pal-list" aria-autocomplete="list" value={query}
          aria-activedescendant={results.length ? "pal-" + sel : ""} placeholder="Jump to a lesson, simulator, problem or page…" autoComplete="off" spellCheck={false}
          onChange={(e) => { setQuery(e.target.value); setSel(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (results.length) setSel((sel + (e.key === "ArrowDown" ? 1 : -1) + results.length) % results.length); }
            else if (e.key === "Enter") { e.preventDefault(); choose(sel); }
            else if (e.key === "Escape") { e.preventDefault(); setPalette(false); }
          }} />
        <ul id="pal-list" className="pal-list" role="listbox">
          {results.length ? results.map((r, i) => (
            <li key={i} role="option" id={`pal-${i}`} aria-selected={i === sel} className={i === sel ? "is-sel" : ""} onClick={() => choose(i)} onMouseMove={() => { if (i !== sel) setSel(i); }}>
              <span className="pal-kind">{KIND[r.kind] || r.kind}</span><span className="pal-title">{r.title}</span><span className="pal-sub">{r.sub || ""}</span></li>
          )) : <li className="pal-empty">{dynamic ? "Nothing matches that." : "Loading…"}</li>}
        </ul>
        <div className="pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span></div>
      </div>
    </div>
  );
}
