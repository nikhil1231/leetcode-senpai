"use client";
import { useRef, useState } from "react";
import "./walk.css";

// Walk mode (server/feed.py /answer): hands-free practice out loud. The phone reads a question, listens until you stop
// talking, has the model grade what you said, and reads back the verdict and the idea. Say "skip", "repeat" or "stop" at
// any time. Without the model it reads the question, waits, reads the idea, and you tap whether you knew it. The screen
// stays on while it runs (phones pause speech when they lock). ?n=6 questions.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

async function call(path: string, body?: unknown) {
  const r = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {});
  if (!r.ok) throw Object.assign(new Error("HTTP " + r.status), { status: r.status });
  return r.json();
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const VERDICT: Record<string, string> = { right: "Right", partly: "Partly", wrong: "Not quite" };

export function WalkPage() {
  const [phase, setPhase] = useState<"intro" | "running" | "idle">("intro");
  const [startLabel, setStartLabel] = useState("Start");
  const [count, setCount] = useState("");
  const [state, setState] = useState("");
  const [orb, setOrb] = useState("");
  const [card, setCard] = useState<{ who: string; ask: string; heard: string; verdict: string; verdictClass: string; feedback: string; idea: string } | null>(null);
  const [grading, setGrading] = useState(false);
  const R = useRef({ stopped: false, graded: null as boolean | null, voice: null as SpeechSynthesisVoice | null, stream: null as MediaStream | null, lock: null as Any, skipNow: null as null | (() => void), selfGrade: null as null | ((o: string) => void), idx: 0, cards: [] as Any[], run: "" });

  const patchCard = (p: Partial<NonNullable<typeof card>>) => setCard((c) => ({ who: "", ask: "", heard: "", verdict: "", verdictClass: "", feedback: "", idea: "", ...(c || {}), ...p }));

  // ---- speaking: the device's own voice; resolves on end, or on a timer if the event never comes
  const pickVoice = () => {
    const vs = speechSynthesis.getVoices();
    return vs.find((v) => /en-GB/i.test(v.lang) && /natural|premium|enhanced|serena|daniel|kate/i.test(v.name)) || vs.find((v) => /en-GB/i.test(v.lang)) || vs.find((v) => /^en/i.test(v.lang)) || null;
  };
  const say = (text: string) => new Promise<void>((resolve) => {
    if (R.current.stopped || !("speechSynthesis" in window)) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    R.current.voice = R.current.voice || pickVoice();
    if (R.current.voice) u.voice = R.current.voice;
    u.lang = R.current.voice?.lang || "en-GB"; u.rate = 1.0;
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    u.onend = finish; u.onerror = finish;
    setTimeout(finish, 1500 + text.split(/\s+/).length * 420);
    speechSynthesis.speak(u);
  });

  // ---- listening: record until a pause after speech, a long silence, or a time limit
  const mime = () => { for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"]) if ((window as Any).MediaRecorder?.isTypeSupported?.(m)) return m; return ""; };
  const listen = async () => {
    const r = R.current;
    r.stream = r.stream || await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const type = mime();
    const rec = new MediaRecorder(r.stream, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const ctx = new ((window as Any).AudioContext || (window as Any).webkitAudioContext)();
    const an = ctx.createAnalyser(); an.fftSize = 1024;
    ctx.createMediaStreamSource(r.stream).connect(an);
    const buf = new Float32Array(an.fftSize);
    rec.start(250);
    const t0 = Date.now(); let heard = false, quietSince = Date.now();
    await new Promise<void>((resolve) => {
      r.skipNow = resolve;
      const tick = () => {
        if (r.stopped) return resolve();
        an.getFloatTimeDomainData(buf);
        const rms = Math.sqrt(buf.reduce((a, x) => a + x * x, 0) / buf.length);
        if (rms > 0.02) { heard = true; quietSince = Date.now(); }
        const quiet = Date.now() - quietSince;
        if ((heard && quiet > 1800) || (!heard && Date.now() - t0 > 9000) || Date.now() - t0 > 45000) return resolve();
        requestAnimationFrame(tick);
      };
      tick();
    });
    r.skipNow = null;
    await new Promise((res) => { rec.onstop = res; rec.stop(); });
    ctx.close();
    if (!heard) return null;
    const blob = new Blob(chunks, { type: rec.mimeType || type });
    const format = /mp4/.test(blob.type) ? "m4a" : /ogg/.test(blob.type) ? "ogg" : "webm";
    const audio: string = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1]); fr.readAsDataURL(blob); });
    return { audio, format };
  };

  const reveal = async (c: Any, outcome: string) => {
    patchCard({ idea: c.claim });
    call("/api/feed/result", { key: `walk-${R.current.run}-${R.current.idx}-${outcome}`, point: c.point, outcome, gap: c.gap || "" }).catch(() => {});
    await say(`The idea: ${c.claim}`);
  };
  // Without the model: think, hear the idea, tap.
  const selfGrade = async (c: Any) => {
    setState("Answer in your head…"); await sleep(7000);
    patchCard({ idea: c.claim }); await say(`The idea: ${c.claim}`);
    setState("Did you know it?"); setGrading(true);
    const outcome = await new Promise<string>((res) => { R.current.selfGrade = res; });
    setGrading(false);
    call("/api/feed/result", { key: `walk-${R.current.run}-${R.current.idx}`, point: c.point, outcome, gap: c.gap || "" }).catch(() => {});
  };

  const ask = async (c: Any) => {
    const r = R.current;
    setCard({ who: `${c.speaker} · ${c.tag}`, ask: c.ask, heard: "", verdict: "", verdictClass: "", feedback: "", idea: "" });
    setCount(`${r.idx + 1} of ${r.cards.length}`); setState("Asking…"); setOrb("");
    await say(`${c.speaker} asks: ${c.ask}`);
    for (let tries = 0; tries < 3 && !r.stopped; tries++) {
      if (r.graded === false) return selfGrade(c);
      setState("Listening… answer out loud"); setOrb("listening");
      const clip = await listen();
      if (r.stopped) return;
      if (!clip) { setState("Nothing heard"); setOrb(""); await say("I didn't hear anything. Here's the idea."); return reveal(c, "seen"); }
      setState("Working it out…"); setOrb("thinking");
      let text = "";
      try { text = (await call("/api/transcribe", { ...clip, language: "en" })).text || ""; }
      catch (e) { if ((e as Any).status === 503) { r.graded = false; return selfGrade(c); } text = ""; }
      patchCard({ heard: text ? `“${text}”` : "" });
      const said = text.toLowerCase().replace(/[^a-z ]/g, "").trim();
      if (/^(stop|stop it|end|finish)$/.test(said)) { r.stopped = true; return; }
      if (/^(skip|next|pass|skip it)$/.test(said)) return reveal(c, "seen");
      if (/^(repeat|again|say it again|what)$/.test(said) || !text) { await say(text ? c.ask : "Sorry, I didn't catch that. " + c.ask); continue; }
      try {
        const g = await call("/api/feed/answer", { key: `walk-${r.run}-${r.idx}`, point: c.point, text, ask: c.ask, focus: c.focus || "" });
        r.graded = true;
        patchCard({ verdict: VERDICT[g.verdict], verdictClass: g.verdict, feedback: g.feedback, idea: `The idea: ${c.claim}` });
        setState(""); setOrb("");
        await say(`${({ right: "Right.", partly: "Partly.", wrong: "Not quite." } as Any)[g.verdict]} ${g.feedback}`);
        if (g.verdict !== "right") await say(`The idea: ${c.claim}`);
        return;
      } catch (e) {
        if ((e as Any).status === 503) { r.graded = false; return selfGrade(c); }
        await say("I couldn't grade that. Here's the idea."); return reveal(c, "seen");
      }
    }
  };

  const finish = () => {
    const r = R.current;
    speechSynthesis.cancel(); r.stream?.getTracks().forEach((t) => t.stop()); r.stream = null; r.lock?.release?.().catch(() => {});
    setPhase("idle"); setStartLabel("Again"); setOrb(""); setState(r.stopped ? "Stopped." : "Done. Nice walk.");
    if (!r.stopped) void say("That is all for now.");
    r.stopped = false;
  };

  const start = async () => {
    const r = R.current;
    r.stopped = false; r.run = Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => b.toString(16).padStart(2, "0")).join("");
    const N = Math.min(10, Math.max(1, parseInt(new URLSearchParams(location.search).get("n") || "6", 10) || 6));
    setPhase("running"); setOrb("");
    try { r.lock = await (navigator as Any).wakeLock?.request("screen"); } catch { /* the screen may sleep */ }
    speechSynthesis.getVoices();
    try { r.cards = (await call(`/api/feed?n=${N}`)).cards; } catch (e) { setState((e as Any).status === 401 || (e as Any).status === 403 ? "Sign in to the app first." : "Could not load questions."); setPhase("idle"); return; }
    if (!r.cards.length) { setState("Nothing to practise yet: start a lesson first."); setPhase("idle"); return; }
    await say(`Walk mode. ${r.cards.length} questions. Answer out loud after each one.`);
    for (r.idx = 0; r.idx < r.cards.length && !r.stopped; r.idx++) { await ask(r.cards[r.idx]); await sleep(600); }
    finish();
  };

  const running = phase === "running";
  return (
    <div className="sa-walk">
      <main>
        <div className="top"><span>Walk mode</span><span id="count">{count}</span></div>
        {phase === "intro" && (
          <section className="intro" id="intro"><h1>Practise out loud</h1>
            <p>I read you a question, you answer out loud, and I tell you how you did. Say <b>skip</b>, <b>repeat</b> or <b>stop</b> at any time.</p>
            <p>Headphones in, screen on: phones stop talking when they lock.</p></section>
        )}
        <div className={`orb${orb ? " " + orb : ""}${running ? "" : " hide"}`} id="orb">🎧</div>
        <div className="state" id="state">{state}</div>
        {card && (
          <section className="card" id="card"><div className="who">{card.who}</div><div className="ask">{card.ask}</div><div className="heard">{card.heard}</div>
            <div className={`verdict ${card.verdictClass}`}>{card.verdict}</div><div className="feedback">{card.feedback}</div><div className="idea">{card.idea}</div></section>
        )}
        <div className="actions">
          {!running && <button className="primary" id="start" onClick={() => void start()}>{startLabel}</button>}
          {running && !grading && <button id="skip" onClick={() => { speechSynthesis.cancel(); R.current.skipNow?.(); }}>Skip</button>}
          {running && <button id="stop" onClick={() => { R.current.stopped = true; speechSynthesis.cancel(); R.current.skipNow?.(); R.current.selfGrade?.("seen"); }}>Stop</button>}
          {running && grading && <button id="missed" onClick={() => R.current.selfGrade?.("missed")}>Didn&apos;t know</button>}
          {running && grading && <button className="primary" id="knew" onClick={() => R.current.selfGrade?.("knew")}>Knew it</button>}
        </div>
      </main>
    </div>
  );
}
