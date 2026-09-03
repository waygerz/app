"""purge-user — deletes the user's rows AND scrubs actor snapshots on kept rows."""
import uuid

from tests.conftest import API_PREFIX

from app.extensions import db
from app.models.channel_pref import NotificationChannelPref
from app.models.device_token import DeviceToken
from app.models.notification import Notification
from app.models.preference import NotificationPreference

ITOKEN = {"X-Internal-Token": "dev-internal-token"}
URL = f"{API_PREFIX}/internal/purge-user"


def _notif(user_id, actor_id=None, actor_name=None):
    return Notification(user_id=user_id, category="wager_alert", title="t", body="b",
                        actor_id=actor_id, actor_name=actor_name,
                        actor_avatar_key=("k" if actor_name else None))


def test_purge_deletes_own_and_scrubs_actor_rows(client, app):
    uid, other = str(uuid.uuid4()), str(uuid.uuid4())
    with app.app_context():
        db.session.add(_notif(uid))  # own feed row -> deleted
        # someone else's feed row where the deleted user was the actor -> scrubbed
        db.session.add(_notif(other, actor_id=uid, actor_name="Marcus"))
        # an unrelated actor row -> untouched
        db.session.add(_notif(other, actor_id=other, actor_name="Sam"))
        db.session.add(DeviceToken(user_id=uid, token="tok", platform="ios"))
        db.session.add(NotificationPreference(user_id=uid))
        db.session.add(NotificationChannelPref(user_id=uid, category="wager_alert",
                                               channel="sms", enabled=True))
        db.session.commit()

    r = client.post(URL, json={"user_id": uid}, headers=ITOKEN)
    assert r.status_code == 200
    body = r.get_json()
    assert body["purged"]["notifications"] == 1
    assert body["purged"]["device_tokens"] == 1
    assert body["purged"]["preferences"] == 1
    assert body["purged"]["channel_prefs"] == 1
    assert body["scrubbed"]["actor_rows"] == 1

    with app.app_context():
        assert Notification.query.filter_by(user_id=uid).count() == 0
        scrubbed = Notification.query.filter_by(actor_id=uid).one()
        assert scrubbed.actor_name == "Deleted user"
        assert scrubbed.actor_avatar_key is None
        untouched = Notification.query.filter_by(actor_id=other).one()
        assert untouched.actor_name == "Sam"


def test_purge_requires_internal_token(client):
    assert client.post(URL, json={"user_id": str(uuid.uuid4())}).status_code == 403
