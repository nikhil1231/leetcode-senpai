"""Small, deterministic exercises. Versioned templates; no LLM or code eval.

Light-practice results deliberately live outside solve attempts and FSRS cards.
The seed reconstructs a question for grading, without storing an answer key in
the browser. Counterexamples run through fixed implementations below.
"""
import json
import random

from . import practice_bank, practice_generated


MODES = [
    {"id": "break", "title": "Find the breaking input", "description": "Give a tiny input that exposes a bug.", "duration": "1–3 min"},
    {"id": "trace", "title": "Predict the next state", "description": "Follow one step. No full solution needed.", "duration": "30–90 sec"},
    {"id": "fill", "title": "Fill the missing piece", "description": "Choose the condition or update that makes the code work.", "duration": "1–2 min"},
    {"id": "approach", "title": "Choose the approach", "description": "Match a constraint to an approach and its reason.", "duration": "1–2 min"},
]

# Each fixed-choice exercise includes the rationale in the choice: recognizing
# a category name alone is not the whole task. First option is the authored key;
# presentation order is shuffled reproducibly per question.
CHOICES = {
    "fill-search": ("fill", "Binary Search", "Keep the target in range",
        "Fill the blank so this search is correct and takes O(log n) time on every sorted array of distinct integers.",
        "def search(nums, target):\n    lo, hi = 0, len(nums) - 1\n    while lo <= hi:\n        mid = (lo + hi) // 2\n        if nums[mid] == target:\n            return mid\n        if nums[mid] < target:\n            lo = ___\n        else:\n            hi = mid - 1\n    return -1",
        ["mid + 1", "mid", "hi + 1", "lo + 1"],
        "Everything through mid is too small. mid + 1 discards it and guarantees progress. lo + 1 would also eventually find the target, but can take linear time; the required binary-search update halves the remaining range."),
    "fill-window": ("fill", "Sliding Window", "Restore a unique window",
        "Choose the loop condition that restores the no-duplicates invariant before adding ch.",
        "seen = set()\nleft = 0\nfor right, ch in enumerate(text):\n    while ___:\n        seen.remove(text[left])\n        left += 1\n    seen.add(ch)",
        ["ch in seen", "ch not in seen", "left < right", "len(seen) > 1"],
        "Remove characters until the previous occurrence of ch is outside the window. Removing just one character is not necessarily enough."),
    "fill-bfs": ("fill", "Graphs", "Visit once in BFS",
        "Fill the blank so each vertex is enqueued at most once, including in graphs with cycles.",
        "seen = {start}\nqueue = deque([start])\nwhile queue:\n    node = queue.popleft()\n    for neighbor in graph[node]:\n        if neighbor not in seen:\n            ___\n            queue.append(neighbor)",
        ["seen.add(neighbor)", "seen.add(node)", "seen.clear()", "queue.clear()"],
        "Mark a neighbor when you enqueue it. Otherwise two vertices can enqueue the same neighbor before it is processed."),
    "fill-dp": ("fill", "1-D DP", "Count stair paths",
        "You may climb one or two steps, with n >= 1. ways[i] counts paths to step i. Fill the recurrence for i >= 2.",
        "ways = [0] * (n + 1)\nways[0] = ways[1] = 1\nfor i in range(2, n + 1):\n    ways[i] = ___",
        ["ways[i - 1] + ways[i - 2]", "max(ways[i - 1], ways[i - 2])", "ways[i - 1] * 2", "ways[i - 2] + 1"],
        "Every path ends with either one step from i - 1 or two from i - 2. These disjoint sets of paths add together."),
    "approach-negative": ("approach", "Arrays & Hashing", "When negatives are allowed",
        "Count all contiguous subarrays with sum k in an unsorted integer array. Values may be negative. Which approach guarantees expected O(n) time?", "",
        ["Prefix sums + a frequency map: count earlier prefixes equal to current_sum - k.",
         "A shrinking sum window: shrink whenever the sum exceeds k.",
         "Sort the values, then move two pointers inward.",
         "Enumerate every start and end, summing incrementally."],
        "Negative values break the monotonic sum rule needed by that sliding window. Prefix differences describe subarray sums without requiring positive values; frequencies count repeated prefixes."),
    "approach-sorted": ("approach", "Two Pointers", "A pair in sorted input",
        "A sorted ascending array must remain unchanged. Find whether two distinct positions sum to a target in O(n) time and O(1) extra space. Which approach meets both bounds?", "",
        ["Two pointers at opposite ends: move the left one for a small sum, the right one for a large sum.",
         "A hash set of all earlier values: check each complement.",
         "Binary-search the complement for every position.",
         "Check every pair of positions."],
        "Sorted order makes the pointer moves safe, and each pointer moves at most n times. A hash set needs O(n) space; repeated binary search needs O(n log n) time."),
    "approach-graph": ("approach", "Graphs", "Fewest edges",
        "Find the fewest edges from one vertex to all reachable vertices in an unweighted graph with cycles, in O(V + E) time. Which approach guarantees this?", "",
        ["BFS with a queue, marking vertices when enqueued: process distances layer by layer.",
         "DFS, taking the first distance found for each vertex.",
         "Repeatedly choose the neighbor with the smallest vertex label.",
         "Enumerate every simple path, keeping the shortest."],
        "BFS discovers vertices in nondecreasing distance from the start. Marking on enqueue prevents cycles and duplicate queue entries. DFS's first path need not be shortest."),
    "approach-stack": ("approach", "Stack", "Nested brackets",
        "Validate properly nested (), [] and {} in O(n) time. Which state preserves what the next closing bracket must match?", "",
        ["A stack of opening brackets: each closing bracket must match the most recent unmatched opener.",
         "One total count of opening minus closing brackets.",
         "Three independent counts, one for each bracket type.",
         "A set of bracket types encountered so far."],
        "Counts lose nesting order: ([)] balances every type but is invalid. A stack retains the order of unmatched openers."),
}

GENERATED = {
    "break-last": ("break", "Arrays & Hashing", "An overlooked element"),
    "break-max": ("break", "Arrays & Hashing", "A suspicious starting value"),
    "break-search": ("break", "Binary Search", "The final candidate"),
    "trace-search": ("trace", "Binary Search", "Move the search boundaries"),
    "trace-stack": ("trace", "Stack", "Trace a monotonic stack"),
    "trace-window": ("trace", "Sliding Window", "Slide a fixed-size window"),
}

CHOICES.update(practice_bank.CHOICES)
GENERATED.update(practice_generated.TEMPLATES)


def catalog():
    return {"modes": MODES, "exercises": [
        {"id": key, "mode": row[0], "topic": row[1], "title": row[2],
         "variants": key.startswith("trace-") or key == "break-search" or key in practice_generated.VARIANTS}
        for key, row in {**GENERATED, **CHOICES}.items()
    ]}


def _choice(q, options, explanation, rng):
    # Stable IDs reference authored options, not shuffled screen positions.
    q.update(options=[{"id": str(i), "text": x} for i, x in enumerate(options)],
             answer="0", explanation=explanation, input_type="choice")
    rng.shuffle(q["options"])


def question(template, seed):
    if template not in {**GENERATED, **CHOICES} or not 0 <= seed <= 2**32 - 1:
        raise ValueError("Unknown exercise or invalid variation")
    rng = random.Random(seed)
    row = (GENERATED | CHOICES)[template]
    q = {"id": f"v1:{template}:{seed}", "template": template, "mode": row[0],
         "topic": row[1], "title": row[2], "code": ""}
    if template in CHOICES:
        q.update(prompt=row[3], code=row[4])
        _choice(q, row[5], row[6], rng)
        return q
    if template in practice_generated.TEMPLATES:
        if row[0] == "break":
            q.update(practice_generated.broken(template, rng))
        else:
            fields, options, explanation = practice_generated.trace(template, rng)
            q.update(fields)
            _choice(q, options, explanation, rng)
        return q
    if row[0] == "break":
        q.update(input_type="array", prompt="Give a nonempty JSON array of at most 12 integers (each between -100 and 100) where this function returns the wrong result.")
        if template == "break-last":
            q["prompt"] += " It should return True exactly when a value appears more than once."
            q.update(code="def has_duplicate(nums):\n    seen = set()\n    for x in nums[:-1]:\n        if x in seen:\n            return True\n        seen.add(x)\n    return False",
                     example=[rng.randint(-5, 5)] * 2,
                     explanation="The slice nums[:-1] skips the final value. A duplicate whose second occurrence is last is never detected.")
        elif template == "break-max":
            q["prompt"] += " It should return the largest value in the array."
            q.update(code="def maximum(nums):\n    best = 0\n    for x in nums:\n        best = max(best, x)\n    return best",
                     example=[-rng.randint(1, 9)],
                     explanation="Starting at zero invents a value that may not be in the array. On an all-negative array the result is wrong. Initialize best to nums[0].")
        else:
            target = rng.randint(-9, 9)
            q.update(target=target, example=[target],
                     prompt=q["prompt"] + f" The array must be strictly increasing. The target is {target}; return its index, or -1 if absent.",
                     code=f"def search(nums, target={target}):\n    lo, hi = 0, len(nums) - 1\n    while lo < hi:\n        mid = (lo + hi) // 2\n        if nums[mid] == target:\n            return mid\n        if nums[mid] < target:\n            lo = mid + 1\n        else:\n            hi = mid - 1\n    return -1",
                     explanation="When lo == hi there is still one candidate, but the loop exits without checking it. Use lo <= hi with these inclusive bounds.")
        return q
    if template == "trace-search":
        nums = sorted(rng.sample(range(-20, 40), 7))
        mid = 3
        # Avoid equality: this exercise specifically asks about updated bounds.
        target = nums[rng.choice([0, 1, 2, 4, 5, 6])]
        answer = [4, 6] if target > nums[mid] else [0, 2]
        choices = [answer, [0, 3] if answer == [0, 2] else [3, 6], [0, 6], [3, 3]]
        q.update(prompt=f"nums = {nums}, target = {target}. What are [lo, hi] immediately after one loop iteration?",
                 code="lo, hi = 0, 6\nwhile lo <= hi:\n    mid = (lo + hi) // 2\n    if nums[mid] == target:\n        break\n    if nums[mid] < target:\n        lo = mid + 1\n    else:\n        hi = mid - 1")
        explanation = f"mid is 3 and nums[mid] is {nums[mid]}. The target is {'larger' if target > nums[mid] else 'smaller'}, so the new inclusive bounds are {answer}."
    elif template == "trace-stack":
        stack = sorted(rng.sample(range(1, 20), 4))
        x = rng.randint(stack[0], stack[-1])
        answer = [v for v in stack if v < x] + [x]
        candidates = [stack + [x], [x], stack[:-1] + [x], stack, sorted(set(stack + [x]))]
        choices = [answer]
        for c in candidates:
            if c not in choices:
                choices.append(c)
        q.update(prompt=f"stack = {stack} (bottom to top), x = {x}. What is stack after this code finishes?",
                 code="while stack and stack[-1] >= x:\n    stack.pop()\nstack.append(x)")
        explanation = f"Pop every trailing value greater than or equal to {x}, then append {x}. The resulting stack is {answer}."
    else:
        nums = [rng.randint(1, 15) for _ in range(5)]
        total = sum(nums[:3])
        answer = sum(nums[1:4])
        choices = list(dict.fromkeys([answer, total + nums[3], total - nums[0], sum(nums[2:5]), total]))
        q.update(prompt=f"nums = {nums}. window_sum starts at {total}, the sum of nums[0:3]. What is it after one shift?",
                 code="window_sum -= nums[0]\nwindow_sum += nums[3]")
        explanation = f"Remove the outgoing {nums[0]} and add the incoming {nums[3]}: {total} - {nums[0]} + {nums[3]} = {answer}."
    _choice(q, [json.dumps(c) for c in choices[:4]], explanation, rng)
    return q


def from_id(question_id):
    try:
        version, template, raw_seed = question_id.split(":")
        seed = int(raw_seed)
        if version != "v1" or str(seed) != raw_seed:
            raise ValueError
        return question(template, seed)
    except (ValueError, TypeError, AttributeError):
        raise ValueError("Unknown question") from None


def public_question(q):
    return {k: v for k, v in q.items() if k not in {"answer", "explanation", "example"}}


def counterexample(q, nums):
    if not isinstance(nums, list) or not 1 <= len(nums) <= 12 or any(
            type(x) is not int or not -100 <= x <= 100 for x in nums):
        raise ValueError("Enter a JSON array of 1–12 integers between -100 and 100, for example [1, 2, 1].")
    if q["template"] in practice_generated.TEMPLATES:
        expected, actual = practice_generated.evaluate_broken(q, nums)
    elif q["template"] == "break-last":
        expected = len(set(nums)) != len(nums)
        actual = len(set(nums[:-1])) != len(nums[:-1])
    elif q["template"] == "break-max":
        expected, actual = max(nums), max([0] + nums)
    else:
        if nums != sorted(set(nums)):
            raise ValueError("For this search, the input must be strictly increasing (sorted, no duplicates).")
        target = q["target"]
        expected = nums.index(target) if target in nums else -1
        lo, hi, actual = 0, len(nums) - 1, -1
        while lo < hi:
            mid = (lo + hi) // 2
            if nums[mid] == target:
                actual = mid
                break
            if nums[mid] < target:
                lo = mid + 1
            else:
                hi = mid - 1
    return {"correct": expected != actual, "expected": expected, "actual": actual}


def grade(q, answer=None, reveal=False):
    result = {"question_id": q["id"], "template": q["template"], "mode": q["mode"],
              "revealed": reveal, "explanation": q["explanation"]}
    if q["input_type"] == "choice":
        if not reveal and answer not in {o["id"] for o in q["options"]}:
            raise ValueError("Choose an answer first.")
        option = next(o for o in q["options"] if o["id"] == q["answer"])
        result.update(correct=not reveal and answer == q["answer"], answer=answer,
                      correct_option=option["id"], solution=option["text"])
    else:
        if reveal:
            nums = q["example"]
        else:
            try:
                nums = json.loads(answer or "")
            except (ValueError, TypeError):
                raise ValueError("Enter an array such as [1, 2, 1].") from None
        result.update(counterexample(q, nums), answer=answer,
                      solution=json.dumps(q["example"]))
        if reveal:
            result["correct"] = False
        else:
            example_result = counterexample(q, q["example"])
            result["example_expected"] = example_result["expected"]
            result["example_actual"] = example_result["actual"]
    return result
