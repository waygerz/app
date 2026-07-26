"""The stale-event reaper: past games stuck in scheduled/live get marked final.

refresh_scores only re-fetches today's board and ESPN drops old games from the
scoreboard, so a missed score fetch would otherwise leave an event 'scheduled'
forever — showing in the bettable list with a stale date. This is the safety net.
"""
from datetime import datetime, timedelta

from app.extensions import db
from app.models.event import CANCELLED, FINAL, LIVE, SCHEDULED, Event
from app.services import service_schedule as sched


def _ev(ext, status, start_dt):
    return Event(
        external_id=ext, sport="baseball", league="mlb",
        name=f"Game {ext}", home_team="H", away_team="A",
        status=status, start_time=start_dt,
    )


def _seed(*evs):
    for e in evs:
        db.session.add(e)
    db.session.commit()


def test_reaps_past_scheduled_and_live(app):
    long_ago = datetime.utcnow() - timedelta(days=2)
    _seed(
        _ev("old-sched", SCHEDULED, long_ago),
        _ev("old-live", LIVE, long_ago),
    )
    n = sched.reap_stale_events()
    assert n == 2
    for ext in ("old-sched", "old-live"):
        e = Event.query.filter_by(external_id=ext).one()
        assert e.status == FINAL


def test_leaves_future_and_recent_events_alone(app):
    future = datetime.utcnow() + timedelta(days=1)
    just_started = datetime.utcnow() - timedelta(hours=2)  # inside the 12h grace
    _seed(
        _ev("future", SCHEDULED, future),
        _ev("in-play", LIVE, just_started),
    )
    n = sched.reap_stale_events()
    assert n == 0
    assert Event.query.filter_by(external_id="future").one().status == SCHEDULED
    assert Event.query.filter_by(external_id="in-play").one().status == LIVE


def test_does_not_touch_terminal_statuses(app):
    long_ago = datetime.utcnow() - timedelta(days=5)
    _seed(
        _ev("done", FINAL, long_ago),
        _ev("called-off", CANCELLED, long_ago),
    )
    n = sched.reap_stale_events()
    assert n == 0
    assert Event.query.filter_by(external_id="called-off").one().status == CANCELLED


def test_null_start_time_is_never_reaped(app):
    # An unknown start can't be proven past — leave it (mirrors the rest of the
    # codebase's "unknown time doesn't act" stance).
    _seed(_ev("no-time", SCHEDULED, None))
    n = sched.reap_stale_events()
    assert n == 0
    assert Event.query.filter_by(external_id="no-time").one().status == SCHEDULED


# ---- live-window gating (drives the score refresh cadence) -----------------

def _ev_for(league, status, start_dt, ext):
    return Event(
        external_id=ext, sport="baseball", league=league,
        name=f"Game {ext}", home_team="H", away_team="A",
        status=status, start_time=start_dt,
    )


def test_live_window_true_for_in_progress_game(app):
    _seed(_ev_for("mlb", LIVE, datetime.utcnow() - timedelta(hours=1), "live-1"))
    assert sched.has_live_window("baseball", "mlb") is True


def test_live_window_true_for_game_about_to_start(app):
    _seed(_ev_for("mlb", SCHEDULED, datetime.utcnow() + timedelta(minutes=5), "soon"))
    assert sched.has_live_window("baseball", "mlb") is True


def test_live_window_true_when_start_just_passed(app):
    # ESPN can lag flipping SCHEDULED -> LIVE; keep polling fast.
    _seed(_ev_for("mlb", SCHEDULED, datetime.utcnow() - timedelta(minutes=20), "just-started"))
    assert sched.has_live_window("baseball", "mlb") is True


def test_live_window_false_when_next_game_is_hours_away(app):
    _seed(_ev_for("mlb", SCHEDULED, datetime.utcnow() + timedelta(hours=5), "later"))
    assert sched.has_live_window("baseball", "mlb") is False


def test_live_window_false_when_everything_is_final(app):
    _seed(_ev_for("mlb", FINAL, datetime.utcnow() - timedelta(hours=1), "done-1"))
    assert sched.has_live_window("baseball", "mlb") is False


def test_live_window_is_per_league(app):
    _seed(_ev_for("mlb", LIVE, datetime.utcnow(), "mlb-live"))
    assert sched.has_live_window("baseball", "mlb") is True
    assert sched.has_live_window("baseball", "nope") is False


def test_live_window_survives_a_long_running_game(app):
    # Rain delay: LIVE counts no matter how long ago it started.
    _seed(_ev_for("mlb", LIVE, datetime.utcnow() - timedelta(hours=9), "marathon"))
    assert sched.has_live_window("baseball", "mlb") is True


# ---- score refresh queries yesterday+today ---------------------------------

def test_refresh_scores_queries_yesterday_and_today(app, monkeypatch):
    """ESPN buckets a game under its LOCAL date, so a 7pm ET game lands on the
    next UTC day. Querying only today's UTC date dropped last night's games
    before their final score arrived."""
    seen = {}

    def fake_scoreboard(sport, league, params=None):
        seen['params'] = params
        return {"events": []}

    monkeypatch.setattr(sched, "_scoreboard", fake_scoreboard)
    monkeypatch.setattr(sched, "_mark", lambda key: None)  # no Redis in tests
    sched.refresh_scores("baseball", "mlb", force=True)

    dates = seen['params']['dates']
    today = datetime.utcnow().strftime("%Y%m%d")
    yesterday = (datetime.utcnow() - timedelta(days=1)).strftime("%Y%m%d")
    assert dates == f"{yesterday}-{today}"
