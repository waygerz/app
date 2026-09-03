"""purge-user (account deletion) — deletes friendships + own invite codes."""
import uuid

from tests.conftest import API_PREFIX

from app.extensions import db
from app.models.friendship import ACCEPTED, Friendship
from app.models.invite_code import FriendInviteCode

ITOKEN = {"X-Internal-Token": "dev-internal-token"}
URL = f"{API_PREFIX}/internal/purge-user"


def test_purge_deletes_friendships_and_codes_but_not_others(client, app):
    uid, other = str(uuid.uuid4()), str(uuid.uuid4())
    with app.app_context():
        db.session.add(Friendship(requester_id=uid, addressee_id=other, status=ACCEPTED))
        db.session.add(Friendship(requester_id=other, addressee_id=uid, status=ACCEPTED))
        db.session.add(FriendInviteCode(code="FDEL001", owner_id=uid))
        db.session.add(FriendInviteCode(code="FKEEP99", owner_id=other))  # survives
        db.session.commit()

    r = client.post(URL, json={"user_id": uid}, headers=ITOKEN)
    assert r.status_code == 200
    purged = r.get_json()["purged"]
    assert purged["friendships"] == 2
    assert purged["invite_codes"] == 1

    with app.app_context():
        assert Friendship.query.count() == 0
        assert FriendInviteCode.query.filter_by(owner_id=other).count() == 1


def test_purge_is_idempotent(client, app):
    uid = str(uuid.uuid4())
    with app.app_context():
        db.session.add(FriendInviteCode(code="FIDEM01", owner_id=uid))
        db.session.commit()
    assert client.post(URL, json={"user_id": uid}, headers=ITOKEN).status_code == 200
    r2 = client.post(URL, json={"user_id": uid}, headers=ITOKEN)
    assert r2.status_code == 200
    assert r2.get_json()["purged"] == {"friendships": 0, "invite_codes": 0}


def test_purge_requires_internal_token(client):
    r = client.post(URL, json={"user_id": str(uuid.uuid4())})
    assert r.status_code == 403
