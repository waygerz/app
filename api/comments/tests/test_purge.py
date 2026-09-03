"""purge-user — deletes the user's reactions, keeps their comments (tombstone)."""
import uuid

from tests.conftest import API_PREFIX

from app.extensions import db
from app.models.comment import Comment
from app.models.post_like import PostLike

ITOKEN = {"X-Internal-Token": "dev-internal-token"}
URL = f"{API_PREFIX}/internal/purge-user"


def test_purge_deletes_likes_keeps_comments(client, app):
    uid, other = str(uuid.uuid4()), str(uuid.uuid4())
    post = str(uuid.uuid4())
    league = str(uuid.uuid4())
    with app.app_context():
        db.session.add(Comment(post_id=post, league_id=league, author_id=uid, body="mine"))
        db.session.add(PostLike(post_id=post, user_id=uid, reaction="like"))
        db.session.add(PostLike(post_id=post, user_id=other, reaction="love"))  # survives
        db.session.commit()

    r = client.post(URL, json={"user_id": uid}, headers=ITOKEN)
    assert r.status_code == 200
    body = r.get_json()
    assert body["purged"]["post_likes"] == 1
    assert body["kept"]["comments"] == 1

    with app.app_context():
        assert Comment.query.filter_by(author_id=uid).count() == 1  # kept
        assert PostLike.query.filter_by(user_id=uid).count() == 0
        assert PostLike.query.filter_by(user_id=other).count() == 1


def test_purge_requires_internal_token(client):
    assert client.post(URL, json={"user_id": str(uuid.uuid4())}).status_code == 403
