"""Pytest fixtures. Runs against a dedicated *_test schema so prod data is safe.

Run with:  docker compose exec -e DB_SCHEMA=contests_test contests python -m pytest -q
"""
import pytest
from sqlalchemy import text

from app import create_app
from app.extensions import db


@pytest.fixture()
def app():
    application = create_app()
    schema = application.config["DB_SCHEMA"]
    assert schema.endswith("_test"), (
        f"refusing to run tests in schema '{schema}' — set DB_SCHEMA=<svc>_test"
    )
    with application.app_context():
        db.session.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema}"'))
        db.session.commit()
        db.create_all()
        try:
            yield application
        finally:
            db.session.remove()
            db.drop_all()
            db.session.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
            db.session.commit()


@pytest.fixture()
def calls(monkeypatch):
    """Stub the cross-service clients; record account-scoped wallet ops."""
    from app.services import service_wagers as svc

    recorded = []
    monkeypatch.setattr(svc, "are_comembers", lambda lid, a, b: True)
    monkeypatch.setattr(
        svc,
        "league_context",
        lambda lid: {
            "league_id": lid,
            "league_type": "head_to_head",
            "commissioner_id": "00000000-0000-0000-0000-000000000000",
            "status": "active",
            "account": f"league:{lid}",
            "period_id": "11111111-1111-1111-1111-111111111111",
            "period_status": "open",
            "min_wager_cents": None,
            "max_wager_cents": None,
            "starting_balance_cents": 100000,
            "rules": {},
            "sport_league_ids": [],
        },
    )
    monkeypatch.setattr(
        svc,
        "get_event",
        lambda eid: {
            "name": "Away at Home",
            "league": "nba",
            "home_team": "Home",
            "away_team": "Away",
            "start_time": None,
            "status": "scheduled",
            "winner_side": None,
        },
    )
    monkeypatch.setattr(svc, "post_league_activity", lambda lid, payload: None)
    # account-scoped wallet ops: record (op, user, amount), ignoring account/ref
    monkeypatch.setattr(svc, "hold", lambda acct, u, a, r: recorded.append(("hold", u, a)))
    monkeypatch.setattr(svc, "payout", lambda acct, u, a, r: recorded.append(("payout", u, a)))
    monkeypatch.setattr(svc, "refund", lambda acct, u, a, r: recorded.append(("refund", u, a)))
    return recorded
