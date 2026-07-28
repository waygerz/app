from flask import Blueprint

from app.controllers import controller_comments as ctrl

comments_bp = Blueprint("comments", __name__)


@comments_bp.get("/posts/<uuid:post_id>/comments")
def list_comments(post_id):
    return ctrl.list_comments(post_id)


@comments_bp.post("/posts/<uuid:post_id>/comments")
def create_comment(post_id):
    return ctrl.create_comment(post_id)


@comments_bp.delete("/comments/<uuid:comment_id>")
def delete_comment(comment_id):
    return ctrl.delete_comment(comment_id)


@comments_bp.post("/posts/<uuid:post_id>/like")
def toggle_post_like(post_id):
    return ctrl.toggle_post_like(post_id)


@comments_bp.post("/posts/engagement")
def posts_engagement():
    return ctrl.posts_engagement()