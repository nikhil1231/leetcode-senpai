// Self-contained widgets (React, prebuilt and vendored under /widgets) exposed as lesson simulators.
// Each module exports mount(el) -> unmount. They load on first use, so the ~140 KB React runtime
// only costs anything on a lesson that embeds one. Lessons embed them like any other ```sim block.
(function () {
  'use strict';
  if (!window.SDSims) return;
  const WIDGETS = {
    btree: 'B-tree', wal: 'Write-ahead log', isolation: 'Isolation levels',
    crdt: 'CRDTs', replanomalies: 'Replication anomalies', cap: 'CAP', merkle: 'Merkle anti-entropy',
    cachestrategies: 'Cache strategies', pubsub: 'Pub/sub', partitioning: 'Partitioning', sqlsharding: 'SQL sharding',
    datamodels: 'Data models', slottedpage: 'Slotted page', rowcol: 'Row versus column', dns: 'DNS',
    tcp: 'TCP versus UDP', tls: 'TLS handshake', http: 'HTTP versions',
    bully: 'Bully election', phiaccrual: 'Phi-accrual detector', streamwindow: 'Stream windows', encoding: 'Encoding and evolution',
  };
  const esc = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  Object.keys(WIDGETS).forEach(name => window.SDSims.register(name, (el, cfg, api) => {
    let unmount = null, dead = false;
    el.classList.add('sd-widget');
    el.innerHTML = '<p class="sim-note">Loading…</p>';
    import(`/widgets/internals/${name}.js?v=${window.ASSET_VER || ''}`).then(m => {
      if (dead) return;
      el.innerHTML = '';
      unmount = m.mount(el);
    }).catch(e => { el.innerHTML = `<p class="sd-error">Could not load the ${esc(WIDGETS[name])} simulator: ${esc(e.message)}</p>`; });
    // Widgets keep their own state, so any interaction counts as having tried it.
    const first = () => { api.touched(); api.metrics({ touched: 1 }); el.removeEventListener('pointerdown', first, true); };
    el.addEventListener('pointerdown', first, true);
    return { destroy() { dead = true; el.removeEventListener('pointerdown', first, true); if (unmount) unmount(); } };
  }));
})();
