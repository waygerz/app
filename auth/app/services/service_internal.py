"""Internal auth lookups (service-to-service)."""
from app.models.user import User
from app.services.service_auth import InvalidPhone, normalize_phone


def lookup_phone(data: dict) -> tuple[dict, int]:
    try:
        phone = normalize_phone(data.get("phone"))
    except InvalidPhone:
        return {"error": "invalid phone number"}, 400
    user = User.query.filter_by(phone=phone).first()
    if not user:
        return {"error": "not found"}, 404
    return {"user": {"id": user.id, "display_name": user.display_name}}, 200


def users(data: dict) -> tuple[dict, int]:
    try:
        ids = [str(i) for i in (data.get("ids") or [])][:200]
    except (ValueError, TypeError):
        return {"error": "ids must be integers"}, 400
    rows = User.query.filter(User.id.in_(ids)).all() if ids else []
    return {"users": [
        {"id": u.id, "display_name": u.display_name, "avatar_key": u.avatar_key}
        for u in rows
    ]}, 200