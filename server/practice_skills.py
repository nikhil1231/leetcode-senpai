"""Curated concept links shared by selection and learner-facing feedback."""

GROUPS = {
    "Search boundaries": ("fill-search", "break-search", "trace-search", "fill-lower-bound", "trace-lower-bound"),
    "Unique windows": ("fill-window", "break-window-if", "trace-window-jump"),
    "BFS discovery": ("fill-bfs", "trace-bfs-queue", "approach-graph"),
    "Prefix frequencies": ("fill-prefix-count", "break-prefix-frequency", "approach-negative"),
    "Distinct pair positions": ("fill-two-sum", "break-pair-self", "trace-two-sum-map"),
    "Monotonic stacks": ("trace-stack", "fill-warmer-days", "trace-warmer-days", "break-next-greater"),
    "Top-k heaps": ("fill-heap-k", "trace-heap-topk"),
    "Backtracking snapshots": ("fill-backtrack-copy", "trace-backtrack-undo"),
    "Interval boundaries": ("fill-merge-end", "trace-merge-interval"),
    "Best subarray state": ("break-kadane-empty", "trace-kadane-step"),
    "Sorted pair search": ("approach-sorted", "trace-pair-pointers"),
    "Coin combinations": ("fill-coin-combinations", "trace-coin-update"),
}
CONCEPTS = {template: skill for skill, templates in GROUPS.items() for template in templates}


def concept(template):
    return CONCEPTS.get(template)

FOUNDATIONS = {
    "fill-search", "trace-search", "fill-window", "fill-bfs", "fill-dp",
    "fill-two-sum", "fill-heap-k", "fill-backtrack-copy", "fill-merge-end",
    "trace-kadane-step", "trace-pair-pointers", "trace-bfs-queue",
    "break-last", "break-max", "approach-stack",
}
STRETCH = {
    "fill-lower-bound", "trace-lower-bound", "break-window-if",
    "break-prefix-frequency", "approach-negative", "break-next-greater",
    "fill-coin-combinations", "trace-coin-update",
}


def metadata(template, title):
    return {"skill": concept(template) or title,
            "difficulty": "foundation" if template in FOUNDATIONS else "stretch" if template in STRETCH else "standard"}

PROBLEMS = {
    "Search boundaries": ("binary-search", "search-in-rotated-sorted-array"),
    "Unique windows": ("longest-substring-without-repeating-characters",),
    "BFS discovery": ("rotting-oranges", "word-ladder"),
    "Prefix frequencies": ("subarray-sum-equals-k",),
    "Distinct pair positions": ("two-sum",),
    "Monotonic stacks": ("daily-temperatures",),
    "Top-k heaps": ("kth-largest-element-in-a-stream",),
    "Backtracking snapshots": ("subsets",),
    "Interval boundaries": ("merge-intervals",),
    "Best subarray state": ("maximum-subarray",),
    "Sorted pair search": ("two-sum-ii-input-array-is-sorted",),
    "Coin combinations": ("coin-change-ii",),
}


def related_problems(template, results):
    skill = concept(template)
    slugs = PROBLEMS.get(skill, ())
    if not slugs:
        return []
    secure = {r["question_id"] for r in results
              if concept(r.get("template")) == skill and r.get("correct")
              and not any(r.get(flag) for flag in ("revealed", "guessed", "assisted"))
              and r.get("question_id")}
    if len(secure) < 2:
        return []
    return [{"title": slug.replace("-", " ").title(),
             "url": f"https://leetcode.com/problems/{slug}/"} for slug in slugs]
