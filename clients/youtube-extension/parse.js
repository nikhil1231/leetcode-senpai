// Videos from a YouTube search results page: the ytInitialData JSON YouTube embeds. Pure.
export function initialData(html) {
  const m = html.match(/var ytInitialData = (\{.*?\});<\/script>/s) || html.match(/ytInitialData"\]\s*=\s*(\{.*?\});/s);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

const text = t => (t && (t.simpleText || (t.runs || []).map(r => r.text).join(''))) || '';

export function seconds(length) {
  if (!length) return 0;
  return length.split(':').map(Number).reduce((a, b) => a * 60 + b, 0);
}

export function videosFrom(html) {
  const data = initialData(html);
  const out = [];
  const walk = node => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    const v = node.videoRenderer;
    if (v && v.videoId) {
      const length = text(v.lengthText);
      out.push({id: v.videoId, title: text(v.title), channel: text(v.ownerText || v.longBylineText), length,
                seconds: seconds(length), views: text(v.shortViewCountText || v.viewCountText), published: text(v.publishedTimeText)});
      return;
    }
    for (const k in node) walk(node[k]);
  };
  walk(data);
  return out;
}

// Worth showing: a real video (not a Short, not a 3-hour stream), one per id.
export function pick(videos, per, taken = new Set()) {
  const out = [];
  for (const v of videos) {
    if (out.length >= per) break;
    if (taken.has(v.id) || v.seconds < 120 || v.seconds > 90 * 60) continue;
    taken.add(v.id);
    out.push(v);
  }
  return out;
}
