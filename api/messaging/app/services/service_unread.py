"""Unread state and read cursors for messaging threads."""
from datetime import datetime

from app.extensions import db
from app.models.chat_message import ChatMessage
from app.models.conversation import DIRECT
from app.models.conversation_read import ConversationRead


def unread_counts_for_user(user_id, conversation_ids) -> dict[str, int]:
    user_id = str(user_id)
    ids = [str(c) for c in conversation_ids if c]
    if not ids:
        return {}

    reads = {
        str(row.conversation_id): row.last_read_at
        for row in ConversationRead.query.filter(
            ConversationRead.user_id == user_id,
            ConversationRead.conversation_id.in_(ids),
        ).all()
    }

    counts = {cid: 0 for cid in ids}
    for cid in ids:
        q = ChatMessage.query.filter(
            ChatMessage.conversation_id == cid,
            ChatMessage.author_id != user_id,
        )
        last_read = reads.get(cid)
        if last_read is not None:
            q = q.filter(ChatMessage.created_at > last_read)
        counts[cid] = q.count()
    return counts


def mark_read(user_id, conversation_id, *, conversation=None):
    user_id = str(user_id)
    conversation_id = str(conversation_id)
    now = datetime.utcnow()
    row = ConversationRead.query.filter_by(
        user_id=user_id,
        conversation_id=conversation_id,
    ).first()
    if row:
        row.last_read_at = now
    else:
        db.session.add(
            ConversationRead(
                user_id=user_id,
                conversation_id=conversation_id,
                last_read_at=now,
            )
        )

    stamped_ids = []
    if conversation is not None and conversation.type == DIRECT:
        pending = ChatMessage.query.filter(
            ChatMessage.conversation_id == conversation_id,
            ChatMessage.author_id != user_id,
            ChatMessage.read_at.is_(None),
            ChatMessage.created_at <= now,
        ).all()
        for msg in pending:
            msg.read_at = now
            stamped_ids.append(str(msg.id))

    db.session.commit()
    return {
        "ok": True,
        "read_at": now.isoformat() + "Z",
        "message_ids": stamped_ids,
    }, 200


def unread_summary(user_id, conversation_ids) -> tuple[dict, int]:
    counts = unread_counts_for_user(user_id, conversation_ids)
    return counts, sum(counts.values())