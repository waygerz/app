"""Auth domain: passwordless phone + OTP login/signup, session."""
import random
import secrets

import phonenumbers
from flask import current_app, jsonify, make_response
from flask_jwt_extended import create_access_token, create_refresh_token

from app.extensions import db, get_redis
from app.models.user import User
from app.services import _sessions, service_sms
from app.utils.config import Config
from app.utils.cookies import attach_auth_cookies
from werkzeug.security import generate_password_hash

_DEFAULT_REGION = "US"


class InvalidPhone(ValueError):
    pass


def normalize_phone(raw: str) -> str:
    try:
        num = phonenumbers.parse(raw or "", _DEFAULT_REGION)
    except phonenumbers.NumberParseException:
        raise InvalidPhone("invalid phone number")
    if not phonenumbers.is_valid_number_for_region(num, _DEFAULT_REGION):
        raise InvalidPhone("invalid phone number")
    return phonenumbers.format_number(num, phonenumbers.PhoneNumberFormat.E164)


def hash_pin(pin: str) -> str:
    """Retained for the `create-user` CLI; passwordless auth doesn't use PINs."""
    return generate_password_hash(pin)


def _otp_key(phone: str) -> str:
    return f"otp:{phone}"


def _otp_cooldown_key(phone: str) -> str:
    return f"otp:cooldown:{phone}"


def _otp_attempts_key(phone: str) -> str:
    return f"otp:attempts:{phone}"


def _reg_ticket_key(token: str) -> str:
    return f"regticket:{token}"


def _generate_otp(phone: str) -> str:
    code = f"{random.randint(0, 999_999):06d}"
    get_redis().setex(_otp_key(phone), current_app.config["OTP_TTL_SECONDS"], code)
    return code


def _verify_otp(phone: str, code: str) -> bool:
    stored = get_redis().get(_otp_key(phone))
    if stored is None or stored != code:
        return False
    get_redis().delete(_otp_key(phone))
    return True


def _reveal_otp() -> bool:
    return (
        current_app.config["APP_ENV"] != "production"
        or current_app.config.get("AUTH_REVEAL_OTP", False)
    )


def _issue_reg_ticket(phone: str) -> str:
    token = secrets.token_urlsafe(32)
    get_redis().setex(
        _reg_ticket_key(token),
        current_app.config["AUTH_REG_TICKET_TTL_SECONDS"],
        phone,
    )
    return token


def _consume_reg_ticket(token: str) -> str | None:
    if not token:
        return None
    key = _reg_ticket_key(token)
    r = get_redis()
    phone = r.get(key)
    if phone is not None:
        r.delete(key)
    return phone


def _refresh_ttl() -> int:
    return int(Config.JWT_REFRESH_TOKEN_EXPIRES.total_seconds())


def _device_uuid(data: dict) -> str | None:
    value = data.get("device_uuid")
    if value is None or value == "":
        return None
    return str(value)


def _issue_auth_response(user, *, device_uuid: str | None, status: int = 200):
    user_uuid = str(user.id)
    phone = user.phone
    claims = {"phone": phone}
    if device_uuid:
        claims["device_uuid"] = device_uuid

    access_token = create_access_token(identity=user_uuid, additional_claims=claims)
    refresh_token = create_refresh_token(identity=user_uuid, additional_claims=claims)

    if device_uuid and _sessions.is_valid_uuid(device_uuid):
        existing_user, existing_status = _sessions.get_session_fields(device_uuid, ["user_uuid", "status"])
        if (
            existing_status == _sessions.SESSION_STATUS_ACTIVE
            and existing_user
            and existing_user != user_uuid
        ):
            deleted = _sessions.delete_session(device_uuid)
            if deleted:
                _sessions.zrem_user_session(deleted, device_uuid)

        _sessions.upsert_session(
            device_uuid=device_uuid,
            user_uuid=user_uuid,
            session_fields=_sessions.build_session_fields(
                user_uuid=user_uuid,
                phone=phone,
                refresh_token_hash=_sessions.hash_refresh_token(refresh_token),
            ),
            ttl=_refresh_ttl(),
        )

    response = make_response(jsonify({"user": user.to_dict()}), status)
    attach_auth_cookies(response, access_token, refresh_token)
    return response


def otp_start(data: dict) -> tuple[dict, int]:
    """Send a login/signup code. Same response for new and existing numbers."""
    try:
        phone = normalize_phone(data.get("phone"))
    except InvalidPhone:
        return {"error": "invalid phone number"}, 400
    r = get_redis()
    if r.get(_otp_cooldown_key(phone)):
        return {"error": "a code was just sent — wait a moment before requesting another"}, 429
    code = _generate_otp(phone)
    r.setex(_otp_cooldown_key(phone), current_app.config["AUTH_OTP_RESEND_COOLDOWN_SECONDS"], "1")
    r.delete(_otp_attempts_key(phone))
    service_sms.send_otp(phone, code)
    resp = {"message": "code sent", "phone": phone}
    if _reveal_otp():
        resp["dev_otp"] = code
    return resp, 200


def otp_verify(data: dict):
    """Verify the code. Existing user → logged in. New user → needs_profile + ticket."""
    code = str(data.get("otp", ""))
    device_uuid = _device_uuid(data)
    if device_uuid is not None and not _sessions.is_valid_uuid(device_uuid):
        return {"error": "invalid device_uuid format"}, 400
    try:
        phone = normalize_phone(data.get("phone"))
    except InvalidPhone:
        return {"error": "invalid phone number"}, 400

    r = get_redis()
    attempts_key = _otp_attempts_key(phone)
    attempts = r.incr(attempts_key)
    if attempts == 1:
        r.expire(attempts_key, current_app.config["OTP_TTL_SECONDS"])
    if attempts > current_app.config["AUTH_OTP_MAX_ATTEMPTS"]:
        r.delete(_otp_key(phone))
        return {"error": "too many attempts — request a new code"}, 429

    if not _verify_otp(phone, code):
        return {"error": "invalid or expired code"}, 400

    r.delete(attempts_key)
    r.delete(_otp_cooldown_key(phone))

    user = User.query.filter_by(phone=phone).first()
    if user:
        return _issue_auth_response(user, device_uuid=device_uuid)

    ticket = _issue_reg_ticket(phone)
    return {"needs_profile": True, "ticket": ticket}, 200


def otp_complete(data: dict):
    """Finalize a new signup: create the account from a reg ticket + display name."""
    token = str(data.get("ticket", ""))
    display_name = (data.get("display_name") or "").strip()
    device_uuid = _device_uuid(data)
    if device_uuid is not None and not _sessions.is_valid_uuid(device_uuid):
        return {"error": "invalid device_uuid format"}, 400
    if not display_name:
        return {"error": "display_name is required"}, 400

    phone = _consume_reg_ticket(token)
    if not phone:
        return {"error": "registration session expired — start again"}, 400
    if User.query.filter_by(phone=phone).first():
        return {"error": "phone already registered"}, 409

    user = User(phone=phone, display_name=display_name)
    db.session.add(user)
    db.session.commit()
    return _issue_auth_response(user, device_uuid=device_uuid, status=201)


def me(user_id: str) -> tuple[dict, int]:
    user = db.session.get(User, user_id)
    if not user:
        return {"error": "user not found"}, 404
    return {"user": user.to_dict()}, 200


def set_avatar(user_id: str, data: dict) -> tuple[dict, int]:
    """Set (or clear) the caller's avatar to an uploaded S3 key."""
    key = (data.get("avatar_key") or "").strip() or None
    if key is not None and not key.startswith("members/avatars/"):
        return {"error": "invalid avatar key"}, 400
    user = db.session.get(User, user_id)
    if not user:
        return {"error": "user not found"}, 404
    user.avatar_key = key
    db.session.commit()
    return {"user": user.to_dict()}, 200
