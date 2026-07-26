"""Pytest fixtures. Runs against a dedicated *_test schema so prod data is safe.

Run with:  docker compose exec -e DB_SCHEMA=leagues_test leagues python -m pytest -q
"""
import pytest

API_PREFIX = "/v1/gameplay/leagues"
from flask_jwt_extended import create_access_token
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
def client(app):
    return app.test_client()


@pytest.fixture()
def auth_headers(app):
    def _for(user_id):
        with app.app_context():
            token = create_access_token(identity=user_id)
        return {"Authorization": f"Bearer {token}"}

    return _for


@pytest.fixture(autouse=True)
def mock_clients(monkeypatch):
    """Stub cross-service calls (auth/wallet) so leagues tests run in isolation."""
    from app.services import service_leagues as svc

    monkeypatch.setattr(svc, "resolve_users",
                        lambda ids: {str(i): f"User {str(i)[:4]}" for i in ids})
    monkeypatch.setattr(svc, "resolve_users_full",
                        lambda ids: {str(i): {"display_name": f"User {str(i)[:4]}", "avatar_key": None}
                                     for i in ids})
    monkeypatch.setattr(svc, "warm_event_cache", lambda *a, **k: None)
    monkeypatch.setattr(svc, "ingestor_warm_cache", lambda *a, **k: {"ok": True})
    monkeypatch.setattr(svc, "wallet_balances",
                        lambda uid, accts: {a: 0 for a in accts})
    monkeypatch.setattr(svc, "wallet_grant", lambda *a, **k: {"ok": True})
