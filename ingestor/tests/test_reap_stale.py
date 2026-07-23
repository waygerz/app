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
