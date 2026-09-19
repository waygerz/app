"""Which sports are switched on.

The ESPN-only sports (golf, racing, MMA, cricket) each have one switch: their
Config allowlist (GOLF_TOURS, RACING_TOURS, MMA_TOURS, CRICKET_LEAGUES). Empty
means the sport is off, and an off sport is hidden everywhere — not ingested,
not in the catalog, and none of its events listed or scheduled. Single-event
lookups still return its events (marked `available: false`) so bets placed
before it was switched off can settle, but no new bet can be placed on them.
"""
from flask import current_app

from app.extensions import db
from app.models.sport_league import SportLeague

# sport slug -> the Config allowlist that switches it on.
SWITCHES = {
    "golf": "GOLF_TOURS",
    "racing": "RACING_TOURS",
    "mma": "MMA_TOURS",
    "cricket": "CRICKET_LEAGUES",
}


def disabled_sports() -> set[str]:
    return {sport for sport, key in SWITCHES.items() if not current_app.config.get(key)}


def is_enabled(sport: str | None) -> bool:
    return sport not in disabled_sports()


def disabled_sport_league_ids() -> list[str]:
    """Catalog ids (what leagues store) of every sport-league that's switched off."""
    off = disabled_sports()
    if not off:
        return []
    rows = db.session.query(SportLeague.id).filter(SportLeague.sport.in_(off)).all()
    return sorted(str(r[0]) for r in rows)
