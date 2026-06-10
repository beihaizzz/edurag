"""Unit tests for app.core.security — pure functions, no DB needed."""

from datetime import datetime, timedelta, timezone

import pytest
from jose import jwt

from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)


# ═══════════════════════════════════════════════════════════════════
# helpers
# ═══════════════════════════════════════════════════════════════════

def decode_without_sub_validation(token: str) -> dict:
    """Decode JWT without sub claim type validation.

    python-jose 3.x requires ``sub`` to be a string but the EduRAG source
    code stores integer user IDs as ``sub``.  Use this helper to inspect
    token payloads in create_access_token / create_refresh_token tests.
    """
    return jwt.decode(
        token,
        settings.SECRET_KEY,
        algorithms=[settings.ALGORITHM],
        options={"verify_sub": False},
    )


# ═══════════════════════════════════════════════════════════════════
# hash_password
# ═══════════════════════════════════════════════════════════════════

class TestHashPassword:
    """Tests for hash_password()."""

    def test_returns_different_from_input(self):
        """Hashed password should not equal the plain-text input."""
        plain = "MySecret123"
        hashed = hash_password(plain)
        assert hashed != plain
        # bcrypt hashes start with $2
        assert hashed.startswith("$2")

    def test_consistent_for_same_input(self):
        """Same input produces different hashes (salt) but both verify."""
        plain = "SamePassword"
        h1 = hash_password(plain)
        h2 = hash_password(plain)
        assert h1 != h2
        assert verify_password(plain, h1) is True
        assert verify_password(plain, h2) is True

    def test_different_for_different_input(self):
        """Different passwords produce different hashes."""
        h1 = hash_password("Alpha")
        h2 = hash_password("Beta")
        assert h1 != h2


# ═══════════════════════════════════════════════════════════════════
# verify_password
# ═══════════════════════════════════════════════════════════════════

class TestVerifyPassword:
    """Tests for verify_password()."""

    def test_true_for_correct_password(self):
        plain = "CorrectHorse"
        hashed = hash_password(plain)
        assert verify_password(plain, hashed) is True

    def test_false_for_wrong_password(self):
        plain = "CorrectHorse"
        hashed = hash_password(plain)
        assert verify_password("WrongPassword", hashed) is False

    def test_false_for_empty_string(self):
        hashed = hash_password("RealPassword")
        assert verify_password("", hashed) is False

    def test_false_for_nonexistent_user_hash(self):
        """Verifying against a hash of a different password returns False."""
        hashed = hash_password("Alpha")
        assert verify_password("Beta", hashed) is False


# ═══════════════════════════════════════════════════════════════════
# create_access_token
# ═══════════════════════════════════════════════════════════════════

class TestCreateAccessToken:
    """Tests for create_access_token()."""

    def test_returns_non_empty_string(self):
        token = create_access_token(data={"sub": 1, "role": "student"})
        assert isinstance(token, str)
        assert len(token) > 0

    def test_contains_required_claims(self):
        data = {"sub": 42, "role": "teacher"}
        token = create_access_token(data=data)
        payload = decode_without_sub_validation(token)
        assert payload["sub"] == 42
        assert payload["role"] == "teacher"
        assert payload["type"] == "access"
        assert "exp" in payload

    def test_expiry_is_in_the_future(self):
        token = create_access_token(data={"sub": 1, "role": "student"})
        payload = decode_without_sub_validation(token)
        exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
        now = datetime.now(timezone.utc)
        assert exp > now
        assert exp < now + timedelta(minutes=61)

    def test_different_data_produces_different_token(self):
        t1 = create_access_token(data={"sub": 1, "role": "student"})
        t2 = create_access_token(data={"sub": 2, "role": "admin"})
        assert t1 != t2


# ═══════════════════════════════════════════════════════════════════
# create_refresh_token
# ═══════════════════════════════════════════════════════════════════

class TestCreateRefreshToken:
    """Tests for create_refresh_token()."""

    def test_returns_non_empty_string(self):
        token = create_refresh_token(data={"sub": 1, "role": "student"})
        assert isinstance(token, str)
        assert len(token) > 0

    def test_type_is_refresh(self):
        token = create_refresh_token(data={"sub": 1, "role": "student"})
        payload = decode_without_sub_validation(token)
        assert payload["type"] == "refresh"

    def test_longer_expiry_than_access(self):
        """Refresh token should expire ~7 days from now."""
        token = create_refresh_token(data={"sub": 1, "role": "student"})
        payload = decode_without_sub_validation(token)
        exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
        now = datetime.now(timezone.utc)
        assert exp > now + timedelta(days=6)
        assert exp < now + timedelta(days=8)

    def test_contains_sub_and_role(self):
        token = create_refresh_token(data={"sub": 99, "role": "student"})
        payload = decode_without_sub_validation(token)
        assert payload["sub"] == 99
        assert payload["role"] == "student"


# ═══════════════════════════════════════════════════════════════════
# decode_token
# ═══════════════════════════════════════════════════════════════════

class TestDecodeToken:
    """Tests for decode_token().

    NOTE: The EduRAG source code passes integer ``sub`` values to
    ``create_access_token`` / ``create_refresh_token`` (e.g. ``{sub: user.id}``).
    python-jose 3.x requires ``sub`` to be a string, so ``decode_token``
    returns ``None`` for tokens with integer ``sub``.  This is the
    **actual** behaviour of the current codebase.
    """

    def test_valid_token_with_string_sub_returns_payload(self):
        """Token with a string sub claim decodes successfully."""
        token = jwt.encode(
            {"sub": "1", "role": "student", "type": "access"},
            settings.SECRET_KEY,
            algorithm=settings.ALGORITHM,
        )
        payload = decode_token(token)
        assert isinstance(payload, dict)
        assert payload["sub"] == "1"

    def test_integer_sub_returns_none(self):
        """decode_token returns None when sub is an integer (current bug)."""
        token = create_access_token(data={"sub": 1, "role": "student"})
        result = decode_token(token)
        assert result is None

    def test_invalid_garbage_token_returns_none(self):
        assert decode_token("not.a.valid.jwt") is None
        assert decode_token("") is None
        assert decode_token("abc123") is None

    def test_expired_token_returns_none(self):
        """An already-expired token should decode to None."""
        expired_payload = {
            "sub": "1",
            "role": "student",
            "exp": datetime.now(timezone.utc) - timedelta(hours=1),
            "type": "access",
        }
        expired_token = jwt.encode(
            expired_payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM
        )
        result = decode_token(expired_token)
        assert result is None

    def test_wrong_signature_returns_none(self):
        """Token signed with a different key should return None."""
        wrong_token = jwt.encode(
            {"sub": "1", "role": "student", "type": "access"},
            "wrong-secret-key-for-testing",
            algorithm=settings.ALGORITHM,
        )
        result = decode_token(wrong_token)
        assert result is None
