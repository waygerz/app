"""Odds sources and provider budgets: ESPN's free line, The Odds API pacing, and
the RTS refresh short-circuit."""
from datetime import datetime, timedelta

from app.extensions import db
from app.models.event import FINAL, SCHEDULED, Event
from app.services import service_internal
from app.services import service_odds as odds
from app.services import service_schedule as sched

# Trimmed from ESPN's NFL board, 2026-09-20 (CIN @ HOU).
ESPN_COMP = {
    "odds": [{
        "provider": {"name": "DraftKings"},
        "details": "HOU -2.5",
        "spread": -2.5,
        "overUnder": 46.5,
        "moneyline": {"home": {"close": {"odds": "-135"}}, "away": {"close": {"odds": "+114"}}},
        "pointSpread": {
            "home": {"close": {"line": "-2.5", "odds": "-118"}, "open": {"line": "-2.5"}},
            "away": {"close": {"line": "+2.5", "odds": "-102"}},
        },
        "total": {
            "over": {"close": {"line": "o46.5", "odds": "-105"}},
            "under": {"close": {"line": "u46.5", "odds": "EVEN"}},
        },
    }],
}


def test_espn_odds_maps_to_normalized_block():
    got = sched._espn_odds(ESPN_COMP)
    assert got["source"] == "espn" and got["book"] == "draftkings"
    assert got["moneyline"] == {"home": -135, "away": 114}
    # spread.line is the home number, like The Odds API block.
    assert got["spread"] == {"line": -2.5, "home": -118, "away": -102}
    assert got["overUnder"] == {"total": 46.5, "over": -105, "under": 100}


def test_espn_odds_falls_back_to_summary_fields():
    comp = {"odds": [{"provider": {"name": "DraftKings"}, "spread": 1.5, "overUnder": 8.5}]}
    got = sched._espn_odds(comp)
    assert got["spread"]["line"] == 1.5 and got["overUnder"]["total"] == 8.5
    assert "moneyline" not in got


def test_espn_odds_absent_when_no_line():
    assert sched._espn_odds({}) is None
    assert sched._espn_odds({"odds": [{"provider": {"name": "DraftKings"}}]}) is None


def test_parsed_event_keeps_stored_odds_when_board_has_none():
    ev = {"id": "1", "competitions": [{"competitors": [
        {"homeAway": "home", "team": {"displayName": "H"}},
        {"homeAway": "away", "team": {"displayName": "A"}},
    ]}]}
    assert "odds" not in sched._parse_espn_event(ev, "football", "nfl")
    ev["competitions"][0]["odds"] = ESPN_COMP["odds"]
    assert sched._parse_espn_event(ev, "football", "nfl")["odds"]["spread"]["line"] == -2.5


def test_refresh_upcoming_fetches_only_dates_with_games(app, monkeypatch):
    now = datetime.utcnow()
    sunday = (now + timedelta(days=2)).replace(hour=17, minute=0, second=0, microsecond=0)
    for i, start in enumerate([sunday, sunday + timedelta(hours=3), now + timedelta(days=10)]):
        db.session.add(Event(external_id=f"up{i}", sport="football", league="nfl",
                             name=f"g{i}", home_team="H", away_team="A",
                             status=SCHEDULED, start_time=start))
    db.session.commit()
    seen = []
    monkeypatch.setattr(sched, "_scoreboard",
                        lambda s, l, p=None: seen.append(p["dates"]) or {"events": []})
    monkeypatch.setattr(sched, "_mark", lambda key: None)
    sched.refresh_upcoming("football", "nfl", force=True)
    # Two games the same afternoon share one board; the one 10 days out is skipped.
    assert seen == [sunday.strftime("%Y%m%d")]


def test_refresh_interval_spreads_plan_over_the_month(app, monkeypatch):
    # 20K plan, 3 credits/call, 5 leagues in season -> ~34 min per league.
    monkeypatch.setattr(odds, "_quota", lambda: (19280, 720))
    assert 1900 < odds.refresh_interval(5) < 2100
    # Fewer leagues in season -> each refreshes more often, down to the floor.
    assert odds.refresh_interval(1) == app.config["ODDS_MIN_INTERVAL"]
    # Unknown quota falls back to the conservative configured plan, capped at 6h.
    monkeypatch.setattr(odds, "_quota", lambda: (None, None))
    assert odds.refresh_interval(5) == app.config["ODDS_REFRESH_TTL"]


def test_one_bookmaker_bills_as_one_region(app):
    assert odds._credits_per_call() == 3  # h2h, spreads, totals x DraftKings


def test_refresh_event_skips_rts_when_espn_is_current(app, monkeypatch):
    now = datetime.utcnow()
    db.session.add_all([
        Event(external_id="fresh", sport="football", league="nfl", name="f",
              home_team="H", away_team="A", status=SCHEDULED, start_time=now,
              last_synced_at=now),
        Event(external_id="done", sport="football", league="nfl", name="d",
              home_team="H", away_team="A", status=FINAL, start_time=now,
              last_synced_at=now - timedelta(days=1)),
        Event(external_id="stale", sport="football", league="nfl", name="s",
              home_team="H", away_team="A", status=SCHEDULED, start_time=now,
              last_synced_at=now - timedelta(hours=1)),
    ])
    db.session.commit()
    calls = []
    monkeypatch.setattr(service_internal.sports, "fetch_event",
                        lambda s, l, eid, force=False: calls.append(eid) or None)
    monkeypatch.setattr(service_internal.sports, "quota_status", lambda: {})
    for key in ("fresh", "done", "stale"):
        body, status = service_internal.refresh_event(key)
        assert status == 200 and body["event"]["external_id"] == key
    assert calls == ["stale"]
