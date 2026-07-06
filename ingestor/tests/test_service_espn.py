"""Unit tests for the shared ESPN ingester's pure transforms (no app/Redis needed).
Fixtures mirror real ESPN structures and encode the two bugs we fixed as regressions:
  * racing scored the wrong competition (FP1 instead of the Race)
  * cricket status was mislabeled (status lives in type.detail, not type.name)
"""
from app.services import service_espn as espn


# ------------------------------------------------------------- map_status
def test_status_final_from_type_name():
    assert espn.map_status({"type": {"name": "STATUS_FINAL"}}) == espn.FINAL


def test_status_scheduled():
    assert espn.map_status({"type": {"name": "STATUS_SCHEDULED"}}) == espn.SCHEDULED


def test_status_cricket_detail_only():  # regression: cricket omits type.name
    assert espn.map_status({"type": {"name": None, "detail": "Final"}}) == espn.FINAL


def test_status_completed_flag():
    assert espn.map_status({"completed": True}) == espn.FINAL


def test_status_state_in_progress():
    assert espn.map_status({"state": "in"}) == espn.IN_PROGRESS


def test_status_none_defaults_scheduled():
    assert espn.map_status(None) == espn.SCHEDULED


# ------------------------------------------------------------- FIELD (golf, racing)
F1_EVENT = {
    "id": "1", "name": "British GP", "status": {"type": {"name": "STATUS_FINAL"}},
    "competitions": [
        {"type": {"abbreviation": "FP1"}, "competitors": [
            {"id": "1", "athlete": {"displayName": "Practice Guy"}, "order": 1}]},
        {"type": {"abbreviation": "Qual"}, "competitors": [
            {"id": "2", "athlete": {"displayName": "Pole Guy"}, "order": 1}]},
        {"type": {"abbreviation": "Race"}, "competitors": [
            {"id": "9", "athlete": {"displayName": "Charles Leclerc"}, "order": 1, "winner": True},
            {"id": "8", "athlete": {"displayName": "Second"}, "order": 2}]},
    ],
}


def test_scoring_competition_picks_race():
    assert (espn._scoring_competition(F1_EVENT).get("type") or {}).get("abbreviation") == "Race"


def test_field_build_racing_uses_race_not_practice():  # regression
    b = espn._field_build("racing", "f1", F1_EVENT)
    assert b["summary"]["winner_id"] == "9"            # Leclerc (Race), not the FP1 guy
    assert b["field"][0]["name"] == "Charles Leclerc"
    assert b["summary"]["field_size"] == 2


GOLF_EVENT = {
    "id": "100", "name": "Open", "date": "2026-07-02T04:00Z",
    "status": {"type": {"name": "STATUS_FINAL"}},
    "competitions": [{"competitors": [
        {"id": "a", "athlete": {"displayName": "Winner"}, "order": 1, "score": "-20"},
        {"id": "b", "athlete": {"displayName": "Runner"}, "order": 2, "score": "-19"},
    ]}],
}


def test_field_build_golf_orders_and_winner():
    b = espn._field_build("golf", "pga", GOLF_EVENT)
    assert b["summary"]["winner_id"] == "a"
    assert [p["order"] for p in b["field"]] == [1, 2]
    assert b["summary"]["status"] == espn.FINAL


# ------------------------------------------------------------- ONE-V-ONE (mma)
MMA_EVENT = {
    "id": "329", "name": "UFC 329", "status": {"type": {"name": "STATUS_SCHEDULED"}},
    "competitions": [
        {"id": "f1", "type": {"abbreviation": "Flyweight"}, "status": {"type": {"name": "STATUS_SCHEDULED"}},
         "competitors": [{"id": "x", "athlete": {"displayName": "Fighter A"}},
                         {"id": "y", "athlete": {"displayName": "Fighter B"}}]},
        {"id": "f2", "type": {"abbreviation": "Lightweight"}, "status": {"type": {"name": "STATUS_FINAL"}},
         "competitors": [{"id": "p", "athlete": {"displayName": "Champ"}, "winner": True},
                         {"id": "q", "athlete": {"displayName": "Loser"}}]},
    ],
}


def test_1v1_build_expands_card_into_fights():
    b = espn._1v1_build("mma", "ufc", MMA_EVENT)
    assert b["summary"]["fight_count"] == 2
    assert b["fights"][0]["a"]["name"] == "Fighter A"
    assert b["fights"][0]["b"]["name"] == "Fighter B"
    assert b["fights"][0]["weight_class"] == "Flyweight"   # regression: from type.abbreviation
    assert b["fights"][1]["winner_id"] == "p"


# ------------------------------------------------------------- TEAM (cricket)
CRICKET_EVENT = {
    "id": "m1", "shortName": "IND v AUS",
    "status": {"type": {"name": None, "detail": "Final"}},   # cricket: no type.name
    "competitions": [{"competitors": [
        {"id": "ind", "homeAway": "home", "team": {"displayName": "India"}, "score": "240"},
        {"id": "aus", "homeAway": "away", "team": {"displayName": "Australia"}, "score": "241/4", "winner": True},
    ]}],
}


def test_team_build_cricket_home_away_and_final():
    b = espn._team_build("cricket", "8039", CRICKET_EVENT)
    assert b["summary"]["home"]["name"] == "India"
    assert b["summary"]["away"]["name"] == "Australia"
    assert b["summary"]["winner_id"] == "aus"
    assert b["summary"]["status"] == espn.FINAL   # regression: winner => final despite no type.name


# ------------------------------------------------------------- resolve_leagues (allowlist)
def test_resolve_leagues_none_returns_all():
    assert espn.resolve_leagues(None, ["pga", "eur"]) == ["pga", "eur"]


def test_resolve_leagues_valid():
    assert espn.resolve_leagues("pga", ["pga", "eur"]) == ["pga"]


def test_resolve_leagues_rejects_unknown():  # no arbitrary ESPN fetches
    assert espn.resolve_leagues("../evil", ["pga", "eur"]) == []


# ------------------------------------------------------------- parse_competitor
def test_parse_competitor_athlete_and_team():
    a = espn.parse_competitor({"id": "1", "athlete": {"displayName": "Player"}, "order": 3, "score": "-5"})
    assert a["id"] == "1" and a["name"] == "Player" and a["order"] == 3 and a["score"] == "-5"
    t = espn.parse_competitor({"id": "2", "team": {"displayName": "India"}, "winner": True})
    assert t["name"] == "India" and t["winner"] is True
