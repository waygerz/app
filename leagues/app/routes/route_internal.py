from flask import Blueprint

from app.controllers import controller_internal as ctrl
from app.utils.guards import internal_only

leagues_internal_bp = Blueprint("internal", __name__)


@leagues_internal_bp.post("/share-membership")
@internal_only
def share_membership():
    return ctrl.share_membership()


@leagues_internal_bp.post("/user-league-ids")
@internal_only
def user_league_ids():
    return ctrl.user_league_ids()


@leagues_internal_bp.post("/member-access")
@internal_only
def member_access():
    return ctrl.member_access()


@leagues_internal_bp.post("/tick")
@internal_only
def tick():
    return ctrl.tick()


@leagues_internal_bp.post("/are-comembers")
@internal_only
def are_comembers():
    return ctrl.are_comembers()


@leagues_internal_bp.post("/league-context")
@internal_only
def league_context():
    return ctrl.league_context()


@leagues_internal_bp.post("/feed-post-access")
@internal_only
def feed_post_access():
    return ctrl.feed_post_access()


@leagues_internal_bp.post("/feed-posts-access")
@internal_only
def feed_posts_access():
    return ctrl.feed_posts_access()


@leagues_internal_bp.post("/leagues/<uuid:league_id>/feed")
@internal_only
def add_activity(league_id):
    return ctrl.add_activity(league_id)