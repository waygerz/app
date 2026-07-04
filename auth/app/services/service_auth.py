"""Auth domain: signup, login, session."""
import random
import re

import phonenumbers
from flask import current_app, jsonify, make_response
from flask_jwt_extended import create_access_token, create_refresh_token

from app.extensions import db, get_redis
from app.models.user import User
from app.services import _sessions
from app.utils.config import Config
from app.utils.cookies import attach_auth_cookies
from werkzeug.security import check_password_hash, generate_password_hash

PIN_RE = re.compile(r"^[0-9]{4}$")
_DEFAULT_REGION = "US"
_DUMMY_PIN_HASH = generate_password_hash("0000")


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
    return generate_password_hash(pin)


def _verify_pin(pin: str, pin_hash: str) -> bool:
    return check_password_hash(pin_hash, pin)


def _verify_pin_constant_time(pin: str, pin_hash: str | None) -> bool:
    if not pin_hash:
        check_password_hash(_DUMMY_PIN_HASH, pin)
        return False
    return check_password_hash(pin_hash, pin)


def _otp_key(phone: str) -> str:
    return f"otp:{phone}"


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
    return current_app.config["APP_ENV"] != "production"


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


def signup_start(data: dict) -> tuple[dict, int]:
    try:
        phone = normalize_phone(data.get("phone"))
    except InvalidPhone:
        return {"error": "invalid phone number"}, 400
    if User.query.filter_by(phone=phone).first():
        return {"error": "phone already registered"}, 409
    code = _generate_otp(phone)
    resp = {"message": "OTP sent", "phone": phone}
    if _reveal_otp():
        resp["dev_otp"] = code
    return resp, 200


def signup_verify(data: dict):
    code = str(data.get("otp", ""))
    pin = str(data.get("pin", ""))
    display_name = (data.get("display_name") or "").strip()
    device_uuid = _device_uuid(data)
    if device_uuid is not None and not _sessions.is_valid_uuid(device_uuid):
        return {"error": "invalid device_uuid format"}, 400
    try:
        phone = normalize_phone(data.get("phone"))
    except InvalidPhone:
        return {"error": "invalid phone number"}, 400
    if not PIN_RE.match(pin):
        return {"error": "pin must be exactly 4 digits"}, 400
    if not display_name:
        return {"error": "display_name is required"}, 400
    if User.query.filter_by(phone=phone).first():
        return {"error": "phone already registered"}, 409
    if not _verify_otp(phone, code):
        return {"error": "invalid or expired OTP"}, 400
    user = User(phone=phone, pin_hash=hash_pin(pin), display_name=display_name)
    db.session.add(user)
    db.session.commit()
    return _issue_auth_response(user, device_uuid=device_uuid, status=201)


def login(data: dict):
    pin = str(data.get("pin", ""))
    device_uuid = _device_uuid(data)
    if device_uuid is not None and not _sessions.is_valid_uuid(device_uuid):
        return {"error": "invalid device_uuid format"}, 400
    try:
        phone = normalize_phone(data.get("phone"))
    except InvalidPhone:
        return {"error": "invalid phone or PIN"}, 401
    user = User.query.filter_by(phone=phone).first()
    if not user:
        _verify_pin_constant_time(pin, None)
        return {"error": "invalid phone or PIN"}, 401
    if not _verify_pin_constant_time(pin, user.pin_hash):
        return {"error": "invalid phone or PIN"}, 401
    return _issue_auth_response(user, device_uuid=device_uuid)


def me(user_id: str) -> tuple[dict, int]:
    user = db.session.get(User, user_id)
    if not user:
        return {"error": "user not found"}, 404
    return {"user": user.to_dict()}, 200