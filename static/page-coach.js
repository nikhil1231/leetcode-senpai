// A bounded, fresh page snapshot accompanies each message; chat stays in memory.
(function () {
  'use strict';
  const { $, api, escapeHtml: esc } = window.H;
  const panel = $('#page-coach'), input = $('#page-coach-input');
  let turns = [], pending = false, generation = 0;
  const isEditor = () => document.body.classList.contains('has-editor-run')
    && !document.body.classList.contains('run-minimised')
    && !document.body.classList.contains('section-design');
  const visible = node => node.getClientRects().length > 0;
  const clip = (text, max) => text.length > max ? text.slice(0, max) + '\n[truncated]' : text;
  const pageName = () => ($('#page-title').textContent || 'Current page').slice(0, 160);

  function snapshot() {
    const section = document.body.classList.contains('section-design') ? 'system-design' : 'leetcode';
    // Settings and credential dialogs are deliberately excluded, including values.
    const roots = [...document.querySelectorAll('.overlay:not(.hidden)')]
      .filter(n => !['cookie-modal', 'signin-gate'].includes(n.id) && visible(n));
    const tab = document.querySelector('main > .tab:not(.hidden)');
    if (tab && tab.id !== 'tab-settings' && visible(tab)) roots.push(tab);
    const parts = [];
    for (const root of roots) {
      const fields = [...root.querySelectorAll('input, textarea, select')]
        .filter(n => visible(n) && !/password|hidden|file/.test(n.type)
          && !/cookie|token|secret|api.?key|password/i.test(n.id + ' ' + n.name)
          && !n.closest('.coach-chat, .sd-chat'))
        .slice(0, 16).map(n => ({
          field: n.getAttribute('aria-label') || n.labels?.[0]?.innerText || n.id || n.name,
          value: clip(n.value || '', 1200),
          ...(/checkbox|radio/.test(n.type) ? { selected: n.checked } : {}),
        }));
      const answers = [...root.querySelectorAll('.is-wrong, .light-option.is-correct, .sd-choice-picked, .sd-choice-correct, .sd-choice-wrong')]
        .filter(visible).slice(0, 10).map(n => ({
          answer: clip(n.innerText || '', 1200),
          state: n.matches('.is-wrong, .sd-choice-wrong') ? 'incorrect selection'
            : n.matches('.is-correct, .sd-choice-correct') ? 'correct answer' : 'selected answer',
        }));
      // Put draft/selection state before prose so long lessons cannot crowd it out.
      parts.push(clip(JSON.stringify({ fields, answers }), 3500));
      parts.push(clip(root.innerText || '', 8000));
    }
    return { page: pageName(), section, context: clip(parts.join('\n\n'), 11980) };
  }

  function draw() {
    const messages = $('#page-coach-messages');
    messages.innerHTML = turns.map(m => `<div class="${m.role === 'me' ? 'chat-msg is-me' : 'hint-card'}"><p>${esc(m.text).replace(/`([^`]+)`/g, '<code>$1</code>')}</p></div>`).join('')
      || '<p class="page-coach-empty">Ask about the question, your answer, or the feedback on this page. The coach receives a short page snapshot with each message.</p>';
    if (pending) messages.insertAdjacentHTML('beforeend', '<div class="hint-card chat-typing" aria-label="Coach is typing"><span></span><span></span><span></span></div>');
    messages.scrollTop = messages.scrollHeight;
    $('#page-coach-send').disabled = pending;
    $('#page-coach-clear').disabled = pending;
    input.disabled = pending;
  }

  function close(focus = true) {
    panel.classList.add('hidden');
    document.body.classList.remove('page-coach-open');
    $('#btn-page-coach').setAttribute('aria-expanded', 'false');
    if (focus) $('#btn-page-coach').focus();
  }
  function open() {
    if (isEditor()) return;
    if (!panel.classList.contains('hidden')) { close(); return; }
    panel.classList.remove('hidden');
    document.body.classList.add('page-coach-open');
    $('#btn-page-coach').setAttribute('aria-expanded', 'true');
    $('#page-coach-model').textContent = llmModel || 'AI';
    $('#page-coach-context').textContent = 'Current page: ' + pageName();
    $('#page-coach-error').textContent = llmEnabled ? '' : 'AI coaching is unavailable. Check the coach configuration in Settings.';
    draw(); input.focus();
  }

  async function send(event) {
    event.preventDefault();
    const message = input.value.trim();
    if (!message || pending || isEditor()) return;
    const state = snapshot(), requestGeneration = generation;
    const history = turns.slice(-8).map(m => ({ ...m, text: m.text.slice(0, 2000) }));
    turns.push({ role: 'me', text: message, page: state.page });
    input.value = ''; pending = true;
    $('#page-coach-error').textContent = '';
    $('#page-coach-context').textContent = 'Current page: ' + state.page;
    draw();
    try {
      const result = await api('/coach/page-chat', 'POST', { message, ...state, history });
      if (generation !== requestGeneration) return;
      turns.push({ role: 'coach', text: result.reply, page: state.page });
      $('#page-coach-model').textContent = result.model;
    } catch (error) {
      if (generation !== requestGeneration) return;
      turns.pop(); input.value = message;
      $('#page-coach-error').textContent = error.message;
    } finally {
      pending = false; draw();
      if (!panel.classList.contains('hidden')) input.focus();
    }
  }

  $('#btn-page-coach').addEventListener('click', open);
  $('#page-coach-close').addEventListener('click', () => close());
  $('#page-coach-clear').addEventListener('click', () => { if (!pending) { turns = []; $('#page-coach-error').textContent = ''; draw(); input.focus(); } });
  $('#page-coach-form').addEventListener('submit', send);
  // Quickfire shortcuts must never interpret typing in the coach as answers.
  document.addEventListener('keydown', event => {
    if (panel.classList.contains('hidden')) return;
    if (event.key === 'Escape' && !document.querySelector('.overlay:not(.hidden)')) {
      event.preventDefault(); event.stopImmediatePropagation(); close();
    } else if (panel.contains(event.target)) {
      event.stopImmediatePropagation();
      if (event.target === input && event.key === 'Enter' && !event.shiftKey && !event.isComposing) send(event);
    }
  }, true);
  const observer = new MutationObserver(() => {
    const signedOut = $('#app').classList.contains('hidden');
    if ((isEditor() || signedOut) && !panel.classList.contains('hidden')) close(false);
    if (signedOut) { generation++; turns = []; input.value = ''; }
    if (!panel.classList.contains('hidden')) $('#page-coach-context').textContent = 'Current page: ' + pageName();
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  observer.observe($('#app'), { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(() => {
    $('#page-coach-context').textContent = 'Current page: ' + pageName();
  }).observe($('#page-title'), { childList: true, characterData: true, subtree: true });
  window.PageCoach = { snapshot };
})();
