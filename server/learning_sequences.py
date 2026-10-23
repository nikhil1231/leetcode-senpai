"""Reviewed, immutable v1 lessons. Held-out applications never leave assessment APIs."""
VERSION = 1
SEQUENCES = {
    'intervals': {
        'skill': 'interval.merge_boundaries', 'title': 'Interval boundaries',
        'principle': 'Classify each interval as before, overlapping, or after. For closed intervals, touching endpoints overlap.',
        'worked': 'Insert [3,6] into [[1,2],[4,5],[8,9]]: keep [1,2], merge to [3,6], then keep [8,9].',
        'explain': 'Why is the before test end < start rather than end <= start?',
        'objective': 'Preserve the farthest endpoint when closed intervals overlap.',
        'code': 'end = ___  # merging current [start,end] with [a,b]',
        'accepted': ['max(end, b)', 'max(b, end)'],
        'correct_feedback': 'Taking the maximum preserves the farthest endpoint, including when one interval contains the other.',
        'incorrect': 'Replacing end by b loses the boundary if the incoming interval is contained.',
        'probe': {'prompt': 'For half-open bookings [start,end), merge overlaps in [[1,3],[3,5],[4,7]].',
                  'accepted': ['[[1,3],[3,7]]'], 'delay_days': [7,21]},
    },
    'partition': {
        'skill': 'partition.invariant', 'title': 'Partition invariants',
        'principle': 'Keep classified regions separate from the unprocessed region. A value swapped in from the right has not been inspected.',
        'worked': 'With [1,2,0], scan=1, right=2: swapping gives [1,0,2]. Keep scan=1 to inspect the incoming 0.',
        'explain': 'Why do we not advance scan after swapping a 2 with the right boundary?',
        'objective': 'Update the right boundary without skipping an unprocessed value.',
        'code': 'if nums[scan] == 2:\n    nums[scan], nums[right] = nums[right], nums[scan]\n    ___',
        'accepted': ['right -= 1', 'right = right - 1'],
        'correct_feedback': 'Move right back and keep scan in place so the incoming, unclassified value is inspected next.',
        'incorrect': 'Advancing scan skips the unknown value that just arrived.',
        'probe': {'prompt': 'Partition letters L, M, H. After swapping an H at scan with the last unknown slot, which pointers move?',
                  'accepted': ['right only', 'decrement right; keep scan'], 'delay_days': [7,21]},
    },
    'heap-sweep': {
        'skill': 'sweep.active_heap', 'title': 'Search versus heap sweep',
        'principle': 'Binary search needs a monotone predicate. Interval containment in start order is not monotone; sweep sorted queries while maintaining active candidates.',
        'worked': 'For intervals [1,10],[2,3],[4,8] and query 6, containment is true,false,true. A binary search on containment can discard the answer.',
        'explain': 'Which property makes containment unsuitable as the binary-search predicate?',
        'objective': 'Expire intervals that end before the current query.',
        'code': 'while heap and heap[0][1] < query:\n    ___',
        'accepted': ['heappop(heap)', 'heapq.heappop(heap)'],
        'correct_feedback': 'Pop expired candidates until the heap top is active at the current query.',
        'incorrect': 'Checking length instead of end fails to identify expired intervals.',
        'probe': {'prompt': 'Closed jobs [1,4],[2,9],[6,7] have cost equal to duration end-start+1. What is the cheapest active cost at times [4,5,7,10]?',
                  'accepted': ['[4,8,2,-1]'], 'delay_days': [7,21]},
    },
    'carry': {
        'skill': 'arithmetic.carry', 'title': 'Carry propagation',
        'principle': 'Continue while either input or carry remains; each output digit is total modulo the base, and the next carry is total divided by the base.',
        'worked': 'Decimal 99+1, least significant first: total=10 -> digit 0 carry 1; total=10 -> 0 carry 1; total=1 -> 1 carry 0.',
        'explain': 'Why must the loop continue after both inputs end?',
        'objective': 'Retain a final carry after unequal-length inputs.',
        'code': 'while i < len(a) or j < len(b) or ___:',
        'accepted': ['carry', 'carry != 0', 'carry > 0'],
        'correct_feedback': 'Keeping the loop running while carry remains preserves the final output digit.',
        'incorrect': 'Stopping when either list ends loses remaining digits or a final carry.',
        'probe': {'prompt': 'Add base-8 numbers 77 and 1. Give the result in base 8.',
                  'accepted': ['100'], 'delay_days': [7,21]},
    },
    'dp-storage': {
        'skill': 'dp.storage', 'title': 'DP state versus storage',
        'principle': 'Define the recurrence before compressing storage. In a row sweep, dp[j] is old top, dp[j-1] is updated left, and diagonal must be saved separately.',
        'worked': 'For maximal square, old top=2, updated left=1, old diagonal=2 and cell=1 gives 1+min(2,1,2)=2. Save old top before writing dp[j].',
        'explain': 'Which value would be lost if diagonal were assigned after overwriting dp[j]?',
        'objective': 'Save the old top for the next column diagonal; no memory optimisation is required for a recurrence-only exercise.',
        'code': 'old_top = dp[j]\ndp[j] = 1 + min(dp[j], dp[j-1], diagonal)\ndiagonal = ___',
        'accepted': ['old_top'],
        'correct_feedback': 'The saved old top becomes the next column’s diagonal; dp[j] already holds the new row’s value.',
        'incorrect': 'dp[j] now contains the new row and cannot supply the old diagonal.',
        'probe': {'prompt': 'Edit-distance row update: old top=3, updated left=2, saved diagonal=1. Characters differ. New cell is min(top+1,left+1,diagonal+1). Give it.',
                  'accepted': ['2'], 'delay_days': [7,21]},
    },
    'contracts': {
        'skill': 'contract.discrimination', 'title': 'Problem-contract discrimination',
        'principle': 'Choose a method from the required output and allowed transformations, not just familiar nouns in the title.',
        'worked': 'Rearranging letters to build a palindrome permits frequency counting. Finding a contiguous palindromic substring must preserve order. Flood fill asks reachability; nearest-source distance requires shortest paths.',
        'explain': 'Why does counting letters not identify the longest palindromic substring?',
        'objective': 'Distinguish reachability from shortest unweighted distance.',
        'code': 'To find nearest-source distances in an unweighted grid, use ___ from all sources.',
        'accepted': ['BFS', 'breadth-first search', 'multi-source BFS'],
        'correct_feedback': 'BFS from all sources visits cells in increasing distance, giving the nearest-source distance at each first visit.',
        'incorrect': 'DFS reaches cells but its first visit need not follow a shortest path.',
        'probe': {'prompt': 'A warehouse map has unit-length aisles and several exits. Find the fewest aisle steps to any exit for every location. Name the traversal.',
                  'accepted': ['multi-source BFS', 'BFS from all exits'], 'delay_days': [7,21]},
    },
}


def public(sequence):
    return {k: v for k, v in SEQUENCES[sequence].items() if k not in ('probe', 'accepted')}


def canonical(text):
    return ''.join((text or '').casefold().split())


def check(sequence, answer, probe=False):
    target = SEQUENCES[sequence]['probe'] if probe else SEQUENCES[sequence]
    return canonical(answer) in {canonical(a) for a in target['accepted']}


def recommendation(events):
    from .learning_evidence import reduce
    summaries = reduce(events)
    for key, seq in SEQUENCES.items():
        needs = summaries.get(seq['skill'], {}).get('recent_needs', [])
        if len(needs) >= 2:
            return {'sequence': key, 'title': seq['title'], 'reason': 'Repeated difficulty with this skill'}
    return None


def due_checks(records, now):
    return [{'id': r['id'], 'due_at': r['probe_due_at']} for r in records
            if r.get('probe_due_at') is not None and r['probe_due_at'] <= now and not r.get('probe_answered_at')]

# A distinct second application is reserved for the later pilot window.
SECOND_APPLICATIONS = {
    'intervals': {'prompt': 'Closed maintenance windows [2,5] and [5,8] occupy their endpoints. What is their merged window?', 'accepted':['[2,8]']},
    'partition': {'prompt': 'Partition items by weight into light, middle, heavy using left/scan/right boundaries. When a light item is swapped with the left boundary, which boundaries advance?', 'accepted':['left and scan','increment left and scan']},
    'heap-sweep': {'prompt': 'Closed task windows [1,10],[2,3],[4,8] in start order are queried at time 6. Give their containment truth values. Is containment monotone?', 'accepted':['true,false,true; no','[true,false,true], not monotone']},
    'carry': {'prompt': 'A base-2 counter stores digits least-significant first: [1,1,1]. Increment once and give the new list.', 'accepted':['[0,0,0,1]']},
    'dp-storage': {'prompt': 'A row-compressed edit-distance cell uses old top=4, updated left=3, saved diagonal=2. Characters match. What is the new cell?', 'accepted':['2']},
    'contracts': {'prompt': 'Letters may be rearranged freely. Which suffices to find the maximum palindrome length: letter frequencies or contiguous-substring expansion?', 'accepted':['letter frequencies','frequencies','frequency counts']},
}


def application(sequence, index=1):
    return SECOND_APPLICATIONS[sequence] if index == 2 else SEQUENCES[sequence]['probe']


def check_application(sequence, answer, index=1):
    return canonical(answer) in {canonical(a) for a in application(sequence,index)['accepted']}
