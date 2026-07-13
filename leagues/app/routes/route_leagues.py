from flask import Blueprint

from app.controllers import controller_leagues as ctrl

leagues_bp = Blueprint("leagues", __name__)


@leagues_bp.post("/")
def create_league():
    return ctrl.create_league()


@leagues_bp.get("/")
def my_leagues():
    return ctrl.my_leagues()


@leagues_bp.get("/preview")
def preview():
    return ctrl.preview()


@leagues_bp.get("/<uuid:league_id>")
def get_league(league_id):
    return ctrl.get_league(league_id)


@leagues_bp.patch("/<uuid:league_id>")
def edit_league(league_id):
    return ctrl.edit_league(league_id)


@leagues_bp.post("/<uuid:league_id>/activate")
def activate_league(league_id):
    return ctrl.activate_league(league_id)


@leagues_bp.put("/<uuid:league_id>/periods/<uuid:period_id>/picks")
def submit_picks(league_id, period_id):
    return ctrl.submit_picks(league_id, period_id)


@leagues_bp.get("/<uuid:league_id>/periods/<uuid:period_id>/picks")
def get_picks(league_id, period_id):
    return ctrl.get_picks(league_id, period_id)


@leagues_bp.get("/<uuid:league_id>/standings")
def standings(league_id):
    return ctrl.standings(league_id)


@leagues_bp.get("/<uuid:league_id>/periods")
def list_periods(league_id):
    return ctrl.list_periods(league_id)


@leagues_bp.get("/<uuid:league_id>/periods/<uuid:period_id>/results")
def period_results(league_id, period_id):
    return ctrl.period_results(league_id, period_id)


@leagues_bp.get("/<uuid:league_id>/feed")
def get_feed(league_id):
    return ctrl.get_feed(league_id)


@leagues_bp.post("/<uuid:league_id>/feed")
def post_feed(league_id):
    return ctrl.post_feed(league_id)


@leagues_bp.post("/join")
def join_by_code():
    return ctrl.join_by_code()


@leagues_bp.post("/<uuid:league_id>/join")
def accept_invite(league_id):
    return ctrl.accept_invite(league_id)


@leagues_bp.post("/<uuid:league_id>/invites")
def invite_friends(league_id):
    return ctrl.invite_friends(league_id)


@leagues_bp.get("/invites")
def my_invites():
    return ctrl.my_invites()


@leagues_bp.post("/<uuid:league_id>/leave")
def leave_league(league_id):
    return ctrl.leave_league(league_id)


@leagues_bp.delete("/<uuid:league_id>/members/<uuid:uid>")
def remove_member(league_id, uid):
    return ctrl.remove_member(league_id, uid)


@leagues_bp.post("/<uuid:league_id>/archive")
def archive_league(league_id):
    return ctrl.archive_league(league_id)


@leagues_bp.post("/<uuid:league_id>/advance-period")
def advance_period(league_id):
    return ctrl.advance_period(league_id)