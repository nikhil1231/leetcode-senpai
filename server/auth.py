"""Request authentication.

Three modes, picked by AUTH_MODE:

- "firebase" — verify the caller's Google ID token and enforce the email
  allowlist. The Cloud Run deployment.
- "access"   — verify the Cloudflare Access assertion the edge attaches. The
  tunnelled laptop deployment, where Access does the Google sign-in and the app
  has no login page of its own.
- "local"    — bypassed entirely, for local dev against real Firestore.
"""
from fastapi import Depends, Header, HTTPException

from . import access, config, store


def _require_access(assertion: str | None) -> str:
    """Authenticate a tunnelled request. Returns the uid, or raises.

    Nothing falls back to an unauthenticated caller here. The whole point of
    this mode is that the app is reachable from the public internet: if the
    Access policy is ever off or misconfigured, the failure has to be a closed
    door rather than a stranger arriving as the owner.
    """
    if not access.enabled():
        # AUTH_MODE says Access but the app was never told which application's
        # assertions to trust, so there is nothing to verify against.
        raise HTTPException(503, "access auth is not configured")
    if not assertion:
        raise HTTPException(401, "missing access assertion")
    try:
        email = access.verify(assertion)
    except access.AccessError:
        raise HTTPException(401, "invalid access assertion")
    if email.startswith(access.SERVICE) and email[len(access.SERVICE):] in config.ACCESS_SERVICE_TOKENS:
        return config.ACCESS_UID   # an allowlisted service token (a phone shortcut, a script)
    if config.ALLOWED_EMAILS and email not in config.ALLOWED_EMAILS:
        raise HTTPException(403, "not authorized")
    return config.ACCESS_UID


async def require_user(authorization: str = Header(None),
                       cf_access_jwt_assertion: str = Header(None)):
    """FastAPI dependency. Returns the caller's uid. Raises 401/403 otherwise."""
    if config.local_mode():
        return config.DEV_UID

    if config.access_mode():
        return _require_access(cf_access_jwt_assertion)

    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "missing bearer token")
    token = authorization.split(" ", 1)[1].strip()

    config.init_firebase_admin()
    from firebase_admin import auth as fb_auth
    try:
        decoded = fb_auth.verify_id_token(token)
    except Exception:
        raise HTTPException(401, "invalid token")

    email = (decoded.get("email") or "").lower()
    if config.ALLOWED_EMAILS and email not in config.ALLOWED_EMAILS:
        raise HTTPException(403, "not authorized")
    if not decoded.get("email_verified", False):
        raise HTTPException(403, "email not verified")
    return decoded["uid"]


# Returned when the credentials cannot be read (Firestore offline). Callers
# treat it as "no auth", and the status endpoint reports "unknown" rather than
# claiming the cookie is missing.
CREDENTIALS_UNAVAILABLE = {"unavailable": True}


def leetcode_auth(uid: str = Depends(require_user)):
    """The caller's saved LeetCode credentials, from Firestore.

    One pair per user, shared by every device. Kept out of settings so it is
    never echoed back by the config endpoint; callers get the raw values only
    long enough to put them on a LeetCode request.
    """
    try:
        return store.get_store(uid).get_leetcode_auth()
    except Exception:
        return CREDENTIALS_UNAVAILABLE
