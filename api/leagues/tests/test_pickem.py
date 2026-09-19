import uuid
from datetime import datetime, timedelta

from app.extensions import db
from tests.conftest import API_PREFIX
from app.models import period as period_model
from app.models.period import LeaguePeriod

U1 = str(uuid.uuid4())


def _create_pickem(client, headers, **over):
    payload = {
        "name": "Pick'em Pool",
        "league_type": "pickem",
        "period_type": "season",
        "starting_balance_cents": None,
        "sports": ["NFL"],
    }
    payload.update(over)
    return client.post(f"{API_PREFIX}/", json=payload, headers=headers)


def _activate(client, headers, lid):
    return client.post(f"/v1/gameplay/leagues/{lid}/activate", headers=headers)


def _period_id(detail):
    return detail["current_period"]["id"]


def test_create_and_activate_pickem(client, auth_headers):
    r = _create_pickem(client, auth_headers(U1))
    assert r.status_code == 201
    d = r.get_json()["league"]
    assert d["league_type"] == "pickem"
    assert d["starting_balance_cents"] is None
    d = _activate(client, auth_headers(U1), d["id"]).get_json()["league"]
    assert d["current_period"]["status"] == "open"


def test_submit_and_get_picks(client, auth_headers):
    d = _create_pickem(client, auth_headers(U1)).get_json()["league"]
    d = _activate(client, auth_headers(U1), d["id"]).get_json()["league"]
    lid, pid = d["id"], _period_id(d)

    r = client.put(
        f"/v1/gameplay/leagues/{lid}/periods/{pid}/picks",
        json={"picks": [{"event_id": "EVT1", "side": "home"},
                        {"event_id": "EVT2", "side": "away"}]},
        headers=auth_headers(U1),
    )
    assert r.status_code == 200
    picks = r.get_json()["picks"]
    assert {p["event_id"]: p["pick_side"] for p in picks} == {"EVT1": "home", "EVT2": "away"}
    assert all("event" in p for p in picks)  # PUT returns the same shape as GET

    got = client.get(f"/v1/gameplay/leagues/{lid}/periods/{pid}/picks", headers=auth_headers(U1)).get_json()
    assert len(got["picks"]) == 2
    assert all("event" in p for p in got["picks"])  # scoreboard key present


def test_picks_upsert_changes_side(client, auth_headers):
    d = _create_pickem(client, auth_headers(U1)).get_json()["league"]
    d = _activate(client, auth_headers(U1), d["id"]).get_json()["league"]
    lid, pid = d["id"], _period_id(d)
    base = {"event_id": "EVT1", "side": "home"}
    client.put(f"/v1/gameplay/leagues/{lid}/periods/{pid}/picks", json={"picks": [base]},
               headers=auth_headers(U1))
    r = client.put(f"/v1/gameplay/leagues/{lid}/periods/{pid}/picks",
                   json={"picks": [{"event_id": "EVT1", "side": "away"}]},
                   headers=auth_headers(U1))
    picks = r.get_json()["picks"]
    assert len(picks) == 1 and picks[0]["pick_side"] == "away"


def test_bad_side_rejected(client, auth_headers):
    d = _create_pickem(client, auth_headers(U1)).get_json()["league"]
    d = _activate(client, auth_headers(U1), d["id"]).get_json()["league"]
    lid, pid = d["id"], _period_id(d)
    r = client.put(f"/v1/gameplay/leagues/{lid}/periods/{pid}/picks",
                   json={"picks": [{"event_id": "EVT1", "side": "draw"}]},
                   headers=auth_headers(U1))
    assert r.status_code == 400


def test_picks_locked_when_period_not_open(client, auth_headers, app):
    d = _create_pickem(client, auth_headers(U1)).get_json()["league"]
    d = _activate(client, auth_headers(U1), d["id"]).get_json()["league"]
    lid, pid = d["id"], _period_id(d)
    # Close the period directly in the DB, through the same session the test
    # client uses (the fixture's app context) so its identity map sees it.
    p = db.session.get(LeaguePeriod, pid)
    p.status = period_model.CLOSED
    db.session.commit()
    r = client.put(f"/v1/gameplay/leagues/{lid}/periods/{pid}/picks",
                   json={"picks": [{"event_id": "EVT1", "side": "home"}]},
                   headers=auth_headers(U1))
    assert r.status_code == 400
    assert "locked" in r.get_json()["error"]


def test_non_member_cannot_pick(client, auth_headers):
    d = _create_pickem(client, auth_headers(U1)).get_json()["league"]
    d = _activate(client, auth_headers(U1), d["id"]).get_json()["league"]
    lid, pid = d["id"], _period_id(d)
    r = client.put(f"/v1/gameplay/leagues/{lid}/periods/{pid}/picks",
                   json={"picks": [{"event_id": "EVT1", "side": "home"}]},
                   headers=auth_headers(str(uuid.uuid4())))
    assert r.status_code == 404


def test_money_league_rejects_picks(client, auth_headers):
    payload = {
        "name": "Money", "league_type": "head_to_head", "period_type": "season",
        "starting_balance_cents": 100000, "sports": ["NBA"],
    }
    d = client.post(f"{API_PREFIX}/", json=payload, headers=auth_headers(U1)).get_json()["league"]
    d = _activate(client, auth_headers(U1), d["id"]).get_json()["league"]
    lid, pid = d["id"], _period_id(d)
    r = client.put(f"/v1/gameplay/leagues/{lid}/periods/{pid}/picks",
                   json={"picks": [{"event_id": "EVT1", "side": "home"}]},
                   headers=auth_headers(U1))
    assert r.status_code == 400


def test_grading_marks_correct_and_incorrect(client, auth_headers, app, monkeypatch):
    from app.services import service_leagues as svc

    d = _create_pickem(client, auth_headers(U1)).get_json()["league"]
    d = _activate(client, auth_headers(U1), d["id"]).get_json()["league"]
    lid, pid = d["id"], _period_id(d)
    client.put(
        f"/v1/gameplay/leagues/{lid}/periods/{pid}/picks",
        json={"picks": [{"event_id": "EVT1", "side": "home"},
                        {"event_id": "EVT2", "side": "away"}]},
        headers=auth_headers(U1),
    )

    # EVT1 home wins -> pick(home) correct; EVT2 home wins -> pick(away) wrong.
    finals = {
        "EVT1": {"status": "final", "winner_side": "home"},
        "EVT2": {"status": "final", "winner_side": "home"},
    }
    monkeypatch.setattr(svc, "get_event", lambda eid: finals.get(eid))

    with app.app_context():
        n = svc.grade_open_periods()
    assert n == 2

    # Read the graded picks fresh from the DB. (The Flask test client reuses the
    # fixture's app context, so a client.get here can return a stale session
    # snapshot — in production the session is removed per request, so this is a
    # test-harness artifact, not a real read-staleness bug.)
    with app.app_context():
        from app.models.pick import Pick as _P
        by_event = {p.event_id: p.correct for p in _P.query.filter_by(period_id=pid).all()}
    assert by_event == {"EVT1": True, "EVT2": False}


def test_grading_skips_non_final(client, auth_headers, app, monkeypatch):
    from app.services import service_leagues as svc

    d = _create_pickem(client, auth_headers(U1)).get_json()["league"]
    d = _activate(client, auth_headers(U1), d["id"]).get_json()["league"]
    lid, pid = d["id"], _period_id(d)
    client.put(f"/v1/gameplay/leagues/{lid}/periods/{pid}/picks",
               json={"picks": [{"event_id": "EVT1", "side": "home"}]},
               headers=auth_headers(U1))
    monkeypatch.setattr(svc, "get_event",
                        lambda eid: {"status": "live", "winner_side": None})
    with app.app_context():
        assert svc.grade_open_periods() == 0


def test_standings_rank_by_wins(client, auth_headers, app, monkeypatch):
    from app.services import service_leagues as svc

    d = _create_pickem(client, auth_headers(U1)).get_json()["league"]
    code = d["invite_code"]
    d = _activate(client, auth_headers(U1), d["id"]).get_json()["league"]
    lid, pid = d["id"], _period_id(d)

    u2 = str(uuid.uuid4())
    client.post(f"/v1/gameplay/leagues/c/{code}/act", json={"action": "join"}, headers=auth_headers(u2))

    # U1 picks both home (wins both); U2 picks both away (loses both).
    client.put(f"/v1/gameplay/leagues/{lid}/periods/{pid}/picks",
               json={"picks": [{"event_id": "EVT1", "side": "home"},
                               {"event_id": "EVT2", "side": "home"}]},
               headers=auth_headers(U1))
    client.put(f"/v1/gameplay/leagues/{lid}/periods/{pid}/picks",
               json={"picks": [{"event_id": "EVT1", "side": "away"},
                               {"event_id": "EVT2", "side": "away"}]},
               headers=auth_headers(u2))

    monkeypatch.setattr(svc, "get_event",
                        lambda eid: {"status": "final", "winner_side": "home"})
    with app.app_context():
        svc.grade_open_periods()

    rows = client.get(f"/v1/gameplay/leagues/{lid}/standings", headers=auth_headers(U1)).get_json()["standings"]
    assert rows[0]["user_id"] == U1
    assert rows[0]["wins"] == 2 and rows[0]["losses"] == 0
    by_user = {r["user_id"]: r for r in rows}
    assert by_user[u2]["wins"] == 0 and by_user[u2]["losses"] == 2
    assert by_user[U1]["rank"] == 1 and by_user[u2]["rank"] == 2

    # The league list carries the same rank for each member's card.
    def my_rank(user):
        cards = client.get(f"{API_PREFIX}/", headers=auth_headers(user)).get_json()["leagues"]
        return next(c for c in cards if c["id"] == lid)["my_rank"]
    assert my_rank(U1) == 1
    assert my_rank(u2) == 2


def test_standings_rank_is_shared_on_ties(client, auth_headers):
    # Nobody has a graded pick: everyone is 0-0, so everyone is rank 1.
    d = _create_pickem(client, auth_headers(U1)).get_json()["league"]
    for _ in range(2):
        client.post(f"/v1/gameplay/leagues/c/{d['invite_code']}/act", json={"action": "join"},
                    headers=auth_headers(str(uuid.uuid4())))
    rows = client.get(f"/v1/gameplay/leagues/{d['id']}/standings", headers=auth_headers(U1)).get_json()["standings"]
    assert [r["rank"] for r in rows] == [1, 1, 1]


def test_my_rank_is_null_for_draft_and_money_leagues(client, auth_headers):
    user = str(uuid.uuid4())
    _create_pickem(client, auth_headers(user))  # still a draft
    client.post(f"{API_PREFIX}/", json={"name": "Money", "league_type": "head_to_head", "period_type": "season",
                                         "starting_balance_cents": 10000, "sports": ["NFL"]},
                headers=auth_headers(user))
    cards = client.get(f"{API_PREFIX}/", headers=auth_headers(user)).get_json()["leagues"]
    assert len(cards) == 2
    assert all(c["my_rank"] is None for c in cards)


def test_money_league_standings_shape(client, auth_headers, monkeypatch):
    """Money standings return per-member balance/net/W-L rows (Phase 5)."""
    from app.services import service_leagues as svc
    monkeypatch.setattr(svc, "wallet_account_balances", lambda account: {U1: 120000})
    monkeypatch.setattr(svc, "contests_league_record",
                        lambda lid: {U1: {"wins": 3, "losses": 1, "pushes": 0}})

    payload = {
        "name": "Money", "league_type": "head_to_head", "period_type": "season",
        "starting_balance_cents": 100000, "sports": ["NBA"],
    }
    d = client.post(f"{API_PREFIX}/", json=payload, headers=auth_headers(U1)).get_json()["league"]
    rows = client.get(f"/v1/gameplay/leagues/{d['id']}/standings", headers=auth_headers(U1)).get_json()["standings"]
    assert len(rows) == 1
    row = rows[0]
    assert row["user_id"] == U1
    assert row["balance_cents"] == 120000
    assert row["net_cents"] == 20000  # 120000 - 100000 starting
    assert row["wins"] == 3 and row["losses"] == 1
    assert row["rank"] == 1


def test_pick_locked_after_kickoff(client, auth_headers, monkeypatch):
    # A pick for a game that has already started must be rejected server-side
    # (the webui hides it, but the API is the authority — else you could pick a
    # game whose result you already know).
    from app.services import service_leagues as svc

    d = _create_pickem(client, auth_headers(U1)).get_json()["league"]
    d = _activate(client, auth_headers(U1), d["id"]).get_json()["league"]
    lid, pid = d["id"], _period_id(d)
    past = (datetime.utcnow() - timedelta(hours=1)).isoformat() + "Z"
    monkeypatch.setattr(svc, "get_event",
                        lambda eid: {"status": "live", "start_time": past, "winner_side": None})
    r = client.put(f"/v1/gameplay/leagues/{lid}/periods/{pid}/picks",
                   json={"picks": [{"event_id": "EVT1", "side": "home"}]},
                   headers=auth_headers(U1))
    assert r.status_code == 200
    got = client.get(f"/v1/gameplay/leagues/{lid}/periods/{pid}/picks",
                     headers=auth_headers(U1)).get_json()
    assert got["picks"] == []  # the locked pick was not recorded


def test_grading_marks_tie_as_not_correct(client, auth_headers, app, monkeypatch):
    # A genuine final draw (scores present, no winner side) grades as a loss for
    # everyone who picked a team — and must resolve, not strand the period.
    from app.services import service_leagues as svc

    d = _create_pickem(client, auth_headers(U1)).get_json()["league"]
    d = _activate(client, auth_headers(U1), d["id"]).get_json()["league"]
    lid, pid = d["id"], _period_id(d)
    client.put(f"/v1/gameplay/leagues/{lid}/periods/{pid}/picks",
               json={"picks": [{"event_id": "EVT1", "side": "home"}]},
               headers=auth_headers(U1))
    monkeypatch.setattr(svc, "get_event",
                        lambda eid: {"status": "final", "winner_side": None,
                                     "home_score": 2, "away_score": 2})
    with app.app_context():
        assert svc.grade_open_periods() == 1
        from app.models.pick import Pick as _P
        rows = _P.query.filter_by(period_id=pid).all()
        vals = [(p.correct, p.voided) for p in rows]
    assert vals == [(False, False)]


def test_grading_derives_winner_from_score(client, auth_headers, app, monkeypatch):
    # A final with scores but no winner_side (e.g. a stuck game finalized from
    # its score) must grade from the score — not be treated as a draw/void.
    from app.services import service_leagues as svc

    d = _create_pickem(client, auth_headers(U1)).get_json()["league"]
    d = _activate(client, auth_headers(U1), d["id"]).get_json()["league"]
    lid, pid = d["id"], _period_id(d)
    client.put(f"/v1/gameplay/leagues/{lid}/periods/{pid}/picks",
               json={"picks": [{"event_id": "EVT1", "side": "home"}]},
               headers=auth_headers(U1))
    monkeypatch.setattr(svc, "get_event",
                        lambda eid: {"status": "final", "winner_side": None,
                                     "home_score": 20, "away_score": 17})
    with app.app_context():
        assert svc.grade_open_periods() == 1
        from app.models.pick import Pick as _P
        p = _P.query.filter_by(period_id=pid).one()
        assert p.correct is True and p.voided is False  # picked home, home won 20-17


def test_grading_voids_cancelled_game(client, auth_headers, app, monkeypatch):
    # Cancelled / postponed: no contest. The pick is voided (resolved, so the
    # period can finalize) but NOT counted as a loss.
    from app.services import service_leagues as svc

    d = _create_pickem(client, auth_headers(U1)).get_json()["league"]
    d = _activate(client, auth_headers(U1), d["id"]).get_json()["league"]
    lid, pid = d["id"], _period_id(d)
    client.put(f"/v1/gameplay/leagues/{lid}/periods/{pid}/picks",
               json={"picks": [{"event_id": "EVT1", "side": "home"}]},
               headers=auth_headers(U1))
    monkeypatch.setattr(svc, "get_event", lambda eid: {"status": "cancelled"})
    monkeypatch.setattr(svc, "resolve_users_full", lambda ids: {})  # no auth call
    with app.app_context():
        assert svc.grade_open_periods() == 1
        from app.models.pick import Pick as _P
        p = _P.query.filter_by(period_id=pid).one()
        assert p.voided is True and p.correct is None
        # No losses recorded: the void is excluded from the standings tally.
        rows = svc.standings(lid, U1)[0]["standings"]
        me = next(r for r in rows if r["user_id"] == U1)
        assert me["wins"] == 0 and me["losses"] == 0


def test_grading_voids_final_without_a_result(client, auth_headers, app, monkeypatch):
    # A final with no winner AND no scores is a swept/stale event — we never got
    # a result. Void it rather than grading everyone a loss.
    from app.services import service_leagues as svc

    d = _create_pickem(client, auth_headers(U1)).get_json()["league"]
    d = _activate(client, auth_headers(U1), d["id"]).get_json()["league"]
    lid, pid = d["id"], _period_id(d)
    client.put(f"/v1/gameplay/leagues/{lid}/periods/{pid}/picks",
               json={"picks": [{"event_id": "EVT1", "side": "home"}]},
               headers=auth_headers(U1))
    monkeypatch.setattr(svc, "get_event",
                        lambda eid: {"status": "final", "winner_side": None,
                                     "home_score": None, "away_score": None})
    with app.app_context():
        assert svc.grade_open_periods() == 1
        from app.models.pick import Pick as _P
        p = _P.query.filter_by(period_id=pid).one()
        assert p.voided is True and p.correct is None


def test_reconcile_flips_stale_grade_when_result_corrected(client, auth_headers, app, monkeypatch):
    # A pick graded correct against an early/wrong result must self-heal once the
    # event's authoritative result is corrected: reconcile flips the frozen grade.
    from app.services import service_leagues as svc

    d = _create_pickem(client, auth_headers(U1)).get_json()["league"]
    d = _activate(client, auth_headers(U1), d["id"]).get_json()["league"]
    lid, pid = d["id"], _period_id(d)
    client.put(f"/v1/gameplay/leagues/{lid}/periods/{pid}/picks",
               json={"picks": [{"event_id": "EVT1", "side": "home"}]},
               headers=auth_headers(U1))
    # Initial (wrong) result: home wins -> the home pick grades correct.
    monkeypatch.setattr(svc, "get_event",
                        lambda eid: {"status": "final", "winner_side": "home"})
    with app.app_context():
        from app.models.pick import Pick as _P
        assert svc.grade_open_periods() == 1
        assert _P.query.filter_by(period_id=pid).one().correct is True
        # Make it a recently-ended FINAL period so the reconcile pass considers it.
        period = db.session.get(LeaguePeriod, pid)
        period.status = period_model.FINAL
        period.ends_at = datetime.utcnow() - timedelta(hours=1)
        db.session.commit()

    # Corrected result: away actually won -> the frozen grade must flip to wrong.
    monkeypatch.setattr(svc, "get_event",
                        lambda eid: {"status": "final", "winner_side": "away"})
    with app.app_context():
        from app.models.pick import Pick as _P
        assert svc.reconcile_recent_finals() == 1
        p = _P.query.filter_by(period_id=pid).one()
        assert p.correct is False and p.voided is False
        # Idempotent: a second pass with the same result changes nothing.
        assert svc.reconcile_recent_finals() == 0


def test_reconcile_fixes_open_week_immediately(client, auth_headers, app, monkeypatch):
    # A game wrongly finalized mid-week (e.g. a 0-0 placeholder called a draw) must
    # re-grade as soon as the real result lands — not after the week rolls over.
    from app.services import service_leagues as svc

    d = _create_pickem(client, auth_headers(U1)).get_json()["league"]
    d = _activate(client, auth_headers(U1), d["id"]).get_json()["league"]
    lid, pid = d["id"], _period_id(d)
    client.put(f"/v1/gameplay/leagues/{lid}/periods/{pid}/picks",
               json={"picks": [{"event_id": "EVT1", "side": "home"}]},
               headers=auth_headers(U1))
    monkeypatch.setattr(svc, "get_event", lambda eid: {
        "status": "final", "winner_side": "draw", "home_score": 0, "away_score": 0})
    with app.app_context():
        from app.models.pick import Pick as _P
        assert svc.grade_open_periods() == 1
        assert _P.query.filter_by(period_id=pid).one().correct is False
        assert db.session.get(LeaguePeriod, pid).status == period_model.OPEN

    monkeypatch.setattr(svc, "get_event", lambda eid: {
        "status": "final", "winner_side": "home", "home_score": 41, "away_score": 31})
    with app.app_context():
        from app.models.pick import Pick as _P
        assert svc.reconcile_recent_finals() == 1
        assert _P.query.filter_by(period_id=pid).one().correct is True


def test_member_picks_hidden_when_start_unknown(client, auth_headers):
    # Fail closed: a member can't see another member's picks when we can't prove
    # the lock has passed (no readable start time) — else the slate leaks early.
    d = _create_pickem(client, auth_headers(U1)).get_json()["league"]
    code = d["invite_code"]
    d = _activate(client, auth_headers(U1), d["id"]).get_json()["league"]
    lid, pid = d["id"], _period_id(d)
    u2, u3 = str(uuid.uuid4()), str(uuid.uuid4())
    client.post(f"/v1/gameplay/leagues/c/{code}/act", json={"action": "join"}, headers=auth_headers(u2))
    client.post(f"/v1/gameplay/leagues/c/{code}/act", json={"action": "join"}, headers=auth_headers(u3))
    client.put(f"/v1/gameplay/leagues/{lid}/periods/{pid}/picks",
               json={"picks": [{"event_id": "EVT1", "side": "home"}]},
               headers=auth_headers(u2))
    r = client.get(f"/v1/gameplay/leagues/{lid}/periods/{pid}/members/{u2}/picks",
                   headers=auth_headers(u3))
    assert r.status_code == 403


# ---- batch event reads (get_events) ---------------------------------------
from app.services import service_leagues as _svc

# conftest routes get_events through get_event for every test; keep the real one
# (bound at import, before any fixture patches it) to exercise it directly.
_REAL_GET_EVENTS = _svc.get_events


class _Resp:
    def __init__(self, status, body=None):
        self.status_code, self._body = status, body or {}

    def json(self):
        return self._body

    def raise_for_status(self):
        import requests
        if self.status_code >= 400:
            raise requests.HTTPError(f"{self.status_code}")


def test_get_events_dedupes_and_chunks(app, monkeypatch):
    posts = []

    def fake_post(url, json=None, headers=None, timeout=None):
        posts.append((url, list(json["ids"]), headers))
        return _Resp(200, {"events": {i: {"id": i} for i in json["ids"] if i != "missing"}})

    monkeypatch.setattr(_svc.requests, "post", fake_post)
    monkeypatch.setattr(_svc, "get_event", lambda eid: (_ for _ in ()).throw(AssertionError(eid)))
    ids = [f"e{i}" for i in range(1001)] + ["e0", "missing"]
    with app.app_context():
        out = _REAL_GET_EVENTS(ids)
    assert [len(p[1]) for p in posts] == [500, 500, 2]
    assert all(p[0].endswith("/internal/events/lookup") for p in posts)
    assert all(p[2] == {"X-Internal-Token": app.config["INTERNAL_TOKEN"]} for p in posts)
    assert out["e1000"] == {"id": "e1000"} and out["missing"] is None


def test_get_events_falls_back_to_single_reads(app, monkeypatch):
    # An older ingestor without the endpoint 404s — read each id singly instead.
    monkeypatch.setattr(_svc.requests, "post", lambda *a, **k: _Resp(404))

    def single(eid):
        if eid == "boom":
            raise RuntimeError("ingestor down")
        return {"id": eid} if eid == "a" else None

    monkeypatch.setattr(_svc, "get_event", single)
    with app.app_context():
        out = _REAL_GET_EVENTS(["a", "b", "boom"])
    assert out == {"a": {"id": "a"}, "b": None}  # unreadable id is absent, not None


def test_grading_reads_events_in_one_batch(client, auth_headers, app, monkeypatch):
    d = _create_pickem(client, auth_headers(U1)).get_json()["league"]
    d = _activate(client, auth_headers(U1), d["id"]).get_json()["league"]
    lid, pid = d["id"], _period_id(d)
    client.put(
        f"/v1/gameplay/leagues/{lid}/periods/{pid}/picks",
        json={"picks": [{"event_id": "EVT1", "side": "home"},
                        {"event_id": "EVT2", "side": "away"}]},
        headers=auth_headers(U1),
    )
    batches, singles = [], []
    monkeypatch.setattr(_svc, "get_events", lambda ids: batches.append(set(ids)) or {
        i: {"status": "final", "winner_side": "home"} for i in batches[-1]})
    monkeypatch.setattr(_svc, "get_event", lambda eid: singles.append(eid))
    with app.app_context():
        assert _svc.grade_open_periods() == 2
    assert batches == [{"EVT1", "EVT2"}] and singles == []
