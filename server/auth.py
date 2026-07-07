"""Firebase auth: verify the caller's Google ID token and enforce the email
allowlist. In local mode (AUTH_MODE=local) auth is bypassed entirely.
"""
from fastapi import Header, HTTPException

from . import config


async def require_user(authorization: str = Header(None)):
    """FastAPI dependency. Returns the caller's uid. Raises 401/403 otherwise."""
    if config.local_mode():
        return config.DEV_UID

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


def leetcode_auth(x_lc_session: str = Header(None), x_lc_csrf: str = Header(None)):
    """Pull the LeetCode cookie out of request headers (browser localStorage).
    Used transiently; never persisted."""
    if not x_lc_session:
        return None
    return {"session": x_lc_session, "csrf": x_lc_csrf}
