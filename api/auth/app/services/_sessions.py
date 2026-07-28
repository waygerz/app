"""Redis-backed auth sessions (device_uuid → refresh hash + metadata)."""
from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timezone

from app.extensions import get_redis

SESSION_STATUS_ACTIVE = "active"
_RK_AUTH_SESSIONS = "auth:sessions"
_RK_USERS_SESSIONS = "users:sessions"


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


def auth_session_key(device_uuid: str) -> str:
    return f"{_RK_AUTH_SESSIONS}:{device_uuid}"


def user_sessions_key(user_uuid: str) -> str:
    return f"{_RK_USERS_SESSIONS}:{user_uuid}"


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
        "status": SESSION_STATUS_ACTIVE,
        "refresh_token_hash": refresh_token_hash,
        "last_seen": utc_now_iso(),
    }


def upsert_session(
    *,
    device_uuid: str,
    user_uuid: str,
    session_fields: dict[str, str],
    ttl: int,
) -> None:
    redis = get_redis()
    key = auth_session_key(device_uuid)
    redis.hset(key, mapping=session_fields)
    redis.expire(key, ttl)
    redis.zadd(user_sessions_key(user_uuid), {device_uuid: utc_now_ts()})


def touch_session(device_uuid: str, refresh_token_hash: str, ttl: int) -> None:
    redis = get_redis()
    key = auth_session_key(device_uuid)
    redis.hset(key, mapping={"refresh_token_hash": refresh_token_hash, "last_seen": utc_now_iso()})
    redis.expire(key, ttl)


def get_session_fields(device_uuid: str, fields: list[str]) -> list[str | None]:
    redis = get_redis()
    values = redis.hmget(auth_session_key(device_uuid), fields)
    return list(values)


def delete_session(device_uuid: str) -> str | None:
    redis = get_redis()
    key = auth_session_key(device_uuid)
    user_uuid = redis.hget(key, "user_uuid")
    redis.delete(key)
    return user_uuid


def zrem_user_session(user_uuid: str, device_uuid: str) -> None:
    get_redis().zrem(user_sessions_key(user_uuid), device_uuid)