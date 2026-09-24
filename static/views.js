// Tab renderers. Exposed as window.Views. Uses window.H, window.App, window.Charts.
(function () {
  const { $, $$, api, fmtTime, pct, badge, escapeHtml, toast, cxOptions, loader,
    beginRender } = window.H;
  const App = window.App, Charts = window.Charts;

  // Replace a stuck loader with a retry affordance when a fetch fails (e.g. the
  // dev server briefly restarts) so a view never hangs on the spinner forever.
  function showLoadError(el, retry) {
    el.innerHTML = `<div class="empty load-error">
      <p>Couldn't reach the server. It may be restarting.</p>
      <button class="button is-small retry-load">Retry</button></div>`;
    const btn = el.querySelector(".retry-load");
    if (btn) btn.addEventListener("click", retry);
  }

  const problemFilters = {
    search: "",
    category: "",
    difficulty: "",
    due_status: "all",
    attempted: "all",
    leech: "all",
    sort: "number",
  };
  const staticDifficulties = ["Easy", "Medium", "Hard"];

  async function loadProblemFacets() {
    try {
      return await api("/problems/facets");
    } catch (e) {
      let topicOptions = [];
      try {
        const topics = await api("/topics");
        topicOptions = topics.map((t) => ({ value: t.category, count: t.total }));
      } catch (ignored) {
        topicOptions = [];
      }
      return {
        categories: topicOptions,
        difficulties: staticDifficulties.map((value) => ({ value })),
        total: null,
      };
    }
  }

  function facetOptions(facets, selected) {
    return facets.map((f) => {
      const label = f.count == null ? f.value : `${f.value} (${f.count})`;
      return `<option value="${escapeHtml(f.value)}"${f.value === selected ? " selected" : ""}>${escapeHtml(label)}</option>`;
    }).join("");
  }

  function problemQueryString() {
    const query = new URLSearchParams();
    const search = problemFilters.search.trim();
    if (search) query.set("search", search);
    if (problemFilters.category) query.set("category", problemFilters.category);
    if (problemFilters.difficulty) query.set("difficulty", problemFilters.difficulty);
    if (problemFilters.due_status !== "all") query.set("due_status", problemFilters.due_status);
    if (problemFilters.attempted !== "all") query.set("attempted", problemFilters.attempted);
    if (problemFilters.leech !== "all") query.set("leech", problemFilters.leech);
    if (problemFilters.sort !== "number") query.set("sort", problemFilters.sort);
    const encoded = query.toString();
    return encoded ? `?${encoded}` : "";
  }

  function hasActiveProblemFilters() {
    return !!problemFilters.search.trim() || problemFilters.category || problemFilters.difficulty ||
      problemFilters.due_status !== "all" || problemFilters.attempted !== "all" ||
      problemFilters.leech !== "all";
  }

  function shortLocalDate(ts) {
    if (ts == null) return "-";
    const d = new Date(Number(ts) * 1000);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function compactState(state) {
    const label = (state || "-").replace(/_/g, " ");
    const cls = state ? ` state-${String(state).replace(/_/g, "-")}` : "";
    return `<span class="tag problem-state${cls}">${escapeHtml(label)}</span>`;
  }

  // ---- Today -------------------------------------------------------------------
  const laneOf = (it) => (it.kind === "new" ? "new" : it.kind === "drill" ? "drill" : "review");

  // In the queue, difficulty is a quiet coloured label rather than a filled chip:
  // every row has one, so filling them all turns the list into confetti. Filled
  // tags stay reserved for the exceptions (leech, recall, grading state).
  const diffLabel = (d) =>
    `<span class="q-diff diff-${String(d || "unknown").toLowerCase()}">${escapeHtml(d || "—")}</span>`;

  // Due dates read as "due 25 Jul" rather than a raw ISO string. How late a card
  // is only gets spelled out once it is genuinely overdue — inside the due
  // window the segment header already says the card is waiting, and labelling a
  // two-day slip "2d overdue" is the noise this board exists to remove.
  function dueLabel(iso, todayIso, overdue) {
    if (!iso) return null;
    const due = new Date(iso + "T00:00:00");
    if (isNaN(due)) return null;
    const today = new Date((todayIso || new Date().toISOString().slice(0, 10)) + "T00:00:00");
    const days = Math.round((today - due) / 86400000);
    const short = due.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    if (overdue) return { text: `due ${short} \u00B7 ${days}d late`, overdue: true };
    if (days === 0) return { text: "due today", overdue: false };
    return { text: `due ${short}`, overdue: false };
  }

  // Segment accent: what is late reads hot, what is waiting reads warm, what is
  // coming reads cool.
  const SEGMENT_TONE = { overdue: "is-late", due: "is-now", soon: "is-soon" };
  const SEGMENT_OPEN = new Set(["overdue", "due"]);

  async function renderToday() {
    const el = $("#tab-today");
    beginRender(el, "Loading your queue…");
    let q, reportWrap, mock, families, board;
    try {
      [q, reportWrap, mock, families, board] = await Promise.all([
        api("/today"), api("/report/latest").catch(() => ({ report: null })),
        api("/mock/status").catch(() => ({})),
        api("/topics/tree").catch(() => []),
        api("/reviews/schedule").catch(() => []),
      ]);
    } catch (e) {
      showLoadError(el, renderToday);
      return;
    }

    const prepHtml = [
      progressPanel(families),
      await weeklyReportBanner(reportWrap.report),
      mockCard(mock),
    ].filter(Boolean).join("");

    const recallLabel = (it) => {
      if (it.grading_status === "pending") return "Grading...";
      if (it.grading_status === "ready") return "View grade";
      if (it.grading_status === "failed") return "Retry";
      return "Recall";
    };
    const item = (it, overdue = false) => {
      const lane = laneOf(it);
      const due = dueLabel(it.due_date, q.date, overdue);
      // The row shows each fact once. A review's mode ("Quick recall" / "Full
      // re-solve") is already the button's label, so the meta line carries the
      // due date instead; only drills lead with their reason, because that
      // signal exists nowhere else on the row. The topic is left off: naming the
      // category hints at the technique before you've started.
      const meta = [], metaPlain = [];
      const addMeta = (plain, html) => { metaPlain.push(plain); meta.push(html || escapeHtml(plain)); };
      if (lane === "drill" && it.reason) addMeta(it.reason);
      if (due) addMeta(due.text, `<span class="${due.overdue ? "is-overdue" : ""}">${due.text}</span>`);
      const recall = it.mode === "recall";
      return `
      <li class="q-row" data-recall-card="${it.recall_attempt_id || ""}">
        <div class="q-main">
          <h3 class="q-title">${escapeHtml(it.title)}</h3>
          ${diffLabel(it.difficulty)}
          ${it.leech ? '<span class="tag is-danger is-light">leech</span>' : ""}
          ${it.grading_status === "pending" ? '<span class="tag recall-status-tag is-warning is-light">grading</span>' : ""}
          ${it.grading_status === "ready" ? '<span class="tag recall-status-tag is-success is-light">grade ready</span>' : ""}
          ${it.grading_status === "failed" ? '<span class="tag recall-status-tag is-danger is-light">failed</span>' : ""}
        </div>
        ${meta.length ? `<div class="q-meta" title="${escapeHtml(metaPlain.join(" · "))}">${
          meta.map((m) => `<span>${m}</span>`).join("")}</div>` : ""}
        <button class="button q-action ${recall ? "is-recall" : "is-start"}"
          data-slug="${it.slug}" data-kind="${it.kind}" data-mode="${it.mode || ""}"
          data-title="${escapeHtml(it.title)}" data-cat="${escapeHtml(it.category || "")}"
          data-attempt="${it.recall_attempt_id || ""}" data-status="${it.grading_status || ""}">
          ${recall ? recallLabel(it) : "Start"}</button>
      </li>`;
    };
    const list = (rows) => `<ul class="q-list">${rows.join("")}</ul>`;

    // Lane descriptions live in the header's tooltip rather than on the page:
    // they are onboarding copy, and re-reading them every morning is friction.
    const section = (title, count, desc, body, extraClass = "") => `
      <section class="today-section ${extraClass}">
        <header class="section-head">
          <h2 class="section-title" title="${escapeHtml(desc)}">${title}<span class="section-count">${count}</span></h2>
        </header>
        ${body}
      </section>`;
    // The review board shows every scheduled card, segmented by when it is due,
    // instead of an unexplained top-five. What is actionable is expanded; what is
    // merely coming up is one click away.
    const segment = (seg) => `
      <details class="q-seg ${SEGMENT_TONE[seg.key] || "is-later"}"${
        SEGMENT_OPEN.has(seg.key) ? " open" : ""}>
        <summary class="q-seg-head">
          <span class="q-seg-caret" aria-hidden="true"></span>
          <span class="q-seg-dot" aria-hidden="true"></span>
          <span class="q-seg-label">${escapeHtml(seg.label)}</span>
          <span class="q-seg-count">${seg.count}</span>
        </summary>
        ${list(seg.items.map((it) => item(it, seg.key === "overdue")))}
      </details>`;
    // "Reviews due" counts what is actually waiting; future segments are context.
    const waiting = board
      .filter((seg) => seg.key === "overdue" || seg.key === "due")
      .reduce((n, seg) => n + seg.count, 0);
    const reviews = section(
      "Reviews due",
      waiting,
      "Every scheduled review, grouped by when it is due. A card stays in \u201cDue now\u201d for a week before it counts as overdue.",
      board.length
        ? `<div class="q-board">${board.map(segment).join("")}</div>`
        : "<p class='empty'>No reviews scheduled yet — solve a few problems.</p>",
      "today-section-primary"
    );
    const newProblems = section(
      "New problems",
      q.new.length,
      "Fresh practice selected to expand coverage without crowding out spaced repetition.",
      q.new.length ? list(q.new.map(item)) : "<p class='empty'>Nothing queued. Import a pack in Discover.</p>"
    );
    const sprintAction = `
      <button id="btn-start-sprint" class="sprint-card" type="button">
        <span class="sprint-glyph" aria-hidden="true"><svg viewBox="0 0 24 24"><use href="#i-drill" /></svg></span>
        <span class="sprint-copy">
          <span class="sprint-title">Sprint round</span>
          <span class="sprint-sub">Pattern reps, 60 seconds each</span>
        </span>
        <span class="sprint-go" aria-hidden="true">›</span>
      </button>`;
    const drills = section(
      "Focused drills",
      (q.drills && q.drills.length) || 0,
      "Short targeted reps from weak signals, recent mistakes, and topics that need sharper pattern recognition.",
      sprintAction + (q.drills && q.drills.length
        ? list(q.drills.map(item))
        : "<p class='empty'>No focused drills queued.</p>")
    );
    const expansion = q.expansion && q.expansion.length ? section(
      "Grow your library",
      q.expansion.length,
      "Optional high-quality imports from topics you have started to clear.",
      list(q.expansion.map((x) => `
        <li class="q-row is-expansion">
          <div class="q-main">
            <h3 class="q-title">${escapeHtml(x.title)}</h3>
            ${diffLabel(x.difficulty)}
            ${x.like_ratio ? `<span class="tag is-success is-light">${Math.round(x.like_ratio * 100)}% liked</span>` : ""}
          </div>
          <div class="q-meta"><span>${escapeHtml(x.reason)}</span><span>${escapeHtml(x.category)}</span></div>
          <button class="button q-action import-one" data-slug="${x.slug}">Import</button>
        </li>`))
    ) : "";
    el.innerHTML = `
      <div class="today-shell">
        ${prepHtml ? `<div class="today-prep">${prepHtml}</div>` : ""}
        <div class="today-grid">
          ${reviews}
          <div class="today-side">
            ${newProblems}
            ${drills}
          </div>
        </div>
        ${expansion ? `<div class="today-expansion">${expansion}</div>` : ""}
      </div>`;
    $$("#tab-today button[data-slug][data-kind]").forEach((b) => b.addEventListener("click", () =>
      App.startFlow(b.dataset.slug, b.dataset.kind, b.dataset.mode, b.dataset.title, b.dataset.cat,
        b.dataset.attempt || null, b.dataset.status || null)));
    $$("#tab-today .import-one").forEach((b) => b.addEventListener("click", async () => {
      b.disabled = true; b.textContent = "…";
      await api("/import/problem", "POST", { slug: b.dataset.slug });
      toast("Imported."); renderToday();
    }));
    $("#btn-gen-report") && $("#btn-gen-report").addEventListener("click", async () => {
      $("#btn-gen-report").innerHTML = '<span class="spinner spinner-sm"></span> Thinking…';
      $("#btn-gen-report").disabled = true;
      const r = await api("/report/weekly", "POST");
      renderToday();
    });
    $("#btn-goto-topics") && $("#btn-goto-topics").addEventListener("click", () => App.goTab("topics"));
    $("#btn-start-mock") && $("#btn-start-mock").addEventListener("click", () => App.startMock());
    $("#btn-start-sprint") && $("#btn-start-sprint").addEventListener("click", () => App.startSprint());
  }

  // Library progress, summarised from the same tree the Topics map renders:
  // overall coverage plus a per-family breakdown, so Today opens with a sense of
  // where the work stands without a trip to another tab.
  function progressPanel(families) {
    if (!families || !families.length) return "";
    const solved = families.reduce((n, f) => n + f.solved, 0);
    const total = families.reduce((n, f) => n + f.total, 0);
    if (!total) return "";
    const weighted = families.reduce((n, f) => n + f.mastery * f.solved, 0);
    const mastery = solved ? Math.round((weighted / solved) * 100) : 0;
    const cleared = families.filter((f) => f.total && f.solved >= f.total).length;
    const coverage = Math.round((solved / total) * 100);

    const chip = (f) => `
      <div class="fam-chip${f.total && f.solved >= f.total ? " is-complete" : ""}">
        <div class="fam-chip-top">
          <span class="fam-chip-name">${escapeHtml(f.family)}</span>
          <span class="fam-chip-count">${f.solved}<em>/${f.total}</em></span>
        </div>
        <span class="bar"><span style="width:${Math.round(f.coverage * 100)}%"></span></span>
      </div>`;

    return `
      <section class="progress-panel">
        <div class="progress-lead">
          <div class="progress-headline">
            <h2 class="section-title">Library progress</h2>
            <div class="progress-count">${solved}<em>/${total}</em></div>
          </div>
          <p class="progress-sub">${coverage}% covered · ${mastery}% mastery${
            cleared ? ` · ${cleared} famil${cleared === 1 ? "y" : "ies"} cleared` : ""}</p>
          <button id="btn-goto-topics" class="button is-ghost is-small" type="button">Topic map</button>
        </div>
        <span class="bar progress-overall"><span style="width:${coverage}%"></span></span>
        <div class="fam-strip">${families.map(chip).join("")}</div>
      </section>`;
  }

  async function weeklyReportBanner(report) {
    const thisWeek = isoWeek(new Date());
    if (!report || report.iso_week !== thisWeek) {
      if (!App.llmEnabled) return "";
      return `<div class="banner">
        <span class="banner-icon" aria-hidden="true">\u{1F4CB}</span>
        <div class="banner-body">
          <div class="banner-title">Weekly coach report</div>
          <p class="banner-sub">Get this week's diagnosis and focus plan.</p>
        </div>
        <button id="btn-gen-report" class="button is-primary">Generate</button></div>`;
    }
    return `<div class="banner is-report">
      <span class="banner-icon" aria-hidden="true">\u{1F4CB}</span>
      <div class="banner-body">
        <div class="banner-title">Weekly coach report</div>
        <ul>${report.insights.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>
        ${report.focus_plan ? `<p class="focus"><b>Focus:</b> ${escapeHtml(report.focus_plan)}</p>` : ""}
      </div></div>`;
  }

  function mockCard(mock) {
    if (!mock || mock.active) {
      if (mock && mock.active) return `<div class="banner">
        <span class="banner-icon" aria-hidden="true">\u{23F1}</span>
        <div class="banner-body"><div class="banner-title">Mock in progress</div>
          <p class="banner-sub">Pick up where you left off.</p></div>
        <button id="btn-start-mock" class="button is-primary">Resume</button></div>`;
      return "";
    }
    if (mock.taken_this_week) return "";
    return `<div class="banner">
      <span class="banner-icon" aria-hidden="true">\u{23F1}</span>
      <div class="banner-body"><div class="banner-title">Weekly mock interview</div>
        <p class="banner-sub">60 min \u00B7 3 problems \u00B7 exam conditions. Builds the trend that actually tracks readiness.</p></div>
      <button id="btn-start-mock" class="button is-primary">Start mock</button></div>`;
  }

  // ---- Discover ----------------------------------------------------------------
  async function renderDiscover() {
    const el = $("#tab-discover");
    beginRender(el, "Loading packs…");
    const packs = await api("/packs");
    const packCards = packs.map((p) => `
      <div class="box pack-card">
        <div><b>${escapeHtml(p.label)}</b><div class="small">${p.imported}/${p.total} imported</div>
          <div class="goal-track"><span class="goal-fill" style="width:${Math.round((p.imported / p.total) * 100)}%"></span></div></div>
        <button class="button is-primary is-small import-pack" data-pack="${p.name}">${p.imported >= p.total ? "Refresh" : "Import"}</button>
      </div>`).join("");

    el.innerHTML = `
      <div class="section-title">Curated packs</div>
      <div class="pack-grid">${packCards}</div>
      <div class="section-title">Discover highly-rated problems</div>
      <p class="help">Only problems the community actually likes (like-ratio + vote thresholds in Settings). Needs your LeetCode cookie.</p>
      <div class="discover-filters">
        <div class="control"><input id="disc-topic" class="input" placeholder="topic slug e.g. two-pointers (optional)" /></div>
        <div class="control"><div class="select is-fullwidth"><select id="disc-diff"><option value="">Any difficulty</option><option>Easy</option><option>Medium</option><option>Hard</option></select></div></div>
        <button id="btn-discover" class="button is-primary">Find gems</button>
      </div>
      <div id="discover-results" class="mt-4"></div>
      <div class="help" id="import-status"></div>`;

    $$("#tab-discover .import-pack").forEach((b) => b.addEventListener("click", async () => {
      b.disabled = true;
      $("#import-status").innerHTML = `<span class="spinner spinner-sm"></span> Importing ${escapeHtml(b.dataset.pack)} (fetching metadata, be patient)…`;
      const r = await api("/import/pack", "POST", { pack: b.dataset.pack, fetch_metadata: true });
      $("#import-status").textContent = `Imported ${r.total} (${r.metadata_fetched} enriched, ${r.metadata_failed} failed).`;
      App.loadOverview(); renderDiscover();
    }));
    $("#btn-discover").addEventListener("click", async () => {
      const box = $("#discover-results");
      const btn = $("#btn-discover");
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner spinner-sm"></span> Finding…';
      box.innerHTML = loader("Scanning the problem set…");
      try {
        const r = await api(`/discover?topic=${encodeURIComponent($("#disc-topic").value.trim())}&difficulty=${$("#disc-diff").value}`);
        if (r.error) { box.innerHTML = `<p class='empty'>${escapeHtml(r.error)}</p>`; return; }
        if (!r.candidates.length) { box.innerHTML = "<p class='empty'>No new problems cleared the quality bar.</p>"; return; }
        box.innerHTML = `<table class="table is-app is-fullwidth is-hoverable"><thead><tr><th>Problem</th><th>Diff</th><th>👍 ratio</th><th>Votes</th><th>AC</th><th></th></tr></thead>
          <tbody>${r.candidates.map((c) => `<tr>
            <td><a href="${c.url}" target="_blank">${escapeHtml(c.title)}</a><div class="small">${escapeHtml(c.category)}</div></td>
            <td>${badge(c.difficulty)}</td><td><b>${Math.round(c.like_ratio * 100)}%</b></td>
            <td class="small">${c.votes.toLocaleString()}</td><td class="small">${c.ac_rate != null ? c.ac_rate + "%" : "—"}</td>
            <td><button class="button is-primary is-small import-one" data-slug="${c.slug}">Import</button></td></tr>`).join("")}</tbody></table>`;
        $$("#discover-results .import-one").forEach((b) => b.addEventListener("click", async () => {
          b.disabled = true; b.textContent = "✓";
          await api("/import/problem", "POST", { slug: b.dataset.slug });
          toast("Imported."); App.loadOverview();
        }));
      } catch (e) { box.innerHTML = `<p class='empty'>${escapeHtml(e.message)}</p>`; }
      finally { btn.disabled = false; btn.textContent = "Find gems"; }
    });
  }

  // ---- Topics map --------------------------------------------------------------
  const masteryColor = (m) => (m >= 0.66 ? "var(--green)" : m >= 0.33 ? "var(--amber)" : "var(--red)");

  function progressBar(coverage) {
    return `<div class="bar progress"><span style="width:${Math.round(coverage * 100)}%"></span></div>`;
  }

  function masteryPill(t) {
    if (!t.solved) return `<span class="mastery-pill is-empty">not started</span>`;
    return `<span class="mastery-pill" style="--pill:${masteryColor(t.mastery)}">${Math.round(t.mastery * 100)}% mastery</span>`;
  }

  function topicNode(t, focus) {
    const meta = [
      t.independence_rate != null ? `${Math.round(t.independence_rate * 100)}% solo` : null,
      t.avg_confidence != null ? `conf ${t.avg_confidence}` : null,
      t.sprint_accuracy != null ? `${Math.round(t.sprint_accuracy * 100)}% pattern` : null,
    ].filter(Boolean).join(" · ");
    return `
      <div class="topic-node${t.solved === t.total && t.total ? " is-complete" : ""}"
           role="button" tabindex="0" data-cat="${escapeHtml(t.category)}"
           aria-label="Open ${escapeHtml(t.category)} problems">
        <div class="topic-node-name">
          ${escapeHtml(t.category)}
          ${focus.has(t.category) ? `<span class="focus-chip">focus</span>` : ""}
          ${meta ? `<div class="small">${meta}</div>` : ""}
        </div>
        <div class="topic-node-count">${t.solved}<span class="small">/${t.total}</span></div>
        ${progressBar(t.coverage)}
        ${masteryPill(t)}
      </div>`;
  }

  async function renderTopics() {
    const el = $("#tab-topics");
    beginRender(el, "Loading topics…");
    const families = await api("/topics/tree");
    if (!families.length) {
      el.innerHTML = "<p class='empty'>No data yet. Import a pack and solve a few.</p>";
      return;
    }

    // Weakness is annotated in place rather than re-sorting the map, so the
    // tree stays a stable picture of where you are.
    const focus = new Set(
      families.flatMap((f) => f.topics).filter((t) => t.solved)
        .sort((a, b) => b.weakness - a.weakness).slice(0, 3).map((t) => t.category)
    );

    const solved = families.reduce((n, f) => n + f.solved, 0);
    const total = families.reduce((n, f) => n + f.total, 0);

    el.innerHTML = `
      <div class="topic-map-head">
        <div>
          <h2 class="section-title">Your map</h2>
          <div class="topic-map-count">${solved}<span class="small">/${total} solved</span></div>
        </div>
        ${progressBar(total ? solved / total : 0)}
      </div>` +
      families.map((f) => `
        <details class="family" open>
          <summary>
            <span class="family-name">${escapeHtml(f.family)}</span>
            <span class="family-count small">${f.solved}/${f.total}</span>
            ${progressBar(f.coverage)}
            ${masteryPill(f)}
          </summary>
          <div class="family-body">
            ${f.topics.map((t) => topicNode(t, focus)).join("")}
          </div>
        </details>`).join("");

    const byCat = new Map(families.flatMap((f) => f.topics).map((t) => [t.category, t]));
    $$("#tab-topics .topic-node").forEach((n) => {
      const open = () => openTopic(byCat.get(n.dataset.cat));
      n.addEventListener("click", open);
      n.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
      });
    });
  }

  // ---- Topic detail --------------------------------------------------------------
  // A topic's problems open over the map rather than expanding into it, so the map
  // stays a one-screen picture of coverage. What's left to do leads, easiest first,
  // and only its first Start is filled: the list is for picking the next problem.
  let topicModalBound = false;

  function bindTopicModal() {
    if (topicModalBound) return;
    topicModalBound = true;
    const modal = $("#topic-modal");
    $("#btn-close-topic").addEventListener("click", closeTopic);
    modal.addEventListener("click", (e) => { if (e.target === modal) closeTopic(); });
    modal.addEventListener("keydown", (e) => { if (e.key === "Escape") closeTopic(); });
  }

  function closeTopic() {
    $("#topic-modal").classList.add("hidden");
  }

  function topicProblemRow(r, i) {
    const done = r.attempt_count > 0;
    const data = `data-slug="${escapeHtml(r.slug)}" data-title="${escapeHtml(r.title)}" data-cat="${escapeHtml(r.neetcode_category || "")}"`;
    return `
      <li class="topic-problem${done ? " is-done" : ""}">
        <span class="topic-problem-check" aria-hidden="true">${done ? "✓" : ""}</span>
        <span class="topic-problem-title">
          <a href="${r.url}" target="_blank" rel="noopener">${escapeHtml(r.title)}</a>
          ${done ? `<span class="small">${r.attempt_count}× · last ${shortLocalDate(r.last_attempt_at)}</span>` : ""}
        </span>
        ${diffLabel(r.difficulty)}
        <span class="topic-problem-state">${done ? compactState(r.mastery_state) : ""}</span>
        <span class="problem-actions">
          ${done ? `<button class="button is-small is-link is-light topic-recall" type="button" ${data} title="Recall the method from memory">Recall</button>` : ""}
          <button class="button is-small${!done && i === 0 ? " is-primary" : ""} topic-start" type="button" ${data}>Start</button>
        </span>
      </li>`;
  }

  function topicSection(label, rows) {
    if (!rows.length) return "";
    return `<h3 class="topic-section-head small">${label} <span>${rows.length}</span></h3>
      <ul class="topic-problems">${rows.map(topicProblemRow).join("")}</ul>`;
  }

  async function openTopic(t) {
    if (!t) return;
    bindTopicModal();
    const modal = $("#topic-modal");
    const body = $("#topic-body");
    $("#topic-title").textContent = t.category;
    $("#topic-summary").innerHTML = `
      <span class="topic-map-count">${t.solved}<span class="small">/${t.total} solved</span></span>
      ${progressBar(t.coverage)}
      ${masteryPill(t)}
      <button id="topic-light-practice" class="button is-small" type="button">Warm up with light practice</button>`;
    $("#topic-light-practice").addEventListener("click", () => {
      closeTopic();
      window.Views.startLightPractice(t.category);
    });
    body.innerHTML = loader("Loading problems…");
    modal.classList.remove("hidden");
    $("#btn-close-topic").focus();
    let rows;
    try {
      rows = await api(`/problems?category=${encodeURIComponent(t.category)}&sort=difficulty`);
    } catch (e) {
      showLoadError(body, () => openTopic(t));
      return;
    }
    if (!rows.length) {
      body.innerHTML = "<p class='empty'>No problems in this topic yet.</p>";
      return;
    }
    body.innerHTML =
      topicSection("To do", rows.filter((r) => !r.attempt_count)) +
      topicSection("Done", rows.filter((r) => r.attempt_count));
    const start = (b, mode) => {
      closeTopic();
      App.startFlow(b.dataset.slug, "adhoc", mode, b.dataset.title, b.dataset.cat);
    };
    $$("#topic-body .topic-start").forEach((b) => b.addEventListener("click", () => start(b, "")));
    $$("#topic-body .topic-recall").forEach((b) => b.addEventListener("click", () => start(b, "recall")));
  }

  // ---- Insights ----------------------------------------------------------------
  async function renderInsights() {
    const el = $("#tab-insights");
    beginRender(el, "Crunching your stats…");
    let d;
    try {
      d = await api("/insights");
    } catch (e) {
      showLoadError(el, renderInsights);
      return;
    }
    const fm = Object.entries(d.failure_modes || {}).map(([k, v]) => ({
      rawTag: k,
      label: k.replace(/_/g, " "),
      value: v,
      color: "var(--red)",
    }));
    const pa = d.prediction_accuracy || {};
    const calibration = d.confidence_calibration;
    el.innerHTML = `
      <div class="columns">
        <div class="column"><div class="panel-box"><h3>Review forecast (30 days)</h3>${Charts.forecast(d.forecast)}</div></div>
        <div class="column"><div class="panel-box"><h3>Pace</h3>${paceHtml(d.pace)}</div></div>
      </div>
      <div class="columns">
        <div class="column"><div class="panel-box"><h3>Mastery radar</h3>${Charts.radar(d.mastery_radar)}</div></div>
        <div class="column"><div class="panel-box"><h3>Time to solve (weekly median)</h3>${Charts.lines(d.time_trend, { yLabel: "min" })}</div></div>
      </div>
      <div class="columns">
        <div class="column"><div class="panel-box failure-mode-box"><h3>Failure modes (30 days)</h3>${failureModesHtml(fm)}</div></div>
        <div class="column"><div class="panel-box"><h3>Planning</h3>${planningHtml(d.planning, pa)}</div></div>
      </div>
      <div class="panel-box"><h3>Confidence calibration</h3>${calibrationHtml(calibration)}</div>
      <div class="panel-box"><h3>Mock score trend</h3>${mockTrendHtml(d.mock_trend)}</div>`;
    bindFailureModeRows();
  }

  function failureModesHtml(rows) {
    if (!rows.length) return "<p class='empty'>No structured mistakes yet — the coach fills this in.</p>";
    return `${failureModeBars(rows)}
      <div id="failure-mode-review" class="failure-mode-review">
        <p class="empty">Select a mistake tag to review related attempts.</p>
      </div>`;
  }

  function failureModeBars(data) {
    const max = Math.max(...data.map((d) => d.value), 1);
    const rows = data.map((d) => {
      const w = Math.round((d.value / max) * 100);
      return `<button type="button" class="chart-bar-row failure-mode-row" data-tag="${escapeHtml(d.rawTag)}"
        title="${escapeHtml(d.rawTag)}: ${escapeHtml(d.value)} attempts">
        <span class="chart-bar-label">${escapeHtml(d.label)}</span>
        <span class="chart-bar-track"><span class="chart-bar-fill" style="width:${w}%;background:${d.color || "var(--accent)"}"></span></span>
        <span class="chart-bar-val">${escapeHtml(d.value)}</span>
      </button>`;
    }).join("");
    return `<div class="chart-bars failure-mode-bars">${rows}</div>`;
  }

  function bindFailureModeRows() {
    $$("#tab-insights .failure-mode-row").forEach((b) => b.addEventListener("click", () => loadFailureMode(b)));
  }

  async function loadFailureMode(btn) {
    const tag = btn.dataset.tag || "";
    const panel = $("#failure-mode-review");
    if (!panel || !tag) return;
    $$("#tab-insights .failure-mode-row").forEach((b) => b.classList.toggle("is-active", b === btn));
    panel.innerHTML = loader(`Loading ${tag.replace(/_/g, " ")} attempts…`);
    let r;
    try {
      r = await api(`/failure-mode/${encodeURIComponent(tag)}`);
    } catch (e) {
      showLoadError(panel, () => loadFailureMode(btn));
      return;
    }
    const attempts = (r.attempts || []).slice().sort((a, b) => (b.solved_at || 0) - (a.solved_at || 0));
    panel.innerHTML = attempts.length
      ? failureModeAttemptsHtml(tag, attempts)
      : `<p class="empty">No saved attempts found for ${escapeHtml(tag.replace(/_/g, " "))}.</p>`;
    $$("#failure-mode-review .failure-mode-detail").forEach((b) => b.addEventListener("click", () => App.openDetail(b.dataset.id)));
    $$("#failure-mode-review .failure-mode-start").forEach((b) => b.addEventListener("click", () =>
      App.startFlow(b.dataset.slug, "adhoc", "", b.dataset.title, b.dataset.cat)));
  }

  function failureModeAttemptsHtml(tag, attempts) {
    return `<div class="failure-mode-review-head">
      <div><b>${escapeHtml(tag.replace(/_/g, " "))}</b><div class="small">${plural(attempts.length, "tagged attempt")}</div></div>
    </div>
    <div class="failure-mode-attempts">${attempts.map(failureModeAttemptHtml).join("")}</div>`;
  }

  function failureModeAttemptHtml(a) {
    const url = a.url || `https://leetcode.com/problems/${a.slug}/`;
    const tags = (a.mistake_tags || []).map((t) => `<span class="mtag">${escapeHtml(t)}</span>`).join(" ");
    return `<div class="failure-mode-attempt">
      <div class="failure-mode-attempt-main">
        <div class="failure-mode-title-row">
          <a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(a.title || a.slug)}</a>
          ${badge(a.difficulty)}
        </div>
        <div class="small">${shortLocalDate(a.solved_at)} · ${escapeHtml(a.category || "-")}</div>
        ${a.mistake_note
          ? `<div class="failure-mode-note">${escapeHtml(a.mistake_note)}</div>`
          : `<div class="failure-mode-note is-muted">No mistake note saved.</div>`}
        ${tags ? `<div class="failure-mode-tags">${tags}</div>` : ""}
      </div>
      <div class="failure-mode-actions">
        <button class="button is-small failure-mode-detail" data-id="${escapeHtml(a.id)}">Detail</button>
        <button class="button start is-small failure-mode-start" data-slug="${escapeHtml(a.slug)}"
          data-title="${escapeHtml(a.title || a.slug)}" data-cat="${escapeHtml(a.category || "")}">Start</button>
      </div>
    </div>`;
  }

  function paceHtml(p) {
    if (!p) return "";
    return `<div class="pace">
      <div class="pace-big">${p.solved}/${p.total}</div>
      <div class="small">${p.remaining} left · ${p.rate_per_week}/week</div>
      ${p.eta ? `<div class="pace-eta">Library complete ~ <b>${p.eta}</b></div>` :
        "<div class='small'>Solve a few to project a finish date.</div>"}</div>`;
  }

  const pctOrDash = (v) => (v == null ? "—" : `${Math.round(v * 100)}%`);
  const clock = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec) % 60).padStart(2, "0")}`;

  // How well you plan before coding. Sprint pattern guesses, which train the
  // recognition half of this directly, get a line of their own.
  function planningHtml(pl, pa) {
    const sprint = pa && pa.sprint_graded
      ? `<p class="small plan-sprint">Sprint pattern guesses: <b>${pctOrDash(
          (pa.by_kind.sprint.correct || 0) / pa.sprint_graded)}</b> right (${pa.sprint_graded} graded)</p>` : "";
    const o = pl && pl.overall;
    if (!o || !o.starts) {
      return `<p class="empty">Lock in a plan before a run and this fills in: your plan score, how often plans hold, and where you plan worst.</p>${sprint}`;
    }
    const slow = o.median_plan_sec != null && o.median_plan_sec >= pl.soft_limit_sec;
    const stats = [
      ["Held", pctOrDash(o.held_rate)],
      ["Optimal target", pctOrDash(o.optimal_rate)],
      ["Edge coverage", pctOrDash(o.edge_coverage)],
      ["Median plan time", o.median_plan_sec == null ? "—" : `<span class="${slow ? "is-over" : ""}">${clock(o.median_plan_sec)}</span>`],
      ["No idea yet", `${o.blanks} of ${o.starts}`],
    ];
    const rows = (pl.categories || []).filter((c) => c.avg_score != null).map((c) => ({
      label: c.category.replace(/ .*/, ""), value: c.avg_score, display: `${c.avg_score}/5`,
      hint: `${c.category}: ${c.avg_score}/5 over ${c.scored} graded plan${c.scored === 1 ? "" : "s"}`
        + (c.blanks ? `, ${c.blanks} no-idea start${c.blanks === 1 ? "" : "s"}` : ""),
      color: c.avg_score >= 4 ? "var(--green)" : c.avg_score >= 2.5 ? "var(--amber)" : "var(--red)",
    }));
    const w = pl.weakest;
    return `<div class="pace-big">${o.avg_score == null ? "—" : `${o.avg_score}/5`}</div>
      <div class="small">average plan score · ${o.plans} plan${o.plans === 1 ? "" : "s"}, ${o.scored} scored</div>
      <dl class="plan-stats">${stats.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>
      ${w ? `<p class="plan-weakest">Weakest: <b>${escapeHtml(w.category)}</b> — ${w.avg_score}/5 over ${w.count} start${w.count === 1 ? "" : "s"}${w.blanks ? ` (${w.blanks} with no idea)` : ""}. Plan misses feed the drill lane.</p>` : ""}
      ${rows.length ? Charts.bars(rows, { max: 5 }) : ""}
      ${sprint}`;
  }

  function calibrationHtml(calibration) {
    const rows = (calibration && calibration.categories) || [];
    const graded = calibration && calibration.graded_attempts != null ? calibration.graded_attempts : 0;
    const min = calibration && calibration.min_graded_attempts;
    const count = min != null ? `${graded}/${min} graded solves` : plural(graded, "graded solve");
    const categoryCount = rows.length ? ` · ${plural(rows.length, "graded category", "graded categories")}` : "";
    const countHtml = `<div class="small">${escapeHtml(count + categoryCount)}</div>`;
    if (!calibration || calibration.status === "not_enough_data" || !rows.length) {
      return `<div class="calibration-panel"><div class="empty calibration-empty"><div>Not enough graded data</div>${countHtml}</div></div>`;
    }
    const top = calibration.most_overrated_topic && calibration.most_overrated_topic.category;
    const topHtml = top
      ? `<div><div class="small">Most overrated topic</div><div class="name">${escapeHtml(top)}</div></div>`
      : `<div><div class="small">Most overrated topic</div><div class="name">No overrated topic flagged yet</div></div>`;
    const chartRows = rows.map((r) => ({
      label: r.category.replace(/ .*/, ""),
      hint: `${r.category}: self ${quality(r.self_quality)}, objective ${quality(r.objective_quality)}, gap ${gap(r.gap)}; ${calibrationEvidenceText(r)}`,
      values: [
        { label: "self", value: r.self_quality || 0, display: quality(r.self_quality), color: "var(--accent)" },
        { label: "obj", value: r.objective_quality || 0, display: quality(r.objective_quality), color: "var(--green)" },
      ],
      meta: `${calibrationEvidenceHtml(r)}<span class="tag ${r.overconfident ? "is-warning is-light" : "is-light"}">gap ${escapeHtml(gap(r.gap))}</span>`,
    }));
    return `<div class="calibration-panel"><div class="calibration-topline">${topHtml}${countHtml}</div>${Charts.groupedBars(chartRows, { max: 5 })}${calibrationExamplesHtml(rows)}</div>`;
  }

  function calibrationExamplesHtml(rows) {
    const groups = rows.filter((r) => r.overconfident && (r.examples || []).length);
    if (!groups.length) return "";
    return `<div class="calibration-examples">${groups.map((r) => `
      <div class="calibration-example-group">
        <div class="small">${escapeHtml(r.category)} examples</div>
        ${(r.examples || []).map((ex) => `
          <div class="calibration-example-row" title="${escapeHtml(ex.slug)}">
            <span class="calibration-example-title">${escapeHtml(ex.title || ex.slug)}</span>
            <span class="calibration-example-meta">self ${escapeHtml(quality(ex.self_quality))} · obj ${escapeHtml(quality(ex.objective_quality))} · gap ${escapeHtml(gap(ex.gap))} · ${escapeHtml(sourceLabel(ex.source))}</span>
          </div>`).join("")}
      </div>`).join("")}</div>`;
  }

  function calibrationEvidenceText(r) {
    const parts = [plural(r.graded_attempts || 0, "graded solve")];
    if (r.review_failures) parts.push(plural(r.review_failures, "review failure"));
    if (r.leech_count) parts.push(plural(r.leech_count, "leech"));
    return parts.join(", ");
  }

  function calibrationEvidenceHtml(r) {
    const parts = [
      `<span class="calibration-evidence-chip">${escapeHtml(plural(r.graded_attempts || 0, "graded solve"))}</span>`,
    ];
    if (r.review_failures) {
      parts.push(`<span class="calibration-evidence-chip is-stale">${escapeHtml(plural(r.review_failures, "review failure"))}</span>`);
    }
    if (r.leech_count) {
      parts.push(`<span class="calibration-evidence-chip is-stale">${escapeHtml(plural(r.leech_count, "leech"))}</span>`);
    }
    return `<span class="calibration-evidence">${parts.join("")}</span>`;
  }

  function plural(n, one, many) {
    const count = Number(n) || 0;
    return `${count} ${count === 1 ? one : (many || one + "s")}`;
  }

  function quality(v) {
    return v == null ? "-" : Number(v).toFixed(1);
  }

  function gap(v) {
    if (v == null) return "-";
    const n = Number(v);
    return `${n > 0 ? "+" : ""}${n.toFixed(1)}`;
  }

  function sourceLabel(source) {
    return {
      solution_grade: "solution",
      recall_grade: "recall",
      review_failure: "review",
    }[source] || source || "objective";
  }

  function mockTrendHtml(trend) {
    if (!trend || !trend.length) return "<p class='empty'>Take a weekly mock to start the trend.</p>";
    return Charts.lines({ Score: trend.map((t) => ({ week: t.date, median_min: t.score })) }, { key: "median_min", yLabel: "score" });
  }

  // ---- Playbook ----------------------------------------------------------------
  async function renderPlaybook() {
    const el = $("#tab-playbook");
    beginRender(el, "Loading playbooks…");
    const topics = await api("/topics");
    if (!topics.length) { el.innerHTML = "<p class='empty'>Solve some problems first.</p>"; return; }
    const opts = topics.map((t) => `<option value="${escapeHtml(t.category)}">${escapeHtml(t.category)}</option>`).join("");
    el.innerHTML = `<div class="field has-addons">
        <div class="control is-expanded"><div class="select is-fullwidth"><select id="pb-cat">${opts}</select></div></div>
        <div class="control"><button id="pb-load" class="button is-primary">Open</button></div>
      </div><div id="pb-body"></div>`;
    const load = async () => {
      const cat = $("#pb-cat").value;
      const body = $("#pb-body");
      body.innerHTML = loader("Loading playbook…");
      const r = await api(`/playbook/${encodeURIComponent(cat)}`);
      let html = "";
      if (r.playbook) {
        html += `<div class="playbook">${mdToHtml(r.playbook.content_md)}</div>`;
        html += `<p class="small">Generated from ${r.playbook.attempt_count_at_generation} attempts.${r.stale ? " New attempts since — regenerate for a refresh." : ""}</p>`;
      } else {
        html += `<p class="empty">No playbook yet for ${escapeHtml(cat)}.</p>`;
      }
      if (r.can_generate) {
        html += `<button id="pb-gen" class="button is-primary mt-3">${r.playbook ? "Regenerate" : "Generate playbook"}</button>`;
      } else if (!App.llmEnabled) {
        html += `<p class="small">Enable the coach to synthesize playbooks.</p>`;
      }
      body.innerHTML = html;
      $("#pb-gen") && $("#pb-gen").addEventListener("click", async () => {
        $("#pb-gen").innerHTML = '<span class="spinner spinner-sm"></span> Synthesizing…'; $("#pb-gen").disabled = true;
        await api(`/playbook/${encodeURIComponent(cat)}/regenerate`, "POST");
        load();
      });
    };
    $("#pb-load").addEventListener("click", load);
    load();
  }

  // ---- History -----------------------------------------------------------------
  let historyFilter = "all"; // all | solve | drill | sprint | recall — persists across re-renders
  const historyType = (r) => (r.kind === "recall" ? "recall" : r.kind === "sprint" ? "sprint" : r.kind === "drill" ? "drill" : "solve");
  const typeTag = (t) => {
    if (t === "recall") return '<span class="tag type-recall">recall</span>';
    if (t === "sprint") return '<span class="tag type-sprint">sprint</span>';
    if (t === "drill") return '<span class="tag type-drill">drill</span>';
    return '<span class="tag type-solve">solve</span>';
  };

  async function renderHistory() {
    const el = $("#tab-history");
    beginRender(el, "Loading history…");
    let rows;
    try {
      rows = await api("/history?limit=100");
    } catch (e) {
      showLoadError(el, renderHistory);
      return;
    }
    if (!rows.length) { el.innerHTML = "<p class='empty'>No attempts logged yet.</p>"; return; }
    const confLabel = (c) => (c == null ? "—" : `<span class="conf-${c}">${["", "Low", "Med", "High"][c]}</span>`);
    const predBadge = (r) => {
      if (!r.prediction_verdict) return "";
      const m = { correct: "✓", partial: "~", wrong: "✗" }[r.prediction_verdict] || "";
      return `<span class="pred pred-${r.prediction_verdict}" title="pattern prediction ${r.prediction_verdict}">${m}</span>`;
    };
    const coachRead = (r) => {
      if (r.kind === "sprint") {
        const parts = [];
        if (r.predicted_category) parts.push(`<span class="pat">predicted ${escapeHtml(r.predicted_category)}</span>`);
        if (r.prediction_note) parts.push(escapeHtml(r.prediction_note));
        return parts.join(" ");
      }
      return `${(r.mistake_tags || []).map((t) => `<span class="mtag">${escapeHtml(t)}</span>`).join(" ")}
        ${r.pattern_used ? `<span class="pat">${escapeHtml(r.pattern_used)}</span>` : ""}`;
    };
    const counts = { all: rows.length, solve: 0, drill: 0, sprint: 0, recall: 0 };
    rows.forEach((r) => { counts[historyType(r)]++; });
    const fbtn = (f, label) =>
      `<button class="button is-small" data-f="${f}">${label} <span class="ml-1 has-text-grey">${counts[f]}</span></button>`;
    el.innerHTML = `
      <div class="buttons has-addons type-filter" id="history-filter">
        ${fbtn("all", "All")}${fbtn("solve", "Completions")}${fbtn("drill", "Drills")}${fbtn("sprint", "Sprints")}${fbtn("recall", "Recalls")}
      </div>
      <table class="table is-app is-fullwidth is-hoverable">
      <thead><tr><th>Problem</th><th>Type</th><th>Topic</th><th>When</th><th>Time</th><th>Conf</th><th>How</th><th>Coach read</th></tr></thead>
      <tbody>${rows.map((r) => {
        const t = historyType(r);
        return `
        <tr class="hist-row" data-id="${r.id}" data-type="${t}">
          <td><a href="${r.url}" target="_blank" onclick="event.stopPropagation()">${escapeHtml(r.title)}</a> ${badge(r.difficulty)} ${predBadge(r)}</td>
          <td>${typeTag(t)}</td>
          <td class="small">${escapeHtml(r.actual_category || r.neetcode_category || "")}</td>
          <td class="small">${r.solved_at ? new Date(r.solved_at * 1000).toLocaleDateString() : "—"}</td>
          <td>${fmtTime(r.time_taken_sec)}</td>
          <td>${confLabel(r.confidence)}</td>
          <td class="small">${r.independence || "—"}</td>
          <td class="small">${coachRead(r)}</td>
        </tr>`; }).join("")}</tbody></table>
      <p class="small">Click a row for its saved practice detail.</p>`;

    const applyFilter = () => {
      $$("#tab-history .hist-row").forEach((tr) =>
        tr.classList.toggle("hidden", historyFilter !== "all" && tr.dataset.type !== historyFilter));
      $$("#history-filter button").forEach((b) =>
        b.classList.toggle("is-primary", b.dataset.f === historyFilter));
    };
    $$("#history-filter button").forEach((b) => b.addEventListener("click", () => {
      historyFilter = b.dataset.f; applyFilter();
    }));
    applyFilter();
    $$("#tab-history .hist-row").forEach((tr) => tr.addEventListener("click", () => App.openDetail(tr.dataset.id)));
  }

  // ---- Problems ----------------------------------------------------------------
  let pendingDeleteProblem = null;
  let deleteProblemModalBound = false;

  async function renderProblems() {
    const el = $("#tab-problems");
    beginRender(el, "Loading problems…");
    bindDeleteProblemModal();
    let facets;
    try {
      facets = await loadProblemFacets();
    } catch (e) {
      showLoadError(el, renderProblems);
      return;
    }
    const totalLabel = facets.total == null ? "" : `<span class="small">${facets.total} in library</span>`;
    el.innerHTML = `<div class="problems-toolbar">
      <div class="control problems-search"><input id="problems-search" class="input" placeholder="Search title, slug, or #" value="${escapeHtml(problemFilters.search)}" /></div>
      <div class="control"><div class="select is-fullwidth"><select id="problems-category">
        <option value="">Any topic</option>${facetOptions(facets.categories || [], problemFilters.category)}
      </select></div></div>
      <div class="control"><div class="select is-fullwidth"><select id="problems-difficulty">
        <option value="">Any difficulty</option>${facetOptions(facets.difficulties || [], problemFilters.difficulty)}
      </select></div></div>
      <div class="control"><div class="select is-fullwidth"><select id="problems-due-status">
        <option value="all"${problemFilters.due_status === "all" ? " selected" : ""}>Any due status</option>
        <option value="due"${problemFilters.due_status === "due" ? " selected" : ""}>Due</option>
        <option value="upcoming"${problemFilters.due_status === "upcoming" ? " selected" : ""}>Upcoming</option>
        <option value="unscheduled"${problemFilters.due_status === "unscheduled" ? " selected" : ""}>Unscheduled</option>
      </select></div></div>
      <div class="control"><div class="select is-fullwidth"><select id="problems-attempted">
        <option value="all"${problemFilters.attempted === "all" ? " selected" : ""}>Any attempts</option>
        <option value="attempted"${problemFilters.attempted === "attempted" ? " selected" : ""}>Attempted</option>
        <option value="unattempted"${problemFilters.attempted === "unattempted" ? " selected" : ""}>Unattempted</option>
      </select></div></div>
      <div class="control"><div class="select is-fullwidth"><select id="problems-leech">
        <option value="all"${problemFilters.leech === "all" ? " selected" : ""}>Any leech</option>
        <option value="only"${problemFilters.leech === "only" ? " selected" : ""}>Leech only</option>
        <option value="exclude"${problemFilters.leech === "exclude" ? " selected" : ""}>Hide leech</option>
      </select></div></div>
      <div class="control"><div class="select is-fullwidth"><select id="problems-sort">
        <option value="number"${problemFilters.sort === "number" ? " selected" : ""}>Sort by #</option>
        <option value="title"${problemFilters.sort === "title" ? " selected" : ""}>Sort by title</option>
        <option value="difficulty"${problemFilters.sort === "difficulty" ? " selected" : ""}>Sort by difficulty</option>
        <option value="due_date"${problemFilters.sort === "due_date" ? " selected" : ""}>Sort by next review</option>
        <option value="last_attempt"${problemFilters.sort === "last_attempt" ? " selected" : ""}>Sort by last attempt</option>
        <option value="attempts"${problemFilters.sort === "attempts" ? " selected" : ""}>Sort by attempts</option>
      </select></div></div>
      ${totalLabel}
    </div>
    <div id="problems-results"></div>`;

    const reload = () => loadProblemResults();
    let searchTimer = null;
    $("#problems-search").addEventListener("input", (e) => {
      problemFilters.search = e.target.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(reload, 180);
    });
    [
      ["#problems-category", "category"],
      ["#problems-difficulty", "difficulty"],
      ["#problems-due-status", "due_status"],
      ["#problems-attempted", "attempted"],
      ["#problems-leech", "leech"],
      ["#problems-sort", "sort"],
    ].forEach(([selector, key]) => {
      $(selector).addEventListener("change", (e) => {
        problemFilters[key] = e.target.value;
        reload();
      });
    });
    await loadProblemResults();
  }

  async function loadProblemResults() {
    const box = $("#problems-results");
    if (!box) return;
    box.innerHTML = loader("Loading problems…");
    let rows;
    try {
      rows = await api(`/problems${problemQueryString()}`);
    } catch (e) {
      showLoadError(box, loadProblemResults);
      return;
    }
    if (!rows.length && !hasActiveProblemFilters()) {
      box.innerHTML = "<p class='empty'>No problems imported. Go to Discover.</p>";
      return;
    }
    if (!rows.length) {
      box.innerHTML = "<p class='empty'>No matching problems for the current search/filter combination.</p>";
      return;
    }
    box.innerHTML = `<table class="table is-app is-fullwidth is-hoverable problems-table">
      <thead><tr><th>#</th><th>Problem</th><th>Topic</th><th>Diff</th><th>Attempts</th><th>Next review</th><th>Last attempt</th><th>State</th><th>Leech</th><th></th></tr></thead>
      <tbody>${rows.map((r) => {
        const category = r.neetcode_category || r.category || "";
        return `
        <tr>
          <td class="small problem-number" data-label="#">${escapeHtml(r.frontend_id || "-")}</td>
          <td data-label="Problem"><a href="${r.url}" target="_blank">${escapeHtml(r.title)}</a></td>
          <td class="small" data-label="Topic">${escapeHtml(category || "-")}</td>
          <td data-label="Diff">${badge(r.difficulty)}</td>
          <td data-label="Attempts">${r.attempt_count || 0}</td>
          <td class="small" data-label="Next review">${escapeHtml(r.due_date || "-")}</td>
          <td class="small" data-label="Last attempt">${shortLocalDate(r.last_attempt_at)}</td>
          <td data-label="State">${compactState(r.mastery_state)}</td>
          <td data-label="Leech">${r.leech ? '<span class="tag is-danger is-light">leech</span>' : '<span class="small">-</span>'}</td>
          <td class="problem-action"><div class="problem-actions">
            <button class="button start is-small" data-slug="${r.slug}" data-title="${escapeHtml(r.title)}" data-cat="${escapeHtml(category)}">Start</button>
            ${r.attempt_count
              ? `<button class="button recall-start is-small is-link is-light" data-slug="${r.slug}" data-title="${escapeHtml(r.title)}" data-cat="${escapeHtml(category)}" title="Recall the method from memory">Recall</button>`
              : `<button class="button is-ghost is-small icon-button problem-delete" type="button"
              data-slug="${r.slug}" data-title="${escapeHtml(r.title)}" aria-label="Remove ${escapeHtml(r.title)}" title="Remove from database">&times;</button>`}
          </div></td>
        </tr>`;
      }).join("")}</tbody></table>`;
    $$("#tab-problems .start").forEach((b) => b.addEventListener("click", () =>
      App.startFlow(b.dataset.slug, "adhoc", "", b.dataset.title, b.dataset.cat)));
    $$("#tab-problems .recall-start").forEach((b) => b.addEventListener("click", () =>
      App.startFlow(b.dataset.slug, "adhoc", "recall", b.dataset.title, b.dataset.cat)));
    $$("#tab-problems .problem-delete").forEach((b) => b.addEventListener("click", () => openDeleteProblem(b)));
  }

  function bindDeleteProblemModal() {
    if (deleteProblemModalBound) return;
    deleteProblemModalBound = true;
    $("#btn-close-delete-problem").addEventListener("click", closeDeleteProblem);
    $("#btn-cancel-delete-problem").addEventListener("click", closeDeleteProblem);
    $("#btn-confirm-delete-problem").addEventListener("click", confirmDeleteProblem);
  }

  function openDeleteProblem(btn) {
    pendingDeleteProblem = {
      slug: btn.dataset.slug,
      title: btn.dataset.title || btn.dataset.slug,
      button: btn,
    };
    $("#delete-problem-copy").textContent =
      `Remove "${pendingDeleteProblem.title}" from the problem database? This also removes its review card and cancels an active run.`;
    $("#delete-problem-confirm").value = "";
    $("#delete-problem-confirm").placeholder = pendingDeleteProblem.slug;
    $("#delete-problem-error").classList.add("hidden");
    $("#delete-problem-modal").classList.remove("hidden");
    $("#delete-problem-confirm").focus();
  }

  function closeDeleteProblem() {
    pendingDeleteProblem = null;
    $("#delete-problem-modal").classList.add("hidden");
  }

  async function confirmDeleteProblem() {
    if (!pendingDeleteProblem) return;
    const slug = pendingDeleteProblem.slug;
    const typed = $("#delete-problem-confirm").value.trim();
    if (typed !== slug) {
      const err = $("#delete-problem-error");
      err.textContent = "Slug did not match.";
      err.classList.remove("hidden");
      return;
    }
    const { title, button } = pendingDeleteProblem;
    button.disabled = true;
    $("#btn-confirm-delete-problem").disabled = true;
    try {
      await api(`/problem/${encodeURIComponent(slug)}`, "DELETE", { confirm_slug: slug });
      closeDeleteProblem();
      toast(`Removed ${title}.`);
      App.loadOverview();
      renderProblems();
    } catch (e) {
      const err = $("#delete-problem-error");
      err.textContent = e.message;
      err.classList.remove("hidden");
      button.disabled = false;
    } finally {
      $("#btn-confirm-delete-problem").disabled = false;
    }
  }

  // ---- Settings ----------------------------------------------------------------
  async function renderSettings() {
    const el = $("#tab-settings");
    beginRender(el, "Loading settings…");
    const c = await api("/config");
    const hasCookie = !!localStorage.getItem("lc_session");
    const llmOptions = c.llm_options || {};
    const providerOptions = Object.keys(llmOptions);
    const provider = c.llm_provider || providerOptions[0] || "openai";
    const model = c.llm_model || (llmOptions[provider] || [])[0] || "";
    const providerSelect = providerOptions.map((p) =>
      `<option value="${escapeHtml(p)}"${p === provider ? " selected" : ""}>${escapeHtml(p)}</option>`).join("");
    const modelSelect = (llmOptions[provider] || []).map((m) =>
      `<option value="${escapeHtml(m)}"${m === model ? " selected" : ""}>${escapeHtml(m)}</option>`).join("");
    el.innerHTML = `
      <div class="section-title">LeetCode account</div>
      <div class="settings-field"><label>Username</label><input id="cfg-username" class="input" value="${escapeHtml(c.username || "")}" /></div>
      <div class="settings-field">
        <label>LEETCODE_SESSION cookie ${hasCookie ? "✅ set (this browser)" : "(not set)"}</label>
        <input id="cfg-session" class="input" type="password" placeholder="${hasCookie ? "••• leave blank to keep" : "paste cookie value"}" />
        <div class="help">Stored only in this browser and sent per-request; never saved server-side. Unlocks % beaten, code, wrong-attempt counts, and Discover.</div>
      </div>
      <div class="settings-field"><label>csrftoken cookie</label>
        <input id="cfg-csrf" class="input" type="password" placeholder="${localStorage.getItem('lc_csrf') ? '••• leave blank to keep' : 'paste csrftoken'}" /></div>
      <div class="buttons"><button class="button is-primary" id="btn-save-cfg">Save</button>
        <button class="button is-ghost" id="btn-clear-cookie">Clear cookie</button></div>

      <div class="section-title">Coach model</div>
      <div class="settings-row">
        <div class="settings-field"><label>Provider</label><div class="select is-fullwidth"><select id="cfg-llm-provider">${providerSelect}</select></div></div>
        <div class="settings-field"><label>Model</label><div class="select is-fullwidth"><select id="cfg-llm-model">${modelSelect}</select></div></div>
      </div>
      <p class="help">API keys stay in environment variables. OpenAI uses OPENAI_API_KEY; Gemini uses GEMINI_API_KEY or GOOGLE_API_KEY. Current status: ${c.llm_enabled ? "enabled" : "disabled"}.</p>

      <div class="section-title">Scheduling &amp; weighting</div>
      <div class="settings-row">
        <div class="settings-field"><label>Reviews / day</label><input id="cfg-review" class="input" type="number" value="${c.review_limit}" /></div>
        <div class="settings-field"><label>New / day</label><input id="cfg-new" class="input" type="number" value="${c.new_limit}" /></div>
        <div class="settings-field"><label>Drills / day</label><input id="cfg-drill" class="input" type="number" value="${c.drill_limit}" /></div>
      </div>
      <div class="settings-row">
        <div class="settings-field"><label>Weakness weight</label><input id="cfg-weak" class="input" type="number" step="0.1" value="${c.weakness_weight}" /></div>
        <div class="settings-field"><label>Breadth weight</label><input id="cfg-breadth" class="input" type="number" step="0.1" value="${c.breadth_weight}" /></div>
        <div class="settings-field"><label>Mistake weight</label><input id="cfg-mistake" class="input" type="number" step="0.1" value="${c.mistake_weight}" /></div>
        <div class="settings-field"><label>Min drill signal</label><input id="cfg-drill-signal" class="input" type="number" step="0.01" value="${c.drill_min_signal}" /></div>
      </div>
      <div class="section-title">Weekly goals</div>
      <div class="settings-row">
        <div class="settings-field"><label>Reviews / week</label><input id="cfg-grev" class="input" type="number" value="${c.goal_reviews_per_week}" /></div>
        <div class="settings-field"><label>New / week</label><input id="cfg-gnew" class="input" type="number" value="${c.goal_new_per_week}" /></div>
      </div>
      <div class="section-title">Discover thresholds</div>
      <div class="settings-row">
        <div class="settings-field"><label>Min like-ratio</label><input id="cfg-ratio" class="input" type="number" step="0.01" value="${c.discover_min_like_ratio}" /></div>
        <div class="settings-field"><label>Min votes</label><input id="cfg-votes" class="input" type="number" value="${c.discover_min_votes}" /></div>
      </div>
      <button class="button is-primary" id="btn-save-sched">Save settings</button>

      <div class="section-title">Data</div>
      <div class="buttons">
        <button class="button is-ghost" id="btn-backfill">Backfill recent history</button>
        <button class="button is-ghost" id="btn-sweep">Run coach enrichment now</button>
      </div>
      <div class="help" id="settings-status"></div>`;

    $("#btn-save-cfg").addEventListener("click", async () => {
      await api("/config", "POST", { username: $("#cfg-username").value });
      if ($("#cfg-session").value) localStorage.setItem("lc_session", $("#cfg-session").value.trim());
      if ($("#cfg-csrf").value) localStorage.setItem("lc_csrf", $("#cfg-csrf").value.trim());
      toast("Saved"); renderSettings();
      App.checkLeetCodeAuth();  // the header warning is about to be right or wrong
    });
    $("#btn-clear-cookie").addEventListener("click", () => {
      localStorage.removeItem("lc_session"); localStorage.removeItem("lc_csrf");
      toast("Cookie cleared"); renderSettings();
      App.checkLeetCodeAuth();
    });
    $("#btn-save-sched").addEventListener("click", async () => {
      await api("/config", "POST", {
        review_limit: +$("#cfg-review").value, new_limit: +$("#cfg-new").value,
        drill_limit: +$("#cfg-drill").value, drill_min_signal: +$("#cfg-drill-signal").value,
        weakness_weight: +$("#cfg-weak").value, breadth_weight: +$("#cfg-breadth").value,
        mistake_weight: +$("#cfg-mistake").value,
        goal_reviews_per_week: +$("#cfg-grev").value, goal_new_per_week: +$("#cfg-gnew").value,
        discover_min_like_ratio: +$("#cfg-ratio").value, discover_min_votes: +$("#cfg-votes").value,
        llm_provider: $("#cfg-llm-provider").value, llm_model: $("#cfg-llm-model").value,
      });
      toast("Settings saved");
      App.loadOverview();
    });
    $("#cfg-llm-provider").addEventListener("change", () => {
      const p = $("#cfg-llm-provider").value;
      $("#cfg-llm-model").innerHTML = (llmOptions[p] || []).map((m) =>
        `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");
    });
    $("#btn-backfill").addEventListener("click", async () => {
      $("#settings-status").innerHTML = '<span class="spinner spinner-sm"></span> Backfilling…';
      const r = await api("/import/history", "POST", { limit: 20 });
      $("#settings-status").textContent = r.error ? "Error: " + r.error : `Added ${r.added} past solves (scanned ${r.scanned}).`;
      App.loadOverview();
    });
    $("#btn-sweep").addEventListener("click", async () => {
      $("#settings-status").innerHTML = '<span class="spinner spinner-sm"></span> Enriching…';
      const r = await api("/enrich/sweep", "POST", { limit: 20 });
      $("#settings-status").textContent = r.llm ? `Enriched ${r.enriched}, ${r.remaining} remaining.` : "Coach not enabled.";
    });
  }

  // ---- tiny markdown (headers, bullets, bold) ----------------------------------
  function mdToHtml(md) {
    const lines = (md || "").split("\n");
    let html = "", inList = false;
    const inline = (s) => escapeHtml(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`(.+?)`/g, "<code>$1</code>");
    for (const line of lines) {
      const l = line.trim();
      if (/^#{1,3}\s/.test(l)) {
        if (inList) { html += "</ul>"; inList = false; }
        const level = l.match(/^#+/)[0].length;
        html += `<h${level + 1}>${inline(l.replace(/^#+\s/, ""))}</h${level + 1}>`;
      } else if (/^[-*]\s/.test(l)) {
        if (!inList) { html += "<ul>"; inList = true; }
        html += `<li>${inline(l.replace(/^[-*]\s/, ""))}</li>`;
      } else if (l) {
        if (inList) { html += "</ul>"; inList = false; }
        html += `<p>${inline(l)}</p>`;
      }
    }
    if (inList) html += "</ul>";
    return html;
  }

  function isoWeek(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
  }

  window.Views = { renderToday, renderDiscover, renderTopics, renderInsights,
    renderPlaybook, renderHistory, renderProblems, renderSettings };
})();
