import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Script from "next/script";
import { AppShell } from "@/components/shell/AppShell";
import { Providers } from "@/lib/providers";
import "@/styles/style.css";
import "@/styles/system-design.css";
import "@/styles/sd-lessons.css";
import "@/styles/sd-progress.css";
import "@/styles/visualise.css";
import "@/styles/sd-walkthrough.css";
import "@/styles/sd-simulators.css";
import "@/styles/sd-game.css";
import "@/styles/sd-outage.css";
import "@/styles/course-sims.css";
import "@/styles/dist-sims.css";
import "@/styles/nightshift.css";
import "@/styles/tracks.css";
import "@/styles/tutor.css";
import "@/styles/hub.css";
import "@/styles/next-up.css";
import "@/styles/palette.css";
import "@/styles/daily-coach.css";
import "@/styles/page-coach.css";
import "@/styles/chat.css";
import "@/styles/readiness.css";
import "@/styles/themes.css";
import "@/styles/app.css";

export const metadata: Metadata = {
  title: "Leetcode Senpai",
  icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml" }, { url: "/favicon-32x32.png", sizes: "32x32" }, { url: "/favicon-16x16.png", sizes: "16x16" }], apple: "/apple-touch-icon.png" },
};
export const viewport: Viewport = { themeColor: "#0a0c11", width: "device-width", initialScale: 1, viewportFit: "cover", colorScheme: "dark" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <body>
        <Providers><AppShell>{children}</AppShell></Providers>
        {/* The Tweak button (~/infra README, Tweak). */}
        <Script src="https://whats.nikhil.ing/tweak.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
