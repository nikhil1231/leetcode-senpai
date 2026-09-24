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
