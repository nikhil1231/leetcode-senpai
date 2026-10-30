/* Dictation: a mic button on prose textareas, using the browser's own speech
   recognition (Chrome, Edge, Safari). Mark a field with data-dictate — fields
   rendered later are picked up too. Without browser support no button shows.
   Words stream into the field as you speak and are appended after what's there;
   the button or Esc stops listening, typing in the field takes over at once. */
(function () {
  "use strict";

  // Existing text + what's been heard, spaced so speech never glues onto a word.
  function compose(prefix, finals, interim) {
    const spoken = [...finals, interim].map((s) => (s || "").trim()).filter(Boolean).join(" ");
    if (!spoken) return prefix;
    return prefix + (prefix && !/\s$/.test(prefix) ? " " : "") + spoken;
  }

  if (typeof module !== "undefined" && module.exports) { module.exports = { compose }; return; }

  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) return;

  const IDLE_MS = 60000;  // give up re-listening after a minute of silence
  const FATAL = {
    "not-allowed": "Microphone access is blocked for this site.",
    "service-not-allowed": "Dictation isn't available in this browser.",
    "audio-capture": "No microphone found.",
    "network": "Dictation needs a network connection.",
    "language-not-supported": "Dictation doesn't support this language.",
  };
  const MIC = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0013 0M12 18v2.5"/></svg>';
  let active = null;

  const notify = (msg) => { if (typeof toast === "function") toast(msg); };
  const live = (s) => s.field.isConnected && !s.field.disabled;

  function render(s) {
    const f = s.field;
    f.value = compose(s.prefix, [...s.done, ...s.run], s.interim);
    f.scrollTop = f.scrollHeight;
    f.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function setUi(s, on) {
    s.btn.classList.toggle("is-listening", on);
    s.btn.setAttribute("aria-pressed", String(on));
    s.btn.title = on ? "Stop dictation (Esc)" : "Dictate";
  }

  function start(field, btn) {
    if (active) stop(active);
    const rec = new Recognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || "en-US";
    const s = { field, btn, rec, prefix: field.value, done: [], run: [], interim: "",
                stopping: false, error: null, heard: Date.now() };

    rec.onresult = (e) => {
      if (!live(s)) { cancel(s); return; }
      const finals = [], interim = [];
      for (const r of e.results) (r.isFinal ? finals : interim).push(r[0].transcript);
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
      const again = !s.stopping && !FATAL[s.error] && live(s) && Date.now() - s.heard < IDLE_MS;
      s.error = null;
      if (again) { try { rec.start(); return; } catch (err) { /* fall through to stopped */ } }
      if (active === s) active = null;
      setUi(s, false);
    };

    active = s;
    setUi(s, true);
    try { rec.start(); } catch (err) { active = null; setUi(s, false); }
  }

  // Graceful: let the recogniser deliver the last words it heard.
  function stop(s) {
    s.stopping = true;
    if (active === s) active = null;
    setUi(s, false);
    s.rec.stop();
  }

  // Immediate: keep what's shown, drop anything still in flight (the user is typing).
  function cancel(s) {
    s.stopping = true;
    s.rec.onresult = null;
    if (active === s) active = null;
    setUi(s, false);
    s.rec.abort();
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
    btn.title = "Dictate";
    btn.setAttribute("aria-label", "Dictate");
    btn.setAttribute("aria-pressed", "false");
    btn.innerHTML = MIC;
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
