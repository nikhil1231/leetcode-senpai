// Pure logic for the design builder: capacity estimates from a few scale inputs, quick sanity checks on a
// drawn architecture, and a Mermaid export. No DOM, no I/O. Estimates are rules of thumb, not a sizing tool.
(function (root) {
  'use strict';
  const num = v => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return isFinite(n) && n >= 0 ? n : 0; };
  const PEAK = 5;               // peak traffic as a multiple of the average
  const READS_PER_REPLICA = 1e4;
  const REQS_PER_APP_SERVER = 1e3;

  // scale: {dau, readQps, writeQps} as typed. Empty read/write fall back to 10 reads and 1 write per user per day.
  function estimate(scale = {}) {
    const dau = num(scale.dau), read = num(scale.readQps) || dau * 10 / 86400, write = num(scale.writeQps) || dau / 86400;
    return {
      dau, readQps: read, peakRead: read * PEAK, writeQps: write, peakWrite: write * PEAK,
      hotCacheGb: dau * 0.2 * 10 / 1e6,                     // a fifth of daily users hot, about 10 KB each
      storageGbPerYear: write * 86400 * 365 / 1e6,          // about 1 KB per write
      readReplicas: Math.max(1, Math.ceil(read * PEAK / READS_PER_REPLICA)),
      appServers: Math.max(1, Math.ceil((read + write) * PEAK / REQS_PER_APP_SERVER)),
      cdnOffload: read > 1000 ? '~80%' : '~60%',
    };
  }

  // graph: {nodes:[{id, defId}], edges:[{from, to}]}; nfr: {availability:'99.9%', consistency:'Eventual'}
  function checks(graph, scale = {}, nfr = {}) {
    const out = [], e = estimate(scale), nodes = graph.nodes || [], edges = graph.edges || [];
    const count = id => nodes.filter(n => n.defId === id).length, has = (...ids) => ids.some(id => count(id) > 0);
    const add = (id, level, text) => out.push({ id, level, text });
    if (!nodes.length) return out;
    if (!has('client')) add('no-client', 'warn', 'Add a client. Every design starts with who is calling it.');
    const linked = new Set(edges.flatMap(x => [x.from, x.to]));
    const loose = nodes.filter(n => !linked.has(n.id));
    if (nodes.length > 1 && loose.length) add('loose', 'warn', `${loose.length} component${loose.length > 1 ? 's are' : ' is'} not connected to anything.`);
    const byId = Object.fromEntries(nodes.map(n => [n.id, n.defId]));
    if (edges.some(x => byId[x.from] === 'client' && /^db-/.test(byId[x.to] || ''))) add('client-db', 'warn', 'A client talks to a database directly. Put an application tier in between.');
    const servers = count('app-server') + count('websocket-server');
    if (servers > 1 && !has('load-balancer', 'api-gateway')) add('no-lb', 'warn', 'Several servers need a load balancer in front of them.');
    if (e.peakRead > 5000 && !has('cache', 'cdn')) add('no-cache', 'warn', `About ${Math.round(e.peakRead).toLocaleString('en')} reads/s at peak. Put a cache or CDN in front of the database.`);
    if (e.peakWrite > 1000 && has('db-sql') && !has('message-queue', 'db-nosql', 'consistent-hash')) add('write-heavy', 'warn', `About ${Math.round(e.peakWrite).toLocaleString('en')} writes/s at peak. A single SQL database will struggle: add a queue, shard it, or use a store built for writes.`);
    if (has('worker') && !has('message-queue')) add('worker-no-queue', 'tip', 'Workers normally pull jobs from a queue. Where do their jobs come from?');
    if (has('message-queue') && !has('dead-letter-queue')) add('no-dlq', 'tip', 'Add a dead-letter queue so poison messages do not block the main queue.');
    if (/99\.99/.test(nfr.availability || '') || /99\.999/.test(nfr.availability || '')) {
      if (servers < 2 || !has('load-balancer', 'api-gateway')) add('single-point', 'warn', `Targeting ${nfr.availability} availability, but there is a single point of failure on the request path.`);
    }
    if (nfr.consistency === 'Strong' && has('cache') && !has('db-sql')) add('strong-cache', 'tip', 'Strong consistency with a cache in front: say how you invalidate it.');
    if (has('db-sql') && count('db-sql') === 1 && e.readReplicas > 1) add('replicas', 'tip', `Around ${e.readReplicas} read replicas would carry ${Math.round(e.peakRead).toLocaleString('en')} reads/s at peak.`);
    if (!out.some(x => x.level === 'warn') && nodes.length > 2) add('ok', 'good', 'No obvious gaps at this scale. Now explain the trade-offs out loud.');
    return out;
  }

  // labels: {defId: 'Load Balancer'}. Repeated components get a number.
  function toMermaid(graph, labels = {}) {
    const seen = {}, total = {};
    graph.nodes.forEach(n => { total[n.defId] = (total[n.defId] || 0) + 1; });
    const name = Object.fromEntries(graph.nodes.map(n => {
      seen[n.defId] = (seen[n.defId] || 0) + 1;
      const base = labels[n.defId] || n.defId;
      return [n.id, total[n.defId] > 1 ? `${base} ${seen[n.defId]}` : base];
    }));
    const clean = s => String(s).replace(/[\[\]{}()"|]/g, '');
    const lines = graph.edges.filter(x => name[x.from] && name[x.to]).map(x => `  ${x.from}[${clean(name[x.from])}] --> ${x.to}[${clean(name[x.to])}]`);
    const alone = graph.nodes.filter(n => !graph.edges.some(x => x.from === n.id || x.to === n.id)).map(n => `  ${n.id}[${clean(name[n.id])}]`);
    return ['graph LR', ...lines, ...alone].join('\n');
  }

  const api = { estimate, checks, toMermaid, num };
  root.SDBuilderCalc = api;
})(typeof window !== 'undefined' ? window : globalThis);
