// Section navigation is independent of LeetCode's tabs and active coding run.
// Sections: LeetCode (the classic tabs), System Design, and the learning tracks drawn by tracks.js.
(function () {
  'use strict';
  const { $ } = window.H;
  const trigger = $('#section-trigger'), menu = $('#section-menu');
  const views = ['home', 'cases', 'skills', 'lessons', 'progress', 'workspace', 'curriculum', 'quickfire', 'papers', 'mistakes', 'drills'];
  const NAMES = {leetcode: ['Leetcode Senpai', 'Interview prep'], 'system-design': ['System Design', 'Learn and practise'],
    fundamentals: ['Fundamentals', 'Role stack knowledge'], ai: ['AI Engineering', 'LLMs, RAG, evals and agents'],
    experience: ['Experience', 'Your stories, under questioning'], practical: ['Practical Coding', 'Build, debug and review']};
  const TRACKS = ['fundamentals', 'ai', 'experience', 'practical'];
  let current = 'leetcode', lastLeetcodeTab = 'today';
  const design = () => current === 'system-design';
  function close(focus = false) {
    menu.classList.add('hidden'); trigger.setAttribute('aria-expanded', 'false');
    if (focus) trigger.focus();
  }
  function shell(section) {
    if (section !== 'leetcode' && current === 'leetcode') lastLeetcodeTab = currentActiveTab();
    if (current === 'system-design' && section !== 'system-design') window.SystemDesign.onTab('today');
    current = section;
    const track = TRACKS.includes(section);
    document.body.classList.toggle('section-design', section === 'system-design');
    document.body.classList.toggle('section-track', track);
    $('#tabs').classList.toggle('hidden', section !== 'leetcode');
    $('#design-nav').classList.toggle('hidden', section !== 'system-design');
    $('#track-nav')?.classList.toggle('hidden', !track);
    const [name, sub] = NAMES[section] || NAMES.leetcode;
    trigger.querySelector('.brand-name').textContent = name;
    trigger.querySelector('.brand-sub').textContent = sub;
    trigger.setAttribute('aria-label', 'Switch learning section. Current: ' + (section === 'leetcode' ? 'LeetCode' : name));
    menu.querySelectorAll('[data-section]').forEach(n => {
      const selected = n.dataset.section === section;
      n.classList.toggle('is-selected', selected);
      n.setAttribute('aria-pressed', String(selected));
    });
    setDashboardLocked(!!activeSession);
    document.title = section === 'leetcode' ? 'Leetcode Senpai' : name + ' · Senpai';
  }
  function setView(view) {
    $('#design-nav').querySelectorAll('[data-design-view]').forEach(n => {
      const selected = n.dataset.designView === ({setup:'cases',workspace:'cases',exercise:'skills',lesson:'lessons'}[view] || view);
      n.classList.toggle('is-active', selected);
      if (selected) n.setAttribute('aria-current', 'page'); else n.removeAttribute('aria-current');
    });
    const titles = {home:'Overview', curriculum:'Curriculum', quickfire:'Quickfire', papers:'Past papers', mistakes:'Mistakes book', drills:'Estimation drills', lesson:'Lesson', cases:'Design cases', skills:'Skill drills', lessons:'Lessons', progress:'Your progress', workspace:'Design workspace', exercise:'Skill drill', setup:'Case brief'};
    $('#page-title').textContent = titles[view] || 'System Design';
    $('#page-sub').textContent = 'System Design';
  }
  function openTrack(section, view, update) {
    const entering = current !== section;
    shell(section);
    document.querySelectorAll('.tab').forEach(n => n.classList.add('hidden'));
    $('#tab-track')?.classList.remove('hidden');
    if (update) history.pushState(null, '', '#/' + section + (view === 'home' ? '' : '/' + view));
    window.Tracks?.open(section, view, entering);
  }
  function select(section, view = 'home', update = true) {
    close(true);
    if (section === 'system-design' && design() && window.SystemDesign.isBusy?.()) return;
    if (TRACKS.includes(section)) return openTrack(section, view, update);
    if (section !== 'system-design') {
      shell('leetcode');
      if (update) history.pushState(null, '', '#/leetcode');
      goTab(lastLeetcodeTab); return;
    }
    const entering = !design();
    shell('system-design');
    document.querySelectorAll('.tab').forEach(n => n.classList.add('hidden'));
    $('#tab-design').classList.remove('hidden');
    window.SystemDesign.onTab('design');
    setView(view);
    if (update) history.pushState(null, '', '#/system-design' + (view === 'home' ? '' : '/' + view));
    if (entering) window.SystemDesign.openView(view, true);
    else window.SystemDesign.openView(view);
  }
  function route() {
    const match = location.hash.match(/^#\/system-design(?:\/([^/]+)(?:\/([a-z0-9-]+))?)?$/);
    const track = location.hash.match(/^#\/([a-z-]+)(?:\/([a-z0-9/_-]+))?$/);
    if (match) select('system-design', (match[1]==='lesson'||match[1]==='redesign')&&match[2] ? match[1]+'/'+match[2] : views.includes(match[1]) ? match[1] : 'home', false);
    else if (track && TRACKS.includes(track[1])) select(track[1], track[2] || 'home', false);
    else if (current !== 'leetcode') select('leetcode', 'home', false);
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
  const leave = () => { if (current !== 'leetcode') { shell('leetcode'); history.replaceState(null, '', '#/leetcode'); } };
  window.AppSections = {select, setView, current: () => current, TRACKS, leaveDesign: leave, leaveSection: leave};
  shell('leetcode'); route();
})();
