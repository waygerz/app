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


# Backward-compat alias: old webui toggles a 'like'. Kept so an un-rolled webui
# still works mid-deploy; new webui uses PUT/DELETE /reaction below.
@comments_bp.post("/posts/<uuid:post_id>/like")
def toggle_post_like(post_id):
    return ctrl.toggle_post_like(post_id)


@comments_bp.put("/posts/<uuid:post_id>/reaction")
def set_reaction(post_id):
    return ctrl.set_reaction(post_id)


@comments_bp.delete("/posts/<uuid:post_id>/reaction")
def remove_reaction(post_id):
    return ctrl.remove_reaction(post_id)


@comments_bp.get("/posts/<uuid:post_id>/reactions")
def list_reactions(post_id):
    return ctrl.list_reactions(post_id)


@comments_bp.post("/posts/engagement")
def posts_engagement():
    return ctrl.posts_engagement()