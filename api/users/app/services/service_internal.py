"""Internal profile lookups + upsert (service-to-service).

`resolve_profiles` replaces the profile half of auth's old `/internal/users`
(consumed by friends/leagues/contests/messaging/comments). `upsert_profile` is
called by auth at signup (and by its create-user CLI) to create the profile row
alongside the credential row.
"""
from app.extensions import db
from app.models.favorite_team import FavoriteTeam
from app.models.profile import Profile

TOMBSTONE_NAME = "Deleted user"


def resolve_profiles(data: dict) -> tuple[dict, int]:
    try:
        ids = [str(i) for i in (data.get("ids") or [])][:200]
    except (ValueError, TypeError):
        return {"error": "ids must be a list"}, 400
    rows = Profile.query.filter(Profile.user_id.in_(ids)).all() if ids else []
    return {
        "profiles": [
            {"user_id": p.user_id, "display_name": p.display_name, "avatar_key": p.avatar_key}
            for p in rows
        ]
    }, 200


def upsert_profile(data: dict) -> tuple[dict, int]:
    user_id = str(data.get("user_id") or "").strip()
    display_name = (data.get("display_name") or "").strip()
    if not user_id or not display_name:
        return {"error": "user_id and display_name are required"}, 400
    display_name = display_name[:64]
    p = Profile.query.filter_by(user_id=user_id).first()
    if p is None:
        p = Profile(user_id=user_id, display_name=display_name)
        if "avatar_key" in data:
            p.avatar_key = data.get("avatar_key") or None
        db.session.add(p)
    else:
        p.display_name = display_name
        if "avatar_key" in data:
            p.avatar_key = data.get("avatar_key") or None
    db.session.commit()
    return {"profile": p.to_dict()}, 200


def purge_user(data: dict) -> tuple[dict, int]:
    """Account deletion in the users service.

    The profile row is the tombstone every other service resolves a name/avatar
    through, so it is KEPT but ANONYMIZED: display_name -> "Deleted user",
    avatar_key -> null. Favorite teams are personal and hard-deleted. Idempotent
    (re-running just re-sets the same tombstone). If the profile is already gone
    there's nothing to anonymize.
    """
    try:
        uid = str(data["user_id"])
    except (KeyError, ValueError, TypeError):
        return {"error": "user_id is required"}, 400
    favorites = FavoriteTeam.query.filter(FavoriteTeam.user_id == uid).delete(
        synchronize_session=False
    )
    p = Profile.query.filter_by(user_id=uid).first()
    anonymized = False
    if p is not None:
        p.display_name = TOMBSTONE_NAME
        p.avatar_key = None
        anonymized = True
    db.session.commit()
    return {
        "purged": {"favorite_teams": favorites},
        "anonymized": {"profile": anonymized},
    }, 200
