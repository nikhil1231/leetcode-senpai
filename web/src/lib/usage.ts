"use client";
// Friction metrics kept in this browser only (localStorage): time from opening the app to the first thing you actually
// do, which pages get visited, and which never do. Nothing leaves the device; Settings shows it.
const KEY = "senpai-usage-v1", MAX_SESSIONS = 60;
interface Session { at: number; firstActionSec: number | null; pages: number }
interface Data { visits: Record<string, { n: number; last: number }>; sessions: Session[] }

let data: Data | null = null;
let session: Session | null = null;
let lastGesture = 0;
let lastKey = "";
let timer: ReturnType<typeof setTimeout> | null = null;

function load(): Data {
  if (data) return data;
  data = { visits: {}, sessions: [] };
  try { const raw = JSON.parse(localStorage.getItem(KEY) || "null"); if (raw?.visits && raw?.sessions) data = raw; } catch { /* private window: stay in memory */ }
  return data as Data;
}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* ignore */ } };

export function startUsage() {
  if (session || typeof window === "undefined") return;
  const d = load();
  session = { at: Date.now(), firstActionSec: null, pages: 0 };
  d.sessions.push(session);
  if (d.sessions.length > MAX_SESSIONS) d.sessions.splice(0, d.sessions.length - MAX_SESSIONS);
  save();
  for (const t of ["click", "keydown", "touchend"]) document.addEventListener(t, () => { lastGesture = Date.now(); }, true);
}

// A "first action" is the first request that writes something, shortly after a real gesture.
export function noteWrite(url: string) {
  if (!session || session.firstActionSec !== null || Date.now() - lastGesture > 4000) return;
  if (url.includes("/api/") && !/\/(log|events?|telemetry|heartbeat|warm)\b/.test(url)) { session.firstActionSec = Math.round((Date.now() - session.at) / 1000); save(); }
}

// Counted when the page has held for a moment.
export function noteVisit(key: string) {
  if (!session || !key || key === lastKey) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    lastKey = key;
    const d = load();
    const v = d.visits[key] || (d.visits[key] = { n: 0, last: 0 });
    v.n += 1; v.last = Date.now(); (session as Session).pages += 1; save();
  }, 1500);
}

const median = (a: number[]) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };

export function usageSummary() {
  const d = typeof window === "undefined" ? { visits: {}, sessions: [] } as Data : load();
  const recent = d.sessions.slice(-14);
  const acted = recent.filter((s) => s.firstActionSec !== null).map((s) => s.firstActionSec as number);
  return { sessions: d.sessions.length, medianFirstAction: median(acted), actedShare: recent.length ? acted.length / recent.length : 0,
    pagesPerSession: recent.length ? recent.reduce((n, s) => n + s.pages, 0) / recent.length : 0, visits: d.visits };
}
export function clearUsage() { data = { visits: {}, sessions: session ? [session] : [] }; lastKey = ""; save(); }
