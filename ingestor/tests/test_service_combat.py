"""service_combat: MMA fights -> Event upsert fields. Pure mapping tests (no DB),
mirroring the 1v1 fixtures in test_service_espn."""
from app.services import service_combat as combat
from app.services import service_espn as espn
from app.models.event import FINAL, LIVE, SCHEDULED

# A card with a scheduled fight and a finished fight (fighter A wins the second).
MMA_EVENT = {
    "id": "329", "name": "UFC 329", "date": "2026-08-01T02:00Z",
    "status": {"type": {"name": "STATUS_SCHEDULED"}},
    "competitions": [
        {"id": "f1", "type": {"abbreviation": "Flyweight"},
         "status": {"type": {"name": "STATUS_SCHEDULED"}},
         "competitors": [{"id": "x", "athlete": {"displayName": "Fighter A"}},
                         {"id": "y", "athlete": {"displayName": "Fighter B"}}]},
        {"id": "f2", "type": {"abbreviation": "Lightweight"},
         "status": {"type": {"name": "STATUS_FINAL"}},
         "competitors": [{"id": "p", "athlete": {"displayName": "Champ"}, "winner": True},
                         {"id": "q", "athlete": {"displayName": "Loser"}}]},
    ],
}


def _fields():
    board = espn._1v1_build("mma", "ufc", MMA_EVENT)
    card = board["summary"]
    return [combat._fight_fields(card, f) for f in board["fights"]]


def test_scheduled_fight_maps_to_home_away_event():
    scheduled, _ = _fields()
    assert scheduled["external_id"] == "f1"
    assert scheduled["sport"] == "mma" and scheduled["league"] == "ufc"
    assert scheduled["home_team"] == "Fighter A"
    assert scheduled["away_team"] == "Fighter B"
    assert scheduled["name"] == "Fighter A vs Fighter B"
    assert scheduled["short_name"] == "Flyweight"     # weight class
    assert scheduled["status"] == SCHEDULED
    assert scheduled["winner_side"] is None            # not final -> no winner
    assert scheduled["start_time"] is not None         # inherits the card date


def test_final_fight_sets_winner_side_from_winner_id():
    _, final = _fields()
    assert final["external_id"] == "f2"
    assert final["status"] == FINAL
    assert final["winner_side"] == "home"              # Champ is competitor A


def test_status_in_progress_maps_to_live():
    assert combat._event_status(espn.IN_PROGRESS) == LIVE
    assert combat._event_status(espn.FINAL) == FINAL   # others pass through


def test_missing_fighter_is_skipped():
    card = {"sport": "mma", "league": "ufc", "start_date": None}
    assert combat._fight_fields(card, {"id": "f9", "a": {}, "b": {"name": "Solo"}}) is None
