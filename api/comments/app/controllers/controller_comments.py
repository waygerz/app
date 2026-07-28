from flask import jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.services import service_comments as service


@jwt_required(locations=["cookies", "headers"])
def list_comments(post_id):
    body, status = service.list_comments(post_id, get_jwt_identity())
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def create_comment(post_id):
    body, status = service.create_comment(
        post_id, get_jwt_identity(), request.get_json(silent=True) or {}
    )
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def delete_comment(comment_id):
    body, status = service.delete_comment(comment_id, get_jwt_identity())
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def toggle_post_like(post_id):
    body, status = service.toggle_post_like(post_id, get_jwt_identity())
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def posts_engagement():
    body, status = service.posts_engagement(
        get_jwt_identity(), request.get_json(silent=True) or {}
    )
    return jsonify(body), status