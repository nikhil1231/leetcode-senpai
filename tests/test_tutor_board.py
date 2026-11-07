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


# ---- designs for the simulator (rig.py) ----
from server.tutor import rig


def test_a_design_becomes_a_builder_graph_and_scenario():
    _, [d] = rig.extract('```design\nlevel: garage\nnodes: [{id: app, kind: app, size: s, instances: 2, zones: 9, bogus: 1}, {id: db, kind: postgres, size: huge}]\n'
                         'edges: [[client, app], [app, db], [app, nowhere]]\nincidents: [{type: db-failover, at: 30}, {type: meteor}]\n```')
    g = d['graph']
    assert [n['defId'] for n in g['nodes']] == ['client', 'app-server', 'db-sql']        # a client is added
    app, db = g['nodes'][1], g['nodes'][2]
    assert app['cfg'] == {'tier': 's', 'count': 2, 'azs': 9} and 'cfg' not in db             # the sim clamps zones; unknown tiers go
    assert [(e['from'], e['to']) for e in g['edges']] == [('client', 'app'), ('app', 'db')]
    assert d['level'] == 'garage' and d['scenario']['dau'] == 2000 and d['scenario']['slo']['budget'] == 300
    assert d['scenario']['events'] == [{'id': 'tutor-0', 'type': 'db-failover', 'at': 23, 'dur': 1, 'params': {}}]
    assert all(n['x'] >= rig.LEFT and n['y'] >= rig.TOP for n in g['nodes'])
    again = rig.extract(rig.source(d))[1][0]
    assert again['graph']['edges'] == g['edges'] and again['scenario']['events'][0]['type'] == 'db-failover'


def test_designs_without_a_connection_or_known_parts_are_dropped():
    assert rig.extract('```design\nnodes: [teapot, kettle]\n```')[1] == []
    assert rig.extract('```design\nnodes: [app]\n```')[1] == []


def test_what_he_changed_is_summarised_for_the_tutor():
    before = {'nodes': [{'id': 'a', 'defId': 'app-server'}, {'id': 'd', 'defId': 'db-sql'}], 'edges': [{'from': 'a', 'to': 'd'}]}
    after = {'nodes': [{'id': 'a', 'defId': 'app-server', 'cfg': {'count': 6}}, {'id': 'd', 'defId': 'db-sql'}, {'id': 'c', 'defId': 'cache'}],
             'edges': [{'from': 'a', 'to': 'd'}, {'from': 'a', 'to': 'c'}]}
    text = rig.changes(before, after)
    assert '+1 cache' in text and 'app-server settings {"count":6}' in text and '1 connections changed' in text
    assert rig.changes(before, before) == ''


def test_the_simulator_guide_names_real_components_and_incidents():
    g = rig.guide()
    assert 'app-server' in g and 'cache-flush' in g and 'garage' in g and 'not correctness' in g
