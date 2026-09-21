"""Cloudflare Access: verify the signed assertion the edge attaches to a request.

A tunnel puts this app on the public internet, so it cannot trust the network it
is reached over. Access signs a per-application JWT and sends it as
`Cf-Access-Jwt-Assertion`; this module checks that token against the team's
published keys — signature, audience, issuer, expiry — and returns the email it
asserts.

The `Cf-Access-Authenticated-User-Email` header is deliberately never read.
Cloudflare sets it, but it is a claim rather than a proof: anything that can
reach the port can set it too. Only the signed assertion counts.

Unset ACCESS_TEAM_DOMAIN or ACCESS_AUD and none of this is enforced, which is
what local dev and the test suite run as.
"""
import threading
import time

import jwt
from jwt import PyJWKClient

from . import config

# How long a fetched key set is reused. Cloudflare rotates signing keys, and a
# rotation shows up as a `kid` we have never seen — which forces a refetch below
# regardless of this TTL. The TTL only bounds how long a *revoked* key stays
# usable, so it is short-ish without being chatty.
_JWKS_TTL_SECONDS = 600

# Floor between forced refetches. Without it, a stream of tokens carrying an
# unknown `kid` — a misconfiguration, or someone probing — would turn every
# request into an outbound fetch to Cloudflare.
_JWKS_REFETCH_FLOOR_SECONDS = 30


class AccessError(Exception):
    """The assertion is missing, malformed, or not signed for this app."""


_lock = threading.Lock()
_client = None
_client_fetched_at = 0.0


def enabled() -> bool:
    """True when the app should require an Access assertion on every request."""
    return bool(config.ACCESS_TEAM_DOMAIN and config.ACCESS_AUD)


def issuer() -> str:
    return f"https://{config.ACCESS_TEAM_DOMAIN}"


def certs_url() -> str:
    return f"{issuer()}/cdn-cgi/access/certs"


def _jwk_client(force_refresh=False):
    """Return a key-set client, refetching when stale or when asked.

    PyJWKClient caches internally; we hold it behind a TTL so a key rotation is
    picked up without a restart.
    """
    global _client, _client_fetched_at
    with _lock:
        now = time.monotonic()
        stale = now - _client_fetched_at > _JWKS_TTL_SECONDS
        forced = force_refresh and now - _client_fetched_at > _JWKS_REFETCH_FLOOR_SECONDS
        if _client is None or stale or forced:
            _client = PyJWKClient(certs_url(), cache_keys=True, lifespan=_JWKS_TTL_SECONDS)
            _client_fetched_at = now
        return _client


def reset_cache():
    """Drop the cached key set. For tests and for config changes at runtime."""
    global _client, _client_fetched_at
    with _lock:
        _client = None
        _client_fetched_at = 0.0


def _signing_key(token: str):
    try:
        return _jwk_client().get_signing_key_from_jwt(token).key
    except Exception:
        # Most likely a rotated key. Refetch once, then give up — an unknown
        # `kid` after a fresh fetch is a token that was not signed for us.
        try:
            return _jwk_client(force_refresh=True).get_signing_key_from_jwt(token).key
        except Exception as exc:
            raise AccessError(f"no signing key for assertion: {exc}") from exc


def verify(token: str) -> str:
    """Verify an Access assertion and return the email it asserts (lowercased).

    Raises AccessError on anything short of a valid, in-date token issued for
    this application by this team.
    """
    if not token:
        raise AccessError("missing assertion")
    key = _signing_key(token)
    try:
        claims = jwt.decode(
            token,
            key=key,
            algorithms=["RS256"],
            audience=config.ACCESS_AUD,
            issuer=issuer(),
            options={"require": ["exp", "iat", "aud", "iss"]},
        )
    except Exception as exc:
        raise AccessError(f"invalid assertion: {exc}") from exc

    email = (claims.get("email") or "").strip().lower()
    if not email:
        # Service tokens authenticate without one. This app has a single human
        # user, so an identity with no email is not one of ours.
        raise AccessError("assertion carries no email")
    return email
