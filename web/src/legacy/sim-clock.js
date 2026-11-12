// One playback speed for the internals simulators (raft, bully, cap, quorum, 2PC, replication anomalies).
// They open paused; Play runs them at this speed and Step always advances one full tick. The widgets are
// prebuilt bundles: scripts/patch_sim_widgets.py rewrites their auto-tick to call every() and scale().
(function () {
  'use strict';
  const SPEEDS = [0.1, 0.25, 0.5, 1, 2];
  const KEY = 'sim-speed';
  let speed = 0.25, auto = false;
  try { const s = parseFloat(localStorage.getItem(KEY)); if (SPEEDS.includes(s)) speed = s; } catch (e) { /* storage blocked: keep the default */ }

  // Like setInterval, but while fn runs scale() reports the chosen speed, so a tick advances speed x its usual time.
  function every(fn, ms) { return setInterval(() => { auto = true; try { fn(); } finally { auto = false; } }, ms); }
  const scale = () => (auto ? speed : 1);
  function set(s) {
    speed = s;
    try { localStorage.setItem(KEY, String(s)); } catch (e) { /* not remembered, still applied */ }
    document.querySelectorAll('[data-sim-speed]').forEach(paint);
  }
  const label = s => (s < 1 ? s + '×' : s + '×');
  function paint(el) {
    const input = el.querySelector('input'), out = el.querySelector('output');
    if (input) input.value = String(SPEEDS.indexOf(speed));
    if (out) out.textContent = label(speed);
  }
  // A React callback ref: draws the speed slider into an empty span once.
  function control(el) {
    if (!el || el.dataset.simSpeed) return;
    el.dataset.simSpeed = '1';
    el.className = 'sim-speed';
    el.innerHTML = `<label>Speed <input type="range" min="0" max="${SPEEDS.length - 1}" step="1" aria-label="Playback speed"></label><output aria-live="polite"></output>`;
    el.querySelector('input').addEventListener('input', e => set(SPEEDS[+e.target.value]));
    paint(el);
  }
  window.SimClock = { every, scale, set, control, speed: () => speed, SPEEDS };
})();
