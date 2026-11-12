// The lessons' Markdown (the rules of `md` in src/legacy/sd-blocks.js), for React: chat replies render like lessons.
// Everything is escaped first; nothing here trusts HTML. Kept apart from sd-blocks.js because the legacy tests load
// that file in a bare VM, where it cannot import. A reply still streaming may end mid-fence or mid-table: both render.
const esc = (s: unknown) => String(s ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function inlineHtml(text: string): string {
  const codes: string[] = [];
  let s = esc(text).replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\[([^\]]+)\]\((#\/[\w/-]+)\)/g, '<a href="$2">$1</a>')
    .replace(/~~([^~]+)~~/g, "<del>$1</del>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
}

const KEYWORDS = /\b(SELECT|FROM|WHERE|AND|OR|NOT|NULL|IS|IN|INSERT|INTO|VALUES|UPDATE|SET|DELETE|BEGIN|COMMIT|ROLLBACK|FOR|ORDER|BY|LIMIT|CREATE|TABLE|INDEX|UNIQUE|PRIMARY|KEY|ON|CONFLICT|DO|NOTHING|RETURNING|JOIN|GROUP|HAVING|AS|IF|ELSE|RETURN|WHILE|DEF|FUNCTION|CONST|LET|AWAIT|ASYNC|TRUE|FALSE|EXISTS|REFERENCES|DEFAULT|CHECK|SERIALIZABLE|ISOLATION|LEVEL|TRANSACTION|EXPLAIN|ANALYZE|GET|POST|PUT|PATCH|HTTP)\b/g;
function highlight(code: string, lang: string) {
  let s = esc(code);
  if (/^(sql|python|js|text|http|pseudo)$/.test(lang)) {
    s = s.replace(/(--[^\n]*|#[^\n{]*$|\/\/[^\n]*)/gm, '<span class="tok-c">$1</span>')
      .replace(/('[^'\n]*'|&quot;[^\n]*?&quot;)/g, '<span class="tok-s">$1</span>');
    if (lang === "sql" || lang === "pseudo" || lang === "http") s = s.replace(KEYWORDS, '<span class="tok-k">$1</span>');
  }
  return s;
}

export function mdHtml(text: string): string {
  const lines = String(text ?? "").replace(/\r/g, "").split("\n");
  const out: string[] = [], para: string[] = [];
  let i = 0;
  const flush = () => { if (para.length) { out.push(`<p>${inlineHtml(para.join(" "))}</p>`); para.length = 0; } };
  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      flush(); const body: string[] = []; i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) body.push(lines[i++]);
      i++;
      out.push(`<pre class="sd-code" data-lang="${esc(fence[1])}"><code>${highlight(body.join("\n"), fence[1])}</code></pre>`);
      continue;
    }
    const h = line.match(/^(#{2,4})\s+(.*)$/);
    if (h) { flush(); const tag = h[1].length === 2 ? "h3" : "h4"; out.push(`<${tag} id="sd-h-${slug(h[2])}" class="sd-md-h">${inlineHtml(h[2])}</${tag}>`); i++; continue; }
    if (/^---+\s*$/.test(line)) { flush(); out.push("<hr>"); i++; continue; }
    if (/^\|/.test(line)) {
      flush(); const rows: string[] = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      const cells = (r: string) => r.replace(/^\||\|\s*$/g, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
      const head = cells(rows[0]); const body = rows.slice(/^\|[\s:|-]+\|?\s*$/.test(rows[1] || "") ? 2 : 1);
      out.push(`<div class="sd-scroll"><table class="sd-md-table"><thead><tr>${head.map((c) => `<th>${inlineHtml(c)}</th>`).join("")}</tr></thead><tbody>${body.map((r) => `<tr>${cells(r).map((c) => `<td>${inlineHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }
    if (/^>\s?/.test(line)) {
      flush(); const body: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) body.push(lines[i++].replace(/^>\s?/, ""));
      const tag = body[0].match(/^\[!(\w+)\]\s*(.*)$/);
      const kind = tag ? tag[1] : "note", title = tag ? tag[2] : "";
      if (tag) body.shift();
      out.push(`<aside class="sd-callout is-${esc(kind)}">${title ? `<b class="sd-callout-title">${inlineHtml(title)}</b>` : ""}${mdHtml(body.join("\n"))}</aside>`);
      continue;
    }
    const li = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
    if (li) {
      flush(); const ordered = /\d/.test(li[2]); const items: string[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
        if (m && m[1].length < 2) { items.push(m[3]); i++; continue; }
        if (items.length && /^\s{2,}\S/.test(lines[i])) { items[items.length - 1] += " " + lines[i].trim(); i++; continue; }
        break;
      }
      out.push(`<${ordered ? "ol" : "ul"}>${items.map((t) => `<li>${inlineHtml(t)}</li>`).join("")}</${ordered ? "ol" : "ul"}>`);
      continue;
    }
    if (!line.trim()) { flush(); i++; continue; }
    para.push(line.trim()); i++;
  }
  flush();
  return out.join("");
}
