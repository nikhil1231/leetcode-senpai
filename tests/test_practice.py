"""Check exercise answers against execution, not just their stored keys."""
import json

import pytest

from server import practice


def test_catalog_and_public_answers():
    entries = practice.catalog()["exercises"]
    assert {e["mode"] for e in entries} == {"break", "trace", "fill", "approach"}
    assert len({e["id"] for e in entries}) == len(entries)
    for e in entries:
        q = practice.question(e["id"], 42)
        assert practice.from_id(q["id"]) == q
        public = practice.public_question(q)
        assert not {"answer", "explanation", "example"} & public.keys()
        if q["input_type"] == "choice":
            assert len({o["text"] for o in q["options"]}) == len(q["options"])
            for o in q["options"]:
                assert practice.grade(q, o["id"])["correct"] == (o["id"] == q["answer"])
        assert practice.grade(q, reveal=True)["correct"] is False


@pytest.mark.parametrize("template", ["trace-search", "trace-stack", "trace-window"])
def test_generated_trace_answers_match_executed_code(template):
    import ast
    import re

    for seed in range(100):
        q = practice.question(template, seed)
        prompt = q["prompt"]
        if template == "trace-search":
            nums = ast.literal_eval(re.search(r"nums = (\[.*?\])", prompt)[1])
            target = int(re.search(r"target = (-?\d+)", prompt)[1])
            env = {"nums": nums, "target": target}
            # Execute exactly one iteration of the trusted displayed template.
            exec(q["code"] + "\n    break", env)
            expected = [env["lo"], env["hi"]]
        elif template == "trace-stack":
            stack = ast.literal_eval(re.search(r"stack = (\[.*?\])", prompt)[1])
            x = int(re.search(r"x = (\d+)", prompt)[1])
            env = {"stack": stack, "x": x}
            exec(q["code"], env)
            expected = env["stack"]
        else:
            nums = ast.literal_eval(re.search(r"nums = (\[.*?\])", prompt)[1])
            env = {"nums": nums, "window_sum": sum(nums[:3])}
            exec(q["code"], env)
            expected = env["window_sum"]
        answer = next(o["text"] for o in q["options"] if o["id"] == q["answer"])
        assert json.loads(answer) == expected
        assert len(q["options"]) >= 2
        assert len(set(o["text"] for o in q["options"])) == len(q["options"])


@pytest.mark.parametrize("template,function", [("break-last", "has_duplicate"),
    ("break-max", "maximum"), ("break-search", "search")])
def test_counterexamples_match_displayed_code(template, function):
    import random
    rng = random.Random(7)
    for seed in range(50):
        q = practice.question(template, seed)
        env = {}
        exec(q["code"], env)
        cases = [q["example"], [1, 2, 3], [-3, -2, -1], [1]]
        cases += [[rng.randint(-10, 10) for _ in range(6)] for _ in range(10)]
        for nums in cases:
            if template == "break-search":
                nums = sorted(set(nums))
            result = practice.counterexample(q, nums)
            assert result["actual"] == env[function](nums)
            assert result["correct"] == (result["actual"] != result["expected"])
        assert practice.grade(q, json.dumps(q["example"]))["correct"]


@pytest.mark.parametrize("answer", ["[]", "[true]", "[1.0]", "[101]", "null", "{}", "nope", "[1," , str([1]*13)])
def test_invalid_arrays_are_not_graded(answer):
    with pytest.raises(ValueError):
        practice.grade(practice.question("break-max", 0), answer)


def test_invalid_search_input_and_ids():
    with pytest.raises(ValueError, match="strictly increasing"):
        practice.grade(practice.question("break-search", 0), "[2, 1]")
    for question_id in ["", "v2:break-last:1", "v1:missing:1", "v1:break-last:-1", "v1:break-last:4294967296", "v1:break-last:01"]:
        with pytest.raises(ValueError):
            practice.from_id(question_id)


def test_missing_piece_keys_behave_correctly():
    def implementation(template):
        q = practice.question(template, 0)
        key = next(o["text"] for o in q["options"] if o["id"] == q["answer"])
        return q["code"].replace("___", key)

    env = {}
    exec(implementation("fill-search"), env)
    for nums in [[], [1], [-2, 0, 5, 9], list(range(100))]:
        for target in range(-3, 102):
            assert env["search"](nums, target) == (nums.index(target) if target in nums else -1)
    for text in ["", "abba", "abcabcbb", "aaaa", "abca"]:
        env = {"text": text}
        exec(implementation("fill-window"), env)
        assert len(text[env["left"]:]) == len(set(text[env["left"]:]))
    from collections import deque
    env = {"start": 0, "graph": {0: [1, 2], 1: [2], 2: [0]}, "deque": deque}
    exec(implementation("fill-bfs"), env)
    assert env["seen"] == {0, 1, 2}
    env = {"n": 6}
    exec(implementation("fill-dp"), env)
    assert env["ways"] == [1, 1, 2, 3, 5, 8, 13]


def test_expanded_corpus_inventory_and_content():
    from collections import Counter
    from server import neetcode150, practice_bank

    entries = practice.catalog()['exercises']
    assert len(entries) == 202
    assert Counter(e['mode'] for e in entries) == {'break': 24, 'trace': 47, 'fill': 62, 'approach': 69}
    assert sum(e['variants'] for e in entries) == 54
    assert {e['topic'] for e in entries} == set(neetcode150.CATEGORY_ORDER)
    assert len(practice_bank.CHOICES) == 123
    for template in practice_bank.CHOICES:
        q = practice.question(template, 1)
        assert len(q['options']) == 4
        assert q['explanation']
        assert q['code'].count('___') == (1 if q['mode'] == 'fill' else 0)


@pytest.mark.parametrize('template', [e['id'] for e in practice.catalog()['exercises'] if e['variants']])
def test_variation_labels_mean_different_visible_questions(template):
    # Shuffling choices or varying a hidden reveal example is not a new question.
    visible = {(q['prompt'], q['code']) for seed in range(40)
               for q in [practice.question(template, seed)]}
    assert len(visible) >= 2


@pytest.mark.parametrize('template', [key for key in practice.practice_generated.TEMPLATES if key.startswith('trace-')])
def test_new_traces_match_execution_for_many_seeds(template):
    for seed in range(300):
        q = practice.question(template, seed)
        env = {}
        exec(q['code'], env)
        key = next(o['text'] for o in q['options'] if o['id'] == q['answer'])
        assert json.loads(key) == env['result'], (template, seed)
        assert 2 <= len(q['options']) <= 4
        assert len({o['text'] for o in q['options']}) == len(q['options'])
        assert practice.from_id(q['id']) == q
        assert 'result' not in practice.public_question(q)


@pytest.mark.parametrize('template', [key for key in practice.practice_generated.TEMPLATES
                                      if key.startswith('break-') and key not in practice.practice_generated.MORE_BREAKS])
def test_new_counterexamples_against_displayed_code_and_reference(template):
    import itertools
    import random
    from math import prod
    rng = random.Random(18)
    for seed in range(30):
        q = practice.question(template, seed)
        env = {}
        exec(q['code'], env)
        arrays = [q['example'], [0], [1, 1], [-1], [-2, 3, -1], [2, 1, 2]]
        arrays += [[rng.randint(-5, 5) for _ in range(rng.randint(1, 8))] for _ in range(20)]
        for nums in arrays:
            if template == 'break-profit-order':
                nums = [abs(x) for x in nums]
            graded = practice.counterexample(q, nums)
            assert graded['actual'] == env['buggy'](nums), (template, seed, nums)
            if template == 'break-pair-self':
                expected = any(a + b == q['target'] for a, b in itertools.combinations(nums, 2))
            elif template in {'break-prefix-frequency', 'break-kadane-empty'}:
                sums = [sum(nums[a:b]) for a in range(len(nums)) for b in range(a + 1, len(nums) + 1)]
                expected = sums.count(q['target']) if template == 'break-prefix-frequency' else max(sums)
            elif template == 'break-product-zero':
                expected = [prod(x for j, x in enumerate(nums) if j != i) for i in range(len(nums))]
            elif template == 'break-profit-order':
                lowest, expected = nums[0], 0
                for price in nums[1:]:
                    expected = max(expected, price - lowest)
                    lowest = min(lowest, price)
            else:
                distinct = sorted(set(nums), reverse=True)
                expected = distinct[1] if len(distinct) > 1 else None
            assert graded['expected'] == expected
            assert graded['correct'] == (expected != env['buggy'](nums))
        assert practice.grade(q, json.dumps(q['example']))['correct']
        reveal = practice.grade(q, reveal=True)
        assert reveal['revealed'] and not reveal['correct']
    if template == 'break-profit-order':
        with pytest.raises(ValueError, match='Prices'):
            practice.grade(q, '[-1, 2]')


def _new_fill(template):
    q = practice.question(template, 0)
    answer = next(o['text'] for o in q['options'] if o['id'] == q['answer'])
    env = {}
    exec(q['code'].replace('___', answer), env)
    return env


def test_new_array_fill_keys_against_brute_force():
    import bisect
    import itertools
    from math import prod

    lower = _new_fill('fill-lower-bound')['lower_bound']
    count = _new_fill('fill-prefix-count')['count_sums']
    pair = _new_fill('fill-two-sum')['has_pair']
    prefix = _new_fill('fill-product-prefix')['prefixes']
    for size in range(5):
        for values in itertools.product([-1, 0, 1], repeat=size):
            nums = list(values)
            assert prefix(nums) == [prod(nums[:i]) for i in range(size)]
            for k in range(-2, 3):
                assert lower(sorted(nums), k) == bisect.bisect_left(sorted(nums), k)
                assert count(nums, k) == sum(sum(nums[a:b]) == k for a in range(size) for b in range(a + 1, size + 1))
                assert pair(nums, k) == any(a + b == k for a, b in itertools.combinations(nums, 2))


def test_new_structure_fill_keys():
    from types import SimpleNamespace as Node
    import random
    reverse = _new_fill('fill-reverse-list')['reverse']
    for size in range(6):
        head = None
        for value in reversed(range(size)):
            head = Node(val=value, next=head)
        curr = reverse(head)
        result = []
        while curr is not None:
            result.append(curr.val)
            curr = curr.next
            assert len(result) <= size
        assert result == list(reversed(range(size)))

    tree = lambda value, left=None, right=None: Node(val=value, left=left, right=right)
    depth = _new_fill('fill-tree-depth')['depth']
    valid = _new_fill('fill-bst-bounds')['valid']
    assert depth(None) == 0
    assert depth(tree(10, tree(5, tree(2)), tree(15))) == 3
    assert valid(tree(10, tree(5, tree(2), tree(8)), tree(15)))
    assert not valid(tree(10, tree(5, right=tree(12))))
    assert not valid(tree(10, right=tree(15, tree(8))))
    assert not valid(tree(10, tree(10)))

    contains = _new_fill('fill-trie-word')['contains']
    root = Node(children={}, is_word=False)
    for word in ['car', 'cart', 'dog', '']:
        node = root
        for ch in word:
            node = node.children.setdefault(ch, Node(children={}, is_word=False))
        node.is_word = True
    for word in ['', 'c', 'ca', 'car', 'cart', 'dog', 'do', 'cat']:
        assert contains(root, word) == (word in {'car', 'cart', 'dog', ''})

    largest = _new_fill('fill-heap-k')['largest_k']
    rng = random.Random(22)
    for _ in range(80):
        nums = [rng.randint(-5, 5) for _ in range(rng.randint(0, 15))]
        k = rng.randint(1, 8)
        assert largest(nums, k) == sorted(nums)[-k:]


def test_new_graph_fill_keys():
    import itertools
    order = _new_fill('fill-topological')['order']
    edges = list(itertools.combinations(range(4), 2))
    for mask in range(1 << len(edges)):
        graph, indegree = [[] for _ in range(4)], [0] * 4
        for i, (a, b) in enumerate(edges):
            if mask & (1 << i):
                graph[a].append(b)
                indegree[b] += 1
        result = order(graph, indegree)
        assert sorted(result) == list(range(4))
        positions = {v: i for i, v in enumerate(result)}
        assert all(positions[a] < positions[b] for a, row in enumerate(graph) for b in row)

    union = _new_fill('fill-union-roots')['union']
    parent = [0, 0, 1, 3, 3]
    union(parent, 2, 4)
    def root(x):
        for _ in range(len(parent)):
            if parent[x] == x:
                return x
            x = parent[x]
        raise AssertionError('cycle in parent array')
    assert len({root(x) for x in range(5)}) == 1
    union(parent, 2, 4)
    assert len({root(x) for x in range(5)}) == 1


def test_new_dp_and_backtracking_fill_keys():
    import itertools
    combinations = _new_fill('fill-coin-combinations')['combinations']
    for coins in [[1], [2], [1, 2], [2, 3], [1, 3, 4]]:
        for amount in range(10):
            expected = sum(sum(c * n for c, n in zip(coins, counts)) == amount
                           for counts in itertools.product(range(amount + 1), repeat=len(coins)))
            assert combinations(coins, amount) == expected
    best = _new_fill('fill-knapsack-direction')['best_value']
    for items in [[], [(2, 3)], [(1, 2), (3, 5), (2, 4)], [(2, 3), (2, 3)]]:
        for capacity in range(10):
            subsets = [s for n in range(len(items) + 1) for s in itertools.combinations(items, n)]
            expected = max(sum(v for w, v in s) for s in subsets if sum(w for w, v in s) <= capacity)
            assert best(items, capacity) == expected
    subsets = _new_fill('fill-backtrack-copy')['subsets']
    for size in range(6):
        nums = list(range(size))
        result = subsets(nums)
        expected = {s for n in range(size + 1) for s in itertools.combinations(nums, n)}
        assert {tuple(s) for s in result} == expected
        assert len({id(s) for s in result}) == len(result)


def test_merge_key_handles_nested_touching_and_separate_intervals():
    merge = _new_fill('fill-merge-end')['merge']
    for intervals, expected in [([], []), ([[1, 10], [2, 3]], [[1, 10]]),
        ([[5, 7], [1, 3], [3, 5]], [[1, 7]]), ([[1, 2], [4, 5]], [[1, 2], [4, 5]]),
        ([[2, 2], [2, 2]], [[2, 2]])]:
        assert merge(intervals) == expected


def _lis_brute(nums):
    import itertools
    return max(len(c) for n in range(1, len(nums) + 1) for c in itertools.combinations(nums, n)
               if all(a < b for a, b in zip(c, c[1:])))


def _break_reference(template, q, nums):
    """Independent brute-force answers for the builder-style break templates."""
    import itertools
    from collections import Counter
    n = len(nums)
    if template == 'break-window-if':
        return min((b - a for a in range(n) for b in range(a + 1, n + 1) if sum(nums[a:b]) >= q['target']), default=0)
    if template == 'break-rotated-min':
        return min(nums)
    if template == 'break-next-greater':
        return [next((y for y in nums[i + 1:] if y > x), None) for i, x in enumerate(nums)]
    if template == 'break-greedy-coins':
        amount = q['target']
        return min((size for size in range(1, amount + 1)
                    for c in itertools.combinations_with_replacement(nums, size) if sum(c) == amount), default=-1)
    if template == 'break-rob-parity':
        return max(sum(nums[i] for i in chosen) for size in range(n + 1) for chosen in itertools.combinations(range(n), size)
                   if all(b - a > 1 for a, b in zip(chosen, chosen[1:])))
    if template == 'break-majority':
        value, count = Counter(nums).most_common(1)[0]
        return value if count > n / 2 else None
    if template == 'break-lis-run':
        return _lis_brute(nums)
    if template == 'break-adjacent-distinct':
        return len(set(nums))
    if template == 'break-unsorted-pointers':
        return any(a + b == q['target'] for a, b in itertools.combinations(nums, 2))
    if template == 'break-insert-position':
        return sum(x < q['target'] for x in nums)
    if template == 'break-remove-while-iterating':
        return [x for x in nums if x % 2 != 0]
    if template == 'break-flip-restart':
        return max(len(run) for i in range(n) for j in range(i + 1, n + 1) for run in [nums[i:j]] if run.count(0) <= 1)
    if template == 'break-unsorted-merge':
        pairs = sorted((nums[i], nums[i + 1]) for i in range(0, n, 2))
        groups = 0
        for i, (start, end) in enumerate(pairs):
            groups += all(end2 < start for _, end2 in pairs[:i])
        return groups
    if template == 'break-power-zero':
        return [x in {1, 2, 4, 8, 16, 32, 64} for x in nums]
    assert template == 'break-longest-jump'
    frontier, jumps = {0}, 0
    while n - 1 not in frontier:
        frontier = {j for i in frontier for j in range(i, min(n, i + nums[i] + 1))}
        jumps += 1
    return jumps


def _valid_break_input(template, rng):
    if template == 'break-window-if':
        return [rng.randint(1, 12) for _ in range(rng.randint(1, 7))]
    if template == 'break-rotated-min':
        base = sorted(rng.sample(range(-20, 20), rng.randint(1, 7)))
        k = rng.randrange(len(base))
        return base[k:] + base[:k]
    if template == 'break-greedy-coins':
        return rng.sample(range(1, 9), rng.randint(1, 3))
    if template == 'break-rob-parity':
        return [rng.randint(0, 9) for _ in range(rng.randint(1, 7))]
    if template == 'break-insert-position':
        return sorted(rng.sample(range(-60, 60), rng.randint(1, 7)))
    if template == 'break-flip-restart':
        return [rng.randint(0, 1) for _ in range(rng.randint(1, 9))]
    if template == 'break-unsorted-merge':
        return [x for _ in range(rng.randint(1, 4)) for s in [rng.randint(0, 12)] for x in (s, s + rng.randint(0, 4))]
    if template == 'break-longest-jump':
        return [rng.randint(1, 3) for _ in range(rng.randint(1, 8))]
    if template == 'break-power-zero':
        return [rng.choice([0, 1, 2, 3, 4, 6, 8, 64, -2, -8]) for _ in range(rng.randint(1, 5))]
    return [rng.randint(-4, 4) for _ in range(rng.randint(1, 7))]


@pytest.mark.parametrize('template', list(practice.practice_generated.MORE_BREAKS))
def test_builder_breaks_against_displayed_code_and_brute_force(template):
    import random
    rng = random.Random(template)
    for seed in range(12):
        q = practice.question(template, seed)
        env = {}
        exec(q['code'], env)
        for nums in [q['example']] + [_valid_break_input(template, rng) for _ in range(25)]:
            graded = practice.counterexample(q, nums)
            assert graded['actual'] == env['buggy'](nums), (template, seed, nums)
            assert graded['expected'] == _break_reference(template, q, nums), (template, seed, nums)
        assert practice.grade(q, json.dumps(q['example']))['correct']
    invalid = {'break-window-if': '[0, 5]', 'break-rotated-min': '[2, 1, 3]',
               'break-greedy-coins': '[2, 2]', 'break-rob-parity': '[-1, 2]',
               'break-insert-position': '[3, 1]', 'break-flip-restart': '[2, 1]',
               'break-unsorted-merge': '[5, 1]', 'break-longest-jump': '[0, 1]'}
    if template in invalid:
        with pytest.raises(ValueError):
            practice.grade(q, invalid[template])


def _fill_options(template):
    """Yield (is_key, namespace) for the code completed with each option."""
    from types import SimpleNamespace
    q = practice.question(template, 0)
    for o in q['options']:
        env = {'Node': lambda val, next=None: SimpleNamespace(val=val, next=next)}
        exec(q['code'].replace('___', o['text']), env)
        yield o['id'] == q['answer'], o['text'], env


def _linked(values):
    from types import SimpleNamespace
    head = None
    for v in reversed(values):
        head = SimpleNamespace(val=v, next=head)
    return head


def _unlinked(head):
    out = []
    while head is not None:
        out.append(head.val)
        head = head.next
    return out


def _tree(spec):
    # spec: (val, left_spec, right_spec) or None
    from types import SimpleNamespace
    if spec is None:
        return None
    val, left, right = spec
    return SimpleNamespace(val=val, left=_tree(left), right=_tree(right))


def _check_fill(template, env):
    import copy
    import itertools
    import random
    rng = random.Random(template)
    if template == 'fill-three-sum-skip':
        for size in range(7):
            for nums in itertools.product(range(-2, 3), repeat=size) if size < 6 else [tuple(rng.randint(-3, 3) for _ in range(6)) for _ in range(300)]:
                out = env['three_sum'](list(nums))
                want = {tuple(sorted(c)) for c in itertools.combinations(nums, 3) if sum(c) == 0}
                assert sorted(map(tuple, out)) == sorted(want)
    elif template == 'fill-min-stack':
        for _ in range(200):
            s, model = env['MinStack'](), []
            for _ in range(12):
                if model and rng.random() < 0.4:
                    s.pop()
                    model.pop()
                else:
                    x = rng.randint(-5, 5)
                    s.push(x)
                    model.append(x)
                if model:
                    assert s.get_min() == min(model)
    elif template == 'fill-warmer-days':
        for size in range(7):
            for temps in itertools.product(range(3), repeat=size):
                want = [next((j - i for j in range(i + 1, size) if temps[j] > temps[i]), 0) for i in range(size)]
                assert env['wait_days'](list(temps)) == want
    elif template == 'fill-rotated-half':
        for size in range(1, 8):
            base = list(range(0, 2 * size, 2))
            for k in range(size):
                nums = base[k:] + base[:k]
                for target in range(-1, 2 * size + 1):
                    assert env['search'](nums, target) == (nums.index(target) if target in nums else -1)
    elif template == 'fill-cycle-guard':
        from types import SimpleNamespace
        for size in range(6):
            assert env['has_cycle'](_linked(list(range(size)))) is False
            for back in range(size):
                nodes = [SimpleNamespace(val=i, next=None) for i in range(size)]
                for a, b in zip(nodes, nodes[1:]):
                    a.next = b
                nodes[-1].next = nodes[back]
                assert env['has_cycle'](nodes[0]) is True
    elif template == 'fill-merge-tail':
        for _ in range(200):
            a = sorted(rng.randint(0, 9) for _ in range(rng.randint(0, 5)))
            b = sorted(rng.randint(0, 9) for _ in range(rng.randint(0, 5)))
            assert _unlinked(env['merge'](_linked(a), _linked(b))) == sorted(a + b)
    elif template == 'fill-level-width':
        spec = (1, (2, (4, None, None), None), (3, None, (5, (6, None, None), None)))
        assert env['levels'](_tree(spec)) == [[1], [2, 3], [4, 5], [6]]
        assert env['levels'](None) == []
        assert env['levels'](_tree((1, (2, (3, None, None), None), None))) == [[1], [2], [3]]
    elif template == 'fill-diameter':
        assert env['diameter'](_tree((1, None, None))) == 0
        assert env['diameter'](_tree((1, (2, None, None), None))) == 1
        assert env['diameter'](_tree((1, (2, (4, None, None), (5, None, None)), (3, None, None)))) == 3
        deep = (1, (2, (3, (4, None, None), None), (5, None, (6, None, None))), None)
        assert env['diameter'](_tree(deep)) == 4
    elif template == 'fill-trie-wildcard':
        from types import SimpleNamespace
        words = {'bad', 'dad', 'mad', 'ma', 'b'}
        root = SimpleNamespace(children={}, is_word=False)
        for word in words:
            node = root
            for ch in word:
                node = node.children.setdefault(ch, SimpleNamespace(children={}, is_word=False))
            node.is_word = True
        import re
        for pattern in ['bad', '.ad', 'b..', '..', '.', '...', 'pad', 'ba', 'b.d.', '', 'm.']:
            assert env['search'](root, pattern) == any(re.fullmatch(pattern, w) for w in words), pattern
    elif template == 'fill-heap-tiebreak':
        for _ in range(100):
            lists = [sorted(rng.randint(0, 4) for _ in range(rng.randint(0, 4))) for _ in range(rng.randint(0, 4))]
            assert env['merge_k']([_linked(v) for v in lists]) == sorted(sum(lists, []))
    elif template == 'fill-permutation-used':
        for size in range(5):
            nums = [10 + 3 * i for i in range(size)]
            assert sorted(env['permutations'](nums)) == sorted(map(list, itertools.permutations(nums)))
    elif template == 'fill-combination-reuse':
        for cands in [[2], [2, 3], [2, 3, 6, 7], [3, 5, 1]]:
            for target in range(1, 11):
                out = env['combination_sum'](cands, target)
                want = {tuple(sorted(c)) for size in range(1, target + 1)
                        for c in itertools.combinations_with_replacement(cands, size) if sum(c) == target}
                assert sorted(tuple(sorted(c)) for c in out) == sorted(want)
    elif template == 'fill-island-bounds':
        def reference(grid):
            rows, cols, seen, count = len(grid), len(grid[0]), set(), 0
            for r, c in itertools.product(range(rows), range(cols)):
                if grid[r][c] and (r, c) not in seen:
                    count, stack = count + 1, [(r, c)]
                    seen.add((r, c))
                    while stack:
                        y, x = stack.pop()
                        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                            if 0 <= ny < rows and 0 <= nx < cols and grid[ny][nx] and (ny, nx) not in seen:
                                seen.add((ny, nx))
                                stack.append((ny, nx))
            return count
        grids = [[[1, 0, 1]], [[1], [0], [1]], [[1, 1], [0, 1]]]
        grids += [[[rng.randint(0, 1) for _ in range(4)] for _ in range(3)] for _ in range(150)]
        for grid in grids:
            assert env['islands'](copy.deepcopy(grid)) == reference(grid)
    elif template == 'fill-dijkstra-improve':
        for _ in range(150):
            n = rng.randint(1, 6)
            graph = {u: [(v, rng.randint(0, 9)) for v in range(n) if v != u and rng.random() < 0.5] for u in range(n)}
            dist = {0: 0}
            for _ in range(n):
                for u in list(dist):
                    for v, w in graph[u]:
                        if dist[u] + w < dist.get(v, float('inf')):
                            dist[v] = dist[u] + w
            assert env['shortest'](graph, 0) == dist
        tricky = {0: [(1, 10), (2, 1)], 1: [], 2: [(1, 1)]}
        assert env['shortest'](tricky, 0) == {0: 0, 1: 2, 2: 1}
    elif template == 'fill-lis-condition':
        for size in range(7):
            for nums in itertools.product(range(3), repeat=size):
                assert env['lis'](list(nums)) == (_lis_brute(nums) if nums else 0)
    elif template == 'fill-rob-rolling':
        for size in range(7):
            for nums in itertools.product(range(3), repeat=size):
                best = max(sum(nums[i] for i in chosen) for k in range(size + 1) for chosen in itertools.combinations(range(size), k)
                           if all(b - a > 1 for a, b in zip(chosen, chosen[1:])))
                assert env['rob'](list(nums)) == best
    elif template == 'fill-edit-mismatch':
        from functools import lru_cache
        def reference(a, b):
            @lru_cache(None)
            def go(i, j):
                if i == len(a) or j == len(b):
                    return len(a) - i + len(b) - j
                if a[i] == b[j]:
                    return go(i + 1, j + 1)
                return 1 + min(go(i + 1, j), go(i, j + 1), go(i + 1, j + 1))
            return go(0, 0)
        words = ['', 'a', 'b', 'ab', 'ba', 'abc', 'horse', 'ros', 'intention', 'execution']
        for a, b in itertools.product(words, repeat=2):
            assert env['edit_distance'](a, b) == reference(a, b)
    elif template == 'fill-jump-stuck':
        for size in range(1, 7):
            for nums in itertools.product(range(3), repeat=size):
                reach = {0}
                for i in range(size):
                    if i in reach:
                        reach |= set(range(i, i + nums[i] + 1))
                assert env['can_reach_end'](list(nums)) == (size - 1 in reach)
    elif template == 'fill-gas-restart':
        for _ in range(400):
            n = rng.randint(1, 5)
            gas = [rng.randint(0, 5) for _ in range(n)]
            cost = [rng.randint(0, 5) for _ in range(n)]
            def completes(s):
                tank = 0
                for k in range(n):
                    tank += gas[(s + k) % n] - cost[(s + k) % n]
                    if tank < 0:
                        return False
                return True
            got = env['start_station'](gas, cost)
            assert completes(got) if got != -1 else not any(map(completes, range(n)))
    elif template == 'fill-erase-overlap':
        for _ in range(200):
            intervals = [(s, s + rng.randint(1, 3)) for s in (rng.randint(0, 6) for _ in range(rng.randint(0, 6)))]
            keep = max(k for k in range(len(intervals) + 1) for c in itertools.combinations(sorted(intervals), k)
                       if all(a[1] <= b[0] for a, b in zip(c, c[1:])))
            assert env['min_removals'](intervals) == len(intervals) - keep
    elif template == 'fill-rotate-reverse':
        for n in range(1, 5):
            m = [[r * n + c for c in range(n)] for r in range(n)]
            want = [list(col)[::-1] for col in zip(*m)]
            env['rotate'](m)
            assert m == want
    elif template == 'fill-fast-power':
        for base in range(-3, 4):
            for exp in range(12):
                assert env['power'](base, exp) == base ** exp
    elif template == 'fill-reverse-digits':
        for n in range(1500):
            assert env['reverse_digits'](n) == int(str(n)[::-1])
    elif template == 'fill-count-bits':
        for n in range(600):
            assert env['ones'](n) == bin(n).count('1')
    elif template == 'fill-missing-xor':
        for size in range(1, 7):
            for gone in range(size + 1):
                nums = [x for x in range(size + 1) if x != gone]
                rng.shuffle(nums)
                assert env['missing'](nums) == gone
    elif template == 'fill-anagram-key':
        words = ['eat', 'tea', 'tan', 'ate', 'nat', 'bat', 'aab', 'abb', 'bab', 'ab', 'ba', '']
        want = sorted(sorted(g) for g in {tuple(sorted(w)): [v for v in words if sorted(v) == sorted(w)] for w in words}.values())
        assert sorted(sorted(g) for g in env['group'](words)) == want
    elif template == 'fill-top-k-buckets':
        from collections import Counter
        for _ in range(300):
            nums = [rng.randint(0, 5) for _ in range(rng.randint(1, 12))]
            ranked = Counter(nums).most_common()
            k = rng.randint(1, len(ranked))
            if k < len(ranked) and ranked[k - 1][1] == ranked[k][1]:
                continue  # the top k is ambiguous
            assert sorted(env['top_k'](nums, k)) == sorted(x for x, _ in ranked[:k])
    elif template == 'fill-brackets-end':
        for size in range(7):
            for chars in itertools.product('()[]', repeat=size):
                s = ''.join(chars)
                t = s
                while '()' in t or '[]' in t:
                    t = t.replace('()', '').replace('[]', '')
                assert env['valid'](s) == (t == '')
    elif template == 'fill-matrix-index':
        for rows, cols in [(1, 1), (1, 4), (3, 1), (2, 3), (3, 5), (4, 2)]:
            m = [[2 * (r * cols + c) for c in range(cols)] for r in range(rows)]
            for target in range(-1, 2 * rows * cols + 1):
                assert env['search'](m, target) == (target % 2 == 0 and 0 <= target < 2 * rows * cols)
    elif template == 'fill-eating-hours':
        from math import ceil
        for _ in range(300):
            piles = [rng.randint(1, 20) for _ in range(rng.randint(1, 5))]
            h = rng.randint(len(piles), 25)
            assert env['min_speed'](piles, h) == min(s for s in range(1, 21) if sum(ceil(p / s) for p in piles) <= h)
    elif template == 'fill-nth-lead':
        for size in range(1, 7):
            for n in range(1, size + 1):
                vals = list(range(size))
                assert _unlinked(env['remove_nth'](_linked(vals), n)) == vals[:size - n] + vals[size - n + 1:]
    elif template == 'fill-invert-tree':
        spec = (1, (2, (4, None, None), (5, None, None)), (3, None, (6, None, None)))
        def mirror(t):
            return None if t is None else (t[0], mirror(t[2]), mirror(t[1]))
        def as_spec(node):
            return None if node is None else (node.val, as_spec(node.left), as_spec(node.right))
        assert as_spec(env['invert'](_tree(spec))) == mirror(spec)
        assert env['invert'](None) is None
    elif template == 'fill-same-tree':
        shapes = [None, (1, None, None), (1, (2, None, None), None), (1, None, (2, None, None)),
                  (2, None, None), (1, (2, None, None), (3, None, None)), (1, (3, None, None), (2, None, None))]
        for a, b in itertools.product(shapes, repeat=2):
            assert env['same'](_tree(a), _tree(b)) == (a == b)
    elif template == 'fill-task-idle':
        from collections import Counter
        def simulate(tasks, n):
            counts, time, ready = Counter(tasks), 0, {}
            while counts:
                choices = [t for t in counts if ready.get(t, 0) <= time]
                if choices:
                    t = max(choices, key=lambda t: counts[t])
                    counts[t] -= 1
                    if not counts[t]:
                        del counts[t]
                    ready[t] = time + n + 1
                time += 1
            return time
        for _ in range(300):
            tasks = [rng.choice('ABCD') for _ in range(rng.randint(1, 9))]
            n = rng.randint(0, 3)
            assert env['least_time'](tasks, n) == simulate(tasks, n)
    elif template == 'fill-subsets-dupes':
        for size in range(6):
            for nums in itertools.product(range(3), repeat=size):
                want = {tuple(sorted(c)) for k in range(size + 1) for c in itertools.combinations(nums, k)}
                out = [tuple(x) for x in env['subsets'](list(nums))]
                assert len(out) == len(set(out)) and set(out) == want
    elif template == 'fill-cycle-colors':
        pairs = [(a, b) for a in range(4) for b in range(4) if a != b]
        for _ in range(400):
            edges = rng.sample(pairs, rng.randint(0, 6))
            def acyclic():
                indegree = [0] * 4
                for _, b in edges:
                    indegree[b] += 1
                ready = [v for v in range(4) if indegree[v] == 0]
                seen = 0
                while ready:
                    v = ready.pop()
                    seen += 1
                    for a, b in edges:
                        if a == v:
                            indegree[b] -= 1
                            if indegree[b] == 0:
                                ready.append(b)
                return seen == 4
            assert env['has_cycle'](4, edges) == (not acyclic())
        assert env['has_cycle'](4, [(0, 1), (0, 2), (1, 3), (2, 3)]) is False
    elif template == 'fill-rounds-copy':
        flights = [(0, 1, 100), (1, 2, 100), (0, 2, 500)]
        assert env['cheapest'](3, flights, 0, 2, 1) == 200
        assert env['cheapest'](3, flights, 0, 2, 0) == 500
        for _ in range(200):
            n = rng.randint(2, 5)
            flights = [(a, b, rng.randint(1, 9)) for a in range(n) for b in range(n) if a != b and rng.random() < 0.4]
            k = rng.randint(0, 3)
            best = min((sum(p for _, _, p in path) for length in range(1, k + 2)
                        for path in itertools.product(flights, repeat=length)
                        if path[0][0] == 0 and path[-1][1] == n - 1 and all(x[1] == y[0] for x, y in zip(path, path[1:]))), default=-1)
            assert env['cheapest'](n, flights, 0, n - 1, k) == best
    elif template == 'fill-decode-pair':
        from functools import lru_cache
        for size in range(1, 6):
            for digits in itertools.product('01267', repeat=size):
                s = ''.join(digits)
                @lru_cache(None)
                def count(i):
                    if i == len(s):
                        return 1
                    total = count(i + 1) if s[i] != '0' else 0
                    if i + 2 <= len(s) and 10 <= int(s[i:i + 2]) <= 26:
                        total += count(i + 2)
                    return total
                assert env['decodings'](s) == count(0), s
    elif template == 'fill-lcs-match':
        for a, b in itertools.product(['', 'a', 'aa', 'ab', 'ba', 'abc', 'acb', 'aab'], repeat=2):
            best = max(k for k in range(len(a) + 1) for c in itertools.combinations(a, k)
                       if any(c == d for d in itertools.combinations(b, k)))
            assert env['lcs'](a, b) == best
    elif template == 'fill-partition-end':
        for size in range(1, 7):
            for chars in itertools.product('abc', repeat=size):
                s = ''.join(chars)
                cuts = [i for i in range(1, size) if not set(s[:i]) & set(s[i:])]
                bounds = [0] + cuts + [size]
                assert env['partition'](s) == [b - a for a, b in zip(bounds, bounds[1:])]
    elif template == 'fill-insert-before':
        for _ in range(400):
            starts = sorted(rng.sample(range(0, 20, 3), rng.randint(0, 5)))
            intervals = [[s, s + rng.randint(0, 1)] for s in starts]
            a = rng.randint(-2, 20)
            new = [a, a + rng.randint(0, 6)]
            merged = []
            for s, e in sorted(intervals + [new]):
                if merged and s <= merged[-1][1]:
                    merged[-1][1] = max(merged[-1][1], e)
                else:
                    merged.append([s, e])
            assert env['insert'](copy.deepcopy(intervals), new) == merged
    elif template == 'fill-pascal-row':
        from math import comb
        for n in range(10):
            assert env['pascal'](n) == [comb(n, k) for k in range(n + 1)]
    elif template == 'fill-reverse-bits':
        for n in [0, 1, 2, 3, 43261596, 2 ** 31, 2 ** 32 - 1] + [rng.randrange(2 ** 32) for _ in range(200)]:
            assert env['reverse_bits'](n) == int(f'{n:032b}'[::-1], 2)
    else:
        raise AssertionError(f'no checker for {template}')


_CHECKED_FILLS = [k for k in practice.practice_bank.CHOICES if k.startswith('fill-')][15:]
assert len(_CHECKED_FILLS) == 43 and _CHECKED_FILLS[0] == 'fill-three-sum-skip'


@pytest.mark.parametrize('template', _CHECKED_FILLS)
def test_fill_keys_pass_and_every_distractor_fails(template):
    for is_key, text, env in _fill_options(template):
        if is_key:
            _check_fill(template, env)
            continue
        try:
            _check_fill(template, env)
        except Exception:  # a wrong answer, crash or recursion error all count as failing
            continue
        raise AssertionError(f'{template}: distractor {text!r} passes the checker')


def test_authored_distractor_feedback_tracks_stable_ids():
    from server import practice, practice_feedback
    for template, notes in practice_feedback.DISTRACTORS.items():
        for seed in (1, 19):
            q = practice.question(template, seed)
            for i, note in enumerate(notes, 1):
                assert practice.grade(q, str(i))["mistake"] == note
            assert "mistake" not in practice.grade(q, "0")


def test_typed_recall_uses_safe_structural_comparison():
    from server import practice
    q = practice.question("fill-search", 1)
    assert practice.grade(q, "mid+1", recall=True)["correct"]
    assert not practice.grade(q, "mid", recall=True)["correct"]
    assert not practice.grade(q, "__import__('os').system('echo nope')", recall=True)["correct"]
    q = practice.question("trace-search", 1)
    key = next(o["text"] for o in q["options"] if o["id"] == q["answer"])
    assert practice.grade(q, key, recall=True)["correct"]


def test_walkthroughs_are_available_without_executing_snippets():
    from server import practice
    for item in practice.catalog()["exercises"]:
        q = practice.question(item["id"], 1)
        r = practice.grade(q, reveal=True)
        if q["mode"] != "approach":
            assert r["walkthrough"]
        assert "given" not in practice.public_question(q)
    q = practice.question("trace-search", 1)
    r = practice.grade(q, "0")
    assert ["lo, hi", "[0, 6]"] in r["walkthrough"]
    assert r["walkthrough"][-1] == ["Final requested state", r["solution"]]
