// In-app editor for a live run: the statement, a CodeMirror buffer, and Run /
// Submit judged by LeetCode through the server. Exposed as window.Editor.
//
// It also keeps the run's change log (server/recording.py). Every TICK_MS the
// buffer is compared with what was last logged; only a change becomes an event,
// so minutes spent thinking log nothing. Unsent events live in localStorage until
// the server has them — a reload, a crash or a dropped request loses no code —
// and any still unsent ride along with the next Run or Submit, so the log always
// holds what led to the code being judged.
(function () {
  const { $, $$, escapeHtml: esc, api, toast, sanitizeProblemHtml } = window.H;
  const TICK_MS = 10000;
  const FLUSH_MS = 30000;
  const STORE_PREFIX = "editor-run:v1:";

  let run = null;  // the mounted run: see mount()
  let cmLoading = null;

  // The single replacement turning prev into next (common prefix/suffix trimmed),
  // or null when nothing changed. Mirrors recording.diff on the server.
  function diff(prev, next) {
    if (prev === next) return null;
    let start = 0;
    const limit = Math.min(prev.length, next.length);
    while (start < limit && prev[start] === next[start]) start++;
    let endPrev = prev.length, endNext = next.length;
    while (endPrev > start && endNext > start && prev[endPrev - 1] === next[endNext - 1]) {
      endPrev--; endNext--;
    }
    return { f: start, to: endPrev, s: next.slice(start, endNext) };
  }

  function loadCodeMirror() {
    if (window.CM) return Promise.resolve(window.CM);
    if (!cmLoading) {
      cmLoading = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = `/vendor/codemirror.js?v=${window.ASSET_VER || ""}`;
        script.onload = () => resolve(window.CM);
        script.onerror = () => { cmLoading = null; reject(new Error("The editor failed to load.")); };
        document.head.appendChild(script);
      });
    }
    return cmLoading;
  }

  // ---- change log -------------------------------------------------------------
  const nowMs = () => Math.max(0, Date.now() - run.startedAtMs + run.offsetMs);
  const currentCode = (r = run) => (r.view ? r.view.state.doc.toString() : r.lastLogged);

  function persist(r = run) {
    // A finished run's draft has no future; don't write it back.
    if (!r || r.finished) return;
    try {
      localStorage.setItem(STORE_PREFIX + r.sessionId, JSON.stringify({
        code: currentCode(r), lastLogged: r.lastLogged, queue: r.queue,
        inflight: r.inflight, seq: r.seq, input: r.input, checked: r.checked,
        lastRunCode: r.lastRunCode, submits: r.submits,
      }));
    } catch (_) { /* storage full or blocked: the server copy still stands */ }
  }

  function restore(sessionId) {
    try { return JSON.parse(localStorage.getItem(STORE_PREFIX + sessionId)); } catch (_) { return null; }
  }

  function forget(sessionId) {
    try { localStorage.removeItem(STORE_PREFIX + sessionId); } catch (_) {}
  }

  function tick() {
    if (!run || !run.view) return;
    const code = currentCode();
    const d = diff(run.lastLogged, code);
    if (!d) return;
    // A change as big as the file itself is logged as the file.
    run.queue.push(d.s.length >= code.length && code.length
      ? { t: nowMs(), k: "c", code }
      : { t: nowMs(), k: "d", ...d });
    run.lastLogged = code;
    persist();
  }

  function note(kind, extra = {}) {
    if (!run) return;
    run.queue.push({ t: nowMs(), k: kind, ...extra });
    persist();
  }

  // One request at a time, in order: a log flush racing a judging would let a
  // later delta land before the run it follows.
  function send(fn) {
    const r = run;
    const next = r.chain.then(fn, fn);
    r.chain = next.catch(() => {});
    return next;
  }

  // Sends the batch in flight (retrying the very same one, so the server's seq
  // check can drop a duplicate), else the queue as a new batch.
  async function flushOnce(r) {
    if (!r.inflight) {
      if (!r.queue.length) return;
      r.inflight = { seq: r.seq + 1, events: r.queue.splice(0) };
      persist(r);
    }
    const res = await api("/editor/log", "POST", { session_id: r.sessionId, ...r.inflight });
    if (res && res.truncated) markTruncated(r);
    r.seq = r.inflight.seq;
    r.inflight = null;
    persist(r);
  }

  function flush() {
    if (!run) return Promise.resolve();
    const r = run;
    return send(async () => {
      try {
        await flushOnce(r);
        if (r.queue.length) await flushOnce(r);
      } catch (_) { /* kept in storage; the next flush retries */ }
    });
  }

  // ---- judging ------------------------------------------------------------------
  // A submit goes on your LeetCode record and a wrong one counts against the
  // solve, so one made without testing gets a second look: code never Run as it
  // stands, or — before the first submit — planned edge cases left unticked.
  // Submitting again (button or shortcut) goes ahead; a stray Ctrl/⌘+Enter
  // doesn't.
  function submitDoubts(r) {
    const doubts = [];
    if (r.lastRunCode !== r.lastLogged) doubts.push("You haven't run this version of the code.");
    const open = r.edges.filter((c) => !r.checked.includes(c));
    if (!r.submits && open.length) doubts.push(`Planned edge cases not ticked: ${open.join(", ")}.`);
    return doubts;
  }

  function showDoubts(doubts) {
    $("#editor-result").innerHTML = `<div class="editor-confirm">
      <p><b>Submit anyway?</b></p>${doubts.map((d) => `<p class="small">${esc(d)}</p>`).join("")}
      <div class="editor-confirm-actions">
        <button id="editor-confirm-run" class="button is-small" type="button">Run first</button>
        <button id="editor-confirm-submit" class="button is-small is-primary" type="button">Submit anyway</button>
        <span class="small">or Ctrl/⌘ + Enter again</span>
      </div></div>`;
    $("#editor-confirm-run").addEventListener("click", () => judge("run"));
    $("#editor-confirm-submit").addEventListener("click", () => judge("submit"));
    // Asked from the keyboard, the question may sit below the fold.
    $("#editor-result").scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }

  function judge(kind) {
    if (!run || run.judging) return;
    const r = run;
    tick();
    if (kind === "submit" && !r.confirming) {
      const doubts = submitDoubts(r);
      if (doubts.length) {
        r.confirming = true;
        showDoubts(doubts);
        return;
      }
    }
    r.confirming = false;
    const code = r.lastLogged;
    const dataInput = $("#editor-input").value;
    setJudging(true, kind);
    return send(async () => {
      if (r.inflight) await flushOnce(r);
      if (r.queue.length) {
        r.inflight = { seq: r.seq + 1, events: r.queue.splice(0) };
        persist(r);
      }
      const res = await api(`/editor/${kind}`, "POST", {
        session_id: r.sessionId, code, data_input: dataInput, t: nowMs(),
        seq: r.inflight ? r.inflight.seq : null, events: r.inflight ? r.inflight.events : [],
      });
      if (r.inflight) { r.seq = r.inflight.seq; r.inflight = null; persist(r); }
      return res;
    }).then((res) => {
      if (run !== r) return;
      if (!res.ok) { showError(res.error); return; }
      if (res.truncated) markTruncated(r);
      if (kind === "run") r.lastRunCode = code;
      else r.submits += 1;
      persist(r);
      if (kind === "run") showRun(res.result);
      else showSubmit(res.result);
      if (res.attempt_id) {
        discard(r.sessionId);
        window.App.onEditorSolved(res);
      }
    }).catch((e) => {
      if (run === r) showError(e.message || "Couldn't reach the server.");
    }).finally(() => { if (run === r) setJudging(false); });
  }

  function setJudging(on, kind) {
    run.judging = on;
    $("#editor-run").disabled = on || !run.canJudge;
    $("#editor-submit").disabled = on || !run.canJudge;
    if (on) $("#editor-result").innerHTML = `<p class="small editor-pending">${kind === "run" ? "Running" : "Judging"}…</p>`;
  }

  const block = (label, value, cls = "") => value == null || value === "" ? "" :
    `<div class="editor-io ${cls}"><span>${esc(label)}</span><pre>${esc(String(value))}</pre></div>`;

  // The server stopped keeping this run's edits (the log hit its size cap). Say
  // so once: judging still works, the review just won't see the rest.
  function markTruncated(r) {
    if (r.truncated || run !== r) return;
    r.truncated = true;
    const el = $("#editor-notice");
    el.textContent = "This run's edit log is full — Run and Submit still work, but the review will only see the first part.";
    el.classList.remove("hidden");
  }

  function showError(message) {
    $("#editor-result").innerHTML = `<p class="editor-verdict is-bad">${esc(message)}</p>`;
  }

  function showRun(r) {
    const head = r.error
      ? `<p class="editor-verdict is-bad">${esc(r.status || "Error")}</p><pre class="editor-error">${esc(r.error)}</pre>`
      : `<p class="editor-verdict ${r.passed ? "is-good" : "is-bad"}">${r.passed ? "All cases match" : "Mismatch"}
           <span class="small">${r.correct ?? 0}/${r.total} cases · ${esc(r.runtime || "")}</span></p>`;
    const cases = r.error ? "" : (r.cases || []).map((c, i) => {
      const ok = c.output === c.expected;
      return `<details class="editor-case ${ok ? "is-good" : "is-bad"}" ${ok ? "" : "open"}>
        <summary>${ok ? "✓" : "✗"} Case ${i + 1}</summary>
        ${block("Input", c.input)}${block("Output", c.output)}${block("Expected", c.expected)}
        ${block("Stdout", c.stdout)}
      </details>`;
    }).join("");
    $("#editor-result").innerHTML = head + cases;
  }

  function showSubmit(r) {
    const good = r.accepted;
    const beats = r.runtime_percentile != null ? ` · beats ${Math.round(r.runtime_percentile)}%` : "";
    $("#editor-result").innerHTML = `
      <p class="editor-verdict ${good ? "is-good" : "is-bad"}">${esc(r.status || "")}
        <span class="small">${r.correct ?? "?"}/${r.total ?? "?"} tests${esc(beats)}</span></p>
      ${block("Error", r.error, "is-error")}
      ${block("Failing input", r.input)}${block("Output", r.output)}${block("Expected", r.expected)}
      ${block("Stdout", r.stdout)}
      ${!good && r.input ? `<button id="editor-add-case" class="button is-small" type="button">Add to test input</button>` : ""}`;
    if (!good && r.input) $("#editor-add-case").addEventListener("click", () => addCase(r.input));
  }

  // The input that broke a submit becomes a case you can Run against.
  function addCase(input) {
    if (!run) return;
    const box = $("#editor-input");
    const current = box.value.replace(/\s+$/, "");
    if (!current.includes(input.trim())) {
      box.value = current ? `${current}\n${input.trim()}` : input.trim();
    }
    run.input = box.value;
    persist();
    toast("Added to the test input");
  }

  // ---- mount / unmount --------------------------------------------------------------
  // The plan's edge cases, to tick off as runs cover them. Ticks are logged, so
  // the review can see which ones were actually tested.
  function edgesHtml(cases) {
    if (!cases.length) return "";
    return `<div id="editor-edges" class="editor-edges">
      <span class="label-sm">Planned edge cases — tick each once a run covers it</span>
      ${cases.map((c, i) => `<label class="editor-edge"><input type="checkbox" data-i="${i}"> ${esc(c)}</label>`).join("")}
    </div>`;
  }

  function onEdgeTick(e) {
    const r = run;
    const box = e.target;
    const c = r && r.edges[Number(box.dataset.i)];
    if (!c) return;
    r.checked = r.checked.filter((x) => x !== c).concat(box.checked ? [c] : []);
    note("edge", { case: c, on: Boolean(box.checked) });
  }

  function paneHtml(state) {
    return `
      <div class="editor-statement recall-statement">${sanitizeProblemHtml(state.content_html)
        || `<p class="small">Statement unavailable — it's on LeetCode.</p>`}</div>
      <div class="editor-work">
        <div id="editor-cm" class="editor-cm"></div>
        <div class="editor-bar">
          <button id="editor-run" class="button" type="button" title="Run on the test input (Ctrl/⌘ + ')">Run</button>
          <button id="editor-submit" class="button is-primary" type="button" title="Submit (Ctrl/⌘ + Enter)">Submit</button>
          <button id="editor-copy" class="button is-ghost" type="button">Copy code</button>
          ${state.can_judge ? "" : `<span class="small editor-nocookie">Set your LeetCode cookie in Settings to run and submit.</span>`}
        </div>
        <p id="editor-notice" class="small editor-notice hidden"></p>
        ${edgesHtml(state.planned_edge_cases || [])}
        <label class="label-sm" for="editor-input">Test input</label>
        <textarea id="editor-input" class="editor-input" rows="4" spellcheck="false"></textarea>
        <div id="editor-result" class="editor-result" aria-live="polite"></div>
      </div>`;
  }

  // Away is the tab hidden *or* another window in front of it — a second
  // monitor or a docs window leaves the tab visible — whichever says so first.
  function goAway() {
    if (!run || run.away) return;
    run.away = true;
    tick();
    note("blur");
    flush();
  }

  function comeBack() {
    if (!run || !run.away) return;
    if (document.visibilityState === "hidden" || !document.hasFocus()) return;
    run.away = false;
    note("focus");
  }

  function onVisibility() {
    if (document.visibilityState === "hidden") goAway();
    else comeBack();
  }

  async function mount(active) {
    if (!active || active.surface !== "editor") return unmount();
    if (run && run.sessionId === active.session_id) return setPaused(active.is_paused);
    await unmount();
    const pane = $("#editor-pane");
    pane.classList.remove("hidden");
    $("#active-run").classList.add("has-editor");
    pane.innerHTML = `<p class="small">Opening the editor…</p>`;
    const r = {
      sessionId: active.session_id, startedAtMs: active.started_at * 1000, offsetMs: 0,
      view: null, lastLogged: "", queue: [], inflight: null, seq: 0,
      chain: Promise.resolve(), judging: false, canJudge: false, timers: [],
      edges: [], checked: [], lastRunCode: null, submits: 0, confirming: false,
    };
    run = r;
    let state, CM;
    try {
      [state, CM] = await Promise.all([
        api(`/editor/state?session_id=${encodeURIComponent(active.session_id)}`), loadCodeMirror()]);
    } catch (e) {
      if (run === r) pane.innerHTML = `<p class="small">${esc(e.message)} Solve it on LeetCode instead.</p>`;
      return;
    }
    if (run !== r) return;
    if (!state.available) {
      pane.innerHTML = `<p class="small">This problem can't be edited here yet — solve it on LeetCode.</p>`;
      return;
    }
    // Server time since the run began, so client- and server-written events share a clock.
    r.offsetMs = state.now_ms - (Date.now() - r.startedAtMs);
    r.canJudge = state.can_judge;
    const saved = restore(r.sessionId);
    let doc = state.code;
    // What was last run, else the problem's examples.
    r.input = state.last_input ?? (state.example_testcases || []).join("\n");
    r.edges = state.planned_edge_cases || [];
    r.checked = state.edges_checked || [];
    // This browser's copy wins unless another device has logged past it.
    if (saved && Number.isInteger(saved.seq) && saved.seq >= state.seq) {
      Object.assign(r, { lastLogged: saved.lastLogged, queue: saved.queue || [],
                         inflight: saved.inflight || null, seq: saved.seq });
      doc = saved.code;
      if (typeof saved.input === "string") r.input = saved.input;
      if (Array.isArray(saved.checked)) r.checked = saved.checked;
      r.lastRunCode = saved.lastRunCode ?? null;
      r.submits = saved.submits || 0;
    } else {
      Object.assign(r, { lastLogged: state.code, seq: state.seq });
    }
    pane.innerHTML = paneHtml(state);
    $("#editor-input").value = r.input;
    $("#editor-input").addEventListener("input", () => { r.input = $("#editor-input").value; persist(r); });
    if (r.edges.length) {
      $("#editor-edges").addEventListener("change", onEdgeTick);
      $$("#editor-edges input").forEach((box) => { box.checked = r.checked.includes(r.edges[Number(box.dataset.i)]); });
    }

    r.readOnly = new CM.Compartment();
    r.view = new CM.EditorView({
      parent: $("#editor-cm"),
      state: CM.EditorState.create({
        doc,
        extensions: [
          CM.lineNumbers(), CM.highlightActiveLineGutter(), CM.highlightSpecialChars(),
          CM.history(), CM.drawSelection(), CM.indentOnInput(), CM.bracketMatching(),
          CM.closeBrackets(), CM.highlightActiveLine(), CM.indentUnit.of("    "),
          CM.syntaxHighlighting(CM.oneDarkHighlightStyle), CM.python(),
          CM.keymap.of([
            { key: "Mod-'", run: () => { judge("run"); return true; } },
            { key: "Mod-Enter", run: () => { judge("submit"); return true; } },
            ...CM.closeBracketsKeymap, ...CM.defaultKeymap, ...CM.historyKeymap, CM.indentWithTab,
          ]),
          r.readOnly.of(CM.EditorState.readOnly.of(false)),
          CM.EditorView.theme({}, { dark: true }),
        ],
      }),
    });
    $("#editor-run").addEventListener("click", () => judge("run"));
    $("#editor-submit").addEventListener("click", () => judge("submit"));
    $("#editor-copy").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(currentCode()); toast("Code copied"); }
      catch (_) { toast("Couldn't copy — select the code instead."); }
    });
    $("#editor-run").disabled = $("#editor-submit").disabled = !r.canJudge;
    r.CM = CM;
    if (state.truncated) markTruncated(r);
    setPaused(active.is_paused);
    r.timers.push(setInterval(tick, TICK_MS), setInterval(flush, FLUSH_MS));
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", goAway);
    window.addEventListener("focus", comeBack);
    flush();  // anything a previous page load left unsent
  }

  async function unmount() {
    const r = run;
    if (!r) return;
    tick();
    const done = flush();
    run = null;
    r.timers.forEach(clearInterval);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("blur", goAway);
    window.removeEventListener("focus", comeBack);
    if (r.view) r.view.destroy();
    $("#editor-pane").innerHTML = "";
    $("#editor-pane").classList.add("hidden");
    $("#active-run").classList.remove("has-editor");
    await done;
  }

  function setPaused(paused) {
    if (!run || !run.view) return;
    const { CM } = run;
    run.view.dispatch({ effects: run.readOnly.reconfigure(CM.EditorState.readOnly.of(Boolean(paused))) });
    $("#editor-pane").classList.toggle("is-paused", Boolean(paused));
  }

  // The run is over (solved, or cancelled): drop its local draft for good.
  function discard(sessionId) {
    if (!sessionId) return;
    if (run && run.sessionId === sessionId) run.finished = true;
    forget(sessionId);
  }

  window.Editor = { mount, unmount, setPaused, discard, diff, tick, flush, judge,
                    _state: () => run };
})();
