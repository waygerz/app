"""Internal leagues endpoints for cross-service calls."""
from flask import request

from app.extensions import db
from app.models.league import League
from app.models.member import ACTIVE, LeagueMember
from app.models.sport import LeagueSport
from app.models import feed as feed_model
from app.models.feed import LeagueFeed
from app.services.service_leagues import add_feed, current_period, grade_open_periods, rollover_periods


def are_comembers():
    data = request.get_json(silent=True) or {}
    league_id = str(data.get("league_id", ""))
    a, b = str(data.get("user_a", "")), str(data.get("user_b", ""))
    n = LeagueMember.query.filter(
        LeagueMember.league_id == league_id,
        LeagueMember.status == ACTIVE,
        LeagueMember.user_id.in_([a, b]),
    ).count()
    return {"are_comembers": (a != b and n == 2)}, 200


def league_context():
    data = request.get_json(silent=True) or {}
    league_id = str(data.get("league_id", ""))
    league = db.session.get(League, league_id)
    if not league:
        return {"error": "league not found"}, 404
    period = current_period(league_id)
    sports = LeagueSport.query.filter_by(league_id=league_id).all()
    return {"context": {
        "league_id": league.id,
        "league_type": league.league_type,
        "commissioner_id": league.commissioner_id,
        "status": league.status,
        "account": league.account,
        "period_id": period.id if period else None,
        # Weekly leagues gate betting on the currently open week; season/H2H
        # leagues bet all season while active, so a finalized period must NOT
        # close their betting — that was the "advance period" brick (a season
        # period going FINAL left period_status="final" → propose rejected).
        "period_status": (
            period.status if league.period_type == "weekly"
            else ("open" if league.status == "active" else "closed")
        ),
        "min_wager_cents": league.min_wager_cents,
        "max_wager_cents": league.max_wager_cents,
        "starting_balance_cents": league.starting_balance_cents,
        "rules": league.rules or {},
        "sport_league_ids": [s.sport_league_id for s in sports],
    }}, 200


def share_membership():
    """True when two users are active members of at least one shared league."""
    data = request.get_json(silent=True) or {}
    a = str(data.get("user_a", ""))
    b = str(data.get("user_b", ""))
    if not a or not b or a == b:
        return {"share_membership": False}, 200
    a_league_ids = {
        str(r.league_id)
        for r in LeagueMember.query.filter_by(user_id=a, status=ACTIVE).all()
    }
    if not a_league_ids:
        return {"share_membership": False}, 200
    shared = LeagueMember.query.filter(
        LeagueMember.user_id == b,
        LeagueMember.status == ACTIVE,
        LeagueMember.league_id.in_(a_league_ids),
    ).first()
    return {"share_membership": shared is not None}, 200


def user_league_ids():
    """List active league memberships for a user (messaging inbox filter)."""
    data = request.get_json(silent=True) or {}
    user_id = str(data.get("user_id", ""))
    if not user_id:
        return {"error": "user_id is required"}, 400
    rows = LeagueMember.query.filter_by(user_id=user_id, status=ACTIVE).all()
    return {"league_ids": [str(r.league_id) for r in rows]}, 200


def member_access():
    """Verify an active league member (for messaging and other cross-service checks)."""
    data = request.get_json(silent=True) or {}
    league_id = str(data.get("league_id", ""))
    user_id = str(data.get("user_id", ""))
    if not league_id or not user_id:
        return {"error": "league_id and user_id are required"}, 400
    if not LeagueMember.query.filter_by(
        league_id=league_id, user_id=user_id, status=ACTIVE
    ).first():
        return {"error": "not a member"}, 404
    return {"ok": True, "league_id": league_id, "user_id": user_id}, 200


def tick():
    """Grade Pick'em picks and roll league periods. Called by the scheduler service."""
    return {
        "picks_graded": grade_open_periods(),
        "periods_rolled": rollover_periods(),
    }, 200


def feed_posts_access():
    """Batch verify league-member access to feed posts (for comments engagement)."""
    data = request.get_json(silent=True) or {}
    user_id = str(data.get("user_id", ""))
    raw_ids = data.get("post_ids") or []
    post_ids = list({str(p) for p in raw_ids if p})[:100]
    if not post_ids or not user_id:
        return {"posts": []}, 200

    rows = LeagueFeed.query.filter(LeagueFeed.id.in_(post_ids)).all()
    league_ids = {r.league_id for r in rows}
    member_league_ids = {
        m.league_id
        for m in LeagueMember.query.filter(
            LeagueMember.user_id == user_id,
            LeagueMember.status == ACTIVE,
            LeagueMember.league_id.in_(league_ids),
        ).all()
    }
    posts = []
    for row in rows:
        if row.league_id not in member_league_ids:
            continue
        posts.append({
            "id": row.id,
            "league_id": row.league_id,
            "kind": row.kind,
            "author_id": row.author_id,
        })
    return {"posts": posts}, 200


def feed_post_access():
    """Verify a league member can access a feed post (for the comments service)."""
    data = request.get_json(silent=True) or {}
    post_id = str(data.get("post_id", ""))
    user_id = str(data.get("user_id", ""))
    post = db.session.get(LeagueFeed, post_id)
    if not post:
        return {"error": "post not found"}, 404
    if not LeagueMember.query.filter_by(
        league_id=post.league_id, user_id=user_id, status=ACTIVE
    ).first():
        return {"error": "post not found"}, 404
    return {"post": {
        "id": post.id,
        "league_id": post.league_id,
        "kind": post.kind,
        "author_id": post.author_id,
    }}, 200


def add_activity(league_id):
    league_id = str(league_id)
    data = request.get_json(silent=True) or {}
    dedup_key = data.get("dedup_key")
    if dedup_key:
        if LeagueFeed.query.filter_by(dedup_key=dedup_key).first():
            return {"ok": True, "deduped": True}, 200
    item = add_feed(
        league_id, feed_model.ACTIVITY,
        event_type=data.get("event_type"),
        title=data.get("title"), body=data.get("body"),
        link_url=data.get("link_url"), link_label=data.get("link_label"),
        meta=data.get("meta"), dedup_key=dedup_key,
    )
    db.session.commit()
    return {"ok": True, "id": item.id}, 200