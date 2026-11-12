"use client";
import { LegacyMount } from "@/legacy/LegacyStage";

// System Design: the home, Learn, lessons, Practise, simulators and the rest, drawn by src/legacy/system-design*.js into
// the container it expects. The URL is the view: /system-design/lesson/<id>, /system-design/simulators/<kind>~<id>, ...
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const win = () => window as any;
export function SystemDesignRoute({ view }: { view: string }) {
  return (
    <LegacyMount id="tab-design" className="tab" deps={[view]}
      open={async () => { const sd = win().SystemDesign; sd.onTab("design"); await sd.openView(view, true); return () => sd.onTab("today"); }} />
  );
}
