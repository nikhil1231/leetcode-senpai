"""Curated problem-list packs + topic->category mapping.

A "pack" is a named, ordered list of LeetCode slugs the user can one-click
import. NeetCode 150 is derived from neetcode150.py; the others are the
well-known community lists. Category is taken from NeetCode 150 where a slug
overlaps, else inferred from the problem's LeetCode topic tags at import time via
TAG_TO_CATEGORY.

Unknown slugs fail gracefully at import (the metadata fetch just returns None),
so an occasional stale slug won't break a pack import.
"""
from .neetcode150 import NEETCODE_150, category_of

# ---- Blind 75 -------------------------------------------------------------------
BLIND_75 = [
    # Array
    "two-sum", "best-time-to-buy-and-sell-stock", "contains-duplicate",
    "product-of-array-except-self", "maximum-subarray", "maximum-product-subarray",
    "find-minimum-in-rotated-sorted-array", "search-in-rotated-sorted-array",
    "3sum", "container-with-most-water",
    # Binary
    "sum-of-two-integers", "number-of-1-bits", "counting-bits", "missing-number",
    "reverse-bits",
    # DP
    "climbing-stairs", "coin-change", "longest-increasing-subsequence",
    "longest-common-subsequence", "word-break", "combination-sum", "house-robber",
    "house-robber-ii", "decode-ways", "unique-paths", "jump-game",
    # Graph
    "clone-graph", "course-schedule", "pacific-atlantic-water-flow",
    "number-of-islands", "longest-consecutive-sequence", "alien-dictionary",
    "graph-valid-tree", "number-of-connected-components-in-an-undirected-graph",
    # Interval
    "insert-interval", "merge-intervals", "non-overlapping-intervals",
    "meeting-rooms", "meeting-rooms-ii",
    # Linked List
    "reverse-linked-list", "linked-list-cycle", "merge-two-sorted-lists",
    "merge-k-sorted-lists", "remove-nth-node-from-end-of-list", "reorder-list",
    # Matrix
    "set-matrix-zeroes", "spiral-matrix", "rotate-image", "word-search",
    # String
    "longest-substring-without-repeating-characters",
    "longest-repeating-character-replacement", "minimum-window-substring",
    "valid-anagram", "group-anagrams", "valid-parentheses", "valid-palindrome",
    "longest-palindromic-substring", "palindromic-substrings",
    "encode-and-decode-strings",
    # Tree
    "maximum-depth-of-binary-tree", "same-tree", "invert-binary-tree",
    "binary-tree-maximum-path-sum", "binary-tree-level-order-traversal",
    "serialize-and-deserialize-binary-tree", "subtree-of-another-tree",
    "construct-binary-tree-from-preorder-and-inorder-traversal",
    "validate-binary-search-tree", "kth-smallest-element-in-a-bst",
    "lowest-common-ancestor-of-a-binary-search-tree",
    "implement-trie-prefix-tree", "design-add-and-search-words-data-structure",
    "word-search-ii",
    # Heap
    "top-k-frequent-elements", "find-median-from-data-stream",
]

# ---- Grind 75 (techinterviewhandbook; first 75 of Grind 169) --------------------
GRIND_75 = [
    "two-sum", "valid-parentheses", "merge-two-sorted-lists",
    "best-time-to-buy-and-sell-stock", "valid-palindrome", "invert-binary-tree",
    "valid-anagram", "binary-search", "flood-fill",
    "lowest-common-ancestor-of-a-binary-search-tree", "balanced-binary-tree",
    "linked-list-cycle", "implement-queue-using-stacks", "first-bad-version",
    "ransom-note", "climbing-stairs", "longest-palindrome",
    "reverse-linked-list", "majority-element", "add-binary", "diameter-of-binary-tree",
    "middle-of-the-linked-list", "maximum-depth-of-binary-tree",
    "contains-duplicate", "maximum-subarray", "insert-interval", "01-matrix",
    "k-closest-points-to-origin", "longest-substring-without-repeating-characters",
    "3sum", "binary-tree-level-order-traversal", "clone-graph",
    "evaluate-reverse-polish-notation", "course-schedule",
    "implement-trie-prefix-tree", "coin-change", "product-of-array-except-self",
    "min-stack", "validate-binary-search-tree", "number-of-islands",
    "rotting-oranges", "search-in-rotated-sorted-array",
    "combination-sum", "permutations", "merge-intervals",
    "lowest-common-ancestor-of-a-binary-tree", "time-based-key-value-store",
    "accounts-merge", "sort-colors", "word-break", "partition-equal-subset-sum",
    "string-to-integer-atoi", "spiral-matrix", "subsets", "binary-tree-right-side-view",
    "longest-palindromic-substring", "unique-paths",
    "construct-binary-tree-from-preorder-and-inorder-traversal",
    "container-with-most-water", "letter-combinations-of-a-phone-number",
    "word-search", "find-all-anagrams-in-a-string", "minimum-height-trees",
    "task-scheduler", "lru-cache", "kth-smallest-element-in-a-bst",
    "daily-temperatures", "house-robber", "gas-station", "next-permutation",
    "valid-sudoku", "group-anagrams", "maximal-square", "find-median-from-data-stream",
    "largest-rectangle-in-histogram",
]


def _neetcode_pack():
    slugs = []
    cat_map = {}
    for cat, cat_slugs in NEETCODE_150.items():
        for s in cat_slugs:
            slugs.append(s)
            cat_map[s] = cat
    return {"label": "NeetCode 150", "slugs": slugs, "category_map": cat_map}


def _derived_pack(label, slugs):
    # Category from NeetCode 150 overlap; the rest resolved at import time.
    cat_map = {s: category_of(s) for s in slugs if category_of(s)}
    return {"label": label, "slugs": slugs, "category_map": cat_map}


PACKS = {
    "neetcode150": _neetcode_pack(),
    "blind75": _derived_pack("Blind 75", BLIND_75),
    "grind75": _derived_pack("Grind 75", GRIND_75),
}


def pack_names():
    return list(PACKS.keys())


def get_pack(name):
    return PACKS.get(name)


# ---- LeetCode topic tag -> NeetCode category (best-effort fallback) -------------
TAG_TO_CATEGORY = {
    "Array": "Arrays & Hashing",
    "Hash Table": "Arrays & Hashing",
    "String": "Arrays & Hashing",
    "Two Pointers": "Two Pointers",
    "Sliding Window": "Sliding Window",
    "Stack": "Stack",
    "Monotonic Stack": "Stack",
    "Binary Search": "Binary Search",
    "Linked List": "Linked List",
    "Tree": "Trees",
    "Binary Tree": "Trees",
    "Binary Search Tree": "Trees",
    "Depth-First Search": "Trees",
    "Breadth-First Search": "Graphs",
    "Trie": "Tries",
    "Heap (Priority Queue)": "Heap / Priority Queue",
    "Backtracking": "Backtracking",
    "Graph": "Graphs",
    "Union Find": "Graphs",
    "Topological Sort": "Advanced Graphs",
    "Shortest Path": "Advanced Graphs",
    "Minimum Spanning Tree": "Advanced Graphs",
    "Dynamic Programming": "1-D DP",
    "Greedy": "Greedy",
    "Interval": "Intervals",
    "Math": "Math & Geometry",
    "Matrix": "Math & Geometry",
    "Geometry": "Math & Geometry",
    "Bit Manipulation": "Bit Manipulation",
}


def category_from_tags(tags):
    """Pick the best NeetCode category for a list of LeetCode topic tag names."""
    for t in tags or []:
        if t in TAG_TO_CATEGORY:
            return TAG_TO_CATEGORY[t]
    return "Arrays & Hashing"
