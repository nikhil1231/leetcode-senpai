// Hand-rolled SVG charts — no dependencies. All exposed on window.Charts.
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // Horizontal bars: data = [{label, value, hint}], max optional.
  function bars(data, opts = {}) {
    if (!data.length) return `<p class="empty">No data yet.</p>`;
    const max = opts.max || Math.max(...data.map((d) => d.value), 1);
    const rows = data.map((d) => {
      const w = Math.round((d.value / max) * 100);
      return `<div class="chart-bar-row" title="${esc(d.hint || d.value)}">
        <span class="chart-bar-label">${esc(d.label)}</span>
        <span class="chart-bar-track"><span class="chart-bar-fill" style="width:${w}%;background:${d.color || "var(--accent)"}"></span></span>
        <span class="chart-bar-val">${esc(d.display != null ? d.display : d.value)}</span>
      </div>`;
    }).join("");
    return `<div class="chart-bars">${rows}</div>`;
  }

  // Grouped horizontal bars: data = [{label, values:[{label, value, color}], hint, meta}].
  function groupedBars(data, opts = {}) {
    if (!data.length) return `<p class="empty">No data yet.</p>`;
    const max = opts.max || Math.max(...data.flatMap((d) => d.values.map((v) => v.value)), 1);
    const rows = data.map((d) => {
      const bars = d.values.map((v) => {
        const w = Math.round((v.value / max) * 100);
        return `<span class="chart-group-item" title="${esc(v.label)} ${esc(v.display != null ? v.display : v.value)}">
          <span class="chart-group-name">${esc(v.label)}</span>
          <span class="chart-bar-track"><span class="chart-bar-fill" style="width:${w}%;background:${v.color || "var(--accent)"}"></span></span>
          <span class="chart-bar-val">${esc(v.display != null ? v.display : v.value)}</span>
        </span>`;
      }).join("");
      return `<div class="chart-group-row" title="${esc(d.hint || "")}">
        <span class="chart-bar-label">${esc(d.label)}</span>
        <span class="chart-group-bars">${bars}</span>
        <span class="chart-group-meta">${d.meta || ""}</span>
      </div>`;
    }).join("");
    return `<div class="chart-bars chart-grouped">${rows}</div>`;
  }

  // Forecast strip: counts = [n...] over `days` days from start (ISO).
  function forecast(fc) {
    if (!fc || !fc.counts) return "";
    const max = Math.max(...fc.counts, 1);
    const start = new Date(fc.start + "T00:00:00");
    const cells = fc.counts.map((c, i) => {
      const d = new Date(start); d.setDate(d.getDate() + i);
      const intensity = c === 0 ? 0 : 0.25 + 0.75 * (c / max);
      const label = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      return `<div class="fc-cell" title="${label}: ${c} due"
        style="background:${c ? `rgba(99,102,241,${intensity.toFixed(2)})` : "var(--track)"}">
        <span class="fc-n">${c || ""}</span></div>`;
    }).join("");
    return `<div class="forecast">${fc.overdue ? `<div class="fc-overdue">${fc.overdue} overdue</div>` : ""}
      <div class="fc-grid">${cells}</div>
      <div class="fc-axis"><span>${new Date(start).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span><span>+${fc.days}d</span></div></div>`;
  }

  // Radar: series = [{category, mastery, mastery_past}]. Two polygons.
  function radar(series, size = 260) {
    if (!series.length) return `<p class="empty">Solve a few problems to see your mastery radar.</p>`;
    const cx = size / 2, cy = size / 2, R = size / 2 - 46, n = series.length;
    const pt = (i, r) => {
      const a = (Math.PI * 2 * i) / n - Math.PI / 2;
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    };
    const ring = (frac) => {
      const p = series.map((_, i) => pt(i, R * frac).map((v) => v.toFixed(1)).join(",")).join(" ");
      return `<polygon points="${p}" fill="none" stroke="var(--border)" stroke-width="1"/>`;
    };
    const poly = (key, color, fill) => {
      const p = series.map((s, i) => pt(i, R * Math.max(0.02, s[key] || 0)).map((v) => v.toFixed(1)).join(",")).join(" ");
      return `<polygon points="${p}" fill="${fill}" stroke="${color}" stroke-width="2"/>`;
    };
    const labels = series.map((s, i) => {
      const [x, y] = pt(i, R + 20);
      const short = s.category.replace(/ .*/, "").slice(0, 8);
      return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle"
        font-size="9" fill="var(--muted)">${esc(short)}</text>`;
    }).join("");
    return `<svg viewBox="0 0 ${size} ${size}" class="radar" role="img" aria-label="Mastery radar">
      ${ring(0.33)}${ring(0.66)}${ring(1)}
      ${poly("mastery_past", "var(--muted)", "rgba(148,163,184,0.12)")}
      ${poly("mastery", "var(--accent)", "rgba(99,102,241,0.28)")}
      ${labels}</svg>
      <div class="legend"><span class="dot-accent"></span>now <span class="dot-muted"></span>30 days ago</div>`;
  }

  // Multi-series line chart: series = {name: [{week, median_min}]}.
  function lines(seriesMap, opts = {}) {
    const names = Object.keys(seriesMap).filter((k) => (seriesMap[k] || []).length);
    if (!names.length) return `<p class="empty">Not enough timed solves yet.</p>`;
    const W = 460, H = 180, pad = 28;
    const allWeeks = Array.from(new Set(names.flatMap((n) => seriesMap[n].map((d) => d.week)))).sort();
    const xOf = (w) => pad + (allWeeks.indexOf(w) / Math.max(1, allWeeks.length - 1)) * (W - pad * 2);
    const maxY = Math.max(...names.flatMap((n) => seriesMap[n].map((d) => d[opts.key || "median_min"])), 1);
    const yOf = (v) => H - pad - (v / maxY) * (H - pad * 2);
    const colors = { Easy: "var(--green)", Medium: "var(--amber)", Hard: "var(--red)", Unknown: "var(--muted)" };
    const paths = names.map((n) => {
      const pts = seriesMap[n].map((d) => `${xOf(d.week).toFixed(1)},${yOf(d[opts.key || "median_min"]).toFixed(1)}`);
      return `<polyline points="${pts.join(" ")}" fill="none" stroke="${colors[n] || "var(--accent)"}" stroke-width="2"/>` +
        seriesMap[n].map((d) => `<circle cx="${xOf(d.week).toFixed(1)}" cy="${yOf(d[opts.key || "median_min"]).toFixed(1)}" r="2.5" fill="${colors[n] || "var(--accent)"}"/>`).join("");
    }).join("");
    const legend = names.map((n) => `<span style="color:${colors[n] || "var(--accent)"}">● ${esc(n)}</span>`).join(" ");
    return `<svg viewBox="0 0 ${W} ${H}" class="linechart">
      <line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" stroke="var(--border)"/>
      <text x="${pad}" y="14" font-size="9" fill="var(--muted)">${esc(opts.yLabel || "min")} (max ${maxY.toFixed(0)})</text>
      ${paths}</svg><div class="legend small">${legend}</div>`;
  }

  window.Charts = { bars, groupedBars, forecast, radar, lines };
})();
