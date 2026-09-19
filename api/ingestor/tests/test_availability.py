"""A switched-off sport (empty *_TOURS allowlist) is hidden from what the web and
app show — lists, schedules, the catalog — while its stored events stay
readable one at a time so bets on them still settle."""
from datetime import datetime, timedelta

from app.extensions import db
from app.models.event import SCHEDULED, Event
from app.models.sport_league import SportLeague
from app.services import service_availability as availability
from app.utils.config import Config

PREFIX = Config.api_prefix()


def _seed(app):
    soon = datetime.utcnow() + timedelta(days=2)
    golf = SportLeague(id="11111111-1111-1111-1111-111111111111", sport="golf", league="pga", name="PGA Tour")
    nfl = SportLeague(id="22222222-2222-2222-2222-222222222222", sport="football", league="nfl", name="NFL")
    db.session.add_all([golf, nfl])
    db.session.add_all([
        Event(external_id="G1", sport="golf", league="pga", sport_league_id=golf.id, name="Presidents Cup",
              home_team="Presidents Cup", away_team="Presidents Cup", status=SCHEDULED, start_time=soon),
        Event(external_id="F1", sport="football", league="nfl", sport_league_id=nfl.id, name="Jets at Bills",
              home_team="Bills", away_team="Jets", status=SCHEDULED, start_time=soon),
    ])
    db.session.commit()


def test_golf_is_off_by_default(app):
    app.config["GOLF_TOURS"] = []
    assert "golf" in availability.disabled_sports()
    assert availability.is_enabled("football")


def test_switched_off_sport_is_hidden_from_lists_but_readable(app):
    app.config["GOLF_TOURS"] = []
    _seed(app)
    client = app.test_client()

    listed = client.get(f"{PREFIX}/events?limit=50").get_json()["events"]
    assert [e["external_id"] for e in listed] == ["F1"]

    by_league = client.get(f"{PREFIX}/events?sport_league_id=11111111-1111-1111-1111-111111111111").get_json()["events"]
    assert by_league == []

    # One-at-a-time reads still work (existing bets settle), flagged unavailable.
    one = client.get(f"{PREFIX}/events/G1").get_json()["event"]
    assert one["available"] is False
    assert client.get(f"{PREFIX}/events/F1").get_json()["event"]["available"] is True

    assert availability.disabled_sport_league_ids() == ["11111111-1111-1111-1111-111111111111"]


def test_switching_a_sport_back_on_shows_it_again(app):
    app.config["GOLF_TOURS"] = ["pga"]
    _seed(app)
    listed = app.test_client().get(f"{PREFIX}/events?limit=50").get_json()["events"]
    assert {e["external_id"] for e in listed} == {"G1", "F1"}
