import type { ReactNode } from "react";

// `code` and **bold** in a line of text, as elements. Everything else is plain text (React escapes it).
export function inlineMd(s: unknown): ReactNode[] {
  const out: ReactNode[] = [];
  String(s ?? "").split(/(\*\*[^*]+\*\*|`[^`]+`)/).forEach((p, i) => {
    if (!p) return;
    if (p.startsWith("**") && p.endsWith("**") && p.length > 4) out.push(<strong key={i}>{p.slice(2, -2)}</strong>);
    else if (p.startsWith("`") && p.endsWith("`") && p.length > 2) out.push(<code key={i}>{p.slice(1, -1)}</code>);
    else out.push(p);
  });
  return out;
}
