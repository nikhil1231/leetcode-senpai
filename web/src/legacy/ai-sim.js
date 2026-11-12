// Ripple Assist engine: the AI chapters of Ripple Ops. A drawn LLM system, a scenario of questions and
// the price list in; one simulated day out, in the same shape as sd-sim.js's (ticks, bill, summary,
// findings, events), so the builder plays it back unchanged. Pure: no DOM, no I/O, no model calls.
// Each hour the questions split into kinds (help-centre answers, exact codes, account lookups, actions,
// hard reasoning, unanswerable, injection attempts); what's connected decides whether each kind is
// retrieved, answered, grounded, escalated, blocked or harmful, what it costs in tokens, and how long
// it takes. Provider limits, outages, silent model updates, doc changes and injection campaigns arrive
// as incidents. A teaching model: right about which part fails and why, not a benchmark.
(function (root) {
  'use strict';
  const HOURS = 24, DAY = 86400;
  const SHAPE = [0.32, 0.25, 0.2, 0.18, 0.2, 0.28, 0.45, 0.7, 0.92, 1.02, 1.08, 1.12, 1.18, 1.15, 1.1, 1.1, 1.15, 1.25, 1.4, 1.55, 1.6, 1.45, 1.05, 0.62];
  const KINDS = ['faq', 'exact', 'account', 'action', 'hard', 'unanswerable', 'injection'];
  const KIND_LABEL = { faq: 'Help-centre questions', exact: 'Questions about an exact code or ID', account: 'Questions about their own account', action: 'Requests to do something (refunds, cancellations)',
    hard: 'Hard, multi-step questions', unanswerable: 'Questions the docs cannot answer', injection: 'Injection attempts' };
  const MODELS = new Set(['llm-small', 'llm-large', 'llm-hosted']);
  const EVENT_LABEL = { 'model-update': 'Provider silently updates the model', 'rate-limit': 'Provider throttles the model', 'provider-outage': 'Model provider outage',
    'injection-campaign': 'Injection campaign', 'doc-change': 'Refund policy changed', surge: 'Traffic surge' };
  const sum = (a, f = x => x) => a.reduce((s, x) => s + f(x), 0);
  const clamp01 = v => Math.max(0, Math.min(1, v));

  const spec = (econ, id) => econ.components[id] || { role: 'aux', tiers: [{ id: 'x', usd: 0 }] };
  function tierOf(n, econ) {
    const d = spec(econ, n.defId), t = d.tiers || [];
    return t.find(x => x.id === n.cfg?.tier) || t.find(x => x.id === d.default) || t[0] || { id: 'x', usd: 0 };
  }
  const countOf = (n, econ) => (spec(econ, n.defId).opts || []).includes('count') ? Math.max(1, Math.min(64, Math.round(Number(n.cfg?.count) || 1))) : 1;
  const opt = (n, k) => !!n?.cfg?.[k];

  function normalize(s) {
    const ai = { mix: { faq: 0.45, exact: 0.1, account: 0.18, action: 0.05, hard: 0.12, unanswerable: 0.06, injection: 0.04 }, promptTokens: 1200, chunkTokens: 400, topK: 4, outTokens: 300, repeat: 0.2, ...(s.ai || {}) };
    const z = sum(KINDS, k => ai.mix[k] || 0) || 1;
    ai.mix = Object.fromEntries(KINDS.map(k => [k, (ai.mix[k] || 0) / z]));
    return { ...s, ai, dau: Math.max(1, Number(s.dau) || 10000), traffic: { ask: { perUser: s.traffic?.ask?.perUser ?? 1 }, peak: s.traffic?.peak || 1.8 },
      slo: { availability: 99, quality: 85, p95: 8000, ...(s.slo || {}) }, events: (s.events || []).map((e, i) => ({ id: e.id || `${e.type}-${i}`, dur: 1, params: {}, ...e })) };
  }
  function curve(scn) {
    const peak = scn.traffic.peak, max = Math.max(...SHAPE);
    const raw = SHAPE.map(v => 1 + (v - 1) * (peak - 1) / (max - 1)), m = sum(raw) / HOURS;
    return raw.map(v => Math.max(0.05, v / m));
  }

  // What the graph can do: who the orchestrator talks to, and what's reachable from it.
  function prepare(graph, econ) {
    const nodes = Object.fromEntries((graph.nodes || []).map(n => [n.id, { ...n, def: spec(econ, n.defId), tier: tierOf(n, econ), count: countOf(n, econ) }]));
    const kids = {}, parents = {};
    for (const id in nodes) { kids[id] = []; parents[id] = []; }
    for (const e of graph.edges || []) if (nodes[e.from] && nodes[e.to] && e.from !== e.to && !kids[e.from].includes(e.to)) { kids[e.from].push(e.to); parents[e.to].push(e.from); }
    const reach = (from, seen = new Set()) => { for (const k of kids[from] || []) if (!seen.has(k)) { seen.add(k); reach(k, seen); } return seen; };
    const clients = Object.values(nodes).filter(n => n.defId === 'client');
    const fromClient = new Set(clients.flatMap(c => [...reach(c.id)]));
    const app = Object.values(nodes).find(n => n.defId === 'app-server' && fromClient.has(n.id));
    const behind = app ? reach(app.id) : new Set();
    const has = defId => [...behind].map(id => nodes[id]).filter(n => n.defId === defId);
    const front = [...fromClient].map(id => nodes[id]);
    return { nodes, kids, app, behind, has, models: [...behind].map(id => nodes[id]).filter(n => MODELS.has(n.defId)),
      guard: [...front, ...has('guardrail')].find(n => n.defId === 'guardrail'), cache: has('cache')[0], vector: has('vector-db')[0], keyword: has('search-engine')[0],
      rerank: has('reranker')[0], router: has('model-router')[0], tools: has('tool-gateway')[0], human: has('human-handoff')[0], evals: Object.values(nodes).find(n => n.defId === 'eval-harness'),
      db: has('db-sql')[0] || has('db-nosql')[0] };
  }
  const quality = (m, kind) => m ? (kind === 'hard' ? m.tier.qHard : m.tier.qEasy) : 0;

  function modsAt(scn, h) {
    const mods = { active: [], tpmMult: 1, limited: null, down: new Set(), drift: 0, injMult: 1, stale: false, mult: 1 };
    for (const e of scn.events) {
      const on = h >= e.at && h < e.at + Math.max(1, e.dur || 1), after = h >= e.at;
      if (e.type === 'model-update' && after) { mods.drift = Math.max(mods.drift, e.params?.drop ?? 0.15); if (on) mods.active.push(e.id); }
      if (e.type === 'doc-change' && after) { mods.stale = true; if (on) mods.active.push(e.id); }
      if (!on) continue;
      mods.active.push(e.id);
      if (e.type === 'rate-limit') { mods.tpmMult *= e.params?.mult ?? 0.5; mods.limited = e.params?.model || 'llm-large'; }
      if (e.type === 'provider-outage') mods.down.add(e.params?.model || 'llm-large');
      if (e.type === 'injection-campaign') mods.injMult *= e.params?.mult ?? 6;
      if (e.type === 'surge') mods.mult *= e.params?.mult ?? 3;
    }
    return mods;
  }

  // One hour: route each kind of question through the graph.
  function hour(m, scn, econ, h, shape) {
    const mods = modsAt(scn, h), A = scn.ai;
    const rps = scn.dau * scn.traffic.ask.perUser / DAY * shape[h] * mods.mult;
    const per = Object.fromEntries(KINDS.map(k => [k, rps * A.mix[k] * (k === 'injection' ? mods.injMult : 1)]));   // a campaign adds attacks on top
    const out = { h, rps, kinds: {}, nodes: {}, cost: { tokensIn: {}, tokensOut: {}, cachedIn: {}, req: {}, handoffs: 0 }, harmful: 0, correct: 0, legit: 0, served: 0, errors: 0, latency: [], mods, notes: new Set() };
    const live = m.models.filter(x => !mods.down.has(x.defId));
    const pass = (id, r) => { out.cost.req[id] = (out.cost.req[id] || 0) + r; };
    if (!m.app) {
      for (const k of KINDS) if (k !== 'injection') { out.legit += per[k]; out.errors += per[k]; }
      out.notes.add('no-app');
      return finishHour(out, m, econ);
    }
    // model capacity this hour, in tokens per minute
    // a rate-limit incident throttles one provider's model (the large one unless it says otherwise)
    const limit = Object.fromEntries(live.map(x => [x.id, (x.tier.tpm || 1e9) * (x.defId === 'llm-hosted' ? x.count : 1) * (x.defId === mods.limited ? mods.tpmMult : 1)]));
    const used = Object.fromEntries(live.map(x => [x.id, 0]));
    const best = [...live].sort((a, b) => b.tier.qHard - a.tier.qHard)[0], cheap = [...live].sort((a, b) => (a.tier.inM || 0) - (b.tier.inM || 0))[0];
    const humanCap = m.human ? (m.human.tier.perHour || 120) * m.human.count : 0;
    let humanUsed = 0;
    const recall = kind => {
      if (kind === 'exact') return m.keyword ? (m.rerank ? 0.97 : 0.95) : m.vector ? 0.35 : 0;
      if (kind !== 'faq' && kind !== 'hard') return 1;
      const base = m.vector && m.keyword ? 0.9 : m.vector ? 0.84 : m.keyword ? 0.68 : 0;
      return base && m.rerank ? Math.min(0.97, base + 0.06) : base;
    };
    for (const kind of KINDS) {
      let r = per[kind];
      if (r <= 0) continue;
      const k = { rps: r, ok: 1, quality: 0, ms: 0, blocked: 0, harmful: 0, escalated: 0, cached: 0 };
      out.kinds[kind] = k;
      pass(m.app.id, r);
      let ms = 40;
      if (m.guard) { pass(m.guard.id, r); ms += m.guard.tier.ms || 60; }
      if (kind === 'injection') {
        const caught = m.guard ? (m.guard.tier.catch ?? 0.7) : 0;
        k.blocked = caught;
        const through = r * (1 - caught);
        const confirm = m.tools && opt(m.tools, 'confirm'), scoped = m.tools && opt(m.tools, 'scoped');
        if (m.tools && !confirm) { k.harmful = through * (scoped ? 0.1 : 0.5); out.harmful += k.harmful; out.notes.add(scoped ? 'inject-scoped' : 'inject-harm'); }
        if (through && live.length) { const mm = cheap; used[mm.id] += through * (A.promptTokens + 200) * 60; out.cost.tokensIn[mm.id] = (out.cost.tokensIn[mm.id] || 0) + through * (A.promptTokens + 200) * 3600; }
        continue;
      }
      out.legit += r;
      if (m.guard) { const fp = m.guard.tier.falsePos ?? 0.01; out.errors += r * fp; r *= 1 - fp; }
      // response cache: repeated public questions, answered without the model
      if (m.cache && (kind === 'faq' || kind === 'exact')) {
        const hit = A.repeat * (mods.stale && !opt(m.vector, 'fresh') ? 0.4 : 1);
        k.cached = hit; pass(m.cache.id, r);
        out.correct += r * hit * (mods.stale && kind === 'faq' ? 0.7 : 0.97); out.served += r * hit;
        out.latency.push([r * hit, 60]);
        r *= 1 - hit;
      }
      if (!live.length) { out.errors += r; out.notes.add(m.models.length ? 'outage-no-fallback' : 'no-model'); continue; }
      // choose a model
      let model = best;
      if (m.router && live.length > 1) { pass(m.router.id, r); ms += m.router.tier.ms || 30; model = kind === 'hard' ? best : cheap; }
      else if (live.length > 1 && kind !== 'hard') model = best;
      const ctx = (kind === 'faq' || kind === 'exact' || kind === 'hard' || kind === 'unanswerable') && (m.vector || m.keyword) ? A.topK * A.chunkTokens : 0;
      const tin = A.promptTokens + ctx + (kind === 'account' || kind === 'action' ? 400 : 0), tout = kind === 'hard' ? A.outTokens * 1.4 : A.outTokens;
      // rate limits: overflow goes to another live model, or fails
      let left = r;
      const order = [model, ...live.filter(x => x !== model)];
      const servedBy = [];
      for (const x of order) {
        if (left <= 1e-9) break;
        const room = Math.max(0, (limit[x.id] - used[x.id]) / ((tin + tout) * 60));
        const take = Math.min(left, room);
        if (take > 0) { used[x.id] += take * (tin + tout) * 60; servedBy.push([x, take]); left -= take; }
        if (!(m.router || order.length > 1)) break;
      }
      if (left > 1e-9) { out.errors += left; k.ok = 1 - left / per[kind]; out.notes.add(servedBy.length ? 'rate-limited' : 'rate-limited'); if (order.length === 1) out.notes.add('no-fallback'); }
      if (m.vector && ctx) pass(m.vector.id, r);
      if (m.keyword && ctx) pass(m.keyword.id, r);
      if (m.rerank && ctx) pass(m.rerank.id, r);
      ms += ctx ? (m.vector ? 45 : 0) + (m.keyword ? 30 : 0) + (m.rerank ? (m.rerank.tier.ms || 150) : 0) : 0;
      for (const [x, take] of servedBy) {
        const cachedShare = opt(x, 'cachePrefix') ? Math.min(1, A.promptTokens * 0.9 / tin) : 0;
        out.cost.tokensIn[x.id] = (out.cost.tokensIn[x.id] || 0) + take * tin * 3600;
        out.cost.cachedIn[x.id] = (out.cost.cachedIn[x.id] || 0) + take * tin * cachedShare * 3600;
        out.cost.tokensOut[x.id] = (out.cost.tokensOut[x.id] || 0) + take * tout * 3600;
        const ttft = (x.tier.ttft || 0.5) * 1000 * (1 - 0.6 * cachedShare) + tin / 20;
        const util = used[x.id] / limit[x.id];
        const queue = x.defId === 'llm-hosted' && util > 0.8 ? (util - 0.8) * 20000 : 0;
        const lat = ms + ttft + tout / (x.tier.tps || 60) * 1000 + queue;
        // quality of what the model says
        let q = quality(x, kind) - (m.evals ? 0 : mods.drift * (kind === 'hard' ? 1 : 0.5));
        if (mods.drift && !m.evals) out.notes.add('drift');
        if (kind === 'faq' || kind === 'exact' || kind === 'hard') {
          const rc = recall(kind);
          if (!rc) out.notes.add('no-retrieval'); else if (kind === 'exact' && !m.keyword) out.notes.add('exact-miss');
          const staleHit = kind === 'faq' && mods.stale && m.vector && !opt(m.vector, 'fresh') ? 0.35 : 0;
          if (staleHit) out.notes.add('stale');
          q = rc * q * (1 - staleHit) + (1 - rc) * (opt(x, 'grounded') ? 0 : 0.12);
        } else if (kind === 'account') {
          if (!(m.db || m.tools)) { q = 0.02; out.notes.add('no-account-data'); } else q *= 0.98;
        } else if (kind === 'action') {
          if (!m.tools) { q = 0.03; out.notes.add('no-tools'); } else q *= opt(m.tools, 'confirm') ? 0.97 : 0.99;
        } else if (kind === 'unanswerable') {
          q = opt(x, 'grounded') ? 0.94 : 0.08;
          if (!opt(x, 'grounded')) out.notes.add('ungrounded');
        }
        // escalation: a share of would-be-wrong answers is caught by low confidence and handed to people
        let good = take * clamp01(q);
        if (m.human) {
          const wrong = take - good, catchable = wrong * 0.6, room = Math.max(0, humanCap - humanUsed * 1), handed = Math.min(catchable, room / 3600);
          humanUsed += handed * 3600; good += handed * 0.97; out.cost.handoffs += handed * 3600; k.escalated += handed;
          if (catchable > handed + 1e-9) out.notes.add('human-overflow');
          if (handed > 0) out.latency.push([handed, 4 * 60 * 1000]);
        }
        out.correct += good; out.served += take;
        out.latency.push([take - (k.escalated || 0), lat]);
        k.quality += good; k.ms = Math.max(k.ms, lat);
      }
      k.quality = per[kind] ? k.quality / per[kind] : 0;
    }
    for (const x of m.models) out.nodes[x.id] = { util: mods.down.has(x.defId) ? 0 : (used[x.id] || 0) / (limit[x.id] || 1), down: mods.down.has(x.defId) };
    if (m.human) out.nodes[m.human.id] = { util: humanUsed / Math.max(1, humanCap) };
    out.humanUsed = humanUsed;
    return finishHour(out, m, econ);
  }
  function finishHour(out, m, econ) {
    const ok = out.legit ? 1 - out.errors / out.legit : 1;
    const lat = out.latency.filter(x => x[0] > 0).sort((a, b) => a[1] - b[1]), tot = sum(lat, x => x[0]);
    let acc = 0, p95 = 0;
    for (const [w, v] of lat) { acc += w; if (acc >= tot * 0.95) { p95 = v; break; } }
    const nodes = {};
    for (const [id, n] of Object.entries(m.nodes)) {
      const st = out.nodes[id] || {};
      const cap = n.defId === 'app-server' ? (n.tier.rps || 1500) * n.count : null;
      const load = out.cost.req[id] || (n.defId === 'client' ? out.rps : 0);
      const util = st.util ?? (cap ? load / cap : load ? Math.min(0.5, load / 2000) : 0);
      nodes[id] = { util, load, status: st.down ? 'down' : util >= 1 ? 'saturated' : util >= 0.85 ? 'hot' : util >= 0.6 ? 'warm' : 'ok' };
    }
    return { ...out, ok, p95, quality: out.legit ? out.correct / out.legit : 1, nodes };
  }

  function run(scn0, graph, econ) {
    const scn = normalize(scn0), m = prepare(graph, econ), shape = curve(scn);
    const hours = Array.from({ length: HOURS }, (_, h) => hour(m, scn, econ, h, shape));
    const ticks = hours.map(o => ({ h: o.h, ok: o.ok, legit: o.legit, retryMult: 1, mods: { active: o.mods.active, hot: 0, cold: false }, quality: o.quality,
      types: { ask: { rps: o.rps, ok: o.ok, p99: o.p95 } }, nodes: o.nodes, queues: {}, unserved: {}, flags: {}, lost: 0, harmful: o.harmful }));
    const bill = cost(m, scn, econ, hours);
    const summary = summarize(scn, hours, bill);
    return { version: 1, engine: 'ai', ticks, bill, summary, findings: findings(m, scn, hours, bill, summary), events: eventOutcomes(scn, hours), kinds: kindTable(hours) };
  }

  function cost(m, scn, econ, hours) {
    const items = [], month = 30;
    for (const n of Object.values(m.nodes)) {
      if (n.defId === 'client') continue;
      const t = n.tier, why = [];
      let usd = (t.usd || 0) * n.count;
      if (t.usd) why.push(`${n.count > 1 ? n.count + ' × ' : ''}${t.label}`);
      if (MODELS.has(n.defId)) {
        const tin = sum(hours, o => o.cost.tokensIn[n.id] || 0) * month, cin = sum(hours, o => o.cost.cachedIn[n.id] || 0) * month, tout = sum(hours, o => o.cost.tokensOut[n.id] || 0) * month;
        if (t.inM) { usd += ((tin - cin) * t.inM + cin * t.inM * 0.1 + tout * t.outM) / 1e6; why.push(`${fmtN(tin / 1e6)}M tokens in${cin ? ` (${Math.round(cin / Math.max(1, tin) * 100)}% cached)` : ''}, ${fmtN(tout / 1e6)}M out`); }
      }
      const reqM = sum(hours, o => o.cost.req[n.id] || 0) * 3600 * month / 1e6;
      if (t.perMReq) { usd += reqM * t.perMReq; why.push(`${fmtN(reqM)}M requests`); }
      if (n.defId === 'human-handoff') { const hand = sum(hours, o => o.cost.handoffs) * month; usd += hand * (t.perHandoff || 2.5); why.push(`${fmtN(hand)} conversations handed to people`); }
      if (usd > 0) items.push({ id: n.id, defId: n.defId, kind: n.def.kind || 'ai', usd, detail: why.join(' · ') });
    }
    items.sort((a, b) => b.usd - a.usd);
    return { total: sum(items, i => i.usd), items, byKind: {} };
  }
  function quickCost(graph, econ) {
    const m = prepare(graph, econ), items = [];
    for (const n of Object.values(m.nodes)) if ((n.tier.usd || 0) > 0) items.push({ id: n.id, defId: n.defId, kind: 'ai', usd: n.tier.usd * n.count, detail: n.tier.label });
    return { total: sum(items, i => i.usd), items, byKind: {} };
  }

  function summarize(scn, hours, bill) {
    const legit = sum(hours, o => o.legit), good = sum(hours, o => o.correct), errors = sum(hours, o => o.errors);
    const availability = legit ? 100 * (1 - errors / legit) : 100, quality = legit ? 100 * good / legit : 100;
    const quiet = hours.filter(o => !o.mods.active.length), p95 = Math.max(0, ...(quiet.length ? quiet : hours).map(o => o.p95));
    const harmful = sum(hours, o => o.harmful) * 3600;
    const slo = scn.slo, objectives = [];
    objectives.push({ id: 'quality', label: 'Questions answered correctly', target: `≥ ${slo.quality}%`, actual: `${quality.toFixed(1)}%`, pass: quality >= slo.quality - 1e-9 });
    objectives.push({ id: 'availability', label: 'Questions answered at all (no errors)', target: `${slo.availability}%`, actual: `${availability.toFixed(2)}%`, pass: availability >= slo.availability - 1e-9 });
    objectives.push({ id: 'p95', label: 'p95 time to a full answer, normal hours', target: `≤ ${(slo.p95 / 1000).toFixed(1)} s`, actual: `${(p95 / 1000).toFixed(1)} s`, pass: p95 <= slo.p95 });
    if (slo.safety != null) objectives.push({ id: 'safety', label: 'Harmful actions taken', target: '0', actual: Math.round(harmful).toLocaleString('en'), pass: harmful < 1 });
    if (slo.budget) objectives.push({ id: 'budget', label: 'Monthly bill', target: `≤ $${slo.budget.toLocaleString('en')}`, actual: `$${Math.round(bill.total).toLocaleString('en')}`, pass: bill.total <= slo.budget });
    const all = objectives.every(o => o.pass), budgetOk = !slo.budget || bill.total <= slo.budget * 1.5;
    const stars = all && slo.budget && bill.total <= slo.budget * 0.8 ? 3 : all ? 2 : availability >= 95 && quality >= slo.quality - 10 && budgetOk && harmful < 1 ? 1 : 0;
    const peak = hours.reduce((a, o) => (o.legit > (a?.legit || 0) && !o.mods.active.length ? o : a), null) || hours[0];
    return { availability, quality, p95, harmful, objectives, stars, cost: bill.total, peakHour: peak.h, lost: 0, worstLag: 0, unserved: {}, p99: { ask: p95 }, p99Incident: {} };
  }

  function eventOutcomes(scn, hours) {
    return scn.events.map(e => {
      const win = hours.filter(o => o.h >= e.at && o.h < (['model-update', 'doc-change'].includes(e.type) ? HOURS : e.at + Math.max(1, e.dur || 1)));
      const legit = sum(win, o => o.legit), ok = legit ? sum(win, o => o.legit * o.ok) / legit : 1, q = legit ? sum(win, o => o.correct) / legit : 1;
      const base = hours.filter(o => !o.mods.active.length && o.h < e.at), qBefore = base.length ? sum(base, o => o.correct) / Math.max(1e-9, sum(base, o => o.legit)) : q;
      const harm = sum(win, o => o.harmful) * 3600;
      const outcome = harm >= 1 || ok < 0.95 || q < qBefore - 0.08 ? 'outage' : ok < 0.995 || q < qBefore - 0.03 ? 'degraded' : 'handled';
      return { id: e.id, type: e.type, label: e.label || EVENT_LABEL[e.type] || e.type, at: e.at, dur: e.dur, ok, lost: 0, lag: 0, outcome, quality: q };
    });
  }

  function kindTable(hours) {
    const out = {};
    for (const k of KINDS) {
      const rows = hours.map(o => o.kinds[k]).filter(Boolean), r = sum(rows, x => x.rps);
      if (!r) continue;
      out[k] = { label: KIND_LABEL[k], share: r, quality: sum(rows, x => x.quality * x.rps) / r, blocked: sum(rows, x => x.blocked * x.rps) / r, harmful: sum(rows, x => x.harmful) * 3600, escalated: sum(rows, x => x.escalated) * 3600 };
    }
    const tot = sum(Object.values(out), x => x.share);
    for (const k in out) out[k].share /= tot;
    return out;
  }

  // What the team saw, in their words, tied to course concepts.
  function findings(m, scn, hours, bill, s) {
    const notes = new Set(hours.flatMap(o => [...o.notes])), out = [];
    const add = (id, level, who, concept, text) => out.push({ id, level, who, concept, text });
    if (notes.has('no-app')) add('no-app', 'bad', 'priya', 'rag', 'Nothing orchestrates the conversation: connect the client to an app server, and the app server to a model.');
    if (notes.has('no-model')) add('no-model', 'bad', 'priya', 'rag', 'The app server has no model to call, so every question fails.');
    if (notes.has('no-retrieval')) add('no-retrieval', 'bad', 'sam', 'rag', 'The model answers help-centre questions from memory. It has never seen our docs, so it guesses: retrieve the right passages and put them in the prompt.');
    if (notes.has('exact-miss')) add('exact-miss', 'bad', 'sam', 'hybrid-search', 'Questions about an exact error code or order number get answers about similar-sounding things. Vector search blurs exact IDs: add keyword search (BM25) alongside it.');
    if (notes.has('no-account-data')) add('no-account-data', 'bad', 'sam', 'agent-tools', '"Where is my refund?" gets confident, invented answers. The assistant needs a lookup tool or a read path to the account database, scoped to the signed-in user.');
    if (notes.has('no-tools')) add('no-tools', 'bad', 'sam', 'agent-tools', 'People ask it to cancel or refund and it says it has, but nothing happens. Actions need a tool gateway that does them for real.');
    if (notes.has('ungrounded')) add('ungrounded', 'bad', 'marcus', 'grounding', 'Asked about things our docs never mention, it makes up a policy. Tell the model to answer only from the passages and to say it doesn\'t know: turn on "grounded" on the model.');
    if (notes.has('inject-harm')) add('inject-harm', 'bad', 'priya', 'injection', `Injected instructions made the assistant take ${Math.round(s.harmful).toLocaleString('en')} actions nobody asked for. Assume the model will sometimes be fooled: require confirmation for actions, and scope the tools to the signed-in user.`);
    if (notes.has('rate-limited')) add('rate-limited', 'bad', 'priya', 'llm-reliability', `The provider's rate limit turned away ${(100 - s.availability).toFixed(1)}% of questions at peak. A second model as a fallback (or a router that spreads the load) keeps answering.`);
    if (notes.has('outage-no-fallback')) add('outage-no-fallback', 'bad', 'priya', 'llm-reliability', 'When the model provider went down, every question failed. Connect a second model so the app can fall back.');
    if (notes.has('drift')) add('drift', 'bad', 'marcus', 'evals', 'The provider updated the model and answers got quietly worse; nobody noticed until support did. An eval harness in CI and on a canary would have caught it and pinned the old version.');
    if (notes.has('stale')) add('stale', 'bad', 'sam', 'freshness', 'After the refund policy changed, the assistant kept quoting the old one: the index still had the old pages. Re-ingest on change and delete removed pages ("fresh" on the vector store).');
    if (notes.has('human-overflow')) add('human-overflow', 'warn', 'sam', 'escalation', 'The support team got more handoffs than they can take at peak; the rest got the bot\'s best guess. Size the team for the handoff rate, or improve the bot so it needs fewer.');
    const big = m.models.find(x => x.defId === 'llm-large');
    if (scn.slo.budget && bill.total > scn.slo.budget && big && !m.router) add('cost-router', 'bad', 'marcus', 'llm-cost', `The bill is $${Math.round(bill.total).toLocaleString('en')} a month against $${scn.slo.budget.toLocaleString('en')}. Most questions are easy: a router that sends them to a small model, and prompt caching on the fixed prefix, cut it a lot.`);
    else if (scn.slo.budget && bill.total > scn.slo.budget) add('cost', 'bad', 'marcus', 'llm-cost', `The bill is $${Math.round(bill.total).toLocaleString('en')} a month against $${scn.slo.budget.toLocaleString('en')}. Look at tokens per question (top-k, prompt size, output length) and prompt caching.`);
    if (s.p95 > scn.slo.p95) add('slow', 'bad', 'sam', 'llm-latency', `A full answer takes ${(s.p95 / 1000).toFixed(1)} s at p95. Output tokens dominate: a faster model for easy questions, shorter answers, and caching the prefix all help.`);
    if (m.guard && notes.has('inject-scoped')) add('inject-scoped', 'warn', 'priya', 'injection', 'Some injected requests still reached the tools. Scoping limited the damage; confirmation for actions would stop it.');
    if (!out.some(f => f.level === 'bad')) add('good', 'good', 'priya', '', `Answered ${s.quality.toFixed(1)}% of questions correctly for $${Math.round(bill.total).toLocaleString('en')} a month.${s.harmful < 1 ? ' No harmful actions.' : ''}`);
    return out;
  }
  const fmtN = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'k' : n >= 10 ? Math.round(n).toLocaleString('en') : n >= 1 ? n.toFixed(1) : n.toFixed(2);

  const api = { HOURS, KINDS, KIND_LABEL, EVENT_LABEL, normalize, prepare, run, cost, quickCost, curve };
  root.AISim = api;
})(typeof window !== 'undefined' ? window : globalThis);
