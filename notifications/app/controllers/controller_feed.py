from flask import jsonify, request
from flask_jwt_extended import get_jwt_identity

from app.services import service_feed as svc


def list_feed():
    limit = request.args.get("limit", 50)
    unread_only = request.args.get("unread", "").lower() in ("1", "true", "yes")
    body, status = svc.list_feed(get_jwt_identity(), limit=limit, unread_only=unread_only)
    return jsonify(body), status


def unread_count():
    body, status = svc.unread_count(get_jwt_identity())
    return jsonify(body), status


def mark_read():
    data = request.get_json(silent=True) or {}
    body, status = svc.mark_read(get_jwt_identity(), ids=data.get("ids"))
    return jsonify(body), status
