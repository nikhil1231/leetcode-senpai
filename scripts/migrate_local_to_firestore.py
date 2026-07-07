"""One-time migration: local_data.json -> Firestore.

The V2 app is Firestore-only. This copies the existing global problem catalog
and per-user data (attempts / reviews / sessions / settings) into Firestore.

Idempotent: problems keyed by slug, reviews by slug, settings merged; attempts
and sessions are matched by their original id so re-running won't duplicate.

Usage (from the repo root, with a service-account key):

    GOOGLE_APPLICATION_CREDENTIALS=/path/key.json \
    GOOGLE_CLOUD_PROJECT=your-project \
    DEV_UID=<your-firebase-uid> \
    python scripts/migrate_local_to_firestore.py

By default the local "local-dev" user's data is written under DEV_UID. Pass
--source-uid to pick a different source user from the JSON. local_data.json is
left untouched as a backup.
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server import config  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", default="local_data.json")
    ap.add_argument("--source-uid", default=None,
                    help="which user in the JSON to migrate (default: first / only)")
    ap.add_argument("--target-uid", default=config.DEV_UID,
                    help="Firestore uid to write under (default: DEV_UID)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    with open(args.file, "r", encoding="utf-8") as f:
        data = json.load(f)

    problems = data.get("problems", {})
    users = data.get("users", {})
    src = args.source_uid or next(iter(users), None)
    if src is None:
        print("No users in JSON; nothing to migrate for user data.")
    user = users.get(src, {}) if src else {}

    attempts = user.get("attempts", {})
    reviews = user.get("reviews", {})
    sessions = user.get("sessions", {})
    settings = user.get("settings", {})

    print(f"Source user: {src!r} -> target uid: {args.target_uid!r}")
    print(f"  problems={len(problems)} attempts={len(attempts)} "
          f"reviews={len(reviews)} sessions={len(sessions)} "
          f"settings_keys={len(settings)}")

    if args.dry_run:
        print("Dry run — no writes.")
        return

    config.init_firebase_admin()
    from firebase_admin import firestore
    db = firestore.client()

    # problems (global)
    pcol = db.collection("problems")
    for slug, doc in problems.items():
        pcol.document(slug).set(doc, merge=True)
    print(f"Wrote {len(problems)} problems.")

    uref = db.collection("users").document(args.target_uid)

    for aid, doc in attempts.items():
        uref.collection("attempts").document(aid).set(doc, merge=True)
    print(f"Wrote {len(attempts)} attempts.")

    for slug, doc in reviews.items():
        uref.collection("reviews").document(slug).set({**doc, "slug": slug}, merge=True)
    print(f"Wrote {len(reviews)} reviews.")

    for sid, doc in sessions.items():
        uref.collection("sessions").document(sid).set(doc, merge=True)
    print(f"Wrote {len(sessions)} sessions.")

    if settings:
        uref.set({"settings": settings}, merge=True)
        print(f"Merged {len(settings)} settings keys.")

    print("Done. local_data.json left untouched as a backup.")


if __name__ == "__main__":
    main()
