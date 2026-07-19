"""service_field: golf/racing tournament -> matchup-container Event. Pure mapping
tests (no DB), reusing the FIELD fixtures from test_service_espn."""
from app.services import service_field as field
from app.services import service_espn as espn
from app.models.event import FINAL, LIVE, SCHEDULED

# A finished PGA event (fixture shape mirrors test_service_espn.GOLF_EVENT).
GOLF_EVENT = {
    "id": "401", "name": "The Open Championship", "shortName": "The Open",
    "date": "2026-07-16T06:00Z", "status": {"type": {"name": "STATUS_SCHEDULED"}},
    "competitions": [{"competitors": [
        {"id": "a", "athlete": {"displayName": "Scottie Scheffler"}, "order": 1},
        {"id": "b", "athlete": {"displayName": "Rory McIlroy"}, "order": 2},
    ]}],
}


def test_tournament_maps_to_container_event():
    summary = espn._field_build("golf", "pga", GOLF_EVENT)["summary"]
    fields = field._tournament_fields(summary)
    assert fields["external_id"] == "401"
    assert fields["sport"] == "golf" and fields["league"] == "pga"
    assert fields["name"] == "The Open Championship"
    assert fields["status"] == SCHEDULED
    assert fields["start_time"] is not None
    # A tournament has no two fixed sides — the label placeholds the NOT NULL
    # home/away columns (the bet overwrites them with the two chosen players).
    assert fields["home_team"] == fields["away_team"] == "The Open Championship"


def test_status_in_progress_maps_to_live():
    assert field._event_status(espn.IN_PROGRESS) == LIVE
    assert field._event_status(espn.FINAL) == FINAL


def test_missing_name_is_skipped():
    assert field._tournament_fields({"external_id": "x", "sport": "golf", "league": "pga"}) is None
    assert field._tournament_fields({"name": "No id", "sport": "golf", "league": "pga"}) is None
