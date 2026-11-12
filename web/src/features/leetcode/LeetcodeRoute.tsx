"use client";
import { useEffect } from "react";
import { notFound } from "next/navigation";
import { rememberLeetcodeTab } from "@/lib/nav";
import { LEETCODE_TABS } from "@/lib/sections";
import { SenpaiPage } from "@/features/senpai/SenpaiPage";
import { TodayPage } from "./TodayPage";
import { DiscoverPage } from "./DiscoverPage";
import { TopicsPage } from "./TopicsPage";
import { InsightsPage } from "./InsightsPage";
import { PlaybookPage } from "./PlaybookPage";
import { HistoryPage } from "./HistoryPage";
import { ProblemsPage } from "./ProblemsPage";
import { SettingsPage } from "./SettingsPage";
import { QuickfirePage } from "./QuickfirePage";
import { VisualisePage } from "./VisualisePage";

const PAGES: Record<string, (rest: string[]) => React.ReactNode> = {
  today: () => <TodayPage />,
  senpai: () => <SenpaiPage />,
  discover: () => <DiscoverPage />,
  topics: () => <TopicsPage />,
  insights: () => <InsightsPage />,
  playbook: () => <PlaybookPage />,
  history: () => <HistoryPage />,
  problems: () => <ProblemsPage />,
  settings: () => <SettingsPage />,
  practice: () => <QuickfirePage />,
  visualise: (rest) => <VisualisePage topic={rest[0]} />,
};

export function LeetcodeRoute({ tab, rest = [] }: { tab: string; rest?: string[] }) {
  const known = LEETCODE_TABS.some((t) => t.id === tab);
  useEffect(() => { if (known) rememberLeetcodeTab(tab); }, [tab, known]);
  if (!known) notFound();
  const Page = PAGES[tab];
  return <section className="tab">{Page ? Page(rest) : <p className="empty">Coming soon.</p>}</section>;
}
