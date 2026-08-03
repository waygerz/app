"""Pytest fixtures — runs against auth_test schema + isolated Redis session keys."""
import uuid

import pytest
from sqlalchemy import text

from app import create_app
from app.extensions import db, get_redis
from app.services.service_auth import hash_pin, normalize_phone
from app.models.user import User


@pytest.fixture()
def app():
    application = create_app()
    schema = application.config["DB_SCHEMA"]
    assert schema.endswith("_test"), (
        f"refusing to run tests in schema '{schema}' — set DB_SCHEMA=auth_test"
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
def device_uuid():
    return str(uuid.uuid4())


@pytest.fixture()
def user(app):
    with app.app_context():
        phone = normalize_phone("9042398484")
        u = User(phone=phone, pin_hash=hash_pin("1234"), display_name="Tester")
        db.session.add(u)
        db.session.commit()
        db.session.refresh(u)
        return {"id": str(u.id), "phone": phone, "pin": "1234"}


# Redis is shared across tests (unlike the DB, which is recreated per test), so
# any per-phone state left in it — the OTP itself, the send cooldown, verify
# attempts, registration tickets, and sessions — would bleed into the next test.
# Notably the send cooldown (otp:cooldown:{phone}) makes a second login with the
# same phone return 429. Clear it all, before and after each test, to keep the
# suite hermetic.
_REDIS_TEST_PREFIXES = ("auth:sessions:*", "users:sessions:*", "otp:*", "regticket:*")


def _flush_auth_redis():
    redis = get_redis()
    for prefix in _REDIS_TEST_PREFIXES:
        for key in redis.scan_iter(prefix):
            redis.delete(key)


@pytest.fixture(autouse=True)
def _clean_redis_sessions(app):
    with app.app_context():
        _flush_auth_redis()
    yield
    with app.app_context():
        _flush_auth_redis()