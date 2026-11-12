"use client";
// The imperative modules under src/legacy/ were written against a page with global helpers and a hand-built shell.
// This file gives them those globals, backed by the real app: the API client, the router, the toast, the stores. It is
// the only place that knows about both worlds, so converting a legacy module to a component means deleting its use of
// these globals, not changing this file.
import { createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useFlow } from "@/lib/flow-store";
import { setHeadingGlobal } from "@/lib/heading";
import { queryClient } from "@/lib/query-client";
import { escapeHtml } from "@/lib/md";
import { navigate } from "@/lib/navigate";
import { LEETCODE_TABS } from "@/lib/sections";
import { toastGlobal } from "@/lib/toast";
import { fmtTime, pct, solveSecOf } from "@/lib/format";
import { sanitizeProblemHtml } from "@/components/ProblemStatement";
import { copyStudyPrompt, type StudyScope } from "@/features/study/StudyPrompt";
import { runBlockAction } from "@/features/senpai/start";
import { ReadinessCard } from "@/components/readiness/ReadinessCard";
import { NextUpBanner, NextUpCard } from "@/components/nextup/NextUp";
import { loadCodeMirror } from "@/features/editor/codemirror";
import { ToastBoundary } from "@/lib/toast";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const COMPLEXITIES = ["", "O(1)", "O(log n)", "O(n)", "O(n log n)", "O(n^2)", "O(n^3)", "O(2^n)", "O(n!)"];
const TRACKS = ["fundamentals", "ai", "experience", "practical", "readiness"];
const SD_TITLES: Record<string, string> = { home: "Home", practise: "Practise", curriculum: "Learn", quickfire: "Quickfire", papers: "Past papers", mistakes: "Mistakes book", drills: "Estimation drills", simulators: "Simulators", lesson: "Lesson", map: "Overview", cases: "Design cases", skills: "Skill drills", lessons: "Learn", progress: "What you know", workspace: "Design workspace", exercise: "Skill drill", setup: "Case brief" };

// React inside an imperative view: a small root with the app's providers, torn down with its host element.
const roots = new WeakMap<Element, ReturnType<typeof createRoot>>();
export function mountReact(el: Element, node: ReactNode) {
  roots.get(el)?.unmount();
  const root = createRoot(el);
  roots.set(el, root);
  root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(ToastBoundary, null, node)));
}

let installed = false;
export function installBridge() {
  if (installed) return;
  installed = true;
  const w = window as Any;
  const $ = (sel: string) => document.querySelector(sel);
  const $$ = (sel: string) => Array.from(document.querySelectorAll(sel));
  const loader = (msg = "Loading…") => `<div class="loading-block"><span class="spinner"></span><span>${escapeHtml(msg)}</span></div>`;
  w.H = {
    $, $$, api: (path: string, method?: string, body?: unknown) => api(path, (method || "GET") as Any, body), prefetch: (...paths: string[]) => paths.forEach((p) => api(p).catch(() => {})),
    fmtTime, solveSecOf, pct, escapeHtml, toast: (m: string) => toastGlobal(m), loader, COMPLEXITIES, sanitizeProblemHtml,
    badge: (d?: string) => `<span class="tag ${({ Easy: "diff-easy", Medium: "diff-medium", Hard: "diff-hard" } as Any)[d || ""] || ""}">${d || "—"}</span>`,
    cxOptions: (sel: string) => COMPLEXITIES.map((c) => `<option value="${c}"${c === sel ? " selected" : ""}>${c || "—"}</option>`).join(""),
    beginRender: (el: HTMLElement, msg?: string) => { if (!el.childElementCount) el.innerHTML = loader(msg); },
  };
  w.ASSET_VER = "";
  w.Views = {};
  w.loadCodeMirrorLegacy = async () => { if (!w.CM) w.CM = await loadCodeMirror(); return w.CM; };

  const leetcodeTab = (t: string) => (LEETCODE_TABS.some((x) => x.id === t) ? t : "today");
  w.App = {
    goTab: (tab: string) => { if (tab === "design") navigate("/system-design"); else navigate(`/leetcode/${leetcodeTab(tab === "coach" ? "senpai" : tab)}`); },
    startFlow: (slug: string, kind = "adhoc", mode = "", title?: string, category?: string, recallAttemptId?: string | null, gradingStatus?: string | null) =>
      useFlow.getState().requestStart({ slug, kind, mode: mode || "", title, category, recallAttemptId, gradingStatus }),
    api: w.H.api, openDetail: (id: string) => useFlow.getState().openDetail(id), startSprint: () => useFlow.getState().setSprint(true), startMock: () => useFlow.getState().setMock(true),
    loadOverview: () => queryClient.invalidateQueries({ queryKey: ["api", "/overview"] }), render: () => {}, currentActiveTab: () => "design",
    get llmEnabled() { return Boolean(queryClient.getQueryData<{ llm_enabled?: boolean }>(["api", "/overview"])?.llm_enabled); },
  };
  w.AppSections = {
    TRACKS, current: () => (location.pathname.split("/")[1] || "readiness"), leaveDesign() {}, leaveSection() {},
    select(section: string, view = "home") {
      if (section === "leetcode") navigate(`/leetcode/${leetcodeTab(view === "home" ? "today" : view)}`);
      else navigate(view && view !== "home" ? `/${section}/${view}` : `/${section}`);
    },
    go: (path: string) => navigate(path),
    replace: (path: string) => { try { window.history.replaceState(window.history.state, "", path); } catch { /* ignore */ } },
    heading: (title: string, sub: string) => setHeadingGlobal(title, sub),
    setView(view: string) { setHeadingGlobal(SD_TITLES[view] || "System Design", "System Design"); },
  };
  w.NextUp = {
    load: () => queryClient.fetchQuery({ queryKey: ["api", "/senpai/next"], queryFn: () => api("/senpai/next"), staleTime: 15000 }),
    banner: (el: Element) => { if (el) mountReact(el, createElement(NextUpBanner)); return Promise.resolve(); },
    mount: (el: Element) => { if (el) mountReact(el, createElement(NextUpCard)); return Promise.resolve(); },
  };
  w.Readiness = {
    load: () => queryClient.fetchQuery({ queryKey: ["api", "/readiness"], queryFn: () => api("/readiness"), staleTime: 60000 }),
    // The card is optional; with no data it draws nothing, and the Home removes its slot.
    card: (el: Element, id: string, opts: Any = {}) => { if (!el) return Promise.resolve(false); mountReact(el, createElement(ReadinessCard, { id: id as Any, stats: opts.stats, details: opts.details, bare: true })); return Promise.resolve(true); },
    mark() {}, navLinks: () => "", open: (id: string, where: Any = {}) => w.AppSections.select(id, where.view || (where.tab ? where.tab : "home")),
  };
  w.Senpai = { start: (a: Any) => runBlockAction(a), openTeach: (id: string) => useFlow.getState().openTeach(id) };
  w.StudyPrompt = {
    button: (scope: StudyScope, name?: string) => {
      const label = `Copy a voice-chat study prompt${name ? " for " + name : ""}`;
      return `<button type="button" class="study-copy" data-study="${escapeHtml(JSON.stringify(scope))}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12Z"/><path d="M9 10.5v3M12 9v6M15 10.5v3"/></svg></button>`;
    },
    copy: (scope: StudyScope) => copyStudyPrompt(scope, toastGlobal),
  };

  // Capture, so a button inside a <summary> or a clickable card copies without toggling or opening it.
  document.addEventListener("click", (e) => {
    const node = (e.target as Element | null)?.closest?.(".study-copy[data-study]") as HTMLElement | null;
    if (!node) return;
    e.preventDefault(); e.stopPropagation();
    try { void copyStudyPrompt(JSON.parse(node.dataset.study as string), toastGlobal); } catch { /* ignore */ }
  }, true);
  // Links the server and the lessons write as "#/section/view" become real navigations.
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element | null)?.closest?.("a[href^='#/']") as HTMLAnchorElement | null;
    if (!a || a.target === "_blank") return;
    e.preventDefault(); navigate(a.getAttribute("href")!.slice(1));
  });
}
