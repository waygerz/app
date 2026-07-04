from flask import jsonify

from app.services import service_internal as service


def share_membership():
    body, status = service.share_membership()
    return jsonify(body), status


def user_league_ids():
    body, status = service.user_league_ids()
    return jsonify(body), status


def member_access():
    body, status = service.member_access()
    return jsonify(body), status


def tick():
    body, status = service.tick()
    return jsonify(body), status


def are_comembers():
    body, status = service.are_comembers()
    return jsonify(body), status


def league_context():
    body, status = service.league_context()
    return jsonify(body), status


def feed_posts_access():
    body, status = service.feed_posts_access()
    return jsonify(body), status


def feed_post_access():
    body, status = service.feed_post_access()
    return jsonify(body), status


def add_activity(league_id):
    body, status = service.add_activity(league_id)
    return jsonify(body), status