from datetime import datetime

from app.extensions import db


class AuthSession(db.Model):
    """A device's login session: device_uuid -> refresh-token hash + metadata.

    This is the authoritative session store. It used to live in Redis, but that
    instance is memory-capped with an ``allkeys-lru`` policy and no persistence,
    so sessions were being silently evicted (or wiped on a Redis restart) — and a
    missing session makes the very next token refresh fail, logging the user out.
    A session must be DURABLE, so it lives in Postgres. Ephemeral auth state (OTP
    codes, resend cooldowns, reg tickets) still lives in Redis, where losing a key
    only means requesting a new code.
    """

    __tablename__ = "sessions"

    # = the browser/device id the client sends as X-Device-UUID.
    device_uuid = db.Column(db.String(64), primary_key=True)
    user_uuid = db.Column(db.String(36), nullable=False, index=True)
    phone = db.Column(db.String(32), nullable=False)
    status = db.Column(db.String(16), nullable=False, default="active")
    # sha256 of the currently-valid refresh token for this device.
    refresh_token_hash = db.Column(db.String(64), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    last_seen = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    # Mirrors the old Redis TTL. A row past this instant is treated as absent
    # (a reaper can prune them; expiry is enforced on read regardless).
    expires_at = db.Column(db.DateTime, nullable=False, index=True)
