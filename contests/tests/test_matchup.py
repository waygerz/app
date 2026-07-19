"""_resolve_sides: how a new wager's two sides are chosen. Pure (no app/DB
fixture) — team/1v1 events use their own sides; field sports (golf, racing) use
the proposer's two competitor picks."""
import pytest

from app.services import service_wagers as svc
from app.services.service_wagers import WagerError


def test_team_event_uses_event_sides():
    ev = {"sport": "football", "home_team": "Chiefs", "away_team": "Bills"}
    assert svc._resolve_sides(ev, "away", None, None) == ("Chiefs", "Bills", "away")


def test_mma_event_uses_event_sides():
    ev = {"sport": "mma", "home_team": "Fighter A", "away_team": "Fighter B"}
    assert svc._resolve_sides(ev, "home", None, None) == ("Fighter A", "Fighter B", "home")


def test_field_event_uses_picks_and_backs_home():
    ev = {"sport": "golf", "home_team": "The Open", "away_team": "The Open"}
    # Proposer's pick becomes home; they always back it regardless of `side`.
    assert svc._resolve_sides(ev, "away", "Scheffler", "McIlroy") == (
        "Scheffler", "McIlroy", "home",
    )


def test_field_event_requires_both_picks():
    ev = {"sport": "racing", "home_team": "GP", "away_team": "GP"}
    with pytest.raises(WagerError):
        svc._resolve_sides(ev, "home", "Verstappen", "")
    with pytest.raises(WagerError):
        svc._resolve_sides(ev, "home", None, "Norris")


def test_field_event_rejects_same_competitor():
    ev = {"sport": "golf", "home_team": "The Open", "away_team": "The Open"}
    with pytest.raises(WagerError):
        svc._resolve_sides(ev, "home", "Scheffler", "  scheffler ")
