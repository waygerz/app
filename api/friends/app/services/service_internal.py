"""Internal friends lookups (service-to-service)."""
from sqlalchemy import or_

from app.extensions import db
from app.models.friendship import ACCEPTED, Friendship
from app.models.invite_code import FriendInviteCode
from app.services import service_friends as friends_svc


def are_friends(data: dict) -> tuple[dict, int]:
    try:
        a, b = str(data["user_a"]), str(data["user_b"])
    except (KeyError, ValueError, TypeError):
        return {"error": "user_a and user_b are required"}, 400
    row = friends_svc.pair(a, b)
    return {"are_friends": bool(row and row.status == ACCEPTED)}, 200


def purge_user(data: dict) -> tuple[dict, int]:
    """Delete all of one user's friends-service rows (account deletion).

    Friendships (either direction) and the user's own invite codes are purely
    personal, so they're hard-deleted. Idempotent: a re-run finds nothing.
    """
    try:
        uid = str(data["user_id"])
    except (KeyError, ValueError, TypeError):
        return {"error": "user_id is required"}, 400
    friendships = Friendship.query.filter(
        or_(Friendship.requester_id == uid, Friendship.addressee_id == uid)
    ).delete(synchronize_session=False)
    codes = FriendInviteCode.query.filter(FriendInviteCode.owner_id == uid).delete(
        synchronize_session=False
    )
    db.session.commit()
    return {"purged": {"friendships": friendships, "invite_codes": codes}}, 200