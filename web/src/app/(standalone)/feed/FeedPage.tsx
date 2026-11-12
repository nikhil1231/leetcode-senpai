"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import "./feed.css";

// The phone feed (server/feed.py): full-screen cards, swiped like Shorts. Self-contained so it opens in a moment.
// ?n=3 cards (1-10); ?then=youtube ends with a way on to YouTube; ?set=tonight|morning|due (default auto: last night's
// misses before noon, today's from 20:00).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
interface Card { key: string; kind: string; tag: string; speaker: string; role: string; lead: string; ask: string; claim: string; focus?: string; lesson: string; point: string; gap?: string;
  state: "new" | "revealed" | "done"; outcome?: string; seen?: boolean; shownAt: number }

async function call(path: string, body?: unknown, keepalive?: boolean) {
  const r = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: !!keepalive, credentials: "same-origin" } : { credentials: "same-origin" });
  if (!r.ok) throw Object.assign(new Error("HTTP " + r.status), { status: r.status });
  return r.json();
}

export function FeedPage() {
  const params = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const N = Math.min(10, Math.max(1, parseInt(params.get("n") || "3", 10) || 3));
  const THEN = params.get("then") === "youtube";
  const [YOUTUBE, setYoutube] = useState("https://www.youtube.com/");
  const [cards, setCards] = useState<Card[]>([]);
  const [company, setCompany] = useState<Any>(null);
  const [msg, setMsg] = useState<{ html: string; link?: string; retry?: boolean } | null>({ html: "Loading…" });
  const run = useRef("");
  const batch = useRef(0);
  const started = useRef(false);
  const cardsRef = useRef<Card[]>([]); cardsRef.current = cards;
  const deck = useRef<HTMLElement>(null);

  const report = useCallback((c: Card, outcome: string, keepalive?: boolean) => {
    if (c.outcome || (outcome === "seen" && c.seen)) return;
    if (outcome === "seen") c.seen = true; else c.outcome = outcome;
    const key = outcome === "seen" ? c.key + "-seen" : c.key;
    call("/api/feed/result", { key, point: c.point, outcome, gap: c.gap }, keepalive).catch(() => {});
  }, []);
  const flushSeen = useCallback(() => { for (const c of cardsRef.current) if (c.shownAt && Date.now() - c.shownAt > 1500) report(c, "seen", true); }, [report]);

  const load = useCallback(async () => {
    const mine = ++batch.current;
    try {
      const data = await call(`/api/feed?n=${N}&set=${mine === 1 ? encodeURIComponent(params.get("set") || "auto") : "due"}`);
      setCompany(data.company);
      const fresh: Card[] = data.cards.map((c: Any, i: number) => ({ ...c, key: `f-${run.current}-${mine}-${i}`, state: "new", shownAt: 0 }));
      if (!fresh.length && !cardsRef.current.length) { setMsg({ html: "Nothing to practise right now. Start a lesson in the app and its ideas show up here." }); return; }
      setCards((cs) => cs.concat(fresh)); setMsg(null);
    } catch (err) {
      if ((err as Any).status === 401 || (err as Any).status === 403) { setMsg({ html: "Sign in to the app first, then come back.", link: "/" }); return; }
      setMsg({ html: "Could not load the cards.", retry: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [N]);

  useEffect(() => {
    if (started.current) return; started.current = true;   // strict mode runs effects twice; one load is enough
    run.current = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, "0")).join("");
    if (/iPhone|iPad|iPod/.test(navigator.userAgent)) setYoutube("youtube://");
    void load();
    addEventListener("pagehide", flushSeen);
    return () => removeEventListener("pagehide", flushSeen);
  }, [load, flushSeen]);

  // A card swiped past counts as seen (once); answering it later still records the answer.
  useEffect(() => {
    const el = deck.current; if (!el) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const c = cardsRef.current[+(e.target as HTMLElement).dataset.i!];
        if (!c) continue;
        if (e.isIntersecting) c.shownAt = c.shownAt || Date.now();
        else if (c.shownAt && Date.now() - c.shownAt > 1500) report(c, "seen");
      }
    }, { threshold: 0.6 });
    el.querySelectorAll(".card[data-i]").forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [cards.length, report]);

  const update = (i: number, patch: Partial<Card>) => setCards((cs) => cs.map((c, k) => (k === i ? Object.assign(c, patch) : c)).slice());
  const next = (i: number) => setTimeout(() => (deck.current?.querySelector(`.card[data-i="${i + 1}"]`) || deck.current?.querySelector(".end"))?.scrollIntoView({ behavior: "smooth" }), 450);
  const onward = () => { window.location.href = THEN ? YOUTUBE : "/"; };

  const done = cards.filter((c) => c.outcome), knew = done.filter((c) => c.outcome === "knew").length;
  return (
    <div className="sa-feed">
      <a className="skip" href="#" style={{ display: "block" }} onClick={(e) => { e.preventDefault(); flushSeen(); onward(); }}>{THEN ? "Not now →" : "Close"}</a>
      <main id="deck" ref={deck}>
        {msg && <div className="msg"><div>{msg.html}{msg.retry && <> <a href="#" onClick={(e) => { e.preventDefault(); void load(); }}>Try again</a></>}</div>{msg.link && <a href={msg.link}>Open the app</a>}{THEN && <a href={YOUTUBE}>Continue to YouTube</a>}</div>}
        {!msg && cards.map((c, i) => (
          <section key={c.key} className={`card ${c.state === "revealed" ? "revealed" : ""} ${c.state === "done" ? "revealed done" : ""}`} data-i={i} style={{ ["--c" as string]: `var(--${c.kind}, var(--fact))` }}
            onClick={(e) => { if (!(e.target as HTMLElement).closest("[data-act]") && c.state === "new") update(i, { state: "revealed" }); }}>
            <div className="top"><span>{c.tag}</span><span className="count">{i + 1} / {cards.length}</span></div>
            <div className="who"><b>{c.speaker}</b> · {c.role} — {c.lead}</div>
            <div className="ask">{c.ask}</div>
            <div className="answer">{c.focus && <div className="piece">The piece: {c.focus}</div>}<div className="idea">{c.claim}</div></div>
            <div className="verdict">{c.outcome === "knew" ? "Nice. Logged." : c.outcome === "missed" ? "Logged. It will come back sooner." : ""}</div>
            <div className="meta">{c.lesson}</div>
            <div className="actions">
              <button className="reveal" onClick={() => update(i, { state: "revealed" })}>Show the idea</button>
              <button className="grade missed" onClick={() => { if (c.state === "revealed") { report(c, "missed"); update(i, { state: "done" }); next(i); } }}>Didn&apos;t know</button>
              <button className="grade knew" onClick={() => { if (c.state === "revealed") { report(c, "knew"); update(i, { state: "done" }); next(i); } }}>Knew it</button>
            </div>
            <div className="hint">{({ new: "Think of the answer, then tap", revealed: "Be honest: it only helps you" } as Any)[c.state] || "Swipe up for the next"}</div>
          </section>
        ))}
        {!msg && (
          <section className="card end">
            <h1>{done.length ? `${knew} of ${done.length} known.` : "That is the lot."}</h1>
            <p>{company ? `Ripple is at ${company.label} (${company.users}). You hold ${company.pct}% of the ideas.` : ""}</p>
            <div className="actions">
              {THEN && <a className="btn go" href={YOUTUBE} onClick={flushSeen}>Continue to YouTube</a>}
              <button className="more" onClick={() => void load()}>{N} more</button>
              {!THEN && <a className="btn go" href="/">Open the app</a>}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
