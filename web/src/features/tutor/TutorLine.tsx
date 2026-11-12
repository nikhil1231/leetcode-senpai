"use client";
import { LegacyMount } from "@/legacy/LegacyStage";

// One line on Overview: the tutor's pick, when the model is on and there is one.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function TutorLine() { return <LegacyMount deps={[]} fallback={<span />} open={(el) => (window as any).TutorHome.line(el)} />; }
