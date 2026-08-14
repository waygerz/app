"""Internal profile lookups + upsert (service-to-service).

`resolve_profiles` replaces the profile half of auth's old `/internal/users`
(consumed by friends/leagues/contests/messaging/comments). `upsert_profile` is
called by auth at signup (and by its create-user CLI) to create the profile row
alongside the credential row.
"""
from app.extensions import db
from app.models.profile import Profile


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
