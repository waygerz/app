"""Refresh access token via HttpOnly refresh cookie + device session."""
import logging

import jwt
from flask import jsonify, make_response
from flask_jwt_extended import create_access_token, create_refresh_token, decode_token

from app.extensions import get_redis
from app.services import _sessions
from app.utils.config import Config
from app.utils.cookies import attach_auth_cookies, auth_cookie_names, clear_auth_cookies

logger = logging.getLogger(__name__)

_TOKEN_FAILURES = (jwt.PyJWTError, PermissionError, ValueError)


def _refresh_ttl() -> int:
    return int(Config.JWT_REFRESH_TOKEN_EXPIRES.total_seconds())


def refresh_access_token(request):
    _, refresh_name = auth_cookie_names()
    token = request.cookies.get(refresh_name)
    body = request.get_json(silent=True) or {}
    device_uuid = request.headers.get("X-Device-UUID") or body.get("device_uuid")

    if not token or not device_uuid:
        return make_response(jsonify({"error": "missing refresh token or device_uuid"}), 401)

    if not _sessions.is_valid_uuid(device_uuid):
        return make_response(jsonify({"error": "invalid device_uuid format"}), 400)

    try:
        user_uuid, phone, access_token, new_refresh = _rotate_refresh_token(token, device_uuid)
    except _TOKEN_FAILURES as exc:
        logger.warning("refresh_rejected", extra={"device_uuid": device_uuid, "reason": str(exc)})
        try:
            deleted_user = _sessions.delete_session(device_uuid)
            if deleted_user:
                _sessions.zrem_user_session(deleted_user, device_uuid)
        except Exception:
            logger.exception("refresh_session_cleanup_failed", extra={"device_uuid": device_uuid})
        resp = make_response(jsonify({"error": "token refresh failed"}), 403)
        clear_auth_cookies(resp)
        return resp
    except Exception:
        logger.exception("refresh_infra_failure", extra={"device_uuid": device_uuid})
        return make_response(jsonify({"error": "service temporarily unavailable"}), 503)

    payload = {"message": "access token refreshed"}
    response = make_response(jsonify(payload), 200)
    attach_auth_cookies(response, access_token, new_refresh)
    return response


def _rotate_refresh_token(refresh_token: str, device_uuid: str) -> tuple[str, str, str, str]:
    decoded = decode_token(refresh_token, allow_expired=False)
    user_uuid = decoded.get("sub")
    phone = (decoded.get("phone") or "").strip()
    token_device = decoded.get("device_uuid")

    if not user_uuid or not phone or token_device != device_uuid:
        raise ValueError("invalid token payload")

    status, expected_hash, session_user = _sessions.get_session_fields(
        device_uuid, ["status", "refresh_token_hash", "user_uuid"]
    )
    if not status or status != _sessions.SESSION_STATUS_ACTIVE:
        raise PermissionError("inactive session")
    if session_user != user_uuid:
        raise PermissionError("session user mismatch")

    presented = _sessions.hash_refresh_token(refresh_token)
    if expected_hash != presented:
        logger.warning(
            "refresh_token_reuse_detected",
            extra={"device_uuid": device_uuid, "user_uuid": user_uuid},
        )
        raise PermissionError("refresh token reuse detected")

    claims = {"phone": phone, "device_uuid": device_uuid}
    access_token = create_access_token(identity=user_uuid, additional_claims=claims)
    new_refresh = create_refresh_token(identity=user_uuid, additional_claims=claims)
    ttl = _refresh_ttl()
    _sessions.touch_session(device_uuid, _sessions.hash_refresh_token(new_refresh), ttl)
    redis = get_redis()
    redis.zadd(_sessions.user_sessions_key(user_uuid), {device_uuid: _sessions.utc_now_ts()})
    redis.expire(_sessions.auth_session_key(device_uuid), ttl)

    return user_uuid, phone, access_token, new_refresh