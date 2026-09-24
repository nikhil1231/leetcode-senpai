// Light practice: pick a kind of question and answer a stream of small ones.
// Each answer is shown as soon as it is submitted; Enter moves on, Esc stops.
// The server picks every next question from past outcomes (practice_queue.py).
// No timers, sessions, or review-card advances.
(function () {
  const { $, escapeHtml: esc, api, loader } = window.H;
  const MIXED = { id: "", title: "Mixed", duration: "30 sec – 3 min", description: "A bit of everything, weighted toward what you miss." };
  let catalog = null, topic = "", lastRun = null, roundSize = 0;
  let run = null;  // { mode, topic, recent, answered, correct, next }
  let current = null, result = null, loading = false, submitting = false, ticket = 0, assisted = false;
  const root = () => $("#tab-practice");
  const modeOf = id => [MIXED, ...catalog.modes].find(m => m.id === id);

  async function renderPractice() {
    // Background refreshes must not wipe a question or an answer being typed.
    if (run || loading) return;
    if (catalog) { renderLibrary(); return; }
    loading = true;
    root().innerHTML = loader("Loading light practice…");
    try {
      catalog = await api("/practice");
      renderLibrary();
    } catch (e) {
      root().innerHTML = `<div class="empty"><p>${esc(e.message)}</p><button id="practice-retry" class="button">Try again</button></div>`;
      $("#practice-retry").addEventListener("click", renderPractice);
    } finally { loading = false; }
  }

  function counts(mode) {
    const xs = catalog.exercises.filter(x => (!mode || x.mode === mode) && (!topic || x.topic === topic));
    return { total: xs.length, missed: xs.filter(x => catalog.status[x.id] === "missed").length,
             fresh: xs.filter(x => !catalog.status[x.id]).length };
  }

  function renderLibrary() {
    const topics = [...new Set(catalog.exercises.map(x => x.topic))].sort();
    root().innerHTML = `
      <div class="light-intro"><div><span class="light-eyebrow">A small rep is enough</span>
        <h2>Pick a kind of question</h2>
        <p>Questions keep coming until you stop. The ones you miss come back.</p></div>
        <div class="light-filters"><label for="practice-length">Round</label><div class="select"><select id="practice-length"><option value="0">Until I stop</option><option value="5">5 questions</option><option value="10">10 questions</option></select></div><label for="practice-topic">Topic</label><div class="select"><select id="practice-topic"><option value="">All topics</option>${topics.map(t => `<option${topic === t ? " selected" : ""}>${esc(t)}</option>`).join("")}</select></div></div></div>
      ${lastRun ? `<p class="light-last">Last run: ${lastRun.answered} answered, ${lastRun.correct} right.</p>` : ""}
      <div class="light-modes">${[MIXED, ...catalog.modes].map(m => {
        const c = counts(m.id);
        return `<button class="light-mode" type="button" data-mode="${esc(m.id)}"${c.total ? "" : " disabled"}>
          <span class="light-duration">${esc(m.duration)}</span><strong>${esc(m.title)}</strong><span>${esc(m.description)}</span>
          <span class="light-mode-stats">${c.total} question${c.total === 1 ? "" : "s"}${c.missed ? ` · <b>${c.missed} to revisit</b>` : ""}${c.fresh ? ` · ${c.fresh} new` : ""}</span></button>`;
      }).join("")}</div>
      <p class="light-footnote"><kbd>1</kbd>–<kbd>4</kbd> answer a choice · <kbd>Enter</kbd> checks and moves on · <kbd>Esc</kbd> stops. These reps don’t change your solve counts, mastery, or review schedule.</p>`;
    $("#practice-length").value = String(roundSize);
    $("#practice-length").addEventListener("change", e => { roundSize = Number(e.target.value); });
    root().querySelectorAll("[data-mode]").forEach(b => b.addEventListener("click", () => start(b.dataset.mode)));
    $("#practice-topic").addEventListener("change", e => { topic = e.target.value; renderLibrary(); });
  }

  function fetchNext() {
    const params = new URLSearchParams({ mode: run.mode, topic: run.topic, recent: run.recent.join(",") });
    const pending = api(`/practice/next?${params}`);
    pending.catch(() => {});  // awaited later, or dropped if the run stops first
    return pending;
  }

  function start(mode) {
    run = { mode, topic, recent: [], answered: 0, correct: 0, next: null, limit: roundSize };
    advance();
  }

  function stop() {
    ticket++;
    if (run && run.answered) lastRun = { answered: run.answered, correct: run.correct };
    run = null; current = null; result = null; loading = false; submitting = false;
    renderLibrary();
  }

  async function advance() {
    if (run.limit && run.answered >= run.limit) { stop(); return; }
    const t = ++ticket, pending = run.next || fetchNext();
    run.next = null; current = null; result = null; loading = true;
    root().innerHTML = `${runBar()}${loader("Loading the next question…")}`;
    wireBar();
    try {
      const q = await pending;
      if (t !== ticket) return;
      current = q; assisted = false;
      run.recent.push(q.template);
      renderQuestion();
    } catch (e) {
      if (t !== ticket) return;
      root().innerHTML = `${runBar()}<div class="empty"><p>${esc(e.message)}</p><button id="practice-retry" class="button">Try again</button></div>`;
      wireBar();
      $("#practice-retry").addEventListener("click", advance);
    } finally { if (t === ticket) loading = false; }
  }

  function runBar() {
    const m = modeOf(run.mode);
    return `<div class="light-run-bar"><button id="practice-stop" class="button is-ghost is-small" type="button">← Stop <kbd>Esc</kbd></button>
      <span class="light-run-title">${esc(m.title)}${run.topic ? ` · ${esc(run.topic)}` : ""}</span>
      <span id="practice-tally" class="light-tally">${tally()}</span></div>`;
  }
  const tally = () => run.limit ? `${run.answered} / ${run.limit} answered · ${run.correct} right` : run.answered ? `${run.answered} answered · ${run.correct} right` : "";
  function wireBar() { $("#practice-stop").addEventListener("click", stop); }

  function renderQuestion() {
    const q = current, choice = q.input_type === "choice";
    root().innerHTML = `<div class="light-workspace">${runBar()}
      <article class="light-question" aria-labelledby="practice-question-title">
        <div class="light-question-meta"><span>${esc(catalog.modes.find(m => m.id === q.mode).title)} · ${esc(q.topic)}</span></div>
        <h2 id="practice-question-title" tabindex="-1">${esc(q.title)}</h2><p class="light-prompt">${esc(q.prompt)}</p>
        ${q.code ? `<pre class="light-code"><code>${esc(q.code)}</code></pre>` : ""}
        ${choice ? `<div class="light-options" role="group" aria-label="Answer choices">${q.options.map((o, i) => `<button class="light-option" type="button" data-option="${esc(o.id)}"><kbd class="light-key">${i + 1}</kbd><span>${esc(o.text)}</span></button>`).join("")}</div>` :
          '<label class="label-sm" for="practice-input">Your counterexample</label><textarea id="practice-input" class="input mono light-input" rows="2" placeholder="[1, 2, 1]" autocomplete="off" spellcheck="false" maxlength="300"></textarea><p class="light-input-help">A JSON array. <kbd>Enter</kbd> checks · <kbd>Shift</kbd>+<kbd>Enter</kbd> adds a line.</p>'}
        <p id="practice-error" class="light-error" role="alert"></p>
        <div id="practice-actions" class="light-actions">${choice ? "" : '<button class="button is-primary" id="practice-check" type="button">Check <kbd>Enter</kbd></button>'}<button class="button is-ghost" id="practice-reveal" type="button">Show answer</button></div>
        <div id="practice-feedback" aria-live="polite"></div>
      </article></div>`;
    wireBar();
    root().querySelectorAll("[data-option]").forEach(b => b.addEventListener("click", () => submit(false, b.dataset.option)));
    $("#practice-reveal").addEventListener("click", () => submit(true));
    if (choice) { $("#practice-question-title").focus(); return; }
    const input = $("#practice-input");
    $("#practice-check").addEventListener("click", () => submit(false, input.value));
    input.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(false, input.value); }
    });
    input.focus();
  }

  function setBusy(busy) {
    root().querySelectorAll("#practice-input, #practice-actions button, [data-option]").forEach(el => { el.disabled = busy; });
  }

  async function submit(reveal, answer = "") {
    if (submitting || result || !current) return;
    answer = answer.trim();
    if (!reveal && !answer) { $("#practice-error").textContent = "Enter an answer first."; return; }
    const q = current, t = ticket;
    submitting = true;
    $("#practice-error").textContent = "";
    setBusy(true);
    try {
      if (!reveal && q.input_type === "array") {
        const check = await api("/practice/check", "POST", { question_id: q.id, answer });
        if (t !== ticket) return;
        if (!check.correct) {
          assisted = true;
          $("#practice-feedback").innerHTML = `<section class="light-feedback"><h3>Try another input</h3><p>Expected <code>${esc(JSON.stringify(check.expected))}</code>; returned <code>${esc(JSON.stringify(check.actual))}</code>. This input does not expose the bug.</p><details><summary>Hint</summary><p>Try the smallest allowed input, duplicates, or boundary values. Check which elements the code actually visits.</p></details></section>`;
          setBusy(false);
          $("#practice-input").focus();
          return;
        }
      }
      const r = await api("/practice/answer", "POST", { question_id: q.id, answer: reveal ? null : answer, reveal, assisted });
      // Keep the outcome even if the run stopped during the save.
      catalog.status[r.template] = r.correct ? "learned" : "missed";
      if (t !== ticket) { if (!run && !loading) renderLibrary(); return; }
      result = r;
      run.answered++;
      if (r.correct) run.correct++;
      run.next = run.limit && run.answered >= run.limit ? null : fetchNext();  // ready by the time the explanation is read
      renderFeedback(reveal ? null : answer);
    } catch (e) {
      if (t !== ticket) return;
      $("#practice-error").textContent = e.message;
      setBusy(false);
    } finally { if (t === ticket) submitting = false; }
  }

  function renderFeedback(answer) {
    const r = result, q = current, array = q.input_type === "array";
    const heading = r.revealed ? "Here’s the answer" : r.correct ? "That’s right" : array ? "This input doesn’t expose the bug" : "Not quite";
    root().querySelectorAll("[data-option]").forEach(el => {
      el.classList.toggle("is-correct", el.dataset.option === r.correct_option);
      el.classList.toggle("is-wrong", !r.correct && el.dataset.option === answer);
    });
    $("#practice-tally").textContent = tally();
    const outputs = array && !r.revealed ? `<div class="light-output"><span>Expected <code>${esc(JSON.stringify(r.expected))}</code></span><span>Function returned <code>${esc(JSON.stringify(r.actual))}</code></span></div>` : "";
    const solution = array
      ? (r.correct ? "" : `<p>A breaking input: <code>${esc(r.solution)}</code>${r.revealed ? "" : `. Expected <code>${esc(JSON.stringify(r.example_expected))}</code>, returned <code>${esc(JSON.stringify(r.example_actual))}</code>`}.</p>`)
      : (r.correct ? "" : `<p class="light-solution">${esc(r.solution)}</p>`);
    $("#practice-actions").innerHTML = "";
    $("#practice-feedback").innerHTML = `<section class="light-feedback ${r.correct ? "is-correct" : ""}"><h3>${heading}</h3>
      ${r.mistake ? `<p>${esc(r.mistake)}</p>` : ""}${outputs}${solution}<p>${esc(r.explanation)}</p></section>
      <div class="light-actions"><button id="practice-next" class="button is-primary" type="button">${run.limit && run.answered >= run.limit ? "Finish round" : "Next"} <kbd>Enter</kbd></button></div>`;
    $("#practice-next").addEventListener("click", advance);
    $("#practice-next").focus();
  }

  document.addEventListener("keydown", e => {
    if (!run || root().classList.contains("hidden") || e.metaKey || e.ctrlKey || e.altKey) return;
    if (document.querySelector(".overlay:not(.hidden)")) return;
    if (e.key === "Escape") { e.preventDefault(); stop(); return; }
    if (e.target && e.target.id === "practice-input") return;  // it handles Enter itself
    if (result && !loading && e.key === "Enter") { e.preventDefault(); advance(); return; }
    if (!result && !submitting && current && current.input_type === "choice") {
      const i = "1234".indexOf(e.key);
      if (e.key.length === 1 && i >= 0 && i < current.options.length) { e.preventDefault(); submit(false, current.options[i].id); }
    }
  });

  window.Views.renderPractice = renderPractice;
})();
