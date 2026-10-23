// Lesson blocks: authored Markdown plus interactive exercises, diagrams and timelines.
// Every authored string is escaped before formatting; nothing here trusts HTML.
(function () {
  'use strict';
  const esc = s => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const hash = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
  const shuffle = (items, seed) => {
    const out = items.slice(); let h = hash(seed);
    for (let i = out.length - 1; i > 0; i--) { h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; const j = h % (i + 1); [out[i], out[j]] = [out[j], out[i]]; }
    if (out.length > 1 && out.every((x, i) => x === items[i])) out.push(out.shift());
    return out;
  };

  // ---------- Markdown ----------
  function inline(text) {
    const codes = [];
    let s = esc(text).replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>');
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
  }
  const KEYWORDS = /\b(SELECT|FROM|WHERE|AND|OR|NOT|NULL|IS|IN|INSERT|INTO|VALUES|UPDATE|SET|DELETE|BEGIN|COMMIT|ROLLBACK|FOR|ORDER|BY|LIMIT|CREATE|TABLE|INDEX|UNIQUE|PRIMARY|KEY|ON|CONFLICT|DO|NOTHING|RETURNING|JOIN|GROUP|HAVING|AS|IF|ELSE|RETURN|WHILE|DEF|FUNCTION|CONST|LET|AWAIT|ASYNC|TRUE|FALSE|EXISTS|REFERENCES|DEFAULT|CHECK|SERIALIZABLE|ISOLATION|LEVEL|TRANSACTION|EXPLAIN|ANALYZE|GET|POST|PUT|PATCH|HTTP)\b/g;
  function highlight(code, lang) {
    let s = esc(code);
    if (/^(sql|python|js|text|http|pseudo)$/.test(lang)) {
      s = s.replace(/(--[^\n]*|#[^\n{]*$|\/\/[^\n]*)/gm, '<span class="tok-c">$1</span>')
        .replace(/('[^'\n]*'|&quot;[^\n]*?&quot;)/g, '<span class="tok-s">$1</span>');
      if (lang === 'sql' || lang === 'pseudo' || lang === 'http') s = s.replace(KEYWORDS, '<span class="tok-k">$1</span>');
    }
    return s;
  }
  function md(text) {
    const lines = String(text ?? '').replace(/\r/g, '').split('\n');
    const out = []; let i = 0;
    const para = [];
    const flush = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para.length = 0; } };
    while (i < lines.length) {
      const line = lines[i];
      const fence = line.match(/^```(\w*)\s*$/);
      if (fence) {
        flush(); const body = []; i++;
        while (i < lines.length && !/^```\s*$/.test(lines[i])) body.push(lines[i++]);
        i++;
        out.push(`<pre class="sd-code" data-lang="${esc(fence[1])}"><code>${highlight(body.join('\n'), fence[1])}</code></pre>`);
        continue;
      }
      const h = line.match(/^(#{2,4})\s+(.*)$/);
      if (h) { flush(); const tag = h[1].length === 2 ? 'h3' : 'h4'; out.push(`<${tag} id="sd-h-${slug(h[2])}" class="sd-md-h">${inline(h[2])}</${tag}>`); i++; continue; }
      if (/^---+\s*$/.test(line)) { flush(); out.push('<hr>'); i++; continue; }
      if (/^\|/.test(line)) {
        flush(); const rows = [];
        while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
        const cells = r => r.replace(/^\||\|\s*$/g, '').split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));
        const head = cells(rows[0]); const body = rows.slice(/^\|[\s:|-]+\|?\s*$/.test(rows[1] || '') ? 2 : 1);
        out.push(`<div class="sd-scroll"><table class="sd-md-table"><thead><tr>${head.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map(r => `<tr>${cells(r).map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
        continue;
      }
      if (/^>\s?/.test(line)) {
        flush(); const body = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) body.push(lines[i++].replace(/^>\s?/, ''));
        const tag = body[0].match(/^\[!(\w+)\]\s*(.*)$/);
        const kind = tag ? tag[1] : 'note', title = tag ? tag[2] : '';
        if (tag) body.shift();
        out.push(`<aside class="sd-callout is-${esc(kind)}">${title ? `<b class="sd-callout-title">${inline(title)}</b>` : ''}${md(body.join('\n'))}</aside>`);
        continue;
      }
      const li = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
      if (li) {
        flush(); const ordered = /\d/.test(li[2]); const items = [];
        while (i < lines.length) {
          const m = lines[i].match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
          if (m && m[1].length < 2) { items.push(m[3]); i++; continue; }
          if (items.length && /^\s{2,}\S/.test(lines[i])) { items[items.length - 1] += ' ' + lines[i].trim(); i++; continue; }
          break;
        }
        out.push(`<${ordered ? 'ol' : 'ul'}>${items.map(t => `<li>${inline(t)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`);
        continue;
      }
      if (!line.trim()) { flush(); i++; continue; }
      para.push(line.trim()); i++;
    }
    flush();
    return out.join('');
  }

  // ---------- Shared pieces ----------
  const KICKER = { predict: 'Predict first', timeline: 'Step through it', sim: 'Experiment', sort: 'Sort it out', order: 'Put it in order',
    calc: 'Estimate', bug: 'Spot the bug', faded: 'Fill the gaps', recall: 'Explain it yourself', incident: 'On-call drill', arch: 'Architecture', interview: 'In the interview' };
  const button = (text, act, extra = '', primary = false) => `<button type="button" class="button ${primary ? 'is-primary' : ''}" data-b="${act}" ${extra}>${esc(text)}</button>`;
  const doneTag = '<span class="sd-block-done" hidden>✓ Done</span>';
  function frame(b, inner, title) {
    return `<section class="sd-block sd-block-${b.type}" data-block="${b.key}"><header class="sd-block-head"><span class="sd-kicker">${KICKER[b.type]}</span>${title ? `<h4>${inline(title)}</h4>` : ''}${doneTag}</header>${inner}</section>`;
  }
  const verdictOf = ok => ok ? '<b class="sd-ok">Correct.</b> ' : '<b class="sd-bad">Not quite.</b> ';
  const fmtNum = n => Math.abs(n) >= 100 ? Math.round(n).toLocaleString() : String(Math.round(n * 100) / 100);

  const R = {}, W = {};

  // ---------- Predict ----------
  R.predict = b => frame(b, `<div class="sd-prompt">${md(b.prompt)}</div><div class="sd-predict-choices">${b.choices.map((c, i) => `<button type="button" class="sd-option" data-b="pick" data-i="${i}"><span class="sd-option-key">${String.fromCharCode(65 + i)}</span><span>${inline(c)}</span></button>`).join('')}</div><div class="sd-reveal" hidden></div>`, b.title);
  W.predict = (el, b, ctx) => {
    el.querySelectorAll('[data-b=pick]').forEach(n => n.addEventListener('click', () => {
      const i = Number(n.dataset.i), ok = i === b.answer;
      el.querySelectorAll('[data-b=pick]').forEach(o => { o.disabled = true; o.classList.toggle('is-right', Number(o.dataset.i) === b.answer); o.classList.toggle('is-wrong', o === n && !ok); });
      const r = el.querySelector('.sd-reveal'); r.hidden = false;
      r.innerHTML = (ok ? '<b class="sd-ok">You called it.</b>' : '<b class="sd-bad">Most people miss this one.</b>') + md(b.reveal);
      ctx.done(b, ok);
    }));
  };

  // ---------- Sort into buckets ----------
  R.sort = b => {
    const items = shuffle(b.items.map((it, i) => ({ ...it, i })), b.key + b.prompt);
    return frame(b, `<div class="sd-prompt">${md(b.prompt)}</div><div class="sd-sort">${items.map(it => `<div class="sd-sort-item" data-i="${it.i}"><span class="sd-sort-text">${inline(it.text)}</span><span class="sd-seg">${b.buckets.map((name, k) => `<button type="button" data-b="bucket" data-k="${k}">${inline(name)}</button>`).join('')}</span><div class="sd-sort-why" hidden></div></div>`).join('')}</div><div class="sd-actions">${button('Check', 'check', '', true)}</div><div class="sd-reveal" hidden></div>`, b.title);
  };
  W.sort = (el, b, ctx) => {
    const picks = {};
    el.querySelectorAll('.sd-sort-item').forEach(row => row.querySelectorAll('[data-b=bucket]').forEach(n => n.addEventListener('click', () => {
      if (el.dataset.checked) return;
      picks[row.dataset.i] = Number(n.dataset.k);
      row.querySelectorAll('[data-b=bucket]').forEach(o => o.classList.toggle('is-on', o === n));
    })));
    el.querySelector('[data-b=check]').addEventListener('click', () => {
      if (Object.keys(picks).length < b.items.length) { const r = el.querySelector('.sd-reveal'); r.hidden = false; r.innerHTML = '<p class="sd-muted">Place every item first.</p>'; return; }
      el.dataset.checked = '1'; let right = 0;
      el.querySelectorAll('.sd-sort-item').forEach(row => {
        const it = b.items[row.dataset.i], ok = picks[row.dataset.i] === it.bucket; right += ok;
        row.classList.add(ok ? 'is-right' : 'is-wrong');
        row.querySelectorAll('[data-b=bucket]').forEach(o => { o.disabled = true; o.classList.toggle('is-answer', Number(o.dataset.k) === it.bucket); });
        if (it.why) { const w = row.querySelector('.sd-sort-why'); w.hidden = false; w.innerHTML = inline(it.why); }
      });
      el.querySelector('[data-b=check]').disabled = true;
      const r = el.querySelector('.sd-reveal'); r.hidden = false;
      r.innerHTML = `<p><b class="${right === b.items.length ? 'sd-ok' : 'sd-bad'}">${right} of ${b.items.length} placed correctly.</b></p>${b.explain ? md(b.explain) : ''}`;
      ctx.done(b, right === b.items.length);
    });
  };

  // ---------- Ordering ----------
  R.order = b => {
    const items = shuffle(b.items.map((t, i) => ({ t, i })), b.key + b.prompt);
    return frame(b, `<div class="sd-prompt">${md(b.prompt)}</div><ol class="sd-order">${items.map(it => `<li draggable="true" data-i="${it.i}"><span class="sd-grip">⋮⋮</span><span class="sd-order-text">${inline(it.t)}</span><span class="sd-order-moves"><button type="button" data-b="up" aria-label="Move up">↑</button><button type="button" data-b="down" aria-label="Move down">↓</button></span></li>`).join('')}</ol><div class="sd-actions">${button('Check order', 'check', '', true)}${button('Show answer', 'show')}</div><div class="sd-reveal" hidden></div>`, b.title);
  };
  W.order = (el, b, ctx) => {
    const list = el.querySelector('.sd-order'); let tries = 0, dragged = null;
    list.addEventListener('click', e => {
      const btn = e.target.closest('button'); if (!btn || el.dataset.locked) return;
      const li = btn.closest('li');
      if (btn.dataset.b === 'up' && li.previousElementSibling) list.insertBefore(li, li.previousElementSibling);
      if (btn.dataset.b === 'down' && li.nextElementSibling) list.insertBefore(li.nextElementSibling, li);
      list.querySelectorAll('li').forEach(n => n.classList.remove('is-right', 'is-wrong'));
    });
    list.addEventListener('dragstart', e => { dragged = e.target.closest('li'); dragged?.classList.add('is-drag'); });
    list.addEventListener('dragend', () => { dragged?.classList.remove('is-drag'); dragged = null; });
    list.addEventListener('dragover', e => {
      e.preventDefault(); if (!dragged || el.dataset.locked) return;
      const over = e.target.closest('li'); if (!over || over === dragged) return;
      const r = over.getBoundingClientRect();
      list.insertBefore(dragged, e.clientY > r.top + r.height / 2 ? over.nextSibling : over);
    });
    const finish = (ok, shown) => {
      el.dataset.locked = '1'; el.querySelectorAll('[data-b=check],[data-b=show],.sd-order button').forEach(n => { n.disabled = true; });
      const r = el.querySelector('.sd-reveal'); r.hidden = false;
      r.innerHTML = (shown ? '<p><b>Correct order shown.</b></p>' : verdictOf(ok)) + (b.explain ? md(b.explain) : '');
      ctx.done(b, ok && tries === 1);
    };
    el.querySelector('[data-b=check]').addEventListener('click', () => {
      tries++; const rows = [...list.querySelectorAll('li')]; let ok = true;
      rows.forEach((li, pos) => { const good = Number(li.dataset.i) === pos; ok = ok && good; li.classList.toggle('is-right', good); li.classList.toggle('is-wrong', !good); });
      if (ok) return finish(true);
      const r = el.querySelector('.sd-reveal'); r.hidden = false;
      r.innerHTML = `<p><b class="sd-bad">${rows.filter((li, p) => Number(li.dataset.i) === p).length} of ${rows.length} in the right place.</b> Rearrange and check again, or show the answer.</p>`;
    });
    el.querySelector('[data-b=show]').addEventListener('click', () => {
      [...list.querySelectorAll('li')].sort((a, c) => a.dataset.i - c.dataset.i).forEach(li => { list.appendChild(li); li.classList.remove('is-wrong'); li.classList.add('is-right'); });
      finish(false, true);
    });
  };

  // ---------- Estimation ----------
  R.calc = b => frame(b, `<div class="sd-prompt">${md(b.prompt)}</div>${b.given ? `<div class="sd-given">${md(b.given)}</div>` : ''}<div class="sd-calc-row"><input class="input sd-calc-input" type="text" inputmode="decimal" placeholder="Your estimate" aria-label="Your estimate"><span class="sd-unit">${esc(b.unit)}</span>${button('Check', 'check', '', true)}${b.hint ? button('Hint', 'hint') : ''}</div><div class="sd-hint" hidden>${b.hint ? md(b.hint) : ''}</div><div class="sd-reveal" hidden></div>`, b.title);
  W.calc = (el, b, ctx) => {
    const input = el.querySelector('input'), factor = b.tolerance || 1.5;
    el.querySelector('[data-b=hint]')?.addEventListener('click', () => { el.querySelector('.sd-hint').hidden = false; });
    const check = () => {
      const v = Number(String(input.value).replace(/[, _]/g, '').replace(/k$/i, 'e3').replace(/m$/i, 'e6').replace(/b$/i, 'e9'));
      if (!isFinite(v) || v <= 0) { input.focus(); return; }
      const ratio = v / b.answer, ok = ratio <= factor && ratio >= 1 / factor;
      const off = ratio >= 1 ? ratio : 1 / ratio;
      const r = el.querySelector('.sd-reveal'); r.hidden = false;
      r.innerHTML = `<p>${ok ? '<b class="sd-ok">Within range.</b>' : `<b class="sd-bad">Off by about ${fmtNum(off)}×.</b>`} Reference answer: <b>${fmtNum(b.answer)} ${esc(b.unit)}</b>${off < 1.05 ? '' : ` (accepted range ${fmtNum(b.answer / factor)}–${fmtNum(b.answer * factor)})`}.</p><div class="sd-steps">${md(b.steps)}</div>`;
      input.disabled = true; el.querySelector('[data-b=check]').disabled = true;
      ctx.done(b, ok);
    };
    el.querySelector('[data-b=check]').addEventListener('click', check);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') check(); });
  };

  // ---------- Spot the bug ----------
  R.bug = b => {
    const lines = b.code.replace(/\n$/, '').split('\n');
    return frame(b, `<div class="sd-prompt">${md(b.prompt)}</div><pre class="sd-code sd-bug-code" data-lang="${esc(b.lang || '')}">${lines.map((l, i) => `<button type="button" class="sd-bug-line" data-line="${i + 1}"><span class="sd-ln">${i + 1}</span><code>${highlight(l, b.lang || 'text') || ' '}</code></button>`).join('')}</pre><div class="sd-actions">${button('Check', 'check', '', true)}<span class="sd-muted">Click every line that is wrong (${b.bug.length === 1 ? 'one line' : b.bug.length + ' lines'}).</span></div><div class="sd-reveal" hidden></div>`, b.title);
  };
  W.bug = (el, b, ctx) => {
    el.querySelectorAll('.sd-bug-line').forEach(n => n.addEventListener('click', () => { if (!el.dataset.locked) n.classList.toggle('is-picked'); }));
    el.querySelector('[data-b=check]').addEventListener('click', () => {
      const picked = [...el.querySelectorAll('.sd-bug-line.is-picked')].map(n => Number(n.dataset.line));
      if (!picked.length) return;
      el.dataset.locked = '1';
      const ok = picked.length === b.bug.length && picked.every(p => b.bug.includes(p));
      el.querySelectorAll('.sd-bug-line').forEach(n => { const ln = Number(n.dataset.line); n.classList.toggle('is-bug', b.bug.includes(ln)); n.classList.toggle('is-wrong', !b.bug.includes(ln) && n.classList.contains('is-picked')); n.disabled = true; });
      el.querySelector('[data-b=check]').disabled = true;
      const r = el.querySelector('.sd-reveal'); r.hidden = false; r.innerHTML = verdictOf(ok) + md(b.explain) + (b.fix ? `<p class="sd-muted">A fix:</p><pre class="sd-code" data-lang="${esc(b.lang || '')}"><code>${highlight(b.fix.replace(/\n$/, ''), b.lang || 'text')}</code></pre>` : '');
      ctx.done(b, ok);
    });
  };

  // ---------- Faded worked example ----------
  function blanks(text, key) {
    let n = 0;
    const tokens = [];
    const marked = String(text).replace(/\[\[(.+?)\]\]/g, (_, body) => { tokens.push(body); return `@@BLANK${n++}@@`; });
    let html = md(marked);
    tokens.forEach((body, i) => {
      let field;
      if (body.startsWith('#')) field = `<input class="sd-blank sd-blank-num" data-blank="${i}" data-answer="${esc(body.slice(1))}" inputmode="decimal" size="7" aria-label="Blank ${i + 1}">`;
      else {
        const opts = body.split('|').map(s => s.trim());
        field = `<select class="sd-blank" data-blank="${i}" data-answer="${esc(opts[0])}" aria-label="Blank ${i + 1}"><option value="">…</option>${shuffle(opts, key + i).map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}</select>`;
      }
      html = html.replace(`@@BLANK${i}@@`, field);
    });
    return html;
  }
  R.faded = b => frame(b, `<div class="sd-prompt">${md(b.prompt)}</div><div class="sd-faded">${blanks(b.text, b.key)}</div><div class="sd-actions">${button('Check', 'check', '', true)}</div><div class="sd-reveal" hidden></div>`, b.title);
  W.faded = (el, b, ctx) => {
    let tries = 0;
    el.querySelector('[data-b=check]').addEventListener('click', () => {
      tries++; let right = 0; const fields = [...el.querySelectorAll('.sd-blank')];
      fields.forEach(f => {
        const a = f.dataset.answer, v = f.value.trim();
        const ok = f.tagName === 'INPUT' ? Math.abs(Number(v.replace(/,/g, '')) - Number(a)) <= Math.abs(Number(a)) * 0.05 + 1e-9 : v === a;
        right += ok; f.classList.toggle('is-right', ok); f.classList.toggle('is-wrong', !ok);
      });
      const r = el.querySelector('.sd-reveal'); r.hidden = false;
      if (right === fields.length || tries >= 2) {
        fields.forEach(f => { if (f.classList.contains('is-wrong')) { f.value = f.dataset.answer; f.classList.add('is-shown'); } f.disabled = true; });
        el.querySelector('[data-b=check]').disabled = true;
        r.innerHTML = `<p>${right === fields.length ? '<b class="sd-ok">All blanks correct.</b>' : `<b class="sd-bad">${right} of ${fields.length} correct.</b> The answers are now filled in.`}</p>${b.explain ? md(b.explain) : ''}`;
        ctx.done(b, right === fields.length && tries === 1);
      } else r.innerHTML = `<p><b class="sd-bad">${right} of ${fields.length} correct.</b> Fix the highlighted blanks and check again.</p>`;
    });
  };

  // ---------- Free recall ----------
  R.recall = b => frame(b, `<div class="sd-prompt">${md(b.prompt)}</div><textarea class="textarea sd-recall-text" rows="5" maxlength="3000" placeholder="Write it as you would say it in an interview. Two to five sentences."></textarea><div class="sd-actions">${button('Check my answer', 'check', '', true)}<span class="sd-muted">Write before you look: retrieval is what makes it stick.</span></div><div class="sd-reveal" hidden></div>`, b.title);
  W.recall = (el, b, ctx) => {
    const area = el.querySelector('textarea'), r = el.querySelector('.sd-reveal');
    const status = { covered: ['✓', 'is-right'], partial: ['◐', 'is-partial'], missing: ['○', 'is-missing'], incorrect: ['✗', 'is-wrong'] };
    el.querySelector('[data-b=check]').addEventListener('click', async () => {
      const text = area.value.trim(); if (text.length < 15) { area.focus(); return; }
      const btn = el.querySelector('[data-b=check]'); btn.disabled = true; area.disabled = true; btn.textContent = 'Checking…';
      let res = null;
      try { res = await ctx.recall(b, text); } catch (e) { res = { message: 'Saved locally only: ' + e.message }; }
      btn.textContent = 'Checked'; r.hidden = false;
      const model = `<details class="sd-model" ${res?.grade ? '' : 'open'}><summary>Model answer</summary>${md(b.model)}</details>`;
      if (res?.grade) {
        const g = res.grade, score = g.points.filter(p => p.status === 'covered').length + g.points.filter(p => p.status === 'partial').length / 2;
        r.innerHTML = `<ul class="sd-rubric">${g.points.map(p => `<li class="${status[p.status][1]}"><span>${status[p.status][0]}</span><div><b>${inline(p.point)}</b><p>${inline(p.note)}</p></div></li>`).join('')}</ul><p>${inline(g.feedback)}</p>${model}`;
        ctx.done(b, score / g.points.length >= 0.75);
      } else {
        r.innerHTML = `${res?.message ? `<p class="sd-muted">${esc(res.message)}</p>` : ''}${model}<p><b>Tick the points your answer covered:</b></p><ul class="sd-rubric is-self">${b.points.map((p, i) => `<li><label><input type="checkbox" data-point="${i}"> ${inline(p)}</label></li>`).join('')}</ul><div class="sd-actions">${button('Record self-check', 'self', '', true)}</div>`;
        r.querySelector('[data-b=self]').addEventListener('click', e => {
          const n = r.querySelectorAll('[data-point]:checked').length; e.target.disabled = true;
          r.querySelectorAll('[data-point]').forEach(c => { c.disabled = true; });
          e.target.insertAdjacentHTML('afterend', `<span class="sd-muted"> ${n} of ${b.points.length} covered${n < b.points.length ? ' — reread the gaps above before moving on.' : '.'}</span>`);
          ctx.done(b, n / b.points.length >= 0.75);
        });
      }
    });
  };

  // ---------- Incident drill ----------
  R.incident = b => frame(b, `${b.intro ? `<div class="sd-prompt">${md(b.intro)}</div>` : ''}<ol class="sd-incident-log"></ol><div class="sd-incident-now"></div>`, b.title);
  W.incident = (el, b, ctx) => {
    const log = el.querySelector('.sd-incident-log'), now = el.querySelector('.sd-incident-now');
    let path = [], good = 0, bad = 0;
    const show = key => {
      const node = b.nodes[key];
      if (!node.options?.length) {
        const best = node.verdict === 'good';
        now.innerHTML = `<div class="sd-incident-card is-end ${best ? 'is-good' : 'is-poor'}">${md(node.text)}<p><b>${best ? 'Resolved well.' : node.verdict === 'ok' ? 'Resolved, but not the best path.' : 'This made things worse.'}</b> ${good} strong decision${good === 1 ? '' : 's'}, ${bad} costly one${bad === 1 ? '' : 's'}.</p>${b.debrief ? `<div class="sd-debrief"><b>Debrief</b>${md(b.debrief)}</div>` : ''}<div class="sd-actions">${button('Run the drill again', 'restart')}</div></div>`;
        now.querySelector('[data-b=restart]').addEventListener('click', () => { path = []; good = bad = 0; log.innerHTML = ''; show(b.start); });
        ctx.done(b, best && bad === 0);
        return;
      }
      now.innerHTML = `<div class="sd-incident-card">${md(node.text)}<div class="sd-incident-options">${node.options.map((o, i) => `<button type="button" class="sd-option" data-i="${i}"><span class="sd-option-key">${i + 1}</span><span>${inline(o.label)}</span></button>`).join('')}</div></div>`;
      now.querySelectorAll('[data-i]').forEach(n => n.addEventListener('click', () => {
        const o = node.options[Number(n.dataset.i)];
        o.quality === 'good' ? good++ : o.quality === 'bad' && bad++;
        path.push(key);
        log.insertAdjacentHTML('beforeend', `<li class="is-${o.quality || 'ok'}"><b>${inline(o.label)}</b>${o.note ? `<p>${inline(o.note)}</p>` : ''}</li>`);
        show(o.next);
      }));
    };
    show(b.start);
  };

  // ---------- Architecture diagram ----------
  const KIND_ICON = {
    client: '<rect x="-9" y="-7" width="18" height="12" rx="2"/><path d="M-5 9h10"/>',
    service: '<rect x="-9" y="-8" width="18" height="16" rx="3"/><path d="M-5 -3h10M-5 1h10M-5 5h6"/>',
    db: '<ellipse cx="0" cy="-6" rx="9" ry="3"/><path d="M-9 -6v12c0 1.7 4 3 9 3s9-1.3 9-3V-6"/><path d="M-9 0c0 1.7 4 3 9 3s9-1.3 9-3"/>',
    cache: '<path d="M-2 -9 L-7 1 h6 l-2 8 L7 -2 h-6 l2 -7z"/>',
    queue: '<rect x="-10" y="-6" width="20" height="12" rx="2"/><path d="M-4 -6v12M2 -6v12"/>',
    lb: '<circle cx="0" cy="0" r="8"/><path d="M-8 0h16M0 -8v16"/>',
    cdn: '<circle cx="0" cy="0" r="8"/><path d="M-8 0h16M0-8c3 3 3 13 0 16M0-8c-3 3-3 13 0 16"/>',
    storage: '<path d="M-9 -7h18v14h-18z"/><path d="M-9 -2h18M-9 3h18"/>',
    worker: '<circle cx="0" cy="0" r="4"/><path d="M0-9v3M0 6v3M-9 0h3M6 0h3M-6-6l2 2M4 4l2 2M-6 6l2-2M4-4l2-2"/>',
    external: '<path d="M-8 -8h10v4M-8 -8v16h16v-10"/><path d="M0 0l8-8M3 -8h5v5"/>',
    stream: '<path d="M-10 -5h20M-10 0h20M-10 5h20"/>',
  };
  R.arch = b => {
    const nodes = b.nodes, W_ = 230, H_ = 96;
    const cols = Math.max(...nodes.map(n => n.x)) + 1, rows = Math.max(...nodes.map(n => n.y)) + 1;
    const pos = n => ({ x: 20 + n.x * W_ + 64, y: 16 + n.y * H_ + 26 });
    const by = Object.fromEntries(nodes.map(n => [n.id, n]));
    const edges = b.edges.map(([a, c, label], i) => {
      const p = pos(by[a]), q = pos(by[c]);
      const dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy) || 1;
      const ox = dx / len, oy = dy / len;
      const cut = (u, v) => Math.min(64 / Math.abs(u || 1e-9), 26 / Math.abs(v || 1e-9));
      const s = cut(ox, oy);
      const x1 = p.x + ox * s, y1 = p.y + oy * s, x2 = q.x - ox * (s + 4), y2 = q.y - oy * (s + 4);
      return `<g class="sd-arch-edge" data-edge="${esc(a)}>${esc(c)}"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" marker-end="url(#sd-arrow-${b.key})"/>${label ? `<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 5}" text-anchor="middle">${esc(label)}</text>` : ''}</g>`;
    }).join('');
    const boxes = nodes.map(n => {
      const p = pos(n), hidden = b.missing === n.id;
      return `<g class="sd-arch-node is-${esc(n.kind || 'service')} ${hidden ? 'is-missing' : ''}" data-node="${esc(n.id)}" transform="translate(${p.x},${p.y})"><rect x="-64" y="-26" width="128" height="52" rx="8"/><g class="sd-arch-icon" transform="translate(-44,0)">${hidden ? '<text x="0" y="5" text-anchor="middle" class="sd-arch-q">?</text>' : KIND_ICON[n.kind || 'service'] || KIND_ICON.service}</g><text class="sd-arch-label" x="-28" y="${n.note ? -2 : 4}">${hidden ? 'Missing piece' : esc(n.label)}</text>${n.note && !hidden ? `<text class="sd-arch-note" x="-28" y="12">${esc(n.note)}</text>` : ''}</g>`;
    }).join('');
    const svg = `<div class="sd-arch-wrap"><svg class="sd-arch" style="max-width:${(cols * W_ + 40) * 1.1}px" viewBox="0 0 ${cols * W_ + 40} ${rows * H_ + 20}" role="img" aria-label="${esc(b.title || 'Architecture diagram')}"><defs><marker id="sd-arrow-${b.key}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z"/></marker></defs>${edges}${boxes}</svg></div>`;
    const paths = b.paths ? `<div class="sd-arch-paths">${b.paths.map((p, i) => button('▶ ' + p.label, 'path', `data-i="${i}"`)).join('')}</div><div class="sd-arch-caption" aria-live="polite"></div>` : '';
    const quiz = b.missing ? `<div class="sd-prompt">${md(b.prompt || 'Which component belongs in the missing box?')}</div><div class="sd-predict-choices">${b.choices.map((c, i) => `<button type="button" class="sd-option" data-b="pick" data-i="${i}"><span class="sd-option-key">${String.fromCharCode(65 + i)}</span><span>${inline(c)}</span></button>`).join('')}</div><div class="sd-reveal" hidden></div>` : '';
    return frame(b, `${b.caption ? `<div class="sd-prompt">${md(b.caption)}</div>` : ''}${svg}${paths}${quiz}`, b.title);
  };
  W.arch = (el, b, ctx) => {
    let timer = null;
    el.querySelectorAll('[data-b=path]').forEach(n => n.addEventListener('click', () => {
      clearInterval(timer);
      const path = b.paths[Number(n.dataset.i)], cap = el.querySelector('.sd-arch-caption');
      el.querySelectorAll('.sd-arch-edge').forEach(e => e.classList.remove('is-lit', 'is-past'));
      let i = 0;
      const step = () => {
        if (!el.isConnected || i >= path.steps.length) { clearInterval(timer); if (i >= path.steps.length) ctx.done(b, null); return; }
        el.querySelectorAll('.sd-arch-edge.is-lit').forEach(e => { e.classList.remove('is-lit'); e.classList.add('is-past'); });
        const [a, c, note] = path.steps[i];
        (el.querySelector(`[data-edge="${CSS.escape(a + '>' + c)}"]`) || el.querySelector(`[data-edge="${CSS.escape(c + '>' + a)}"]`))?.classList.add('is-lit');
        cap.innerHTML = `<span class="sd-step-n">${i + 1}/${path.steps.length}</span> ${inline(note || '')}`;
        i++;
      };
      step(); timer = setInterval(step, b.speed || 1900);
    }));
    el.querySelectorAll('[data-b=pick]').forEach(n => n.addEventListener('click', () => {
      const i = Number(n.dataset.i), ok = i === b.answer;
      el.querySelectorAll('[data-b=pick]').forEach(o => { o.disabled = true; o.classList.toggle('is-right', Number(o.dataset.i) === b.answer); o.classList.toggle('is-wrong', o === n && !ok); });
      const node = el.querySelector('.sd-arch-node.is-missing');
      const real = b.nodes.find(x => x.id === b.missing);
      node.classList.remove('is-missing'); node.querySelector('.sd-arch-label').textContent = real.label;
      node.querySelector('.sd-arch-icon').innerHTML = KIND_ICON[real.kind || 'service'];
      const r = el.querySelector('.sd-reveal'); r.hidden = false; r.innerHTML = verdictOf(ok) + md(b.explain || '');
      ctx.done(b, ok);
    }));
  };

  // ---------- Interview card ----------
  R.interview = b => frame(b, `<div class="sd-say"><span class="sd-say-label">Say it in 30 seconds</span>${md(b.say)}</div><div class="sd-followups"><b>Follow-ups interviewers ask</b>${b.followups.map(f => `<details><summary>${inline(f.q)}</summary>${md(f.a)}</details>`).join('')}</div><div class="sd-weak-strong"><div class="is-weak"><span>Weak answer</span>${md(b.weak)}</div><div class="is-strong"><span>Strong answer</span><div class="sd-strong-body" hidden>${md(b.strong)}</div><button type="button" class="button" data-b="strong">Think of your version, then reveal</button></div></div>`, b.title);
  W.interview = (el, b, ctx) => {
    el.querySelector('[data-b=strong]').addEventListener('click', e => { el.querySelector('.sd-strong-body').hidden = false; e.target.remove(); ctx.done(b, null); });
  };

  // ---------- Timeline with crash injection ----------
  R.timeline = b => {
    const lanes = b.lanes, n = lanes.length;
    const head = `<div class="sd-tl-lanes" style="--lanes:${n}">${lanes.map(l => `<span>${esc(l)}</span>`).join('')}</div>`;
    const rows = b.steps.map((s, i) => {
      const from = lanes.indexOf(s.lane), to = lanes.indexOf(s.to || s.lane);
      const lo = Math.min(from, to), hi = Math.max(from, to);
      const crash = (b.crashes || []).find(c => c.after === i);
      return `<li class="sd-tl-step" data-i="${i}" style="--lanes:${n}"><span class="sd-tl-n">${i + 1}</span><div class="sd-tl-track">${lanes.map((_, k) => `<i class="sd-tl-life" style="grid-column:${k + 1}"></i>`).join('')}${from !== to ? `<span class="sd-tl-arrow ${to < from ? 'is-left' : ''}" style="grid-column:${lo + 1}/${hi + 2};margin:0 calc(50% / ${hi - lo + 1})"></span>` : ''}<span class="sd-tl-dot" style="grid-column:${from + 1}"></span><span class="sd-tl-text" style="grid-column:${from === to ? from + 1 : lo + 1}/${from === to ? 'span 1' : hi + 2}">${inline(s.text)}</span></div>${s.note ? `<p class="sd-tl-note">${inline(s.note)}</p>` : ''}</li>${crash ? `<li class="sd-tl-crash" data-after="${i}" hidden><button type="button" data-b="crash" data-after="${i}">💥 Crash here${crash.label ? ': ' + esc(crash.label) : ''}</button></li>` : ''}`;
    }).join('');
    const state = b.state ? `<div class="sd-tl-state"><b>State</b><dl>${Object.keys(b.state).map(k => `<div data-k="${esc(k)}"><dt>${esc(k)}</dt><dd></dd></div>`).join('')}</dl></div>` : '';
    const controls = `<div class="sd-actions sd-tl-controls">${button('Next step →', 'next', '', true)}${button('Play', 'play')}${button('Show all', 'all')}${button('Reset', 'reset')}<span class="sd-tl-pos sd-muted"></span></div>`;
    const tasks = `${b.crashes ? `<p class="sd-tl-task" hidden>Now inject failures. Each 💥 marks a moment a process could die. Predict the outcome, then click it.</p>` : ''}${b.find ? `<div class="sd-tl-find" hidden><p class="sd-tl-task"><b>Find it:</b> ${inline(b.find.prompt)}</p></div>` : ''}<div class="sd-reveal" hidden></div>`;
    return frame(b, `${b.intro ? `<div class="sd-prompt">${md(b.intro)}</div>` : ''}<div class="sd-tl-wrap"><div class="sd-tl-main">${head}<ol class="sd-tl">${rows}</ol></div>${state}</div>${controls}${tasks}`, b.title);
  };
  W.timeline = (el, b, ctx) => {
    let at = -1, timer = null, explored = new Set(), found = false;
    const steps = [...el.querySelectorAll('.sd-tl-step')];
    const stateAt = i => { const s = { ...(b.state || {}) }; for (let k = 0; k <= i; k++) Object.assign(s, b.steps[k].set || {}); return s; };
    const paintState = (i, flash) => {
      if (!b.state) return;
      const before = stateAt(i - 1), now = stateAt(i);
      el.querySelectorAll('.sd-tl-state [data-k]').forEach(d => {
        const k = d.dataset.k; d.querySelector('dd').innerHTML = inline(now[k]);
        d.classList.toggle('is-changed', flash && before[k] !== now[k]);
      });
    };
    const finished = () => at >= steps.length - 1;
    const paint = () => {
      steps.forEach((s, i) => { s.classList.toggle('is-shown', i <= at); s.classList.toggle('is-current', i === at); });
      paintState(at, true);
      el.querySelector('.sd-tl-pos').textContent = at < 0 ? `${steps.length} steps` : `Step ${at + 1} of ${steps.length}`;
      el.querySelector('[data-b=next]').disabled = finished();
      if (finished()) {
        el.querySelectorAll('.sd-tl-crash').forEach(c => { c.hidden = false; });
        el.querySelectorAll('.sd-tl-task').forEach(t => { t.hidden = false; });
        const f = el.querySelector('.sd-tl-find'); if (f) f.hidden = false;
        if (b.find && !found) steps.forEach(s => s.classList.add('is-pickable'));
        if (!b.find && !b.crashes) ctx.done(b, null);
      }
    };
    const stop = () => { clearInterval(timer); timer = null; el.querySelector('[data-b=play]').textContent = 'Play'; };
    el.querySelector('[data-b=next]').addEventListener('click', () => { stop(); if (!finished()) { at++; paint(); } });
    el.querySelector('[data-b=all]').addEventListener('click', () => { stop(); at = steps.length - 1; paint(); });
    el.querySelector('[data-b=reset]').addEventListener('click', () => { stop(); at = -1; el.querySelectorAll('.sd-tl-step').forEach(s => s.classList.remove('is-crashed', 'is-after-crash')); paint(); });
    el.querySelector('[data-b=play]').addEventListener('click', e => {
      if (timer) return stop();
      if (finished()) at = -1;
      e.target.textContent = 'Pause';
      timer = setInterval(() => { if (!el.isConnected || finished()) return stop(); at++; paint(); }, 1300);
    });
    const reveal = html => { const r = el.querySelector('.sd-reveal'); r.hidden = false; r.innerHTML = html; };
    const label = { safe: 'Safe', lost: 'Work lost', duplicate: 'Duplicate effect', wrong: 'Wrong data', stuck: 'Stuck' };
    el.querySelectorAll('[data-b=crash]').forEach(n => n.addEventListener('click', () => {
      const after = Number(n.dataset.after), c = b.crashes.find(x => x.after === after);
      explored.add(after);
      el.querySelectorAll('[data-b=crash]').forEach(o => o.classList.toggle('is-on', o === n));
      steps.forEach((s, i) => { s.classList.toggle('is-after-crash', i > after); s.classList.toggle('is-crashed', i === after); });
      paintState(after, false);
      n.classList.add('is-explored');
      reveal(`<div class="sd-crash-out is-${c.verdict}"><span class="sd-verdict">${label[c.verdict]}</span>${md(c.text)}</div><p class="sd-muted">${explored.size} of ${b.crashes.length} crash points explored.</p>`);
      if (explored.size === b.crashes.length && (!b.find || found)) ctx.done(b, null);
    }));
    steps.forEach((s, i) => s.addEventListener('click', () => {
      if (!b.find || found || !s.classList.contains('is-pickable')) return;
      const ok = i === b.find.answer; found = true;
      steps.forEach(x => x.classList.remove('is-pickable'));
      s.classList.add(ok ? 'is-right' : 'is-wrong'); steps[b.find.answer].classList.add('is-right', 'is-culprit');
      reveal(verdictOf(ok) + md(b.find.explain));
      if (!b.crashes || explored.size === b.crashes.length) ctx.done(b, ok);
    }));
    paint();
  };

  // ---------- Simulator host ----------
  R.sim = b => frame(b, `${b.intro ? `<div class="sd-prompt">${md(b.intro)}</div>` : ''}<div class="sd-sim" data-sim="${esc(b.name)}"></div>${b.challenges ? `<ul class="sd-challenges">${b.challenges.map((c, i) => `<li data-c="${i}"><span class="sd-check">○</span>${inline(c.text)}</li>`).join('')}</ul>` : ''}${b.takeaway ? `<details class="sd-takeaway"><summary>What to notice</summary>${md(b.takeaway)}</details>` : ''}`, b.title);
  const OPS = { '<': (a, c) => a < c, '<=': (a, c) => a <= c, '>': (a, c) => a > c, '>=': (a, c) => a >= c, '==': (a, c) => a === c };
  W.sim = (el, b, ctx) => {
    const host = el.querySelector('.sd-sim');
    if (!window.SDSims?.has(b.name)) { host.innerHTML = `<p class="sd-error">Unknown simulator ${esc(b.name)}.</p>`; return; }
    const met = new Set(); let touched = false;
    const metrics = m => {
      if (!touched) return;
      (b.challenges || []).forEach((c, i) => {
        if (met.has(i) || !(c.metric in m)) return;
        const pass = [c, ...(c.and || [])].every(x => x.metric in m && OPS[x.op || '>='](m[x.metric], x.value));
        if (pass) { met.add(i); const li = el.querySelector(`[data-c="${i}"]`); li.classList.add('is-met'); li.querySelector('.sd-check').textContent = '✓'; }
      });
      if (b.challenges ? met.size === b.challenges.length : touched) ctx.done(b, null);
    };
    const inst = window.SDSims.mount(b.name, host, b.config || {}, { metrics, touched: () => { touched = true; } });
    ctx.track(inst);
  };

  // ---------- Assembly ----------
  function render(lesson) {
    return (lesson.blocks || []).map(b => b.type === 'md' ? `<div class="sd-md">${md(b.text)}</div>` : (R[b.type] ? R[b.type](b) : '')).join('');
  }
  function outline(lesson) {
    const heads = [];
    (lesson.blocks || []).forEach(b => { if (b.type === 'md') for (const m of b.text.matchAll(/^##\s+(.*)$/gm)) heads.push(m[1]); });
    return heads;
  }
  // ctx: {saved:{key:{done}}, done(key, correct), recall(block,text)}
  function wire(root, lesson, ctx) {
    const instances = [];
    const local = {
      track: inst => inst && instances.push(inst),
      recall: ctx.recall,
      done(b, correct, silent) {
        const node = root.querySelector(`[data-block="${b.key}"]`);
        if (node.dataset.done) return;
        node.dataset.done = '1'; node.querySelector('.sd-block-done').hidden = false;
        if (!silent) ctx.done(b.key, correct);
      },
    };
    (lesson.blocks || []).forEach(b => {
      if (b.type === 'md' || !W[b.type]) return;
      const node = root.querySelector(`[data-block="${b.key}"]`);
      if (!node) return;
      if (ctx.saved?.[b.key]?.done) { node.dataset.done = '1'; node.querySelector('.sd-block-done').hidden = false; }
      try { W[b.type](node, b, local); } catch (e) { node.insertAdjacentHTML('beforeend', `<p class="sd-error">This activity failed to load: ${esc(e.message)}</p>`); }
    });
    return { destroy() { instances.forEach(i => i.destroy?.()); } };
  }
  window.SDBlocks = { md, inline, esc, render, wire, outline, slug, highlight };
})();
