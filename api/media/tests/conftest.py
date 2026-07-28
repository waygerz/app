"""Pytest fixtures — media_test schema only."""
import pytest
from flask_jwt_extended import create_access_token
from sqlalchemy import text

from app import create_app
from app.extensions import db

API_PREFIX = "/v1/platform/media"
USER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"


@pytest.fixture()
def app():
    application = create_app()
    schema = application.config["DB_SCHEMA"]
    assert schema.endswith("_test"), (
        f"refusing to run tests in schema '{schema}' — set DB_SCHEMA=media_test"
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
    with app.app_context():
        token = create_access_token(identity=USER_ID)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def _force_mock_storage(app):
    app.config["MEDIA_MOCK"] = True