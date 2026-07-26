"""Weekly period boundaries land at 4 AM in the league's timezone, DST-aware.

Pure-function tests (no DB/app context): the boundary math is where the tricky
DST behaviour lives, so it's worth pinning down directly.
"""
from datetime import datetime
from zoneinfo import ZoneInfo

from app.services import service_leagues as svc

ET = ZoneInfo("America/New_York")
LA = ZoneInfo("America/Los_Angeles")


def _utc(y, m, d, h=12):
    return datetime(y, m, d, h, 0, 0)


def test_week_start_is_4am_local_on_the_weekday():
    # Thursday 2026-07-23 (EDT, UTC-4). Ask for the Tuesday boundary.
    start = svc._week_start(_utc(2026, 7, 23), weekday=1, tz=ET)  # 1 = Tuesday
    # Tuesday 2026-07-21 04:00 EDT == 08:00 UTC.
    assert start == datetime(2026, 7, 21, 8, 0)


def test_week_start_rolls_back_when_boundary_not_yet_reached():
    # Tuesday 2026-07-21 at 02:00 ET is *before* that day's 4 AM boundary, so the
    # current week must have started the previous Tuesday.
    anchor = datetime(2026, 7, 21, 6, 0)  # 06:00 UTC == 02:00 EDT Tuesday
    start = svc._week_start(anchor, weekday=1, tz=ET)
    assert start == datetime(2026, 7, 14, 8, 0)  # previous Tuesday 4 AM EDT


def test_add_week_preserves_4am_local_across_spring_forward():
    # Sunday 2026-03-01 04:00 EST (UTC-5) == 09:00 UTC. DST starts 2026-03-08.
    start = datetime(2026, 3, 1, 9, 0)
    nxt = svc._add_week(start, ET)
    # Next Sunday 04:00 is now EDT (UTC-4) == 08:00 UTC — one absolute hour less,
    # but still 4 AM local.
    assert nxt == datetime(2026, 3, 8, 8, 0)
    assert nxt.astimezone(ZoneInfo("UTC")).astimezone(ET).hour == 4


def test_add_week_is_a_plain_week_when_no_dst_change():
    start = datetime(2026, 7, 21, 8, 0)  # Tue 4 AM EDT
    assert svc._add_week(start, ET) == datetime(2026, 7, 28, 8, 0)


def test_timezone_affects_the_boundary():
    # Same weekday, Pacific pushes the UTC boundary 3 hours later than Eastern.
    et = svc._week_start(_utc(2026, 7, 23), weekday=1, tz=ET)
    la = svc._week_start(_utc(2026, 7, 23), weekday=1, tz=LA)
    assert la - et == (datetime(2026, 7, 21, 11) - datetime(2026, 7, 21, 8))  # 3h


def test_valid_timezone():
    assert svc.valid_timezone("America/New_York")
    assert svc.valid_timezone("Europe/London")
    assert not svc.valid_timezone("Mars/Olympus_Mons")
    assert not svc.valid_timezone("")
    assert not svc.valid_timezone(None)


def test_league_zone_falls_back_to_eastern_on_junk():
    class L:
        timezone = "not-a-zone"
    assert svc._league_zone(L()) == ET

    class L2:
        timezone = None
    assert svc._league_zone(L2()) == ET
