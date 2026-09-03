"""purge-user — anonymizes the profile (tombstone) and deletes favorite teams."""
import uuid

from tests.conftest import API_PREFIX

from app.extensions import db
from app.models.favorite_team import FavoriteTeam
from app.models.profile import Profile

ITOKEN = {"X-Internal-Token": "dev-internal-token"}
URL = f"{API_PREFIX}/internal/purge-user"


def _fav(uid, ext):
    return FavoriteTeam(user_id=uid, sport="football", league="nfl", external_id=ext,
                        name="Team", abbreviation="TM", position=0)


def test_purge_anonymizes_profile_and_deletes_favorites(client, app):
    uid, other = str(uuid.uuid4()), str(uuid.uuid4())
    with app.app_context():
        db.session.add(Profile(user_id=uid, display_name="Marcus", avatar_key="a/1.webp"))
        db.session.add(Profile(user_id=other, display_name="Sam"))  # untouched
        db.session.add_all([_fav(uid, "1"), _fav(uid, "2"), _fav(other, "3")])
        db.session.commit()

    r = client.post(URL, json={"user_id": uid}, headers=ITOKEN)
    assert r.status_code == 200
    body = r.get_json()
    assert body["purged"]["favorite_teams"] == 2
    assert body["anonymized"]["profile"] is True

    with app.app_context():
        p = db.session.get(Profile, uid)
        assert p is not None  # tombstone kept
        assert p.display_name == "Deleted user"
        assert p.avatar_key is None
        assert FavoriteTeam.query.filter_by(user_id=uid).count() == 0
        # the other user is untouched
        assert db.session.get(Profile, other).display_name == "Sam"
        assert FavoriteTeam.query.filter_by(user_id=other).count() == 1


def test_purge_missing_profile_is_ok(client, app):
    uid = str(uuid.uuid4())
    r = client.post(URL, json={"user_id": uid}, headers=ITOKEN)
    assert r.status_code == 200
    assert r.get_json()["anonymized"]["profile"] is False


def test_purge_requires_internal_token(client):
    assert client.post(URL, json={"user_id": str(uuid.uuid4())}).status_code == 403
