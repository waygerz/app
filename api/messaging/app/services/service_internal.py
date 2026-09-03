"""Internal messaging operations (service-to-service)."""
from app.extensions import db
from app.models.chat_message import ChatMessage
from app.models.conversation_read import ConversationRead


def purge_user(data: dict) -> tuple[dict, int]:
    """Account deletion in the messaging service.

    The per-user read cursor (`conversation_reads`) is personal — hard-deleted.
    Chat messages are shared thread history the OTHER participant still sees, so
    they're KEPT (author name resolves live to the "Deleted user" tombstone), and
    direct conversations are left intact so the counterparty keeps the thread.
    Idempotent.
    """
    try:
        uid = str(data["user_id"])
    except (KeyError, ValueError, TypeError):
        return {"error": "user_id is required"}, 400
    reads = ConversationRead.query.filter(ConversationRead.user_id == uid).delete(
        synchronize_session=False
    )
    kept = ChatMessage.query.filter(ChatMessage.author_id == uid).count()
    db.session.commit()
    return {"purged": {"conversation_reads": reads}, "kept": {"chat_messages": kept}}, 200
