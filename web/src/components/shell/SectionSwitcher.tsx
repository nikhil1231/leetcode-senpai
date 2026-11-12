"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SECTION_BLURB, SECTION_ICON } from "@/lib/icons";
import { SECTIONS, SIX, type SectionId } from "@/lib/sections";
import { pctText, useReadiness } from "@/lib/queries";
import { useLastLeetcodeTab } from "@/lib/nav";

const ORDER: SectionId[] = ["readiness", ...SIX];

export function SectionSwitcher({ section }: { section: SectionId }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const readiness = useReadiness().data;
  const lastTab = useLastLeetcodeTab();
  const meta = SECTIONS[section];

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => {
      const items = [...(root.current?.querySelectorAll<HTMLElement>("[data-section]") ?? [])];
      if (e.key === "Escape") { e.preventDefault(); setOpen(false); trigger.current?.focus(); }
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
        e.preventDefault();
        const i = items.indexOf(document.activeElement as HTMLElement);
        const next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (i + (e.key === "ArrowUp" ? -1 : 1) + items.length) % items.length;
        items[next]?.focus();
      }
    };
    document.addEventListener("click", away);
    document.addEventListener("keydown", key);
    root.current?.querySelector<HTMLElement>(".is-selected")?.focus();
    return () => { document.removeEventListener("click", away); document.removeEventListener("keydown", key); };
  }, [open]);

  const href = (id: SectionId) => (id === "leetcode" ? `/leetcode/${lastTab}` : `/${id}`);
  const row = (id: SectionId) => {
    const [strong, small] = SECTION_BLURB[id];
    const r = readiness?.sections.find((s) => s.id === id);
    return (
      <Link key={id} href={href(id)} data-section={id} onClick={() => setOpen(false)}
        className={`section-option${id === section ? " is-selected" : ""}`} aria-pressed={id === section}>
        {id === "leetcode" ? <span className="section-option-icon">&lt;/&gt;</span>
          : <svg className="section-option-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: SECTION_ICON[id] ?? "" }} />}
        <span><strong>{strong}</strong><small>{small}</small></span>
        {r && <span className="section-pct" title={`${r.title}: ${r.band}`}>{pctText(r)}</span>}
        <span className="section-check" aria-hidden="true">✓</span>
      </Link>
    );
  };

  return (
    <div className="section-switcher" ref={root}>
      <button className="brand" id="section-trigger" type="button" ref={trigger} aria-expanded={open} aria-controls="section-menu"
        aria-label={`Switch learning section. Current: ${section === "leetcode" ? "LeetCode" : meta.name}`} onClick={() => setOpen(!open)}>
        <img className="app-logo" src="/app-icon.png" alt="" aria-hidden="true" />
        <div className="brand-text"><span className="brand-name">{meta.name}</span><span className="brand-sub">{meta.sub}</span></div>
        <svg className="section-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m8 10 4 4 4-4" /></svg>
      </button>
      {open && (
        <div id="section-menu" className="section-menu" aria-labelledby="section-menu-title">
          <div className="section-menu-heading" id="section-menu-title">Your learning spaces<span>Choose what to work on</span></div>
          {row("readiness")}
          <div className="section-menu-rule" role="separator" />
          {ORDER.slice(1).map(row)}
          <div className="section-menu-foot">Six disciplines. One interview toolkit. Ctrl K jumps to anything.</div>
        </div>
      )}
    </div>
  );
}
