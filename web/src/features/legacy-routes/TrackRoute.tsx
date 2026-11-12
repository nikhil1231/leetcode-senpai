"use client";
import { LegacyMount } from "@/legacy/LegacyStage";

// Fundamentals, AI Engineering, Experience, Practical Coding and the tutor page: src/legacy/tracks.js and the views the
// other legacy modules register with it, drawn into the container it expects.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const win = () => window as any;
export function TrackRoute({ track, view }: { track: string; view: string }) {
  return <LegacyMount id="tab-track" className="tab" deps={[track, view]} open={() => win().Tracks.open(track, view)} />;
}
