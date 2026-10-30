/* Dictation: a mic button on prose textareas (mark them data-dictate; fields
   rendered later are picked up too). The browser's own speech recognition
   (Chrome, Edge, Safari) streams words in as you speak, appended after what's
   there. With the coach on, the audio is also recorded and re-transcribed by
   /api/transcribe, cut into segments at pauses so most of it is done while you
   are still talking; the better text swaps in moments after you stop, unless
   you've edited inside it. Submit handlers await Dictate.settle(field) so
   grading reads that text — bounded, and instant when nothing is pending.
   The button or Esc stops listening; typing in the field takes over at once. */
(function () {
  "use strict";

  // Existing text + what's been heard, spaced so speech never glues onto a word.
  function compose(prefix, finals, interim) {
    const spoken = [...finals, interim].map((s) => (s || "").trim()).filter(Boolean).join(" ");
    if (!spoken) return prefix;
    return prefix + (prefix && !/\s$/.test(prefix) ? " " : "") + spoken;
  }

  // Replace the live transcript with the accurate one if it's still intact as whole
  // words: "two pointer" edited to "two pointers" is the user's, not ours to swap.
  function upgrade(value, rough, accurate) {
    if (!rough || !accurate || rough === accurate) return value;
    for (let at = value.lastIndexOf(rough); at >= 0; at = at ? value.lastIndexOf(rough, at - 1) : -1) {
      const end = at + rough.length;
      if ((at === 0 || /\s/.test(value[at - 1])) && (end === value.length || /[\s.,;:!?)]/.test(value[end]))) {
        return value.slice(0, at) + accurate + value.slice(end);
      }
    }
    return value;
  }

  if (typeof module !== "undefined" && module.exports) { module.exports = { compose, upgrade }; return; }

  const SETTLE_MS = 5000;     // longest a submit waits for the accurate transcript
  const SEGMENT_MS = 12000;   // cut a new audio segment at the first pause after this
  const IDLE_MS = 60000;      // give up re-listening after a minute of silence
  const pending = new Set();  // sessions not yet finalised (transcript may still change)
  let active = null;

  window.Dictate = {
    // Stop dictation in `scope` (a field, a container, or everything) and wait for its text.
    // Null when nothing is pending, so a caller can skip the await and stay synchronous.
    settle(scope) {
      const mine = [...pending].filter((s) => !scope || scope === s.field || (scope.contains && scope.contains(s.field)));
      if (!mine.length) return null;
      mine.forEach((s) => { if (!s.halted) stop(s); });
      const timeout = new Promise((r) => setTimeout(r, SETTLE_MS));
      return Promise.race([Promise.all(mine.map((s) => s.settled)), timeout])
        .then(() => mine.forEach((s) => { s.abandoned = true; }));  // too late now: leave the text be
    },
  };

  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) return;

  const FATAL = {
    "not-allowed": "Microphone access is blocked for this site.",
    "service-not-allowed": "Dictation isn't available in this browser.",
    "audio-capture": "No microphone found.",
    "network": "Dictation needs a network connection.",
    "language-not-supported": "Dictation doesn't support this language.",
  };
  const MIME = window.MediaRecorder && ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"]
    .find((t) => MediaRecorder.isTypeSupported(t));
  const FORMAT = MIME && (MIME.startsWith("audio/webm") ? "webm" : MIME.startsWith("audio/ogg") ? "ogg" : "m4a");
  const LANG = navigator.language || "en-US";
  const MIC = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0013 0M12 18v2.5"/></svg>';

  const notify = (msg) => { if (typeof toast === "function") toast(msg); };
  const live = (s) => s.field.isConnected && !s.field.disabled;
  const wantAudio = () => Boolean(FORMAT && navigator.mediaDevices && typeof llmEnabled !== "undefined" && llmEnabled);

  // ---- server re-transcription -----------------------------------------------------
  const toBase64 = (blob) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = reject;
    r.readAsDataURL(blob);
  });

  async function transcribe(blob) {
    try {
      const res = await api("/transcribe", "POST",
        { audio: await toBase64(blob), format: FORMAT, language: LANG.slice(0, 2).toLowerCase() });
      return typeof res.text === "string" ? res.text.trim() : null;
    } catch (e) {
      return null;  // keep the browser's transcript
    }
  }

  // One segment = one MediaRecorder run; its transcript promise is queued in order.
  function record(s) {
    const mr = new MediaRecorder(s.stream, { mimeType: MIME, audioBitsPerSecond: 32000 });
    const chunks = [];
    mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    s.parts.push(new Promise((resolve) => {
      mr.onstop = () => resolve(chunks.length ? transcribe(new Blob(chunks, { type: MIME })) : "");
      mr.onerror = () => resolve(null);
    }));
    s.mr = mr;
    s.segStart = Date.now();
    mr.start();
  }

  function cut(s) {
    if (s.mr && s.mr.state !== "inactive") s.mr.stop();
    s.mr = null;
  }

  function releaseMic(s) {
    cut(s);
    if (s.stream) s.stream.getTracks().forEach((t) => t.stop());
    s.stream = null;
  }

  // ---- live recognition --------------------------------------------------------------
  function render(s) {
    const f = s.field;
    f.value = compose(s.prefix, [...s.done, ...s.run], s.interim);
    f.scrollTop = f.scrollHeight;
    f.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function setUi(btn, state) {
    btn.classList.toggle("is-listening", state === "listening");
    btn.classList.toggle("is-transcribing", state === "transcribing");
    btn.setAttribute("aria-pressed", String(state === "listening"));
    btn.title = state === "listening" ? "Stop dictation (Esc)" : state === "transcribing" ? "Improving the transcript…" : "Dictate";
  }

  async function start(field, btn) {
    if (active) stop(active);
    const rec = new Recognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = LANG;
    const s = { field, btn, rec, prefix: field.value, done: [], run: [], interim: "", parts: [],
                stream: null, mr: null, segStart: 0, halted: false, finished: false, abandoned: false,
                error: null, heard: Date.now() };
    s.settled = new Promise((r) => { s.resolve = r; });
    active = s;
    pending.add(s);
    setUi(btn, "listening");

    rec.onresult = (e) => {
      if (!live(s)) { cancel(s); return; }
      const finals = [], interim = [];
      for (const r of e.results) (r.isFinal ? finals : interim).push(r[0].transcript);
      // A pause (new final words, nothing half-heard) is a clean place to cut the audio.
      if (s.mr && !interim.length && finals.length > s.run.length && Date.now() - s.segStart > SEGMENT_MS) {
        cut(s);
        record(s);
      }
      s.run = finals;
      s.interim = interim.join(" ");
      s.heard = Date.now();
      render(s);
    };
    rec.onerror = (e) => {
      s.error = e.error;
      if (FATAL[e.error]) notify(FATAL[e.error]);
    };
    // Chrome ends a session on silence or a hiccup; keep listening until told to stop.
    rec.onend = () => {
      s.done.push(...s.run, s.interim);
      s.run = [];
      s.interim = "";
      const again = !s.halted && !FATAL[s.error] && live(s) && Date.now() - s.heard < IDLE_MS;
      s.error = null;
      if (again) { try { rec.start(); return; } catch (err) { /* fall through */ } }
      finish(s);
    };

    // Record from the same moment recognition starts, so no words are missing from the audio.
    if (wantAudio()) {
      try {
        s.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      } catch (e) { s.stream = null; }
      if (s.halted) { releaseMic(s); finish(s); return; }  // stopped while the mic opened
      if (s.stream) record(s);
    }
    try { rec.start(); } catch (err) { finish(s); }
  }

  // Graceful: the recogniser delivers its last words; the audio is sent at once.
  function stop(s) {
    s.halted = true;
    if (active === s) active = null;
    releaseMic(s);
    setUi(s.btn, s.parts.length ? "transcribing" : "idle");
    try { s.rec.stop(); } catch (e) { finish(s); }
  }

  // Immediate: keep what's shown, drop words still in flight (the user is typing).
  function cancel(s) {
    s.halted = true;
    s.rec.onresult = null;
    if (active === s) active = null;
    releaseMic(s);
    setUi(s.btn, s.parts.length ? "transcribing" : "idle");
    try { s.rec.abort(); } catch (e) { finish(s); }
  }

  // Recognition is over for good: swap in the accurate transcript once every segment is back.
  function finish(s) {
    if (s.finished) return;
    s.finished = true;
    s.halted = true;
    if (active === s) active = null;
    releaseMic(s);
    const rough = compose("", s.done, "");
    const done = () => {
      pending.delete(s);
      if (active?.btn !== s.btn) setUi(s.btn, "idle");
      s.resolve();
    };
    if (!s.parts.length || !rough) { done(); return; }
    setUi(s.btn, "transcribing");
    Promise.all(s.parts).then((texts) => {
      const f = s.field;
      if (!s.abandoned && texts.every((t) => t !== null) && live(s)) {
        const accurate = texts.filter(Boolean).join(" ");
        const next = upgrade(f.value, rough, accurate);
        if (next !== f.value) {
          if (active && active.field === f) active.prefix = upgrade(active.prefix, rough, accurate);
          f.value = next;
          f.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }
      done();
    });
  }

  function enhance(field) {
    if (field.dataset.dictateReady) return;
    field.dataset.dictateReady = "1";
    const focused = document.activeElement === field;
    const wrap = document.createElement("div");
    wrap.className = "dictate-wrap";
    field.parentNode.insertBefore(wrap, field);
    wrap.appendChild(field);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dictate-btn";
    btn.setAttribute("aria-label", "Dictate");
    btn.innerHTML = MIC;
    setUi(btn, "idle");
    wrap.appendChild(btn);
    if (focused) field.focus();

    btn.addEventListener("mousedown", (e) => e.preventDefault());  // keep the caret in the field
    btn.addEventListener("click", () => {
      if (active && active.field === field) stop(active);
      else start(field, btn);
      field.focus();
    });
    field.addEventListener("keydown", (e) => {
      if (!active || active.field !== field) return;
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); stop(active); return; }
      if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;
      cancel(active);
    });
  }

  const scan = (root) => {
    if (root.matches && root.matches("textarea[data-dictate]")) enhance(root);
    if (root.querySelectorAll) root.querySelectorAll("textarea[data-dictate]").forEach(enhance);
  };
  scan(document);
  new MutationObserver((records) => {
    for (const r of records) r.addedNodes.forEach((n) => { if (n.nodeType === 1) scan(n); });
    if (active && !active.field.isConnected) stop(active);  // view re-rendered: release the mic
  }).observe(document.body, { childList: true, subtree: true });
})();
