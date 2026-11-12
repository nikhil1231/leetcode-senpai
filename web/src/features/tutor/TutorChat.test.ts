import { describe, expect, it } from "vitest";
import { turnsToMessages } from "./TutorChat";

const cast = (id: string) => (id === "priya" ? { name: "Priya", role: "SRE" } : undefined);
const session = { turns: [
  { role: "tutor", speaker: "priya", say: "Look at this.", boards: [{ title: "Cold cache" }], show_block: "b1", recorded: { evidence: 2, misconceptions: 0, resolved: 0 } },
  { role: "learner", text: "Every read misses." },
  { role: "block", block: "b1", correct: true },
  { role: "tutor", speaker: "tutor", say: "**What you did well**", debrief: true, move: { title: "Eviction", section: "system-design", lesson: "eviction" } },
] };

describe("turnsToMessages", () => {
  it("maps stored turns to chat messages, with cards whose ids match the stage (tutor.js)", () => {
    const m = turnsToMessages(session, cast, [{ key: "b1", title: "A **database** handles reads" }]);
    expect(m.map((x) => x.role)).toEqual(["assistant", "user", "note", "assistant"]);
    expect(m[0].who).toEqual({ name: "Priya", role: "SRE", key: "priya" });
    expect(m[0].parts).toEqual([
      { tool: "stage", args: { id: "wb0-0", label: "Whiteboard: Cold cache" } },
      { tool: "stage", args: { id: "ac0", label: "Activity: A database handles reads" } },
      { tool: "recorded", args: { n: 2 } },
    ]);
    expect(m[2].text).toBe("You got the activity right.");
    expect(m[3]).toMatchObject({ className: "tu-debrief", who: { name: "Tutor", role: "Debrief" }, parts: [{ tool: "move" }] });
  });
  it("leaves the debrief out of an overview's check", () => {
    expect(turnsToMessages(session, cast, [], true).map((x) => x.role)).toEqual(["assistant", "user", "note"]);
  });
});
