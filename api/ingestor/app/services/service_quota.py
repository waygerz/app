"""One view of every external data provider's budget: what's been used, what's
left, when it resets, and the pace we're spending it at. Served on
/internal/quota, printed by `flask quota`, and logged hourly from the tick."""
import json
from datetime import datetime

from flask import current_app

from app.extensions import get_redis
from app.services import service_espn as espn
from app.services import service_odds as odds
from app.services import service_sports as sports

_LOG_GATE = "quota:logged"


def _int(value):
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def report() -> dict:
    now = datetime.utcnow()
    cfg = current_app.config
    r = get_redis()

    rem, used = odds._quota()
    days = odds._days_to_reset(now)
    odds_block = {
        "remaining": rem,
        "used": used,
        "reset_day": cfg["ODDS_RESET_DAY"] or _int(r.get(odds._RESET_DAY_KEY)),
        "days_to_reset": round(days, 1) if days else None,
        "daily_budget": round(odds.daily_budget(now), 1),
        "credits_per_call": odds._credits_per_call(),
        "leagues": {},
    }
    weights = {}
    for entry in odds.LEAGUE_REGISTRY:
        key = (entry["sport"], entry["league"])
        if key in odds.ODDS_SPORT_KEYS:
            weights[key] = odds.league_weight(odds._upcoming(entry["league"], now), now)
    total = sum(weights.values())
    for (sport, league), w in weights.items():
        odds_block["leagues"][f"{sport}/{league}"] = {
            "weight": w,
            "interval_min": round(odds.refresh_interval(w, total, now) / 60) if w else None,
        }

    rts_rem = _int(r.get(sports.REMAINING_KEY))
    rts_reset = _int(r.get(sports.RESET_KEY))
    pace = sports._adaptive_min_interval()
    rts_block = {
        "remaining": rts_rem,
        "reset": (
            datetime.utcfromtimestamp(rts_reset / 1000).isoformat() + "Z" if rts_reset else None
        ),
        "live_interval_s": round(pace) if pace else None,
        "routine_interval_s": (
            round(pace * cfg["SPORTS_LOW_PRIORITY_FACTOR"]) if pace else None
        ),
    }

    return {
        "at": now.isoformat() + "Z",
        "espn": {
            "requests_today": espn.requests_today(),
            "backoff": bool(r.get(espn._BACKOFF_KEY)),
        },
        "odds_api": odds_block,
        "rts": rts_block,
    }


def log_hourly():
    """One line per hour with the whole report, plus a warning when a metered
    provider is at its floor or ESPN has paused us."""
    r = get_redis()
    if not r.set(_LOG_GATE, "1", nx=True, ex=3600):
        return
    rep = report()
    current_app.logger.info("quota %s", json.dumps(rep, separators=(",", ":")))
    cfg = current_app.config
    problems = []
    if rep["espn"]["backoff"]:
        problems.append("espn paused after 429/5xx")
    if rep["odds_api"]["remaining"] is not None and rep["odds_api"]["remaining"] <= cfg["ODDS_QUOTA_FLOOR"]:
        problems.append("odds api at quota floor")
    if rep["rts"]["remaining"] is not None and rep["rts"]["remaining"] <= cfg["SPORTS_QUOTA_FLOOR"]:
        problems.append("rts at quota floor")
    if problems:
        current_app.logger.warning("quota problems: %s", "; ".join(problems))
