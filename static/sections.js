// Section navigation is independent of LeetCode's tabs and active coding run.
(function () {
  'use strict';
  const { $ } = window.H;
  const trigger = $('#section-trigger'), menu = $('#section-menu');
  const views = ['home', 'cases', 'skills', 'lessons', 'progress', 'workspace'];
  let design = false, lastLeetcodeTab = 'today';
  function close(focus = false) {
    menu.classList.add('hidden'); trigger.setAttribute('aria-expanded', 'false');
    if (focus) trigger.focus();
  }
  function shell(on) {
    if(on && !design) lastLeetcodeTab=currentActiveTab();
    design = on;
    document.body.classList.toggle('section-design', on);
    $('#tabs').classList.toggle('hidden', on);
    $('#design-nav').classList.toggle('hidden', !on);
    trigger.querySelector('.brand-name').textContent = on ? 'System Design' : 'Leetcode Senpai';
    trigger.querySelector('.brand-sub').textContent = on ? 'Interview workspace' : 'Interview prep';
    trigger.setAttribute('aria-label', 'Switch learning section. Current: ' + (on?'System Design':'LeetCode'));
    menu.querySelectorAll('[data-section]').forEach(n => {
      const selected = (n.dataset.section === 'system-design') === on;
      n.classList.toggle('is-selected', selected);
      n.setAttribute('aria-pressed', String(selected));
    });
    setDashboardLocked(!!activeSession);
    document.title = on ? 'System Design · Senpai' : 'Leetcode Senpai';
  }
  function setView(view) {
    $('#design-nav').querySelectorAll('[data-design-view]').forEach(n => {
      const selected = n.dataset.designView === ({setup:'cases',workspace:'cases',exercise:'skills'}[view] || view);
      n.classList.toggle('is-active', selected);
      if (selected) n.setAttribute('aria-current', 'page'); else n.removeAttribute('aria-current');
    });
    const titles = {home:'Overview', cases:'Design cases', skills:'Skill drills', lessons:'Lessons', progress:'Your progress', workspace:'Design workspace', exercise:'Skill drill', setup:'Case brief'};
    $('#page-title').textContent = titles[view] || 'System Design';
    $('#page-sub').textContent = 'System Design';
  }
  function select(section, view = 'home', update = true) {
    close(true);
    if(section==='system-design' && design && window.SystemDesign.isBusy?.())return;
    if (section !== 'system-design') {
      shell(false); window.SystemDesign.onTab('today');
      if (update) history.pushState(null, '', '#/leetcode');
      goTab(lastLeetcodeTab); return;
    }
    const entering = !design;
    shell(true);
    document.querySelectorAll('.tab').forEach(n => n.classList.add('hidden'));
    $('#tab-design').classList.remove('hidden');
    window.SystemDesign.onTab('design');
    setView(view);
    if (update) history.pushState(null, '', '#/system-design' + (view === 'home' ? '' : '/' + view));
    if (entering) window.SystemDesign.openView(view, true);
    else window.SystemDesign.openView(view);
  }
  function route() {
    const match = location.hash.match(/^#\/system-design(?:\/([^/]+))?$/);
    if (match) select('system-design', views.includes(match[1]) ? match[1] : 'home', false);
    else if (design) select('leetcode', 'home', false);
  }
  trigger.addEventListener('click', () => {
    const opening = menu.classList.contains('hidden');
    menu.classList.toggle('hidden', !opening);
    trigger.setAttribute('aria-expanded', String(opening));
    if (opening) menu.querySelector('.is-selected').focus();
  });
  menu.querySelectorAll('[data-section]').forEach(n => n.addEventListener('click', () => select(n.dataset.section)));
  $('#design-nav').querySelectorAll('[data-design-view]').forEach(n => n.addEventListener('click', () => select('system-design', n.dataset.designView)));
  document.addEventListener('click', e => { if (!e.target.closest('.section-switcher')) close(); });
  document.addEventListener('keydown', e => {
    if (menu.classList.contains('hidden')) return;
    if (e.key === 'Escape') { e.preventDefault(); close(true); }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      const choices = [...menu.querySelectorAll('[data-section]')];
      const index = choices.indexOf(document.activeElement);
      choices[e.key === 'Home' ? 0 : e.key === 'End' ? choices.length-1 : (index + (e.key === 'ArrowUp' ? -1 : 1) + choices.length) % choices.length].focus();
    }
  });
  window.addEventListener('popstate', route);
  window.addEventListener('hashchange', route);
  window.AppSections = {select, setView, leaveDesign() { if (design) { shell(false); history.replaceState(null, '', '#/leetcode'); } }};
  shell(false); route();
})();
