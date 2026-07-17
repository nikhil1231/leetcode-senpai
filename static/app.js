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
let recallStatusInterval = null;
let pendingRecallPollIds = new Set();
let pendingStart = null;
let categories = [];
let llmEnabled = false;
let llmProvider = "";
let llmModel = "";
let nudgeShown = {};
let pauseRequestId = 0;

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
  llmProvider = o.llm_provider || "";
  llmModel = o.llm_model || "";
  const coachLabel = llmModel ? `${llmProvider}/${llmModel}` : "coach";
  $("#overview").innerHTML = `
    <span>Solved <b>${o.solved}</b>/${o.total_problems}</span>
    <span>Due <b>${o.due_reviews}</b></span>
    <span>Streak <b>${o.streak}</b>🔥</span>
    <span>XP today <b>${o.xp_today}</b></span>
    <span>Leeches <b>${o.leeches}</b></span>
    ${llmEnabled ? `<span class="ai-on">Coach on: ${escapeHtml(coachLabel)}</span>` : '<span class="ai-off">Coach off</span>'}`;
  (o.newly_mastered || []).forEach((m) =>
    toast(`🎉 Topic mastered: ${m.category}!`));
}

// ---- session start flow --------------------------------------------------------
async function startFlow(slug, kind, mode, title, category, recallAttemptId, gradingStatus) {
  if (mode === "recall") return openRecall(slug, title, category, recallAttemptId, gradingStatus);
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
  if (!pendingStart) return;
  const { slug, kind } = pendingStart;
  pendingStart = null;
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
    $("#recall-grade").innerHTML = `<div class="grading"><span class="spinner"></span><span class="grading-text">Grading in the background...</span></div>`;
    $("#recall-actions").innerHTML = `<button id="btn-close-recall" class="button is-primary">Close</button>`;
    $("#btn-close-recall").addEventListener("click", () => $("#recall-modal").classList.add("hidden"));
  } else if (a.grading_status === "ready") {
    setRecallInputsDisabled(true);
    renderRecallGrade(a.recall_grade, true);
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

function renderRecallGrade(g, needsAck = false) {
  g = g || {};
  stopRecallGrading();
  $("#recall-grade").classList.remove("hidden");
  $("#recall-grade").innerHTML = `
    <div class="grade-score">Recall grade: <b>${g.grade}/3</b></div>
    ${g.feedback ? `<p>${escapeHtml(g.feedback)}</p>` : ""}
    ${g.key_ideas_missed && g.key_ideas_missed.length ?
      `<p class="missed"><b>You missed:</b> ${g.key_ideas_missed.map(escapeHtml).join("; ")}</p>` : ""}
    ${currentRecall.category ? `<p class="small"><b>Category:</b> ${escapeHtml(currentRecall.category)}</p>` : ""}
    <p class="small">${needsAck ? "Click Done to schedule the next review." : "Scheduled next review accordingly."}</p>`;
  if (needsAck) {
    $("#recall-actions").innerHTML = `<button id="btn-close-recall" class="button is-ghost">Close</button>
      <button id="btn-ack-recall" class="button is-primary">Done</button>`;
    $("#btn-close-recall").addEventListener("click", () => $("#recall-modal").classList.add("hidden"));
    $("#btn-ack-recall").addEventListener("click", ackRecall);
  } else {
    $("#recall-actions").innerHTML = `<button id="btn-close-recall" class="button is-primary">Done</button>`;
    $("#btn-close-recall").addEventListener("click", () => {
      $("#recall-modal").classList.add("hidden"); loadOverview(); render(currentActiveTab());
    });
  }
}

async function ackRecall() {
  if (!currentRecall.attempt_id) return;
  try {
    await api(`/review/recall/${currentRecall.attempt_id}/ack`, "POST");
  } catch (e) {
    toast(e.message);
    return;
  }
  $("#recall-modal").classList.add("hidden");
  toast("Recall scheduled.");
  loadOverview();
  render(currentActiveTab());
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
  if (r.grading_status === "pending") {
    $("#recall-modal").classList.add("hidden");
    toast("Recall is grading in the background.");
    loadOverview();
    render(currentActiveTab());
    startRecallStatusPolling([r.attempt_id]);
    return;
  }
  if (r.graded) {
    const g = r.graded;
    $("#recall-grade").classList.remove("hidden");
    $("#recall-grade").innerHTML = `
      <div class="grade-score">Recall grade: <b>${g.grade}/3</b></div>
      ${g.feedback ? `<p>${escapeHtml(g.feedback)}</p>` : ""}
      ${g.key_ideas_missed && g.key_ideas_missed.length ?
        `<p class="missed"><b>You missed:</b> ${g.key_ideas_missed.map(escapeHtml).join("; ")}</p>` : ""}
      ${currentRecall.category ? `<p class="small"><b>Category:</b> ${escapeHtml(currentRecall.category)}</p>` : ""}
      <p class="small">Scheduled next review accordingly.</p>`;
    $("#recall-actions").innerHTML = `<button id="btn-close-recall" class="button is-primary">Done</button>`;
    $("#btn-close-recall").addEventListener("click", () => {
      $("#recall-modal").classList.add("hidden"); loadOverview(); render(currentActiveTab());
    });
  } else {
    $("#recall-modal").classList.add("hidden");
    toast("Recall logged ✅");
    loadOverview(); render(currentActiveTab());
  }
}

function startRecallStatusPolling(ids = []) {
  ids.forEach((id) => id && pendingRecallPollIds.add(id));
  if (!pendingRecallPollIds.size || recallStatusInterval) return;
  recallStatusInterval = setInterval(pollRecallStatuses, 5000);
  pollRecallStatuses();
}

function stopRecallStatusPolling() {
  if (recallStatusInterval) clearInterval(recallStatusInterval);
  recallStatusInterval = null;
  pendingRecallPollIds.clear();
}

async function pollRecallStatuses() {
  if (currentActiveTab() !== "today") return;
  const ids = Array.from(pendingRecallPollIds);
  if (!ids.length) { stopRecallStatusPolling(); return; }
  await Promise.all(ids.map(async (id) => {
    try {
      const attempt = await api(`/review/recall/${id}`);
      patchRecallCard(attempt);
      if (attempt.grading_status !== "pending") pendingRecallPollIds.delete(id);
    } catch (e) {
      pendingRecallPollIds.delete(id);
    }
  }));
  if (!pendingRecallPollIds.size) stopRecallStatusPolling();
}

function patchRecallCard(attempt) {
  const card = document.querySelector(`[data-recall-card="${attempt.id}"]`);
  if (!card) return;
  const titleRow = card.querySelector(".title-row");
  const btn = card.querySelector("button[data-attempt]");
  if (!titleRow || !btn) return;
  titleRow.querySelectorAll(".recall-status-tag").forEach((el) => el.remove());
  const status = attempt.grading_status || "";
  const tag = document.createElement("span");
  tag.className = "tag recall-status-tag " + (
    status === "ready" ? "is-success is-light" :
    status === "failed" ? "is-danger is-light" :
    "is-warning is-light"
  );
  tag.textContent = status === "ready" ? "grade ready" : status === "failed" ? "failed" : "grading";
  titleRow.appendChild(tag);
  btn.dataset.status = status;
  btn.textContent = status === "ready" ? "View grade" : status === "failed" ? "Retry" : "Grading...";
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
    loadOverview(),
    loadCategories(),
    refreshActive(),
    refreshPending(),
  ]);
  if (llmEnabled) runSweep();
}

function showUserChip(email) {
  $("#user-chip").innerHTML = `<span class="small">${email}</span> <button id="btn-signout" class="button is-ghost is-small">Sign out</button>`;
  $("#btn-signout").addEventListener("click", () => firebase.auth().signOut());
}

// expose for views.js
window.App = { startFlow, openDetail, openRecall, startMock, loadOverview, render,
  currentActiveTab, api, runSweep, startRecallStatusPolling, stopRecallStatusPolling,
  get llmEnabled() { return llmEnabled; } };

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
