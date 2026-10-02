// In-app editor for a live run: the statement, a CodeMirror buffer, and Run /
// Submit judged by LeetCode through the server. Exposed as window.Editor.
//
// It also keeps the run's change log (server/recording.py). Every TICK_MS the
// buffer is compared with what was last logged; only a change becomes an event,
// so minutes spent thinking log nothing. Unsent events live in localStorage until
// the server has them — a reload, a crash or a dropped request loses no code —
// and any still unsent ride along with the next Run or Submit, so the log always
// holds what led to the code being judged.
//
// A live hint can point at lines of the code: a tint and a ghost margin note,
// drawn over the buffer, never in it — the code and its log are untouched.
//
// A new run opens before the server has it: mounted from what the plan modal
// prefetched, under no session id, until the start answers and it's adopted.
// Nothing reaches the server until then — sends wait on `ready`.
(function () {
  const { $, $$, escapeHtml: esc, api, toast, sanitizeProblemHtml } = window.H;
  const TICK_MS = 10000;
  const FLUSH_MS = 30000;
  const STORE_PREFIX = "editor-run:v1:";
  const LAYOUT_KEY = "editor-layout:v1";
  const STATEMENT_PCT = { min: 20, max: 70, def: 42 };

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
    // A finished run's draft has no future; don't write it back. A pending one
    // has no key yet — it's seconds old, and adoption writes it.
    if (!r || r.finished || !r.sessionId) return;
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
  // later delta land before the run it follows. None before the run has an id.
  function send(fn) {
    const r = run;
    const next = (r.sessionId ? r.chain : r.chain.then(() => r.ready)).then(fn);
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
    }).catch(() => { /* the run never started: nothing to send */ });
  }

  // ---- judging ------------------------------------------------------------------
  // A submit goes on your LeetCode record and a wrong one counts against the
  // solve, so one made without testing gets a second look: code never Run as it
  // stands, or — before the first submit — planned edge cases left unticked.
  // Submitting again (button or shortcut) goes ahead; a stray Ctrl/⌘+Enter
  // doesn't.
  function submitDoubts(r) {
    const doubts = [];
    if (r.lastRunCode !== r.lastLogged && r.runsLeft !== 0) doubts.push("You haven't run this version of the code.");
    const open = r.edges.filter((c) => !r.checked.includes(c));
    if (!r.submits && open.length) doubts.push(`Planned edge cases not ticked: ${open.join(", ")}.`);
    return doubts;
  }

  function showDoubts(doubts) {
    showConsole("result");
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
    if (kind === "run" && r.runsLeft === 0) {
      showError("Interview mode: no Runs left — trace it by hand, then submit.");
      return;
    }
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
      if (res.runs_left != null) r.runsLeft = res.runs_left;
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
    }).finally(() => { if (run === r) { setJudging(false); setRunsLeft(r); } });
  }

  function setRunsLeft(r) {
    if (r.runsLeft == null) return;
    $("#editor-run").textContent = `Run (${r.runsLeft} left)`;
    $("#editor-run").disabled = r.judging || !r.canJudge || r.runsLeft === 0;
  }

  function setJudging(on, kind) {
    run.judging = on;
    $("#editor-run").disabled = on || !run.canJudge || run.runsLeft === 0;
    $("#editor-submit").disabled = on || !run.canJudge;
    if (!on) return;
    showConsole("result");
    $("#editor-result").innerHTML = `<p class="small editor-pending">${kind === "run" ? "Running" : "Judging"}…</p>`;
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
    showConsole("result");
    $("#editor-result").innerHTML = `<p class="editor-verdict is-bad">${esc(message)}</p>`;
  }

  // One case at a time, picked from a row of tabs — the first failing one to
  // start — so a run's results fit beside the input instead of below the fold.
  function showRun(r) {
    const head = r.error
      ? `<p class="editor-verdict is-bad">${esc(r.status || "Error")}</p><pre class="editor-error">${esc(r.error)}</pre>`
      : `<p class="editor-verdict ${r.passed ? "is-good" : "is-bad"}">${r.passed ? "All cases match" : "Mismatch"}
           <span class="small">${r.correct ?? 0}/${r.total} cases · ${esc(r.runtime || "")}</span></p>`;
    const cases = r.error ? [] : (r.cases || []);
    const ok = (c) => c.output === c.expected;
    const tabs = cases.length ? `<div class="editor-case-tabs" role="tablist">${cases.map((c, i) =>
      `<button class="editor-case-tab ${ok(c) ? "is-good" : "is-bad"}" type="button" role="tab" data-i="${i}">
         ${ok(c) ? "✓" : "✗"} Case ${i + 1}</button>`).join("")}</div><div id="editor-case" role="tabpanel"></div>` : "";
    $("#editor-result").innerHTML = head + tabs;
    if (!cases.length) return;
    const pick = (i) => {
      const c = cases[i];
      $$("#editor-result .editor-case-tab").forEach((t) => t.setAttribute("aria-selected", String(Number(t.dataset.i) === i)));
      $("#editor-case").innerHTML = `${block("Input", c.input)}
        <div class="editor-io-pair">${block("Output", c.output, ok(c) ? "" : "is-off")}${block("Expected", c.expected)}</div>
        ${block("Stdout", c.stdout)}`;
    };
    $("#editor-result .editor-case-tabs").addEventListener("click", (e) => {
      const tab = e.target.closest(".editor-case-tab");
      if (tab) pick(Number(tab.dataset.i));
    });
    pick(Math.max(0, cases.findIndex((c) => !ok(c))));
  }

  function showSubmit(r) {
    const good = r.accepted;
    const beats = [
      r.runtime_percentile != null ? `runtime beats ${Math.round(r.runtime_percentile)}%` : "",
      r.memory_percentile != null ? `memory beats ${Math.round(r.memory_percentile)}%` : "",
    ].filter(Boolean).map((b) => ` · ${b}`).join("");
    $("#editor-result").innerHTML = `
      <p class="editor-verdict ${good ? "is-good" : "is-bad"}">${esc(r.status || "")}
        <span class="small">${r.correct ?? "?"}/${r.total ?? "?"} tests${esc(beats)}</span></p>
      ${block("Error", r.error, "is-error")}
      ${block("Failing input", r.input)}
      <div class="editor-io-pair">${block("Output", r.output, "is-off")}${block("Expected", r.expected)}</div>
      ${block("Stdout", r.stdout)}
      ${!good && r.input ? `<button id="editor-add-case" class="button is-small" type="button">Add to test input</button>` : ""}`;
    if (!good && r.input) $("#editor-add-case").addEventListener("click", () => addCase(r.input));
  }

  // The input that broke a submit becomes a case you can Run against.
  function addCase(input) {
    if (!run) return;
    showConsole("tests");
    const box = $("#editor-input");
    const current = box.value.replace(/\s+$/, "");
    if (!current.includes(input.trim())) {
      box.value = current ? `${current}\n${input.trim()}` : input.trim();
    }
    run.input = box.value;
    persist();
    toast("Added to the test input");
  }

  // ---- hint marks -------------------------------------------------------------------
  // Up to two lines a hint points at. They follow their lines through edits and
  // go when cleared, when the next hint lands, or with the run.
  function marksExtension(CM) {
    if (!CM.StateField) return null;
    const set = CM.StateEffect.define();
    class Note extends CM.WidgetType {
      constructor(text) { super(); this.text = text; }
      eq(other) { return other.text === this.text; }
      toDOM() {
        const el = document.createElement("span");
        el.className = "cm-hint-note";
        el.textContent = `# ${this.text}`;
        return el;
      }
    }
    const field = CM.StateField.define({
      create: () => CM.Decoration.none,
      update(deco, tr) {
        deco = deco.map(tr.changes);
        for (const e of tr.effects) if (e.is(set)) deco = e.value;
        return deco;
      },
      provide: (f) => CM.EditorView.decorations.from(f),
    });
    return { field, set, Note };
  }

  // The line a mark meant: where it was if the text still matches, else the
  // nearest line with that text — the code may have moved while the hint came.
  function findLine(doc, mark) {
    const fits = (n) => n >= 1 && n <= doc.lines && doc.line(n).text === mark.text;
    if (fits(mark.line)) return doc.line(mark.line);
    for (let d = 1; d < doc.lines; d++) {
      if (fits(mark.line - d)) return doc.line(mark.line - d);
      if (fits(mark.line + d)) return doc.line(mark.line + d);
    }
    return null;
  }

  // Draws a hint's marks in place of any before; the count drawn.
  function showMarks(marks) {
    const r = run;
    if (!r || !r.view || !r.marks) return 0;
    const { CM } = r;
    const doc = r.view.state.doc;
    const lines = [];
    for (const m of marks || []) {
      const line = findLine(doc, m);
      if (line && !lines.some((l) => l.line.number === line.number)) lines.push({ line, note: m.note });
    }
    lines.sort((a, b) => a.line.from - b.line.from);
    const ranges = lines.flatMap(({ line, note }) => [
      CM.Decoration.line({ class: "cm-hint-line" }).range(line.from),
      CM.Decoration.widget({ widget: new r.marks.Note(note), side: 1 }).range(line.to),
    ]);
    const effects = [r.marks.set.of(CM.Decoration.set(ranges, true))];
    if (lines.length) effects.push(CM.EditorView.scrollIntoView(lines[0].line.from, { y: "center" }));
    r.view.dispatch({ effects });
    return lines.length;
  }

  function clearMarks() { showMarks([]); }

  const code = () => (run && run.view ? currentCode() : null);

  // ---- mount / unmount --------------------------------------------------------------
  // The plan's edge cases, to tick off as runs cover them. Ticks are logged, so
  // the review can see which ones were actually tested.
  function edgesHtml(cases) {
    if (!cases.length) return "";
    return `<div id="editor-edges" class="editor-edges">
      <span class="label-sm">Planned edge cases — tick each once you've checked it</span>
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

  // An optimize run: the Accepted it's trying to beat.
  function optimizingHtml(o) {
    const pct = (v) => (v == null ? "—" : `${Math.round(v)}%`);
    return `<p class="small editor-optimizing">Optimizing your Accepted — runtime beats <b>${pct(o.runtime_percentile)}</b>,
      memory <b>${pct(o.memory_percentile)}</b>. A better Accepted replaces it; Stop optimizing keeps it.</p>`;
  }

  // In the app's editor, LeetCode's own page is the fallback, not the way in.
  const lcLink = (url, label = "Open on LeetCode") => url
    ? `<a class="editor-lc-link" href="${esc(url)}" target="_blank" rel="noopener">${esc(label)} ↗</a>` : "";

  const MOD = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl+";

  // The statement as one scroll, with tabs that jump to its Examples and
  // Constraints — found by their headings, so a statement without them gets
  // no tabs rather than empty ones.
  const SECTIONS = [["statement", "Statement", null], ["examples", "Examples", /^Example\b/i],
                    ["constraints", "Constraints", /^Constraints\b/i]];

  function statementParts(html) {
    const tpl = document.createElement("template");  // inert: nothing in it loads
    tpl.innerHTML = `<div>${html}</div>`;
    const box = tpl.content.firstChild;
    const found = [];
    for (const [key, label, re] of SECTIONS) {
      if (!re) continue;
      const head = [...box.querySelectorAll("strong, b")].find((el) => re.test(el.textContent.trim()));
      if (!head) continue;
      let el = head;
      while (el.parentElement && el.parentElement !== box) el = el.parentElement;
      el.dataset.sec = key;
      found.push([key, label]);
    }
    return { html: box.innerHTML, tabs: found.length ? [SECTIONS[0].slice(0, 2), ...found] : [] };
  }

  function statementHtml(state, url) {
    const raw = sanitizeProblemHtml(state.content_html);
    const { html, tabs } = raw ? statementParts(raw) : { html: "", tabs: [] };
    return `
      <div class="editor-statement">
        <div class="pane-head">
          <div class="pane-tabs" role="tablist">${tabs.map(([key, label], i) =>
            `<button class="pane-tab" type="button" role="tab" data-sec="${key}" aria-selected="${i === 0}">${label}</button>`).join("")
            || `<span class="pane-title">Statement</span>`}</div>
          <button id="editor-hide-statement" class="panel-toggle" type="button" aria-label="Hide the statement" title="Hide the statement">&#x2039;</button>
        </div>
        <div id="editor-statement-body" class="editor-statement-body recall-statement">${html
          || `<p class="small">Statement unavailable — it's on LeetCode.</p>`}
          <p class="editor-lc">${lcLink(url)}</p></div>
      </div>
      <button id="editor-show-statement" class="panel-rail" type="button" title="Show the statement">
        <span>&#x203A;</span><span class="panel-rail-label">Statement</span></button>`;
  }

  function paneHtml(state, url) {
    return `
      ${statementHtml(state, url)}
      <div id="editor-split" class="editor-split" role="separator" aria-orientation="vertical"
           aria-label="Resize the statement" tabindex="0" title="Drag to resize · double-click to reset"></div>
      <div class="editor-work">
        ${state.optimizing ? optimizingHtml(state.optimizing) : ""}
        <div id="editor-cm" class="editor-cm"></div>
        <p id="editor-notice" class="small editor-notice hidden"></p>
        <div id="editor-console" class="editor-console">
          <div class="console-head">
            <div class="pane-tabs" role="tablist">
              <button class="pane-tab" type="button" role="tab" data-tab="tests" aria-selected="true">Tests</button>
              <button class="pane-tab" type="button" role="tab" data-tab="result" aria-selected="false">Result</button>
            </div>
            <div class="console-tools">
              ${state.interview ? `<span class="editor-mode" title="No highlighting or auto-closing brackets, and a couple of Runs: trace it by hand">Interview mode</span>` : ""}
              <button id="editor-copy" class="console-tool" type="button">Copy</button>
              <button id="editor-reset" class="console-tool" type="button" title="Put the starter code back (${MOD}Z undoes it)">Reset</button>
              <span class="console-keys" title="Run (${MOD}') · Submit (${MOD}Enter)"><kbd>${MOD}'</kbd> run</span>
              <button id="editor-console-toggle" class="panel-toggle" type="button" aria-label="Collapse the console" title="Collapse the console">&#x2304;</button>
            </div>
          </div>
          <div class="console-panel" data-panel="tests">
            ${edgesHtml(state.planned_edge_cases || [])}
            <label class="label-sm" for="editor-input">Test input <span class="help-inline">one argument per line, case after case</span></label>
            <textarea id="editor-input" class="editor-input" rows="4" spellcheck="false"></textarea>
            ${state.can_judge ? "" : `<p class="small editor-nocookie"><button id="editor-set-cookie" class="console-tool" type="button">Set your LeetCode cookie</button> to run and submit.</p>`}
          </div>
          <div id="editor-result" class="console-panel editor-result hidden" data-panel="result" aria-live="polite">
            <p class="small editor-pending">Run (${MOD}') to see each case here.</p>
          </div>
        </div>
      </div>`;
  }

  // The run header's editor controls: Focus folds both side panels away.
  function headHtml() {
    return `
      <button id="editor-focus" class="button is-ghost" type="button" aria-pressed="false" title="Just the editor: fold away the statement and the coach">Focus</button>
      <button id="editor-run" class="button" type="button" title="Run on the test input (${MOD}')">Run</button>
      <button id="editor-submit" class="button is-primary" type="button" title="Submit (${MOD}Enter)">Submit</button>`;
  }

  // ---- console tabs -------------------------------------------------------------------
  function showConsole(tab) {
    $$("#editor-console .console-head .pane-tab").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === tab)));
    $$("#editor-console .console-panel").forEach((p) => p.classList.toggle("hidden", p.dataset.panel !== tab));
    if (readLayout().console) { saveLayout({ console: false }); applyLayout(); }
  }

  // Tabs jump within the one scroll; the tab lit is the section on screen.
  function bindStatementTabs() {
    const body = $("#editor-statement-body");
    const tabs = $$(".editor-statement .pane-tab");
    if (!tabs.length) return;
    const target = (key) => key === "statement" ? body : body.querySelector(`[data-sec="${key}"]`);
    const top = (el) => el === body ? 0 : el.offsetTop - body.offsetTop - 12;
    const light = (lit) => tabs.forEach((t) => t.setAttribute("aria-selected", String(t.dataset.sec === lit)));
    // A tab picked stays lit while its scroll plays out, and when there's no
    // room to scroll it into place.
    let picked = null, release = null;
    tabs.forEach((t) => t.addEventListener("click", () => {
      picked = t.dataset.sec;
      light(picked);
      clearTimeout(release);
      release = setTimeout(() => { picked = null; }, 800);
      body.scrollTo({ top: top(target(picked)), behavior: "smooth" });
    }));
    const spy = () => {
      if (picked) return;
      let lit = "statement";
      for (const t of tabs) if (t.dataset.sec !== "statement" && top(target(t.dataset.sec)) <= body.scrollTop + 4) lit = t.dataset.sec;
      // Scrolled to the end, the last section is the one being read.
      if (body.scrollTop > 0 && body.scrollTop + body.clientHeight >= body.scrollHeight - 2) lit = tabs[tabs.length - 1].dataset.sec;
      light(lit);
    };
    body.addEventListener("scroll", spy, { passive: true });
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

  // ---- layout -----------------------------------------------------------------------
  // How wide the statement is, and whether it's shown: a per-browser preference.
  function readLayout() {
    try { return JSON.parse(localStorage.getItem(LAYOUT_KEY)) || {}; } catch (_) { return {}; }
  }

  function saveLayout(patch) {
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify({ ...readLayout(), ...patch })); } catch (_) {}
  }

  // `hidden` is the statement folded away, `coach` the coach, `console` the
  // console down to its tab row.
  function applyLayout() {
    const { pct, hidden, coach, console: folded } = readLayout();
    const pane = $("#editor-pane");
    const w = Math.min(STATEMENT_PCT.max, Math.max(STATEMENT_PCT.min, Number(pct) || STATEMENT_PCT.def));
    pane.style.setProperty("--statement-w", `${w}%`);
    pane.classList.toggle("statement-hidden", Boolean(hidden));
    pane.classList.toggle("console-folded", Boolean(folded));
    $("#active-run").classList.toggle("coach-hidden", Boolean(coach));
    $("#editor-focus")?.setAttribute("aria-pressed", String(Boolean(hidden && coach)));
  }

  // Bound once: the coach column outlives any one editor.
  // Folded, the whole coach rail is the button that opens it.
  $("#run-coach").addEventListener("click", (e) => {
    const folded = $("#active-run").classList.contains("coach-hidden");
    if (!e.target.closest("#btn-coach-toggle") && !folded) return;
    saveLayout({ coach: !folded });
    applyLayout();
  });

  function bindSplit() {
    const pane = $("#editor-pane");
    const split = $("#editor-split");
    const setPct = (pct) => { saveLayout({ pct: Math.round(pct * 10) / 10 }); applyLayout(); };
    split.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      split.setPointerCapture(e.pointerId);
      const box = pane.getBoundingClientRect();
      const move = (ev) => setPct(((ev.clientX - box.left) / box.width) * 100);
      const up = () => {
        split.removeEventListener("pointermove", move);
        split.removeEventListener("pointerup", up);
      };
      split.addEventListener("pointermove", move);
      split.addEventListener("pointerup", up);
    });
    split.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const pct = Number(readLayout().pct) || STATEMENT_PCT.def;
      setPct(pct + (e.key === "ArrowLeft" ? -2 : 2));
    });
    split.addEventListener("dblclick", () => setPct(STATEMENT_PCT.def));
    const set = (patch) => { saveLayout(patch); applyLayout(); };
    $("#editor-hide-statement").addEventListener("click", () => set({ hidden: true }));
    $("#editor-show-statement").addEventListener("click", () => set({ hidden: false }));
    $("#editor-focus").addEventListener("click", () => {
      const { hidden, coach } = readLayout();
      const focused = hidden && coach;
      set({ hidden: !focused, coach: !focused });
    });
    $("#editor-console-toggle").addEventListener("click", () => set({ console: !readLayout().console }));
    $$("#editor-console .console-head .pane-tab").forEach((t) =>
      t.addEventListener("click", () => showConsole(t.dataset.tab)));
  }

  // Back to the starter code. Logged as a marker plus a checkpoint, so the
  // review sees a deliberate restart rather than a mass deletion.
  function resetToStarter() {
    const r = run;
    if (!r || !r.view || r.readOnlyNow || !r.starter) return;
    tick();
    if (r.lastLogged === r.starter) return;
    r.view.dispatch({ changes: { from: 0, to: r.view.state.doc.length, insert: r.starter } });
    note("reset");
    r.queue.push({ t: nowMs(), k: "c", code: r.starter });
    r.lastLogged = r.starter;
    persist();
    toast("Back to the starter code — Ctrl/⌘ + Z undoes it.");
  }

  function onVisibility() {
    if (document.visibilityState === "hidden") goAway();
    else comeBack();
  }

  // `prefetched` is the editor state when the caller already holds it: from the
  // plan modal for a run not yet started, or from the start's own answer.
  async function mount(active, prefetched = null) {
    if (!active || active.surface !== "editor") return unmount();
    if (run && active.session_id && run.sessionId === active.session_id) return setPaused(active.is_paused);
    if (run && !run.sessionId && active.session_id && run.slug === active.slug) {
      return adopt(run, active, prefetched);
    }
    await unmount();
    const pane = $("#editor-pane");
    pane.classList.remove("hidden");
    $("#active-run").classList.add("has-editor");
    document.body.classList.add("has-editor-run");
    pane.innerHTML = `<p class="small">Opening the editor…</p>`;
    let settle;
    const r = {
      sessionId: active.session_id || null, slug: active.slug,
      startedAtMs: active.started_at * 1000, offsetMs: 0,
      view: null, lastLogged: "", queue: [], inflight: null, seq: 0,
      chain: Promise.resolve(), judging: false, canJudge: false, timers: [],
      edges: [], checked: [], lastRunCode: null, submits: 0, confirming: false,
      hasState: Boolean(prefetched),
    };
    r.ready = active.session_id ? Promise.resolve()
      : new Promise((resolve, reject) => { settle = { resolve, reject }; });
    r.settle = settle;
    r.ready.catch(() => {});
    run = r;
    // Pending with nothing to show yet: the start's answer brings the state.
    if (!r.sessionId && !prefetched) { loadCodeMirror().catch(() => {}); return; }
    let state, CM;
    try {
      [state, CM] = await Promise.all([
        prefetched || api(`/editor/state?session_id=${encodeURIComponent(active.session_id)}`),
        loadCodeMirror()]);
    } catch (e) {
      if (run === r) pane.innerHTML = `<p class="small">${esc(e.message)} ${lcLink(active.url, "Solve it on LeetCode instead")}</p>`;
      return;
    }
    if (run !== r) return;
    build(r, state, CM, active);
  }

  // The pending run now exists on the server: take its id and clock, and open
  // the buffer if the plan modal didn't have what it needed.
  async function adopt(r, active, state) {
    r.sessionId = active.session_id;
    r.startedAtMs = active.started_at * 1000;
    if (state && state.now_ms != null) r.offsetMs = state.now_ms - (Date.now() - r.startedAtMs);
    if (!r.hasState) {
      r.hasState = true;
      let CM;
      try {
        [state, CM] = await Promise.all([
          state || api(`/editor/state?session_id=${encodeURIComponent(r.sessionId)}`), loadCodeMirror()]);
      } catch (e) {
        if (run === r) $("#editor-pane").innerHTML = `<p class="small">${esc(e.message)} ${lcLink(active.url, "Solve it on LeetCode instead")}</p>`;
        return;
      }
      if (run !== r) return;
      build(r, state, CM, active);
    }
    r.settle.resolve();
    persist(r);
    setPaused(active.is_paused);
  }

  function build(r, state, CM, active) {
    const pane = $("#editor-pane");
    if (!state.available) {
      pane.innerHTML = `<p class="small">This problem can't be edited here yet — ${lcLink(active.url, "solve it on LeetCode")}</p>`;
      return;
    }
    // Server time since the run began, so client- and server-written events share a clock.
    if (state.now_ms != null) r.offsetMs = state.now_ms - (Date.now() - r.startedAtMs);
    r.canJudge = state.can_judge;
    const saved = r.sessionId ? restore(r.sessionId) : null;
    let doc = state.code;
    // What was last run, else the problem's examples.
    r.input = state.last_input ?? (state.example_testcases || []).join("\n");
    r.edges = state.planned_edge_cases || [];
    r.runsLeft = state.runs_left ?? null;
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
    pane.innerHTML = paneHtml(state, active.url);
    $("#editor-head").innerHTML = headHtml();
    bindStatementTabs();
    $("#editor-input").value = r.input;
    $("#editor-input").addEventListener("input", () => { r.input = $("#editor-input").value; persist(r); });
    if (r.edges.length) {
      $("#editor-edges").addEventListener("change", onEdgeTick);
      $$("#editor-edges input").forEach((box) => { box.checked = r.checked.includes(r.edges[Number(box.dataset.i)]); });
    }

    r.readOnly = new CM.Compartment();
    r.marks = marksExtension(CM);
    r.view = new CM.EditorView({
      parent: $("#editor-cm"),
      state: CM.EditorState.create({
        doc,
        extensions: [
          CM.lineNumbers(), CM.highlightActiveLineGutter(), CM.highlightSpecialChars(),
          CM.history(), CM.drawSelection(), CM.indentOnInput(),
          CM.highlightActiveLine(), CM.indentUnit.of("    "), CM.python(),
          // Interview mode is a plain buffer: what a shared doc or whiteboard gives you.
          ...(state.interview ? [] : [CM.bracketMatching(), CM.closeBrackets(),
                                      CM.syntaxHighlighting(CM.oneDarkHighlightStyle)]),
          CM.keymap.of([
            { key: "Mod-'", run: () => { judge("run"); return true; } },
            { key: "Mod-Enter", run: () => { judge("submit"); return true; } },
            ...(state.interview ? [] : CM.closeBracketsKeymap),
            ...CM.defaultKeymap, ...CM.historyKeymap, CM.indentWithTab,
          ]),
          r.readOnly.of(CM.EditorState.readOnly.of(false)),
          ...(r.marks ? [r.marks.field] : []),
          CM.EditorView.theme({}, { dark: true }),
        ],
      }),
    });
    $("#editor-run").addEventListener("click", () => judge("run"));
    $("#editor-submit").addEventListener("click", () => judge("submit"));
    r.starter = state.starter_code;
    applyLayout();
    bindSplit();
    $("#editor-reset").addEventListener("click", resetToStarter);
    $("#editor-set-cookie")?.addEventListener("click", () => window.App.openCookieModal());
    $("#editor-copy").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(currentCode()); toast("Code copied"); }
      catch (_) { toast("Couldn't copy — select the code instead."); }
    });
    $("#editor-run").disabled = $("#editor-submit").disabled = !r.canJudge;
    setRunsLeft(r);
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
    // Never started (the start failed, or was replaced): nothing to send.
    if (!r.sessionId) r.settle.reject(new Error("The run didn't start."));
    const done = flush();
    run = null;
    r.timers.forEach(clearInterval);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("blur", goAway);
    window.removeEventListener("focus", comeBack);
    if (r.view) r.view.destroy();
    $("#editor-pane").innerHTML = "";
    $("#editor-head").innerHTML = "";
    $("#editor-pane").classList.add("hidden");
    $("#active-run").classList.remove("has-editor", "coach-hidden");
    document.body.classList.remove("has-editor-run");
    await done;
  }

  // A cookie set mid-run: judging works from the next Run on.
  function setCanJudge(on) {
    if (!run || !run.view || !on) return;
    run.canJudge = true;
    $(".editor-nocookie")?.remove();
    if (!run.judging) setJudging(false);
    setRunsLeft(run);
  }

  function setPaused(paused) {
    if (!run || !run.view) return;
    const { CM } = run;
    run.readOnlyNow = Boolean(paused);
    run.view.dispatch({ effects: run.readOnly.reconfigure(CM.EditorState.readOnly.of(Boolean(paused))) });
    $("#editor-pane").classList.toggle("is-paused", Boolean(paused));
  }

  // The run is over (solved, or cancelled): drop its local draft for good.
  function discard(sessionId) {
    if (!sessionId) return;
    if (run && run.sessionId === sessionId) run.finished = true;
    forget(sessionId);
  }

  // Fetched while the plan is written, so lock-in doesn't wait on it.
  function preload() { loadCodeMirror().catch(() => {}); }

  window.Editor = { mount, unmount, preload, setPaused, setCanJudge, discard, diff, tick, flush, judge,
                    code, showMarks, clearMarks, _state: () => run };
})();
