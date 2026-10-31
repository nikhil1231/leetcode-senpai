// Study prompt: copy a topic and what you hold of it, to paste into a voice chatbot's live chat.
// One button in the top bar for the page's own topic (hidden where a page has none), and
// StudyPrompt.button(scope) for categories and lessons in lists. The text comes from
// /api/study-prompt; no model writes it. The import button takes the bot's debrief back:
// a preview of what it would record, then one click to save it.
(function () {
  'use strict';
  const { $, api, escapeHtml: esc, toast } = window.H;
  const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12Z"/><path d="M9 10.5v3M12 9v6M15 10.5v3"/></svg>';
  const KB = ['system-design', 'fundamentals', 'ai'];

  function button(scope, name) {
    const label = `Copy a voice-chat study prompt${name ? ' for ' + name : ''}`;
    return `<button type="button" class="study-copy" data-study="${esc(JSON.stringify(scope))}" aria-label="${esc(label)}" title="${esc(label)}">${ICON}</button>`;
  }

  // The page's own topic, from where you are: a lesson, a course section, or the LeetCode map.
  function pageScope() {
    const app = $('#app');
    if (!app || app.classList.contains('hidden') || document.body.classList.contains('has-active-session')) return null;
    const m = location.hash.match(/^#\/([a-z-]+)(?:\/([a-z]+)(?:\/([a-z0-9-]+))?)?/);
    const body = document.body.classList;
    if ((body.contains('section-design') || body.contains('section-track')) && m && KB.includes(m[1])) {
      return m[2] === 'lesson' && m[3] ? { section: m[1], lesson: m[3] } : { section: m[1] };
    }
    if (body.contains('section-design') || body.contains('section-track')) return null;
    const tab = document.querySelector('main > .tab:not(.hidden)');
    return tab && ['tab-topics', 'tab-insights'].includes(tab.id) ? { section: 'leetcode' } : null;
  }

  function sync() {
    const none = !pageScope();
    document.querySelectorAll('.study-top').forEach(b => b.classList.toggle('hidden', none));
  }

  async function copy(scope, node) {
    let session = null;
    const text = api('/study-prompt', 'POST', scope).then(r => { session = r.session; return r.prompt; });
    node?.classList.add('is-busy');
    try {
      try {
        // Safari keeps the click's permission only if the write starts now, with the text to follow.
        if (!window.ClipboardItem || !navigator.clipboard?.write) throw new Error('no ClipboardItem');
        await navigator.clipboard.write([new ClipboardItem({ 'text/plain': text.then(t => new Blob([t], { type: 'text/plain' })) })]);
      } catch (e) {
        const t = await text;
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(t);
        else {
          const area = Object.assign(document.createElement('textarea'), { value: t, readOnly: true });
          document.body.appendChild(area); area.select();
          const ok = document.execCommand('copy'); area.remove();
          if (!ok) throw new Error('Copy failed');
        }
      }
      toast(session ? 'Study prompt copied. Paste it into your chatbot and start a live chat. Afterwards, type "debrief" and bring the reply back with the import button.'
        : 'Study prompt copied. Paste it into your chatbot, then start a live chat.');
    } catch (e) {
      const err = await text.then(() => e, x => x);
      if (err.message !== 'auth') toast(err.status === 404 ? 'Nothing to study here yet.' : 'Could not copy the study prompt: ' + err.message);
    } finally {
      node?.classList.remove('is-busy');
    }
  }

  // ---- importing a debrief ----
  const MARK = { right: '✓', partial: '~', wrong: '✗' };
  let preview = null;
  function dialog() {
    let el = $('#study-import');
    if (el) return el;
    document.body.insertAdjacentHTML('beforeend', `<div id="study-import" class="overlay hidden">
      <div class="overlay-card study-import-card" role="dialog" aria-modal="true" aria-labelledby="study-import-title">
        <div class="modal-titlebar"><div><h2 class="modal-title" id="study-import-title">Import a study session</h2>
          <p class="small">After the voice chat, type "debrief" to the chatbot and paste its whole reply here.</p></div>
          <button class="button is-ghost is-small icon-button" type="button" data-si="close" aria-label="Close" title="Close">&times;</button></div>
        <textarea id="study-import-text" class="input textarea" spellcheck="false" placeholder="SENPAI-DEBRIEF session=…"></textarea>
        <p id="study-import-error" class="quickstart-error hidden"></p>
        <div id="study-import-preview" class="study-preview"></div>
        <div class="overlay-actions"><button class="button is-ghost" type="button" data-si="close">Cancel</button>
          <button id="study-import-save" class="button is-primary" type="button" data-si="save" disabled>Save to my progress</button></div>
      </div></div>`);
    el = $('#study-import');
    el.addEventListener('click', e => {
      const a = e.target.closest('[data-si]')?.dataset.si;
      if (e.target === el || a === 'close') closeImport();
      else if (a === 'save') save();
    });
    el.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); closeImport(); } });
    let timer = null;
    $('#study-import-text').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(check, 350); });
    return el;
  }
  function openImport() {
    const el = dialog();
    preview = null; $('#study-import-text').value = '';
    showError(''); $('#study-import-preview').innerHTML = ''; $('#study-import-save').disabled = true;
    el.classList.remove('hidden'); $('#study-import-text').focus();
  }
  function closeImport() { $('#study-import')?.classList.add('hidden'); $('#btn-study-import')?.focus(); }
  function showError(msg) { const n = $('#study-import-error'); n.textContent = msg; n.classList.toggle('hidden', !msg); }

  function render(p) {
    const c = p.counts, done = p.imported_at && !p.applied;
    const head = done ? `This session was already imported on ${new Date(p.imported_at * 1000).toLocaleString()}. Nothing new to save.`
      : `${c.right} right, ${c.partial} partial, ${c.wrong} wrong${p.resolves ? ` · closes ${p.resolves} old mistake${p.resolves === 1 ? '' : 's'}` : ''}. Right answers count as held but unconfirmed until a Quickfire check; misses count in full.`;
    const rows = p.changes.map(ch => `<div class="study-change"><span class="study-mark is-${ch.verdict}" aria-label="${ch.verdict}">${MARK[ch.verdict]}</span>
      <div><b>${esc(ch.ref)}</b> ${esc(ch.claim)}<span class="small">${esc(ch.lesson_title)} · ${esc(ch.depth)}${ch.note ? ' · “' + esc(ch.note) + '”' : ''}${
        ch.opens ? (ch.opens.kind === 'gap' ? ' · opens a gap' : ' · opens a misconception') : ch.resolves ? ' · closes an old mistake' : ''}</span></div></div>`).join('');
    const notes = p.notes.length ? `<p class="small">Notes kept: ${p.notes.map(esc).join(' · ')}</p>` : '';
    const skipped = p.skipped.length ? `<p class="small">Skipped ${p.skipped.length} line${p.skipped.length === 1 ? '' : 's'} it could not read: ${p.skipped.slice(0, 4).map(x => esc(x)).join(' · ')}</p>` : '';
    $('#study-import-preview').innerHTML = `<p class="study-preview-head">${head}</p>${rows}${notes}${skipped}`;
    $('#study-import-save').disabled = !!done || !p.changes.length;
  }
  async function check() {
    const text = $('#study-import-text').value.trim();
    preview = null; $('#study-import-save').disabled = true;
    if (!text) { showError(''); $('#study-import-preview').innerHTML = ''; return; }
    try {
      const p = await api('/study-prompt/debrief', 'POST', { text });
      if ($('#study-import-text').value.trim() !== text) return;
      preview = p; showError(''); render(p);
      if (!p.changes.length && !p.imported_at) showError('No graded P-lines found under the SENPAI-DEBRIEF line.');
    } catch (e) {
      if (e.message !== 'auth') { showError(e.message); $('#study-import-preview').innerHTML = ''; }
    }
  }
  async function save() {
    if (!preview) return;
    const btn = $('#study-import-save'); btn.disabled = true;
    try {
      const p = await api('/study-prompt/debrief', 'POST', { text: $('#study-import-text').value.trim(), apply: true });
      if (!p.applied) { render(p); return; }
      closeImport();
      toast(`Saved: ${p.counts.right} right, ${p.counts.partial} partial, ${p.counts.wrong} wrong.`);
      window.dispatchEvent(new CustomEvent('study-imported', { detail: p }));
    } catch (e) {
      if (e.message !== 'auth') showError(e.message);
      btn.disabled = false;
    }
  }

  // Capture, so a button inside a <summary> or a clickable card copies without toggling or opening it.
  document.addEventListener('click', e => {
    if (e.target.closest?.('#btn-study-import')) { e.preventDefault(); openImport(); return; }
    const node = e.target.closest?.('.study-copy[data-study], #btn-study-prompt');
    if (!node) return;
    e.preventDefault(); e.stopPropagation();
    const scope = node.id === 'btn-study-prompt' ? pageScope() : JSON.parse(node.dataset.study);
    if (scope) copy(scope, node);
  }, true);
  document.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest?.('.study-copy[data-study]')) e.stopPropagation();
  }, true);

  const watch = new MutationObserver(sync);
  document.querySelectorAll('main > .tab').forEach(n => watch.observe(n, { attributes: true, attributeFilter: ['class'] }));
  watch.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  if ($('#app')) watch.observe($('#app'), { attributes: true, attributeFilter: ['class'] });
  if ($('#page-title')) watch.observe($('#page-title'), { childList: true, characterData: true, subtree: true });
  window.addEventListener('popstate', sync);
  window.addEventListener('hashchange', sync);
  sync();
  window.StudyPrompt = { button, pageScope, copy, openImport };
})();
