"""The stale-event reaper: past games stuck in scheduled/live get marked cancelled.

refresh_scores only re-fetches today's board and ESPN drops old games from the
scoreboard, so a missed score fetch would otherwise leave an event 'scheduled'
forever — showing in the bettable list with a stale date. This is the safety net.
It marks them 'cancelled', not 'final', because we never observed a result — a
fabricated 'final' would grade Pick'em picks a loss and mis-settle H2H totals.
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
        # No score was ever recorded → genuinely no result → cancelled.
        assert e.status == CANCELLED


def test_reaps_stuck_game_with_score_to_final(app):
    # A game we captured a score for but ESPN never flipped to final should be
    # finalized with the winner derived from the score — never voided.
    long_ago = datetime.utcnow() - timedelta(days=1)
    e = Event(
        external_id="stuck-live", sport="football", league="nfl",
        name="Away @ Home", home_team="Home", away_team="Away",
        status=LIVE, start_time=long_ago, home_score=20, away_score=17,
    )
    _seed(e)
    n = sched.reap_stale_events()
    assert n == 1
    got = Event.query.filter_by(external_id="stuck-live").one()
    assert got.status == FINAL
    assert got.winner_side == "home"  # 20 > 17


def test_finalize_stale_live_refetches_only_overdue(app, monkeypatch):
    # A game still 'live' longer than it could possibly run is re-fetched by id;
    # a recent one is left alone (it might genuinely still be in progress).
    from app.services import service_schedule as s
    now = datetime.utcnow()
    _seed(
        _ev("overdue", LIVE, now - timedelta(hours=7)),  # baseball maxdur 6h → refetch
        _ev("recent", LIVE, now - timedelta(hours=1)),   # → skip
    )
    seen = []
    monkeypatch.setattr(s.sports, "fetch_event", lambda sp, lg, eid, force=False: {"id": eid})
    monkeypatch.setattr(s, "parse_event", lambda raw, sp, lg: {"external_id": raw["id"], "status": FINAL})
    monkeypatch.setattr(s, "upsert_event", lambda fields: seen.append(fields["external_id"]))
    n = s.finalize_stale_live()
    assert n == 1
    assert seen == ["overdue"]


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
