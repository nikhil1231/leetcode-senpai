// Tab renderers. Exposed as window.Views. Uses window.H, window.App, window.Charts.
(function () {
  const { $, $$, api, fmtTime, pct, badge, escapeHtml, toast, cxOptions, loader } = window.H;
  const App = window.App, Charts = window.Charts;

  // ---- Today -------------------------------------------------------------------
  async function renderToday() {
    const el = $("#tab-today");
    el.innerHTML = loader("Loading your queue…");
    const [q, reportWrap, mock] = await Promise.all([
      api("/today"), api("/report/latest").catch(() => ({ report: null })),
      api("/mock/status").catch(() => ({})),
    ]);

    let html = "";
    html += await weeklyReportBanner(reportWrap.report);
    html += goalBar(q.goal);
    html += mockCard(mock);

    const item = (it) => `
      <div class="box queue-card">
        <div class="meta">
          <div class="title-row">
            <h3>${escapeHtml(it.title)}</h3>
            ${badge(it.difficulty)}
            ${it.leech ? '<span class="tag is-danger is-light">leech</span>' : ""}
            ${it.mode === "recall" ? '<span class="tag is-link is-light">recall</span>' : ""}
          </div>
          <span class="sub">${escapeHtml(it.category || "")}</span>
          <span class="reason">${escapeHtml(it.reason)}${it.due_date ? " · due " + it.due_date : ""}</span>
        </div>
        <button class="button ${it.mode === "recall" ? "is-link" : "start"}" data-slug="${it.slug}" data-kind="${it.kind}" data-mode="${it.mode || ""}"
          data-title="${escapeHtml(it.title)}" data-cat="${escapeHtml(it.category || "")}">
          ${it.mode === "recall" ? "Recall" : "Start"}</button>
      </div>`;

    html += `<div class="section-title">Reviews due (${q.reviews.length})</div>`;
    html += q.reviews.length ? q.reviews.map(item).join("") : "<p class='empty'>No reviews due — nice.</p>";
    html += `<div class="section-title">New problems (${q.new.length})</div>`;
    html += q.new.length ? q.new.map(item).join("") : "<p class='empty'>Nothing queued. Import a pack in Discover.</p>";
    if (q.expansion && q.expansion.length) {
      html += `<div class="section-title">Grow your library <span class="help-inline">topics you've cleared</span></div>`;
      html += q.expansion.map((x) => `
        <div class="box queue-card expansion">
          <div class="meta"><div class="title-row"><h3>${escapeHtml(x.title)}</h3>${badge(x.difficulty)}
            ${x.like_ratio ? `<span class="ratio">${Math.round(x.like_ratio * 100)}%👍</span>` : ""}</div>
            <span class="reason">${escapeHtml(x.reason)} · ${escapeHtml(x.category)}</span></div>
          <button class="button is-primary is-small import-one" data-slug="${x.slug}">Import</button>
        </div>`).join("");
    }
    el.innerHTML = html;

    $$("#tab-today button[data-slug][data-kind]").forEach((b) => b.addEventListener("click", () =>
      App.startFlow(b.dataset.slug, b.dataset.kind, b.dataset.mode, b.dataset.title, b.dataset.cat)));
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
    $("#btn-start-mock") && $("#btn-start-mock").addEventListener("click", () => App.startMock());
  }

  async function weeklyReportBanner(report) {
    const thisWeek = isoWeek(new Date());
    if (!report || report.iso_week !== thisWeek) {
      if (!App.llmEnabled) return "";
      return `<div class="notification report-banner is-flex is-justify-content-space-between is-align-items-center">
        <div><b>Weekly coach report</b><p class="small">Get this week's diagnosis and focus plan.</p></div>
        <button id="btn-gen-report" class="button is-primary">Generate</button></div>`;
    }
    return `<div class="notification is-info is-light report-banner report-ready">
      <div><b>Weekly coach report</b>
      <ul>${report.insights.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>
      ${report.focus_plan ? `<p class="focus"><b>Focus:</b> ${escapeHtml(report.focus_plan)}</p>` : ""}</div></div>`;
  }

  function goalBar(g) {
    if (!g) return "";
    const bar = (done, goal, label) => {
      const pctv = Math.min(100, goal ? Math.round((done / goal) * 100) : 0);
      return `<div class="goal"><span class="goal-label">${label} ${done}/${goal}</span>
        <span class="goal-track"><span class="goal-fill" style="width:${pctv}%"></span></span></div>`;
    };
    return `<div class="goals">${bar(g.reviews_done, g.reviews_goal, "Reviews this week")}
      ${bar(g.new_done, g.new_goal, "New this week")}</div>`;
  }

  function mockCard(mock) {
    if (!mock || mock.active) {
      if (mock && mock.active) return `<div class="notification mock-banner is-flex is-justify-content-space-between is-align-items-center">
        <div><b>Mock in progress</b></div>
        <button id="btn-start-mock" class="button is-primary">Resume</button></div>`;
      return "";
    }
    if (mock.taken_this_week) return "";
    return `<div class="notification mock-banner is-flex is-justify-content-space-between is-align-items-center">
      <div><b>Weekly mock interview</b>
      <p class="small">60 min · 3 problems · exam conditions. Builds the trend that actually tracks readiness.</p></div>
      <button id="btn-start-mock" class="button is-primary">Start mock</button></div>`;
  }

  // ---- Discover ----------------------------------------------------------------
  async function renderDiscover() {
    const el = $("#tab-discover");
    el.innerHTML = loader("Loading packs…");
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

  // ---- Topics ------------------------------------------------------------------
  async function renderTopics() {
    const el = $("#tab-topics");
    el.innerHTML = loader("Loading topics…");
    const topics = await api("/topics");
    if (!topics.length) { el.innerHTML = "<p class='empty'>No data yet. Import a pack and solve a few.</p>"; return; }
    const color = (m) => (m >= 0.66 ? "var(--green)" : m >= 0.33 ? "var(--amber)" : "var(--red)");
    el.innerHTML = `<div class="section-title">Topic mastery (weakest first)</div>` +
      topics.map((t) => `
        <div class="topic-row">
          <div><div class="name">${escapeHtml(t.category)}</div>
            <div class="small">${t.solved}/${t.total} solved
              ${t.independence_rate != null ? "· " + Math.round(t.independence_rate * 100) + "% solo" : ""}
              ${t.avg_confidence != null ? "· conf " + t.avg_confidence : ""}</div></div>
          <div class="small">${Math.round(t.coverage * 100)}% cov</div>
          <div class="bar"><span style="width:${Math.round(t.mastery * 100)}%;background:${color(t.mastery)}"></span></div>
          <div class="small">mastery ${Math.round(t.mastery * 100)}%</div>
        </div>`).join("");
  }

  // ---- Insights ----------------------------------------------------------------
  async function renderInsights() {
    const el = $("#tab-insights");
    el.innerHTML = loader("Crunching your stats…");
    const d = await api("/insights");
    const fm = Object.entries(d.failure_modes || {}).map(([k, v]) => ({ label: k.replace(/_/g, " "), value: v, color: "var(--red)" }));
    const pa = d.prediction_accuracy || {};
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
        <div class="column"><div class="panel-box"><h3>Failure modes (30 days)</h3>${fm.length ? Charts.bars(fm) : "<p class='empty'>No structured mistakes yet — the coach fills this in.</p>"}</div></div>
        <div class="column"><div class="panel-box"><h3>Pattern recognition</h3>${predHtml(pa)}</div></div>
      </div>
      <div class="panel-box"><h3>Mock score trend</h3>${mockTrendHtml(d.mock_trend)}</div>`;
  }

  function paceHtml(p) {
    if (!p) return "";
    return `<div class="pace">
      <div class="pace-big">${p.solved}/${p.total}</div>
      <div class="small">${p.remaining} left · ${p.rate_per_week}/week</div>
      ${p.eta ? `<div class="pace-eta">Library complete ~ <b>${p.eta}</b></div>` :
        "<div class='small'>Solve a few to project a finish date.</div>"}</div>`;
  }

  function predHtml(pa) {
    if (!pa.graded) return "<p class='empty'>Make pattern predictions when you Start problems — accuracy shows here.</p>";
    const rows = Object.entries(pa.by_category || {}).map(([cat, r]) => {
      const tot = r.correct + r.partial + r.wrong;
      return { label: cat.replace(/ .*/, ""), value: Math.round((r.correct / tot) * 100), display: Math.round((r.correct / tot) * 100) + "%", color: "var(--green)" };
    });
    return `<div class="pace-big">${Math.round((pa.overall_correct_rate || 0) * 100)}%</div>
      <div class="small">overall correct (${pa.graded} graded)</div>${Charts.bars(rows, { max: 100 })}`;
  }

  function mockTrendHtml(trend) {
    if (!trend || !trend.length) return "<p class='empty'>Take a weekly mock to start the trend.</p>";
    return Charts.lines({ Score: trend.map((t) => ({ week: t.date, median_min: t.score })) }, { key: "median_min", yLabel: "score" });
  }

  // ---- Playbook ----------------------------------------------------------------
  async function renderPlaybook() {
    const el = $("#tab-playbook");
    el.innerHTML = loader("Loading playbooks…");
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
        html += `<p class="small">Enable the coach (Gemini) to synthesize playbooks.</p>`;
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
  let historyFilter = "all"; // all | solve | recall — persists across re-renders
  const historyType = (r) => (r.kind === "recall" ? "recall" : "solve");
  const typeTag = (t) => (t === "recall"
    ? '<span class="tag type-recall">recall</span>'
    : '<span class="tag type-solve">solve</span>');

  async function renderHistory() {
    const el = $("#tab-history");
    el.innerHTML = loader("Loading history…");
    const rows = await api("/history?limit=100");
    if (!rows.length) { el.innerHTML = "<p class='empty'>No attempts logged yet.</p>"; return; }
    const confLabel = (c) => (c == null ? "—" : `<span class="conf-${c}">${["", "Low", "Med", "High"][c]}</span>`);
    const predBadge = (r) => {
      if (!r.prediction_verdict) return "";
      const m = { correct: "✓", partial: "~", wrong: "✗" }[r.prediction_verdict] || "";
      return `<span class="pred pred-${r.prediction_verdict}" title="pattern prediction ${r.prediction_verdict}">${m}</span>`;
    };
    const counts = { all: rows.length, solve: 0, recall: 0 };
    rows.forEach((r) => { counts[historyType(r)]++; });
    const fbtn = (f, label) =>
      `<button class="button is-small" data-f="${f}">${label} <span class="ml-1 has-text-grey">${counts[f]}</span></button>`;
    el.innerHTML = `
      <div class="buttons has-addons type-filter" id="history-filter">
        ${fbtn("all", "All")}${fbtn("solve", "Completions")}${fbtn("recall", "Recalls")}
      </div>
      <table class="table is-app is-fullwidth is-hoverable">
      <thead><tr><th>Problem</th><th>Type</th><th>Topic</th><th>When</th><th>Time</th><th>Conf</th><th>How</th><th>Coach read</th></tr></thead>
      <tbody>${rows.map((r) => {
        const t = historyType(r);
        return `
        <tr class="hist-row" data-id="${r.id}" data-type="${t}">
          <td><a href="${r.url}" target="_blank" onclick="event.stopPropagation()">${escapeHtml(r.title)}</a> ${badge(r.difficulty)} ${predBadge(r)}</td>
          <td>${typeTag(t)}</td>
          <td class="small">${escapeHtml(r.neetcode_category || "")}</td>
          <td class="small">${r.solved_at ? new Date(r.solved_at * 1000).toLocaleDateString() : "—"}</td>
          <td>${fmtTime(r.time_taken_sec)}</td>
          <td>${confLabel(r.confidence)}</td>
          <td class="small">${r.independence || "—"}</td>
          <td class="small">${(r.mistake_tags || []).map((t) => `<span class="mtag">${escapeHtml(t)}</span>`).join(" ")}
            ${r.pattern_used ? `<span class="pat">${escapeHtml(r.pattern_used)}</span>` : ""}</td>
        </tr>`; }).join("")}</tbody></table>
      <p class="small">Click a row for code, diffs &amp; the coach's full read.</p>`;

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
  async function renderProblems() {
    const el = $("#tab-problems");
    el.innerHTML = loader("Loading problems…");
    const rows = await api("/problems");
    if (!rows.length) { el.innerHTML = "<p class='empty'>No problems imported. Go to Discover.</p>"; return; }
    el.innerHTML = `<table class="table is-app is-fullwidth is-hoverable">
      <thead><tr><th>#</th><th>Problem</th><th>Topic</th><th>Diff</th><th>Attempts</th><th>Next review</th><th></th></tr></thead>
      <tbody>${rows.map((r) => `
        <tr>
          <td class="small">${r.frontend_id || ""}</td>
          <td><a href="${r.url}" target="_blank">${escapeHtml(r.title)}</a> ${r.leech ? '<span class="tag is-danger is-light">leech</span>' : ""}</td>
          <td class="small">${escapeHtml(r.neetcode_category || "")}</td>
          <td>${badge(r.difficulty)}</td>
          <td>${r.attempt_count}</td>
          <td class="small">${r.due_date || "—"}</td>
          <td><button class="button start is-small" data-slug="${r.slug}" data-title="${escapeHtml(r.title)}" data-cat="${escapeHtml(r.neetcode_category || "")}">Start</button></td>
        </tr>`).join("")}</tbody></table>`;
    $$("#tab-problems .start").forEach((b) => b.addEventListener("click", () =>
      App.startFlow(b.dataset.slug, "adhoc", "", b.dataset.title, b.dataset.cat)));
  }

  // ---- Settings ----------------------------------------------------------------
  async function renderSettings() {
    const el = $("#tab-settings");
    el.innerHTML = loader("Loading settings…");
    const c = await api("/config");
    const hasCookie = !!localStorage.getItem("lc_session");
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

      <div class="section-title">Scheduling &amp; weighting</div>
      <div class="settings-row">
        <div class="settings-field"><label>Reviews / day</label><input id="cfg-review" class="input" type="number" value="${c.review_limit}" /></div>
        <div class="settings-field"><label>New / day</label><input id="cfg-new" class="input" type="number" value="${c.new_limit}" /></div>
      </div>
      <div class="settings-row">
        <div class="settings-field"><label>Weakness weight</label><input id="cfg-weak" class="input" type="number" step="0.1" value="${c.weakness_weight}" /></div>
        <div class="settings-field"><label>Breadth weight</label><input id="cfg-breadth" class="input" type="number" step="0.1" value="${c.breadth_weight}" /></div>
        <div class="settings-field"><label>Mistake weight</label><input id="cfg-mistake" class="input" type="number" step="0.1" value="${c.mistake_weight}" /></div>
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
    });
    $("#btn-clear-cookie").addEventListener("click", () => {
      localStorage.removeItem("lc_session"); localStorage.removeItem("lc_csrf");
      toast("Cookie cleared"); renderSettings();
    });
    $("#btn-save-sched").addEventListener("click", async () => {
      await api("/config", "POST", {
        review_limit: +$("#cfg-review").value, new_limit: +$("#cfg-new").value,
        weakness_weight: +$("#cfg-weak").value, breadth_weight: +$("#cfg-breadth").value,
        mistake_weight: +$("#cfg-mistake").value,
        goal_reviews_per_week: +$("#cfg-grev").value, goal_new_per_week: +$("#cfg-gnew").value,
        discover_min_like_ratio: +$("#cfg-ratio").value, discover_min_votes: +$("#cfg-votes").value,
      });
      toast("Settings saved");
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
      $("#settings-status").textContent = r.llm ? `Enriched ${r.enriched}, ${r.remaining} remaining.` : "Coach (Gemini) not enabled.";
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
