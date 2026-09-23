// Self-directed, small exercises. No timers, sessions, or review-card advances.
(function () {
  const { $, escapeHtml: esc, api, loader } = window.H;
  let catalog = null, mode = null, topic = "", current = null, result = null;
  let loading = false, submitting = false, request = 0;
  const root = () => $("#tab-practice");

  async function renderPractice() {
    // Background solve updates must not wipe an answer being composed here.
    if (current || loading) return;
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

  function renderLibrary() {
    const topics = [...new Set(catalog.exercises.filter(x => !mode || x.mode === mode).map(x => x.topic))].sort();
    if (!topics.includes(topic)) topic = "";
    const exercises = catalog.exercises.filter(x => (!mode || x.mode === mode) && (!topic || x.topic === topic));
    const latest = {};
    for (const r of catalog.results) if (!latest[r.template]) latest[r.template] = r;
    root().innerHTML = `
      <div class="light-intro"><div><span class="light-eyebrow">A small rep is enough</span>
        <h2>What feels manageable?</h2>
        <p>Pick an exercise. Take your time. Stop whenever you like.</p></div>
        <span class="light-note">Instant feedback · No coding setup</span></div>
      <div class="light-modes" role="group" aria-label="Activity type">
        ${catalog.modes.map(m => `<button class="light-mode ${mode === m.id ? "selected" : ""}" type="button" data-mode="${esc(m.id)}" aria-pressed="${mode === m.id}">
          <span class="light-duration">${esc(m.duration)}</span><strong>${esc(m.title)}</strong><span>${esc(m.description)}</span></button>`).join("")}
      </div>
      <div class="light-library-head"><h3>${mode ? esc(catalog.modes.find(m => m.id === mode).title) : "All exercises"} <span class="light-count">${exercises.length}</span></h3>
        <div class="light-filters">${mode ? '<button id="practice-all" class="button is-ghost is-small">All activities</button>' : ""}
        <label for="practice-topic">Topic</label><div class="select"><select id="practice-topic"><option value="">All topics</option>${topics.map(t => `<option${topic === t ? " selected" : ""}>${esc(t)}</option>`).join("")}</select></div></div></div>
      <div class="light-exercises">${exercises.map(x => {
        const r = latest[x.id];
        const status = r ? (r.revealed ? "Answer viewed" : r.correct ? "Last answer correct" : "Worth another look") : "";
        return `<button class="light-exercise" type="button" data-exercise="${esc(x.id)}">
          <span><span class="light-exercise-topic">${esc(x.topic)}${!mode ? ` · ${esc(catalog.modes.find(m => m.id === x.mode).title)}` : ""}</span>
            <strong>${esc(x.title)}</strong>${status ? `<span class="light-history">${status}</span>` : ""}</span><span aria-hidden="true">↗</span></button>`;
      }).join("")}</div>
      <p class="light-footnote">These small reps have their own history. They don’t change your solve counts, mastery, or review schedule.</p>`;
    root().querySelectorAll("[data-mode]").forEach(b => b.addEventListener("click", () => {
      mode = mode === b.dataset.mode ? null : b.dataset.mode; topic = ""; renderLibrary();
    }));
    root().querySelectorAll("[data-exercise]").forEach(b => b.addEventListener("click", () => openQuestion(b.dataset.exercise)));
    $("#practice-topic").addEventListener("change", e => { topic = e.target.value; renderLibrary(); });
    $("#practice-all")?.addEventListener("click", () => { mode = null; topic = ""; renderLibrary(); });
  }

  function back() {
    request++;
    current = null; result = null; loading = false; submitting = false;
    renderLibrary();
  }

  async function openQuestion(template) {
    const ticket = ++request;
    loading = true; current = null; result = null;
    root().innerHTML = `<button id="practice-back" class="button is-ghost">← Exercises</button>${loader("Loading exercise…")}`;
    $("#practice-back").addEventListener("click", back);
    try {
      const q = await api(`/practice/question/${encodeURIComponent(template)}`);
      if (ticket !== request) return;
      current = q;
      renderQuestion();
    } catch (e) {
      if (ticket !== request) return;
      root().innerHTML = `<button id="practice-back" class="button is-ghost">← Exercises</button><div class="empty"><p>${esc(e.message)}</p><button id="practice-retry" class="button">Try again</button></div>`;
      $("#practice-back").addEventListener("click", back);
      $("#practice-retry").addEventListener("click", () => openQuestion(template));
    } finally { if (ticket === request) loading = false; }
  }

  function renderQuestion() {
    const q = current;
    const m = catalog.modes.find(m => m.id === q.mode);
    root().innerHTML = `<div class="light-workspace">
      <button id="practice-back" class="button is-ghost">← Exercises</button>
      <article class="light-question" aria-labelledby="practice-question-title">
        <div class="light-question-meta"><span>${esc(m.title)} · ${esc(q.topic)}</span><span>${esc(m.duration)}</span></div>
        <h2 id="practice-question-title" tabindex="-1">${esc(q.title)}</h2><p class="light-prompt">${esc(q.prompt)}</p>
        ${q.code ? `<div class="light-code-label">Python</div><pre class="light-code"><code>${esc(q.code)}</code></pre>` : ""}
        <form id="practice-form">
          ${q.input_type === "choice" ? `<fieldset class="light-options"><legend>Choose one answer</legend>${q.options.map((o, i) => `<label class="light-option" data-option="${esc(o.id)}"><input type="radio" name="practice-answer" value="${esc(o.id)}" required><span class="light-letter" aria-hidden="true">${String.fromCharCode(65 + i)}</span><span>${esc(o.text)}</span></label>`).join("")}</fieldset>` :
            '<label class="label-sm" for="practice-input">Your counterexample</label><input id="practice-input" class="input mono" name="practice-answer" placeholder="[1, 2, 1]" autocomplete="off" spellcheck="false" maxlength="300" required><p class="light-input-help">Use square brackets and commas. We’ll compare the function’s output with the expected result.</p>'}
          <p id="practice-error" class="light-error" role="alert"></p>
          <div id="practice-actions" class="light-actions"><button class="button is-primary" id="practice-check" type="submit">Check answer</button><button class="button is-ghost" id="practice-reveal" type="button">Show answer</button></div>
        </form>
        <div id="practice-feedback" aria-live="polite"></div>
      </article></div>`;
    $("#practice-back").addEventListener("click", back);
    $("#practice-form").addEventListener("submit", e => { e.preventDefault(); submit(false); });
    $("#practice-reveal").addEventListener("click", () => submit(true));
    $("#practice-question-title").focus();
  }

  async function submit(reveal) {
    if (submitting || result || !current) return;
    const input = current.input_type === "choice" ? root().querySelector('input[name="practice-answer"]:checked') : $("#practice-input");
    const answer = input?.value.trim() || "";
    if (!reveal && !answer) { $("#practice-error").textContent = "Enter or choose an answer first."; return; }
    const q = current, ticket = request;
    submitting = true;
    $("#practice-error").textContent = "";
    root().querySelectorAll("#practice-form input, #practice-actions button").forEach(el => { el.disabled = true; });
    $("#practice-check").textContent = "Checking…";
    try {
      const r = await api("/practice/answer", "POST", { question_id: q.id, answer: reveal ? null : answer, reveal });
      // Keep history even if the user left the exercise during the save.
      catalog.results = [r, ...catalog.results.filter(x => x.question_id !== r.question_id)].slice(0, 200);
      if (ticket !== request) { if (!current && !loading) renderLibrary(); return; }
      result = r;
      renderFeedback();
    } catch (e) {
      if (ticket !== request) return;
      $("#practice-error").textContent = e.message;
      root().querySelectorAll("#practice-form input, #practice-actions button").forEach(el => { el.disabled = false; });
      $("#practice-check").textContent = "Check answer";
    } finally { if (ticket === request) submitting = false; }
  }

  function renderFeedback() {
    const r = result;
    const heading = r.revealed ? "Here’s the answer" : r.correct ? "That’s right" : current.input_type === "array" ? "This input doesn’t expose the bug" : "Not quite";
    root().querySelectorAll("[data-option]").forEach(el => {
      el.classList.toggle("is-correct", el.dataset.option === r.correct_option);
    });
    const outputs = current.input_type === "array" ? `<div class="light-output"><span>Expected <code>${esc(JSON.stringify(r.expected))}</code></span><span>Function returned <code>${esc(JSON.stringify(r.actual))}</code></span></div>` : "";
    const example = current.input_type === "array" && !r.correct && !r.revealed
      ? `<p>A breaking input: <code>${esc(r.solution)}</code>. Expected <code>${esc(JSON.stringify(r.example_expected))}</code>, returned <code>${esc(JSON.stringify(r.example_actual))}</code>.</p>` : "";
    $("#practice-actions").innerHTML = "";
    $("#practice-feedback").innerHTML = `<section class="light-feedback ${r.correct ? "is-correct" : ""}"><h3 tabindex="-1" id="practice-feedback-title">${heading}</h3>
      ${r.revealed || current.input_type === "choice" ? `<p class="light-solution">${esc(r.solution)}</p>` : ""}${outputs}${example}<p>${esc(r.explanation)}</p></section>
      <div class="light-actions"><button id="practice-return" class="button is-primary">Choose an exercise</button><button id="practice-another" class="button is-ghost">${catalog.exercises.find(x => x.id === current.template).variants ? "Another variation" : "Try again"}</button></div>`;
    $("#practice-return").addEventListener("click", back);
    $("#practice-another").addEventListener("click", () => openQuestion(current.template));
    $("#practice-feedback-title").focus();
  }

  window.Views.renderPractice = renderPractice;
})();
