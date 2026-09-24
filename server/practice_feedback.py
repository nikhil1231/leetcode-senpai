"""Authored distractor explanations, keyed by stable authored option IDs."""

DISTRACTORS = {
    "fill-search": [
        "mid may equal lo, so keeping mid can leave the bounds unchanged forever.",
        "hi + 1 discards every remaining candidate, including a possible target.",
        "lo + 1 makes progress but can require linear time instead of logarithmic time.",
    ],
    "fill-window": [
        "This removes characters when there is no duplicate and can remove from an empty set.",
        "Window length does not tell you whether ch is already present.",
        "A single-element window can still contain ch; set size is not the duplicate test.",
    ],
    "fill-bfs": [
        "node was already discovered. Mark the neighbor before another vertex can enqueue it.",
        "Clearing seen forgets visited vertices and allows cycles to revisit them.",
        "Clearing the queue discards vertices whose outgoing edges still need processing.",
    ],
    "fill-dp": [
        "max keeps only one family of paths; both disjoint families must be counted.",
        "The two predecessor steps generally have different path counts, so doubling is incorrect.",
        "There may be many paths through i - 1, not just one additional path.",
    ],
    "approach-negative": [
        "With negative numbers, shrinking can increase the sum, so this window rule is unsafe.",
        "Sorting destroys the contiguous order that defines the requested subarrays.",
        "Enumerating all starts and ends takes quadratic time, exceeding the linear bound.",
    ],
    "approach-sorted": [
        "A hash set takes linear extra space, exceeding the constant-space requirement.",
        "One binary search per position takes O(n log n), exceeding the linear-time requirement.",
        "Checking every pair takes quadratic time.",
    ],
    "approach-graph": [
        "DFS can reach a vertex by a long path before discovering a shorter one.",
        "Vertex labels have no relationship to distance.",
        "There can be exponentially many simple paths; enumeration exceeds O(V + E).",
    ],
    "approach-stack": [
        "A total count accepts mismatched types and loses nesting order.",
        "Separate counts still accept ([)], whose brackets cross.",
        "A set forgets both multiplicity and the order of unmatched brackets.",
    ],
}


def for_answer(q, answer):
    notes = DISTRACTORS.get(q["template"])
    if notes and answer in {"1", "2", "3"}:
        return notes[int(answer) - 1]
    if q["mode"] == "trace":
        selected = next((o["text"] for o in q["options"] if o["id"] == answer), "")
        return f"Your predicted state was {selected}. Compare it with the computed state below, following the updates in order."
    return ""
