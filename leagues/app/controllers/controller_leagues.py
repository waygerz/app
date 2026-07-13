from flask import jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required, verify_jwt_in_request

from app.services import service_leagues as service


@jwt_required(locations=["cookies", "headers"])
def create_league():
    body, status = service.create_league(get_jwt_identity(), request.get_json(silent=True) or {})
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def my_leagues():
    body, status = service.my_leagues(get_jwt_identity())
    return jsonify(body), status


def preview():
    me = None
    verify_jwt_in_request(optional=True, locations=["cookies", "headers"])
    try:
        me = get_jwt_identity()
    except Exception:  # noqa: BLE001
        me = None
    body, status = service.preview(me)
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def get_league(league_id):
    body, status = service.get_league(league_id, get_jwt_identity())
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def edit_league(league_id):
    body, status = service.edit_league(league_id, get_jwt_identity(), request.get_json(silent=True) or {})
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def activate_league(league_id):
    body, status = service.activate_league(league_id, get_jwt_identity())
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def submit_picks(league_id, period_id):
    body, status = service.submit_picks(league_id, period_id, get_jwt_identity(), request.get_json(silent=True) or {})
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def get_picks(league_id, period_id):
    body, status = service.get_picks(league_id, period_id, get_jwt_identity())
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def standings(league_id):
    body, status = service.standings(league_id, get_jwt_identity())
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def list_periods(league_id):
    body, status = service.list_periods(league_id, get_jwt_identity())
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def regenerate_periods(league_id):
    body, status = service.regenerate_periods(league_id, get_jwt_identity())
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def period_results(league_id, period_id):
    body, status = service.period_results(league_id, period_id, get_jwt_identity())
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def member_picks(league_id, period_id, user_id):
    body, status = service.member_picks(league_id, period_id, user_id, get_jwt_identity())
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def confirm_member(league_id, period_id, user_id):
    body, status = service.confirm_member(
        league_id, period_id, user_id, get_jwt_identity(), request.get_json(silent=True) or {}
    )
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def get_feed(league_id):
    body, status = service.get_feed(league_id, get_jwt_identity())
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def post_feed(league_id):
    body, status = service.post_feed(league_id, get_jwt_identity(), request.get_json(silent=True) or {})
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def join_by_code():
    body, status = service.join_by_code(get_jwt_identity(), request.get_json(silent=True) or {})
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def accept_invite(league_id):
    body, status = service.accept_invite(league_id, get_jwt_identity())
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def invite_friends(league_id):
    body, status = service.invite_friends(league_id, get_jwt_identity(), request.get_json(silent=True) or {})
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def my_invites():
    body, status = service.my_invites(get_jwt_identity())
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def leave_league(league_id):
    body, status = service.leave_league(league_id, get_jwt_identity())
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def remove_member(league_id, uid):
    body, status = service.remove_member(league_id, uid, get_jwt_identity())
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def archive_league(league_id):
    body, status = service.archive_league(league_id, get_jwt_identity())
    return jsonify(body), status


@jwt_required(locations=["cookies", "headers"])
def advance_period(league_id):
    body, status = service.advance_period(league_id, get_jwt_identity())
    return jsonify(body), status