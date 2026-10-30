"""Shared request helpers for the track routers."""
from fastapi import Depends, HTTPException

from .. import auth
from ..store import get_store


def store_for(uid: str = Depends(auth.require_user)):
    return get_store(uid)


def put(store, track, key, doc, revision=None):
    try:
        return store.put_track_record(track, key, doc, revision)
    except ValueError as exc:
        raise HTTPException(409, 'This record changed in another tab. Reload to see the saved version.') from exc
