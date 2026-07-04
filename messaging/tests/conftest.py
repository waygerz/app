"""Run with: docker compose exec -e DB_SCHEMA=messaging_test messaging python -m pytest -q"""
import pytest
from flask_jwt_extended import create_access_token
from sqlalchemy import text

from app import create_app
from app.extensions import db

U1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
U2 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
LEAGUE_ID = "22222222-2222-2222-2222-222222222222"


@pytest.fixture()
def app():
    application = create_app()
    schema = application.config["DB_SCHEMA"]
    assert schema.endswith("_test")
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
    from app.services import service_messaging as svc

    monkeypatch.setattr(svc, "_are_friends", lambda a, b: True)
    monkeypatch.setattr(svc, "_share_league_membership", lambda a, b: False)
    monkeypatch.setattr(svc, "_is_league_member", lambda lid, uid: str(lid) == LEAGUE_ID)
    monkeypatch.setattr(
        svc,
        "_user_league_ids",
        lambda uid: [LEAGUE_ID] if str(uid) in (U1, U2) else [],
    )
    monkeypatch.setattr(
        svc, "resolve_users", lambda ids: {str(i): f"User {str(i)[:4]}" for i in ids}
    )
    monkeypatch.setattr(svc, "_publish", lambda *a, **k: None)
    monkeypatch.setattr("app.extensions.get_redis", lambda: None)