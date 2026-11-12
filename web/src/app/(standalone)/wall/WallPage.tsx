"use client";
import { useEffect, useRef, useState } from "react";
import "./wall.css";

// The wall (server/wall.py): posters of what you are learning, full screen, for a TV, a projector, a screensaver or a phone
// on StandBy. ?every=45 seconds a poster, ?reveal=18 seconds until its idea shows, ?map=5 (every fifth slide is the fading
// map; 0 never), ?only=map, ?print=1 six posters to print, ?log=1 records each poster as an exposure.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
interface Slide { id: number; poster: Any | null; on: boolean; revealed: boolean }

const fill = (a: Any) => (!a.met ? "#232836" : `hsl(${Math.max(0, Math.min(125, a.strength * 1.25))} 78% 58%)`);
const shade = (a: Any) => (a.met ? (0.45 + 0.55 * Math.min(1, a.coverage / 60)).toFixed(2) : 1);
function lines(text: string, max: number) {
  const out = [""];
  for (const w of text.split(" ")) {
    if ((out[out.length - 1] + " " + w).trim().length > max && out[out.length - 1]) out.push(w);
    else out[out.length - 1] = (out[out.length - 1] + " " + w).trim();
  }
  return out;
}

function MapSvg({ m }: { m: Any }) {
  const by = Object.fromEntries(m.parts.map((p: Any) => [p.id, p]));
  const mid = (p: Any) => [p.x + p.w / 2, p.y + p.h / 2];
  let y = 40;
  const rooms = m.rooms.map((r: Any) => {
    const head = <text key={`h-${r.title}`} x="1310" y={y + 26} fontSize="25" fontWeight="750" fill="#e9ecf3">{r.title}</text>;
    y += 46;
    const rows = r.areas.map((a: Any) => {
      const row = <g key={a.title}>
        <text x="1310" y={y + 20} fontSize="18" fill="#aab2c5">{a.title.length > 28 ? a.title.slice(0, 27) + "…" : a.title}</text>
        <rect x="1310" y={y + 30} width="270" height="10" rx="5" fill="#1e2330" />
        <rect x="1310" y={y + 30} width={a.met ? Math.max(8, (2.7 * a.strength * a.coverage) / 100) : 0} height="10" rx="5" fill={fill(a)} /></g>;
      y += 56; return row;
    });
    y += 24;
    return <g key={r.title}>{head}{rows}</g>;
  });
  const h = Math.max(890, y + 20);
  return (
    <svg viewBox={`0 0 1600 ${h}`} preserveAspectRatio="xMidYMid meet" fontFamily="-apple-system, Segoe UI, Inter, Roboto, sans-serif">
      {m.edges.map(([a, b]: string[], i: number) => { const [x1, y1] = mid(by[a]), [x2, y2] = mid(by[b]); return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#39405a" strokeWidth="5" />; })}
      {m.parts.map((p: Any) => {
        const dim = !p.met, ink = dim ? "#8b93a8" : "#12131a", soft = dim ? "#6b7388" : "rgba(18,19,26,.72)", wide = p.w > 500;
        const stats = dim ? ["not built yet"] : [`${p.strength}% held`, `${p.met}/${p.total} met${p.fading + p.shaky ? ` · ${p.fading + p.shaky} slipping` : ""}`];
        const statText = wide ? [stats.join(" · ")] : stats;
        return (
          <g key={p.id}>
            <rect x={p.x} y={p.y} width={p.w} height={p.h} rx="20" fill="#0a0c11" />
            <g opacity={shade(p)}>
              <rect x={p.x} y={p.y} width={p.w} height={p.h} rx="20" fill={fill(p)} {...(dim ? { stroke: "#3a4157", strokeWidth: 3, strokeDasharray: "10 8" } : {})} />
              <text x={p.x + 20} y={p.y + 38} fontSize="24" fontWeight="750" fill={ink}>{lines(p.name, Math.floor(p.w / 15)).map((t, k) => <tspan key={k} x={p.x + 20} dy={k ? 28 : 0}>{t}</tspan>)}</text>
              {statText.map((t, k, all) => <text key={k} x={p.x + 20} y={p.y + p.h - 18 - (all.length - 1 - k) * 25} fontSize="19" fill={soft}>{t}</text>)}
            </g>
          </g>
        );
      })}
      {rooms}
    </svg>
  );
}

function Poster({ p, data, clock }: { p: Any; data: Any; clock: string }) {
  return (
    <>
      <div className="row"><span>{p.tag}</span><span className="clock">{clock}</span></div>
      <div className="row" style={{ marginTop: "1.6vh" }}><span><b>{p.speaker}</b> · {p.role}</span></div>
      <div className="ask">{p.ask}</div><div className="claim">{p.claim}</div>
      <div className="foot"><div className="row"><span>{p.lesson}</span><span>{data.company.label} · {data.company.users}</span></div><div className="bar"><i /></div></div>
    </>
  );
}

export function WallPage() {
  const [msg, setMsg] = useState<React.ReactNode>("Loading…");
  const [data, setData] = useState<Any>(null);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [clock, setClock] = useState("");
  const [print, setPrint] = useState(false);
  const st = useRef({ i: 0, shown: 0, n: 0, timers: [] as ReturnType<typeof setTimeout>[], logged: new Set<string>(), data: null as Any });

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const num = (k: string, d: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, parseFloat(q.get(k) ?? String(d)) || d));
    const EVERY = num("every", 45, 8, 3600) * 1000, REVEAL = Math.min(num("reveal", 18, 2, 3600) * 1000, EVERY - 3000);
    const MAP = q.has("map") ? Math.round(num("map", 5, 0, 100)) : 5, ONLY_MAP = q.get("only") === "map", PRINT = q.get("print") === "1", LOG = q.get("log") === "1";
    const S = st.current; let alive = true;
    const tick = () => setClock(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    const load = async () => {
      const r = await fetch("/api/wall?n=" + (PRINT ? 6 : 24), { credentials: "same-origin" });
      if (!r.ok) throw Object.assign(new Error("HTTP " + r.status), { status: r.status });
      return r.json();
    };
    const exposure = (p: Any) => {
      const key = `wall-${new Date().toISOString().slice(0, 10)}-${p.point}`;
      if (!LOG || S.logged.has(key)) return;
      S.logged.add(key);
      fetch("/api/knowledge/events", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: "wall", events: [{ key, kind: "exposure", points: [p.point] }] }) }).catch(() => {});
    };
    let show: () => void;
    const refresh = async () => { try { S.data = await load(); setData(S.data); S.i = 0; } catch { /* keep showing what we have */ } show(); };
    const next = async () => { if (S.i >= S.data.posters.length) { await refresh(); return; } show(); };
    show = () => {
      if (!alive) return;
      S.timers.forEach(clearTimeout); S.timers = [];
      const isMap = ONLY_MAP || (MAP > 0 && S.shown > 0 && S.shown % MAP === MAP - 1);
      const p = S.data.posters[S.i % Math.max(1, S.data.posters.length)];
      const id = ++S.n, poster = isMap || !p ? null : p;
      setSlides((old) => [...old.map((s) => ({ ...s, on: false })), { id, poster, on: false, revealed: false }]);
      requestAnimationFrame(() => requestAnimationFrame(() => setSlides((old) => old.map((s) => (s.id === id ? { ...s, on: true } : s)))));
      setTimeout(() => setSlides((old) => old.filter((s) => s.id === id || s.on)), 1400);
      tick();
      if (!isMap && p) {
        S.i += 1; exposure(p);
        S.timers.push(setTimeout(() => setSlides((old) => old.map((s) => (s.id === id ? { ...s, revealed: true } : s))), REVEAL));
      }
      S.shown += 1;
      S.timers.push(setTimeout(ONLY_MAP ? refresh : next, ONLY_MAP ? 10 * 60 * 1000 : EVERY));
    };
    (async function start() {
      try { S.data = await load(); setData(S.data); } catch (err) {
        if (!alive) return;
        setMsg((err as Any).status === 401 || (err as Any).status === 403 ? <>Sign in to <a href="/">the app</a> first, then come back.</> : "Could not load the wall. It will try again in a minute.");
        S.timers.push(setTimeout(start, 60000)); return;
      }
      if (!alive) return;
      if (PRINT) { setPrint(true); setMsg(null); return; }
      if (!S.data.posters.length && !ONLY_MAP) { setMsg("Open a lesson and its ideas will appear here."); return; }
      setMsg(null); show();
    })();
    const clockTimer = setInterval(tick, 15000);
    const wake = async () => { try { await (navigator as Any).wakeLock?.request("screen"); } catch { /* the screen may sleep */ } };
    void wake();
    const vis = () => { if (document.visibilityState === "visible") void wake(); };
    const fs = () => document.documentElement.requestFullscreen?.().catch(() => {});
    document.addEventListener("visibilitychange", vis); document.addEventListener("click", fs);
    return () => { alive = false; S.timers.forEach(clearTimeout); clearInterval(clockTimer); document.removeEventListener("visibilitychange", vis); document.removeEventListener("click", fs); };
  }, []);

  // The idea reads, then the bar runs down the time the poster stays.
  const bars = useRef<Set<number>>(new Set());
  useEffect(() => {
    document.querySelectorAll<HTMLElement>(".sa-wall .slide.poster").forEach((el) => {
      const id = Number(el.dataset.id);
      if (bars.current.has(id)) return; bars.current.add(id);
      const every = Math.max(8, parseFloat(new URLSearchParams(location.search).get("every") || "45") || 45) * 1000;
      el.querySelector<HTMLElement>(".bar i")?.animate([{ width: "0%" }, { width: "100%" }], { duration: every, fill: "forwards" });
    });
  }, [slides]);

  if (print && data) {
    return (
      <div className="sa-wall print">
        <p className="noprint">Six posters for this week. Print in colour on A4 (no margins).</p>
        <div className="sheet">{data.posters.map((p: Any, i: number) => <section key={i} className="card" style={{ ["--c" as string]: p.colour }}><Poster p={p} data={data} clock="" /></section>)}</div>
      </div>
    );
  }
  return (
    <div className="sa-wall" style={{ cursor: "none" }}>
      {msg && <div className="msg" id="msg">{msg}</div>}
      {data && slides.map((s) => s.poster ? (
        <section key={s.id} data-id={s.id} className={`slide poster${s.on ? " on" : ""}${s.revealed ? " revealed" : ""}`} style={{ ["--c" as string]: s.poster.colour }}><Poster p={s.poster} data={data} clock={clock} /></section>
      ) : (
        <section key={s.id} className={`slide map${s.on ? " on" : ""}`}><h1>Ripple&apos;s system, as you hold it</h1>
          <div className="sub">{data.company.label} ({data.company.users}) · you hold {data.company.pct}% of every idea. Each part shows how well you hold the ideas you have met there: green holds, red is fading. Faint parts you have barely met.</div>
          <MapSvg m={data.map} /></section>
      ))}
    </div>
  );
}
