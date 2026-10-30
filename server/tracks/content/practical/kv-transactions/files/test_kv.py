from kv import KVStore


def test_set_get_delete():
    db = KVStore()
    db.set("a", 10)
    assert db.get("a") == 10
    db.delete("a")
    assert db.get("a") is None


def test_count():
    db = KVStore()
    db.set("a", 10)
    db.set("b", 10)
    db.set("c", 20)
    assert db.count(10) == 2
    db.set("a", 20)
    assert db.count(10) == 1 and db.count(20) == 2


def test_rollback():
    db = KVStore()
    db.set("a", 10)
    db.begin()
    db.set("a", 20)
    db.set("b", 30)
    db.rollback()
    assert db.get("a") == 10
    assert db.get("b") is None


def test_nested_rollback_and_commit():
    db = KVStore()
    db.begin()
    db.set("a", 10)
    db.begin()
    db.set("a", 20)
    assert db.get("a") == 20
    db.rollback()
    assert db.get("a") == 10
    db.commit()
    assert db.get("a") == 10
