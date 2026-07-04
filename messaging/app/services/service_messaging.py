"""Realtime messaging: direct DMs + league group chats."""
import json
import time
from datetime import datetime

import requests
from flask import Response, current_app, request, stream_with_context
from sqlalchemy import or_

from app.extensions import db, get_redis
from app.models.chat_message import ChatMessage
from app.models.conversation import DIRECT, LEAGUE, Conversation
from app.services import service_rate, service_unread


def _headers():
    return {"X-Internal-Token": current_app.config["INTERNAL_TOKEN"]}


def _channel(conversation_id):
    return f"messaging:conv:{conversation_id}"


def _direct_key(a, b):
    return ":".join(sorted([str(a), str(b)]))


def resolve_users(ids) -> dict:
    ids = list({str(i) for i in ids if i})
    if not ids:
        return {}
    resp = requests.post(
        f"{current_app.config['AUTH_URL']}/internal/users",
        json={"ids": ids},
        headers=_headers(),
        timeout=10,
    )
    resp.raise_for_status()
    return {u["id"]: u["display_name"] for u in resp.json().get("users", [])}


def _are_friends(a, b):
    resp = requests.post(
        f"{current_app.config['FRIENDS_URL']}/internal/are-friends",
        json={"user_a": str(a), "user_b": str(b)},
        headers=_headers(),
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json().get("are_friends", False)


def _share_league_membership(a, b):
    resp = requests.post(
        f"{current_app.config['LEAGUES_URL']}/internal/share-membership",
        json={"user_a": str(a), "user_b": str(b)},
        headers=_headers(),
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json().get("share_membership", False)


def _can_direct_message(me, other):
    if _are_friends(me, other):
        return True
    return _share_league_membership(me, other)


def _is_league_member(league_id, user_id):
    resp = requests.post(
        f"{current_app.config['LEAGUES_URL']}/internal/member-access",
        json={"league_id": str(league_id), "user_id": str(user_id)},
        headers=_headers(),
        timeout=10,
    )
    return resp.status_code == 200


def _user_league_ids(user_id):
    resp = requests.post(
        f"{current_app.config['LEAGUES_URL']}/internal/user-league-ids",
        json={"user_id": str(user_id)},
        headers=_headers(),
        timeout=10,
    )
    resp.raise_for_status()
    return [str(i) for i in resp.json().get("league_ids", [])]


def _can_access(conversation, user_id):
    user_id = str(user_id)
    if conversation.type == LEAGUE:
        return _is_league_member(conversation.league_id, user_id)
    if conversation.type == DIRECT:
        parts = (conversation.direct_key or "").split(":")
        return user_id in parts
    return False


def _publish(conversation_id, payload: dict):
    redis = get_redis()
    if redis:
        redis.publish(_channel(conversation_id), json.dumps(payload))


def _conversations_for_user(me):
    me = str(me)
    direct = Conversation.query.filter(
        Conversation.type == DIRECT,
        or_(
            Conversation.direct_key.like(f"{me}:%"),
            Conversation.direct_key.like(f"%:{me}"),
        ),
    ).all()

    league_ids = _user_league_ids(me)
    league = []
    if league_ids:
        league = Conversation.query.filter(
            Conversation.type == LEAGUE,
            Conversation.league_id.in_(league_ids),
        ).all()
    return direct + league


def _serialize_conversations(me, convs):
    me = str(me)
    out = []
    author_ids = []
    other_ids = []
    for conv in convs:
        last = (
            ChatMessage.query.filter_by(conversation_id=conv.id)
            .order_by(ChatMessage.created_at.desc())
            .first()
        )
        if last:
            author_ids.append(last.author_id)
        other_id = conv.other_user_id(me)
        if other_id:
            other_ids.append(other_id)
        out.append((conv, last))

    names = resolve_users([*author_ids, *other_ids])
    unread = service_unread.unread_counts_for_user(me, [c.id for c, _ in out])
    rows = []
    for conv, last in out:
        last_d = None
        if last:
            last_d = last.to_dict(author_name=names.get(last.author_id))
        other_user = None
        other_id = conv.other_user_id(me)
        if other_id:
            other_user = {
                "id": other_id,
                "display_name": names.get(other_id, "User"),
            }
        rows.append(
            conv.to_dict(
                last_message=last_d,
                unread_count=unread.get(str(conv.id), 0),
                other_user=other_user,
            )
        )

    rows.sort(
        key=lambda r: r.get("last_message", {}).get("created_at", r["created_at"]),
        reverse=True,
    )
    return rows


def list_conversations(me):
    convs = _conversations_for_user(me)
    return {"conversations": _serialize_conversations(me, convs)}, 200


def unread_count(me):
    convs = _conversations_for_user(me)
    counts, total = service_unread.unread_summary(me, [c.id for c in convs])
    return {"total": total, "by_conv": counts}, 200


def mark_conversation_read(conversation_id, me):
    conv = db.session.get(Conversation, str(conversation_id))
    if not conv or not _can_access(conv, me):
        return {"error": "conversation not found"}, 404
    body, status = service_unread.mark_read(me, conversation_id, conversation=conv)
    if status == 200:
        _publish(
            conversation_id,
            {
                "event": "messages_read",
                "reader_id": str(me),
                "read_at": body.get("read_at"),
                "message_ids": body.get("message_ids", []),
            },
        )
    return body, status


def send_typing(conversation_id, me, data):
    conv = db.session.get(Conversation, str(conversation_id))
    if not conv or not _can_access(conv, me):
        return {"error": "conversation not found"}, 404
    typing = bool(data.get("typing"))
    names = resolve_users([me])
    _publish(
        conversation_id,
        {
            "event": "typing",
            "user_id": str(me),
            "display_name": names.get(str(me), "Member"),
            "typing": typing,
        },
    )
    return {"ok": True}, 200


def create_conversation(me, data):
    me = str(me)
    conv_type = (data.get("type") or "").strip()

    if conv_type == DIRECT:
        other = str(data.get("user_id") or "")
        if not other or other == me:
            return {"error": "user_id is required"}, 400
        if not _can_direct_message(me, other):
            return {"error": "you can only message friends or league members"}, 403
        key = _direct_key(me, other)
        existing = Conversation.query.filter_by(type=DIRECT, direct_key=key).first()
        if existing:
            return {"conversation": existing.to_dict()}, 200
        conv = Conversation(type=DIRECT, direct_key=key)
        db.session.add(conv)
        db.session.commit()
        return {"conversation": conv.to_dict()}, 201

    if conv_type == LEAGUE:
        league_id = str(data.get("league_id") or "")
        if not league_id:
            return {"error": "league_id is required"}, 400
        if not _is_league_member(league_id, me):
            return {"error": "league not found"}, 404
        existing = Conversation.query.filter_by(type=LEAGUE, league_id=league_id).first()
        if existing:
            return {"conversation": existing.to_dict()}, 200
        conv = Conversation(type=LEAGUE, league_id=league_id)
        db.session.add(conv)
        db.session.commit()
        return {"conversation": conv.to_dict()}, 201

    return {"error": "type must be direct or league"}, 400


def list_messages(conversation_id, me):
    conv = db.session.get(Conversation, str(conversation_id))
    if not conv or not _can_access(conv, me):
        return {"error": "conversation not found"}, 404

    limit = min(int(request.args.get("limit", 50)), 200)
    before = request.args.get("before")
    q = ChatMessage.query.filter_by(conversation_id=str(conversation_id))
    if before:
        ref = db.session.get(ChatMessage, str(before))
        if ref:
            q = q.filter(ChatMessage.created_at < ref.created_at)
    rows = q.order_by(ChatMessage.created_at.desc()).limit(limit).all()
    rows.reverse()
    names = resolve_users([m.author_id for m in rows])
    return {
        "conversation_id": str(conversation_id),
        "messages": [m.to_dict(author_name=names.get(m.author_id)) for m in rows],
    }, 200


def send_message(conversation_id, me, data):
    conv = db.session.get(Conversation, str(conversation_id))
    if not conv or not _can_access(conv, me):
        return {"error": "conversation not found"}, 404

    if not service_rate.allow_send(str(me)):
        return {"error": "sending too fast, try again shortly"}, 429

    body = (data.get("body") or "").strip()
    if not body:
        return {"error": "body is required"}, 400
    max_len = current_app.config["MAX_MESSAGE_BODY"]
    if len(body) > max_len:
        return {"error": f"body must be at most {max_len} characters"}, 400

    msg = ChatMessage(
        conversation_id=str(conversation_id),
        author_id=str(me),
        body=body,
    )
    db.session.add(msg)
    db.session.commit()

    names = resolve_users([me])
    payload = msg.to_dict(author_name=names.get(str(me)))
    _publish(conversation_id, {"event": "message", "message": payload})
    return {"message": payload}, 201


def edit_message(message_id, me, data):
    msg = db.session.get(ChatMessage, str(message_id))
    if not msg or msg.deleted:
        return {"error": "message not found"}, 404
    if str(msg.author_id) != str(me):
        return {"error": "forbidden"}, 403
    conv = db.session.get(Conversation, str(msg.conversation_id))
    if not conv or not _can_access(conv, me):
        return {"error": "message not found"}, 404

    body = (data.get("body") or "").strip()
    if not body:
        return {"error": "body is required"}, 400
    max_len = current_app.config["MAX_MESSAGE_BODY"]
    if len(body) > max_len:
        return {"error": f"body must be at most {max_len} characters"}, 400

    msg.body = body
    msg.edited_at = datetime.utcnow()
    db.session.commit()

    names = resolve_users([me])
    payload = msg.to_dict(author_name=names.get(str(me)))
    _publish(msg.conversation_id, {"event": "message_updated", "message": payload})
    return {"message": payload}, 200


def delete_message(message_id, me):
    msg = db.session.get(ChatMessage, str(message_id))
    if not msg or msg.deleted:
        return {"error": "message not found"}, 404
    if str(msg.author_id) != str(me):
        return {"error": "forbidden"}, 403
    conv = db.session.get(Conversation, str(msg.conversation_id))
    if not conv or not _can_access(conv, me):
        return {"error": "message not found"}, 404

    now = datetime.utcnow()
    msg.deleted = True
    msg.deleted_at = now
    msg.body = ""
    db.session.commit()

    names = resolve_users([me])
    payload = msg.to_dict(author_name=names.get(str(me)))
    _publish(msg.conversation_id, {"event": "message_deleted", "message": payload})
    return {"message": payload}, 200


def stream_messages(conversation_id, me):
    conv = db.session.get(Conversation, str(conversation_id))
    if not conv or not _can_access(conv, me):
        return {"error": "conversation not found"}, 404

    poll_s = current_app.config["SSE_POLL_SECONDS"]
    channel = _channel(conversation_id)

    def generate():
        redis = get_redis()
        pubsub = redis.pubsub(ignore_subscribe_messages=True) if redis else None
        if pubsub:
            pubsub.subscribe(channel)
        yield f"data: {json.dumps({'event': 'connected'})}\n\n"
        last_ping = time.time()
        try:
            while True:
                if pubsub:
                    msg = pubsub.get_message(timeout=1.0)
                    if msg and msg.get("type") == "message":
                        yield f"data: {msg['data']}\n\n"
                        last_ping = time.time()
                if time.time() - last_ping >= poll_s:
                    yield f": ping\n\n"
                    last_ping = time.time()
        finally:
            if pubsub:
                pubsub.unsubscribe(channel)
                pubsub.close()

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )