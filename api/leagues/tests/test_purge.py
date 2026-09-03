"""purge-user + commissioned-leagues (account deletion) for the leagues service."""
import uuid

from tests.conftest import API_PREFIX

from app.extensions import db
from app.models.feed import ACTIVITY, LeagueFeed
from app.models.feed_read import LeagueFeedRead
from app.models.invite import LeagueInvite
from app.models.invite_code import LeagueInviteCode
from app.models.league import ACTIVE as LG_ACTIVE, ARCHIVED, HEAD_TO_HEAD, League
from app.models.member import ACTIVE, LeagueMember

ITOKEN = {"X-Internal-Token": "dev-internal-token"}
PURGE = f"{API_PREFIX}/internal/purge-user"
COMMISSIONED = f"{API_PREFIX}/internal/commissioned-leagues"


def test_commissioned_leagues_blocks_only_non_archived(client, app):
    uid = str(uuid.uuid4())
    with app.app_context():
        live = League(name="Sunday Squad", commissioner_id=uid, league_type=HEAD_TO_HEAD,
                      status=LG_ACTIVE)
        gone = League(name="Old League", commissioner_id=uid, league_type=HEAD_TO_HEAD,
                      status=ARCHIVED)
        db.session.add_all([live, gone])
        db.session.flush()
        db.session.add(LeagueMember(league_id=live.id, user_id=uid, role="commissioner",
                                    status=ACTIVE))
        db.session.commit()

    r = client.post(COMMISSIONED, json={"user_id": uid}, headers=ITOKEN)
    assert r.status_code == 200
    leagues = r.get_json()["leagues"]
    assert len(leagues) == 1
    assert leagues[0]["name"] == "Sunday Squad"
    assert leagues[0]["member_count"] == 1


def test_purge_deletes_personal_rows_and_scrubs_member_joined_feed(client, app):
    uid, other = str(uuid.uuid4()), str(uuid.uuid4())
    league = str(uuid.uuid4())
    with app.app_context():
        db.session.add(LeagueMember(league_id=league, user_id=uid, status=ACTIVE))
        db.session.add(LeagueFeedRead(league_id=league, user_id=uid))
        db.session.add(LeagueInviteCode(code="LDEL01", league_id=league, created_by=uid))
        db.session.add(LeagueInvite(league_id=league, inviter_id=uid, invitee_id=other))
        db.session.add(LeagueInvite(league_id=league, inviter_id=other, invitee_id=uid))
        # The leaking system post: author_id is NULL, user id lives in meta.
        db.session.add(LeagueFeed(league_id=league, kind=ACTIVITY, event_type="member_joined",
                                  author_id=None, title="Marcus joined",
                                  body="Marcus joined the league.", meta={"user_id": uid}))
        # A different member's join must be untouched.
        db.session.add(LeagueFeed(league_id=league, kind=ACTIVITY, event_type="member_joined",
                                  author_id=None, title="Sam joined",
                                  body="Sam joined the league.", meta={"user_id": other}))
        db.session.commit()

    r = client.post(PURGE, json={"user_id": uid}, headers=ITOKEN)
    assert r.status_code == 200
    body = r.get_json()
    assert body["purged"] == {
        "league_members": 1, "feed_reads": 1, "invite_codes": 1, "league_invites": 2,
    }
    assert body["scrubbed"]["member_joined_feed"] == 1

    with app.app_context():
        assert LeagueMember.query.filter_by(user_id=uid).count() == 0
        mine = LeagueFeed.query.filter(LeagueFeed.meta["user_id"].astext == uid).one()
        assert mine.title == "Deleted user joined"
        assert mine.body == "Deleted user joined the league."
        theirs = LeagueFeed.query.filter(LeagueFeed.meta["user_id"].astext == other).one()
        assert theirs.title == "Sam joined"  # untouched


def test_purge_requires_internal_token(client):
    assert client.post(PURGE, json={"user_id": str(uuid.uuid4())}).status_code == 403
