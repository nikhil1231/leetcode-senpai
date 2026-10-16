"""Resumable learning migration. Dry run by default; private backups on apply.

Run from the checkout with configured credentials:
  .venv/bin/python scripts/migrate_learning.py taxonomy [--apply]
  .venv/bin/python scripts/migrate_learning.py evidence [--apply]
  .venv/bin/python scripts/migrate_learning.py quickfire [--apply]
  .venv/bin/python scripts/migrate_learning.py --restore /path/to/backup.json

No LLM calls. No changes to source attempts, grades, timestamps or FSRS cards.
"""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import run  # loads .env.local, without running a server
from server import assessment, config, curriculum, learning_evidence, practice_state
from server.store import get_store, _invalidate


def changes(store, step):
    if step == 'taxonomy':
        out = []
        for p in store.list_problems():
            original = store.get_problem(p['slug'])
            patch = curriculum.classify(p['slug'], p.get('leetcode_tags'), p)
            updated = {**original, **patch}
            if updated != original:
                out.append(('problems', p['slug'], original, updated))
        return out
    if step == 'evidence':
        events = learning_evidence.project(store.list_problems(), store.list_attempts(), list(store.iter_light_practice()))
        key = f'evidence-v{learning_evidence.VERSION}'
        updated = {'version': learning_evidence.VERSION, 'skills': learning_evidence.reduce(events)}
        old = store.get_learning_state(key)
        out = [('learning_state', key, old, updated)] if old != updated else []
        for a in store.list_attempts():
            if a.get('slug') != 'sort-colors' or not a.get('solution_grade') or assessment.code_identity(a.get('code')) != assessment.SORT_COLORS_CORRECTION['code_identity']:
                continue
            corrections = list(a.get('assessment_corrections') or [])
            if assessment.SORT_COLORS_CORRECTION not in corrections:
                corrected = {**a, 'assessment_corrections': corrections + [assessment.SORT_COLORS_CORRECTION],
                             'assessment_revision': a.get('assessment_revision', 0) + 1}
                out.append(('attempts', a['id'], a, corrected))
        return out
    grouped = {}
    for a in store.iter_light_practice():
        grouped.setdefault(a['template'], []).append(a)
    current = store.list_practice_state()
    return [('practice_state', t, current.get(t), practice_state.rebuild(events))
            for t, events in grouped.items() if current.get(t) != practice_state.rebuild(events)]


def ref(store, collection, key):
    if collection == 'problems':
        return store.db.collection('problems').document(key)
    return store._user_ref().collection(collection).document(key)


def apply(store, records, restore=False):
    for collection, key, old, new in records:
        doc = old if restore else new
        target = ref(store, collection, key)
        if doc is None:
            target.delete()
        else:
            target.set(doc)
        if collection == 'problems':
            _invalidate(('problem', key))
    _invalidate(('problems',))
    # Queue/drill readers use this revision to drop their derived caches.
    _invalidate(('attempts', store.uid))
    store.set_flag('pattern_sprint_drills', None)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('step', nargs='?', choices=['taxonomy','evidence','quickfire'])
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--restore', type=Path)
    parser.add_argument('--backup-dir', type=Path, default=Path.home()/'.leetcode-senpai'/'learning-backups')
    args = parser.parse_args()
    store = get_store(config.DEV_UID)
    if args.restore:
        backup = json.loads(args.restore.read_text())
        if backup['uid'] != store.uid:
            parser.error('Backup belongs to another user')
        apply(store, backup['changes'], restore=True)
        print('Restored', len(backup['changes']), 'records')
        return
    if not args.step:
        parser.error('Choose a migration step')
    records = changes(store, args.step)
    print(json.dumps({'step': args.step, 'changed': len(records), 'examples': [r[1] for r in records[:10]]}))
    if args.apply and records:
        args.backup_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
        backup = args.backup_dir / (args.step+'-'+dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S%f')+'.json')
        fd = os.open(backup, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        with os.fdopen(fd, 'w') as fh:
            json.dump({'uid': store.uid, 'step': args.step, 'changes': records}, fh)
        apply(store, records)
        print('Applied; private restore file:', backup)


if __name__ == '__main__':
    main()
