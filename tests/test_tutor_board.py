"""The tutor's whiteboard: diagrams lifted out of a reply, cleaned and replayed. Pure."""
from server.tutor import board, session as ses

REPLY = """Here's the read path.

```diagram
title: Read path
nodes:
  - {id: app, label: App server, kind: server}
  - {id: cache, label: Redis, kind: cache, state: hot}
  - {id: db, label: Postgres, kind: database}
edges:
  - [app, cache, GET]
  - app -> db: on a miss
  - [app, ghost]
paths:
  - label: A miss
    steps: [[app, cache, miss], [app, db, read], [cache, ghost, nope]]
missing: cache
```

What sits in the box with the question mark?"""


def test_a_diagram_is_lifted_out_cleaned_and_laid_out():
    text, boards = board.extract(REPLY)
    assert '```' not in text and 'question mark' in text
    [d] = boards
    assert d['type'] == 'arch' and d['board'] and d['title'] == 'Read path'
    kinds = {n['id']: n['kind'] for n in d['nodes']}
    assert kinds == {'app': 'service', 'cache': 'cache', 'db': 'db'}           # aliases map to known kinds
    assert d['edges'] == [['app', 'cache', 'GET'], ['app', 'db', 'on a miss']]  # an edge to an unknown node is dropped
    assert [s[:2] for s in d['paths'][0]['steps']] == [['app', 'cache'], ['app', 'db']]
    assert d['ask'] == 'cache' and next(n for n in d['nodes'] if n['id'] == 'cache')['state'] == 'hot'
    pos = {n['id']: (n['x'], n['y']) for n in d['nodes']}
    assert pos['app'][0] == 0 and pos['cache'][0] == pos['db'][0] == 1 and pos['cache'] != pos['db']


def test_broken_or_oversized_diagrams_never_reach_the_board():
    assert board.extract('```diagram\nnodes: [\n```')[1] == []
    assert board.extract('```diagram\njust words\n```')[1] == []
    big = '```diagram\nnodes: [' + ', '.join(f'n{i}' for i in range(40)) + ']\n```'
    assert len(board.extract(big)[1][0]['nodes']) == board.MAX_NODES
    many = '\n'.join(['```diagram\nnodes: [a, b]\nedges: [[a, b]]\n```'] * 4)
    assert len(board.extract(many)[1]) == board.PER_MESSAGE


def test_cycles_and_placed_nodes_lay_out_without_overlap():
    d = board.clean({'nodes': [{'id': 'a', 'at': [0, 0]}, 'b', 'c', {'id': 'd', 'at': [0, 0]}], 'edges': [['a', 'b'], ['b', 'c'], ['c', 'b']]})
    cells = [(n['x'], n['y']) for n in d['nodes']]
    assert len(set(cells)) == len(cells)


def test_the_tutor_sees_its_own_diagram_again_and_can_redraw_it():
    _, [d] = board.extract(REPLY)
    again = board.extract(board.source(d))[1][0]
    assert again == d


def _session(mode):
    return {'mode': mode, 'shown': [], 'turns': [], 'notes': '', 'updated_at': 0}


def test_only_teach_critique_and_the_war_room_draw():
    lesson = {'blocks': []}
    for mode, drawn in [('teach', True), ('critique', True), ('war-room', True), ('explain', False), ('interview', False), ('cv', False)]:
        s = _session(mode)
        turn = ses.add_reply(s, REPLY + '\n<private>flaw: no TTL</private>', lesson, 1)
        assert '```' not in turn['say'] and 'diagram' not in turn['say']
        assert bool(turn.get('boards')) is drawn, mode


def test_diagrams_replay_in_the_chat_and_private_notes_never_draw():
    lesson = {'blocks': []}
    s = _session('teach')
    ses.add_reply(s, REPLY, lesson, 1)
    msgs = ses.messages(s | {'turns': s['turns']}, lesson)
    assert '```diagram' in msgs[-1]['content'] and 'Read path' in msgs[-1]['content']
    hidden = _session('critique')
    turn = ses.add_reply(hidden, 'Here it is.\n<private>```diagram\nnodes: [a]\n```</private>', lesson, 1)
    assert not turn.get('boards')


def test_the_guide_reaches_drawing_modes_only():
    assert '```diagram' in board.guide() and 'model' in board.guide()
