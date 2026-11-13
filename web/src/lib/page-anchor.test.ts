import { describe, expect, it } from "vitest";
import { anchorOf, bestMatch, flatten, rangeOf } from "./page-anchor";

describe("page anchors", () => {
  it("prefers the occurrence whose neighbours match", () => {
    const text = "leaderisfencedherebutleaderisfencedthere";
    expect(bestMatch(text, { exact: "leaderisfenced", prefix: "but", suffix: "there" })).toBe(21);
    expect(bestMatch(text, { exact: "leaderisfenced", prefix: "", suffix: "here" })).toBe(0);
    expect(bestMatch(text, { exact: "missing", prefix: "", suffix: "" })).toBe(-1);
  });

  it("finds a passage again across text nodes and changed whitespace", () => {
    document.body.innerHTML = `<main><p>The old leader must be <strong>fenced</strong>: a lease.</p><div class="skip">fenced</div></main>`;
    const main = document.querySelector("main")!;
    const sel = document.createRange();
    const p = main.querySelector("p")!;
    sel.setStart(p.firstChild!, 4);
    sel.setEnd(main.querySelector("strong")!.firstChild!, 6);
    const anchor = anchorOf(flatten(main, ".skip"), sel)!;
    expect(anchor.exact).toBe("oldleadermustbefenced");

    document.body.innerHTML = `<main><p>The old   leader\n must be <b>fenced</b>: a lease.</p></main>`;
    const again = rangeOf(flatten(document.querySelector("main")!, ".skip"), anchor)!;
    expect(again.toString()).toBe("old   leader\n must be fenced");
  });
});
