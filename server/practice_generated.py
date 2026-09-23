"""Additional executable exercise templates, authored and verified locally.

Production grading uses fixed Python functions, never eval/exec. Trace code is
self-contained so tests can independently execute exactly what learners see.
"""
import json


TEMPLATES = {
    "break-pair-self": ("break", "Arrays & Hashing", "Can a position pair with itself?"),
    "break-prefix-frequency": ("break", "Arrays & Hashing", "Repeated prefix sums"),
    "break-kadane-empty": ("break", "1-D DP", "A nonempty best subarray"),
    "break-product-zero": ("break", "Arrays & Hashing", "A zero in the product"),
    "break-profit-order": ("break", "Sliding Window", "Buy before selling"),
    "break-second-distinct": ("break", "Arrays & Hashing", "Second largest, but distinct"),
    "trace-prefix-range": ("trace", "Arrays & Hashing", "Subtract the right prefixes"),
    "trace-bfs-queue": ("trace", "Graphs", "Enqueue only new neighbors"),
    "trace-heap-topk": ("trace", "Heap / Priority Queue", "Update the top-k heap"),
    "trace-path-compression": ("trace", "Graphs", "Compress a parent chain"),
    "trace-kadane-step": ("trace", "1-D DP", "Extend or restart a subarray"),
    "trace-coin-update": ("trace", "1-D DP", "One reusable denomination"),
    "trace-merge-interval": ("trace", "Intervals", "Absorb an overlapping interval"),
    "trace-pair-pointers": ("trace", "Two Pointers", "Move toward the target sum"),
    "trace-clear-bit": ("trace", "Bit Manipulation", "Clear the lowest set bit"),
    "trace-backtrack-undo": ("trace", "Backtracking", "Undo a branch, keep its snapshot"),
}
VARIANTS = {key for key in TEMPLATES if key.startswith("trace-")} | {
    "break-pair-self", "break-prefix-frequency",
}


def _options(answer, distractors):
    # Colliding distractors are possible with generated data. Deduplicate values,
    # not screen strings, so every presented question has just one correct choice.
    values = []
    for x in [answer, *distractors]:
        if x not in values:
            values.append(x)
    return [json.dumps(x) for x in values[:4]]


def _near(answer):
    # Off-by-one fillers, used only when authored distractors collide.
    if isinstance(answer, int):
        return [answer + 1, answer - 1, answer + 2]
    if isinstance(answer, list) and answer and isinstance(answer[-1], int):
        return [answer[:-1] + [answer[-1] + d] for d in (1, -1, 2)]
    return []


def trace(template, rng):
    if template in MORE_TRACES:
        prompt, code, answer, distractors, explanation = MORE_TRACES[template][1](rng)
        return {"prompt": prompt, "code": code}, _options(answer, distractors + _near(answer)), explanation
    if template == "trace-prefix-range":
        nums = [rng.randint(-8, 12) for _ in range(6)]
        left = rng.randint(1, 3)
        right = rng.randint(left + 1, 6)
        answer = sum(nums[left:right])
        code = f"nums = {nums}\nleft, right = {left}, {right}\nprefix = [0]\nfor x in nums:\n    prefix.append(prefix[-1] + x)\nresult = prefix[right] - prefix[left]"
        prompt = "What is result? The range starts at left (inclusive) and ends at right (exclusive)."
        distractors = [sum(nums[:right]), sum(nums[left - 1:right]), answer + 1, answer - 1]
        explanation = f"Subtract the sum before index {left} from the sum before index {right}. This keeps nums[{left}:{right}] = {nums[left:right]}, whose sum is {answer}."
    elif template == "trace-bfs-queue":
        a, b, c, d = rng.sample(range(1, 16), 4)
        neighbors = [a, c, b, d, c]
        rng.shuffle(neighbors)
        tail = [x for i, x in enumerate(neighbors) if x not in {a, b} and x not in neighbors[:i]]
        answer = [a, b] + tail
        code = f"from collections import deque\nqueue = deque({[a, b]})\nseen = {{{a}, {b}}}\nneighbors = {neighbors}\nfor neighbor in neighbors:\n    if neighbor not in seen:\n        seen.add(neighbor)\n        queue.append(neighbor)\nresult = list(queue)"
        prompt = "The current vertex has already been removed from the BFS queue. After processing these neighbors, what is result (front to back)?"
        distractors = [[a, b] + neighbors, [a, b], tail, [a, b] + list(reversed(tail))]
        explanation = f"Keep the waiting vertices {[a, b]}. Append only newly discovered neighbors, in encounter order: {tail}. Marking on enqueue also filters a repeated neighbor."
    elif template == "trace-heap-topk":
        heap = sorted(rng.sample(range(-10, 25), 3))
        x = rng.randint(-12, 28)
        answer = sorted(heap + [x])[1]
        code = f"import heapq\nheap = {heap}  # a min-heap of the largest 3 so far\nx = {x}\nheapq.heappush(heap, x)\nif len(heap) > 3:\n    heapq.heappop(heap)\nresult = heap[0]"
        prompt = "After inserting x, what is result, the third-largest value seen so far? Duplicates count separately."
        distractors = [min(heap + [x]), max(heap + [x]), answer + 1, answer - 1]
        explanation = f"The sorted values are {sorted(heap + [x])}. Discard the smallest and read the smallest of the three retained values: {answer}. The heap's array need not be fully sorted."
    elif template == "trace-path-compression":
        chain = rng.sample(range(5), 4)
        parent = list(range(5))
        for a, b in zip(chain, chain[1:]):
            parent[a] = b
        answer = parent.copy()
        for x in chain[:-1]:
            answer[x] = chain[-1]
        code = f"parent = {parent}\ndef find(x):\n    if parent[x] != x:\n        parent[x] = find(parent[x])\n    return parent[x]\nfind({chain[0]})\nresult = parent"
        prompt = "What is the entire parent array after this find call finishes?"
        partial = parent.copy()
        partial[chain[0]] = chain[-1]
        distractors = [parent, partial, [chain[-1]] * 5, list(range(5))]
        explanation = f"The visited chain is {' → '.join(map(str, chain))}. Every visited non-root node is redirected to root {chain[-1]}; the unvisited node stays unchanged."
    elif template == "trace-kadane-step":
        ending = rng.randint(-8, 10)
        best = max(ending, rng.randint(-5, 15))
        x = rng.randint(-10, 12)
        updated = max(x, ending + x)
        answer = [updated, max(best, updated)]
        code = f"ending, best = {ending}, {best}\nx = {x}\nending = max(x, ending + x)\nbest = max(best, ending)\nresult = [ending, best]"
        prompt = "ending is the best nonempty sum ending at the previous position; best is the best anywhere so far. What is result after processing x?"
        distractors = [[ending + x, max(best, ending + x)], [x, max(best, x)], [updated, updated], [ending, best], [updated, max(best, updated) + 1]]
        explanation = f"The best sum ending here is max({x}, {ending} + {x}) = {updated}. Compare it with the old best {best}, giving {answer[1]}. Restarting does not erase the best earlier subarray."
    elif template == "trace-coin-update":
        coin = rng.randint(2, 4)
        amount = rng.randint(coin + 1, coin * 3)
        # Before this pass, denomination 1 alone gives one way to every amount.
        answer = amount // coin + 1
        code = f"ways = [1] * {amount + 1}  # combinations using only coin 1\ncoin = {coin}\nfor total in range(coin, len(ways)):\n    ways[total] += ways[total - coin]\nresult = ways[{amount}]"
        prompt = f"Now allow an unlimited number of coins worth {coin}, as well as coins worth 1. What is result, counting combinations without ordering?"
        distractors = [1, answer - 1, answer + 1, amount + 1]
        explanation = f"Choose 0 through {amount // coin} coins worth {coin}; the remaining amount is uniquely filled by ones. That gives {answer} combinations. The upward scan permits reusing this denomination."
    elif template == "trace-merge-interval":
        start = rng.randint(-5, 5)
        end = start + rng.randint(3, 10)
        incoming_start = rng.randint(start, end)
        incoming_end = incoming_start + rng.randint(0, 10)
        answer = [start, max(end, incoming_end)]
        code = f"merged = [[{start}, {end}]]\nstart, end = {incoming_start}, {incoming_end}\nif start <= merged[-1][1]:\n    merged[-1][1] = max(merged[-1][1], end)\nelse:\n    merged.append([start, end])\nresult = merged[-1]"
        prompt = "These are closed intervals; touching endpoints overlap. What is result after processing the incoming interval?"
        distractors = [[start, incoming_end], [incoming_start, incoming_end], [start, min(end, incoming_end)], [start, max(end, incoming_end) + 1]]
        explanation = f"The incoming start {incoming_start} is at most the existing end {end}, so merge. Keep the earlier start {start} and the farther end {max(end, incoming_end)}."
    elif template == "trace-pair-pointers":
        nums = sorted(rng.sample(range(-10, 25), 6))
        pair_sum = nums[0] + nums[-1]
        target = pair_sum + rng.choice([-5, -2, 2, 5])
        answer = [1, 5] if pair_sum < target else [0, 4]
        code = f"nums = {nums}\ntarget = {target}\nleft, right = 0, len(nums) - 1\ns = nums[left] + nums[right]\nif s < target:\n    left += 1\nelif s > target:\n    right -= 1\nresult = [left, right]"
        prompt = "The array is sorted. What are the pointer indices after this one update?"
        distractors = [[0, 4] if answer == [1, 5] else [1, 5], [1, 4], [0, 5]]
        explanation = f"The endpoint sum is {pair_sum}, which is {'below' if pair_sum < target else 'above'} {target}. Move {'left rightward to increase' if pair_sum < target else 'right leftward to decrease'} the sum."
    elif template == "trace-clear-bit":
        n = rng.randint(2, 63)
        answer = n & (n - 1)
        code = f"n = {n}  # binary: {n:b}\nresult = n & (n - 1)"
        prompt = "What is result in decimal? & is bitwise AND."
        distractors = [n - 1, n ^ 1, 0, answer + 1, n + 1]
        explanation = f"{n:b} AND {n - 1:b} gives {answer:b} (decimal {answer}). Subtracting one flips the trailing zeros and the lowest set bit; AND clears just that set bit."
    else:  # trace-backtrack-undo
        path = rng.sample(range(1, 15), 3)
        x = rng.randint(16, 25)
        answer = path + [x]
        code = f"path = {path}\nsaved = []\npath.append({x})\nsaved.append(path.copy())\npath.pop()\nresult = saved[0]"
        prompt = "What is result after the branch is undone?"
        distractors = [path, [], [x], path[:-1]]
        explanation = f"The saved list is a copy taken after appending {x}. Popping from path does not modify that copy, so saved[0] stays {answer}."
    return {"prompt": prompt, "code": code}, _options(answer, distractors), explanation


def broken(template, rng):
    q = {"input_type": "array", "prompt": "Give a nonempty JSON array of at most 12 integers (each between -100 and 100) that makes this function return the wrong result. "}
    if template in MORE_BREAKS:
        suffix, code, example, explanation, extra = MORE_BREAKS[template][1](rng)
        q.update(code=code, example=example, explanation=explanation, **extra)
        q["prompt"] += suffix
        return q
    if template == "break-pair-self":
        x = rng.randint(-10, 10)
        q.update(target=2 * x, example=[x],
            code=f"def buggy(nums, target={2 * x}):\n    seen = set(nums)\n    return any(target - x in seen for x in nums)",
            explanation="Putting all values in seen allows a value to match its own position. A valid pair needs two positions, even when the two values are equal.")
        q["prompt"] += f"Return whether two distinct positions sum to {2 * x}."
    elif template == "break-prefix-frequency":
        k = rng.randint(-5, 5)
        q.update(target=k, example=[0, k],
            code=f"def buggy(nums, k={k}):\n    seen = {{0}}\n    total = answer = 0\n    for x in nums:\n        total += x\n        answer += int(total - k in seen)\n        seen.add(total)\n    return answer",
            explanation="Different earlier prefixes can have the same sum. A set records only existence and undercounts subarrays; store a frequency for each prefix sum instead.")
        q["prompt"] += f"Return the number of nonempty contiguous subarrays summing to {k}."
    elif template == "break-kadane-empty":
        q.update(example=[-rng.randint(1, 9)],
            code="def buggy(nums):\n    ending = best = 0\n    for x in nums:\n        ending = max(0, ending + x)\n        best = max(best, ending)\n    return best",
            explanation="The zero initial state allows an empty subarray to beat every all-negative nonempty subarray. Initialize from the first value and require each candidate to include an element.")
        q["prompt"] += "Return the largest sum of a nonempty contiguous subarray."
    elif template == "break-product-zero":
        q.update(example=[0, rng.randint(1, 9)],
            code="def buggy(nums):\n    product = 1\n    for x in nums:\n        product *= x\n    return [product // x if x != 0 else 0 for x in nums]",
            explanation="With exactly one zero, the product excluding that zero can be nonzero. Returning zero at its position loses that result. Prefix/suffix products handle zeros without division.")
        q["prompt"] += "Return a list whose ith entry is the product of all values except nums[i]. The empty product is 1."
    elif template == "break-profit-order":
        q.update(example=[rng.randint(6, 10), rng.randint(1, 5)],
            code="def buggy(nums):\n    return max(nums) - min(nums)",
            explanation="The cheapest price can occur after the highest price. A valid trade must buy before selling; a decreasing price sequence permits no positive profit.")
        q["prompt"] += "Values are daily prices and must be between 0 and 100. Return the maximum profit from at most one buy followed by a sale on a later day, or 0 if no profitable trade exists."
    else:  # break-second-distinct
        x = rng.randint(-9, 9)
        q.update(example=[x, x],
            code="def buggy(nums):\n    if len(nums) < 2:\n        return None\n    return sorted(nums)[-2]",
            explanation="The second position in sorted order may duplicate the largest value. Rank distinct values instead; if fewer than two distinct values exist, return None.")
        q["prompt"] += "Return the second-largest distinct value, or None when fewer than two distinct values exist."
    return q


def evaluate_broken(q, nums):
    """Return (correct function result, buggy result) for bounded integer arrays."""
    template = q["template"]
    if template in MORE_BREAKS:
        return MORE_BREAKS[template][2](q, nums)
    if template == "break-pair-self":
        target = q["target"]
        expected = any(nums[i] + nums[j] == target for i in range(len(nums)) for j in range(i + 1, len(nums)))
        actual = any(target - x in set(nums) for x in nums)
    elif template == "break-prefix-frequency":
        k = q["target"]
        expected = sum(sum(nums[i:j]) == k for i in range(len(nums)) for j in range(i + 1, len(nums) + 1))
        seen, total, actual = {0}, 0, 0
        for x in nums:
            total += x
            actual += int(total - k in seen)
            seen.add(total)
    elif template == "break-kadane-empty":
        expected = max(sum(nums[i:j]) for i in range(len(nums)) for j in range(i + 1, len(nums) + 1))
        actual = max(0, expected)
    elif template == "break-product-zero":
        from math import prod
        expected = [prod(nums[:i] + nums[i + 1:]) for i in range(len(nums))]
        product = prod(nums)
        actual = [product // x if x != 0 else 0 for x in nums]
    elif template == "break-profit-order":
        if any(x < 0 for x in nums):
            raise ValueError("Prices must be integers between 0 and 100.")
        expected = max([0] + [nums[j] - nums[i] for i in range(len(nums)) for j in range(i + 1, len(nums))])
        actual = max(nums) - min(nums)
    else:  # break-second-distinct
        distinct = sorted(set(nums))
        expected = distinct[-2] if len(distinct) >= 2 else None
        actual = sorted(nums)[-2] if len(nums) >= 2 else None
    return expected, actual


# Later templates: one builder per exercise, registered below. A trace builder
# returns (prompt, code, answer, distractors, explanation); its code sets result.

def _trace_window_jump(rng):
    text = "".join(rng.choice("abcd") for _ in range(7))
    right, left, last = 6, 0, {}
    for i, ch in enumerate(text[:right]):
        if ch in last and last[ch] >= left:
            left = last[ch] + 1
        last[ch] = i
    ch = text[right]
    new_left = last[ch] + 1 if ch in last and last[ch] >= left else left
    stale = last.get(ch, -1) + 1
    code = (f"text = {text!r}\nleft, right = {left}, {right}\nlast = {last}  # latest index of each character\n"
            "ch = text[right]\nif ch in last and last[ch] >= left:\n    left = last[ch] + 1\nlast[ch] = right\n"
            "result = [left, right - left + 1]")
    prompt = "text[left:right] has no repeated character. What is result = [left, window length] after adding text[right]?"
    explanation = (f"text[right] is {ch!r}. " + (f"Its latest index {last[ch]} is inside the window, so left moves to {new_left}."
                   if new_left != left else "It does not occur inside the current window, so left stays put.")
                   + " An occurrence before left is already outside the window and must not move left backward.")
    return prompt, code, [new_left, right - new_left + 1], [[stale, right - stale + 1], [left, right - left + 1], [right, 1], [new_left, right - new_left]], explanation


def _trace_rpn(rng):
    a = rng.randint(7, 20)
    b = rng.choice([x for x in range(2, 6) if a % x])
    a, b = (-a, b) if rng.random() < 0.5 else (a, -b)
    c, op = rng.randint(1, 9), rng.choice("+-")
    tokens = [str(a), str(b), "/", str(c), op]
    apply = (lambda x, y: x + y) if op == "+" else (lambda x, y: x - y)
    answer = apply(int(a / b), c)
    code = (f"tokens = {tokens}\nstack = []\nfor t in tokens:\n    if t in {{'+', '-', '/'}}:\n        right = stack.pop()\n        left = stack.pop()\n"
            "        if t == '+':\n            stack.append(left + right)\n        elif t == '-':\n            stack.append(left - right)\n"
            "        else:\n            stack.append(int(left / right))  # truncate toward zero\n    else:\n        stack.append(int(t))\nresult = stack[-1]")
    prompt = "Evaluate these reverse Polish tokens. What is result?"
    explanation = (f"{a} / {b} is {a / b:.2f}; truncating toward zero gives {int(a / b)}, whereas // would floor to {a // b}. "
                   f"Then {int(a / b)} {op} {c} = {answer}. The first value popped is the right operand.")
    return prompt, code, answer, [apply(a // b, c), apply(c, int(a / b)), apply(int(b / a), c), answer + 1], explanation


def _trace_middle(rng):
    n = rng.randint(4, 7)
    vals = rng.sample(range(1, 30), n)
    code = (f"vals = {vals}\n# Indices stand in for nodes; index len(vals) plays the role of None.\nslow = fast = 0\n"
            "while fast < len(vals) and fast + 1 < len(vals):\n    slow += 1\n    fast += 2\nresult = vals[slow]")
    prompt = "This mirrors `while fast and fast.next` on a linked list. What is result?"
    explanation = (f"With {n} nodes, slow stops at index {n // 2}. " + ("For an even length that is the second of the two middle nodes."
                   if n % 2 == 0 else "For an odd length that is the exact middle."))
    return prompt, code, vals[n // 2], [vals[(n - 1) // 2], vals[n // 2 - 1], vals[-1], vals[min(n - 1, n // 2 + 1)]], explanation


def _trace_rob(rng):
    prev2 = rng.randint(0, 15)
    prev1 = prev2 + rng.randint(1, 10)
    x = rng.randint(1, 20)
    answer = [prev1, max(prev1, prev2 + x)]
    code = f"prev2, prev1 = {prev2}, {prev1}\nx = {x}\nprev2, prev1 = prev1, max(prev1, prev2 + x)\nresult = [prev2, prev1]"
    prompt = "prev1 is the best total through the previous house and prev2 the best through the one before. Adjacent houses cannot both be robbed. What is result after house x?"
    explanation = (f"Either skip this house and keep {prev1}, or rob it after the best non-adjacent total: {prev2} + {x} = {prev2 + x}. "
                   f"The larger is {answer[1]}, and the old prev1 shifts into prev2. The right side is evaluated before either name changes.")
    return prompt, code, answer, [[prev1, prev2 + x], [prev1, prev1 + x], [prev2, answer[1]], [prev1, max(prev1, prev2) + x]], explanation


def _trace_lcs_cell(rng):
    a = "".join(rng.choice("abc") for _ in range(4))
    b = "".join(rng.choice("abc") for _ in range(4))
    dp = [[0] * 5 for _ in range(5)]
    for i in range(1, 5):
        for j in range(1, 5):
            dp[i][j] = dp[i - 1][j - 1] + 1 if a[i - 1] == b[j - 1] else max(dp[i - 1][j], dp[i][j - 1])
    cells = [(i, j) for i in range(1, 5) for j in range(1, 5)]
    match = [c for c in cells if a[c[0] - 1] == b[c[1] - 1]]
    i, j = rng.choice(match if match and rng.random() < 0.5 else cells)
    diag, up, left = dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]
    code = (f"a, b = {a!r}, {b!r}\ni, j = {i}, {j}\ndiag, up, left = {diag}, {up}, {left}  # dp[i-1][j-1], dp[i-1][j], dp[i][j-1]\n"
            "if a[i - 1] == b[j - 1]:\n    result = diag + 1\nelse:\n    result = max(up, left)")
    prompt = "dp[i][j] is the length of the longest common subsequence of a[:i] and b[:j]. What is result = dp[i][j]?"
    same = a[i - 1] == b[j - 1]
    explanation = (f"a[{i - 1}] is {a[i - 1]!r} and b[{j - 1}] is {b[j - 1]!r}. " + (f"They match, so extend the diagonal: {diag} + 1."
                   if same else f"They differ, so skip one of them and keep the better neighbor: max({up}, {left})."))
    return prompt, code, dp[i][j], [diag + 1, max(up, left), max(up, left) + 1, diag], explanation


def _trace_grid_row(rng):
    row = [1]
    for _ in range(4):
        row.append(row[-1] + rng.randint(0, 3))
    blocked = [False] * 5
    blocked[rng.randint(1, 4)] = True
    answer, fresh, ignored = row.copy(), [], row.copy()
    for j in range(5):
        answer[j] = 0 if blocked[j] else answer[j] + (answer[j - 1] if j else 0)
        fresh.append(0 if blocked[j] else row[j] + (row[j - 1] if j else 0))
        ignored[j] += ignored[j - 1] if j else 0
    code = (f"row = {row}  # path counts for the previous grid row\nblocked = {blocked}  # obstacles in this row\n"
            "for j in range(len(row)):\n    if blocked[j]:\n        row[j] = 0\n    elif j > 0:\n        row[j] += row[j - 1]\nresult = row")
    prompt = "Paths move only right or down. row is updated in place to hold this row's path counts. What is result?"
    explanation = ("row[j] still holds the count from above, and row[j - 1] was already updated for this row, so their sum is paths from above plus from the left. "
                   f"A blocked cell has zero paths, which also cuts off the cells to its right that depend on it. The result is {answer}.")
    return prompt, code, answer, [fresh, ignored, [0 if b else x for x, b in zip(row, blocked)]], explanation


def _trace_jump(rng):
    nums = [rng.choice([0, 0, 1, 1, 2, 3]) for _ in range(6)]
    nums[0] = max(nums[0], 1)
    reach = 0
    for i, x in enumerate(nums):
        if i > reach:
            break
        reach = max(reach, i + x)
    code = (f"nums = {nums}  # nums[i] is the longest jump from i\nreach = 0\nfor i, x in enumerate(nums):\n"
            "    if i > reach:\n        break\n    reach = max(reach, i + x)\nresult = reach")
    prompt = "What is result, the farthest index reachable from index 0? It may exceed the last index."
    explanation = (f"Only indices up to reach can launch a jump. " + (f"Index {reach + 1} is never reached, so later jumps do not count." if reach + 1 < len(nums)
                   else "Every index is reachable, so each one can extend reach.") + f" The farthest reachable index is {reach}.")
    return prompt, code, reach, [max(i + x for i, x in enumerate(nums)), sum(nums), len(nums) - 1, reach + 1], explanation


def _trace_xor(rng):
    values = rng.sample(range(1, 20), 4)
    nums = values[:3] * 2 + [values[3]]
    rng.shuffle(nums)
    code = f"nums = {nums}\nresult = 0\nfor x in nums:\n    result ^= x"
    prompt = "Every value appears twice except one. What is result? ^ is bitwise XOR."
    explanation = f"XOR is associative and commutative, x ^ x = 0 and x ^ 0 = x. Each pair cancels, leaving {values[3]}."
    return prompt, code, values[3], [0, sum(nums), values[0], values[3] ^ values[0]], explanation


def _trace_rotate(rng):
    cells = rng.sample(range(1, 10), 9)
    m = [cells[0:3], cells[3:6], cells[6:9]]
    clockwise = [list(col)[::-1] for col in zip(*m)]
    code = (f"matrix = {m}\nn = len(matrix)\nfor r in range(n):\n    for c in range(r + 1, n):\n"
            "        matrix[r][c], matrix[c][r] = matrix[c][r], matrix[r][c]\nfor row in matrix:\n    row.reverse()\nresult = matrix")
    prompt = "What is result?"
    explanation = f"Transposing turns columns into rows; reversing each row then rotates the matrix 90° clockwise. The first row becomes the original first column read bottom to top: {clockwise[0]}."
    return prompt, code, clockwise, [[list(r) for r in zip(*m)][::-1], [list(r) for r in zip(*m)], [r[::-1] for r in m]], explanation


def _trace_plus_one(rng):
    size = rng.randint(2, 4)
    nines = rng.randint(1, size)
    head = [] if nines == size else [rng.randint(1, 8)] + [rng.randint(0, 8) for _ in range(size - 1 - nines)]
    digits = head + [9] * nines
    answer = [int(c) for c in str(int("".join(map(str, digits))) + 1)]
    grew = len(answer) > len(digits)
    code = (f"digits = {digits}\ni = len(digits) - 1\nwhile i >= 0 and digits[i] == 9:\n    digits[i] = 0\n    i -= 1\n"
            "if i >= 0:\n    digits[i] += 1\nelse:\n    digits.insert(0, 1)\nresult = digits")
    prompt = "digits is a nonnegative integer, most significant digit first. What is result after adding one?"
    explanation = ("Each trailing 9 becomes 0 and carries left. " + ("The carry passes every digit, so a new leading 1 is inserted."
                   if grew else "The first digit that is not 9 absorbs the carry.") + f" The result is {answer}.")
    zeroed = head + [0] * nines
    return prompt, code, answer, [digits[:-1] + [10], zeroed, answer[1:] if grew else [1] + zeroed], explanation


def _trace_rooms(rng):
    ends = sorted(rng.sample(range(3, 15), 3))
    start = ends[0] + rng.choice([-1, 0, 0, 1])
    end = start + rng.randint(2, 8)
    kept = ends[1:] if ends[0] <= start else ends
    answer = sorted(kept + [end])
    code = (f"import heapq\nends = {ends}  # min-heap: one end time per allocated room\nstart, end = {start}, {end}\n"
            "if ends[0] <= start:\n    heapq.heappop(ends)  # reuse the room that frees first\nheapq.heappush(ends, end)\nresult = sorted(ends)")
    prompt = "A meeting may start at the moment another ends. What is result after scheduling the new meeting?"
    explanation = (f"The earliest room frees at {ends[0]}. " + (f"The new meeting starts at {start}, so it reuses that room: pop {ends[0]} and push {end}."
                   if ends[0] <= start else f"The new meeting starts at {start}, before any room frees, so a new room is allocated.")
                   + f" len(ends) = {len(answer)} rooms.")
    strict = sorted((ends[1:] if ends[0] < start else ends) + [end])
    return prompt, code, answer, [strict, sorted(ends + [end]), sorted(ends[:-1] + [end]), sorted(ends[1:])], explanation


def _trace_container(rng):
    heights = [rng.randint(1, 9) for _ in range(6)]
    while heights[0] == heights[-1]:
        heights[-1] = rng.randint(1, 9)
    area = min(heights[0], heights[-1]) * 5
    answer = [area, 1, 5] if heights[0] < heights[-1] else [area, 0, 4]
    code = (f"heights = {heights}\nleft, right = 0, len(heights) - 1\nbest = 0\narea = min(heights[left], heights[right]) * (right - left)\n"
            "best = max(best, area)\nif heights[left] < heights[right]:\n    left += 1\nelse:\n    right -= 1\nresult = [best, left, right]")
    prompt = "What is result = [best, left, right] after one step of container-with-most-water?"
    wrong_move = [area, 0, 4] if answer[1] == 1 else [area, 1, 5]
    explanation = (f"The shorter wall, {min(heights[0], heights[-1])}, limits the area over width 5, giving {area}. "
                   "Moving the taller wall cannot help, because the width shrinks and the height stays capped by the shorter wall. Move the shorter one.")
    return prompt, code, answer, [wrong_move, [max(heights[0], heights[-1]) * 5] + answer[1:], [min(heights[0], heights[-1]) * 6] + answer[1:]], explanation


def _trace_dedupe(rng):
    distinct = sorted(rng.sample(range(0, 10), 4))
    nums = sorted(distinct + rng.sample(distinct, 3))
    out, write = nums.copy(), 1
    for read in range(1, len(out)):
        if out[read] != out[write - 1]:
            out[write] = out[read]
            write += 1
    code = (f"nums = {nums}\nwrite = 1\nfor read in range(1, len(nums)):\n    if nums[read] != nums[write - 1]:\n"
            "        nums[write] = nums[read]\n        write += 1\nresult = nums")
    prompt = "This removes duplicates in place from a sorted list. What is the entire list result? Nothing truncates it."
    explanation = (f"The first write = {write} slots hold the distinct values {distinct}. The slots after them keep whatever they held before; "
                   "callers must read only nums[:write].")
    return prompt, code, out, [distinct, distinct + [0] * (len(nums) - 4), nums, distinct + [distinct[-1]] * (len(nums) - 4)], explanation


def _trace_trie(rng):
    words = rng.sample(["car", "cart", "care", "cat", "dog", "do", "dot", "an", "ant", "and"], 4)
    prefixes = {w[:i] for w in words for i in range(1, len(w) + 1)}
    code = (f"words = {words}\nroot = {{}}\ncreated = 0\nfor word in words:\n    node = root\n    for ch in word:\n"
            "        if ch not in node:\n            node[ch] = {}\n            created += 1\n        node = node[ch]\nresult = created")
    prompt = "Each nested dict is a trie node. What is result, the number of nodes created (excluding the root)?"
    explanation = f"One node exists per distinct nonempty prefix. Shared prefixes share nodes, so {sum(map(len, words))} letters need only {len(prefixes)} nodes."
    return prompt, code, len(prefixes), [sum(map(len, words)), len(set("".join(words))), len(words), len(prefixes) + 1], explanation


def _trace_relax(rng):
    d = rng.randint(1, 6)
    b, c = d + rng.randint(1, 9), d + rng.randint(1, 9)
    w = [rng.randint(1, 8) for _ in range(3)]
    answer = [min(b, d + w[0]), min(c, d + w[1]), d + w[2]]
    code = (f"dist = {{'A': {d}, 'B': {b}, 'C': {c}, 'D': float('inf')}}\nedges = [('B', {w[0]}), ('C', {w[1]}), ('D', {w[2]})]  # out of A\n"
            "for node, weight in edges:\n    if dist['A'] + weight < dist[node]:\n        dist[node] = dist['A'] + weight\nresult = [dist['B'], dist['C'], dist['D']]")
    prompt = "Dijkstra has just extracted A with distance dist['A']. What is result after relaxing A's outgoing edges?"
    explanation = f"A candidate replaces a tentative distance only if it is smaller. Through A the candidates are {[d + x for x in w]}; keeping the smaller of each gives {answer}."
    return prompt, code, answer, [[d + x for x in w], w, [b, c, d + w[2]], [max(b, d + w[0]), max(c, d + w[1]), d + w[2]]], explanation


def _trace_rotated(rng):
    base = sorted(rng.sample(range(0, 40), 7))
    k = rng.randint(1, 6)
    nums = base[k:] + base[:k]
    target = nums[rng.choice([0, 1, 2, 4, 5, 6])]
    lo, hi, mid = 0, 6, 3
    if nums[lo] <= nums[mid]:
        lo, hi = (lo, mid - 1) if nums[lo] <= target < nums[mid] else (mid + 1, hi)
    else:
        lo, hi = (mid + 1, hi) if nums[mid] < target <= nums[hi] else (lo, mid - 1)
    code = (f"nums = {nums}\ntarget = {target}\nlo, hi = 0, len(nums) - 1\nmid = (lo + hi) // 2\nif nums[lo] <= nums[mid]:\n"
            "    if nums[lo] <= target < nums[mid]:\n        hi = mid - 1\n    else:\n        lo = mid + 1\nelse:\n"
            "    if nums[mid] < target <= nums[hi]:\n        lo = mid + 1\n    else:\n        hi = mid - 1\nresult = [lo, hi]")
    prompt = "nums is a rotated ascending array of distinct values. What is result = [lo, hi] after this first step?"
    left_sorted = nums[0] <= nums[3]
    explanation = (f"nums[mid] is {nums[3]}. The {'left' if left_sorted else 'right'} half is sorted, so a range test there decides whether {target} is inside it. "
                   f"The new bounds are {[lo, hi]}.")
    other = [4, 6] if [lo, hi] == [0, 2] else [0, 2]
    return prompt, code, [lo, hi], [other, [0, 6], [3, 6], [0, 3]], explanation


MORE_TRACES = {
    "trace-window-jump": (("Sliding Window", "Never move left backward"), _trace_window_jump),
    "trace-rpn-divide": (("Stack", "Truncate toward zero"), _trace_rpn),
    "trace-middle-node": (("Linked List", "Which middle?"), _trace_middle),
    "trace-rob-step": (("1-D DP", "Rob or skip one house"), _trace_rob),
    "trace-lcs-cell": (("2-D DP", "Fill one LCS cell"), _trace_lcs_cell),
    "trace-grid-row": (("2-D DP", "Roll a row of grid paths"), _trace_grid_row),
    "trace-jump-reach": (("Greedy", "The farthest reachable index"), _trace_jump),
    "trace-xor-single": (("Bit Manipulation", "Pairs cancel under XOR"), _trace_xor),
    "trace-rotate-matrix": (("Math & Geometry", "Transpose, then reverse rows"), _trace_rotate),
    "trace-plus-one": (("Math & Geometry", "Carry through the nines"), _trace_plus_one),
    "trace-meeting-rooms": (("Intervals", "Reuse a room that just freed"), _trace_rooms),
    "trace-container-step": (("Two Pointers", "Move the shorter wall"), _trace_container),
    "trace-dedupe-inplace": (("Two Pointers", "What the write pointer leaves behind"), _trace_dedupe),
    "trace-trie-nodes": (("Tries", "Shared prefixes, shared nodes"), _trace_trie),
    "trace-dijkstra-relax": (("Advanced Graphs", "Relax from the extracted vertex"), _trace_relax),
    "trace-rotated-search": (("Binary Search", "Which half is sorted?"), _trace_rotated),
}


# A break builder returns (prompt suffix, code, example, explanation, extra
# fields); its reference returns (expected, buggy result) or raises ValueError.

def _require(ok, message):
    if not ok:
        raise ValueError(message)


def _break_window_if(rng):
    t = rng.randint(8, 30)
    code = (f"def buggy(nums, target={t}):\n    best = len(nums) + 1\n    left = total = 0\n    for right, x in enumerate(nums):\n"
            "        total += x\n        if total >= target:\n            best = min(best, right - left + 1)\n"
            "            total -= nums[left]\n            left += 1\n    return 0 if best > len(nums) else best")
    return (f"Values must be positive. Return the length of the shortest contiguous subarray with sum at least {t}, or 0 if none exists.",
            code, [1, 1, t], "One removal may leave the window still at least the target. Shrink with while, not if, so every shorter qualifying window is measured.", {"target": t})


def _ref_window_if(q, nums):
    _require(all(x > 0 for x in nums), "Values must be positive integers up to 100.")
    t, n = q["target"], len(nums)
    lengths = [j - i for i in range(n) for j in range(i + 1, n + 1) if sum(nums[i:j]) >= t]
    best, left, total = n + 1, 0, 0
    for right, x in enumerate(nums):
        total += x
        if total >= t:
            best = min(best, right - left + 1)
            total -= nums[left]
            left += 1
    return min(lengths, default=0), 0 if best > n else best


def _break_rotated_min(rng):
    code = ("def buggy(nums):\n    lo, hi = 0, len(nums) - 1\n    while lo < hi:\n        mid = (lo + hi) // 2\n"
            "        if nums[mid] >= nums[lo]:\n            lo = mid + 1\n        else:\n            hi = mid\n    return nums[lo]")
    return ("The array must be a rotation (possibly by zero) of a strictly increasing array. Return its minimum.",
            code, sorted(rng.sample(range(-9, 10), 3)),
            "A left half that looks sorted does not prove the minimum is to the right: with no rotation it is at lo. Compare nums[mid] with nums[hi] instead.", {})


def _ref_rotated_min(q, nums):
    _require(any(nums[k:] + nums[:k] == sorted(set(nums)) for k in range(len(nums))),
             "The array must be a rotation of a strictly increasing array, e.g. [3, 4, 1, 2].")
    lo, hi = 0, len(nums) - 1
    while lo < hi:
        mid = (lo + hi) // 2
        lo, hi = (mid + 1, hi) if nums[mid] >= nums[lo] else (lo, mid)
    return min(nums), nums[lo]


def _break_next_greater(rng):
    a, b, c = sorted(rng.sample(range(1, 20), 3))
    code = ("def buggy(nums):\n    answer = [None] * len(nums)\n    stack = []  # indices still waiting for a greater value\n"
            "    for i, x in enumerate(nums):\n        if stack and nums[stack[-1]] < x:\n            answer[stack.pop()] = x\n"
            "        stack.append(i)\n    return answer")
    return ("For each position, return the first strictly greater value to its right, or None.", code, [b, a, c],
            "One larger value can resolve several waiting indices. Use while to pop every smaller value; an if resolves only the top one.", {})


def _ref_next_greater(q, nums):
    expected = [next((y for y in nums[i + 1:] if y > x), None) for i, x in enumerate(nums)]
    actual, stack = [None] * len(nums), []
    for i, x in enumerate(nums):
        if stack and nums[stack[-1]] < x:
            actual[stack.pop()] = x
        stack.append(i)
    return expected, actual


def _break_greedy_coins(rng):
    amount = 2 * rng.randint(3, 10)
    code = (f"def buggy(coins, amount={amount}):\n    count = 0\n    for coin in sorted(coins, reverse=True):\n"
            "        count += amount // coin\n        amount %= coin\n    return count if amount == 0 else -1")
    return (f"The array lists distinct positive coin values, each reusable. Return the fewest coins totaling {amount}, or -1 if impossible.",
            code, [1, amount // 2, amount // 2 + 1],
            "Taking the largest coin first is only safe for special coin systems. In general, use DP over amounts: best[a] = 1 + min(best[a - coin]).", {"target": amount})


def _ref_greedy_coins(q, coins):
    _require(all(c > 0 for c in coins) and len(set(coins)) == len(coins), "Coin values must be distinct positive integers.")
    amount, inf = q["target"], float("inf")
    best = [0] + [inf] * amount
    for a in range(1, amount + 1):
        best[a] = 1 + min((best[a - c] for c in coins if c <= a), default=inf)
    count, left = 0, amount
    for c in sorted(coins, reverse=True):
        count += left // c
        left %= c
    return (best[amount] if best[amount] < inf else -1), (count if left == 0 else -1)


def _break_rob_parity(rng):
    b = rng.randint(2, 9)
    a = rng.randint(1, b - 1)
    code = "def buggy(nums):\n    return max(sum(nums[0::2]), sum(nums[1::2]))"
    return ("Values must be nonnegative. Return the largest sum of values with no two adjacent positions chosen.", code, [b, a, a, b],
            "An optimal choice can skip two positions in a row, so it need not be all even or all odd positions. Use rob[i] = max(rob[i - 1], rob[i - 2] + nums[i]).", {})


def _ref_rob_parity(q, nums):
    _require(all(x >= 0 for x in nums), "Values must be nonnegative.")
    prev2 = prev1 = 0
    for x in nums:
        prev2, prev1 = prev1, max(prev1, prev2 + x)
    return prev1, max(sum(nums[0::2]), sum(nums[1::2]))


def _break_majority(rng):
    code = ("def buggy(nums):\n    candidate, count = None, 0\n    for x in nums:\n        if count == 0:\n            candidate = x\n"
            "        count += 1 if x == candidate else -1\n    return candidate")
    return ("Return the value appearing more than len(nums) / 2 times, or None if no value does.", code, rng.sample(range(-9, 10), 3),
            "Boyer–Moore voting finds the only possible majority, not proof that one exists. Without a guarantee, count the candidate in a second pass.", {})


def _ref_majority(q, nums):
    from collections import Counter
    value, count = Counter(nums).most_common(1)[0]
    candidate, votes = None, 0
    for x in nums:
        if votes == 0:
            candidate = x
        votes += 1 if x == candidate else -1
    return (value if 2 * count > len(nums) else None), candidate


def _break_lis_run(rng):
    a, b, c, d = sorted(rng.sample(range(-9, 20), 4))
    code = ("def buggy(nums):\n    best = run = 1\n    for a, b in zip(nums, nums[1:]):\n        run = run + 1 if b > a else 1\n"
            "        best = max(best, run)\n    return best")
    return ("Return the length of the longest strictly increasing subsequence. Its elements need not be adjacent.", code, [a, c, b, d],
            "This measures the longest increasing run of adjacent values. A subsequence may skip elements, so compare every earlier value (or use patience sorting).", {})


def _ref_lis_run(q, nums):
    dp = [1] * len(nums)
    for i in range(len(nums)):
        for j in range(i):
            if nums[j] < nums[i]:
                dp[i] = max(dp[i], dp[j] + 1)
    best = run = 1
    for x, y in zip(nums, nums[1:]):
        run = run + 1 if y > x else 1
        best = max(best, run)
    return max(dp), best


MORE_BREAKS = {
    "break-window-if": (("Sliding Window", "Shrink only once"), _break_window_if, _ref_window_if),
    "break-rotated-min": (("Binary Search", "A rotation by zero"), _break_rotated_min, _ref_rotated_min),
    "break-next-greater": (("Stack", "Resolve every smaller value"), _break_next_greater, _ref_next_greater),
    "break-greedy-coins": (("Greedy", "Largest coin first"), _break_greedy_coins, _ref_greedy_coins),
    "break-rob-parity": (("1-D DP", "Alternate positions aren't enough"), _break_rob_parity, _ref_rob_parity),
    "break-majority": (("Arrays & Hashing", "Majority without a guarantee"), _break_majority, _ref_majority),
    "break-lis-run": (("1-D DP", "Increasing, not adjacent"), _break_lis_run, _ref_lis_run),
}

TEMPLATES.update({k: ("trace", *meta) for k, (meta, _) in MORE_TRACES.items()})
TEMPLATES.update({k: ("break", *meta) for k, (meta, _, _) in MORE_BREAKS.items()})
VARIANTS |= set(MORE_TRACES) | {"break-window-if", "break-greedy-coins"}
