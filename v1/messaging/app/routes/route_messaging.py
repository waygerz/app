from flask import Blueprint

from app.controllers import controller_messaging as ctrl

messaging_bp = Blueprint("messaging", __name__)


@messaging_bp.get("/conversations")
def list_conversations():
    return ctrl.list_conversations()


@messaging_bp.get("/conversations/unread-count")
def unread_count():
    return ctrl.unread_count()


@messaging_bp.post("/conversations")
def create_conversation():
    return ctrl.create_conversation()


@messaging_bp.post("/conversations/<uuid:conversation_id>/read")
def mark_conversation_read(conversation_id):
    return ctrl.mark_conversation_read(conversation_id)


@messaging_bp.post("/conversations/<uuid:conversation_id>/typing")
def send_typing(conversation_id):
    return ctrl.send_typing(conversation_id)


@messaging_bp.get("/conversations/<uuid:conversation_id>/messages")
def list_messages(conversation_id):
    return ctrl.list_messages(conversation_id)


@messaging_bp.post("/conversations/<uuid:conversation_id>/messages")
def send_message(conversation_id):
    return ctrl.send_message(conversation_id)


@messaging_bp.get("/conversations/<uuid:conversation_id>/stream")
def stream_messages(conversation_id):
    return ctrl.stream_messages(conversation_id)


@messaging_bp.patch("/messages/<uuid:message_id>")
def edit_message(message_id):
    return ctrl.edit_message(message_id)


@messaging_bp.delete("/messages/<uuid:message_id>")
def delete_message(message_id):
    return ctrl.delete_message(message_id)