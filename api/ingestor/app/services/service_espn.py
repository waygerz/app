"""Shared ESPN ingestion — Redis-only cache-aside (no Postgres).

ESPN's free public API covers everything RealTimeSportsAPI can't. Sports data is
ephemeral and refetchable, so it lives only in Redis: serve the cached copy; on a
miss or after ESPN_CACHE_TTL (Redis expiry) fetch from ESPN, cache, and serve.
A single-flight lock means a cold key under load triggers one ESPN fetch, not N.

One generic cache-aside skeleton (schedule + per-event board), parameterized by a
`build(sport, league, event)` function that produces the shape:
  * FIELD (golf, racing) -> {"summary": event, "field": [ordered competitors]}
  * ONE_V_ONE (mma)      -> {"summary": card,  "fights": [two-sided matchups]}
  * TEAM (cricket)       -> {"summary": match, "sides": [home, away]}

Keys: espn:sched:{sport}:{league}  /  espn:board:{sport}:{external_id}
"""
import json
import time
from datetime import datetime

import requests
from flask import current_app

from app.extensions import get_redis

_UA = {"User-Agent": "waygerz-ingestor"}

SCHEDULED = "scheduled"
IN_PROGRESS = "in_progress"
FINAL = "final"
CANCELLED = "cancelled"


# ---------------------------------------------------------------- primitives
def _ttl() -> int:
    return current_app.config["ESPN_CACHE_TTL"]


def resolve_leagues(requested, allowed):
    """Constrain a client-supplied ?league= to the configured allowlist so an
    arbitrary value can't drive ESPN fetches for unknown slugs. None -> all."""
    if requested is None:
        return list(allowed)
    return [requested] if requested in allowed else []


def espn_get(sport: str, league: str, path: str = ""):
    base = current_app.config["ESPN_BASE"]
    timeout = current_app.config["ESPN_TIMEOUT"]
    resp = requests.get(f"{base}/{sport}/{league}{path}", headers=_UA, timeout=timeout)
    resp.raise_for_status()
    return resp.json()


def _k_sched(sport, league):
    return f"espn:sched:{sport}:{league}"


def _k_board(sport, external_id):
    return f"espn:board:{sport}:{external_id}"


def _cached(cache_key, refresh):
    """Cache-aside + single-flight. Serve the cached copy; on a miss, exactly one
    caller refreshes (writing the cache) while others briefly wait for it — so a
    cold key under concurrent load triggers one ESPN fetch, not N. `refresh` must
    write the cache and return the value."""
    r = get_redis()
    cached = r.get(cache_key)
    if cached is not None:
        return json.loads(cached)
    lock = f"lock:{cache_key}"
    if r.set(lock, "1", nx=True, ex=20):
        try:
            return refresh()
        except Exception:
            return None  # ESPN down/invalid -> degrade gracefully, never 500
        finally:
            r.delete(lock)
    for _ in range(15):  # lost the race — wait briefly for the winner
        time.sleep(0.1)
        cached = r.get(cache_key)
        if cached is not None:
            return json.loads(cached)
    return None


def map_status(status):
    """Robust across ESPN's variants: `type.name` (STATUS_FINAL…), `type.detail`
    ('Final'), `state` (pre/in/post), and `completed` — cricket omits type.name and
    only sets type.detail, so name-only matching mislabels it."""
    st = status or {}
    if st.get("completed") is True:
        return FINAL
    state = (st.get("state") or "").lower()
    if state == "post":
        return FINAL
    if state == "in":
        return IN_PROGRESS
    typ = st.get("type") or {}
    text = (typ.get("name") or typ.get("detail") or typ.get("shortDetail") or "").upper()
    if any(w in text for w in ("FINAL", "COMPLETE")):
        return FINAL
    if any(w in text for w in ("CANCEL", "POSTPON", "ABANDON")):
        return CANCELLED
    if any(w in text for w in ("PROGRESS", "LIVE", "SUSPEND", "DELAY", "INNINGS")):
        return IN_PROGRESS
    return SCHEDULED


def parse_dt(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "")).replace(tzinfo=None)
    except ValueError:
        return None


def status_from_dates(start_iso, end_iso):
    now = datetime.utcnow()
    s = parse_dt(start_iso)
    e = parse_dt(end_iso)
    if e and e < now:
        return FINAL
    if s and s > now:
        return SCHEDULED
    return IN_PROGRESS


def yyyymmdd(iso):
    d = parse_dt(iso)
    return d.strftime("%Y%m%d") if d else None


def event_id_from_ref(ref):
    if not ref or "/events/" not in ref:
        return None
    return ref.split("/events/", 1)[1].split("?", 1)[0].strip("/") or None


def _league_name(sb):
    return ((sb.get("leagues") or [{}])[0].get("name"))


def _logo(entity):
    logos = entity.get("logos")
    if isinstance(logos, list) and logos:
        return logos[0].get("href")
    return entity.get("logo")


def parse_competitor(c):
    """A single competitor — athlete (individual) or team."""
    who = c.get("athlete") or c.get("team") or {}
    st = c.get("status") or {}
    return {
        "id": str(c.get("id")) if c.get("id") is not None else None,
        "name": who.get("displayName") or who.get("fullName") or who.get("name"),
        "short_name": who.get("shortName") or who.get("abbreviation"),
        "order": c.get("order"),
        "score": str(c.get("score")) if c.get("score") is not None else None,
        "winner": bool(c.get("winner")),
        "position_display": (st.get("position") or {}).get("displayName") or st.get("displayValue"),
        "logo": _logo(who),
    }


def _base_summary(sport, league, ev):
    return {
        "external_id": str(ev.get("id")),
        "sport": sport,
        "league": league,
        "name": ev.get("name"),
        "short_name": ev.get("shortName"),
        "start_date": ev.get("date"),
        "end_date": ev.get("endDate"),
        "status": map_status(ev.get("status")),
    }


def _scoring_competition(ev):
    """The competition that carries the result. Racing weekends list
    practice/qualifying/sprint/race as separate competitions — score the Race
    (else competitions[0], which is correct for golf and single-heat events)."""
    comps = ev.get("competitions") or []
    if not comps:
        return {}
    for c in comps:
        if ((c.get("type") or {}).get("abbreviation") or "").lower() == "race":
            return c
    return comps[0]


# ---------------------------------------------------------------- generic skeleton
def _summary_from_calendar(sport, league, entry):
    ext = event_id_from_ref((entry.get("event") or {}).get("$ref"))
    if not ext:
        return None
    start = entry.get("startDate")
    end = entry.get("endDate")
    return {
        "external_id": ext,
        "sport": sport,
        "league": league,
        "name": entry.get("label"),
        "short_name": None,
        "start_date": start,
        "end_date": end,
        "status": status_from_dates(start, end),
    }


def _refresh_schedule(sport, league, build):
    """Fetch the scoreboard: cache the schedule + the current event's board. A
    full-season `calendar` is used when present; otherwise the scoreboard's events
    become the schedule."""
    sb = espn_get(sport, league, "/scoreboard")
    lg_name = _league_name(sb)
    cal = ((sb.get("leagues") or [{}])[0].get("calendar")) or []
    schedule = []
    for entry in cal:
        if isinstance(entry, dict):
            s = _summary_from_calendar(sport, league, entry)
            if s:
                s["league_name"] = lg_name
                schedule.append(s)
    by_id = {t["external_id"]: t for t in schedule}
    r = get_redis()
    pipe = r.pipeline()
    for ev in sb.get("events") or []:
        board = build(sport, league, ev)
        board["summary"]["league_name"] = lg_name
        ext = board["summary"]["external_id"]
        pipe.setex(_k_board(sport, ext), _ttl(), json.dumps(board))
        if ext in by_id:
            by_id[ext].update(board["summary"])
        else:
            schedule.append(board["summary"])
    pipe.setex(_k_sched(sport, league), _ttl(), json.dumps(schedule))
    pipe.execute()
    return schedule


def _get_schedule(sport, league, build):
    return _cached(_k_sched(sport, league), lambda: _refresh_schedule(sport, league, build)) or []


def _list(sport, leagues, build, status=None):
    out = []
    for lg in leagues:
        out.extend(_get_schedule(sport, lg, build))
    if status:
        out = [t for t in out if t.get("status") == status]
    out.sort(key=lambda t: (t.get("start_date") is None, t.get("start_date") or ""))
    return out


def _locate(sport, leagues, external_id, build):
    for lg in leagues:
        for t in _get_schedule(sport, lg, build):
            if t["external_id"] == external_id:
                return lg, t
    return None


def _board(sport, leagues, external_id, build):
    key = _k_board(sport, external_id)

    def refresh():
        meta = _locate(sport, leagues, external_id, build)
        if meta is None:
            return None
        league, summary = meta
        try:
            dates = yyyymmdd(summary.get("start_date"))
            sb = espn_get(sport, league, "/scoreboard" + (f"?dates={dates}" if dates else ""))
            lg_name = _league_name(sb)
            for ev in sb.get("events") or []:
                if str(ev.get("id")) == external_id:
                    board = build(sport, league, ev)
                    board["summary"]["league_name"] = lg_name
                    get_redis().setex(key, _ttl(), json.dumps(board))
                    return board
        except Exception:
            pass
        return {"summary": summary}  # detail not published / ESPN hiccup

    return _cached(key, refresh)


# ==================================================== FIELD shape (golf, racing)
def _field_build(sport, league, ev):
    comp = _scoring_competition(ev)
    field = []
    winner = None
    for c in comp.get("competitors") or []:
        cd = parse_competitor(c)
        if not cd["id"]:
            continue
        field.append(cd)
        if winner is None and (cd["winner"] or cd["order"] == 1):
            winner = cd["id"]
    field.sort(key=lambda p: (p["order"] is None, p["order"] or 0))
    summary = _base_summary(sport, league, ev)
    summary["field_size"] = len(field)
    summary["winner_id"] = winner if summary["status"] == FINAL else None
    return {"summary": summary, "field": field}


def field_list(sport, leagues, status=None):
    return _list(sport, leagues, _field_build, status)


def field_board(sport, leagues, external_id):
    return _board(sport, leagues, external_id, _field_build)


# ==================================================== ONE-V-ONE shape (mma)
def _1v1_build(sport, league, ev):
    """An event/card -> N two-sided matchups (each competition = one fight)."""
    fights = []
    for comp in ev.get("competitions") or []:
        cs = comp.get("competitors") or []
        if len(cs) < 2:
            continue
        a, b = parse_competitor(cs[0]), parse_competitor(cs[1])
        fstatus = map_status(comp.get("status"))
        winner = a["id"] if a["winner"] else (b["id"] if b["winner"] else None)
        fights.append({
            "id": str(comp.get("id")) if comp.get("id") is not None else None,
            "status": fstatus,
            "a": a,
            "b": b,
            "winner_id": winner if fstatus == FINAL else None,
            "weight_class": (comp.get("type") or {}).get("abbreviation") or (comp.get("type") or {}).get("text"),
        })
    summary = _base_summary(sport, league, ev)
    summary["fight_count"] = len(fights)
    return {"summary": summary, "fights": fights}


def onevone_list(sport, leagues, status=None):
    return _list(sport, leagues, _1v1_build, status)


def onevone_card(sport, leagues, external_id):
    return _board(sport, leagues, external_id, _1v1_build)


# ==================================================== TEAM shape (cricket)
def _team_build(sport, league, ev):
    """Home/away match. ESPN cricket sometimes omits status.type, so a `winner`
    flag also implies the match is final."""
    comp = (ev.get("competitions") or [{}])[0]
    cs = comp.get("competitors") or []
    home = away = None
    winner = None
    for c in cs:
        cd = parse_competitor(c)
        ha = c.get("homeAway")
        if ha == "home":
            home = cd
        elif ha == "away":
            away = cd
        if c.get("winner"):
            winner = cd["id"]
    if home is None and cs:
        home = parse_competitor(cs[0])
    if away is None and len(cs) > 1:
        away = parse_competitor(cs[1])
    summary = _base_summary(sport, league, ev)
    if winner:
        summary["status"] = FINAL
    summary["home"] = home
    summary["away"] = away
    summary["winner_id"] = winner if summary["status"] == FINAL else None
    return {"summary": summary, "sides": [s for s in (home, away) if s]}


def team_list(sport, leagues, status=None):
    return _list(sport, leagues, _team_build, status)


def team_board(sport, leagues, external_id):
    return _board(sport, leagues, external_id, _team_build)
