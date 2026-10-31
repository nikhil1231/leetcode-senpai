// Adds a "For what you're learning" row to the top of the YouTube home page, from the background's
// shelf. YouTube is a single-page app that rebuilds its feed, so the row is re-added when missing.
(() => {
  const ID = 'senpai-shelf';
  let shelf = null, asked = false;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const home = () => location.pathname === '/';

  function html(d) {
    if (d.error === 'signed-out' && !d.videos.length) {
      return `<div class="senpai-head"><b>For what you're learning</b><span>Sign in to <a href="${esc(d.base)}" target="_blank">Senpai</a> once, then reload.</span></div>`;
    }
    if (!d.videos.length) return '';
    const tiles = d.videos.map(v => `<a class="senpai-tile" href="https://www.youtube.com/watch?v=${esc(v.id)}">
        <span class="senpai-thumb"><img src="https://i.ytimg.com/vi/${esc(v.id)}/mqdefault.jpg" alt="" loading="lazy"><i>${esc(v.length)}</i></span>
        <span class="senpai-title">${esc(v.title)}</span>
        <span class="senpai-meta">${esc(v.channel)}${v.views ? ' · ' + esc(v.views) : ''}</span>
        <span class="senpai-topic">${v.why === 'slipping' ? 'Slipping: ' : ''}${esc(v.topic)}</span></a>`).join('');
    return `<div class="senpai-head"><b>For what you're learning</b><span>From Leetcode Senpai · your weakest lessons</span>
      <button type="button" class="senpai-hide" title="Hide for this visit">✕</button></div><div class="senpai-row">${tiles}</div>`;
  }

  function place() {
    if (!home() || !shelf) return;
    const target = document.querySelector('ytd-browse[page-subtype="home"] ytd-rich-grid-renderer');
    if (!target || document.getElementById(ID)) return;
    const inner = html(shelf);
    if (!inner) return;
    const box = document.createElement('section');
    box.id = ID;
    box.innerHTML = inner;
    box.querySelector('.senpai-hide')?.addEventListener('click', () => { box.remove(); shelf = null; });
    target.parentElement.insertBefore(box, target);
  }

  function load() {
    if (!home() || asked) return place();
    asked = true;
    chrome.runtime.sendMessage({type: 'shelf'}, d => { shelf = d; place(); });
  }

  document.addEventListener('yt-navigate-finish', load);
  new MutationObserver(() => { if (home() && shelf && !document.getElementById(ID)) place(); })
    .observe(document.documentElement, {childList: true, subtree: true});
  load();
})();
