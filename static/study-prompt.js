// Study prompt: copy a topic and what you hold of it, to paste into a voice chatbot's live chat.
// One button in the top bar for the page's own topic (hidden where a page has none), and
// StudyPrompt.button(scope) for categories and lessons in lists. The text comes from
// /api/study-prompt; no model writes it.
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
    const b = $('#btn-study-prompt');
    if (b) b.classList.toggle('hidden', !pageScope());
  }

  async function copy(scope, node) {
    const qs = new URLSearchParams(Object.entries(scope).filter(([, v]) => v)).toString();
    const text = api('/study-prompt?' + qs).then(r => r.prompt);
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
      toast('Study prompt copied. Paste it into your chatbot, then start a live chat.');
    } catch (e) {
      const err = await text.then(() => e, x => x);
      if (err.message !== 'auth') toast(err.status === 404 ? 'Nothing to study here yet.' : 'Could not copy the study prompt: ' + err.message);
    } finally {
      node?.classList.remove('is-busy');
    }
  }

  // Capture, so a button inside a <summary> or a clickable card copies without toggling or opening it.
  document.addEventListener('click', e => {
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
  window.StudyPrompt = { button, pageScope, copy };
})();
