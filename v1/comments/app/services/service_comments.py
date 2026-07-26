"""Comments, replies, and likes on league feed posts."""
from collections import defaultdict

import requests
from flask import current_app, request
from sqlalchemy import func

from app.extensions import db
from app.models.comment import Comment
from app.models.post_like import PostLike


def _headers():
    return {"X-Internal-Token": current_app.config["INTERNAL_TOKEN"]}


def _leagues_base():
    return current_app.config["LEAGUES_URL"]


def _auth_base():
    return current_app.config["AUTH_URL"]


def resolve_users(ids) -> dict:
    ids = list({str(i) for i in ids if i})
    if not ids:
        return {}
    resp = requests.post(
        f"{_auth_base()}/internal/users",
        json={"ids": ids},
        headers=_headers(),
        timeout=10,
    )
    resp.raise_for_status()
    return {u["id"]: u["display_name"] for u in resp.json().get("users", [])}


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


def posts_engagement(me, data):
    post_ids = list({str(p) for p in (data.get("post_ids") or []) if p})[:100]
    if not post_ids:
        return {"posts": {}}, 200

    accessible = _accessible_posts(post_ids, me)
    allowed_ids = list(accessible.keys())
    if not allowed_ids:
        return {"posts": {}}, 200

    like_counts = dict(
        db.session.query(PostLike.post_id, func.count(PostLike.id))
        .filter(PostLike.post_id.in_(allowed_ids))
        .group_by(PostLike.post_id)
        .all()
    )
    my_likes = {
        row.post_id
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
        posts[pid] = {
            "like_count": int(like_counts.get(pid, 0)),
            "liked_by_me": pid in my_likes,
            "comment_count": int(comment_counts.get(pid, 0)),
        }
    return {"posts": posts}, 200