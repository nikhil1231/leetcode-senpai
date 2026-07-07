// ---- auth / mode ---------------------------------------------------------------
const LOCAL = ["127.0.0.1", "localhost"].includes(window.location.hostname) ||
  !window.FIREBASE_CONFIG || !window.FIREBASE_CONFIG.apiKey;
let appStarted = false;

async function getToken() {
  if (LOCAL) return null;
  const u = firebase.auth().currentUser;
  return u ? await u.getIdToken() : null;
}

// ---- shared helpers (exposed for views.js) -------------------------------------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const COMPLEXITIES = ["", "O(1)", "O(log n)", "O(n)", "O(n log n)", "O(n^2)", "O(n^3)", "O(2^n)", "O(n!)"];

const api = async (path, method = "GET", body) => {
  const headers = { "Content-Type": "application/json" };
  const token = await getToken();
  if (token) headers["Authorization"] = "Bearer " + token;
  const sess = localStorage.getItem("lc_session");
  const csrf = localStorage.getItem("lc_csrf");
  if (sess) headers["X-LC-Session"] = sess;
  if (csrf) headers["X-LC-Csrf"] = csrf;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch("/api" + path, opts);
  if (res.status === 401 || res.status === 403) {
    showSignIn("Session expired or not authorized. Sign in again.");
    throw new Error("auth");
  }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || res.statusText);
  return res.json();
};

const fmtTime = (s) => {
  if (s == null) return "—";
  const m = Math.floor(s / 60), sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};
const pct = (v) => (v == null ? "—" : v.toFixed(1) + "%");
const escapeHtml = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const toast = (msg) => {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  setTimeout(() => t.classList.add("hidden"), 3200);
};
const badge = (d) => `<span class="badge ${d}">${d}</span>`;
const cxOptions = (sel) => COMPLEXITIES.map((c) =>
  `<option value="${c}"${c === sel ? " selected" : ""}>${c || "—"}</option>`).join("");

window.H = { $, $$, api, fmtTime, pct, badge, escapeHtml, toast, cxOptions, COMPLEXITIES };

// ---- state ---------------------------------------------------------------------
let activeSession = null;
let timerInterval = null;
let pollInterval = null;
let currentAttempt = null;
let currentRecall = null;
let pendingStart = null;
let categories = [];
let llmEnabled = false;
let nudgeShown = {};

// ---- sign-in gate --------------------------------------------------------------
function showSignIn(msg) {
  $("#app").classList.add("hidden");
  $("#signin-gate").classList.remove("hidden");
  if (msg) $("#signin-error").textContent = msg;
}
function hideSignIn() {
  $("#signin-gate").classList.add("hidden");
  $("#app").classList.remove("hidden");
}

// ---- tabs / router -------------------------------------------------------------
$$("#tabs button").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$("#tabs button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    $$(".tab").forEach((t) => t.classList.add("hidden"));
    $("#tab-" + btn.dataset.tab).classList.remove("hidden");
    render(btn.dataset.tab);
  });
});
function currentActiveTab() { return $("#tabs button.active").dataset.tab; }
function render(tab) {
  const fn = window.Views["render" + tab.charAt(0).toUpperCase() + tab.slice(1)];
  (fn || window.Views.renderToday)();
}

// ---- overview ------------------------------------------------------------------
async function loadOverview() {
  const o = await api("/overview");
  llmEnabled = o.llm_enabled;
  $("#overview").innerHTML = `
    <span>Solved <b>${o.solved}</b>/${o.total_problems}</span>
    <span>Due <b>${o.due_reviews}</b></span>
    <span>Streak <b>${o.streak}</b>🔥</span>
    <span>XP today <b>${o.xp_today}</b></span>
    <span>Leeches <b>${o.leeches}</b></span>
    ${llmEnabled ? '<span class="ai-on">✨ Coach on</span>' : '<span class="ai-off">Coach off</span>'}`;
  (o.newly_mastered || []).forEach((m) =>
    toast(`🎉 Topic mastered: ${m.category}!`));
}

// ---- session start flow --------------------------------------------------------
async function startFlow(slug, kind, mode, title, category) {
  if (mode === "recall") return openRecall(slug, title, category);
  pendingStart = { slug, kind };
  $("#predict-problem").textContent = title ? `${title}` : slug;
  const cats = categories.length ? categories : (await loadCategories());
  $("#predict-cats").innerHTML = cats.map((c) =>
    `<button data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join("");
  $$("#predict-cats button").forEach((b) => b.addEventListener("click", () => {
    $$("#predict-cats button").forEach((x) => x.classList.remove("sel"));
    b.classList.add("sel");
  }));
  $("#predict-approach").value = "";
  $("#predict-modal").classList.remove("hidden");
}

async function loadCategories() {
  try {
    const topics = await api("/topics");
    categories = topics.map((t) => t.category);
  } catch (e) { categories = []; }
  return categories;
}

async function doStart(withPrediction) {
  $("#predict-modal").classList.add("hidden");
  const { slug, kind } = pendingStart;
  const body = { slug, kind };
  if (withPrediction) {
    const sel = $("#predict-cats button.sel");
    body.predicted_category = sel ? sel.dataset.cat : null;
    body.predicted_approach = $("#predict-approach").value || null;
  }
  const s = await api("/session/start", "POST", body);
  window.open(s.url, "_blank", "noopener");
  nudgeShown = {};
  await refreshActive();
  toast("Timer started — solve it on LeetCode, it'll auto-log.");
}
$("#btn-do-predict").addEventListener("click", () => doStart(true));
$("#btn-skip-predict").addEventListener("click", () => doStart(false));

// ---- active session / timer / hints / nudges -----------------------------------
async function refreshActive() {
  const { active } = await api("/session/active");
  activeSession = active;
  const banner = $("#active-banner");
  if (active) {
    banner.classList.remove("hidden");
    $("#active-title").textContent = active.title;
    $("#active-link").href = active.url;
    $("#btn-hint").classList.toggle("hidden", !active.hints_available);
    startTimer(active.started_at);
    startPolling();
  } else {
    banner.classList.add("hidden");
    $("#hint-panel").classList.add("hidden");
    $("#nudge").classList.add("hidden");
    stopTimer();
    stopPolling();
  }
}

function startTimer(startedAt) {
  stopTimer();
  const tick = () => {
    const elapsed = Math.floor(Date.now() / 1000) - startedAt;
    $("#active-timer").textContent = fmtTime(elapsed);
    checkNudges(elapsed);
  };
  tick();
  timerInterval = setInterval(tick, 1000);
}
function stopTimer() { if (timerInterval) clearInterval(timerInterval); timerInterval = null; }

function checkNudges(elapsed) {
  const n = $("#nudge");
  if (elapsed >= 35 * 60 && !nudgeShown.solution) {
    nudgeShown.solution = true;
    n.innerHTML = `⏱️ 35 min in. Reading the solution now is a smart move — mark it "Read solution" and you'll re-solve it in 2 days. That's the plan, not a failure.`;
    n.classList.remove("hidden");
  } else if (elapsed >= 20 * 60 && !nudgeShown.hint) {
    nudgeShown.hint = true;
    n.innerHTML = `💡 20 min in. Stuck? Try revealing hint 1 before pushing further.`;
    n.classList.remove("hidden");
  }
}

$("#btn-hint").addEventListener("click", async () => {
  try {
    const r = await api("/session/hint", "POST");
    const panel = $("#hint-panel");
    panel.classList.remove("hidden");
    if (r.hint == null) {
      panel.innerHTML = `<p class="small">${llmEnabled ? "No hints available for this one." : "Hints need the coach (Gemini) enabled."}</p>`;
      return;
    }
    const existing = panel.querySelector(".hint-list");
    const item = `<div class="hint-item"><b>Hint ${r.level}/${r.total || 3}</b> ${escapeHtml(r.hint)}</div>`;
    if (existing) existing.insertAdjacentHTML("beforeend", item);
    else panel.innerHTML = `<div class="hint-list">${item}</div>`;
  } catch (e) { toast(e.message); }
});

function startPolling() {
  stopPolling();
  pollInterval = setInterval(async () => {
    try {
      const res = await api("/poll", "POST");
      if (res.pending && res.pending.length) {
        stopPolling();
        openAnnotate(res.pending[0]);
        await refreshActive();
        loadOverview();
      }
    } catch (e) { /* transient */ }
  }, 4000);
}
function stopPolling() { if (pollInterval) clearInterval(pollInterval); pollInterval = null; }

async function refreshPending() {
  const { pending } = await api("/pending");
  if (pending && pending.length) openAnnotate(pending[0]);
}

$("#btn-cancel-session").addEventListener("click", async () => {
  await api("/session/cancel", "POST");
  await refreshActive();
});

// ---- annotation modal ----------------------------------------------------------
function openAnnotate(attempt) {
  currentAttempt = attempt;
  $("#annotate-title").textContent = attempt.title;
  $("#annotate-problem-id").textContent = attempt.frontend_id ? `#${attempt.frontend_id} · ` : "";
  $("#annotate-problem-link").href = attempt.url || `https://leetcode.com/problems/${attempt.slug}/`;
  const difficulty = $("#annotate-difficulty");
  difficulty.textContent = attempt.difficulty || "";
  difficulty.className = attempt.difficulty ? `badge ${attempt.difficulty}` : "badge hidden";
  const meta = [];
  if (attempt.neetcode_category) meta.push(attempt.neetcode_category);
  if (attempt.slug) meta.push(attempt.slug);
  $("#annotate-problem-meta").textContent = meta.join(" · ");
  const facts = [];
  facts.push(`Time <b>${fmtTime(attempt.time_taken_sec)}</b>`);
  if (attempt.runtime_percentile != null) facts.push(`Runtime beats <b>${pct(attempt.runtime_percentile)}</b>`);
  if (attempt.memory_percentile != null) facts.push(`Memory beats <b>${pct(attempt.memory_percentile)}</b>`);
  if (attempt.wrong_before_ac != null) facts.push(`Wrong subs <b>${attempt.wrong_before_ac}</b>`);
  if (attempt.lang) facts.push(`Lang <b>${attempt.lang}</b>`);
  $("#annotate-facts").innerHTML = facts.join("");
  // default independence to "hints" if they used the hint ladder
  const usedHints = (attempt.hint_level_used || 0) >= 2;
  selectPill("#conf-group", "2");
  selectPill("#indep-group", usedHints ? "hints" : "solo");
  $("#annotate-time").innerHTML = cxOptions("");
  $("#annotate-space").innerHTML = cxOptions("");
  $("#annotate-note").value = "";
  $("#annotate-approach").value = "";
  $("#annotate-modal").classList.remove("hidden");
}

function selectPill(group, val) {
  $$(`${group} button`).forEach((b) => b.classList.toggle("sel", b.dataset.val === val));
}
$$("#conf-group button").forEach((b) => b.addEventListener("click", () => selectPill("#conf-group", b.dataset.val)));
$$("#indep-group button").forEach((b) => b.addEventListener("click", () => selectPill("#indep-group", b.dataset.val)));

function closeAnnotate() {
  $("#annotate-modal").classList.add("hidden");
  currentAttempt = null;
}
$("#btn-close-annotate").addEventListener("click", closeAnnotate);

$("#btn-save-annotate").addEventListener("click", async () => {
  const confidence = Number($("#conf-group button.sel").dataset.val);
  const independence = $("#indep-group button.sel").dataset.val;
  const r = await api(`/attempt/${currentAttempt.id}/annotate`, "POST", {
    confidence, independence,
    mistake_note: $("#annotate-note").value || null,
    approach: $("#annotate-approach").value || null,
    complexity_time: $("#annotate-time").value || null,
    complexity_space: $("#annotate-space").value || null,
  });
  closeAnnotate();
  toast(llmEnabled ? "Logged ✅ — coach is reading your notes…" : "Logged ✅");
  if (r.similar) {
    setTimeout(() => offerSimilar(r.similar), 400);
  }
  loadOverview();
  render(currentActiveTab());
  if (llmEnabled) setTimeout(runSweep, 2500);
});

function offerSimilar(sim) {
  if (confirm(`You struggled with that. Want to queue a similar problem (${sim.title}) as follow-up practice?`)) {
    api("/import/problem", "POST", { slug: sim.slug })
      .then(() => toast(`Added ${sim.title} to your library.`))
      .catch((e) => toast(e.message));
  }
}

// ---- recall modal --------------------------------------------------------------
function openRecall(slug, title, category) {
  currentRecall = { slug, title, category };
  $("#recall-problem").textContent = `${title || slug}${category ? " · " + category : ""}`;
  $("#recall-text").value = "";
  $("#recall-time").innerHTML = cxOptions("");
  $("#recall-space").innerHTML = cxOptions("");
  $("#recall-grade").classList.add("hidden");
  $("#recall-grade").innerHTML = "";
  $("#recall-actions").innerHTML =
    `<button id="btn-close-recall" class="ghost">Cancel</button>
     <button id="btn-submit-recall" class="primary">${llmEnabled ? "Check my recall" : "Grade & schedule"}</button>`;
  wireRecallButtons();
  $("#recall-modal").classList.remove("hidden");
}

function wireRecallButtons() {
  $("#btn-close-recall").addEventListener("click", () => $("#recall-modal").classList.add("hidden"));
  $("#btn-submit-recall").addEventListener("click", submitRecall);
}

async function submitRecall() {
  const body = {
    slug: currentRecall.slug, recall_text: $("#recall-text").value,
    complexity_time: $("#recall-time").value || null,
    complexity_space: $("#recall-space").value || null,
  };
  if (!llmEnabled) {
    // manual self-grade path: ask confidence via pills inline
    body.confidence = await pickSelfGrade();
    if (body.confidence == null) return;
  }
  const r = await api("/review/recall", "POST", body);
  if (r.graded) {
    const g = r.graded;
    $("#recall-grade").classList.remove("hidden");
    $("#recall-grade").innerHTML = `
      <div class="grade-score">Recall grade: <b>${g.grade}/3</b></div>
      ${g.feedback ? `<p>${escapeHtml(g.feedback)}</p>` : ""}
      ${g.key_ideas_missed && g.key_ideas_missed.length ?
        `<p class="missed"><b>You missed:</b> ${g.key_ideas_missed.map(escapeHtml).join("; ")}</p>` : ""}
      <p class="small">Scheduled next review accordingly.</p>`;
    $("#recall-actions").innerHTML = `<button id="btn-close-recall" class="primary">Done</button>`;
    $("#btn-close-recall").addEventListener("click", () => {
      $("#recall-modal").classList.add("hidden"); loadOverview(); render(currentActiveTab());
    });
  } else {
    $("#recall-modal").classList.add("hidden");
    toast("Recall logged ✅");
    loadOverview(); render(currentActiveTab());
  }
}

function pickSelfGrade() {
  return new Promise((resolve) => {
    const g = $("#recall-grade");
    g.classList.remove("hidden");
    g.innerHTML = `<label>Self-grade your recall:</label>
      <div class="pill-group" id="recall-selfgrade">
        <button data-c="1">Low</button><button data-c="2">Med</button><button data-c="3">High</button></div>`;
    $$("#recall-selfgrade button").forEach((b) =>
      b.addEventListener("click", () => resolve(Number(b.dataset.c))));
  });
}

// ---- attempt detail (solution archive) -----------------------------------------
async function openDetail(attemptId) {
  const a = await api(`/attempt/${attemptId}`);
  const e = a.enrichment || {};
  const tags = (e.user_overrides && e.user_overrides.tags) || e.mistake_tags || [];
  const body = `
    <h2>${escapeHtml(a.title || a.slug)} ${a.difficulty ? badge(a.difficulty) : ""}</h2>
    <div class="detail-meta small">${escapeHtml(a.neetcode_category || "")} · ${a.solved_at ? new Date(a.solved_at * 1000).toLocaleString() : ""}</div>
    <div class="facts">
      ${a.time_taken_sec != null ? `Time <b>${fmtTime(a.time_taken_sec)}</b>` : ""}
      ${a.confidence ? `Conf <b>${["", "Low", "Med", "High"][a.confidence]}</b>` : ""}
      ${a.independence ? `<b>${a.independence}</b>` : ""}
      ${a.complexity_time ? `Time <b>${escapeHtml(a.complexity_time)}</b>` : ""}
    </div>
    ${a.approach ? `<p><b>Your approach:</b> ${escapeHtml(a.approach)}</p>` : ""}
    ${a.mistake_note ? `<p><b>Note:</b> ${escapeHtml(a.mistake_note)}</p>` : ""}
    ${e.pattern_used ? `<p><b>Pattern used:</b> ${escapeHtml(e.pattern_used)} ${e.complexity_verdict && e.complexity_verdict !== "match" ? `<span class="warn-chip">${escapeHtml(e.complexity_verdict.replace("_", " "))}</span>` : ""}</p>` : ""}
    ${tags.length ? `<p><b>Mistakes:</b> ${tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join(" ")}</p>` : ""}
    ${e.diff_summary ? `<p><b>Since last time:</b> ${escapeHtml(e.diff_summary)}</p>` : ""}
    ${a.code ? `<pre class="code">${escapeHtml(a.code)}</pre>` : `<p class="small">No stored code for this attempt.</p>`}`;
  $("#detail-body").innerHTML = body;
  $("#detail-modal").classList.remove("hidden");
}
$("#btn-close-detail").addEventListener("click", () => $("#detail-modal").classList.add("hidden"));

// ---- mock runner ---------------------------------------------------------------
async function startMock() {
  const m = await api("/mock/start", "POST");
  renderMock(m);
  $("#mock-modal").classList.remove("hidden");
}

function renderMock(m) {
  const end = m.started_at + m.duration_sec;
  const list = m.problems.map((p, i) => `
    <div class="mock-prob">
      <span class="mock-role ${p.role}">${p.role}</span>
      <a href="${p.url}" target="_blank" rel="noopener">${escapeHtml(p.title)}</a> ${badge(p.difficulty)}
      <button class="ghost mock-open" data-slug="${p.slug}" data-title="${escapeHtml(p.title)}">Start</button>
    </div>`).join("");
  $("#mock-body").innerHTML = `
    <h2>Mock interview <span class="mock-timer" id="mock-timer"></span></h2>
    <p class="small">60 minutes, three problems, no hints. Solve on LeetCode; they auto-log. Finish when done or time's up.</p>
    ${list}
    <div class="modal-actions">
      <button id="btn-finish-mock" class="primary" data-id="${m.id}">Finish &amp; score</button>
    </div>`;
  const tick = () => {
    const left = end - Math.floor(Date.now() / 1000);
    $("#mock-timer") && ($("#mock-timer").textContent = left > 0 ? fmtTime(left) + " left" : "time up");
  };
  tick(); const iv = setInterval(tick, 1000);
  $$("#mock-body .mock-open").forEach((b) => b.addEventListener("click", async () => {
    const s = await api("/session/start", "POST", { slug: b.dataset.slug, kind: "mock" });
    window.open(s.url, "_blank", "noopener");
    await refreshActive();
  }));
  $("#btn-finish-mock").addEventListener("click", async () => {
    clearInterval(iv);
    const res = await api(`/mock/${m.id}/finish`, "POST");
    $("#mock-modal").classList.add("hidden");
    toast(`Mock scored: ${res.score}/100 (${res.solved_count}/${m.problems.length} solved)`);
    loadOverview(); render(currentActiveTab());
  });
}

// ---- enrichment sweep ----------------------------------------------------------
async function runSweep() {
  try {
    const r = await api("/enrich/sweep", "POST", { limit: 10 });
    if (r.enriched > 0 && currentActiveTab() === "history") render("history");
  } catch (e) { /* ignore */ }
}

// ---- app start -----------------------------------------------------------------
async function startApp() {
  if (appStarted) return;
  appStarted = true;
  await loadOverview();
  await loadCategories();
  await refreshActive();
  await refreshPending();
  render("today");
  if (llmEnabled) runSweep();
}

function showUserChip(email) {
  $("#user-chip").innerHTML = `<span class="small">${email}</span> <button id="btn-signout" class="ghost">Sign out</button>`;
  $("#btn-signout").addEventListener("click", () => firebase.auth().signOut());
}

// expose for views.js
window.App = { startFlow, openDetail, openRecall, startMock, loadOverview, render,
  currentActiveTab, api, runSweep, get llmEnabled() { return llmEnabled; } };

// ---- boot ----------------------------------------------------------------------
// Deferred to DOMContentLoaded so views.js (loaded after this file) has defined
// window.Views before the first render.
function boot() {
  if (LOCAL) {
    hideSignIn();
    $("#user-chip").innerHTML = '<span class="small">local mode</span>';
    startApp();
    return;
  }
  firebase.initializeApp(window.FIREBASE_CONFIG);
  $("#btn-signin").addEventListener("click", async () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    try { await firebase.auth().signInWithPopup(provider); }
    catch (e) { $("#signin-error").textContent = e.message; }
  });
  firebase.auth().onAuthStateChanged((user) => {
    if (user) { hideSignIn(); showUserChip(user.email); startApp(); }
    else { showSignIn(); }
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
