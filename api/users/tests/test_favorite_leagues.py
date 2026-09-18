"""Pinned leagues — GET / PUT /favorites/leagues (replace-the-list) and purge."""
import uuid

from flask_jwt_extended import create_access_token

from tests.conftest import API_PREFIX

from app.extensions import db
from app.models.favorite_league import FavoriteLeague
from app.utils.config import Config

URL = f"{API_PREFIX}/favorites/leagues"


def _auth(app, uid):
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity=uid)}"}


def _lg(league, name=None, sport="football"):
    return {"sport": sport, "league": league, "name": name or league.upper(), "abbreviation": league.upper()}


def test_get_is_empty_by_default(client, app):
    r = client.get(URL, headers=_auth(app, str(uuid.uuid4())))
    assert r.status_code == 200
    assert r.get_json() == {"favorite_leagues": []}


def test_put_replaces_the_ordered_list_and_dedups(client, app):
    uid = str(uuid.uuid4())
    h = _auth(app, uid)
    r = client.put(URL, json={"leagues": [_lg("nfl"), _lg("college-football", "NCAAF"), _lg("nfl")]}, headers=h)
    assert r.status_code == 200
    got = r.get_json()["favorite_leagues"]
    assert [(g["league"], g["position"]) for g in got] == [("nfl", 0), ("college-football", 1)]

    # A second PUT replaces the list (unpin nfl, add mlb).
    r = client.put(URL, json={"leagues": [_lg("college-football", "NCAAF"), _lg("mlb", sport="baseball")]}, headers=h)
    assert [g["league"] for g in r.get_json()["favorite_leagues"]] == ["college-football", "mlb"]
    assert [g["league"] for g in client.get(URL, headers=h).get_json()["favorite_leagues"]] == [
        "college-football", "mlb"]


def test_lists_are_per_user(client, app):
    a, b = str(uuid.uuid4()), str(uuid.uuid4())
    client.put(URL, json={"leagues": [_lg("nfl")]}, headers=_auth(app, a))
    assert client.get(URL, headers=_auth(app, b)).get_json()["favorite_leagues"] == []


def test_validation_and_cap(client, app):
    h = _auth(app, str(uuid.uuid4()))
    assert client.put(URL, json={}, headers=h).status_code == 400
    assert client.put(URL, json={"leagues": "nfl"}, headers=h).status_code == 400
    assert client.put(URL, json={"leagues": [{"sport": "football"}]}, headers=h).status_code == 400
    assert client.put(URL, json={"leagues": [{"sport": {}, "league": "x", "name": "y"}]}, headers=h).status_code == 400
    cap = app.config["FAVORITE_LEAGUES_MAX"]
    too_many = [_lg(f"l{i}") for i in range(cap + 1)]
    r = client.put(URL, json={"leagues": too_many}, headers=h)
    assert r.status_code == 400 and str(cap) in r.get_json()["error"]


def test_requires_auth(client):
    assert client.get(URL).status_code == 401


def test_purge_deletes_pinned_leagues(client, app):
    uid = str(uuid.uuid4())
    client.put(URL, json={"leagues": [_lg("nfl"), _lg("nba", sport="basketball")]}, headers=_auth(app, uid))
    r = client.post(f"{API_PREFIX}/internal/purge-user", json={"user_id": uid},
                    headers={"X-Internal-Token": Config.INTERNAL_TOKEN})
    assert r.status_code == 200
    assert r.get_json()["purged"]["favorite_leagues"] == 2
    with app.app_context():
        assert FavoriteLeague.query.filter_by(user_id=uid).count() == 0
