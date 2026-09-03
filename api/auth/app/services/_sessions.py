"""Durable auth sessions in Postgres (device_uuid -> refresh hash + metadata).

Sessions were previously in Redis, where a memory-capped, ``allkeys-lru``,
no-persistence instance could evict or lose them — silently logging users out on
their next token refresh. The session store must be durable, so it lives in
Postgres now (see app/models/session.py). Ephemeral auth state (OTP codes, resend
cooldowns, reg tickets) still lives in Redis (see service_auth), where losing a
key just means the user requests a new code.

The public functions keep their previous names/signatures so callers
(service_auth, service_refresh, service_logout) are unchanged.
"""
from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timedelta, timezone

from app.extensions import db
from app.models.session import AuthSession

SESSION_STATUS_ACTIVE = "active"


def is_valid_uuid(value: str | None) -> bool:
    if not value:
        return False
    try:
        uuid.UUID(str(value))
        return True
    except (ValueError, TypeError):
        return False


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def utc_now_ts() -> int:
    return int(datetime.now(timezone.utc).timestamp())


def hash_refresh_token(refresh_token: str) -> str:
    return hashlib.sha256(refresh_token.encode()).hexdigest()


def build_session_fields(
    *,
    user_uuid: str,
    phone: str,
    refresh_token_hash: str,
) -> dict[str, str]:
    return {
        "user_uuid": user_uuid,
        "phone": phone,
        "refresh_token_hash": refresh_token_hash,
    }


def upsert_session(
    *,
    device_uuid: str,
    user_uuid: str,
    session_fields: dict[str, str],
    ttl: int,
) -> None:
    """Create or replace the session row for a device (login / re-login)."""
    now = datetime.utcnow()
    row = db.session.get(AuthSession, device_uuid)
    if row is None:
        row = AuthSession(device_uuid=device_uuid, created_at=now)
        db.session.add(row)
    row.user_uuid = session_fields.get("user_uuid", user_uuid)
    row.phone = session_fields["phone"]
    row.refresh_token_hash = session_fields["refresh_token_hash"]
    row.status = SESSION_STATUS_ACTIVE
    row.last_seen = now
    row.expires_at = now + timedelta(seconds=ttl)
    db.session.commit()


def touch_session(device_uuid: str, refresh_token_hash: str, ttl: int) -> None:
    """Rotate the stored refresh hash and slide the expiry (on refresh)."""
    now = datetime.utcnow()
    row = db.session.get(AuthSession, device_uuid)
    if row is None:
        return
    row.refresh_token_hash = refresh_token_hash
    row.last_seen = now
    row.expires_at = now + timedelta(seconds=ttl)
    db.session.commit()


def get_session_fields(device_uuid: str, fields: list[str]) -> list[str | None]:
    """Read selected columns for a device. A missing OR expired row reads as all
    None — same contract the Redis version had when a key was gone/expired."""
    row = db.session.get(AuthSession, device_uuid)
    if row is None or row.expires_at <= datetime.utcnow():
        return [None] * len(fields)
    return [getattr(row, name, None) for name in fields]


def delete_session(device_uuid: str) -> str | None:
    """Delete a device's session; return the user_uuid it belonged to (or None)."""
    row = db.session.get(AuthSession, device_uuid)
    if row is None:
        return None
    user_uuid = row.user_uuid
    db.session.delete(row)
    db.session.commit()
    return user_uuid


def zrem_user_session(user_uuid: str, device_uuid: str) -> None:
    """No-op. In the Redis model this removed the device from a per-user set;
    with the Postgres table the row itself is the session, and delete_session
    removes it. Kept so callers don't change."""
    return None


def delete_user_sessions(user_uuid: str) -> int:
    """Delete every session row for a user (account deletion). Idempotent."""
    deleted = AuthSession.query.filter(AuthSession.user_uuid == str(user_uuid)).delete(
        synchronize_session=False
    )
    db.session.commit()
    return deleted
