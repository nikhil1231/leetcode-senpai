import type { Metadata, Viewport } from "next";
import Script from "next/script";
import type { ReactNode } from "react";

// The pages that open on their own (feed, wall, walk): no app shell, no app stylesheets, no providers.
export const metadata: Metadata = { icons: { icon: "/favicon.ico", apple: "/apple-touch-icon.png" } };
export const viewport: Viewport = { themeColor: "#0a0c11", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function StandaloneLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#0a0c11" }}>
        {children}
        <Script src="https://whats.nikhil.ing/tweak.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
