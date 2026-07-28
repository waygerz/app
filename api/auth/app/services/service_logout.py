"""Logout: revoke server session when caller proves ownership, always clear cookies."""
import logging

from flask import jsonify, make_response
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request

from app.services import _sessions
from app.utils.cookies import clear_auth_cookies

logger = logging.getLogger(__name__)


def logout_current(request):
    body = request.get_json(silent=True) or {}
    device_uuid = request.headers.get("X-Device-UUID") or body.get("device_uuid")

    if not device_uuid:
        return jsonify({"error": "missing device_uuid"}), 400

    if not _sessions.is_valid_uuid(device_uuid):
        return jsonify({"error": "invalid device_uuid format"}), 400

    actor_uuid = None
    try:
        verify_jwt_in_request(optional=True, locations=["cookies", "headers"])
        actor_uuid = get_jwt_identity()
    except Exception:
        actor_uuid = None

    session_user = _sessions.get_session_fields(device_uuid, ["user_uuid"])[0]
    message = "already logged out"

    if session_user and actor_uuid and actor_uuid == session_user:
        try:
            _sessions.delete_session(device_uuid)
            _sessions.zrem_user_session(actor_uuid, device_uuid)
            message = "logout successful"
        except Exception:
            logger.exception("logout_revoke_failed", extra={"device_uuid": device_uuid})
            return jsonify({"error": "service temporarily unavailable"}), 503
    elif session_user:
        logger.warning(
            "logout_unauthorized_attempt",
            extra={"device_uuid": device_uuid, "actor_uuid": actor_uuid or "", "had_token": bool(actor_uuid)},
        )

    response = make_response(jsonify({"message": message}), 200)
    clear_auth_cookies(response)
    return response