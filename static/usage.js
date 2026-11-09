// Friction metrics, kept in this browser only (localStorage): how long from opening the app to the first thing
// you actually do, which pages get visited, and which never do. Nothing leaves the device; Settings shows it.
(function () {
  'use strict';
  const KEY = 'senpai-usage-v1', MAX_SESSIONS = 60;
  const NOW = () => Date.now();
  let data = { visits: {}, sessions: [] };
  try { const raw = JSON.parse(localStorage.getItem(KEY) || 'null'); if (raw && raw.visits && raw.sessions) data = raw; } catch (e) { /* private window: stay in memory */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignore */ } };

  let lastGesture = 0;
  ['click', 'keydown', 'touchend'].forEach((t) => document.addEventListener(t, () => { lastGesture = NOW(); }, true));
  const session = { at: NOW(), firstActionSec: null, pages: 0 };
  data.sessions.push(session);
  if (data.sessions.length > MAX_SESSIONS) data.sessions.splice(0, data.sessions.length - MAX_SESSIONS);
  save();

  // A "first action" is the first request that writes something (an answer, an attempt, a lesson read).
  const realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    if (session.firstActionSec === null && method !== 'GET' && method !== 'HEAD' && NOW() - lastGesture < 4000) {
      const url = String(typeof input === 'string' ? input : (input && input.url) || '');
      if (url.includes('/api/') && !/\/(log|events?|telemetry|heartbeat|warm)\b/.test(url)) {
        session.firstActionSec = Math.round((NOW() - session.at) / 1000);
        save();
      }
    }
    return realFetch(input, init);
  };

  // Page visits: the section plus the page title, counted when either changes and then holds for a moment.
  let timer = null, lastKey = '';
  const SECTIONS = /^#\/(system-design|fundamentals|ai|experience|practical)(?:\/([a-z-]+))?/;
  function routeKey() {
    const m = location.hash.match(SECTIONS);
    if (m) {
      let v = m[2] || 'home';
      if (m[1] === 'system-design' && (v === 'lessons' || v === 'lesson')) v = 'curriculum';
      if (m[1] !== 'system-design' && v === 'lesson') v = 'lessons';
      return `${m[1]}/${v}`;
    }
    const tab = document.querySelector('#tabs li.is-active');
    return tab ? 'leetcode/' + tab.dataset.tab : '';
  }
  function visit() {
    const key = routeKey();
    if (!key || key === lastKey) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (routeKey() !== key) return;
      lastKey = key;
      const v = data.visits[key] || (data.visits[key] = { n: 0, last: 0 });
      v.n += 1; v.last = NOW(); session.pages += 1;
      save();
    }, 1500);
  }
  const hook = () => { const t = document.getElementById('page-title'); if (t) new MutationObserver(visit).observe(t, { childList: true, characterData: true, subtree: true }); window.addEventListener('hashchange', visit); document.getElementById('tabs')?.addEventListener('click', () => setTimeout(visit, 50)); visit(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook); else hook();

  const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
  const fmt = (sec) => sec == null ? '—' : sec < 90 ? sec + ' s' : Math.round(sec / 60) + ' min';

  function summary() {
    const acted = data.sessions.filter((s) => s.firstActionSec !== null).slice(-14).map((s) => s.firstActionSec);
    const sessions = data.sessions.slice(-14);
    const pages = Object.entries(data.visits).sort((a, b) => b[1].n - a[1].n);
    return { sessions: data.sessions.length, medianFirstAction: median(acted), actedShare: sessions.length ? acted.length / sessions.length : 0,
      pagesPerSession: sessions.length ? sessions.reduce((n, s) => n + s.pages, 0) / sessions.length : 0, pages };
  }

  function settingsHtml() {
    const esc = window.H.escapeHtml, s = summary();
    const pages = window.Palette && window.Palette.pages ? window.Palette.pages() : [];
    const name = Object.fromEntries(pages.map((p) => [p.key, p.label]));
    const top = s.pages.slice(0, 8).map(([k, v]) => `<li><span>${esc(name[k] || k)}</span><b>${v.n}</b></li>`).join('');
    const never = pages.filter((p) => !data.visits[p.key]).map((p) => p.label);
    return `<div class="section-title" id="usage-settings">Usage</div>
      <p class="help">Kept in this browser only, so a phone and a laptop each have their own. It shows how much friction the daily loop has and which pages never get opened.</p>
      <dl class="plan-stats usage-stats"><div><dt>Open → first action</dt><dd>${fmt(s.medianFirstAction)}</dd></div>
        <div><dt>Sessions with an action</dt><dd>${Math.round(s.actedShare * 100)}%</dd></div>
        <div><dt>Pages per session</dt><dd>${s.pagesPerSession.toFixed(1)}</dd></div>
        <div><dt>Sessions recorded</dt><dd>${s.sessions}</dd></div></dl>
      ${top ? `<p class="small"><b>Most visited</b></p><ul class="usage-list">${top}</ul>` : ''}
      ${never.length ? `<p class="small"><b>Never opened here</b> · ${never.length} of ${pages.length}</p><p class="help">${never.map(esc).join(' · ')}</p>` : ''}
      <div class="buttons"><button class="button is-ghost is-small" type="button" id="btn-usage-reset">Reset usage data</button></div>`;
  }
  function bindSettings(root) {
    root.querySelector('#btn-usage-reset')?.addEventListener('click', () => {
      data = { visits: {}, sessions: [session] }; lastKey = ''; save(); window.H.toast?.('Usage data cleared');
    });
  }

  window.Usage = { summary, settingsHtml, bindSettings };
})();
