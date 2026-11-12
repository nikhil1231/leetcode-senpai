"use client";
import { useMemo } from "react";
import { leetcodeProblemUrl } from "@/lib/format";

const ALLOWED = new Set(["P", "PRE", "CODE", "STRONG", "B", "EM", "I", "UL", "OL", "LI", "BR", "TABLE", "THEAD", "TBODY", "TR", "TH", "TD", "SUP", "SUB", "SPAN", "IMG"]);

function normalizeAssetUrl(src: string | null) {
  const raw = String(src || "").trim();
  if (!raw) return "";
  try {
    const url = raw.startsWith("/") ? new URL(raw, "https://assets.leetcode.com") : new URL(raw, "https://leetcode.com");
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch { return ""; }
}

// A problem prompt from LeetCode is HTML we did not write: keep a small set of tags, drop every attribute but an image's.
export function sanitizeProblemHtml(html?: string | null) {
  if (!html || typeof document === "undefined") return "";
  const template = document.createElement("template");
  template.innerHTML = html;
  template.content.querySelectorAll("*").forEach((el) => {
    if (!ALLOWED.has(el.tagName)) { el.replaceWith(...Array.from(el.childNodes)); return; }
    if (el.tagName === "IMG") {
      const src = normalizeAssetUrl(el.getAttribute("src"));
      const alt = el.getAttribute("alt") || "", width = el.getAttribute("width"), height = el.getAttribute("height");
      if (!src) { el.remove(); return; }
      Array.from(el.attributes).forEach((a) => el.removeAttribute(a.name));
      el.setAttribute("src", src); el.setAttribute("alt", alt); el.setAttribute("loading", "lazy"); el.setAttribute("decoding", "async");
      if (/^\d{1,4}$/.test(width || "")) el.setAttribute("width", width as string);
      if (/^\d{1,4}$/.test(height || "")) el.setAttribute("height", height as string);
      return;
    }
    Array.from(el.attributes).forEach((a) => el.removeAttribute(a.name));
  });
  return template.innerHTML;
}

// `error` is why the statement couldn't be fetched: a 503 carries the server's own "you're offline" message.
export function ProblemStatement({ problem, slug, error, className = "recall-statement" }: {
  problem?: { url?: string; content_html?: string } | null; slug: string; error?: (Error & { status?: number }) | null; className?: string;
}) {
  const body = useMemo(() => sanitizeProblemHtml(problem?.content_html), [problem?.content_html]);
  const url = problem?.url || leetcodeProblemUrl(slug);
  const why = error && error.status === 503 ? error.message : error ? "Couldn't load the prompt — it's on LeetCode." : "Prompt unavailable.";
  return (
    <div className={className}>
      <div className="problem-statement-source"><a href={url} target="_blank" rel="noopener">Open on LeetCode</a></div>
      {body ? <div dangerouslySetInnerHTML={{ __html: body }} /> : <p className="small">{why}</p>}
    </div>
  );
}
