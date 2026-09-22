"""Populate the problems catalog from packs, discover highly-rated problems,
resolve a pasted URL/number to a startable problem, and backfill solve history."""
import asyncio
import re

from . import leetcode, packs, scheduler

# Politeness delay between LeetCode calls during bulk import (tests set to 0).
POLITE_DELAY = 0.4


def _title_from_slug(slug):
    return slug.replace("-", " ").title()


def _merge_packs(existing, pack_name):
    have = list(existing.get("packs") or [])
    if pack_name and pack_name not in have:
        have.append(pack_name)
    return have


async def import_pack(store, pack_name, auth=None, fetch_metadata=True):
    """Insert/refresh every problem in a named pack, enriching with LeetCode
    metadata (difficulty, tags, likes). Adds the pack to each problem's `packs`
    and marks it in_library."""
    pack = packs.get_pack(pack_name)
    if not pack:
        return {"error": f"unknown pack: {pack_name}"}
    cat_map = pack.get("category_map", {})
    fetched = failed = 0
    slugs = pack["slugs"]
    for slug in slugs:
        existing = store.get_problem(slug) or {}
        meta = None
        if fetch_metadata:
            try:
                meta = await leetcode.question(slug, auth)
                if meta:
                    fetched += 1
                if POLITE_DELAY:
                    await asyncio.sleep(POLITE_DELAY)  # be polite to the endpoint
            except Exception:
                failed += 1
        category = (cat_map.get(slug)
                    or (packs.category_from_tags(meta["tags"]) if meta else None)
                    or existing.get("neetcode_category")
                    or "Arrays & Hashing")
        store.upsert_problem(_problem_doc(slug, existing, meta, category,
                                          _merge_packs(existing, pack_name)))
    return {"pack": pack_name, "total": len(slugs),
            "metadata_fetched": fetched, "metadata_failed": failed}


def _problem_doc(slug, existing, meta, category, packs_list):
    doc = {
        "slug": slug,
        "title": (meta["title"] if meta else None) or existing.get("title") or _title_from_slug(slug),
        "difficulty": (meta["difficulty"] if meta and meta["difficulty"] != "Unknown" else None)
                      or existing.get("difficulty", "Unknown"),
        "neetcode_category": category,
        "url": f"https://leetcode.com/problems/{slug}/",
        "packs": packs_list,
        "in_library": bool(packs_list),
    }
    doc["in_neetcode150"] = "neetcode150" in packs_list
    if meta:
        doc.update({
            "leetcode_tags": meta["tags"],
            "frontend_id": meta["frontend_id"] or existing.get("frontend_id"),
            "likes": meta.get("likes"),
            "dislikes": meta.get("dislikes"),
            "like_ratio": meta.get("like_ratio"),
            "ac_rate": meta.get("ac_rate"),
            "content_html": meta.get("content_html") or existing.get("content_html"),
            "paid_only": meta.get("paid_only"),
            "similar_slugs": meta.get("similar_slugs") or existing.get("similar_slugs", []),
        })
    else:
        doc["leetcode_tags"] = existing.get("leetcode_tags", [])
        doc["frontend_id"] = existing.get("frontend_id")
    return doc


async def import_problem(store, slug, auth=None, pack_name="custom"):
    """One-click add a single problem to the library."""
    existing = store.get_problem(slug) or {}
    try:
        meta = await leetcode.question(slug, auth)
    except Exception:
        meta = None
    category = (packs.category_from_tags(meta["tags"]) if meta else None) \
        or existing.get("neetcode_category") or "Arrays & Hashing"
    doc = _problem_doc(slug, existing, meta, category, _merge_packs(existing, pack_name))
    store.upsert_problem(doc)
    return {"slug": slug, "title": doc["title"], "category": category,
            "difficulty": doc["difficulty"]}


async def discover(store, auth=None, topic=None, difficulty=None,
                   min_like_ratio=0.85, min_votes=500, limit=25, scan=60):
    """Browse the problem set for highly-rated problems not yet in the library.

    Pages the problemset, hydrates up to `scan` candidates with likes/dislikes
    (cached into the catalog as in_library=False so re-browsing is free), and
    returns up to `limit` that clear the quality bar, best first.
    """
    try:
        page = await leetcode.problemset_page(topic=topic, difficulty=difficulty,
                                              skip=0, limit=scan, auth=auth)
    except Exception as e:
        return {"error": f"problemset fetch failed: {e}", "candidates": []}

    in_library = {p["slug"] for p in store.list_problems() if _lib(p)}
    out = []
    for q in page.get("questions", []):
        if len(out) >= limit:
            break
        slug = q["slug"]
        if slug in in_library or q.get("paid_only"):
            continue
        existing = store.get_problem(slug) or {}
        meta = existing if existing.get("like_ratio") is not None else None
        if meta is None:
            try:
                meta = await leetcode.question(slug, auth)
                if POLITE_DELAY:
                    await asyncio.sleep(POLITE_DELAY)
            except Exception:
                meta = None
            if meta:
                category = packs.category_from_tags(meta["tags"])
                cached = _problem_doc(slug, existing, meta, category, existing.get("packs") or [])
                cached["in_library"] = False
                store.upsert_problem(cached)
        if not meta:
            continue
        ratio = meta.get("like_ratio")
        votes = (meta.get("likes") or 0) + (meta.get("dislikes") or 0)
        if ratio is None or ratio < min_like_ratio or votes < min_votes:
            continue
        out.append({
            "slug": slug, "title": meta.get("title") or q["title"],
            "difficulty": meta.get("difficulty") or q["difficulty"],
            "category": meta.get("neetcode_category") or packs.category_from_tags(meta.get("tags", [])),
            "like_ratio": ratio, "likes": meta.get("likes"), "dislikes": meta.get("dislikes"),
            "ac_rate": meta.get("ac_rate"), "votes": votes,
            "url": f"https://leetcode.com/problems/{slug}/",
        })
    out.sort(key=lambda c: c["like_ratio"], reverse=True)
    return {"candidates": out, "scanned": len(page.get("questions", []))}


def _lib(p):
    if "in_library" in p:
        return bool(p["in_library"])
    return bool(p.get("packs")) or bool(p.get("in_neetcode150", True))


async def backfill_history(store, username, auth=None, limit=20):
    """Create 'backfill' attempts from recent accepted submissions for any
    problem in the catalog, and seed a neutral review card for each."""
    if not username:
        return {"error": "no username configured"}
    recents = await leetcode.recent_ac(username, limit, auth)
    known = {p["slug"] for p in store.list_problems()}
    existing_subs = {
        a.get("submission_id") for a in store.list_attempts()
        if a.get("submission_id") is not None
    }
    added = 0
    for s in recents:
        slug = s["titleSlug"]
        if slug not in known or s["id"] in existing_subs:
            continue
        store.add_attempt({
            "slug": slug, "solved_at": s["timestamp"], "submission_id": s["id"],
            "time_taken_sec": None, "runtime_percentile": None, "memory_percentile": None,
            "lang": None, "wrong_before_ac": None, "code": None,
            "confidence": None, "independence": None, "mistake_note": None,
            "approach": None, "source": "backfill", "kind": "adhoc",
        })
        if not store.get_review(slug):
            store.upsert_review(slug, scheduler.seed_review(slug))
        added += 1
    return {"scanned": len(recents), "added": added}


# ---- resolving a pasted problem -------------------------------------------------
# leetcode.com/problems/<slug>/… and the .cn mirror, with whatever query string
# or /description/ suffix came along for the ride.
_URL_SLUG = re.compile(r"leetcode\.c(?:om|n)/problems/([a-zA-Z0-9][a-zA-Z0-9-]*)", re.I)
# A bare slug typed on its own, e.g. "car-fleet". One-word input is treated as a
# search instead, since "backtracking" is a topic far more often than a slug.
_BARE_SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)+$")


def parse_problem_query(text):
    """Classify what was pasted. Pure: no I/O, no catalog.

    Returns (kind, value) where kind is "slug", "number", "text" or None.
    """
    q = (text or "").strip()
    if not q:
        return None, None
    m = _URL_SLUG.search(q)
    if m:
        return "slug", m.group(1).lower()
    # "#853", "853." — the decoration people paste around a problem number.
    bare = q.lstrip("#").rstrip(".").strip()
    if bare.isdigit():
        return "number", int(bare)
    low = q.lower()
    if _BARE_SLUG.match(low):
        return "slug", low
    return "text", q


def _candidate(slug, title, difficulty, category, in_library, frontend_id=None):
    return {"slug": slug, "title": title, "difficulty": difficulty or "Unknown",
            "category": category, "in_library": in_library,
            "frontend_id": frontend_id,
            "url": f"https://leetcode.com/problems/{slug}/"}


def _from_catalog(p):
    return _candidate(p["slug"], p.get("title") or _title_from_slug(p["slug"]),
                      p.get("difficulty"), p.get("neetcode_category"),
                      scheduler._in_library(p), p.get("frontend_id"))


async def resolve_problem(store, query, auth=None, limit=6):
    """Turn a pasted URL, number or title into startable candidates.

    The catalog is consulted first: the common case is a problem already
    imported, and answering from local data keeps the paste-to-timer path off
    the network entirely. Only an unknown problem costs a LeetCode call.

    Returns {"candidates": [...], "exact": bool} — `exact` marks a single
    unambiguous hit the UI can select without asking.
    """
    kind, value = parse_problem_query(query)
    if not kind:
        return {"candidates": [], "exact": False, "error": "Nothing to look up."}

    if kind == "slug":
        local = store.get_problem(value)
        if local:
            return {"candidates": [_from_catalog(local)], "exact": True}
        try:
            meta = await leetcode.question(value, auth)
        except Exception as e:
            return {"candidates": [], "exact": False, "error": f"LeetCode lookup failed: {e}"}
        if not meta:
            return {"candidates": [], "exact": False,
                    "error": f"No LeetCode problem called \u201c{value}\u201d."}
        return {"candidates": [_candidate(
            value, meta["title"], meta["difficulty"],
            packs.category_from_tags(meta["tags"]), False, meta.get("frontend_id"),
        )], "exact": True}

    if kind == "number":
        local = next((p for p in store.list_problems()
                      if p.get("frontend_id") == value), None)
        if local:
            return {"candidates": [_from_catalog(local)], "exact": True}

    try:
        page = await leetcode.problemset_page(search=str(value), limit=max(limit * 3, 15),
                                              auth=auth)
    except Exception as e:
        return {"candidates": [], "exact": False, "error": f"LeetCode search failed: {e}"}

    questions = page.get("questions") or []
    # A number must match the number, never merely rank first: searching "1"
    # also returns "number-of-1-bits".
    if kind == "number":
        questions = [q for q in questions if q.get("frontend_id") == value]
        if not questions:
            return {"candidates": [], "exact": False,
                    "error": f"No LeetCode problem numbered {value}."}

    out = []
    for q in questions[:limit]:
        existing = store.get_problem(q["slug"])
        if existing:
            out.append(_from_catalog(existing))
            continue
        out.append(_candidate(q["slug"], q["title"], q["difficulty"],
                              packs.category_from_tags(q.get("tags") or []),
                              False, q.get("frontend_id")))
    if not out:
        return {"candidates": [], "exact": False,
                "error": f"Nothing on LeetCode matched \u201c{query.strip()}\u201d."}
    return {"candidates": out, "exact": len(out) == 1}
