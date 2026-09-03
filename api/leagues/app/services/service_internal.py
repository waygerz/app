"""Internal leagues endpoints for cross-service calls."""
from sqlalchemy import or_

from flask import request

from app.extensions import db
from app.models.league import ARCHIVED, League
from app.models.member import ACTIVE, LeagueMember
from app.models.sport import LeagueSport
from app.models import feed as feed_model
from app.models.feed import LeagueFeed
from app.models.feed_read import LeagueFeedRead
from app.models.invite import LeagueInvite
from app.models.invite_code import LeagueInviteCode
from app.services.service_leagues import (
    add_feed, current_period, grade_open_periods, reconcile_recent_finals, rollover_periods, _reannounce_winners,
)

TOMBSTONE_NAME = "Deleted user"


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
    graded = grade_open_periods()
    # Safety net: re-verify recently-final picks against the current event, so a
    # result corrected after grading (a late fix, or an outage-era finalization
    # the real feed overturns) self-heals instead of staying frozen. Must never
    # break the core tick, so it's guarded.
    try:
        reconciled = reconcile_recent_finals()
    except Exception as exc:  # noqa: BLE001
        reconciled = 0
        print(f"[reconcile] pass failed: {exc}", flush=True)
    rolled = rollover_periods()
    # After grading + rollover, fill in the winner on any period that finished
    # grading late, or whose grades the reconcile pass just corrected (its
    # period_final post was written / reset generic).
    reannounced = _reannounce_winners()
    return {
        "picks_graded": graded,
        "picks_reconciled": reconciled,
        "periods_rolled": rolled,
        "winners_reannounced": reannounced,
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
    existing = LeagueFeed.query.filter_by(dedup_key=dedup_key).first() if dedup_key else None
    if existing:
        # Default: dedup_key means "post once" (skip repeats). With upsert set,
        # a repeat updates the post in place instead — e.g. a multi-opponent bet
        # gaining another acceptor re-renders the same row with the new list.
        if not data.get("upsert"):
            return {"ok": True, "deduped": True}, 200
        existing.event_type = data.get("event_type", existing.event_type)
        existing.author_id = data.get("author_id", existing.author_id)
        existing.title = data.get("title", existing.title)
        existing.body = data.get("body", existing.body)
        existing.meta = data.get("meta", existing.meta)
        db.session.commit()
        return {"ok": True, "id": existing.id, "updated": True}, 200
    item = add_feed(
        league_id, feed_model.ACTIVITY,
        event_type=data.get("event_type"),
        author_id=data.get("author_id"),
        title=data.get("title"), body=data.get("body"),
        link_url=data.get("link_url"), link_label=data.get("link_label"),
        meta=data.get("meta"), dedup_key=dedup_key,
    )
    db.session.commit()
    return {"ok": True, "id": item.id}, 200

def commissioned_leagues():
    """Preflight for account deletion: the non-archived leagues this user
    commissions. A non-empty result BLOCKS deletion — the user must transfer
    ownership or archive each first (both are existing member/league endpoints).
    """
    data = request.get_json(silent=True) or {}
    try:
        uid = str(data["user_id"])
    except (KeyError, ValueError, TypeError):
        return {"error": "user_id is required"}, 400
    rows = League.query.filter(
        League.commissioner_id == uid, League.status != ARCHIVED
    ).all()
    out = []
    for lg in rows:
        members = LeagueMember.query.filter(
            LeagueMember.league_id == lg.id, LeagueMember.status == ACTIVE
        ).count()
        out.append(
            {"id": lg.id, "name": lg.name, "status": lg.status, "member_count": members}
        )
    return {"leagues": out}, 200


def purge_user():
    """Account deletion in the leagues service.

    Deletes the user's PERSONAL rows (membership, feed read-cursor, invite codes
    they created, and league invites they sent or received). KEPT as shared
    history: their picks, pick confirmations, and feed posts. The one kept row
    that freezes their name in text is the `member_joined` system post — its
    `author_id` is null, so it's located via `meta->>'user_id'` and its
    title/body are rewritten to the "Deleted user" tombstone. Idempotent.

    NOTE: relies on the caller's preflight (`commissioned_leagues`) having already
    blocked deletion while the user commissions any non-archived league, so we
    never orphan a live league here.
    """
    data = request.get_json(silent=True) or {}
    try:
        uid = str(data["user_id"])
    except (KeyError, ValueError, TypeError):
        return {"error": "user_id is required"}, 400

    members = LeagueMember.query.filter(LeagueMember.user_id == uid).delete(
        synchronize_session=False
    )
    reads = LeagueFeedRead.query.filter(LeagueFeedRead.user_id == uid).delete(
        synchronize_session=False
    )
    codes = LeagueInviteCode.query.filter(LeagueInviteCode.created_by == uid).delete(
        synchronize_session=False
    )
    invites = LeagueInvite.query.filter(
        or_(LeagueInvite.inviter_id == uid, LeagueInvite.invitee_id == uid)
    ).delete(synchronize_session=False)

    # Scrub the deleted user's name out of the kept `member_joined` system post
    # (author_id is null on system activity, so match on meta->>'user_id').
    scrubbed = (
        LeagueFeed.query.filter(
            LeagueFeed.event_type == "member_joined",
            LeagueFeed.meta["user_id"].astext == uid,
        ).update(
            {
                LeagueFeed.title: f"{TOMBSTONE_NAME} joined",
                LeagueFeed.body: f"{TOMBSTONE_NAME} joined the league.",
            },
            synchronize_session=False,
        )
    )

    db.session.commit()
    return {
        "purged": {
            "league_members": members,
            "feed_reads": reads,
            "invite_codes": codes,
            "league_invites": invites,
        },
        "scrubbed": {"member_joined_feed": scrubbed},
    }, 200
