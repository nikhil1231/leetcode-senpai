export const escapeHtml = (s: unknown) =>
  String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

// Tiny markdown (headers, bullets, bold, code) for playbooks. Everything is escaped first.
export function mdToHtml(md: string | null | undefined): string {
  let html = "", inList = false;
  const inline = (s: string) => escapeHtml(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`(.+?)`/g, "<code>$1</code>");
  for (const line of (md || "").split("\n")) {
    const l = line.trim();
    if (/^#{1,3}\s/.test(l)) {
      if (inList) { html += "</ul>"; inList = false; }
      const level = (l.match(/^#+/) as RegExpMatchArray)[0].length;
      html += `<h${level + 1}>${inline(l.replace(/^#+\s/, ""))}</h${level + 1}>`;
    } else if (/^[-*]\s/.test(l)) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${inline(l.replace(/^[-*]\s/, ""))}</li>`;
    } else if (l) {
      if (inList) { html += "</ul>"; inList = false; }
      html += `<p>${inline(l)}</p>`;
    }
  }
  return inList ? html + "</ul>" : html;
}

export function isoWeek(date: Date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export const plural = (n: number | null | undefined, one: string, many?: string) => {
  const count = Number(n) || 0;
  return `${count} ${count === 1 ? one : many || one + "s"}`;
};
