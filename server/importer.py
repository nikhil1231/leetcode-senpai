"""Populate the problems catalog from packs, discover highly-rated problems,
and backfill solve history."""
import asyncio

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
