"""Pytest fixtures. Runs against a dedicated *_test schema so prod data is safe.

Run with:  DB_SCHEMA=ingestor_test python -m pytest -q
Most ingestor tests are pure mapping (no DB); the `app` fixture is only needed
by the few that touch the Event table (e.g. the stale-event reaper).
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
