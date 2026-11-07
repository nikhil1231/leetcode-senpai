// AI engineering simulators: sampling, one LLM call's latency and cost, the monthly bill, tool calling
// message by message, structured output, hybrid search, an HNSW graph, a RAG pipeline that fails at a
// stage, eval noise, a precision/recall threshold, an agent loop, serving on a GPU, an MCP session
// and its attacks, and a prompt injection sandbox. Models are pure (ai-models.js); this file draws
// them with the shared helpers.
(function () {
  'use strict';
  if (!window.SDSims || !window.AIModels) return;
  const M = window.AIModels, { esc, fmt, ms, controls, chart, bars, stats, shell, simple } = window.SDSims.H;
  const reg = window.SDSims.register;
  const money = n => n >= 1e6 ? '$' + (n / 1e6).toFixed(2) + 'M' : n >= 1e4 ? '$' + Math.round(n / 1e3) + 'k' : n >= 100 ? '$' + Math.round(n).toLocaleString('en') : '$' + n.toFixed(n < 1 ? 4 : 2);
  const sec = s => !isFinite(s) ? '∞' : s >= 1 ? s.toFixed(1) + ' s' : Math.round(s * 1000) + ' ms';
  const pc = v => Math.round(v * 100) + '%';
  const on = (el, f) => el.addEventListener('click', e => { const b = e.target.closest('[data-do]'); if (b && el.contains(b)) f(b.dataset.do, b); });

  // ---------- Sampling ----------
  reg('sampling', (el, cfg, api) => {
    const st = { prompt: 'cat', temperature: 1, topK: 0, topP: 1 }, seen = new Set();
    let seed = 1, drawn = [];
    const { ctl, out } = shell(el);
    controls(ctl, [{ key: 'prompt', label: 'Prompt', type: 'select', options: Object.entries(M.PROMPTS).map(([k, v]) => [k, v.text]) },
      { key: 'temperature', label: 'Temperature', min: 0, max: 2, step: 0.05, fmt: v => v.toFixed(2) }, { key: 'topK', label: 'Top-k (0 = off)', min: 0, max: 12, fmt: v => v ? String(v) : 'off' },
      { key: 'topP', label: 'Top-p', min: 0.05, max: 1, step: 0.05, fmt: v => v.toFixed(2) }, { key: 'draw', label: 'Sample 20 times', type: 'button' }], st,
    (k, isAction) => { api.touched(); if (isAction) { drawn = M.sample(M.distribution(st.prompt, st.temperature, st.topK, st.topP), 20, seed++); } else drawn = []; paint(); });
    const paint = () => {
      const d = M.distribution(st.prompt, st.temperature, st.topK, st.topP);
      const distinct = new Set(drawn).size;
      if (drawn.length) seen.add(`${st.prompt}:${distinct > 1 ? 'varied' : 'same'}`);
      out.innerHTML = `<p class="ai-prompt">${esc(M.PROMPTS[st.prompt].text)}<span>▍</span></p>`
        + stats([{ label: 'Tokens still in play', value: String(d.kept) }, { label: 'Entropy', value: d.entropy.toFixed(2) + ' bits' }, ...(drawn.length ? [{ label: 'Different picks in 20', value: String(distinct), tone: distinct > 1 && st.prompt === 'label' ? 'bad' : '' }] : [])])
        + bars(d.probs.map(x => ({ label: JSON.stringify(x.tok), value: x.p, text: x.kept ? pc(x.p) : 'cut', cls: x.kept ? '' : 'is-idle' })), Math.max(...d.probs.map(x => x.p)))
        + (drawn.length ? `<p class="ai-draws">${drawn.map(t => `<span>${esc(t.trim())}</span>`).join('')}</p>` : '')
        + `<p class="sim-note">Temperature divides the logits before the softmax: low sharpens the distribution towards the top token, high flattens it. Top-k and top-p cut the long tail before sampling. For a label or JSON, you want the same answer every time; for names, variety.</p>`;
      api.metrics({ temperature: st.temperature, prompt: st.prompt, distinct, kept: d.kept, varied: seen.has('cat:varied') ? 1 : 0, labelSame: seen.has('label:same') ? 1 : 0 });
    };
    paint();
    return { destroy() {} };
  });

  // ---------- One LLM call ----------
  reg('llmcall', (el, cfg, api) => simple(el, cfg, api, { sample: 'prose', input: 6000, output: 400, decodeTps: 80, cached: 0, streaming: true },
    [{ key: 'sample', label: 'Tokenise this text (roughly)', type: 'select', options: [['prose', 'English prose'], ['code', 'Python code'], ['ids', 'UUIDs and IDs'], ['json', 'JSON']] },
      { key: 'input', label: 'Prompt tokens', min: 200, max: 100000, step: 200, log: true, fmt: v => fmt(v) }, { key: 'output', label: 'Output tokens', min: 10, max: 2000, step: 10 },
      { key: 'decodeTps', label: 'Decode speed (tokens / s)', min: 20, max: 300, step: 10 }, { key: 'cached', label: 'Prompt served from cache', min: 0, max: 0.95, step: 0.05, fmt: pc },
      { key: 'streaming', label: 'Stream the response', type: 'toggle' }],
    s => {
      const r = M.call(s), toks = M.roughTokens(M.SAMPLES[s.sample]), text = M.SAMPLES[s.sample];
      const w = 100 / Math.max(r.total, 0.01);
      return { metrics: { total: r.total, ttft: r.ttft, output: s.output, cached: s.cached, streaming: s.streaming ? 1 : 0, firstSeen: r.firstSeen },
        html: `<div class="ai-tokens">${toks.map((t, i) => `<span class="c${i % 6}">${esc(t)}</span>`).join('')}</div><p class="sim-note">${text.length} characters ≈ ${toks.length} tokens (${(text.length / toks.length).toFixed(1)} characters a token). English prose is about 4; code, IDs and JSON cost more.</p>`
          + stats([{ label: 'First words appear', value: sec(r.firstSeen), tone: r.firstSeen > 3 ? 'bad' : 'ok' }, { label: 'Response complete', value: sec(r.total) }, { label: 'Cost of the call', value: money(r.cost) }, { label: 'Output share of time', value: pc(r.decode / r.total) }])
          + `<div class="ai-timeline"><i class="is-prefill" style="width:${r.ttft * w}%" title="Prefill: the prompt in parallel"></i><i class="is-decode" style="width:${r.decode * w}%" title="Decode: one token at a time"></i>${s.streaming ? `<em style="left:${r.ttft * w}%">first token</em>` : ''}</div>
          <div class="fs-gantt-key"><span class="ai-k-prefill">Prefill (time to first token)</span><span class="ai-k-decode">Decode (output tokens ÷ speed)</span></div>
          <p class="sim-note">Latency ≈ time to first token + output tokens ÷ decode speed. A long prompt costs a little prefill; every output token costs a decode step. Capping the output is usually the biggest lever; streaming only changes when the user sees the first words.</p>` };
    }));

  // ---------- The monthly bill ----------
  reg('llmbill', (el, cfg, api) => simple(el, cfg, api, { perDay: 200000, input: 3000, output: 300, caching: false, smallShare: 0, outCap: 0, batchShare: 0 },
    [{ key: 'perDay', label: 'Requests per day', min: 1000, max: 2000000, step: 1000, log: true }, { key: 'input', label: 'Input tokens (2,500 are a fixed prefix)', min: 2500, max: 20000, step: 500 },
      { key: 'output', label: 'Output tokens', min: 20, max: 2000, step: 10 }, { key: 'outCap', label: 'Cap output at (0 = no cap)', min: 0, max: 600, step: 20, fmt: v => v ? String(v) : 'no cap' },
      { key: 'caching', label: 'Prompt caching on the prefix (90% off)', type: 'toggle' }, { key: 'smallShare', label: 'Requests routed to a model 10× cheaper', min: 0, max: 0.95, step: 0.05, fmt: pc },
      { key: 'batchShare', label: 'Work moved to the batch API (half price)', min: 0, max: 1, step: 0.1, fmt: pc }],
    s => {
      const r = M.bill(s), base = M.bill({ perDay: s.perDay, input: s.input, output: s.output });
      return { metrics: { month: r.month, saving: 1 - r.month / base.month },
        html: stats([{ label: 'Per day', value: money(r.day) }, { label: 'Per month', value: money(r.month), tone: r.month < base.month * 0.5 ? 'ok' : '' }, { label: 'Saved vs none of this', value: pc(1 - r.month / base.month), tone: 1 - r.month / base.month > 0.5 ? 'ok' : '' }])
          + bars([{ label: 'Input', value: r.inCost, text: money(r.inCost * 30) + '/mo' }, { label: 'Output', value: r.outCost, text: money(r.outCost * 30) + '/mo' }], Math.max(base.inCost, base.outCost))
          + '<p class="sim-note">$3 per million input tokens and $15 per million output. Do this arithmetic before choosing a model: caching a stable prefix and routing easy requests to a small model usually save more than any prompt tweak.</p>' };
    }));

  // ---------- Tool calling, message by message ----------
  reg('toolcall', (el, cfg, api) => {
    let choice = null; const seen = new Set();
    el.innerHTML = '<div class="ai-tool"></div>';
    const box = el.firstChild;
    const CHOICES = [['ok', 'Run it and return the result'], ['error', 'It timed out: return an error'], ['invent', 'It failed: return an empty result'], ['skip', 'Skip it and send the next message'], ['inject', 'Return what the API sent (it has instructions in it)']];
    const paint = () => {
      const t = M.toolTranscript(choice || 'none');
      if (choice) seen.add(choice);
      const shown = choice ? t : t.slice(0, 3);
      box.innerHTML = shown.map(x => `<div class="ai-msg is-${x.who}${x.bad ? ' is-bad' : x.ok ? ' is-ok' : ''}"><b>${esc({ app: 'Your app', user: 'User', model: 'Model', api: 'API' }[x.who])}</b><pre>${esc(JSON.stringify(x.msg, null, 1))}</pre>${x.note ? `<p>${esc(x.note)}</p>` : ''}</div>`).join('')
        + `<p class="sim-note">${choice ? 'Try another choice:' : 'The model has asked for a tool. What does your app do?'}</p><div class="sim-actions">${CHOICES.map(([k, l]) => `<button type="button" class="button${k === choice ? ' is-primary' : ''}" data-do="${k}">${esc(l)}</button>`).join('')}</div>`;
      api.metrics({ tried: seen.size, ok: seen.has('ok') ? 1 : 0, skip: seen.has('skip') ? 1 : 0, inject: seen.has('inject') ? 1 : 0, invent: seen.has('invent') ? 1 : 0 });
    };
    on(el, k => { api.touched(); choice = k; paint(); });
    paint();
    return { destroy() {} };
  });

  // ---------- Structured output ----------
  reg('structured', (el, cfg, api) => simple(el, cfg, api, { mode: 'prompt', retries: 0, feedback: true, maxTokens: 400, validate: true },
    [{ key: 'mode', label: 'Ask for JSON with', type: 'select', options: [['prompt', 'Instructions in the prompt'], ['jsonmode', 'JSON mode'], ['schema', 'Schema-constrained decoding']] },
      { key: 'validate', label: 'Validate against the schema in code', type: 'toggle' }, { key: 'retries', label: 'Retries on a validation error', min: 0, max: 3 },
      { key: 'feedback', label: 'Retry says what was wrong', type: 'toggle' }, { key: 'maxTokens', label: 'max_tokens', min: 50, max: 800, step: 25 }],
    s => {
      const r = M.structured(s);
      const LBL = { prose: 'Prose around the JSON', enum: 'A label outside the enum', missing: 'A required field missing', truncated: 'Cut off at max_tokens' };
      return { metrics: { success: r.success, silent: r.silentBad, calls: r.callsPer, validate: s.validate ? 1 : 0 },
        html: stats([{ label: 'Valid records', value: (r.success * 100).toFixed(1) + '%', tone: r.success > 0.995 ? 'ok' : r.success < 0.95 ? 'bad' : 'warn' }, { label: 'Bad records that got through', value: (r.silentBad * 100).toFixed(1) + '%', tone: r.silentBad ? 'bad' : 'ok' }, { label: 'Calls per record', value: r.callsPer.toFixed(2) }])
          + bars(Object.entries(r.why).map(([k, v]) => ({ label: LBL[k], value: v, text: String(v), cls: v ? 'is-warn' : 'is-idle' })), Math.max(1, ...Object.values(r.why)))
          + `<p class="sim-note">${s.validate ? 'Validation turns silent corruption into an error you can retry. Constrained decoding removes most format failures, but not truncation, and not a wrong-but-valid answer.' : 'Without validation, every malformed record flows downstream: a crash later, or a wrong value in the database.'} Out of 2,000 records.</p>` };
    }));

  // ---------- Hybrid search ----------
  reg('hybrid', (el, cfg, api) => simple(el, cfg, api, { query: 'q1', method: 'vector', weight: 0.5 },
    [{ key: 'query', label: 'Query', type: 'select', options: M.QUERIES.map(q => [q.id, q.text]) },
      { key: 'method', label: 'Search with', type: 'select', options: [['vector', 'Vector similarity'], ['bm25', 'Keywords (BM25)'], ['hybrid', 'Both, fused by reciprocal rank']] },
      { key: 'weight', label: 'Hybrid: weight on vectors', min: 0, max: 1, step: 0.05, fmt: v => v.toFixed(2) }],
    s => {
      const q = M.QUERIES.find(x => x.id === s.query), res = M.search(s.query, s.method, s.weight).slice(0, 4), all = M.searchScore(s.method, s.weight);
      const title = id => M.DOCS.find(d => d.id === id).title;
      return { metrics: { right: all.right, method: s.method },
        html: stats([{ label: 'Top result', value: title(res[0].id), tone: res[0].id === q.want ? 'ok' : 'bad' }, { label: `${s.method === 'hybrid' ? 'Hybrid' : s.method === 'bm25' ? 'BM25' : 'Vectors'} on all four queries`, value: `${all.right} of 4 right`, tone: all.right === 4 ? 'ok' : '' }])
          + `<ol class="ai-results">${res.map(x => { const d = M.DOCS.find(y => y.id === x.id); return `<li class="${x.id === q.want ? 'is-want' : ''}"><b>${esc(d.title)}</b> <span>${x.score.toFixed(s.method === 'hybrid' ? 4 : 2)}</span><p>${esc(d.text)}</p></li>`; }).join('')}</ol>`
          + `<p class="sim-note">${esc(q.note)} Reciprocal rank fusion adds 1 / (60 + rank) from each list, so a document near the top of either list rises.</p>` };
    }));

  // ---------- HNSW ----------
  reg('hnsw', (el, cfg, api) => {
    const st = { ef: 10, M: 6, qx: 0.42, qy: 0.58 };
    let g = M.buildHnsw(M.points(400, 2), st.M, 3);
    const { ctl, out } = shell(el);
    controls(ctl, [{ key: 'ef', label: 'ef_search (candidate list)', min: 1, max: 100 }, { key: 'M', label: 'M (links per node)', min: 2, max: 16 }, { key: 'move', label: 'Move the query', type: 'button' }], st,
      (k, isAction) => { api.touched(); if (k === 'M') g = M.buildHnsw(M.points(400, 2), st.M, 3); if (isAction) { st.qx = 0.1 + Math.random() * 0.8; st.qy = 0.1 + Math.random() * 0.8; } paint(); });
    let best = { recall: 0, evals: 0 };
    const paint = () => {
      const q = [st.qx, st.qy], r = M.hnswSearch(g, q, 10, st.ef);
      if (r.recall >= 0.9 && (!best.evals || r.evals < best.evals)) best = { recall: r.recall, evals: r.evals };
      const S = 300, P = ([x, y]) => `${(x * S).toFixed(1)},${(y * S).toFixed(1)}`;
      const vis = new Set(r.visited), res = new Set(r.result), ex = new Set(r.exact);
      const top = g.layers[g.top];
      out.innerHTML = stats([{ label: 'Recall@10', value: pc(r.recall), tone: r.recall >= 0.9 ? 'ok' : 'bad' }, { label: 'Distances computed', value: `${r.evals} of ${r.brute}`, tone: r.evals < r.brute / 4 ? 'ok' : '' }, { label: 'Layers', value: String(g.top + 1) }])
        + `<svg class="ai-hnsw" viewBox="-6 -6 ${S + 12} ${S + 12}">${top.ids.flatMap(i => top.links[i].map(j => `<line x1="${g.pts[i][0] * S}" y1="${g.pts[i][1] * S}" x2="${g.pts[j][0] * S}" y2="${g.pts[j][1] * S}" class="is-top"/>`)).join('')}
          ${g.pts.map((p, i) => `<circle cx="${p[0] * S}" cy="${p[1] * S}" r="${res.has(i) ? 3.4 : 2}" class="${res.has(i) ? 'is-found' : ex.has(i) ? 'is-missed' : vis.has(i) ? 'is-seen' : ''}"/>`).join('')}
          ${r.path.length ? `<polyline points="${r.path.map(i => P(g.pts[i])).join(' ')}" class="is-path"/>` : ''}<circle cx="${st.qx * S}" cy="${st.qy * S}" r="5" class="is-query"/></svg>
          <div class="fs-gantt-key"><span class="ai-k-query">query</span><span class="ai-k-found">returned</span><span class="ai-k-missed">true neighbour it missed</span><span class="ai-k-seen">distance computed</span><span class="ai-k-top">top-layer links</span></div>
          <p class="sim-note">The search drops through sparse upper layers to get near the query, then explores the bottom layer keeping the best ef candidates. A bigger ef finds more of the true neighbours at the cost of more distance computations; exact search computes all ${r.brute}.</p>`;
      api.metrics({ recall: r.recall, evals: r.evals, ef: st.ef });
    };
    paint();
    return { destroy() {} };
  });

  // ---------- A RAG pipeline ----------
  reg('ragpipe', (el, cfg, api) => simple(el, cfg, api, { chunk: 'medium', overlap: true, hybrid: false, rewrite: false, rerank: false, topK: 5, acl: false, syncDeletes: false, grounded: false },
    [{ key: 'chunk', label: 'Chunk size', type: 'select', options: [['small', '~200 tokens'], ['medium', '~500 tokens'], ['large', '~1,500 tokens']] }, { key: 'overlap', label: 'Overlap between chunks', type: 'toggle' },
      { key: 'syncDeletes', label: 'Delete chunks when a page is removed', type: 'toggle' }, { key: 'rewrite', label: 'Rewrite follow-ups into standalone queries', type: 'toggle' },
      { key: 'hybrid', label: 'Hybrid search (BM25 + vectors)', type: 'toggle' }, { key: 'acl', label: "Filter by the user's permissions in the search", type: 'toggle' },
      { key: 'rerank', label: 'Re-rank the top 50 with a cross-encoder', type: 'toggle' }, { key: 'topK', label: 'Passages in the prompt (top-k)', min: 1, max: 15 },
      { key: 'grounded', label: 'Prompt: answer only from passages, cite, say "I don\'t know"', type: 'toggle' }],
    s => {
      const r = M.rag(s), ICON = { right: '✓', wrong: '✗', partial: '◐', leak: '⚠' };
      return { metrics: { right: r.right, leaks: r.leaks, ctx: r.ctxTokens, topK: s.topK },
        html: stats([{ label: 'Answered well', value: `${r.right} of ${r.total}`, tone: r.right === r.total ? 'ok' : '' }, { label: 'Data leaks', value: String(r.leaks), tone: r.leaks ? 'bad' : 'ok' }, { label: 'Context per question', value: fmt(r.ctxTokens) + ' tokens', tone: r.ctxTokens > 6000 ? 'warn' : '' }, { label: 'Input cost / 1k questions', value: money(r.costPer1k) }])
          + `<table class="fs-table ai-rag"><thead><tr><th>Question</th><th>Stage</th><th>Answer</th></tr></thead><tbody>${r.rows.map(x => `<tr class="is-${x.answer}"><td>${esc(x.q)}${x.why ? `<small>${esc(x.why)}</small>` : ''}</td><td>${esc(x.stage)}</td><td>${ICON[x.answer]} ${esc(x.answer)}</td></tr>`).join('')}</tbody></table>
          <p class="sim-note">Every failure here belongs to one stage: ingestion (chunking, freshness), query understanding, retrieval, ranking, access control or generation. Diagnose a bad answer to its stage before touching the prompt.</p>` };
    }));

  // ---------- Evals: is the drop real? ----------
  reg('evalstats', (el, cfg, api) => simple(el, cfg, api, { n: 400, a: 86, b: 84, paired: true },
    [{ key: 'n', label: 'Eval set size', min: 50, max: 5000, step: 50, log: true }, { key: 'a', label: 'Current model: true accuracy', min: 60, max: 99, fmt: v => v + '%' },
      { key: 'b', label: 'Cheaper model: true accuracy', min: 60, max: 99, fmt: v => v + '%' }, { key: 'paired', label: 'Same cases for both (paired)', type: 'toggle' }],
    s => {
      const r = M.evalStats({ n: s.n, a: s.a / 100, b: s.b / 100, paired: s.paired, sims: 600 });
      const lo = -0.12, hi = 0.12, bins = new Array(24).fill(0);
      r.diffs.forEach(d => { const i = Math.floor((d - lo) / (hi - lo) * 24); if (i >= 0 && i < 24) bins[i]++; });
      return { metrics: { ci: r.ci, real: r.real ? 1 : 0, n: s.n, paired: s.paired ? 1 : 0, flipped: r.flipped },
        html: stats([{ label: 'True difference', value: `${s.b - s.a > 0 ? '+' : ''}${s.b - s.a} points` }, { label: '95% interval on a measured difference', value: `± ${(r.ci * 100).toFixed(1)} points`, tone: r.real ? 'ok' : 'warn' }, { label: 'Runs where the cheaper model looks as good or better', value: pc(r.flipped), tone: r.flipped > 0.05 && s.b < s.a ? 'bad' : '' }])
          + `<div class="ai-hist">${bins.map((b, i) => `<i style="height:${100 * b / Math.max(...bins)}%" class="${lo + (i + 0.5) * (hi - lo) / 24 >= 0 ? 'is-pos' : ''}"></i>`).join('')}</div><div class="ai-hist-axis"><span>−12 points</span><span>0</span><span>+12 points</span></div>
          <p class="sim-note">Each bar is how often a re-run of the eval would measure that difference. ${r.real ? 'At this size the difference is clearly bigger than the noise.' : 'At this size the noise is as big as the difference: you can\'t tell a 2-point drop from luck.'} Pairing (both models on the same cases) cancels the cases both get right or wrong, which is why it needs far fewer cases.</p>` };
    }));

  // ---------- A score threshold ----------
  reg('threshold', (el, cfg, api) => simple(el, cfg, api, { t: 0.5, base: 10, sep: 0.25 },
    [{ key: 't', label: 'Post a comment above confidence', min: 0.1, max: 0.95, step: 0.01, fmt: v => v.toFixed(2) }, { key: 'base', label: 'Candidates that are real issues', min: 2, max: 40, fmt: v => v + '%' },
      { key: 'sep', label: 'How well the scorer separates them', min: 0.05, max: 0.6, step: 0.05, fmt: v => v.toFixed(2) }],
    s => {
      const r = M.threshold({ t: s.t, base: s.base / 100, sep: s.sep }), max = Math.max(...r.hPos, ...r.hNeg);
      return { metrics: { precision: r.precision, recall: r.recall, perPr: r.perPr },
        html: stats([{ label: 'Precision (comments worth reading)', value: pc(r.precision), tone: r.precision >= 0.7 ? 'ok' : r.precision < 0.5 ? 'bad' : 'warn' }, { label: 'Recall (real issues caught)', value: pc(r.recall) }, { label: 'Comments per PR', value: r.perPr.toFixed(1) }, { label: 'Wrong comments per PR', value: r.falsePerPr.toFixed(1), tone: r.falsePerPr > 1 ? 'bad' : '' }])
          + `<div class="ai-hist is-two">${r.hNeg.map((n, i) => `<span class="${(i + 0.5) / 20 >= s.t ? 'is-over' : ''}"><i class="is-neg" style="height:${100 * n / max}%"></i><i class="is-pos" style="height:${100 * r.hPos[i] / max}%"></i></span>`).join('')}</div><div class="ai-hist-axis"><span>0</span><span>confidence →</span><span>1</span></div>
          <div class="fs-gantt-key"><span class="ai-k-neg">not a real issue</span><span class="ai-k-pos">real issue</span></div>
          <p class="sim-note">A reviewer bot that's wrong half the time gets muted, and then it catches nothing. When real issues are rare, even a small false-positive rate swamps them: favour precision, and measure it on historical PRs before launch.</p>` };
    }));

  // ---------- An agent loop ----------
  reg('agentloop', (el, cfg, api) => simple(el, cfg, api, { structure: 'agent', steps: 4, toolFail: 15, wander: 12, errorsAsInfo: true, maxSteps: 12, summarise: false },
    [{ key: 'structure', label: 'Structure', type: 'select', options: [['single', 'One model call'], ['workflow', 'A fixed workflow (code decides the steps)'], ['agent', 'An agent (the model decides)']] },
      { key: 'steps', label: 'Tool steps the task needs', min: 1, max: 10 }, { key: 'toolFail', label: 'Tool calls that fail', min: 0, max: 50, fmt: v => v + '%' },
      { key: 'wander', label: 'Agent steps that are wasted', min: 0, max: 50, fmt: v => v + '%' }, { key: 'errorsAsInfo', label: 'Return tool errors to the model', type: 'toggle' },
      { key: 'maxSteps', label: 'Step budget', min: 2, max: 40 }, { key: 'summarise', label: 'Summarise old steps (bounded context)', type: 'toggle' }],
    s => {
      const r = M.agent({ ...s, toolFail: s.toolFail / 100, wander: s.wander / 100, runs: 800 });
      return { metrics: { success: r.success, budget: r.budget, crashed: r.crashed, cost: r.cost, structure: s.structure },
        html: stats([{ label: 'Tasks done', value: pc(r.success), tone: r.success > 0.9 ? 'ok' : r.success < 0.6 ? 'bad' : 'warn' }, { label: 'Out of budget', value: pc(r.budget), tone: r.budget ? 'warn' : '' }, { label: 'Crashed on a tool error', value: pc(r.crashed), tone: r.crashed ? 'bad' : '' },
          { label: 'Steps per task', value: r.steps.toFixed(1) }, { label: 'Cost per task', value: money(r.cost) }, { label: 'p95 time', value: sec(r.p95) }])
          + `<p class="sim-note">${s.structure === 'single' ? 'One call is cheapest and fastest, but it can only do what a single response can.' : s.structure === 'workflow' ? 'A workflow is predictable and cheap: the code knows the steps, so there is nothing to wander. It fails when a step fails more often than its retries cover.' : 'An agent copes with surprises, but every step re-reads a growing context, so cost grows faster than steps. Budgets stop the runaway cases; returning errors as information lets it recover.'} Out of 800 runs.</p>` };
    }));

  // ---------- Serving on a GPU ----------
  reg('gpuserve', (el, cfg, api) => simple(el, cfg, api, { model: '8b', quant: 'fp16', gpus: 1, ctx: 2000, rps: 4, batching: 'continuous' },
    [{ key: 'model', label: 'Model', type: 'select', options: [['8b', '8B parameters'], ['70b', '70B parameters']] }, { key: 'quant', label: 'Weights in', type: 'select', options: [['fp16', 'FP16 (2 bytes)'], ['int8', 'INT8 (1 byte)'], ['int4', 'INT4 (½ byte)']] },
      { key: 'gpus', label: '80 GB GPUs', min: 1, max: 8 }, { key: 'ctx', label: 'Tokens per conversation (prompt + output)', min: 500, max: 32000, step: 500, log: true },
      { key: 'rps', label: 'Requests / s', min: 0.5, max: 60, step: 0.5 }, { key: 'batching', label: 'Batching', type: 'select', options: [['continuous', 'Continuous (vLLM-style)'], ['static', 'Static batches']] }],
    s => {
      const r = M.serve(s);
      if (!r.fits) return { metrics: { fits: 0 }, html: stats([{ label: 'Weights', value: Math.round(r.weights) + ' GB', tone: 'bad' }, { label: 'GPU memory', value: r.mem + ' GB' }]) + `<p class="sim-note">The weights alone don't fit. Quantise them, or shard the model across more GPUs (tensor parallelism).</p>` };
      return { metrics: { fits: 1, rho: r.rho, maxSeqs: r.maxSeqs, ttft: r.ttft, costPerM: r.costPerM },
        html: stats([{ label: 'Weights', value: Math.round(r.weights) + ' GB' }, { label: 'Conversations that fit (KV cache)', value: fmt(r.maxSeqs), tone: r.maxSeqs < 8 ? 'bad' : '' }, { label: 'Tokens / s per user', value: fmt(r.perSeqTps) }, { label: 'Load', value: isFinite(r.rho) ? pc(r.rho) : '∞', tone: r.rho >= 1 ? 'bad' : r.rho > 0.8 ? 'warn' : 'ok' },
          { label: 'Time to first token', value: sec(r.ttft), tone: r.ttft > 2 ? 'bad' : '' }, { label: 'Cost per 1M output tokens', value: money(r.costPerM) }])
          + bars([{ label: 'Weights', value: r.weights, text: Math.round(r.weights) + ' GB' }, { label: 'KV cache in use', value: r.batch * s.ctx * M.MODELS[s.model].kvMb / 1024, text: `${r.batch} × ${fmt(s.ctx)} tokens` }, { label: 'GPU memory', value: r.mem, text: r.mem + ' GB', cls: 'is-idle' }], r.mem)
          + `<p class="sim-note">Decoding is memory-bound: each step reads every weight once, whatever the batch, so batching many users is nearly free until the KV cache fills memory. Quantising shrinks the weights and leaves room for more conversations; long contexts eat it.</p>` };
    }));

  // ---------- MCP: the session and the attacks ----------
  reg('mcp', (el, cfg, api) => {
    const st = { view: 'wire', transport: 'stdio', registry: false, pin: false, fullDescriptions: false, confirmWrites: false, audience: false, sandbox: false, oneServerPerTask: false };
    let at = 0, maxStep = 0; const transports = new Set();
    const { ctl, out } = shell(el);
    const defs = () => [{ key: 'view', label: 'Show', type: 'select', options: [['wire', 'The protocol, message by message'], ['attacks', 'The attacks, and your defences']] },
      ...(st.view === 'wire' ? [{ key: 'transport', label: 'Transport', type: 'select', options: [['stdio', 'stdio (a local process)'], ['http', 'Streamable HTTP (remote, OAuth)']] }]
        : [{ key: 'registry', label: 'Only vetted servers from an internal registry, pinned', type: 'toggle' }, { key: 'pin', label: 'Pin approved tool definitions; re-ask on change', type: 'toggle' },
          { key: 'fullDescriptions', label: 'Show full tool descriptions on install', type: 'toggle' }, { key: 'confirmWrites', label: 'Human approval for write tools', type: 'toggle' },
          { key: 'audience', label: 'Remote servers check token audience; no passthrough', type: 'toggle' }, { key: 'sandbox', label: 'Run local servers in a container', type: 'toggle' },
          { key: 'oneServerPerTask', label: 'Connect only the servers a task needs', type: 'toggle' }])];
    const paintCtl = () => controls(ctl, defs(), st, k => { if (k === 'transport') { at = 0; } api.touched(); if (k === 'view') paintCtl(); paint(); });
    const paint = () => {
      let harms = null;
      if (st.view === 'wire') {
        const steps = M.mcpSession(st.transport);
        transports.add(st.transport); maxStep = Math.max(maxStep, at + 1);
        out.innerHTML = `<div class="ai-tool">${steps.slice(0, at + 1).map((x, i) => `<div class="ai-msg is-${x.dir === '→' ? 'app' : x.dir === '←' ? 'user' : x.dir === 'model' ? 'model' : 'api'}${i === at ? ' is-ok' : ''}"><b>${x.dir === '→' ? 'Client → server' : x.dir === '←' ? 'Server → client' : x.dir === 'model' ? 'Inside the host' : 'Connect'}</b>${x.http ? `<pre>${esc(x.http)}</pre>` : ''}<pre>${esc(typeof x.msg === 'string' ? x.msg : JSON.stringify(x.msg, null, 1))}</pre><p>${esc(x.note)}</p></div>`).join('')}</div>
          <div class="sim-actions"><button type="button" class="button is-primary" data-do="next" ${at >= steps.length - 1 ? 'disabled' : ''}>Next message (${at + 1}/${steps.length})</button><button type="button" class="button" data-do="all">Show all</button><button type="button" class="button" data-do="reset">From the start</button></div>`;
      } else {
        const r = M.mcpAttacks(st); harms = r.harms;
        out.innerHTML = stats([{ label: 'Attacks that did harm', value: `${r.harms} of ${r.rows.length}`, tone: r.harms ? 'bad' : 'ok' }])
          + r.rows.map(x => `<div class="fs-flow is-${x.blocked ? 'ok' : 'bad'}"><b>${esc(x.label)}</b><span>${x.blocked ? '✓ stopped' : '✗ ' + esc(x.harm)}</span>${x.blocked ? `<ol>${x.by.map(b => `<li>${esc(b)}</li>`).join('')}</ol>` : ''}</div>`).join('')
          + '<p class="sim-note">MCP itself checks none of this: it carries descriptions and results to the model faithfully, whoever wrote them. The defences live in the host (what can be installed, what changed, what needs approval) and in each server (audience checks, its own credentials).</p>';
      }
      api.metrics({ steps: maxStep, transports: transports.size, ...(harms != null ? { harms } : {}) });
    };
    on(el, act => { api.touched(); const n = M.mcpSession(st.transport).length; if (act === 'next') at = Math.min(n - 1, at + 1); if (act === 'all') at = n - 1; if (act === 'reset') at = 0; paint(); });
    paintCtl(); paint();
    return { destroy() {} };
  });

  // ---------- Prompt injection ----------
  reg('injection', (el, cfg, api) => simple(el, cfg, api, { classifier: false, sendTool: 'any', confirmSend: false, browse: 'any', images: 'any', deleteTool: true, confirmDelete: false, piiFilter: false, leastData: false },
    [{ key: 'classifier', label: 'Injection classifier on user input', type: 'toggle' },
      { key: 'sendTool', label: 'send_email tool', type: 'select', options: [['any', 'any address'], ['allowlist', 'allowlisted addresses only'], ['none', 'removed']] }, { key: 'confirmSend', label: 'A human confirms each send', type: 'toggle' },
      { key: 'browse', label: 'Browsing', type: 'select', options: [['any', 'any URL'], ['none', 'off']] }, { key: 'images', label: 'Images in answers', type: 'select', options: [['any', 'from any URL'], ['trusted', 'trusted domains only']] },
      { key: 'deleteTool', label: 'Agent has delete_files', type: 'toggle' }, { key: 'confirmDelete', label: 'Destructive calls need approval', type: 'toggle' },
      { key: 'piiFilter', label: 'Output filter for personal data', type: 'toggle' }, { key: 'leastData', label: "Scope data access to the user's own records", type: 'toggle' }],
    s => {
      const r = M.injection(s);
      return { metrics: { harms: r.harms, friction: r.friction },
        html: stats([{ label: 'Attacks that did harm', value: `${r.harms} of ${r.rows.length}`, tone: r.harms ? 'bad' : 'ok' }, { label: 'Friction added', value: ['none', 'a little', 'some', 'a lot', 'a lot'][r.friction] }])
          + r.rows.map(x => `<div class="fs-flow is-${x.blocked ? 'ok' : 'bad'}"><b>${esc(x.label)}</b><span>${x.blocked ? '✓ no harm' : '✗ ' + esc(x.harm)}</span>${x.blocked ? `<ol>${x.by.map(b => `<li>${esc(b)}</li>`).join('')}</ol>` : ''}</div>`).join('')
          + `<p class="sim-note">This sandbox assumes the model is fooled every time, because sometimes it will be. Classifiers and prompts only lower the odds; what stops harm is what the model is able to do: least privilege, allowlists, confirmation on anything irreversible, and no untrusted channel out.</p>` };
    }));
})();
