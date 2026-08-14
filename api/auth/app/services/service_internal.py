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
    # Profile fields (display_name) live in the users service now; auth returns
    # identity only. Callers needing a name resolve it via users /internal/profiles.
    return {"user": {"id": user.id}}, 200


def users(data: dict) -> tuple[dict, int]:
    try:
        ids = [str(i) for i in (data.get("ids") or [])][:200]
    except (ValueError, TypeError):
        return {"error": "ids must be integers"}, 400
    rows = User.query.filter(User.id.in_(ids)).all() if ids else []
    # Profile fields moved to the users service; auth's /internal/users now returns
    # identity only. Its sole remaining consumer is notifications (for phone).
    return {"users": [
        {"id": u.id, "phone": u.phone}
        for u in rows
    ]}, 200