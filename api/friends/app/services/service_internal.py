"""Internal friends lookups (service-to-service)."""
from app.models.friendship import ACCEPTED
from app.services import service_friends as friends_svc


def are_friends(data: dict) -> tuple[dict, int]:
    try:
        a, b = str(data["user_a"]), str(data["user_b"])
    except (KeyError, ValueError, TypeError):
        return {"error": "user_a and user_b are required"}, 400
    row = friends_svc.pair(a, b)
    return {"are_friends": bool(row and row.status == ACCEPTED)}, 200