from flask import jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.services import service_messaging as service


@jwt_required(locations=["cookies", "headers"])
def list_conversations():
    body, status = service.list_conversations(get_jwt_identity())
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def unread_count():
    body, status = service.unread_count(get_jwt_identity())
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def mark_conversation_read(conversation_id):
    body, status = service.mark_conversation_read(conversation_id, get_jwt_identity())
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def send_typing(conversation_id):
    body, status = service.send_typing(
        conversation_id,
        get_jwt_identity(),
        request.get_json(silent=True) or {},
    )
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def edit_message(message_id):
    body, status = service.edit_message(
        message_id,
        get_jwt_identity(),
        request.get_json(silent=True) or {},
    )
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def delete_message(message_id):
    body, status = service.delete_message(message_id, get_jwt_identity())
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def create_conversation():
    body, status = service.create_conversation(
        get_jwt_identity(), request.get_json(silent=True) or {}
    )
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def list_messages(conversation_id):
    body, status = service.list_messages(conversation_id, get_jwt_identity())
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def send_message(conversation_id):
    body, status = service.send_message(
        conversation_id, get_jwt_identity(), request.get_json(silent=True) or {}
    )
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers", "query_string"])
def stream_messages(conversation_id):
    result = service.stream_messages(conversation_id, get_jwt_identity())
    if isinstance(result, tuple):
        body, status = result
        return jsonify(body), status
    return result