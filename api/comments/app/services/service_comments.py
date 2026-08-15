"""Comments, replies, and likes on league feed posts."""
from collections import defaultdict

import requests
from flask import current_app, request
from sqlalchemy import func

from app.extensions import db
from app.models.comment import Comment
from app.models.post_like import PostLike
from app.reactions import REACTION_EMOJI, REACTION_SET


def _headers():
    return {"X-Internal-Token": current_app.config["INTERNAL_TOKEN"]}


def _leagues_base():
    return current_app.config["LEAGUES_URL"]


def resolve_profiles(ids) -> dict:
    """Full profiles from the users service: {user_id: {display_name, avatar_key}}.
    The reactor sheet needs avatars, so we keep both fields here."""
    ids = list({str(i) for i in ids if i})
    if not ids:
        return {}
    resp = requests.post(
        f"{current_app.config['USERS_URL']}/internal/profiles",
        json={"ids": ids},
        headers=_headers(),
        timeout=10,
    )
    resp.raise_for_status()
    return {
        p["user_id"]: {"display_name": p.get("display_name"), "avatar_key": p.get("avatar_key")}
        for p in resp.json().get("profiles", [])
    }


def resolve_users(ids) -> dict:
    """Names only — the comment-author path just needs display_name."""
    return {uid: p.get("display_name") for uid, p in resolve_profiles(ids).items()}


def _verify_post_access(post_id, user_id):
    resp = requests.post(
        f"{_leagues_base()}/internal/feed-post-access",
        json={"post_id": str(post_id), "user_id": str(user_id)},
        headers=_headers(),
        timeout=10,
    )
    if resp.status_code == 404:
        return None, {"error": "post not found"}, 404
    resp.raise_for_status()
    return resp.json()["post"], None, None


def _accessible_posts(post_ids, user_id):
    resp = requests.post(
        f"{_leagues_base()}/internal/feed-posts-access",
        json={"post_ids": [str(p) for p in post_ids], "user_id": str(user_id)},
        headers=_headers(),
        timeout=10,
    )
    resp.raise_for_status()
    return {p["id"]: p for p in resp.json().get("posts", [])}


def _thread_comments(rows, names):
    replies_by_parent = defaultdict(list)
    top_level = []
    for row in rows:
        d = row.to_dict(author_name=names.get(row.author_id))
        if row.parent_id:
            replies_by_parent[str(row.parent_id)].append(d)
        else:
            top_level.append(d)
    for comment in top_level:
        comment["replies"] = replies_by_parent.get(comment["id"], [])
    return top_level


def list_comments(post_id, me):
    post, err, status = _verify_post_access(post_id, me)
    if err:
        return err, status

    limit = min(int(request.args.get("limit", 100)), 200)
    rows = (
        Comment.query.filter_by(post_id=str(post_id))
        .order_by(Comment.created_at.asc())
        .limit(limit)
        .all()
    )
    names = resolve_users([c.author_id for c in rows])
    return {
        "post_id": str(post_id),
        "league_id": post["league_id"],
        "comments": _thread_comments(rows, names),
    }, 200


def create_comment(post_id, me, data):
    post, err, status = _verify_post_access(post_id, me)
    if err:
        return err, status

    body = (data.get("body") or "").strip()
    if not body:
        return {"error": "body is required"}, 400
    max_len = current_app.config["MAX_COMMENT_BODY"]
    if len(body) > max_len:
        return {"error": f"body must be at most {max_len} characters"}, 400

    parent_id = data.get("parent_id")
    if parent_id:
        parent = db.session.get(Comment, str(parent_id))
        if not parent or parent.post_id != str(post_id):
            return {"error": "parent comment not found"}, 404
        if parent.parent_id:
            return {"error": "cannot reply to a reply"}, 400

    comment = Comment(
        post_id=str(post_id),
        league_id=post["league_id"],
        author_id=str(me),
        parent_id=str(parent_id) if parent_id else None,
        body=body,
    )
    db.session.add(comment)
    db.session.commit()

    names = resolve_users([me])
    return {"comment": comment.to_dict(author_name=names.get(str(me)))}, 201


def delete_comment(comment_id, me):
    comment = db.session.get(Comment, str(comment_id))
    if not comment:
        return {"error": "comment not found"}, 404
    if comment.author_id != str(me):
        return {"error": "forbidden"}, 403

    _, err, status = _verify_post_access(comment.post_id, me)
    if err:
        return err, status

    db.session.delete(comment)
    db.session.commit()
    return {"ok": True}, 200


def toggle_post_like(post_id, me):
    _, err, status = _verify_post_access(post_id, me)
    if err:
        return err, status

    post_id = str(post_id)
    existing = PostLike.query.filter_by(post_id=post_id, user_id=str(me)).first()
    if existing:
        db.session.delete(existing)
        liked = False
    else:
        db.session.add(PostLike(post_id=post_id, user_id=str(me)))
        liked = True
    db.session.commit()

    like_count = PostLike.query.filter_by(post_id=post_id).count()
    return {"post_id": post_id, "liked": liked, "like_count": like_count}, 200


def _reaction_summary(post_id, me):
    """{reactions: {key: n} (non-zero), total_reactions, my_reaction} for a post."""
    counts = dict(
        db.session.query(PostLike.reaction, func.count(PostLike.id))
        .filter(PostLike.post_id == post_id)
        .group_by(PostLike.reaction)
        .all()
    )
    mine = PostLike.query.filter_by(post_id=post_id, user_id=str(me)).first()
    reactions = {k: int(v) for k, v in counts.items() if v}
    return {
        "post_id": post_id,
        "reactions": reactions,
        "total_reactions": sum(reactions.values()),
        "my_reaction": mine.reaction if mine else None,
    }


def _notify_reaction(post_id, post, reactor_id, reaction):
    """Best-effort in-app notify to the post author. Never blocks the reaction."""
    author_id = (post or {}).get("author_id")
    if not author_id or author_id == str(reactor_id):
        return  # no author (system post) or self-reaction
    actor = resolve_profiles([reactor_id]).get(str(reactor_id), {})
    name = actor.get("display_name") or "Someone"
    emoji = REACTION_EMOJI.get(reaction, "")
    try:
        requests.post(
            f"{current_app.config['NOTIFICATIONS_URL']}/internal/notify",
            json={
                "user_id": author_id,
                "category": "reaction",
                "channels": ["inapp"],
                "title": f"{name} reacted {emoji} to your post",
                "deep_link": f"/leagues/{post['league_id']}",
                "ref_type": "feed_post",
                "ref_id": post_id,
                "dedup_key": f"reaction:{post_id}:{reactor_id}",
                "actor": {
                    "id": str(reactor_id),
                    "name": name,
                    "avatar_key": actor.get("avatar_key"),
                },
            },
            headers=_headers(),
            timeout=3,
        )
    except Exception as exc:  # noqa: BLE001 — notify is best-effort
        current_app.logger.warning("reaction notify failed post=%s: %s", post_id, exc)


def set_reaction(post_id, me, data):
    reaction = (data.get("reaction") or "").strip()
    if reaction not in REACTION_SET:
        return {"error": "invalid reaction"}, 400

    post, err, status = _verify_post_access(post_id, me)
    if err:
        return err, status

    post_id = str(post_id)
    existing = PostLike.query.filter_by(post_id=post_id, user_id=str(me)).first()
    is_new = existing is None
    changed = existing is not None and existing.reaction != reaction
    if existing:
        existing.reaction = reaction
    else:
        db.session.add(PostLike(post_id=post_id, user_id=str(me), reaction=reaction))
    db.session.commit()

    # Notify only on a genuinely new/changed reaction (dedup guards repeats anyway).
    if is_new or changed:
        _notify_reaction(post_id, post, me, reaction)

    return _reaction_summary(post_id, me), 200


def remove_reaction(post_id, me):
    _, err, status = _verify_post_access(post_id, me)
    if err:
        return err, status

    post_id = str(post_id)
    existing = PostLike.query.filter_by(post_id=post_id, user_id=str(me)).first()
    if existing:
        db.session.delete(existing)
        db.session.commit()
    return _reaction_summary(post_id, me), 200


def list_reactions(post_id, me):
    _, err, status = _verify_post_access(post_id, me)
    if err:
        return err, status

    rows = (
        PostLike.query.filter_by(post_id=str(post_id))
        .order_by(PostLike.created_at.asc())
        .all()
    )
    profiles = resolve_profiles([r.user_id for r in rows])
    reactors = [
        {
            "user_id": r.user_id,
            "reaction": r.reaction,
            "display_name": profiles.get(r.user_id, {}).get("display_name"),
            "avatar_key": profiles.get(r.user_id, {}).get("avatar_key"),
        }
        for r in rows
    ]
    return {"post_id": str(post_id), "reactors": reactors}, 200


def posts_engagement(me, data):
    post_ids = list({str(p) for p in (data.get("post_ids") or []) if p})[:100]
    if not post_ids:
        return {"posts": {}}, 200

    accessible = _accessible_posts(post_ids, me)
    allowed_ids = list(accessible.keys())
    if not allowed_ids:
        return {"posts": {}}, 200

    breakdown = defaultdict(dict)  # post_id -> {reaction: count}
    for pid, reaction, cnt in (
        db.session.query(PostLike.post_id, PostLike.reaction, func.count(PostLike.id))
        .filter(PostLike.post_id.in_(allowed_ids))
        .group_by(PostLike.post_id, PostLike.reaction)
        .all()
    ):
        breakdown[pid][reaction] = int(cnt)

    my_reactions = {
        row.post_id: row.reaction
        for row in PostLike.query.filter(
            PostLike.post_id.in_(allowed_ids),
            PostLike.user_id == str(me),
        ).all()
    }
    comment_counts = dict(
        db.session.query(Comment.post_id, func.count(Comment.id))
        .filter(Comment.post_id.in_(allowed_ids))
        .group_by(Comment.post_id)
        .all()
    )

    posts = {}
    for pid in allowed_ids:
        reactions = breakdown.get(pid, {})
        total = sum(reactions.values())
        my = my_reactions.get(pid)
        posts[pid] = {
            "reactions": reactions,
            "total_reactions": total,
            "my_reaction": my,
            "comment_count": int(comment_counts.get(pid, 0)),
            # Back-compat so an un-rolled webui still works mid-deploy.
            "like_count": total,
            "liked_by_me": my is not None,
        }
    return {"posts": posts}, 200