"""No-favorites nudge — scheduler-driven /internal/tick.

A user who still has zero favorite teams a while after signup gets a ONE-TIME
in-app notification ("pick your favorite teams") linking to the account favorites
card. `profiles.favorites_nudged_at` is the once-only latch; we only stamp it
after a successful notify, so a notifications outage just retries next tick. The
notification `dedup_key` is a second guard against a double-send.
"""
from datetime import datetime, timedelta

import requests
from flask import current_app

from app.extensions import db
from app.models.favorite_team import FavoriteTeam
from app.models.profile import Profile


def _send_nudge(user_id) -> bool:
    base = current_app.config["NOTIFICATIONS_URL"]
    if not base:
        return False
    try:
        resp = requests.post(
            f"{base}/internal/notify",
            json={
                "user_id": str(user_id),
                "category": "account",
                "title": "Pick your favorite teams",
                "context": {},
                "channels": ["inapp"],  # in-app only — never SMS a nudge
                "deep_link": current_app.config["FAVORITES_NUDGE_DEEP_LINK"],
                "dedup_key": f"favorites_nudge:{user_id}",
            },
            headers={"X-Internal-Token": current_app.config["INTERNAL_TOKEN"]},
            timeout=3,
        )
        return resp.ok
    except Exception:  # noqa: BLE001
        current_app.logger.exception("favorites nudge failed user=%s", user_id)
        return False


def tick() -> tuple[dict, int]:
    cutoff = datetime.utcnow() - timedelta(hours=current_app.config["FAVORITES_NUDGE_AFTER_HOURS"])
    batch = current_app.config["FAVORITES_NUDGE_BATCH"]

    profiles = (
        Profile.query.filter(Profile.favorites_nudged_at.is_(None))
        .filter(Profile.created_at < cutoff)
        .filter(~Profile.user_id.in_(db.session.query(FavoriteTeam.user_id)))
        .limit(batch)
        .all()
    )

    nudged = 0
    for p in profiles:
        if _send_nudge(p.user_id):
            p.favorites_nudged_at = datetime.utcnow()
            nudged += 1
    if nudged:
        db.session.commit()
    return {"favorites_nudged": nudged}, 200
