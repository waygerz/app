"""User-facing profile reads/writes (own profile, via JWT identity)."""
from flask import current_app

from app.extensions import db
from app.models.favorite_team import FavoriteTeam
from app.models.profile import Profile


def _favorites(user_id):
    rows = (
        FavoriteTeam.query.filter_by(user_id=user_id)
        .order_by(FavoriteTeam.position.asc())
        .all()
    )
    return [t.to_dict() for t in rows]


def _profile_dict(p):
    body = p.to_dict()
    body["favorite_teams"] = _favorites(p.user_id)
    return body


def get_profile(user_id):
    p = Profile.query.filter_by(user_id=user_id).first()
    if not p:
        return {"error": "profile not found"}, 404
    return {"profile": _profile_dict(p)}, 200


def update_display_name(user_id, data):
    p = Profile.query.filter_by(user_id=user_id).first()
    if not p:
        return {"error": "profile not found"}, 404
    if "display_name" in data:
        name = (data.get("display_name") or "").strip()
        if not name:
            return {"error": "display name can't be empty"}, 400
        if len(name) > 64:
            return {"error": "display name is too long"}, 400
        p.display_name = name
    db.session.commit()
    return {"profile": _profile_dict(p)}, 200


def set_avatar(user_id, data):
    p = Profile.query.filter_by(user_id=user_id).first()
    if not p:
        return {"error": "profile not found"}, 404
    key = (data.get("avatar_key") or "").strip() or None
    prefix = current_app.config["AVATAR_KEY_PREFIX"]
    if key is not None and not key.startswith(prefix):
        return {"error": "invalid avatar key"}, 400
    p.avatar_key = key
    db.session.commit()
    return {"profile": _profile_dict(p)}, 200
