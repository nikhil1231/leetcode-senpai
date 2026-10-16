"""Versioned taxonomy and conservative topic introductions. No learner state."""
from .neetcode150 import NEETCODE_150, category_of

VERSION = 1
# Reviewed imports outside NeetCode. Keep list membership in neetcode150.py.
REVIEWED = {
    'accounts-merge': 'Graphs', 'flood-fill': 'Graphs', '01-matrix': 'Graphs',
    'maximal-square': '2-D DP', 'sort-colors': 'Two Pointers',
    'implement-queue-using-stacks': 'Stack', 'first-bad-version': 'Binary Search',
    'ransom-note': 'Arrays & Hashing', 'longest-palindrome': 'Arrays & Hashing',
    'majority-element': 'Arrays & Hashing', 'add-binary': 'Bit Manipulation',
    'middle-of-the-linked-list': 'Linked List',
    'lowest-common-ancestor-of-a-binary-tree': 'Trees',
    'string-to-integer-atoi': 'Arrays & Hashing',
    'find-all-anagrams-in-a-string': 'Sliding Window',
    'minimum-height-trees': 'Graphs', 'next-permutation': 'Two Pointers',
    'subarray-sum-equals-k': 'Arrays & Hashing',
}
# Reviewed remainder of the 205-problem baseline; avoid generic-tag provenance.
REVIEWED.update({
    **{s: 'Two Pointers' for s in ('3sum-closest','4sum','remove-duplicates-from-sorted-array',
        'remove-duplicates-from-sorted-array-ii','remove-element')},
    **{s: 'Backtracking' for s in ('combinations','n-queens-ii','permutations-ii','restore-ip-addresses','sudoku-solver')},
    **{s: 'Arrays & Hashing' for s in ('count-and-say','first-missing-positive','length-of-last-word',
        'longest-common-prefix','find-the-index-of-the-first-occurrence-in-a-string','zigzag-conversion')},
    **{s: 'Bit Manipulation' for s in ('divide-two-integers','gray-code')},
    **{s: 'Binary Search' for s in ('find-first-and-last-position-of-element-in-sorted-array',
        'search-in-rotated-sorted-array-ii','search-insert-position')},
    **{s: 'Math & Geometry' for s in ('integer-to-roman','palindrome-number','permutation-sequence',
        'roman-to-integer','spiral-matrix-ii')},
    **{s: 'Linked List' for s in ('partition-list','remove-duplicates-from-sorted-list-ii',
        'reverse-linked-list-ii','rotate-list','swap-nodes-in-pairs')},
    **{s: '2-D DP' for s in ('minimum-path-sum','unique-paths-ii','wildcard-matching')},
    'shortest-path-to-get-food': 'Graphs', 'simplify-path': 'Stack',
    'substring-with-concatenation-of-all-words': 'Sliding Window',
    'unique-binary-search-trees': '1-D DP', 'unique-binary-search-trees-ii': 'Trees',
    'longest-valid-parentheses': 'Stack',
})
CATEGORY_SKILLS = dict(zip(NEETCODE_150, (
    'hash.lookup', 'pointer.regions', 'window.invariant', 'stack.order',
    'search.boundaries', 'list.links', 'tree.traversal', 'trie.prefix',
    'heap.candidates', 'backtrack.state', 'graph.traversal', 'graph.paths',
    'dp.state', 'dp.grid', 'greedy.selection', 'interval.merge_boundaries',
    'math.transform', 'bit.representation')))
SKILLS = {sid: {'name': cat, 'prerequisites': []} for cat, sid in CATEGORY_SKILLS.items()}
SKILLS.update({
    'graph.union_find': {'name': 'Union find', 'prerequisites': ['graph.traversal']},
    'partition.invariant': {'name': 'Partition invariants', 'prerequisites': ['pointer.regions']},
    'arithmetic.carry': {'name': 'Carry propagation', 'prerequisites': []},
    'dp.storage': {'name': 'DP state versus storage', 'prerequisites': ['dp.state']},
    'contract.discrimination': {'name': 'Problem contracts', 'prerequisites': []},
    'sweep.active_heap': {'name': 'Search versus heap sweep', 'prerequisites': ['heap.candidates']},
})
SKILLS['graph.paths']['prerequisites'] = ['graph.traversal']
SKILLS['dp.grid']['prerequisites'] = ['dp.state']
PROBLEM_SKILLS = {
    'accounts-merge': ['graph.traversal', 'graph.union_find'],
    'sort-colors': ['partition.invariant'], 'insert-interval': ['interval.merge_boundaries'],
    'merge-intervals': ['interval.merge_boundaries'], 'minimum-interval-to-include-each-query': ['sweep.active_heap'],
    'add-two-numbers': ['arithmetic.carry'], 'add-binary': ['arithmetic.carry'],
    'maximal-square': ['dp.grid', 'dp.storage'],
}
STARTERS = {cat: slugs[0] for cat, slugs in NEETCODE_150.items()}
STARTERS.update({'Backtracking': 'subsets', '2-D DP': 'unique-paths',
                 'Greedy': 'maximum-subarray', 'Intervals': 'merge-intervals',
                 'Advanced Graphs': 'network-delay-time'})


def classify(slug, tags=(), existing=None, pack_category=None):
    existing = existing or {}
    override = existing.get('category_override')
    if override:
        cat, origin = override, 'override'
    elif slug in REVIEWED:
        cat, origin = REVIEWED[slug], 'reviewed'
    elif category_of(slug) or pack_category:
        cat, origin = category_of(slug) or pack_category, 'pack'
    else:
        from .packs import category_from_tags
        cat, origin = category_from_tags(tags), 'tags'
        if cat == 'Unclassified':
            origin = 'uncertain'
    return {'neetcode_category': cat, 'taxonomy_version': VERSION,
            'classification_origin': origin,
            'skill_ids': PROBLEM_SKILLS.get(slug, [CATEGORY_SKILLS[cat]] if cat in CATEGORY_SKILLS else [])}


def entry_tasks(category, problems):
    """Prefer the authored starter; fall back to an available low-difficulty task."""
    pool = [p for p in problems if p.get('neetcode_category') == category
            and p.get('in_library', True) and p.get('difficulty') != 'Hard']
    starter = STARTERS.get(category)
    return sorted(pool, key=lambda p: (p['slug'] != starter,
        {'Easy': 0, 'Medium': 1}.get(p.get('difficulty'), 2), p['slug']))[:1]


def independent(a):
    from .assessment import assistance
    return (not a.get('unsolved') and a.get('kind') not in ('recall', 'sprint')
            and a.get('source') != 'backfill' and assistance(a) == 'none')


def eligible(problem, problems, attempts):
    cat = problem.get('neetcode_category')
    successes = [a for a in attempts if independent(a)]
    done = {a.get('slug') for a in successes}
    entries = entry_tasks(cat, problems)
    if problem['slug'] in {p['slug'] for p in entries}:
        return True
    if problem.get('difficulty') in ('Easy', 'Unknown', None):
        return True
    if not any(p['slug'] in done for p in entries):
        return False
    if problem.get('difficulty') != 'Hard':
        return True
    # Readiness is a product hypothesis: distinct tasks plus a later success.
    relevant = [a for a in successes if any(p['slug'] == a.get('slug')
                and p.get('neetcode_category') == cat for p in problems)]
    times = sorted(a.get('solved_at') or 0 for a in relevant)
    return (len({structure(a['slug']) for a in relevant}) >= 2 and len(times) >= 2
            and times[-1] - times[0] >= 86400)

STRUCTURAL_FAMILIES = {
    **{s: 'pair-sum' for s in ('two-sum','two-sum-ii-input-array-is-sorted','3sum','3sum-closest','4sum')},
    **{s: 'rotated-search' for s in ('search-in-rotated-sorted-array','search-in-rotated-sorted-array-ii')},
    **{s: 'subset-generation' for s in ('subsets','subsets-ii')},
}


def structure(slug):
    return STRUCTURAL_FAMILIES.get(slug, slug)


def prerequisite_options(category, problems):
    skill = CATEGORY_SKILLS.get(category)
    options = []
    for parent in SKILLS.get(skill, {}).get('prerequisites', []):
        cat = next((c for c,s in CATEGORY_SKILLS.items() if s == parent), None)
        tasks = entry_tasks(cat, problems)
        slug = tasks[0]['slug'] if tasks else STARTERS.get(cat)
        if slug:
            options.append({'skill_id': parent, 'slug': slug,
                            'in_library': bool(tasks), 'reason': 'Prerequisite not yet tested; try its entry task or a short diagnostic.'})
    return options
