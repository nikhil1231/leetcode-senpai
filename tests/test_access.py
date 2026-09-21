"""Cloudflare Access assertion verification.

No I/O: a throwaway RSA key stands in for Cloudflare's, and the key lookup is
monkeypatched to hand it back. What is under test is the decision — which
tokens open the door and which do not — not the fetch.
"""
import datetime as dt

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException

from server import access, auth, config

TEAM = "nikhil.cloudflareaccess.com"
AUD = "a" * 64
OWNER = "nikhil@example.com"


@pytest.fixture(scope="module")
def keypair():
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    return pem, key.public_key()


@pytest.fixture(autouse=True)
def access_configured(monkeypatch, keypair):
    """Point the module at the test team/app and at the test signing key."""
    _, public = keypair
    monkeypatch.setattr(config, "ACCESS_TEAM_DOMAIN", TEAM)
    monkeypatch.setattr(config, "ACCESS_AUD", AUD)
    monkeypatch.setattr(config, "ALLOWED_EMAILS", [OWNER])
    monkeypatch.setattr(config, "ACCESS_UID", "firebase-uid-123")
    monkeypatch.setattr(access, "_signing_key", lambda token: public)
    access.reset_cache()


def make_token(keypair, *, aud=AUD, iss=None, email=OWNER, age_seconds=0,
               lifetime_seconds=3600, omit=()):
    private, _ = keypair
    now = dt.datetime.now(dt.timezone.utc) - dt.timedelta(seconds=age_seconds)
    claims = {
        "aud": aud,
        "iss": iss if iss is not None else f"https://{TEAM}",
        "iat": now,
        "exp": now + dt.timedelta(seconds=lifetime_seconds),
        "email": email,
    }
    for name in omit:
        claims.pop(name, None)
    return jwt.encode(claims, private, algorithm="RS256")


# ---- verify ---------------------------------------------------------------------
def test_valid_assertion_yields_the_email(keypair):
    assert access.verify(make_token(keypair)) == OWNER


def test_email_is_lowercased(keypair):
    assert access.verify(make_token(keypair, email="Nikhil@Example.COM")) == OWNER


def test_enabled_needs_both_team_and_audience(monkeypatch):
    assert access.enabled()
    monkeypatch.setattr(config, "ACCESS_AUD", "")
    assert not access.enabled()


def test_token_for_another_application_is_refused(keypair):
    """The audience tag is what separates this app from anything else behind
    the same Access team — a valid token for a sibling app must not work here."""
    with pytest.raises(access.AccessError):
        access.verify(make_token(keypair, aud="b" * 64))


def test_token_from_another_team_is_refused(keypair):
    with pytest.raises(access.AccessError):
        access.verify(make_token(keypair, iss="https://someone-else.cloudflareaccess.com"))


def test_expired_token_is_refused(keypair):
    with pytest.raises(access.AccessError):
        access.verify(make_token(keypair, age_seconds=7200, lifetime_seconds=3600))


def test_unsigned_token_is_refused(keypair):
    """`alg: none` is the classic way in. PyJWT is told RS256 and only RS256."""
    forged = jwt.encode({"aud": AUD, "iss": f"https://{TEAM}", "email": OWNER},
                        key="", algorithm="none")
    with pytest.raises(access.AccessError):
        access.verify(forged)


def test_token_signed_by_a_different_key_is_refused(keypair):
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = other.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    forged = make_token((pem, None))
    with pytest.raises(access.AccessError):
        access.verify(forged)


def test_missing_expiry_is_refused(keypair):
    """A token with no expiry would be a permanent key if it ever leaked."""
    with pytest.raises(access.AccessError):
        access.verify(make_token(keypair, omit=("exp",)))


def test_service_token_without_an_email_is_refused(keypair):
    with pytest.raises(access.AccessError):
        access.verify(make_token(keypair, email=""))


def test_empty_assertion_is_refused():
    with pytest.raises(access.AccessError):
        access.verify("")


# ---- the auth dependency --------------------------------------------------------
def test_verified_owner_gets_the_configured_uid(keypair):
    assert auth._require_access(make_token(keypair)) == "firebase-uid-123"


def test_missing_assertion_is_401(keypair):
    with pytest.raises(HTTPException) as exc:
        auth._require_access(None)
    assert exc.value.status_code == 401


def test_invalid_assertion_is_401(keypair):
    with pytest.raises(HTTPException) as exc:
        auth._require_access(make_token(keypair, aud="b" * 64))
    assert exc.value.status_code == 401


def test_verified_but_unlisted_email_is_403(keypair):
    """403 rather than 401, because reloading the page cannot fix it: the edge
    would just sign the same person in again."""
    with pytest.raises(HTTPException) as exc:
        auth._require_access(make_token(keypair, email="stranger@example.com"))
    assert exc.value.status_code == 403


def test_unconfigured_access_mode_refuses_everything(monkeypatch, keypair):
    """Fails closed. A deployment that forgot ACCESS_AUD must be a shut door,
    not an open one — this app is reachable from the public internet."""
    monkeypatch.setattr(config, "ACCESS_AUD", "")
    with pytest.raises(HTTPException) as exc:
        auth._require_access(make_token(keypair))
    assert exc.value.status_code == 503
