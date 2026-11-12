import type { CSSProperties } from "react";
import { unknownBand, type ReadinessSection } from "@/lib/queries";

// One pip per section, filled to its readiness; the same small gauge on the sidebar chip and every Home card.
export function Pips({ rows }: { rows: ReadinessSection[] }) {
  return (
    <span className="rd-pips" aria-hidden="true">
      {rows.map((r) => (
        <i key={r.id} style={{ "--c": `var(--sec-${r.id})` } as CSSProperties}>
          <b style={{ width: `${unknownBand(r.band) ? 0 : Math.max(4, r.ready)}%` }} />
        </i>
      ))}
    </span>
  );
}
