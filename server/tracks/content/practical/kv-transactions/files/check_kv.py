from kv import KVStore


def _raises(fn):
    try:
        fn()
    except RuntimeError:
        return True
    return False


def test_errors_without_a_transaction():
    db = KVStore()
    assert _raises(db.rollback)
    assert _raises(db.commit)


def test_rollback_restores_deleted_key_and_counts():
    db = KVStore()
    db.set("a", 1)
    db.set("b", 1)
    db.begin()
    db.delete("a")
    db.set("b", 2)
    assert db.count(1) == 0
    db.rollback()
    assert db.get("a") == 1 and db.get("b") == 1
    assert db.count(1) == 2 and db.count(2) == 0


def test_commit_closes_all_transactions():
    db = KVStore()
    db.begin()
    db.set("a", 1)
    db.begin()
    db.set("b", 2)
    db.commit()
    assert _raises(db.rollback)
    assert db.get("a") == 1 and db.get("b") == 2


def test_multiple_changes_to_one_key_roll_back_to_the_start():
    db = KVStore()
    db.set("a", 1)
    db.begin()
    db.set("a", 2)
    db.set("a", 3)
    db.delete("a")
    db.set("a", 4)
    db.rollback()
    assert db.get("a") == 1
    assert db.count(1) == 1 and db.count(4) == 0


def test_inner_rollback_keeps_outer_changes():
    db = KVStore()
    db.begin()
    db.set("x", 1)
    db.begin()
    db.set("x", 2)
    db.set("y", 2)
    db.rollback()
    assert db.get("x") == 1 and db.get("y") is None
    db.rollback()
    assert db.get("x") is None and db.count(1) == 0


def test_delete_missing_key_is_harmless():
    db = KVStore()
    db.delete("nope")
    db.begin()
    db.delete("nope")
    db.rollback()
    assert db.get("nope") is None and db.count(None) == 0


def test_begin_and_rollback_do_not_copy_the_store():
    import time
    db = KVStore()
    for i in range(100000):
        db.set(i, i % 7)
    start = time.perf_counter()
    for _ in range(2000):
        db.begin()
        db.set("k", 1)
        db.rollback()
    assert time.perf_counter() - start < 1.0, "begin/rollback should not be O(store size)"
    assert db.count(3) == len([i for i in range(100000) if i % 7 == 3])
