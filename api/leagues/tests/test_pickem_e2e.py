"""End-to-end weekly Pick'em contest.

Drives a full week through the real HTTP surface: create -> activate (weekly
periods seeded) -> members join -> submit picks (+ tiebreaker) -> games finish
-> scheduler /internal/tick grades + rolls the week over -> weekly leaderboard
(rank + tiebreaker) -> confirm -> season standings -> next week open & lockout.

Cross-service seams are stubbed on service_leagues: ingestor_weeks (period
seeding) and get_event (game state/results). Time isn't injectable, so the
week is closed by pushing its ends_at into the past before a tick.
"""
import uuid
from datetime import datetime, timedelta

from app.extensions import db
from app.models.period import LeaguePeriod
from tests.conftest import API_PREFIX

TICK = f"{API_PREFIX}/internal/tick"


def _iso(dt):
    return dt.isoformat() + "Z"


def test_weekly_pickem_end_to_end(client, auth_headers, app, monkeypatch):
    from app.services import service_leagues as svc

    commish = str(uuid.uuid4())
    member = str(uuid.uuid4())
    now = datetime.utcnow()
    tick_hdr = {"X-Internal-Token": app.config["INTERNAL_TOKEN"]}

    # --- Seams -------------------------------------------------------------
    # Two future weeks so _prebuild_periods seeds Week 1 (open) + Week 2.
    def fake_weeks(_sport_league_id):
        return [
            {"label": "Week 1", "start": _iso(now - timedelta(hours=2)),
             "end": _iso(now + timedelta(days=6)), "count": 3},
            {"label": "Week 2", "start": _iso(now + timedelta(days=6)),
             "end": _iso(now + timedelta(days=13)), "count": 3},
        ]
    monkeypatch.setattr(svc, "ingestor_weeks", fake_weeks)

    # Mutable game registry — G3 has the latest start (the tiebreaker game).
    events = {
        "G1": {"status": "scheduled", "winner_side": None, "home_score": None, "away_score": None,
               "start_time": _iso(now + timedelta(hours=1)), "name": "A @ B", "home_team": "B", "away_team": "A"},
        "G2": {"status": "scheduled", "winner_side": None, "home_score": None, "away_score": None,
               "start_time": _iso(now + timedelta(hours=2)), "name": "C @ D", "home_team": "D", "away_team": "C"},
        "G3": {"status": "scheduled", "winner_side": None, "home_score": None, "away_score": None,
               "start_time": _iso(now + timedelta(hours=3)), "name": "E @ F", "home_team": "F", "away_team": "E"},
    }
    monkeypatch.setattr(svc, "get_event", lambda eid: events.get(eid))

    # --- 1) Create a weekly pick'em league and activate it -----------------
    d = client.post(f"{API_PREFIX}/", json={
        "name": "Weekly Pool", "league_type": "pickem", "period_type": "weekly",
        "starting_balance_cents": None, "sports": ["NFL"],
    }, headers=auth_headers(commish)).get_json()["league"]
    lid, code = d["id"], d["join_code"]

    d = client.post(f"{API_PREFIX}/{lid}/activate", headers=auth_headers(commish)).get_json()["league"]
    assert d["current_period"]["status"] == "open"
    pid = d["current_period"]["id"]

    with app.app_context():
        periods = LeaguePeriod.query.filter_by(league_id=lid).order_by(LeaguePeriod.index).all()
        assert [p.label for p in periods] == ["Week 1", "Week 2"]
        assert periods[0].status == "open" and periods[1].status == "upcoming"

    # --- 2) A second member joins ------------------------------------------
    assert client.post(f"{API_PREFIX}/join", json={"code": code},
                       headers=auth_headers(member)).status_code == 201

    # --- 3) Both submit picks (G3 carries the tiebreaker) ------------------
    # commish: G1 home ✓, G2 away ✓, G3 away ✗  -> 2 correct, tb 44 (exact)
    assert client.put(f"{API_PREFIX}/{lid}/periods/{pid}/picks", json={"picks": [
        {"event_id": "G1", "side": "home"},
        {"event_id": "G2", "side": "away"},
        {"event_id": "G3", "side": "away", "tiebreaker_total": 44},
    ]}, headers=auth_headers(commish)).status_code == 200
    # member: G1 home ✓, G2 home ✗, G3 home ✓  -> 2 correct, tb 50 (off by 6)
    assert client.put(f"{API_PREFIX}/{lid}/periods/{pid}/picks", json={"picks": [
        {"event_id": "G1", "side": "home"},
        {"event_id": "G2", "side": "home"},
        {"event_id": "G3", "side": "home", "tiebreaker_total": 50},
    ]}, headers=auth_headers(member)).status_code == 200

    # --- 4) A tick before kickoff grades nothing ---------------------------
    t = client.post(TICK, headers=tick_hdr)
    assert t.status_code == 200 and t.get_json()["picks_graded"] == 0

    # --- 5) Games go final; close Week 1 so this tick also rolls it over ----
    events["G1"].update(status="final", winner_side="home", home_score=21, away_score=17)
    events["G2"].update(status="final", winner_side="away", home_score=10, away_score=13)
    events["G3"].update(status="final", winner_side="home", home_score=24, away_score=20)  # total 44
    with app.app_context():
        p = db.session.get(LeaguePeriod, pid)
        p.ends_at = now - timedelta(hours=1)
        db.session.commit()

    t = client.post(TICK, headers=tick_hdr).get_json()
    assert t["picks_graded"] == 6      # 2 members x 3 picks
    assert t["periods_rolled"] == 1

    # --- 6) Weekly leaderboard: tie on correct, tiebreaker ranks commish 1st -
    res = client.get(f"{API_PREFIX}/{lid}/periods/{pid}/results", headers=auth_headers(commish)).get_json()
    rows = {r["user_id"]: r for r in res["rows"]}
    assert rows[commish]["correct"] == 2 and rows[member]["correct"] == 2
    assert res["last_game"]["final"] is True and res["last_game"]["actual_total"] == 44
    assert rows[commish]["tiebreaker_diff"] == 0    # |44 - 44|
    assert rows[member]["tiebreaker_diff"] == 6     # |50 - 44|
    assert rows[commish]["rank"] == 1 and rows[member]["rank"] == 2

    # --- 6b) The week's feed post announces the winner --------------------
    feed = client.get(f"{API_PREFIX}/{lid}/feed", headers=auth_headers(commish)).get_json()["feed"]
    final_post = next(i for i in feed if i["event_type"] == "period_final")
    assert final_post["title"] == "Week 1 is final"
    body = final_post["body"]
    assert "🏆" in body and "2/3 correct" in body
    assert f"User {commish[:4]}" in body           # the tie-breaker winner
    assert "tie-breaker: off by 0" in body         # tie on correct -> called out

    # --- 7) Week rolled over: Week 1 final, Week 2 open --------------------
    with app.app_context():
        periods = LeaguePeriod.query.filter_by(league_id=lid).order_by(LeaguePeriod.index).all()
        assert periods[0].status == "final" and periods[1].status == "open"
    d = client.get(f"{API_PREFIX}/{lid}", headers=auth_headers(commish)).get_json()["league"]
    assert d["current_period"]["id"] != pid
    pid2 = d["current_period"]["id"]

    # --- 8) Week 1 is locked; Week 2 accepts picks ------------------------
    locked = client.put(f"{API_PREFIX}/{lid}/periods/{pid}/picks",
                        json={"picks": [{"event_id": "G1", "side": "home"}]}, headers=auth_headers(commish))
    assert locked.status_code == 400 and "locked" in locked.get_json()["error"]
    assert client.put(f"{API_PREFIX}/{lid}/periods/{pid2}/picks",
                      json={"picks": [{"event_id": "G9", "side": "home"}]},
                      headers=auth_headers(member)).status_code == 200

    # --- 9) Commissioner confirms a member's Week 1 result ----------------
    assert client.put(f"{API_PREFIX}/{lid}/periods/{pid}/members/{member}/confirm",
                      json={"confirmed": True}, headers=auth_headers(commish)).status_code == 200
    res = client.get(f"{API_PREFIX}/{lid}/periods/{pid}/results", headers=auth_headers(commish)).get_json()
    assert {r["user_id"]: r["confirmed"] for r in res["rows"]}[member] is True

    # --- 10) Season standings: cumulative wins from graded picks ----------
    st = client.get(f"{API_PREFIX}/{lid}/standings", headers=auth_headers(commish)).get_json()["standings"]
    by_user = {r["user_id"]: r for r in st}
    assert by_user[commish]["wins"] == 2 and by_user[commish]["losses"] == 1
    assert by_user[member]["wins"] == 2 and by_user[member]["losses"] == 1


def test_late_game_still_grades_after_week_rolls_over(client, auth_headers, app, monkeypatch):
    """A game that goes final AFTER its week rolled over must still grade.

    Grading keys off pending picks rather than period status, so a Monday-nighter
    running past the week boundary isn't stranded ungraded on a FINAL period.
    """
    from app.services import service_leagues as svc

    commish = str(uuid.uuid4())
    now = datetime.utcnow()
    tick_hdr = {"X-Internal-Token": app.config["INTERNAL_TOKEN"]}

    monkeypatch.setattr(svc, "ingestor_weeks", lambda _s: [
        {"label": "Week 1", "start": _iso(now - timedelta(hours=2)),
         "end": _iso(now + timedelta(days=6)), "count": 2},
    ])
    events = {
        "L1": {"status": "scheduled", "winner_side": None, "home_score": None, "away_score": None,
               "start_time": _iso(now + timedelta(hours=1)), "name": "A1 @ H1",
               "home_team": "H1", "away_team": "A1"},
        "L2": {"status": "scheduled", "winner_side": None, "home_score": None, "away_score": None,
               "start_time": _iso(now + timedelta(hours=2)), "name": "A2 @ H2",
               "home_team": "H2", "away_team": "A2"},
    }
    monkeypatch.setattr(svc, "get_event", lambda eid: events.get(eid))

    d = client.post(f"{API_PREFIX}/", json={
        "name": "Late Game Pool", "league_type": "pickem", "period_type": "weekly",
        "starting_balance_cents": None, "sports": ["NFL"],
    }, headers=auth_headers(commish)).get_json()["league"]
    lid = d["id"]
    d = client.post(f"{API_PREFIX}/{lid}/activate", headers=auth_headers(commish)).get_json()["league"]
    pid = d["current_period"]["id"]

    client.put(f"{API_PREFIX}/{lid}/periods/{pid}/picks", json={"picks": [
        {"event_id": "L1", "side": "home"},   # will be correct
        {"event_id": "L2", "side": "home"},   # will be wrong (graded late)
    ]}, headers=auth_headers(commish))

    # L1 finishes; L2 runs long. Week ends -> tick grades L1 and closes the week.
    events["L1"].update(status="final", winner_side="home", home_score=20, away_score=10)
    with app.app_context():
        p = db.session.get(LeaguePeriod, pid)
        p.ends_at = now - timedelta(hours=1)
        db.session.commit()

    t = client.post(TICK, headers=tick_hdr).get_json()
    assert t["picks_graded"] == 1 and t["periods_rolled"] == 1
    with app.app_context():
        assert db.session.get(LeaguePeriod, pid).status == "final"

    # Partially graded at rollover -> the post must NOT name a winner.
    feed = client.get(f"{API_PREFIX}/{lid}/feed", headers=auth_headers(commish)).get_json()["feed"]
    final_post = next(i for i in feed if i["event_type"] == "period_final")
    assert "🏆" not in final_post["body"]

    # L2 finally goes final, after the period is already FINAL — must still grade.
    events["L2"].update(status="final", winner_side="away", home_score=7, away_score=14)
    t = client.post(TICK, headers=tick_hdr).get_json()
    assert t["picks_graded"] == 1          # the late pick graded despite FINAL period

    res = client.get(f"{API_PREFIX}/{lid}/periods/{pid}/results",
                     headers=auth_headers(commish)).get_json()
    row = res["rows"][0]
    assert row["graded"] == 2 and row["correct"] == 1   # L1 right, L2 wrong

    # Nothing left pending -> a further tick is a no-op.
    assert client.post(TICK, headers=tick_hdr).get_json()["picks_graded"] == 0
