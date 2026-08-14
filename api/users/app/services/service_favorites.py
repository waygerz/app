"""Favorite-team management: replace the user's whole ordered list.

The contract is deliberately "send the new list" — add / remove / reorder /
set-primary all collapse to one PUT. Position is the array index (0 = primary).
The per-user cap is enforced here (Config.FAVORITE_TEAMS_MAX), not in the DB.
Teams are stored as SNAPSHOTS (name/abbr/logo/color) so profile cards render
without a live ingestor call.
"""
from flask import current_app

from app.extensions import db
from app.models.favorite_team import FavoriteTeam


def _s(v):
    """Coerce a scalar field to a stripped string. Returns None for a
    non-scalar (dict/list/bool) so callers can reject with a 400 instead of
    crashing on `.strip()`."""
    if v is None:
        return ""
    if isinstance(v, bool):  # bool is an int subclass — reject explicitly
        return None
    if isinstance(v, (str, int, float)):
        return str(v).strip()
    return None


def _normalize(items):
    """Validate + dedup the incoming list. Returns (cleaned_list, error_or_None)."""
    if not isinstance(items, list):
        return None, "teams must be a list"
    cleaned = []
    seen = set()
    for it in items:
        if not isinstance(it, dict):
            return None, "each team must be an object"
        sport = _s(it.get("sport"))
        league = _s(it.get("league"))
        external_id = _s(it.get("external_id"))
        name = _s(it.get("name"))
        abbreviation = _s(it.get("abbreviation"))
        logo = _s(it.get("logo"))
        color = _s(it.get("color"))
        if None in (sport, league, external_id, name, abbreviation, logo, color):
            return None, "team fields must be strings"
        if not (sport and league and external_id and name and abbreviation):
            return None, "each team needs sport, league, external_id, name, and abbreviation"
        key = (sport, league, external_id)
        if key in seen:
            continue  # drop duplicates, keep first occurrence / order
        seen.add(key)
        cleaned.append(
            {
                "sport": sport[:32],
                "league": league[:32],
                "external_id": external_id[:64],
                "name": name[:120],
                "abbreviation": abbreviation[:12],
                "logo": logo[:400] or None,
                "color": color[:16] or None,
            }
        )
    return cleaned, None


def save_favorites(user_id, data):
    items = data.get("teams") if isinstance(data, dict) else None
    if items is None:
        return {"error": "teams is required"}, 400
    cleaned, err = _normalize(items)
    if err:
        return {"error": err}, 400
    cap = current_app.config["FAVORITE_TEAMS_MAX"]
    if len(cleaned) > cap:
        return {"error": f"you can favorite at most {cap} teams"}, 400

    # Replace the whole list atomically (delete + reinsert with fresh positions).
    FavoriteTeam.query.filter_by(user_id=user_id).delete()
    for i, t in enumerate(cleaned):
        db.session.add(
            FavoriteTeam(
                user_id=user_id,
                position=i,
                sport=t["sport"],
                league=t["league"],
                external_id=t["external_id"],
                name=t["name"],
                abbreviation=t["abbreviation"],
                logo=t["logo"],
                color=t["color"],
            )
        )
    db.session.commit()

    rows = (
        FavoriteTeam.query.filter_by(user_id=user_id)
        .order_by(FavoriteTeam.position.asc())
        .all()
    )
    return {"favorite_teams": [r.to_dict() for r in rows]}, 200
