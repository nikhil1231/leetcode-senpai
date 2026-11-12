"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { NextUpCard } from "@/components/nextup/NextUp";
import { Blocks, Brief } from "./parts";

// The day's plan on Overview: Do this next, the week against the plan, and today's session. Senpai's own data is
// optional here — if it fails, Do this next still shows.
export function SenpaiToday() {
  const { data: s } = useQuery({ queryKey: ["api", "/senpai/today"], queryFn: () => api("/senpai/today"), retry: false });
  const open = s ? s.blocks.filter((b: { done: boolean }) => !b.done) : [];
  return (
    <div id="daily-coach-summary">
      <div id="nu-today"><NextUpCard /></div>
      {s && (
        <section className="sp-home">
          <Brief brief={s.brief} split={false} extra={<Link className="button is-small is-ghost" href="/leetcode/senpai">Open Senpai</Link>} />
          <div className="sp-home-today">
            <h3>Today · {open.length ? `${open.reduce((n: number, b: { minutes: number }) => n + b.minutes, 0)} minutes planned` : s.blocks.length ? "session complete" : "nothing prepared"}</h3>
            {open.length ? (
              <>
                <Blocks blocks={open.slice(0, 3)} />
                {open.length > 3 && <p className="help">+{open.length - 3} more in Senpai.</p>}
              </>
            ) : <p className="help">{s.note || "Everything in today's session is done. Prepare another in Senpai if you want more."}</p>}
          </div>
        </section>
      )}
    </div>
  );
}
