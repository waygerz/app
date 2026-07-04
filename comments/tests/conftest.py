"""Pytest fixtures. Runs against a dedicated *_test schema so prod data is safe.

Run with:  docker compose exec -e DB_SCHEMA=comments_test comments python -m pytest -q
"""
import pytest
from flask_jwt_extended import create_access_token
from sqlalchemy import text

from app import create_app
from app.extensions import db

API_PREFIX = "/v1/social/comments"
POST_ID = "11111111-1111-1111-1111-111111111111"
LEAGUE_ID = "22222222-2222-2222-2222-222222222222"


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
    from app.services import service_comments as svc

    def _verify(post_id, user_id):
        if str(post_id) != POST_ID:
            return None, {"error": "post not found"}, 404
        return {
            "id": POST_ID,
            "league_id": LEAGUE_ID,
            "kind": "announcement",
            "author_id": user_id,
        }, None, None

    def _accessible(post_ids, user_id):
        return {
            POST_ID: {
                "id": POST_ID,
                "league_id": LEAGUE_ID,
                "kind": "announcement",
                "author_id": user_id,
            }
        }

    monkeypatch.setattr(svc, "_verify_post_access", _verify)
    monkeypatch.setattr(svc, "_accessible_posts", _accessible)
    monkeypatch.setattr(
        svc, "resolve_users", lambda ids: {str(i): f"User {str(i)[:4]}" for i in ids}
    )