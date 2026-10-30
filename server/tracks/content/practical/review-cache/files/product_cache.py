import pickle

import redis

from .db import db
from .catalog import render_product

r = redis.Redis(host="cache", port=6379)
TTL = 600


def get_product(product_id, tenant, locale):
    key = f"product:{product_id}"
    cached = r.get(key)
    if cached is not None:
        return pickle.loads(cached)
    try:
        row = db.fetch_product(product_id, tenant)
        product = render_product(row, locale) if row else None
    except Exception:
        product = {"id": product_id, "unavailable": True}
    if product is None:
        r.set(key, pickle.dumps(None))
    else:
        r.set(key, pickle.dumps(product), ex=TTL)
    return product


def update_product(product_id, tenant, changes):
    with db.transaction() as tx:
        r.delete(f"product:{product_id}")
        tx.update_product(product_id, tenant, changes)
