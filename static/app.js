// ---- auth / mode ---------------------------------------------------------------
// The server states the mode outright, and in the two modes with no sign-in gate
// (local, access) it omits the Firebase SDK from the page entirely. The
// hostname/config guesses below are only a fallback for a page served without
// the placeholder substituted — when the server did say, it is believed.
const SERVER_AUTH_MODE = ["local", "access", "firebase"].includes(window.AUTH_MODE)
  ? window.AUTH_MODE : null;
// Cloudflare Access authenticated the caller at the edge; the app carries no
// token of its own and the assertion rides along as a cookie.
const ACCESS = SERVER_AUTH_MODE === "access";
const LOCAL = SERVER_AUTH_MODE === "local" || (SERVER_AUTH_MODE === null && (
  ["127.0.0.1", "localhost"].includes(window.location.hostname) ||
  !window.FIREBASE_CONFIG || !window.FIREBASE_CONFIG.apiKey));
let appStarted = false;

async function getToken() {
  if (LOCAL || ACCESS) return null;
  const u = firebase.auth().currentUser;
  return u ? await u.getIdToken() : null;
}

// ---- shared helpers (exposed for views.js) -------------------------------------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const COMPLEXITIES = ["", "O(1)", "O(log n)", "O(n)", "O(n log n)", "O(n^2)", "O(n^3)", "O(2^n)", "O(n!)"];
const COMPLEXITY_PRESETS = ["O(1)", "O(log n)", "O(n)", "O(n log n)", "O(n^2)"];
const COMPLEXITY_EXAMPLES = [
  ...COMPLEXITIES.filter(Boolean),
  "O(n + m)", "O(nm)", "O(n log k)", "O(k log n)", "O(V + E)", "O(E log V)",
  "O(n sqrt n)", "O(log(min(n, m)))",
];

const api = async (path, method = "GET", body) => {
  // X-Requested-With marks this as a fetch, which is what makes the Cloudflare
  // Access edge answer an expired session with a same-origin 401 instead of a
  // cross-origin 302 out to Google. fetch follows that redirect and then cannot
  // read the result, so a lapse would surface as a bare TypeError —
  // indistinguishable from being offline, and the tab just fills with errors.
  const headers = { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" };
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
    handleAuthFailure(res.status);
    throw new Error("auth");
  }
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw Object.assign(new Error(apiErrorMessage(payload.detail) || res.statusText), { status: res.status });
  }
  // A write has just changed the server's revision counters, so any in-flight
  // freshness check is now answering about the world before it. Drop it, or a
  // render kicked off straight after a mutation could conclude "nothing changed"
  // from a reading taken a moment too early and leave stale rows on screen.
  if (method !== "GET") revInFlight = null;
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
const complexityDatalist = (id) =>
  `<datalist id="${id}">${COMPLEXITY_EXAMPLES.map((c) => `<option value="${c}"></option>`).join("")}</datalist>`;
const complexityFieldHtml = ({ id, label, listId, placeholder }) => `
  <div class="complexity-field">
    <label class="label-sm" for="${id}">${label}</label>
    <input id="${id}" class="input complexity-input" type="text" list="${listId}"
      autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
      inputmode="text" placeholder="${placeholder}" />
    <div class="complexity-presets" data-for="${id}">
      ${COMPLEXITY_PRESETS.map((c) => `<button type="button" class="complexity-preset" data-val="${c}">${c}</button>`).join("")}
    </div>
  </div>`;
function renderComplexityFields(containerSel, { timeId, spaceId, timeLabel = "Time", spaceLabel = "Space" }) {
  const root = $(containerSel);
  if (!root) return;
  const listId = `${root.id}-options`;
  root.innerHTML = `
    ${complexityDatalist(listId)}
    ${complexityFieldHtml({ id: timeId, label: timeLabel, listId, placeholder: "O(n + m)" })}
    ${complexityFieldHtml({ id: spaceId, label: spaceLabel, listId, placeholder: "O(1)" })}`;
  root.querySelectorAll(".complexity-preset").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = $(`#${btn.parentElement.dataset.for}`);
      if (!input || input.disabled) return;
      input.value = btn.dataset.val;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus();
    });
  });
}
const complexityValue = (id) => {
  const input = $(`#${id}`);
  return input && input.value.trim() ? input.value.trim() : null;
};
function setComplexityValue(id, value) {
  const input = $(`#${id}`);
  if (input) input.value = value || "";
}
function setComplexityDisabled(id, disabled) {
  const input = $(`#${id}`);
  if (!input) return;
  input.disabled = disabled;
  const field = input.closest(".complexity-field");
  if (field) field.querySelectorAll(".complexity-preset").forEach((btn) => { btn.disabled = disabled; });
}
// Reusable async-loading indicator (matches the recall grading spinner).
const loader = (msg = "Loading…") =>
  `<div class="loading-block"><span class="spinner"></span><span>${escapeHtml(msg)}</span></div>`;
// A re-render must not blank the page first — replacing a drawn tab with a
// spinner is what made every revisit feel like a full reload. Only an empty tab
// gets the spinner; a refresh keeps what is on screen until the new markup is
// ready (see .tab.is-refreshing, which dims it only if the wait is noticeable).
const beginRender = (el, msg) => {
  if (!el.childElementCount) el.innerHTML = loader(msg);
};
const leetcodeProblemUrl = (slug) => `https://leetcode.com/problems/${encodeURIComponent(slug)}/`;
const normalizeProblemAssetUrl = (src) => {
  const raw = String(src || "").trim();
  if (!raw) return "";
  try {
    const url = raw.startsWith("/")
      ? new URL(raw, "https://assets.leetcode.com")
      : new URL(raw, "https://leetcode.com");
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch (e) {
    return "";
  }
};
const sanitizeProblemHtml = (html) => {
  if (!html) return "";
  const template = document.createElement("template");
  template.innerHTML = html;
  const allowed = new Set([
    "P", "PRE", "CODE", "STRONG", "B", "EM", "I", "UL", "OL", "LI", "BR",
    "TABLE", "THEAD", "TBODY", "TR", "TH", "TD", "SUP", "SUB", "SPAN",
    "IMG",
  ]);
  template.content.querySelectorAll("*").forEach((el) => {
    if (!allowed.has(el.tagName)) {
      el.replaceWith(...Array.from(el.childNodes));
      return;
    }
    if (el.tagName === "IMG") {
      const src = normalizeProblemAssetUrl(el.getAttribute("src"));
      const alt = el.getAttribute("alt") || "";
      const width = el.getAttribute("width");
      const height = el.getAttribute("height");
      if (!src) {
        el.remove();
        return;
      }
      Array.from(el.attributes).forEach((attr) => el.removeAttribute(attr.name));
      el.setAttribute("src", src);
      el.setAttribute("alt", alt);
      el.setAttribute("loading", "lazy");
      el.setAttribute("decoding", "async");
      if (/^\d{1,4}$/.test(width || "")) el.setAttribute("width", width);
      if (/^\d{1,4}$/.test(height || "")) el.setAttribute("height", height);
      return;
    }
    Array.from(el.attributes).forEach((attr) => el.removeAttribute(attr.name));
  });
  return template.innerHTML;
};
function renderProblemStatement(containerSel, problem, slug) {
  const root = $(containerSel);
  if (!root) return;
  const problemUrl = problem?.url || leetcodeProblemUrl(slug);
  const body = sanitizeProblemHtml(problem?.content_html);
  root.innerHTML = `
    <div class="problem-statement-source">
      <a href="${escapeHtml(problemUrl)}" target="_blank" rel="noopener">Open on LeetCode</a>
    </div>
    ${body || `<p class="small">Prompt unavailable.</p>`}`;
}

window.H = { $, $$, api, fmtTime, pct, badge, escapeHtml, toast, cxOptions, loader,
  beginRender, COMPLEXITIES };

renderComplexityFields("#annotate-complexities", {
  timeId: "annotate-time",
  spaceId: "annotate-space",
  timeLabel: "Time complexity",
  spaceLabel: "Space complexity",
});
renderComplexityFields("#predict-complexities", {
  timeId: "predict-time",
  spaceId: "predict-space",
  timeLabel: "Target time",
  spaceLabel: "Target space",
});
renderComplexityFields("#recall-complexities", {
  timeId: "recall-time",
  spaceId: "recall-space",
});

// ---- state ---------------------------------------------------------------------
let activeSession = null;
let timerInterval = null;
let pollInterval = null;
let pollInFlight = false;
let currentAttempt = null;
let currentRecall = null;
let resolveSelfGrade = null;
let recallStatusInterval = null;
let pendingRecallPollIds = new Set();
let llmEnabled = false;
let llmProvider = "";
let llmModel = "";
let nudgeShown = {};
let pauseRequestId = 0;
let sprintRound = null;
let sprintTimer = null;
let categories = [];
let userEmail = "";
let appMeta = null;
let pendingStart = null;

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

// Only auth.py returns 401 or 403, which is what makes the status safe to act
// on. Under Access a 401 is a lapsed edge session: only a document load can
// follow the chain out to Google and back, so reload. A 403 is the allowlist
// turning away an identity the edge already verified — reloading that would
// loop forever, so it says so and stops.
function handleAuthFailure(status) {
  if (!ACCESS) {
    showSignIn("Session expired or not authorized. Sign in again.");
    return;
  }
  if (status === 401) { window.location.reload(); return; }
  $("#app").classList.add("hidden");
  $("#signin-gate").classList.remove("hidden");
  const btn = $("#btn-signin");
  if (btn) btn.classList.add("hidden");
  const sub = document.querySelector("#signin-gate .signin-sub");
  if (sub) sub.textContent = "Signed in at the edge, but not allow-listed for this app.";
  $("#signin-error").textContent = "Add the address to ALLOWED_EMAILS and restart the service.";
}

// ---- tabs / router -------------------------------------------------------------
// Each tab's topbar heading: the title doubles as "where am I", the subtitle says
// what the tab is for, so no section needs to re-explain itself.
const TAB_HEADINGS = {
  today: ["Today", "Your queue for the day"],
  practice: ["Quickfire", "Quick reps for a few spare minutes. Works offline."],
  discover: ["Discover", "Curated packs and highly-rated problems"],
  topics: ["Topics", "Coverage and mastery across the map"],
  insights: ["Insights", "What the data says about your prep"],
  playbook: ["Playbook", "Synthesized cheat sheets per pattern"],
  history: ["History", "Every attempt you have logged"],
  problems: ["Problems", "Your imported library"],
  settings: ["Settings", "Account, coach, and scheduling"],
};
function setPageHeading(tab) {
  const [title, sub] = TAB_HEADINGS[tab] || TAB_HEADINGS.today;
  $("#page-title").textContent = title;
  $("#page-sub").textContent = sub;
}
$$("#tabs li").forEach((li) => {
  li.addEventListener("click", () => {
    $$("#tabs li").forEach((b) => b.classList.remove("is-active"));
    li.classList.add("is-active");
    $$(".tab").forEach((t) => t.classList.add("hidden"));
    $("#tab-" + li.dataset.tab).classList.remove("hidden");
    setPageHeading(li.dataset.tab);
    render(li.dataset.tab);
  });
});
function currentActiveTab() { return $("#tabs li.is-active").dataset.tab; }
// Programmatic navigation for in-page links (e.g. Today's "Topic map" button).
function goTab(tab) {
  const li = $(`#tabs li[data-tab="${tab}"]`);
  if (li) li.click();
}
// ---- freshness ------------------------------------------------------------------
// Drawing a tab costs several Firestore round-trips. Knowing whether it *needs*
// drawing does not: /api/rev answers from server memory in ~2ms with a write
// counter per collection. So a tab nothing has touched since it was drawn is
// left exactly as it stands — no refetch, no spinner, and nothing shifting under
// the cursor. This is why the cache can be aggressive without ever showing
// stale data: we verify freshness rather than betting on a staleness window.
let revInFlight = null;
async function currentRev() {
  if (revInFlight) return revInFlight;
  // A single check serves every render kicked off in the same tick (page load
  // fires five at once); the next user action gets a fresh one.
  const mine = api("/rev")
    .then((r) => JSON.stringify([r.rev, r.date]))
    .catch(() => null);  // freshness unknown -> fall through and re-render
  revInFlight = mine;
  try { return await mine; }
  finally {
    // Expire at the end of the tick. Sharing within one tick is the point;
    // holding it any longer would miss a background job's write.
    if (revInFlight === mine) setTimeout(() => { revInFlight = null; }, 0);
  }
}

const renderedRev = {};  // tab -> the revision its DOM was built from

// `force` redraws regardless — for the rare case where the view depends on
// something the server's counters don't cover.
async function render(tab, { force = false } = {}) {
  const el = $("#tab-" + tab);
  const fn = window.Views["render" + tab.charAt(0).toUpperCase() + tab.slice(1)]
    || window.Views.renderToday;
  const drawn = el.childElementCount > 0;
  // Sample the revision *before* fetching: a write landing mid-render must not
  // be mistaken for one this render already reflects.
  const rev = await currentRev();
  if (!force && drawn && rev && renderedRev[tab] === rev) return;
  if (drawn) el.classList.add("is-refreshing");
  try {
    await fn();
    renderedRev[tab] = rev;
    applySettling();
  } finally {
    el.classList.remove("is-refreshing");
  }
}

// A modal covers the page, not its state: whatever it just wrote — a rating, a
// grade, a sprint's attempts — shows behind it at once, not when it closes. Only
// the visible tab redraws now; the others revalidate by revision when opened.
// Best-effort: a failed redraw leaves the page as it was, never the modal broken.
function refreshBehindModal() {
  loadOverview().catch(() => {});
  render(currentActiveTab()).catch(() => {});
}

// ---- settling rows -------------------------------------------------------------
// A modal that decides a problem's fate covers the queue it came from: a solve
// waiting on its rating, a recall being graded. The rows behind it say so the
// moment that starts, rather than when the modal closes. Marks survive redraws
// until the real outcome lands, then a fresh render replaces them.
const settling = new Map();  // slug -> "solved" | "grading"
const SETTLING_LABEL = { solved: "Solved", grading: "Grading..." };
const SETTLING_TAG = {
  solved: '<span class="tag is-success is-light" data-settling-tag>solved</span>',
  grading: '<span class="tag is-warning is-light" data-settling-tag>grading</span>',
};

function markSettling(slug, state) {
  if (!slug) return;
  settling.set(slug, state);
  applySettling();
}

function clearSettling(slug) {
  if (!settling.delete(slug)) return;
  // The marked rows are only put right by a redraw, so don't let the freshness
  // check skip one.
  delete renderedRev.today;
}

function applySettling() {
  settling.forEach((state, slug) => {
    $$(`#tab-today .q-action[data-kind][data-slug="${slug}"]`).forEach((b) => {
      const row = b.closest(".q-row");
      if (!row || row.dataset.settling === state) return;
      row.dataset.settling = state;
      b.disabled = true;
      b.textContent = SETTLING_LABEL[state];
      row.querySelectorAll(".recall-status-tag, [data-settling-tag]").forEach((t) => t.remove());
      row.querySelector(".q-main").insertAdjacentHTML("beforeend", SETTLING_TAG[state]);
    });
  });
}

// ---- overview ------------------------------------------------------------------
let overviewRev = null;
async function loadOverview({ force = false } = {}) {
  const rev = await currentRev();
  if (!force && overviewRev && overviewRev === rev) return;
  const o = await api("/overview");
  overviewRev = rev;
  llmEnabled = o.llm_enabled;
  llmProvider = o.llm_provider || "";
  llmModel = o.llm_model || "";
  redrawUnratedGrade();

  // `optional` stats collapse first on narrow screens; `mod` tints the value
  // when the number is something to act on (due reviews, leeches).
  const stat = (label, value, { sub = "", mod = "", optional = false } = {}) => `
    <div class="stat${mod ? " " + mod : ""}${optional ? " is-optional" : ""}">
      <span class="stat-label">${label}</span>
      <span class="stat-value">${value}${sub ? `<em>${sub}</em>` : ""}</span>
    </div>`;
  $("#overview").innerHTML = [
    stat("Solved", o.solved, { sub: `/${o.total_problems}` }),
    stat("Due", o.due_reviews, { mod: o.due_reviews ? "is-due" : "" }),
    stat("Streak", `${o.streak}<em>🔥</em>`),
    stat("XP today", o.xp_today, { optional: true }),
    o.drills_today > 0 ? stat("Drills", o.drills_today, { optional: true }) : "",
    stat("Leeches", o.leeches, { mod: o.leeches ? "is-alert" : "", optional: true }),
  ].filter(Boolean).join("");

  const coachLabel = llmModel ? `${llmProvider}/${llmModel}` : "not configured";
  $("#coach-chip").innerHTML = `
    <div class="coach-chip${llmEnabled ? " ai-on" : ""}" title="${escapeHtml(coachLabel)}">
      <span class="coach-dot"></span>
      <span class="coach-model">Coach ${llmEnabled ? escapeHtml(coachLabel) : "off"}</span>
    </div>`;

  (o.newly_mastered || []).forEach((m) =>
    toast(`🎉 Topic mastered: ${m.category}!`));
}

// ---- LeetCode cookie health ----------------------------------------------------
// The cookie is what buys the code behind a solve, the % beaten and the
// wrong-attempt counts. When it lapses nothing breaks loudly: detection keeps
// working off the public feed, so solves still land — just stripped of all of
// that, and ungradable forever after, since the code is only ever fetched once,
// at detection. That is a failure you cannot see by using the app, so it gets
// said in the header until it's fixed.
const LC_WARNING = {
  missing: ["LeetCode cookie not set",
            "Solves are logged, but without your code — so they can't be graded. "
            + "Click to set it in Settings."],
  expired: ["LeetCode cookie expired",
            "LeetCode is no longer accepting it. Solves are still logged, but "
            + "without your code, so they can't be graded. Click to paste a fresh one."],
};

// The last answer, so the post-solve modal can ask for a fresh cookie up front.
let lcState = null;

// The page stays open for hours, and a cookie that was fine at load can die
// under it — so this is asked again whenever the page is looked at again, at
// most every few minutes, and straight away when a solve lands without code.
let lastLcCheckAt = 0;
const LC_RECHECK_GAP_MS = 5 * 60 * 1000;

function recheckLeetCodeAuth() {
  if (Date.now() - lastLcCheckAt < LC_RECHECK_GAP_MS) return;
  checkLeetCodeAuth();
}

async function checkLeetCodeAuth() {
  lastLcCheckAt = Date.now();
  // No cookie in this browser is already the answer — don't spend a round-trip
  // on a question localStorage just settled.
  if (!localStorage.getItem("lc_session")) return renderLcWarning("missing");
  let state;
  try {
    ({ state } = await api("/leetcode-status"));
  } catch (e) {
    return;  // offline or a failed request is not evidence of a dead cookie
  }
  renderLcWarning(state);
}

function renderLcWarning(state) {
  lcState = state;
  redrawUnratedGrade();
  const el = $("#lc-warning");
  const copy = LC_WARNING[state];
  // "ok", and "unknown" — a LeetCode outage must never masquerade as an expired
  // cookie, or the warning stops meaning anything.
  if (!copy) return el.classList.add("hidden");
  const [label, title] = copy;
  el.textContent = label;
  el.title = title;
  el.classList.remove("hidden");
}

$("#lc-warning").addEventListener("click", () => goTab("settings"));

// ---- session start flow --------------------------------------------------------
async function startFlow(slug, kind, mode, title, category, recallAttemptId, gradingStatus) {
  if (mode === "recall") return openRecall(slug, title, category, recallAttemptId, gradingStatus);
  if (kind !== "mock") return openPredict({ slug, kind, title, category });
  return startSession({ slug, kind }, { tabOpened: openProblemTab({ slug }) });
}

// A browser only honours window.open inside the transient activation a real
// click grants — a few seconds — and *any* await can outlive it. Opening the tab
// after the start round-trip therefore worked on a fast connection and was
// silently swallowed on a slow one, which is the worst possible failure mode.
// So the tab is opened from the click itself, before anything is awaited, off
// the URL the modal already fetched. Nothing here touches the network.
function openProblemTab(ctx) {
  const url = (ctx && ctx.url) || leetcodeProblemUrl(ctx.slug);
  return Boolean(window.open(url, "_blank", "noopener"));
}

async function startSession(body, { tabOpened = false } = {}) {
  const s = await api("/session/start", "POST", body);
  // A tab not already opened from the click may be blocked this late; the live
  // run's own problem link is the fallback — so say which happened.
  const opened = tabOpened || Boolean(window.open(s.url, "_blank", "noopener"));
  nudgeShown = {};
  // /session/start already answered with the live-run view; asking
  // /session/active for it again would be a second, guaranteed-cold round-trip.
  applyActive(s.active);
  loadOverview();
  render(currentActiveTab());
  toast(opened
    ? "Timer started — solve it on LeetCode, it'll auto-log."
    : "Timer started — open the problem with the link above.");
}

function renderPredictPatterns() {
  const root = $("#predict-patterns");
  if (!root) return;
  const seen = new Set();
  const opts = categories.filter((c) => {
    const val = (c || "").trim();
    if (!val || seen.has(val)) return false;
    seen.add(val);
    return true;
  });
  root.innerHTML = opts.length
    ? opts.map((c) => `<button type="button" data-val="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join("")
    : `<input id="predict-category-freeform" class="input" type="text" autocomplete="off" placeholder="Pattern category" />`;
  root.querySelectorAll("button").forEach((btn) => {
    btn.classList.remove("sel");
    btn.addEventListener("click", () => selectPill("#predict-patterns", btn.dataset.val));
  });
}

// ---- start any problem (paste a URL, number or title) --------------------------
// Resolving is read-only; nothing is imported until a run actually starts, so
// a mistyped paste leaves no trace in the catalog.
let quickStartPick = null;
let quickStartSeq = 0;

function openQuickStart() {
  quickStartPick = null;
  $("#quickstart-input").value = "";
  $("#quickstart-result").innerHTML =
    '<p class="quickstart-hint">Paste a link, or type a number or title, then press Enter.</p>';
  $("#btn-start-quickstart").disabled = true;
  $("#btn-start-quickstart").textContent = "Start run";
  $("#quickstart-modal").classList.remove("hidden");
  $("#quickstart-input").focus();
}

function closeQuickStart() {
  $("#quickstart-modal").classList.add("hidden");
  quickStartPick = null;
  quickStartSeq++;  // orphan any in-flight lookup
}

async function runQuickStartLookup() {
  const query = $("#quickstart-input").value.trim();
  if (!query) return;
  const seq = ++quickStartSeq;
  quickStartPick = null;
  $("#btn-start-quickstart").disabled = true;
  $("#quickstart-result").innerHTML = loader("Looking it up…");
  let res;
  try {
    res = await api("/problem/resolve", "POST", { query });
  } catch (e) {
    if (seq !== quickStartSeq) return;
    $("#quickstart-result").innerHTML =
      `<p class="quickstart-error">${escapeHtml(e.message)}</p>`;
    return;
  }
  if (seq !== quickStartSeq) return;  // a newer lookup already answered
  renderQuickStartCandidates(res);
}

function renderQuickStartCandidates(res) {
  const list = res.candidates || [];
  $("#quickstart-result").innerHTML = `<div class="quickstart-list">${list.map((c, i) => `
    <button class="quickstart-option" type="button" data-idx="${i}">
      <span class="qs-name">
        ${c.frontend_id ? `<span class="qs-num">#${c.frontend_id}</span> ` : ""}${escapeHtml(c.title)}
        <span class="qs-meta">${escapeHtml(c.category || "—")}${c.in_library ? " · already in your library" : ""}</span>
      </span>
      ${badge(c.difficulty)}
    </button>`).join("")}</div>`;
  const options = $$("#quickstart-result .quickstart-option");
  options.forEach((btn) => {
    btn.addEventListener("click", () => {
      options.forEach((b) => b.classList.remove("sel"));
      btn.classList.add("sel");
      quickStartPick = list[Number(btn.dataset.idx)];
      $("#btn-start-quickstart").disabled = false;
    });
  });
  // One unambiguous hit is the whole point of pasting a link or a number —
  // don't make it a two-click operation.
  if (res.exact && options.length === 1) {
    options[0].classList.add("sel");
    quickStartPick = list[0];
    $("#btn-start-quickstart").disabled = false;
  }
}

async function startQuickStart() {
  if (!quickStartPick) return;
  const pick = quickStartPick;
  const btn = $("#btn-start-quickstart");
  btn.disabled = true;
  // Deliberately sitting down to solve something is what puts it in the
  // library — otherwise its review card would come due and never be served.
  if (!pick.in_library) {
    btn.textContent = "Adding…";
    try {
      await api("/import/problem", "POST", { slug: pick.slug });
    } catch (e) {
      btn.disabled = false;
      btn.textContent = "Start run";
      toast(e.message);
      return;
    }
  }
  closeQuickStart();
  loadOverview();
  startFlow(pick.slug, "adhoc", null, pick.title, pick.category);
}

$("#btn-quick-start").addEventListener("click", openQuickStart);
$("#btn-close-quickstart").addEventListener("click", closeQuickStart);
$("#btn-cancel-quickstart").addEventListener("click", closeQuickStart);
$("#btn-start-quickstart").addEventListener("click", startQuickStart);
$("#quickstart-input").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  // Enter looks up; once something is picked, Enter again starts it.
  if (quickStartPick) startQuickStart();
  else runQuickStartLookup();
});

// ---- pre-solve plan ------------------------------------------------------------
// A run starts from a plan: one line of approach and a time target, the way an
// interview expects you to talk before you type. Pattern, space and edge cases
// are optional. Nothing here waits on the network once you commit — the plan is
// graded after the solve, and critiqued mid-run only if you ask.
const PLAN_SOFT_LIMIT_SEC = 5 * 60;
const PREDICT_MORE_KEY = "predict_more_open";
let planOpenedAt = 0;
let planClockTimer = null;

const planElapsedSec = () => (planOpenedAt ? Math.max(0, Math.round((Date.now() - planOpenedAt) / 1000)) : null);
const fmtClock = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

function tickPlanClock() {
  const sec = planElapsedSec() || 0;
  const clock = $("#predict-clock");
  clock.textContent = fmtClock(sec);
  clock.classList.toggle("is-over", sec >= PLAN_SOFT_LIMIT_SEC);
}

function stopPlanClock() {
  if (planClockTimer) clearInterval(planClockTimer);
  planClockTimer = null;
}

function rememberedPredictMore() {
  try { return localStorage.getItem(PREDICT_MORE_KEY) === "1"; } catch (e) { return false; }
}

async function openPredict(ctx) {
  pendingStart = ctx;
  $("#predict-problem").textContent = ctx.title || ctx.slug;
  $("#predict-statement").innerHTML = loader("Loading problem prompt...");
  $("#predict-approach").value = "";
  setComplexityValue("predict-time", "");
  setComplexityValue("predict-space", "");
  $("#predict-edge-cases").value = "";
  $("#predict-more").open = rememberedPredictMore();
  if (!categories.length) await loadCategories();
  renderPredictPatterns();
  updatePlanReady();
  $("#predict-modal").classList.remove("hidden");
  planOpenedAt = Date.now();
  stopPlanClock();
  tickPlanClock();
  planClockTimer = setInterval(tickPlanClock, 1000);
  $("#predict-approach").focus?.();
  try {
    const problem = await api(`/problem/${encodeURIComponent(ctx.slug)}/recall-context`);
    ctx.url = problem.url;  // openProblemTab needs this without a round-trip
    $("#predict-problem").textContent = problem.title || ctx.title || ctx.slug;
    renderProblemStatement("#predict-statement", problem, ctx.slug);
  } catch (e) {
    renderProblemStatement("#predict-statement", null, ctx.slug);
  }
}

function closePredict() {
  $("#predict-modal").classList.add("hidden");
  stopPlanClock();
  planOpenedAt = 0;
  pendingStart = null;
}

function selectedPredictionCategory() {
  const selected = $("#predict-patterns button.sel");
  if (selected && selected.dataset.val) return selected.dataset.val;
  const input = $("#predict-category-freeform");
  return input && input.value.trim() ? input.value.trim() : null;
}

function plannedEdgeCases() {
  return $("#predict-edge-cases").value
    .split(/\n|;/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function currentPlanBody() {
  return {
    predicted_category: selectedPredictionCategory(),
    predicted_approach: $("#predict-approach").value.trim() || null,
    complexity_target_time: complexityValue("predict-time"),
    complexity_target_space: complexityValue("predict-space"),
    planned_edge_cases: plannedEdgeCases(),
  };
}

// The two things an interviewer asks before you code: what you'll do, and how
// fast it will be. Everything else is optional.
const planReady = (plan) => Boolean(plan.predicted_approach && plan.complexity_target_time);

function updatePlanReady() {
  $("#btn-start-predict").disabled = !planReady(currentPlanBody());
}

// status: "planned" (locked in), "blank" (no idea yet) or "skipped".
function doStart(status) {
  if (!pendingStart) return;
  const ctx = pendingStart;
  const plan = status === "planned" ? currentPlanBody() : null;
  if (plan && !planReady(plan)) return;
  const body = {
    slug: ctx.slug, kind: ctx.kind, plan_status: status,
    plan_time_sec: status === "skipped" ? null : planElapsedSec(),
    ...(plan || {}),
  };
  // Opened from the click itself: nothing is awaited before this, so the
  // browser still honours it.
  const tabOpened = openProblemTab(ctx);
  closePredict();
  return startSession(body, { tabOpened });
}

$("#btn-close-predict").addEventListener("click", closePredict);
$("#btn-skip-predict").addEventListener("click", () => doStart("skipped"));
$("#btn-blank-predict").addEventListener("click", () => doStart("blank"));
$("#btn-start-predict").addEventListener("click", () => doStart("planned"));
$("#predict-approach").addEventListener("input", updatePlanReady);
$("#predict-time").addEventListener("input", updatePlanReady);
$("#predict-more").addEventListener("toggle", () => {
  try { localStorage.setItem(PREDICT_MORE_KEY, $("#predict-more").open ? "1" : "0"); } catch (e) { /* per-browser nicety */ }
});
// Enter walks approach → time → lock in; Ctrl/⌘+Enter locks in from anywhere.
$("#predict-approach").addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || e.shiftKey || e.metaKey || e.ctrlKey) return;
  e.preventDefault();
  $("#predict-time").focus();
});
$("#predict-time").addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || e.metaKey || e.ctrlKey) return;
  e.preventDefault();
  if (planReady(currentPlanBody())) doStart("planned");
  else $("#predict-approach").focus();
});
$("#predict-modal").addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey)) return;
  e.preventDefault();
  if (planReady(currentPlanBody())) doStart("planned");
});

// ---- active session / timer / hints / nudges -----------------------------------
async function refreshActive() {
  const { active } = await api("/session/active");
  applyActive(active);
}

function applyActive(active) {
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
    setPlanCheck(active);
    setPauseButton(active);
    startTimer(active);
    startPolling();
  } else {
    run.classList.add("hidden");
    $("#hint-panel").classList.add("hidden");
    $("#plan-check-panel").classList.add("hidden");
    $("#nudge").classList.add("hidden");
    setDashboardLocked(false);
    stopTimer();
    stopPolling();
  }
}

function setDashboardLocked(locked) {
  document.body.classList.toggle("has-active-session", locked);
  // The warning stays visible during a run — knowing now means you can fix it
  // before the AC lands — but like the rest of the header it isn't clickable
  // until the run is over.
  ["#tabs", "#overview", "#user-chip", "#coach-chip", "#lc-warning", "main"].forEach((sel) => {
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

// The plan check is offered, never shown unasked: an unrequested critique of
// your plan is a hint. Once asked for it stays on screen for the rest of the run.
function setPlanCheck(active) {
  const btn = $("#btn-plan-check");
  const panel = $("#plan-check-panel");
  btn.classList.toggle("hidden", !active.plan_check_available || !!active.plan_check);
  btn.disabled = false;
  btn.textContent = "Check my plan";
  if (active.plan_check) {
    panel.innerHTML = planCritiqueHtml(active.plan_check);
    panel.classList.remove("hidden");
  } else {
    panel.innerHTML = "";
    panel.classList.add("hidden");
  }
}

function planCritiqueHtml(critique) {
  const nudges = (critique.nudges || []).filter(Boolean);
  const missing = (critique.missing_edge_cases || []).filter(Boolean);
  const items = [
    ...nudges.map((n) => `<li>${escapeHtml(n)}</li>`),
    ...missing.map((m) => `<li>Check ${escapeHtml(m)}.</li>`),
  ];
  const verdict = { ready: "Looks ready", revise: "Worth revisiting" }[critique.overall_verdict] || "Plan check";
  return `
    <div class="plan-critique-title">
      <span>Plan check</span>
      <span>${escapeHtml(verdict)}</span>
    </div>
    ${items.length ? `<ul>${items.join("")}</ul>` : `<p class="small">No specific concerns.</p>`}`;
}

$("#btn-plan-check").addEventListener("click", async () => {
  if (!activeSession) return;
  const btn = $("#btn-plan-check");
  btn.disabled = true;
  btn.textContent = "Checking…";
  try {
    const r = await api("/session/plan-check", "POST");
    if (!r.llm || !r.critique) {
      btn.classList.add("hidden");
      toast("Plan check needs an LLM — none is configured.");
      return;
    }
    if (activeSession) activeSession.plan_check = r.critique;
    setPlanCheck({ ...(activeSession || {}), plan_check: r.critique, plan_check_available: true });
  } catch (e) {
    btn.disabled = false;
    btn.textContent = "Check my plan";
    toast(e.message);
  }
});

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
  const sessionId = activeSession && activeSession.session_id;
  pollInterval = setInterval(async () => {
    if (pollInFlight) return;
    pollInFlight = true;
    try {
      const res = await api("/poll", "POST");
      if (!activeSession || activeSession.session_id !== sessionId) return;
      if (res.pending && res.pending.length) {
        stopPolling();
        openAnnotate(res.pending[0]);
        await refreshActive();
        loadOverview();
        render(currentActiveTab());
      }
    } catch (e) { /* transient */ }
    finally { pollInFlight = false; }
  }, 4000);
}
function stopPolling() { if (pollInterval) clearInterval(pollInterval); pollInterval = null; }

// Solve detection outside a live session. POSTing /poll costs the same round
// trip a bare /pending check did, but it also sweeps LeetCode for accepted
// submissions with no attempt behind them — so a problem solved in another tab,
// in a contest, or on the phone gets logged the next time this page is looked
// at, without ever starting a session for it.
let lastDetectAt = 0;
const DETECT_MIN_GAP_MS = 60000;
// With the modal open the answer can still change under it — you AC'd, kept
// optimising, and are coming back to rate the better version. Check more eagerly
// there, since a stale sweep is what gets the wrong solve written to history.
const DETECT_MODAL_GAP_MS = 5000;

async function detectSolves({ force = false } = {}) {
  // Don't re-sweep on every flick back to the tab — the feed doesn't move that fast.
  const modalOpen = !$("#annotate-modal").classList.contains("hidden");
  const gap = modalOpen ? DETECT_MODAL_GAP_MS : DETECT_MIN_GAP_MS;
  if (!force && Date.now() - lastDetectAt < gap) return;
  lastDetectAt = Date.now();
  try {
    const res = await api("/poll", "POST");
    const pending = res.pending || [];
    if (!$("#annotate-modal").classList.contains("hidden")) {
      // Never stack a second modal over one being filled in — but do restate
      // this solve if a better submission has taken it over since it opened.
      const fresh = currentAttempt && pending.find((p) => p.id === currentAttempt.id);
      if (fresh && fresh.submission_id !== currentAttempt.submission_id) refreshAnnotate(fresh);
    } else if (pending.length) {
      openAnnotate(pending[0]);
    }
    if (res.new_attempts && res.new_attempts.length) {
      loadOverview();
      render(currentActiveTab());
    }
  } catch (e) { /* detection is a convenience; never break the page over it */ }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") { detectSolves(); recheckLeetCodeAuth(); }
});
// visibilitychange misses the case where the app was never hidden — a second
// monitor, or LeetCode in its own window. Window focus covers coming back there.
window.addEventListener("focus", () => { detectSolves(); recheckLeetCodeAuth(); });

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
  renderAnnotateFacts(attempt);
  // default independence to "hints" if they used the hint ladder
  const usedHints = (attempt.hint_level_used || 0) >= 2;
  selectPill("#conf-group", "2");
  selectPill("#indep-group", usedHints ? "hints" : "solo");
  // What you did usually is what you planned; start from the plan and edit.
  const plan = attempt.plan || {};
  const fromPlan = plan.status === "planned";
  setComplexityValue("annotate-time", attempt.complexity_time || (fromPlan ? plan.target_time : ""));
  setComplexityValue("annotate-space", attempt.complexity_space || (fromPlan ? plan.target_space : ""));
  $("#annotate-minutes").value = "";
  $("#annotate-library").classList.toggle("hidden", attempt.in_library !== false);
  const addBtn = $("#btn-annotate-add-library");
  addBtn.disabled = false;
  addBtn.textContent = "Add to library";
  $("#annotate-note").value = "";
  $("#annotate-approach").value = attempt.approach || (fromPlan ? plan.approach || "" : "");
  $("#annotate-approach-help").textContent = fromPlan && plan.approach
    ? "from your plan — edit it to what you actually did" : "optional";
  selectPill("#held-group", attempt.plan_held || "");
  renderAnnotatePlan(attempt);
  const saveBtn = $("#btn-save-annotate");
  saveBtn.textContent = "Save";
  delete saveBtn.dataset.saved;
  saveBtn.disabled = false;
  $("#annotate-modal").classList.remove("hidden");
  markSettling(attempt.slug, "solved");
  initAnnotateGrade(attempt);
  // Detection asked for the code and didn't get it: the likeliest reason is
  // the cookie, so find out now rather than on the next reload.
  if (!attempt.code && attempt.submission_id) checkLeetCodeAuth();
}

// Rendered when the modal opens, and again whenever a better submission lands
// for a solve still sitting here unrated.
function renderAnnotateFacts(attempt) {
  const facts = [];
  // A detected solve has no session clock — LeetCode reports when a submission
  // was accepted, never when the problem was opened. Say that outright instead
  // of rendering an em-dash where a time should be, and ask for one below.
  const untimed = attempt.time_taken_sec == null && attempt.source === "detected";
  if (untimed) facts.push("Solved <b>outside a session</b>");
  else facts.push(`Time <b>${fmtTime(attempt.time_taken_sec)}</b>`);
  // The clock above covers the whole sitting once you've resubmitted, so the
  // first AC is worth stating separately — the gap is how long the clean-up took.
  if (attempt.resubmissions) {
    facts.push(`Accepted subs <b>${attempt.resubmissions + 1}</b>`);
    if (attempt.first_ac_time_taken_sec != null) {
      facts.push(`First AC <b>${fmtTime(attempt.first_ac_time_taken_sec)}</b>`);
    }
  }
  if (attempt.runtime_percentile != null) facts.push(`Runtime beats <b>${pct(attempt.runtime_percentile)}</b>`);
  if (attempt.memory_percentile != null) facts.push(`Memory beats <b>${pct(attempt.memory_percentile)}</b>`);
  if (attempt.wrong_before_ac != null) facts.push(`Wrong subs <b>${attempt.wrong_before_ac}</b>`);
  if (attempt.lang) facts.push(`Lang <b>${attempt.lang}</b>`);
  $("#annotate-facts").innerHTML = facts.map((f) => `<span>${f}</span>`).join("");
  $("#annotate-time-row").classList.toggle("hidden", !untimed);
}

// You AC'd something suboptimal, left this modal open, and kept working until it
// was clean. The server folded the better submission into the same attempt; the
// modal is looking at stale facts and a grade of code you've since replaced.
// Restate both. Anything typed is left alone — it's still the same problem.
function refreshAnnotate(fresh) {
  currentAttempt = { ...currentAttempt, ...fresh };
  renderAnnotateFacts(currentAttempt);
  initAnnotateGrade(currentAttempt);
  toast("Picked up your newer submission for this one.");
}

// ---- the plan, after the solve --------------------------------------------------
const PLAN_VERDICTS = {
  viable: ["viable", "ok"], correct: ["right", "ok"],
  partial: ["partly", "partial"], wrong: ["off", "miss"],
};

function verdictTag(verdict) {
  const [label, tone] = PLAN_VERDICTS[verdict] || [];
  return label ? `<span class="plan-tag is-${tone}">${label}</span>` : "";
}

function hitTag(hit, yes = "optimal", no = "not optimal") {
  if (hit == null) return "";
  return `<span class="plan-tag is-${hit ? "ok" : "miss"}">${hit ? yes : no}</span>`;
}

// What was planned, as it was written.
function planSummaryHtml(plan) {
  if (!plan || plan.status === "skipped" || !plan.status) return "";
  if (plan.status === "blank") {
    return `<p class="plan-blank">Started with <b>no idea yet</b>${
      plan.plan_time_sec != null ? ` after ${fmtClock(plan.plan_time_sec)} of thinking` : ""}.
      That's recorded as a struggle, so this problem comes back sooner.</p>`;
  }
  const facts = [];
  if (plan.target_time) facts.push(`Target <b>${escapeHtml(plan.target_time)}</b>${plan.target_space ? ` / <b>${escapeHtml(plan.target_space)}</b>` : ""}`);
  if (plan.pattern) facts.push(`Pattern <b>${escapeHtml(plan.pattern)}</b>`);
  if (plan.check_revealed) facts.push("Plan check used");
  return `
    ${plan.approach ? `<p class="plan-approach">${escapeHtml(plan.approach)}</p>` : ""}
    ${facts.length ? `<div class="plan-facts">${facts.map((f) => `<span>${f}</span>`).join("")}</div>` : ""}
    ${plan.edge_cases && plan.edge_cases.length ? `<div class="plan-edges">${plan.edge_cases.map((c) => `<span class="tag">${escapeHtml(c)}</span>`).join(" ")}</div>` : ""}`;
}

// How the plan held up: the grade, once it has landed.
function planGradeHtml(plan) {
  if (!plan || plan.status !== "planned") return "";
  const rows = [];
  if (plan.approach_verdict && plan.approach_verdict !== "unknown") rows.push(["Approach", verdictTag(plan.approach_verdict)]);
  if (plan.pattern && plan.pattern_verdict && plan.pattern_verdict !== "unknown") rows.push(["Pattern", verdictTag(plan.pattern_verdict)]);
  if (plan.target_time && plan.optimal_time) {
    rows.push(["Time", `${escapeHtml(plan.target_time)} vs optimal ${escapeHtml(plan.optimal_time)} ${hitTag(plan.time_vs_optimal)}${
      plan.solution_time && plan.time_vs_solution === false ? ` <span class="small">· your code: ${escapeHtml(plan.solution_time)}</span>` : ""}`]);
  }
  if (plan.target_space && plan.optimal_space) {
    rows.push(["Space", `${escapeHtml(plan.target_space)} vs optimal ${escapeHtml(plan.optimal_space)} ${hitTag(plan.space_vs_optimal)}`]);
  }
  const checks = plan.edge_checks || [];
  if (checks.length) {
    rows.push(["Edge cases", checks.map((c) =>
      `<span class="plan-tag is-${c.covered ? "ok" : "miss"}" title="${c.covered ? "In your plan" : "Not in your plan"}">${c.covered ? "✓" : "✗"} ${escapeHtml(c.case)}</span>`).join(" ")]);
  }
  const score = plan.score != null
    ? `<div class="plan-score">Plan score <b>${plan.score}/5</b></div>` : "";
  if (!rows.length && !plan.note && !plan.failure_case) return score;
  return `${score}
    ${rows.length ? `<dl class="plan-rows">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>` : ""}
    ${plan.failure_case ? `<p class="plan-failure">A failing test hit <b>${escapeHtml(plan.failure_case)}</b> — not in your plan.</p>` : ""}
    ${plan.note ? `<p class="grade-analysis">${escapeHtml(plan.note)}</p>` : ""}`;
}

function previousPlanHtml(prev) {
  if (!prev || !prev.approach) return "";
  const when = prev.solved_at ? new Date(prev.solved_at * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "";
  const bits = [];
  if (prev.target_time) bits.push(escapeHtml(prev.target_time));
  if (prev.held) bits.push(escapeHtml(prev.held));
  if (prev.score != null) bits.push(`${prev.score}/5`);
  return `<b>Last time${when ? ` (${when})` : ""}${prev.planned ? " you planned" : " you wrote"}:</b> “${escapeHtml(prev.approach)}”${
    bits.length ? ` · ${bits.join(" · ")}` : ""}`;
}

function renderAnnotatePlan(attempt) {
  const plan = attempt.plan || {};
  const card = $("#annotate-plan");
  const shown = plan.status === "planned" || plan.status === "blank";
  card.classList.toggle("hidden", !shown);
  if (!shown) return;
  $("#annotate-plan-meta").textContent = plan.plan_time_sec != null && plan.status === "planned"
    ? `planned in ${fmtClock(plan.plan_time_sec)}` : "";
  $("#annotate-plan-meta").classList.toggle("is-over", (plan.plan_time_sec || 0) >= PLAN_SOFT_LIMIT_SEC);
  $("#annotate-plan-body").innerHTML = planSummaryHtml(plan);
  $("#annotate-plan-held").classList.toggle("hidden", plan.status !== "planned");
  const prev = previousPlanHtml(attempt.previous_plan);
  $("#annotate-plan-previous").innerHTML = prev;
  $("#annotate-plan-previous").classList.toggle("hidden", !prev);
  const grade = $("#annotate-plan-grade");
  if (plan.grading_error) return renderPlanGradeError(plan.grading_error, attempt.id);
  const html = plan.graded ? planGradeHtml(plan) : "";
  grade.innerHTML = html;
  grade.classList.toggle("hidden", !html);
}

function renderPlanGradeError(err, attemptId) {
  const grade = $("#annotate-plan-grade");
  grade.classList.remove("hidden");
  grade.innerHTML = `<p class="missed"><b>Plan grading failed:</b> ${escapeHtml(err || "Unknown error")}</p>
    <div class="grade-actions"><button id="btn-grade-plan" class="button is-small is-link">Retry</button></div>`;
  const btn = $("#btn-grade-plan");
  if (btn) btn.addEventListener("click", () => gradePlanAfterSave(attemptId));
}

async function gradePlanAfterSave(attemptId) {
  const grade = $("#annotate-plan-grade");
  grade.classList.remove("hidden");
  grade.innerHTML = `<div class="grading"><span class="spinner"></span><span class="grading-text">Grading your plan…</span></div>`;
  try {
    const r = await api(`/attempt/${attemptId}/grade-plan`, "POST");
    if (!currentAttempt || currentAttempt.id !== attemptId) return;
    currentAttempt.plan = r.plan;
    if (r.error) return renderPlanGradeError(r.error, attemptId);
    renderAnnotatePlan(currentAttempt);
  } catch (e) {
    if (currentAttempt && currentAttempt.id === attemptId) renderPlanGradeError(e.message, attemptId);
  }
}

$$("#held-group button").forEach((b) => b.addEventListener("click", () => {
  // Optional, so a second click takes the answer back.
  selectPill("#held-group", b.classList.contains("sel") ? "" : b.dataset.val);
}));

// ---- solution grading (inside the annotate modal) ------------------------------
let annotateGradeTimer = null;

function initAnnotateGrade(attempt) {
  const panel = $("#annotate-grade");
  stopAnnotateGrading();
  panel.classList.add("hidden");
  $("#annotate-grade-body").innerHTML = "";
  if (!llmEnabled) return;
  // Grading reads the submitted code, and the code only reaches us with the
  // LeetCode session cookie. A solve detected while it was dead arrives
  // without it; grading fetches it again with whatever cookie this browser
  // holds by then. When that's already known to be dead, ask for a fresh one
  // here, where the grade would have gone.
  if (!attempt.code) {
    if (!attempt.submission_id) return;  // a manual log has no code to fetch
    if (cookieDead()) return renderSolutionNeedsCookie(lcState, attempt.id);
  }
  const status = attempt.solution_grading_status;
  // Claim the column up front so the grade lands where you're already looking,
  // not below the fold after Save.
  if (attempt.confidence == null || !attempt.independence) {
    panel.classList.remove("hidden");
    $("#annotate-grade-body").innerHTML = `<p class="grade-pending">Save your rating and the coach grades your submitted code here.</p>`;
    return;
  }
  if (status === "viewed" && attempt.solution_grade) {
    renderSolutionGrade(attempt.solution_grade);
  } else if (status === "failed") {
    renderSolutionGradeError(attempt.solution_grading_error, attempt.id);
  } else if (!attempt.code) {
    renderSolutionGradeError("Your code wasn't captured when this solve was detected.", attempt.id);
  }
}

// A solve detected on load opens its modal before the overview and the cookie
// check have answered, so the panel above was drawn without either. Draw it
// again when they land — only while unrated, since after Save the panel may
// be holding a grade in flight.
function redrawUnratedGrade() {
  if (!currentAttempt || currentAttempt.confidence != null) return;
  const typed = document.querySelector("#grade-cookie-input");
  if (typed && typed.value) return;  // never wipe a cookie mid-paste
  initAnnotateGrade(currentAttempt);
}

function cookieDead() {
  return lcState === "missing" || lcState === "expired";
}

function showAnnotateGrading(messages) {
  const g = $("#annotate-grade-body");
  $("#annotate-grade").classList.remove("hidden");
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

function renderSolutionGrade(g) {
  g = g || {};
  stopAnnotateGrading();
  $("#annotate-grade").classList.remove("hidden");
  const panel = $("#annotate-grade-body");
  const positives = (g.positives || []).filter(Boolean);
  const negatives = (g.negatives || g.improvements || []).filter(Boolean);
  const hasCx = g.inferred_time || g.inferred_space;
  panel.innerHTML = `
    <div class="grade-score">Score <b>${g.score}/5</b>${
      g.optimal ? ` <span class="tag grade-optimal">optimal</span>` : ""}</div>
    ${g.analysis ? `<p class="grade-analysis">${escapeHtml(g.analysis)}</p>` : ""}
    ${hasCx ? `<p class="small"><b>Complexity:</b> time ${escapeHtml(g.inferred_time || "?")}, space ${escapeHtml(g.inferred_space || "?")}</p>` : ""}
    ${positives.length ? `<div class="grade-bullets grade-positives"><b>Positives</b><ul>${
      positives.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul></div>` : ""}
    ${negatives.length ? `<div class="grade-bullets grade-negatives"><b>Negatives</b><ul>${
      negatives.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul></div>` : ""}`;
}

function markAnnotateDone() {
  const saveBtn = $("#btn-save-annotate");
  saveBtn.textContent = "Done";
  saveBtn.dataset.saved = "1";
  saveBtn.disabled = false;
}

// The cookie died between solving and grading. Take a fresh one right here —
// it's stored exactly as Settings stores it — and grade without leaving.
function renderSolutionNeedsCookie(state, attemptId, note = "") {
  stopAnnotateGrading();
  $("#annotate-grade").classList.remove("hidden");
  const why = state === "missing" ? "no LeetCode cookie is set in this browser"
    : "your LeetCode cookie has expired";
  $("#annotate-grade-body").innerHTML = `
    <p class="missed"><b>Can't fetch your code:</b> ${why}. Paste a fresh
      LEETCODE_SESSION and it's fetched and graded right here.</p>
    ${note ? `<p class="missed">${escapeHtml(note)}</p>` : ""}
    <form id="grade-cookie-form" class="grade-cookie">
      <input id="grade-cookie-input" class="input is-small" type="password"
        autocomplete="off" placeholder="LEETCODE_SESSION value" aria-label="LEETCODE_SESSION cookie" />
      <button class="button is-small is-link" type="submit">Use cookie</button>
    </form>`;
  $("#grade-cookie-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const value = $("#grade-cookie-input").value.trim();
    if (!value) return;
    const btn = $("#grade-cookie-form button");
    btn.disabled = true;
    btn.textContent = "Checking…";
    localStorage.setItem("lc_session", value);
    let state = "unknown";
    try { ({ state } = await api("/leetcode-status")); } catch (_) {}
    renderLcWarning(state);
    if (!currentAttempt || currentAttempt.id !== attemptId) return;
    if (state === "expired") {
      return renderSolutionNeedsCookie(state, attemptId,
        "LeetCode rejected that one — copy it again from a signed-in leetcode.com tab.");
    }
    // Grading waits on the rating, as it always does; before Save, the cookie
    // is simply in place for when it runs.
    if (currentAttempt.confidence == null || !currentAttempt.independence) {
      $("#annotate-grade-body").innerHTML = `<p class="grade-pending">Cookie saved. Save your rating and the coach fetches and grades your code here.</p>`;
      return;
    }
    await gradeSavedSolution(attemptId);
  });
}

function renderSolutionGradeError(err, attemptId) {
  stopAnnotateGrading();
  $("#annotate-grade").classList.remove("hidden");
  $("#annotate-grade-body").innerHTML = `<p class="missed"><b>Grading failed:</b> ${escapeHtml(err || "Unknown error")}</p>
    <div class="grade-actions"><button id="btn-grade-solution" class="button is-small is-link">Retry grading</button></div>`;
  wireGradeButton(attemptId);
}

function wireGradeButton(attemptId) {
  const btn = $("#btn-grade-solution");
  if (btn) btn.addEventListener("click", () => gradeSavedSolution(attemptId));
}

async function gradeSavedSolution(attemptId) {
  showAnnotateGrading([
    "Reading your saved self-assessment…",
    "Checking the submitted solution…",
    "Summarizing the grade…",
  ]);
  try {
    const r = await api(`/attempt/${attemptId}/grade-solution`, "POST");
    if (r.grading_status === "viewed" && r.graded) {
      if (currentAttempt) currentAttempt.solution_grade = r.graded;
      renderSolutionGrade(r.graded);
      markAnnotateDone();
      refreshBehindModal();
      return true;
    }
    if (r.grading_status === "skipped") {
      $("#annotate-grade").classList.add("hidden");
      return true;
    }
    if (r.grading_status === "needs_cookie") {
      renderLcWarning(r.cookie_state);
      renderSolutionNeedsCookie(r.cookie_state, attemptId);
      return false;
    }
    renderSolutionGradeError(r.grading_error, attemptId);
    return false;
  } catch (e) {
    renderSolutionGradeError(e.message, attemptId);
    return false;
  }
}

function selectPill(group, val) {
  $$(`${group} button`).forEach((b) => b.classList.toggle("sel", b.dataset.val === val));
}
$$("#conf-group button").forEach((b) => b.addEventListener("click", () => selectPill("#conf-group", b.dataset.val)));
$$("#indep-group button").forEach((b) => b.addEventListener("click", () => selectPill("#indep-group", b.dataset.val)));

function closeAnnotate({ next = true } = {}) {
  $("#annotate-modal").classList.add("hidden");
  stopAnnotateGrading();
  currentAttempt = null;
  if (next) openNextPending();
}

// A session can only ever produce one solve at a time; a sweep can surface
// several at once (a contest, or a day away from the app). Offer the next one
// instead of leaving the rest sitting unrated in History.
async function openNextPending() {
  if (!$("#annotate-modal").classList.contains("hidden")) return;
  try {
    const { pending } = await api("/pending");
    if (pending && pending.length) openAnnotate(pending[0]);
  } catch (e) { /* they're logged either way */ }
}

async function dismissAnnotate() {
  const attempt = currentAttempt;
  // Chain only once the dismissal has landed, or /pending still returns it.
  closeAnnotate({ next: false });
  if (attempt) clearSettling(attempt.slug);
  if (!attempt || !attempt.id) return openNextPending();
  try {
    await api(`/attempt/${attempt.id}/dismiss-annotation`, "POST");
  } catch (e) {
    toast(e.message);
  }
  // Unrated, the card hasn't moved: the row goes back to how it was.
  refreshBehindModal();
  openNextPending();
}
$("#btn-close-annotate").addEventListener("click", dismissAnnotate);

// Adopting a problem the sweep imported metadata-only. The solve is already in
// history either way — this is what promotes it into the daily rotation.
$("#btn-annotate-add-library").addEventListener("click", async () => {
  if (!currentAttempt) return;
  const btn = $("#btn-annotate-add-library");
  btn.disabled = true;
  btn.textContent = "Adding…";
  try {
    await api("/import/problem", "POST", { slug: currentAttempt.slug });
  } catch (e) {
    btn.disabled = false;
    btn.textContent = "Add to library";
    toast(e.message);
    return;
  }
  currentAttempt.in_library = true;
  $("#annotate-library").classList.add("hidden");
  toast("Added to your library — it'll be scheduled from here.");
  refreshBehindModal();
});

$("#btn-save-annotate").addEventListener("click", async () => {
  if (!currentAttempt) return;
  const saveBtn = $("#btn-save-annotate");
  if (saveBtn.dataset.saved === "1") {
    closeAnnotate();
    return;
  }
  // dataset.saved only covers a save that already landed. A second click while
  // the first request is still in flight has to be dropped too, or one solve
  // is logged twice.
  if (saveBtn.disabled) return;
  saveBtn.disabled = true;
  const attemptId = currentAttempt.id;
  const slug = currentAttempt.slug;
  const confidence = Number($("#conf-group button.sel").dataset.val);
  const independence = $("#indep-group button.sel").dataset.val;
  // Only offered for a detected solve, and only ever fills a blank clock — the
  // server refuses to overwrite a time it measured itself.
  const minutes = Number($("#annotate-minutes").value);
  const timeTakenSec = minutes > 0 ? Math.round(minutes * 60) : null;
  const heldBtn = $("#held-group button.sel");
  const planHeld = (heldBtn && heldBtn.dataset.val) || null;
  let r;
  try {
    r = await api(`/attempt/${attemptId}/annotate`, "POST", {
      confidence, independence,
      mistake_note: $("#annotate-note").value || null,
      approach: $("#annotate-approach").value || null,
      complexity_time: complexityValue("annotate-time"),
      complexity_space: complexityValue("annotate-space"),
      plan_held: planHeld,
      time_taken_sec: timeTakenSec,
    });
  } catch (e) {
    saveBtn.disabled = false;
    toast(e.message);
    return;
  }
  clearSettling(slug);
  refreshBehindModal();
  if (currentAttempt) {
    Object.assign(currentAttempt, {
      confidence, independence,
      mistake_note: $("#annotate-note").value || null,
      approach: $("#annotate-approach").value || null,
      complexity_time: complexityValue("annotate-time"),
      complexity_space: complexityValue("annotate-space"),
    });
    if (timeTakenSec != null && currentAttempt.time_taken_sec == null) {
      currentAttempt.time_taken_sec = timeTakenSec;
    }
  }
  // Only promise a grade we can actually produce. Code missing from a detected
  // solve is fetched at grading time — unless the cookie is already known to be
  // dead, in which case the modal stays open on the prompt for a fresh one.
  const recoverable = llmEnabled && !!(currentAttempt && !currentAttempt.code
    && currentAttempt.submission_id);
  const awaitingCookie = recoverable && cookieDead();
  const willGrade = llmEnabled && !!(currentAttempt
    && (currentAttempt.code || (recoverable && !awaitingCookie)));
  // A plan is graded whether or not there's code: it's the plan being judged.
  const willGradePlan = llmEnabled && !!(currentAttempt && currentAttempt.plan
    && currentAttempt.plan.status === "planned");
  if (currentAttempt && r.plan) {
    currentAttempt.plan = r.plan;
    currentAttempt.plan_held = planHeld;
  }
  toast(willGrade ? "Logged — grading your solution…"
    : awaitingCookie ? "Logged — paste a fresh cookie to grade your solution"
    : willGradePlan ? "Logged — grading your plan…" : "Logged");
  if (!willGrade && !willGradePlan && !awaitingCookie) {
    closeAnnotate();
  } else {
    const jobs = [];
    if (willGradePlan) jobs.push(gradePlanAfterSave(attemptId));
    // With no code to grade the rating is the last thing to wait for; the
    // plan grade fills in whether or not the modal is still open.
    if (willGrade) jobs.push(gradeSavedSolution(attemptId));
    else markAnnotateDone();
    await Promise.all(jobs);
  }
  if (!$("#annotate-modal").classList.contains("hidden") && saveBtn.dataset.saved !== "1") {
    saveBtn.disabled = false;
  }
  if (r.similar) {
    setTimeout(() => offerSimilar(r.similar), 400);
  }
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
  setComplexityDisabled("recall-time", false);
  setComplexityDisabled("recall-space", false);
  setComplexityValue("recall-time", "");
  setComplexityValue("recall-space", "");
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
    renderProblemStatement("#recall-statement", ctx, slug);
  } catch (e) {
    renderProblemStatement("#recall-statement", null, slug);
  }
  if (attemptId) {
    await loadRecallAttempt(attemptId);
  }
}

function wireRecallButtons() {
  $("#btn-close-recall").addEventListener("click", () => {
    $("#recall-modal").classList.add("hidden");
    if (resolveSelfGrade) { resolveSelfGrade(null); resolveSelfGrade = null; }
  });
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
  setComplexityValue("recall-time", a.complexity_time);
  setComplexityValue("recall-space", a.complexity_space);
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
  setComplexityDisabled("recall-time", disabled);
  setComplexityDisabled("recall-space", disabled);
}

function renderRecallGrade(g) {
  g = g || {};
  stopRecallGrading();
  const positives = (g.positives || g.key_ideas_hit || []).filter(Boolean);
  const negatives = (g.negatives || g.key_ideas_missed || []).filter(Boolean);
  const analysis = g.analysis || g.feedback || "";
  $("#recall-grade").classList.remove("hidden");
  $("#recall-grade").innerHTML = `
    <div class="grade-score">Recall grade: <b>${g.grade}/3</b>${
      g.optimal ? ` <span class="tag grade-optimal">optimal</span>` : ""}</div>
    ${analysis ? `<p class="grade-analysis">${escapeHtml(analysis)}</p>` : ""}
    ${positives.length ? `<div class="grade-bullets grade-positives"><b>Positives</b><ul>${
      positives.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul></div>` : ""}
    ${negatives.length ? `<div class="grade-bullets grade-negatives"><b>Negatives</b><ul>${
      negatives.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul></div>` : ""}
    ${currentRecall.category ? `<p class="small"><b>Category:</b> ${escapeHtml(currentRecall.category)}</p>` : ""}
    <p class="small">Scheduled next review accordingly.</p>
    ${currentRecall.attempt_id ? recallClarificationHtml() : ""}`;
  wireRecallClarification();
  $("#recall-actions").innerHTML = `<button id="btn-close-recall" class="button is-primary">Done</button>`;
  $("#btn-close-recall").addEventListener("click", () => $("#recall-modal").classList.add("hidden"));
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
    complexity_time: complexityValue("recall-time"),
    complexity_space: complexityValue("recall-space"),
  };
  if (!llmEnabled) {
    // manual self-grade path: ask confidence via pills inline
    const submit = $("#btn-submit-recall");
    if (submit.disabled) return;
    submit.disabled = true;
    body.confidence = await pickSelfGrade();
    submit.disabled = false;
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
  // Submitted is past taking back: the card will move whatever the grade, so the
  // queue behind says so now, and catches up the moment the answer is in.
  const slug = currentRecall.slug;
  markSettling(slug, "grading");
  let r;
  try {
    r = await api("/review/recall", "POST", body);
  } catch (e) {
    clearSettling(slug);
    refreshBehindModal();
    stopRecallGrading();
    setRecallInputsDisabled(false);
    $("#recall-grade").innerHTML = `<p class="missed">${escapeHtml(e.message)}</p>`;
    $("#recall-actions").innerHTML =
      `<button id="btn-close-recall" class="button is-ghost">Cancel</button>
       <button id="btn-submit-recall" class="button is-primary">Try again</button>`;
    wireRecallButtons();
    return;
  }
  clearSettling(slug);
  refreshBehindModal();
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
  }
}

let recallGradeTimer = null;
function showRecallGrading(messages) {
  // lock the inputs, swap the actions for a disabled spinner, and animate a
  // status line that steps through `messages`.
  $("#recall-text").disabled = true;
  setComplexityDisabled("recall-time", true);
  setComplexityDisabled("recall-space", true);
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
    resolveSelfGrade = (value) => { resolveSelfGrade = null; resolve(value); };
    const g = $("#recall-grade");
    g.classList.remove("hidden");
    g.innerHTML = `<label>Self-grade your recall:</label>
      <div class="pill-group" id="recall-selfgrade">
        <button data-c="1">Low</button><button data-c="2">Med</button><button data-c="3">High</button></div>`;
    $$("#recall-selfgrade button").forEach((b) =>
      b.addEventListener("click", () => {
        if (resolveSelfGrade) resolveSelfGrade(Number(b.dataset.c));
      }));
  });
}

// ---- sprint runner -------------------------------------------------------------
async function loadCategories() {
  try {
    const topics = await api("/topics");
    categories = topics.map((t) => t.category);
  } catch (e) {
    categories = [];
  }
  return categories;
}

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
  refreshBehindModal();
  $("#btn-done-sprint").addEventListener("click", closeSprint);
}

$("#btn-close-sprint").addEventListener("click", closeSprint);

// ---- attempt detail (solution archive) -----------------------------------------
function detailGradeHtml(a) {
  if (!a) return "";
  if (a.kind === "recall" || a.source === "recall") {
    return recallDetailGradeHtml(a.recall_grade, a.grading_status, a.grading_error);
  }
  return solutionDetailGradeHtml(
    a.solution_grade, a.solution_grading_status, a.solution_grading_error);
}

function gradeListHtml(title, items, cls) {
  const rows = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!rows.length) return "";
  return `<div class="grade-bullets ${cls}"><b>${title}</b><ul>${
    rows.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul></div>`;
}

function gradeItems(items) {
  return Array.isArray(items) ? items.filter(Boolean) : [];
}

function gradeStatusHtml(status, err) {
  if (status === "failed") {
    return `<div class="recall-grade detail-grade">
      <p class="missed"><b>Grading failed:</b> ${escapeHtml(err || "Unknown error")}</p>
    </div>`;
  }
  return "";
}

function solutionDetailGradeHtml(g, status, err) {
  if (!g || typeof g !== "object") return gradeStatusHtml(status, err);
  const hasScore = g.score != null;
  const hasCx = g.inferred_time || g.inferred_space;
  const positives = gradeItems(g.positives);
  const negatives = gradeItems(g.negatives).length ? gradeItems(g.negatives) : gradeItems(g.improvements);
  if (!hasScore && !g.analysis && !g.feedback && !hasCx && !positives.length && !negatives.length) {
    return gradeStatusHtml(status, err);
  }
  return `<div class="recall-grade detail-grade">
    <div class="grade-score">Solution grade${hasScore ? `: <b>${escapeHtml(g.score)}/5</b>` : ""}${
      g.optimal ? ` <span class="tag grade-optimal">optimal</span>` : ""}</div>
    ${g.analysis || g.feedback ? `<p class="grade-analysis">${escapeHtml(g.analysis || g.feedback)}</p>` : ""}
    ${hasCx ? `<p class="small"><b>Complexity:</b> time ${escapeHtml(g.inferred_time || "?")}, space ${escapeHtml(g.inferred_space || "?")}</p>` : ""}
    ${gradeListHtml("Positives", positives, "grade-positives")}
    ${gradeListHtml("Negatives", negatives, "grade-negatives")}
    ${g.prompt_version != null ? `<p class="small">Prompt v${escapeHtml(g.prompt_version)}</p>` : ""}
  </div>`;
}

function recallDetailGradeHtml(g, status, err) {
  if (!g || typeof g !== "object") return gradeStatusHtml(status, err);
  const hasGrade = g.grade != null;
  const positives = gradeItems(g.positives);
  const negatives = gradeItems(g.negatives);
  if (!hasGrade && !g.analysis && !g.feedback && !positives.length && !negatives.length) {
    return gradeStatusHtml(status, err);
  }
  return `<div class="recall-grade detail-grade">
    <div class="grade-score">Recall grade${hasGrade ? `: <b>${escapeHtml(g.grade)}/3</b>` : ""}${
      g.optimal ? ` <span class="tag grade-optimal">optimal</span>` : ""}</div>
    ${g.analysis || g.feedback ? `<p class="grade-analysis">${escapeHtml(g.analysis || g.feedback)}</p>` : ""}
    ${gradeListHtml("Positives", positives, "grade-positives")}
    ${gradeListHtml("Negatives", negatives, "grade-negatives")}
  </div>`;
}

function planDetailHtml(a) {
  const plan = a.plan;
  const summary = planSummaryHtml(plan);
  if (!summary) return "";
  const meta = plan.plan_time_sec != null && plan.status === "planned" ? ` <span class="small">planned in ${fmtClock(plan.plan_time_sec)}</span>` : "";
  const held = plan.held ? `<p class="small">Plan <b>${escapeHtml(plan.held)}</b></p>` : "";
  return `<section class="detail-plan plan-card">
    <h3>Your plan${meta}</h3>
    ${summary}
    ${held}
    ${plan.grading_error ? `<p class="missed small">Plan grading failed: ${escapeHtml(plan.grading_error)}</p>` : planGradeHtml(plan)}
  </section>`;
}

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
        <span><b>Sprint rep</b></span>
        ${a.round_id ? `<span>Round <b>${escapeHtml(a.round_id)}</b></span>` : ""}
        ${a.predicted_category ? `<span>Prediction <b>${escapeHtml(a.predicted_category)}</b></span>` : ""}
      </div>
      ${a.neetcode_category ? `<p><b>Prompt category:</b> ${escapeHtml(a.neetcode_category)}</p>` : ""}
      ${a.predicted_category ? `<p><b>Your prediction:</b> ${escapeHtml(a.predicted_category)}</p>` : ""}
      ${a.approach || a.predicted_approach ? `<p><b>Why:</b> ${escapeHtml(a.approach || a.predicted_approach)}</p>` : ""}
      <p><b>Verdict:</b> <span class="pred-${escapeHtml(verdict)}">${escapeHtml(verdict)}</span></p>
      ${e.prediction_note ? `<p><b>Note:</b> ${escapeHtml(e.prediction_note)}</p>` : ""}
      ${planDetailHtml(a)}`;
    $("#detail-body").innerHTML = body;
    $("#detail-modal").classList.remove("hidden");
    return;
  }
  const tags = (e.user_overrides && e.user_overrides.tags) || e.mistake_tags || [];
  const body = `
    <h2>${escapeHtml(a.title || a.slug)} ${a.difficulty ? badge(a.difficulty) : ""}</h2>
    <div class="detail-meta small">${escapeHtml(a.neetcode_category || "")} · ${a.solved_at ? new Date(a.solved_at * 1000).toLocaleString() : ""}</div>
    <div class="facts">
      ${a.time_taken_sec != null ? `<span>Time <b>${fmtTime(a.time_taken_sec)}</b></span>` : ""}
      ${a.resubmissions ? `<span>Accepted subs <b>${a.resubmissions + 1}</b></span>` : ""}
      ${a.first_ac_time_taken_sec != null ? `<span>First AC <b>${fmtTime(a.first_ac_time_taken_sec)}</b></span>` : ""}
      ${a.confidence ? `<span>Conf <b>${["", "Low", "Med", "High"][a.confidence]}</b></span>` : ""}
      ${a.independence ? `<span><b>${a.independence}</b></span>` : ""}
      ${a.complexity_time ? `<span>Time <b>${escapeHtml(a.complexity_time)}</b></span>` : ""}
    </div>
    ${a.approach ? `<p><b>Your approach:</b> ${escapeHtml(a.approach)}</p>` : ""}
    ${a.mistake_note ? `<p><b>Note:</b> ${escapeHtml(a.mistake_note)}</p>` : ""}
    ${e.pattern_used ? `<p><b>Pattern used:</b> ${escapeHtml(e.pattern_used)} ${e.complexity_verdict && e.complexity_verdict !== "match" ? `<span class="warn-chip">${escapeHtml(e.complexity_verdict.replace("_", " "))}</span>` : ""}</p>` : ""}
    ${tags.length ? `<p><b>Mistakes:</b> ${tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join(" ")}</p>` : ""}
    ${e.diff_summary ? `<p><b>Since last time:</b> ${escapeHtml(e.diff_summary)}</p>` : ""}
    ${planDetailHtml(a)}
    ${detailGradeHtml(a)}
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
  // Today's mock card already reads "in progress" behind the runner.
  refreshBehindModal();
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
  // Not awaited: this one leaves the building for leetcode.com, and nothing on
  // the page is waiting on the answer. The pill appears if and when it lands.
  checkLeetCodeAuth();
  await Promise.all([
    loadAppMeta(),
    loadOverview(),
    refreshActive(),
    detectSolves({ force: true }),
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
  // Under Access the edge owns the session, so signing out is a link to
  // Cloudflare's logout endpoint rather than a Firebase call — the SDK is not
  // even on the page in that mode.
  const identity = ACCESS ? "Cloudflare Access" : (userEmail || "local mode");
  const signout = ACCESS
    ? '<a class="button is-ghost is-small" href="/cdn-cgi/access/logout">Sign out</a>'
    : userEmail
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
  currentActiveTab, goTab, api, runSweep, checkLeetCodeAuth,
  get llmEnabled() { return llmEnabled; } };

// ---- boot ----------------------------------------------------------------------
// Deferred to DOMContentLoaded so views.js (loaded after this file) has defined
// window.Views before the first render.
function boot() {
  if (LOCAL || ACCESS) {
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
