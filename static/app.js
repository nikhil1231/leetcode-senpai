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
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(apiErrorMessage(payload.detail) || res.statusText);
  }
  return res.json();
};

const apiErrorMessage = (detail) => {
  if (!detail) return "";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map(apiErrorMessage).filter(Boolean).join("; ");
  }
  if (typeof detail === "object") {
    if (detail.msg) {
      const loc = Array.isArray(detail.loc) ? detail.loc.join(".") : detail.loc;
      return loc ? `${loc}: ${detail.msg}` : detail.msg;
    }
    if (detail.message) return detail.message;
    return JSON.stringify(detail);
  }
  return String(detail);
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
const DIFF_TAG = { Easy: "diff-easy", Medium: "diff-medium", Hard: "diff-hard" };
const diffTagClass = (d) => DIFF_TAG[d] || "";
const badge = (d) => `<span class="tag ${diffTagClass(d)}">${d || "—"}</span>`;
const cxOptions = (sel) => COMPLEXITIES.map((c) =>
  `<option value="${c}"${c === sel ? " selected" : ""}>${c || "—"}</option>`).join("");
// Reusable async-loading indicator (matches the recall grading spinner).
const loader = (msg = "Loading…") =>
  `<div class="loading-block"><span class="spinner"></span><span>${escapeHtml(msg)}</span></div>`;
const sanitizeProblemHtml = (html) => {
  if (!html) return "";
  const template = document.createElement("template");
  template.innerHTML = html;
  const allowed = new Set([
    "P", "PRE", "CODE", "STRONG", "B", "EM", "I", "UL", "OL", "LI", "BR",
    "TABLE", "THEAD", "TBODY", "TR", "TH", "TD", "SUP", "SUB", "SPAN",
  ]);
  template.content.querySelectorAll("*").forEach((el) => {
    if (!allowed.has(el.tagName)) {
      el.replaceWith(...Array.from(el.childNodes));
      return;
    }
    Array.from(el.attributes).forEach((attr) => el.removeAttribute(attr.name));
  });
  return template.innerHTML;
};

window.H = { $, $$, api, fmtTime, pct, badge, escapeHtml, toast, cxOptions, loader, COMPLEXITIES };

// ---- state ---------------------------------------------------------------------
let activeSession = null;
let timerInterval = null;
let pollInterval = null;
let currentAttempt = null;
let currentRecall = null;
let pendingStart = null;
let categories = [];
let llmEnabled = false;
let llmProvider = "";
let llmModel = "";
let nudgeShown = {};
let pauseRequestId = 0;
let sprintRound = null;
let sprintTimer = null;
let userEmail = "";
let appMeta = null;

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
$$("#tabs li").forEach((li) => {
  li.addEventListener("click", () => {
    $$("#tabs li").forEach((b) => b.classList.remove("is-active"));
    li.classList.add("is-active");
    $$(".tab").forEach((t) => t.classList.add("hidden"));
    $("#tab-" + li.dataset.tab).classList.remove("hidden");
    render(li.dataset.tab);
  });
});
function currentActiveTab() { return $("#tabs li.is-active").dataset.tab; }
function render(tab) {
  const fn = window.Views["render" + tab.charAt(0).toUpperCase() + tab.slice(1)];
  (fn || window.Views.renderToday)();
}

// ---- overview ------------------------------------------------------------------
async function loadOverview() {
  const o = await api("/overview");
  llmEnabled = o.llm_enabled;
  const drillsToday = o.drills_today > 0
    ? `<span>Drills <b>${o.drills_today}</b></span>`
    : "";
  llmProvider = o.llm_provider || "";
  llmModel = o.llm_model || "";
  const coachLabel = llmModel ? `${llmProvider}/${llmModel}` : "coach";
  $("#overview").innerHTML = `
    <span>Solved <b>${o.solved}</b>/${o.total_problems}</span>
    <span>Due <b>${o.due_reviews}</b></span>
    <span>Streak <b>${o.streak}</b>🔥</span>
    <span>XP today <b>${o.xp_today}</b></span>
    ${drillsToday}
    <span>Leeches <b>${o.leeches}</b></span>
    ${llmEnabled ? `<span class="ai-on">Coach on: ${escapeHtml(coachLabel)}</span>` : '<span class="ai-off">Coach off</span>'}`;
  (o.newly_mastered || []).forEach((m) =>
    toast(`🎉 Topic mastered: ${m.category}!`));
}

// ---- session start flow --------------------------------------------------------
async function startFlow(slug, kind, mode, title, category, recallAttemptId, gradingStatus) {
  if (mode === "recall") return openRecall(slug, title, category, recallAttemptId, gradingStatus);
  if (kind === "drill") return startSession({ slug, kind });
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

async function startSession(body) {
  const s = await api("/session/start", "POST", body);
  window.open(s.url, "_blank", "noopener");
  nudgeShown = {};
  await refreshActive();
  loadOverview();
  render(currentActiveTab());
  toast("Timer started — solve it on LeetCode, it'll auto-log.");
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
  if (!pendingStart) return;
  const { slug, kind } = pendingStart;
  pendingStart = null;
  const body = { slug, kind };
  if (withPrediction) {
    const sel = $("#predict-cats button.sel");
    body.predicted_category = sel ? sel.dataset.cat : null;
    body.predicted_approach = $("#predict-approach").value || null;
  }
  await startSession(body);
}
$("#btn-do-predict").addEventListener("click", () => doStart(true));
$("#btn-skip-predict").addEventListener("click", () => doStart(false));
$("#btn-close-predict").addEventListener("click", () => {
  pendingStart = null;
  $("#predict-modal").classList.add("hidden");
});

// ---- active session / timer / hints / nudges -----------------------------------
async function refreshActive() {
  const { active } = await api("/session/active");
  const previousId = activeSession && activeSession.session_id;
  activeSession = active;
  const run = $("#active-run");
  if (active) {
    run.classList.remove("hidden");
    $("#active-title").textContent = active.title;
    $("#active-link").href = active.url;
    $("#active-kind").textContent = active.kind === "mock"
      ? "Mock interview problem"
      : "Solve this problem before returning to the rest of the dashboard.";
    if (previousId !== active.session_id) {
      $("#hint-panel").innerHTML = "";
      $("#hint-panel").classList.add("hidden");
      $("#nudge").classList.add("hidden");
    }
    setDashboardLocked(true);
    setHintButton(active);
    setPauseButton(active);
    startTimer(active);
    startPolling();
  } else {
    run.classList.add("hidden");
    $("#hint-panel").classList.add("hidden");
    $("#nudge").classList.add("hidden");
    setDashboardLocked(false);
    stopTimer();
    stopPolling();
  }
}

function setDashboardLocked(locked) {
  document.body.classList.toggle("has-active-session", locked);
  ["#tabs", "#overview", "#user-chip", "main"].forEach((sel) => {
    const el = $(sel);
    if (!el) return;
    if (locked) {
      el.setAttribute("inert", "");
      el.setAttribute("aria-hidden", "true");
    } else {
      el.removeAttribute("inert");
      el.removeAttribute("aria-hidden");
    }
  });
}

function setHintButton(active) {
  const btn = $("#btn-hint");
  const total = active.hint_total || 3;
  const used = active.hint_level || 0;
  const next = Math.min(total, used + 1);
  btn.classList.toggle("hidden", !active.hints_available);
  btn.disabled = !active.hints_available || used >= total;
  btn.textContent = used >= total ? `All ${total} hints revealed` : `Reveal hint ${next} of ${total}`;
}

function setPauseButton(active) {
  const btn = $("#btn-pause-session");
  btn.textContent = active.is_paused ? "Resume" : "Pause";
  btn.classList.toggle("is-primary", active.is_paused);
  btn.classList.toggle("is-ghost", !active.is_paused);
  btn.setAttribute("aria-pressed", active.is_paused ? "true" : "false");
  $("#active-run").classList.toggle("is-paused", active.is_paused);
  $("#active-status").textContent = active.is_paused ? "Run paused" : "Current run";
}

function startTimer(session) {
  stopTimer();
  const baseElapsed = session.elapsed_sec || 0;
  const baseWall = Math.floor(Date.now() / 1000);
  session._timerBaseElapsed = baseElapsed;
  session._timerBaseWall = baseWall;
  const tick = () => {
    const elapsed = session.is_paused
      ? baseElapsed
      : baseElapsed + Math.max(0, Math.floor(Date.now() / 1000) - baseWall);
    $("#active-timer").textContent = fmtTime(elapsed);
    checkNudges(elapsed);
  };
  tick();
  timerInterval = setInterval(tick, 1000);
}
function stopTimer() { if (timerInterval) clearInterval(timerInterval); timerInterval = null; }

function activeElapsedSeconds(session = activeSession) {
  if (!session) return 0;
  const baseElapsed = session._timerBaseElapsed ?? session.elapsed_sec ?? 0;
  if (session.is_paused) return baseElapsed;
  const baseWall = session._timerBaseWall ?? Math.floor(Date.now() / 1000);
  return baseElapsed + Math.max(0, Math.floor(Date.now() / 1000) - baseWall);
}

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
  if (!activeSession) return;
  const btn = $("#btn-hint");
  const previousText = btn.textContent;
  const next = (activeSession.hint_level || 0) + 1;
  btn.disabled = true;
  btn.textContent = `Revealing hint ${next}...`;
  try {
    const r = await api("/session/hint", "POST");
    const panel = $("#hint-panel");
    panel.classList.remove("hidden");
    if (r.hint == null) {
      panel.innerHTML = `<p class="small">${llmEnabled ? "No hints available for this one." : "Hints need the coach enabled."}</p>`;
      btn.textContent = previousText;
      btn.disabled = false;
      return;
    }
    activeSession = {
      ...activeSession,
      hint_level: r.level,
      hint_total: r.total || activeSession.hint_total || 3,
    };
    const existing = panel.querySelector(".hint-list");
    const item = `<div class="hint-item" data-hint-level="${r.level}"><b>Hint ${r.level} of ${r.total || 3}</b> ${escapeHtml(r.hint)}</div>`;
    if (existing && existing.querySelector(`[data-hint-level="${r.level}"]`)) {
      setHintButton(activeSession);
      return;
    }
    if (existing) existing.insertAdjacentHTML("beforeend", item);
    else panel.innerHTML = `<div class="hint-list">${item}</div>`;
    setHintButton(activeSession);
  } catch (e) {
    btn.textContent = previousText;
    btn.disabled = false;
    toast(e.message);
  }
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
        render(currentActiveTab());
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
  pauseRequestId++;
  await api("/session/cancel", "POST");
  await refreshActive();
});

$("#btn-pause-session").addEventListener("click", async () => {
  if (!activeSession) return;
  const paused = !activeSession.is_paused;
  const requestId = ++pauseRequestId;
  const previous = { ...activeSession };
  const elapsed = activeElapsedSeconds(activeSession);
  activeSession = {
    ...activeSession,
    is_paused: paused,
    elapsed_sec: elapsed,
    paused_at: paused ? Math.floor(Date.now() / 1000) : null,
  };
  setPauseButton(activeSession);
  startTimer(activeSession);
  try {
    const r = await api("/session/pause", "POST", { paused });
    if (requestId !== pauseRequestId || !activeSession) return;
    activeSession = {
      ...activeSession,
      is_paused: r.is_paused,
      paused_at: r.paused_at,
      paused_sec: r.paused_sec,
      elapsed_sec: r.elapsed_sec ?? elapsed,
    };
    setPauseButton(activeSession);
    startTimer(activeSession);
    toast(paused ? "Timer paused." : "Timer resumed.");
  } catch (e) {
    if (requestId === pauseRequestId) {
      activeSession = previous;
      setPauseButton(activeSession);
      startTimer(activeSession);
    }
    toast(e.message);
  }
});

// ---- annotation modal ----------------------------------------------------------
function openAnnotate(attempt) {
  currentAttempt = attempt;
  $("#annotate-title").textContent = attempt.title;
  $("#annotate-problem-id").textContent = attempt.frontend_id ? `#${attempt.frontend_id} · ` : "";
  $("#annotate-problem-link").href = attempt.url || `https://leetcode.com/problems/${attempt.slug}/`;
  const difficulty = $("#annotate-difficulty");
  difficulty.textContent = attempt.difficulty || "";
  difficulty.className = attempt.difficulty ? `tag ${diffTagClass(attempt.difficulty)}` : "tag hidden";
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
  initAnnotateGrade(attempt);
}

// ---- solution grading (inside the annotate modal) ------------------------------
let annotateGradeTimer = null;
let annotateGradePoll = null;

function initAnnotateGrade(attempt) {
  const panel = $("#annotate-grade");
  stopAnnotateGrading();
  if (annotateGradePoll) { clearTimeout(annotateGradePoll); annotateGradePoll = null; }
  panel.classList.add("hidden");
  panel.innerHTML = "";
  if (!llmEnabled || !attempt.code) return;
  const status = attempt.solution_grading_status;
  if (status === "viewed" && attempt.solution_grade) {
    renderSolutionGrade(attempt.solution_grade);
  } else if (status === "pending") {
    showAnnotateGrading([
      "Reading your solution…",
      "Checking the complexity…",
      "Comparing against the optimal approach…",
      "Grading…",
    ]);
    pollSolutionGrade(attempt.id);
  } else if (status === "failed") {
    renderSolutionGradeError(attempt.solution_grading_error, attempt.id);
  } else if (status !== "skipped") {
    showGradeButton(attempt.id);  // stale solve — grade on demand
  }
}

function showAnnotateGrading(messages) {
  const g = $("#annotate-grade");
  g.classList.remove("hidden");
  g.innerHTML = `<div class="grading"><span class="spinner"></span>
    <span class="grading-text">${escapeHtml(messages[0])}</span></div>`;
  stopAnnotateGrading();
  let i = 0;
  if (messages.length > 1) {
    annotateGradeTimer = setInterval(() => {
      i = (i + 1) % messages.length;
      const t = g.querySelector(".grading-text");
      if (t) t.textContent = messages[i];
    }, 1400);
  }
}
function stopAnnotateGrading() {
  if (annotateGradeTimer) { clearInterval(annotateGradeTimer); annotateGradeTimer = null; }
}

async function pollSolutionGrade(attemptId, tries = 0) {
  // Stop if the modal closed or a different solve is showing.
  if (!currentAttempt || currentAttempt.id !== attemptId
      || $("#annotate-modal").classList.contains("hidden")) {
    stopAnnotateGrading();
    return;
  }
  if (tries > 30) {  // ~60s ceiling
    renderSolutionGradeError("Grading is taking longer than expected.", attemptId);
    return;
  }
  let a;
  try {
    a = await api(`/attempt/${attemptId}`);
  } catch (e) {
    annotateGradePoll = setTimeout(() => pollSolutionGrade(attemptId, tries + 1), 2000);
    return;
  }
  const status = a.solution_grading_status;
  if (status === "viewed" && a.solution_grade) {
    if (currentAttempt) currentAttempt.solution_grade = a.solution_grade;
    renderSolutionGrade(a.solution_grade);
  } else if (status === "failed") {
    renderSolutionGradeError(a.solution_grading_error, attemptId);
  } else if (status === "skipped") {
    stopAnnotateGrading();
    $("#annotate-grade").classList.add("hidden");
  } else {
    annotateGradePoll = setTimeout(() => pollSolutionGrade(attemptId, tries + 1), 2000);
  }
}

function renderSolutionGrade(g) {
  g = g || {};
  stopAnnotateGrading();
  const panel = $("#annotate-grade");
  panel.classList.remove("hidden");
  const imp = (g.improvements || []).filter(Boolean);
  const hasCx = g.inferred_time || g.inferred_space;
  panel.innerHTML = `
    <div class="grade-score">Solution grade: <b>${g.score}/5</b>${
      g.optimal ? ` <span class="tag grade-optimal">optimal</span>` : ""}</div>
    ${g.analysis ? `<p>${escapeHtml(g.analysis)}</p>` : ""}
    ${hasCx ? `<p class="small"><b>Complexity:</b> time ${escapeHtml(g.inferred_time || "?")}, space ${escapeHtml(g.inferred_space || "?")}</p>` : ""}
    ${imp.length ? `<p class="missed"><b>Improve:</b></p><ul class="improvements">${
      imp.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>` : ""}`;
}

function renderSolutionGradeError(err, attemptId) {
  stopAnnotateGrading();
  const panel = $("#annotate-grade");
  panel.classList.remove("hidden");
  panel.innerHTML = `<p class="missed"><b>Grading failed:</b> ${escapeHtml(err || "Unknown error")}</p>
    <div class="grade-actions"><button id="btn-grade-solution" class="button is-small is-link">Retry grading</button></div>`;
  wireGradeButton(attemptId);
}

function showGradeButton(attemptId) {
  const panel = $("#annotate-grade");
  panel.classList.remove("hidden");
  panel.innerHTML =
    `<div class="grade-actions"><button id="btn-grade-solution" class="button is-small is-link">Grade my solution</button></div>`;
  wireGradeButton(attemptId);
}

function wireGradeButton(attemptId) {
  const btn = $("#btn-grade-solution");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    showAnnotateGrading(["Grading your solution…"]);
    let r;
    try {
      r = await api(`/attempt/${attemptId}/grade-solution`, "POST");
    } catch (e) {
      renderSolutionGradeError(e.message, attemptId);
      return;
    }
    if (r.grading_status === "viewed" && r.graded) {
      if (currentAttempt) currentAttempt.solution_grade = r.graded;
      renderSolutionGrade(r.graded);
    } else if (r.grading_status === "skipped") {
      $("#annotate-grade").classList.add("hidden");
    } else {
      renderSolutionGradeError(r.grading_error, attemptId);
    }
  });
}

function selectPill(group, val) {
  $$(`${group} button`).forEach((b) => b.classList.toggle("sel", b.dataset.val === val));
}
$$("#conf-group button").forEach((b) => b.addEventListener("click", () => selectPill("#conf-group", b.dataset.val)));
$$("#indep-group button").forEach((b) => b.addEventListener("click", () => selectPill("#indep-group", b.dataset.val)));

function closeAnnotate() {
  $("#annotate-modal").classList.add("hidden");
  stopAnnotateGrading();
  if (annotateGradePoll) { clearTimeout(annotateGradePoll); annotateGradePoll = null; }
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
async function openRecall(slug, title, category, attemptId = null, gradingStatus = null) {
  currentRecall = { slug, title, category, attempt_id: attemptId, grading_status: gradingStatus };
  stopRecallGrading();
  $("#recall-problem").textContent = title || slug;
  $("#recall-statement").innerHTML = loader("Loading problem prompt...");
  const help = $("#recall-statement").nextElementSibling;
  if (help) help.textContent = "No coding. Read the prompt, identify the pattern, then recall the method.";
  $("#recall-text").value = "";
  $("#recall-text").disabled = false;
  $("#recall-time").disabled = false;
  $("#recall-space").disabled = false;
  $("#recall-time").innerHTML = cxOptions("");
  $("#recall-space").innerHTML = cxOptions("");
  $("#recall-grade").classList.add("hidden");
  $("#recall-grade").innerHTML = "";
  $("#recall-actions").innerHTML =
    `<button id="btn-close-recall" class="button is-ghost">Cancel</button>
     <button id="btn-submit-recall" class="button is-primary">${llmEnabled ? "Check my recall" : "Grade & schedule"}</button>`;
  wireRecallButtons();
  $("#recall-modal").classList.remove("hidden");
  try {
    const ctx = await api(`/problem/${encodeURIComponent(slug)}/recall-context`);
    currentRecall = { ...currentRecall, ...ctx };
    $("#recall-problem").textContent = ctx.title || title || slug;
    const html = sanitizeProblemHtml(ctx.content_html);
    $("#recall-statement").innerHTML = html ||
      `<p class="small">Prompt unavailable. <a href="${ctx.url || `https://leetcode.com/problems/${slug}/`}" target="_blank" rel="noopener">Open on LeetCode</a>.</p>`;
  } catch (e) {
    $("#recall-statement").innerHTML =
      `<p class="small">Prompt unavailable. <a href="https://leetcode.com/problems/${slug}/" target="_blank" rel="noopener">Open on LeetCode</a>.</p>`;
  }
  if (attemptId) {
    await loadRecallAttempt(attemptId);
  }
}

function wireRecallButtons() {
  $("#btn-close-recall").addEventListener("click", () => $("#recall-modal").classList.add("hidden"));
  $("#btn-submit-recall").addEventListener("click", submitRecall);
}

async function loadRecallAttempt(attemptId) {
  let a;
  try {
    a = await api(`/review/recall/${attemptId}`);
  } catch (e) {
    toast(e.message);
    return;
  }
  currentRecall = { ...currentRecall, ...a, attempt_id: attemptId, category: a.category || currentRecall.category };
  $("#recall-text").value = a.approach || "";
  $("#recall-time").value = a.complexity_time || "";
  $("#recall-space").value = a.complexity_space || "";
  if (a.grading_status === "pending") {
    setRecallInputsDisabled(true);
    $("#recall-grade").classList.remove("hidden");
    $("#recall-grade").innerHTML = `<p class="small">This recall is still grading. Try again in a moment.</p>`;
    $("#recall-actions").innerHTML = `<button id="btn-close-recall" class="button is-primary">Close</button>`;
    $("#btn-close-recall").addEventListener("click", () => $("#recall-modal").classList.add("hidden"));
  } else if (a.grading_status === "ready") {
    setRecallInputsDisabled(true);
    renderRecallGrade(a.recall_grade);
  } else if (a.grading_status === "viewed") {
    setRecallInputsDisabled(true);
    renderRecallGrade(a.recall_grade);
  } else if (a.grading_status === "failed") {
    setRecallInputsDisabled(false);
    $("#recall-grade").classList.remove("hidden");
    $("#recall-grade").innerHTML = `<p class="missed"><b>Grading failed:</b> ${escapeHtml(a.grading_error || "Unknown error")}</p>`;
    $("#btn-submit-recall").textContent = "Retry grading";
  }
}

function setRecallInputsDisabled(disabled) {
  $("#recall-text").disabled = disabled;
  $("#recall-time").disabled = disabled;
  $("#recall-space").disabled = disabled;
}

function renderRecallGrade(g) {
  g = g || {};
  stopRecallGrading();
  $("#recall-grade").classList.remove("hidden");
  $("#recall-grade").innerHTML = `
    <div class="grade-score">Recall grade: <b>${g.grade}/3</b></div>
    ${g.feedback ? `<p>${escapeHtml(g.feedback)}</p>` : ""}
    ${g.key_ideas_missed && g.key_ideas_missed.length ?
      `<p class="missed"><b>You missed:</b> ${g.key_ideas_missed.map(escapeHtml).join("; ")}</p>` : ""}
    ${currentRecall.category ? `<p class="small"><b>Category:</b> ${escapeHtml(currentRecall.category)}</p>` : ""}
    <p class="small">Scheduled next review accordingly.</p>
    ${currentRecall.attempt_id ? recallClarificationHtml() : ""}`;
  wireRecallClarification();
  $("#recall-actions").innerHTML = `<button id="btn-close-recall" class="button is-primary">Done</button>`;
  $("#btn-close-recall").addEventListener("click", () => {
    $("#recall-modal").classList.add("hidden"); loadOverview(); render(currentActiveTab());
  });
}

function recallClarificationHtml() {
  return `<div class="recall-clarify">
    <label class="label-sm" for="recall-clarify-text">Ask about this grade</label>
    <textarea id="recall-clarify-text" class="textarea" rows="2" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="What should I clarify about the answer or grade?"></textarea>
    <div class="recall-clarify-actions">
      <button id="btn-recall-clarify" class="button is-small is-link">Ask</button>
    </div>
    <div id="recall-clarify-reply" class="small recall-clarify-reply hidden"></div>
  </div>`;
}

function wireRecallClarification() {
  const btn = $("#btn-recall-clarify");
  if (btn) btn.addEventListener("click", askRecallClarification);
}

async function askRecallClarification() {
  const input = $("#recall-clarify-text");
  const reply = $("#recall-clarify-reply");
  const btn = $("#btn-recall-clarify");
  const question = (input && input.value || "").trim();
  if (!question) { toast("Ask a clarification question first."); return; }
  if (!currentRecall.attempt_id) return;
  btn.disabled = true;
  reply.classList.remove("hidden");
  reply.textContent = "Asking Gemini...";
  try {
    const r = await api(`/review/recall/${currentRecall.attempt_id}/clarify`, "POST", { question });
    reply.textContent = r.reply || "No clarification returned.";
  } catch (e) {
    reply.textContent = e.message || "Recall clarification is unavailable.";
  } finally {
    btn.disabled = false;
  }
}

async function submitRecall() {
  const text = $("#recall-text").value.trim();
  const body = {
    slug: currentRecall.slug, recall_text: text,
    complexity_time: $("#recall-time").value || null,
    complexity_space: $("#recall-space").value || null,
  };
  if (!llmEnabled) {
    // manual self-grade path: ask confidence via pills inline
    body.confidence = await pickSelfGrade();
    if (body.confidence == null) return;
    showRecallGrading(["Scheduling your next review…"]);
  } else {
    if (!text) { toast("Jot down your recall first."); return; }
    showRecallGrading([
      "Reading your recall…",
      "Comparing against your past solution…",
      "Checking for the key trick…",
      "Grading…",
    ]);
  }
  let r;
  try {
    r = await api("/review/recall", "POST", body);
  } catch (e) {
    stopRecallGrading();
    toast(e.message);
    return;
  }
  stopRecallGrading();
  currentRecall.attempt_id = r.attempt_id;
  if (r.grading_status === "failed") {
    setRecallInputsDisabled(false);
    $("#recall-grade").classList.remove("hidden");
    $("#recall-grade").innerHTML = `<p class="missed"><b>Grading failed:</b> ${escapeHtml(r.grading_error || "Unknown error")}</p>`;
    $("#recall-actions").innerHTML =
      `<button id="btn-close-recall" class="button is-ghost">Cancel</button>
       <button id="btn-submit-recall" class="button is-primary">Retry grading</button>`;
    wireRecallButtons();
    return;
  }
  if (r.graded) {
    renderRecallGrade(r.graded);
  } else {
    $("#recall-modal").classList.add("hidden");
    toast("Recall logged ✅");
    loadOverview(); render(currentActiveTab());
  }
}

let recallGradeTimer = null;
function showRecallGrading(messages) {
  // lock the inputs, swap the actions for a disabled spinner, and animate a
  // status line that steps through `messages`.
  $("#recall-text").disabled = true;
  $("#recall-time").disabled = true;
  $("#recall-space").disabled = true;
  const g = $("#recall-grade");
  g.classList.remove("hidden");
  g.innerHTML = `<div class="grading"><span class="spinner"></span>
    <span class="grading-text">${escapeHtml(messages[0])}</span></div>`;
  $("#recall-actions").innerHTML =
    `<button class="button is-ghost" disabled>Cancel</button>
     <button class="button is-primary" disabled><span class="spinner spinner-sm"></span> Grading…</button>`;
  let i = 0;
  if (messages.length > 1) {
    recallGradeTimer = setInterval(() => {
      i = (i + 1) % messages.length;
      const t = $(".grading-text");
      if (t) t.textContent = messages[i];
    }, 1400);
  }
}
function stopRecallGrading() {
  if (recallGradeTimer) { clearInterval(recallGradeTimer); recallGradeTimer = null; }
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

// ---- sprint runner -------------------------------------------------------------
async function startSprint() {
  $("#sprint-modal").classList.remove("hidden");
  $("#sprint-progress").textContent = "";
  $("#sprint-body").innerHTML = loader("Building sprint round...");
  stopSprintTimer();
  let r;
  try {
    r = await api("/sprint/start", "POST", {});
  } catch (e) {
    $("#sprint-body").innerHTML = `<p class="missed"><b>Could not start sprint:</b> ${escapeHtml(e.message)}</p>`;
    toast(e.message);
    return;
  }
  sprintRound = {
    round_id: r.round_id,
    reps: r.reps || [],
    llm_enabled: !!r.llm_enabled,
    index: 0,
    results: [],
    repStartedAt: 0,
    finishing: false,
  };
  if (!sprintRound.reps.length) {
    $("#sprint-body").innerHTML = "<p class='empty'>No sprint reps available. Import more problems or finish a few attempts first.</p>";
    return;
  }
  await loadCategories();
  renderSprintIntro();
}

function closeSprint() {
  stopSprintTimer();
  $("#sprint-modal").classList.add("hidden");
}

function renderSprintIntro() {
  if (!sprintRound) return;
  stopSprintTimer();
  $("#sprint-progress").textContent = `${sprintRound.reps.length} reps ready`;
  $("#sprint-body").innerHTML = `
    <div class="sprint-intro">
      <h3>Pattern sprint rules</h3>
      <p>Read each statement without opening LeetCode, choose the pattern, and add one short reason for the signal you noticed.</p>
      <ul>
        <li>You get 60 seconds per prompt.</li>
        <li>Next saves your answer and immediately moves on.</li>
        <li>Skip leaves the rep unanswered; Finish grades the answers saved so far.</li>
      </ul>
      <div class="overlay-actions">
        <button id="btn-begin-sprint" class="button is-primary">Start</button>
      </div>
    </div>`;
  $("#btn-begin-sprint").addEventListener("click", renderSprintRep);
}

function renderSprintRep() {
  if (!sprintRound) return;
  stopSprintTimer();
  if (sprintRound.index >= sprintRound.reps.length) {
    renderSprintSummary();
    return;
  }
  const rep = sprintRound.reps[sprintRound.index];
  sprintRound.repStartedAt = Math.floor(Date.now() / 1000);
  $("#sprint-progress").textContent = `Rep ${sprintRound.index + 1} of ${sprintRound.reps.length}`;
  const sprintCats = categories.includes(rep.category) || !rep.category
    ? categories
    : [...categories, rep.category].sort((a, b) => a.localeCompare(b));
  const opts = [
    '<option value="" selected disabled>Choose category</option>',
    ...sprintCats.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`),
  ].join("");
  const statement = sanitizeProblemHtml(rep.content_html);
  $("#sprint-body").innerHTML = `
    <div class="sprint-layout">
      <section class="sprint-statement">
        <div class="sprint-problem-head">
          <div>
            <h3>${escapeHtml(rep.title || rep.slug)}</h3>
            <div class="small">${escapeHtml(rep.reason || "")}</div>
          </div>
          <div class="sprint-head-tags">${badge(rep.difficulty)}<span class="sprint-countdown" id="sprint-countdown">01:00</span></div>
        </div>
        <div class="recall-statement sprint-prompt">${statement || "<p class='small'>Prompt unavailable for this rep.</p>"}</div>
      </section>
      <section class="sprint-answer">
        <label class="label-sm">Pattern / category</label>
        <div class="select is-fullwidth"><select id="sprint-category">${opts}</select></div>
        <label class="label-sm">Why</label>
        <input id="sprint-why" class="input" type="text" placeholder="One line: key signal in the statement" />
        <div class="overlay-actions" id="sprint-actions">
          <button id="btn-skip-sprint-rep" class="button is-ghost">Skip</button>
          <button id="btn-finish-sprint" class="button is-ghost">Finish</button>
          <button id="btn-submit-sprint-rep" class="button is-primary">Next</button>
        </div>
      </section>
    </div>`;
  $("#btn-submit-sprint-rep").addEventListener("click", () => submitSprintRep());
  $("#btn-skip-sprint-rep").addEventListener("click", skipSprintRep);
  $("#btn-finish-sprint").addEventListener("click", finishSprintEarly);
  startSprintTimer();
}

function startSprintTimer() {
  const tick = () => {
    if (!sprintRound) return;
    const elapsed = Math.max(0, Math.floor(Date.now() / 1000) - sprintRound.repStartedAt);
    const left = Math.max(0, 60 - elapsed);
    const el = $("#sprint-countdown");
    if (el) {
      el.textContent = fmtTime(left);
      el.classList.toggle("is-expired", left === 0);
    }
  };
  tick();
  sprintTimer = setInterval(tick, 1000);
}

function stopSprintTimer() {
  if (sprintTimer) clearInterval(sprintTimer);
  sprintTimer = null;
}

async function submitSprintRep() {
  if (!sprintRound) return;
  const rep = sprintRound.reps[sprintRound.index];
  const predicted = $("#sprint-category").value;
  const why = $("#sprint-why").value.trim();
  if (!predicted) { toast("Pick a category."); return; }
  if (!why) { toast("Add a one-line why."); return; }
  const btn = $("#btn-submit-sprint-rep");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner spinner-sm"></span> Saving...';
  }
  let r;
  try {
    r = await api("/sprint/submit", "POST", {
      round_id: sprintRound.round_id,
      slug: rep.slug,
      predicted_category: predicted,
      why,
    });
  } catch (e) {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Next";
    }
    toast(e.message);
    return;
  }
  sprintRound.results.push({
    slug: r.slug,
    title: rep.title || r.slug,
    actual_category: r.actual_category || rep.category || "Unknown",
    predicted_category: predicted,
    why,
    attempt_id: r.attempt_id,
    grading_status: r.grading_status || "pending",
  });
  sprintRound.index++;
  renderSprintRep();
}

function skipSprintRep() {
  if (!sprintRound) return;
  sprintRound.results.push({
    slug: (sprintRound.reps[sprintRound.index] || {}).slug,
    title: (sprintRound.reps[sprintRound.index] || {}).title,
    skipped: true,
  });
  sprintRound.index++;
  renderSprintRep();
}

function finishSprintEarly() {
  if (!sprintRound || sprintRound.finishing) return;
  sprintRound.finishing = true;
  sprintRound.index = sprintRound.reps.length;
  renderSprintSummary();
}

async function renderSprintSummary() {
  stopSprintTimer();
  $("#sprint-progress").textContent = "Grading";
  $("#sprint-body").innerHTML = loader("Grading sprint answers...");
  let graded = [];
  try {
    const r = await api("/sprint/grade", "POST", { round_id: sprintRound.round_id });
    graded = r.results || [];
  } catch (e) {
    $("#sprint-body").innerHTML = `<p class="missed"><b>Could not grade sprint:</b> ${escapeHtml(e.message)}</p>
      <div class="overlay-actions"><button id="btn-done-sprint" class="button is-primary">Done</button></div>`;
    $("#btn-done-sprint").addEventListener("click", closeSprint);
    toast(e.message);
    return;
  }
  const byAttempt = Object.fromEntries(graded.map((r) => [r.attempt_id, r]));
  sprintRound.results = (sprintRound.results || []).map((r) => (
    r.skipped || !r.attempt_id ? r : { ...r, ...(byAttempt[r.attempt_id] || {}) }
  ));
  const counts = { correct: 0, partial: 0, wrong: 0, unknown: 0, skipped: 0 };
  const weak = {};
  (sprintRound.results || []).forEach((r) => {
    if (r.skipped) {
      counts.skipped++;
      return;
    }
    const v = counts[r.verdict] == null ? "unknown" : r.verdict;
    counts[v]++;
    if ((v === "partial" || v === "wrong" || v === "unknown") && r.actual_category) {
      weak[r.actual_category] = (weak[r.actual_category] || 0) + 1;
    }
  });
  const weakRows = Object.entries(weak).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const answerRows = (sprintRound.results || []).map((r) => {
    if (r.skipped) {
      return `<li><b>${escapeHtml(r.title || r.slug)}</b><div class="small">Skipped</div></li>`;
    }
    const verdict = r.verdict || "unknown";
    return `<li>
      <b>${escapeHtml(r.title || r.slug)}</b>
      <div class="small">Answer: ${escapeHtml(r.predicted_category || "")} — ${escapeHtml(r.why || "")}</div>
      <div class="small">Actual: ${escapeHtml(r.actual_category || "Unknown")} · Verdict: <span class="pred-${escapeHtml(verdict)}">${escapeHtml(verdict)}</span></div>
      ${r.note ? `<div class="small">${escapeHtml(r.note)}</div>` : ""}
    </li>`;
  }).join("");
  $("#sprint-progress").textContent = "Complete";
  $("#sprint-body").innerHTML = `
    <div class="sprint-summary">
      <div class="sprint-summary-grid">
        ${Object.entries(counts).map(([k, v]) => `<div><b>${v}</b><span>${escapeHtml(k)}</span></div>`).join("")}
      </div>
      <h3>Weakest categories</h3>
      ${weakRows.length ? `<ul>${weakRows.map(([cat, n]) => `<li>${escapeHtml(cat)} <span class="small">${n} miss${n === 1 ? "" : "es"}</span></li>`).join("")}</ul>` : "<p class='empty'>No misses this round.</p>"}
      <h3>Answers</h3>
      ${answerRows ? `<ul>${answerRows}</ul>` : "<p class='empty'>No submitted answers.</p>"}
      <div class="overlay-actions"><button id="btn-done-sprint" class="button is-primary">Done</button></div>
    </div>`;
  refreshAfterSprint();
  $("#btn-done-sprint").addEventListener("click", closeSprint);
}

function refreshAfterSprint() {
  loadOverview();
  if (window.Views) {
    window.Views.renderToday();
    window.Views.renderHistory();
    window.Views.renderInsights();
  }
}

$("#btn-close-sprint").addEventListener("click", closeSprint);

// ---- attempt detail (solution archive) -----------------------------------------
async function openDetail(attemptId) {
  $("#detail-body").innerHTML = loader("Loading attempt…");
  $("#detail-modal").classList.remove("hidden");
  let a;
  try {
    a = await api(`/attempt/${attemptId}`);
  } catch (err) {
    $("#detail-modal").classList.add("hidden");
    toast(err.message);
    return;
  }
  const e = a.enrichment || {};
  if (a.kind === "sprint") {
    const verdict = e.prediction_verdict || "ungraded";
    const body = `
      <h2>${escapeHtml(a.title || a.slug)} ${a.difficulty ? badge(a.difficulty) : ""}</h2>
      <div class="detail-meta small">${escapeHtml(a.neetcode_category || "")} · ${a.solved_at ? new Date(a.solved_at * 1000).toLocaleString() : ""}</div>
      <div class="facts">
        <b>Sprint rep</b>
        ${a.round_id ? `Round <b>${escapeHtml(a.round_id)}</b>` : ""}
        ${a.predicted_category ? `Prediction <b>${escapeHtml(a.predicted_category)}</b>` : ""}
      </div>
      ${a.neetcode_category ? `<p><b>Prompt category:</b> ${escapeHtml(a.neetcode_category)}</p>` : ""}
      ${a.predicted_category ? `<p><b>Your prediction:</b> ${escapeHtml(a.predicted_category)}</p>` : ""}
      ${a.approach || a.predicted_approach ? `<p><b>Why:</b> ${escapeHtml(a.approach || a.predicted_approach)}</p>` : ""}
      <p><b>Verdict:</b> <span class="pred-${escapeHtml(verdict)}">${escapeHtml(verdict)}</span></p>
      ${e.prediction_note ? `<p><b>Note:</b> ${escapeHtml(e.prediction_note)}</p>` : ""}`;
    $("#detail-body").innerHTML = body;
    $("#detail-modal").classList.remove("hidden");
    return;
  }
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
  $("#mock-body").innerHTML = loader("Setting up your mock…");
  $("#mock-modal").classList.remove("hidden");
  let m;
  try {
    m = await api("/mock/start", "POST");
  } catch (e) {
    $("#mock-modal").classList.add("hidden");
    toast(e.message);
    return;
  }
  renderMock(m);
}

function renderMock(m) {
  const end = m.started_at + m.duration_sec;
  const list = m.problems.map((p, i) => `
    <div class="mock-prob">
      <span class="mock-role ${p.role}">${p.role}</span>
      <a href="${p.url}" target="_blank" rel="noopener">${escapeHtml(p.title)}</a> ${badge(p.difficulty)}
      <button class="button is-ghost is-small mock-open" data-slug="${p.slug}" data-title="${escapeHtml(p.title)}">Start</button>
    </div>`).join("");
  $("#mock-body").innerHTML = `
    <h2>Mock interview <span class="mock-timer" id="mock-timer"></span></h2>
    <p class="small">60 minutes, three problems, no hints. Solve on LeetCode; they auto-log. Finish when done or time's up.</p>
    ${list}
    <div class="overlay-actions">
      <button id="btn-finish-mock" class="button is-primary" data-id="${m.id}">Finish &amp; score</button>
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
  // Fire the independent startup requests concurrently instead of awaiting them
  // one-by-one. Serializing them meant the page waited on 4 round-trips
  // end-to-end (header, then a blank gap) before the Today queue even started
  // loading. render("today") paints its own loader immediately and fetches
  // /today in parallel with the rest.
  render("today");
  await Promise.all([
    loadAppMeta(),
    loadOverview(),
    loadCategories(),
    refreshActive(),
    refreshPending(),
  ]);
  if (llmEnabled) runSweep();
}

function formatUpdatedAt(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

async function loadAppMeta() {
  try {
    appMeta = await api("/me");
    renderUserChip();
  } catch (e) { /* auth errors are handled by api(); keep the header usable */ }
}

function renderUserChip() {
  const updated = formatUpdatedAt(appMeta && appMeta.code_updated_at && appMeta.code_updated_at.iso);
  const updatedHtml = updated
    ? `<span class="last-updated" title="${escapeHtml(updated)}">Updated ${escapeHtml(updated)}</span>`
    : "";
  const identity = userEmail || "local mode";
  const signout = userEmail
    ? '<button id="btn-signout" class="button is-ghost is-small">Sign out</button>'
    : "";
  $("#user-chip").innerHTML = `
    ${updatedHtml}
    <span class="small user-identity">${escapeHtml(identity)}</span>
    ${signout}`;
  const btn = $("#btn-signout");
  if (btn) btn.addEventListener("click", () => firebase.auth().signOut());
}

function showUserChip(email) {
  userEmail = email || "";
  renderUserChip();
}

// expose for views.js
window.App = { startFlow, openDetail, openRecall, startMock, startSprint, loadOverview, render,
  currentActiveTab, api, runSweep, get llmEnabled() { return llmEnabled; } };

// ---- boot ----------------------------------------------------------------------
// Deferred to DOMContentLoaded so views.js (loaded after this file) has defined
// window.Views before the first render.
function boot() {
  if (LOCAL) {
    hideSignIn();
    renderUserChip();
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
