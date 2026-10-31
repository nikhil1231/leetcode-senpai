"""Study debriefs: parsing a pasted block and planning what it records (pure)."""
from server import study_debrief as sd


def test_parse_tolerates_markdown_chatter_and_aliases():
    text = '''Great session! Here's the debrief:

**SENPAI-DEBRIEF session=Ab3x9k**
- P1 right explain "nailed it"
* **P2** | Wrong | recall | "mixed up SLI and SLO"
P3: partly — apply — missed the error budget
P4 correct
P2 wrong recognise "later, worse"
NOTE: "we also covered CDNs"
NOTE ""
some stray line
'''
    p = sd.parse(text)
    assert p['session'] == 'Ab3x9k'
    rows = {r['ref']: r for r in p['rows']}
    assert rows['P1'] == {'ref': 'P1', 'verdict': 'right', 'depth': 'explain', 'note': 'nailed it'}
    assert rows['P2'] == {'ref': 'P2', 'verdict': 'wrong', 'depth': 'recognise', 'note': 'later, worse'}  # last line wins
    assert rows['P3']['verdict'] == 'partial' and rows['P3']['depth'] == 'apply' and rows['P3']['note'] == 'missed the error budget'
    assert rows['P4']['depth'] == 'recall'  # default depth
    assert p['notes'] == ['we also covered CDNs'] and p['skipped'] == ['some stray line']
    assert 'Great session' not in ' '.join(p['skipped'])  # chatter before the header is ignored


def test_parse_without_a_header():
    assert sd.parse('P1 right')['session'] is None and sd.parse('')['rows'] == []


POINTS = {x: {'id': x, 'claim': f'claim {x}', 'lesson_title': 'L', 'prompt': f'ask {x}'} for x in ('a', 'b', 'c')}


def test_plan_trusts_misses_fully_and_right_answers_softly():
    parsed = sd.parse('SENPAI-DEBRIEF session=x\nP1 right recall\nP2 wrong explain "nope"\nP3 partial\nP4 right')
    mis = [{'point': 'a', 'status': 'open'}, {'point': 'a', 'status': 'resolved'}, {'point': 'b', 'status': 'open'}]
    p = sd.plan(parsed, {'P1': 'a', 'P2': 'b', 'P3': 'c'}, POINTS, mis)
    ch = {c['ref']: c for c in p['changes']}
    assert ch['P1']['event'] == {'key': 'P1', 'points': ['a'], 'clean': True, 'partial': False, 'depth': 'recall',
                                 'strength': 'soft', 'note': ''}
    assert ch['P1']['resolves'] == 1 and ch['P1']['opens'] is None
    assert ch['P2']['opens'] == {'kind': 'belief', 'text': 'nope', 'ask': 'ask b'} and ch['P2']['resolves'] == 0
    assert ch['P3']['opens'] == {'kind': 'gap', 'text': 'claim c', 'ask': 'ask c'} and ch['P3']['event']['partial']
    assert p['counts'] == {'right': 1, 'partial': 1, 'wrong': 1} and p['resolves'] == 1
    assert p['skipped'] == ['P4: not an idea from this session']
