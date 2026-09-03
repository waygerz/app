"""purge-user — deletes the user's owned assets (mock storage, no real S3)."""
import uuid

from tests.conftest import API_PREFIX

from app.extensions import db
from app.models.asset import PURPOSE_AVATAR, STATUS_READY, Asset

ITOKEN = {"X-Internal-Token": "dev-internal-token"}
URL = f"{API_PREFIX}/internal/purge-user"


def _asset(owner):
    return Asset(owner_id=owner, purpose=PURPOSE_AVATAR, s3_bucket="b",
                 s3_key=f"avatars/{uuid.uuid4()}.webp", content_type="image/webp",
                 byte_size=1024, status=STATUS_READY)


def test_purge_deletes_only_owner_assets(client, app):
    uid, other = str(uuid.uuid4()), str(uuid.uuid4())
    with app.app_context():
        db.session.add_all([_asset(uid), _asset(uid), _asset(other)])
        db.session.commit()

    r = client.post(URL, json={"user_id": uid}, headers=ITOKEN)
    assert r.status_code == 200
    assert r.get_json()["purged"]["assets"] == 2

    with app.app_context():
        assert Asset.query.filter_by(owner_id=uid).count() == 0
        assert Asset.query.filter_by(owner_id=other).count() == 1


def test_purge_is_idempotent(client, app):
    uid = str(uuid.uuid4())
    with app.app_context():
        db.session.add(_asset(uid))
        db.session.commit()
    assert client.post(URL, json={"user_id": uid}, headers=ITOKEN).status_code == 200
    r2 = client.post(URL, json={"user_id": uid}, headers=ITOKEN)
    assert r2.status_code == 200
    assert r2.get_json()["purged"]["assets"] == 0


def test_purge_requires_internal_token(client):
    assert client.post(URL, json={"user_id": str(uuid.uuid4())}).status_code == 403
