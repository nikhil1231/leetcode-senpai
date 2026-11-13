"use client";
import { useEffect, type ReactNode } from "react";
import { IconSprite } from "@/components/Icon";
import { HeadingProvider } from "@/lib/heading";
import { useRoute } from "@/lib/nav";
import { SECTIONS, TRACKS } from "@/lib/sections";
import { useUi } from "@/lib/ui-store";
import { noteVisit, startUsage } from "@/lib/usage";
import { usePathname, useRouter } from "next/navigation";
import { setNavigator } from "@/lib/navigate";
import { loadDictation } from "@/legacy/load";
import { Palette } from "@/components/Palette";
import { PageCoach } from "@/components/PageCoach";
import { PageNotes } from "@/components/PageNotes";
import { FlowHost } from "@/features/run/FlowHost";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppShell({ children }: { children: ReactNode }) {
  const { section, segments } = useRoute();
  const setPalette = useUi((s) => s.setPalette);
  const meta = SECTIONS[section];
  const path = usePathname();
  const router = useRouter();
  useEffect(() => { setNavigator({ push: (p) => router.push(p), replace: (p) => router.replace(p) }); }, [router]);
  useEffect(() => { startUsage(); void loadDictation(); }, []);
  useEffect(() => {
    const seg = segments[0];
    const view = section === "leetcode" ? seg ?? "today" : seg === "lesson" || (section === "system-design" && seg === "lessons") ? (section === "system-design" ? "curriculum" : "lessons") : seg ?? "home";
    noteVisit(`${section}/${view}`);
  }, [path, section, segments]);

  // One colour identity per section (themes.css), set on <body> exactly as the old app did.
  useEffect(() => {
    const b = document.body;
    b.dataset.section = section;
    b.classList.toggle("section-design", section === "system-design");
    b.classList.toggle("section-track", TRACKS.includes(section));
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", meta.hue ? `hsl(${meta.hue} 14% 6.5%)` : "#0a0c11");
    document.title = section === "leetcode" ? "Leetcode Senpai" : `${meta.name} · Senpai`;
  }, [section, meta]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette(!useUi.getState().paletteOpen); }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [setPalette]);

  return (
    <HeadingProvider>
      <IconSprite />
      <div id="app" className="shell">
        <Sidebar section={section} segments={segments} />
        <div className="content">
          <Topbar />
          <div id="run-host" style={{ display: "contents" }} />
          <main>{children}</main>
          <PageCoach />
          <PageNotes />
        </div>
      </div>
      <Palette />
      <FlowHost />
    </HeadingProvider>
  );
}
