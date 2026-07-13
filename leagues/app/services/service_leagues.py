"""Leagues business logic: CRUD, membership, picks, standings, grading, rollover."""
import secrets
from datetime import datetime, timedelta

import requests
from flask import current_app, request

from app.extensions import db
from app.models.league import (
    ACTIVE as L_ACTIVE,
    ARCHIVED,
    DRAFT,
    LEAGUE_TYPES,
    PERIOD_TYPES,
    PICKEM,
    WEEKLY,
    League,
)
from app.models.member import (
    ACTIVE, COMMISSIONER, LEFT, MEMBER, REMOVED, LeagueMember,
)
from app.models.period import FINAL, OPEN, LeaguePeriod
from app.models import period as period_model
from app.models.pick import HOME, AWAY, PICK_SIDES, Pick
from app.models.sport import LeagueSport
from app.models import feed as feed_model
from app.models.feed import ACTIVITY, LeagueFeed
from app.models.feed_read import LeagueFeedRead
from app.models.invite import (
    ACCEPTED as INV_ACCEPTED, PENDING as INV_PENDING, LeagueInvite,
)

_WEEKDAYS = {
    "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
    "friday": 4, "saturday": 5, "sunday": 6,
}

# No ambiguous characters (no I/O/0/1).
_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


# ---- Cross-service HTTP clients -------------------------------------------
def _headers():
    return {"X-Internal-Token": current_app.config["INTERNAL_TOKEN"]}


def wallet_account_balances(account) -> dict:
    r = requests.post(
        f"{current_app.config['WALLET_URL']}/internal/account-balances",
        json={"account": account}, headers=_headers(), timeout=10,
    )
    r.raise_for_status()
    return r.json().get("balances", {})


def contests_league_record(league_id) -> dict:
    try:
        r = requests.post(
            f"{current_app.config['CONTESTS_URL']}/internal/league-record",
            json={"league_id": league_id}, headers=_headers(), timeout=10,
        )
        r.raise_for_status()
        return r.json().get("records", {})
    except Exception:  # noqa: BLE001
        return {}


def resolve_users(ids) -> dict:
    return {uid: u.get("display_name") for uid, u in resolve_users_full(ids).items()}


def resolve_users_full(ids) -> dict:
    """id -> full user dict ({display_name, avatar_key, ...}) from auth."""
    ids = list({str(i) for i in ids if i})
    if not ids:
        return {}
    r = requests.post(
        f"{current_app.config['AUTH_URL']}/internal/users",
        json={"ids": ids},
        headers=_headers(),
        timeout=10,
    )
    r.raise_for_status()
    return {u["id"]: u for u in r.json().get("users", [])}


def ingestor_warm_cache(sport_league_ids) -> dict:
    ids = [str(i) for i in sport_league_ids if i]
    if not ids:
        return {}
    r = requests.post(
        f"{current_app.config['INGESTOR_URL']}/internal/catalog/sync",
        json={"sport_league_ids": ids},
        headers=_headers(),
        timeout=30,
    )
    r.raise_for_status()
    return r.json()


def get_event(external_id):
    r = requests.get(
        f"{current_app.config['INGESTOR_URL']}/v1/platform/ingestor/events/{external_id}",
        timeout=10,
    )
    if r.status_code == 404:
        return None
    r.raise_for_status()
    return r.json().get("event")


def wallet_grant(account, user_id, amount_cents, ref) -> dict:
    r = requests.post(
        f"{current_app.config['WALLET_URL']}/internal/grant",
        json={"account": account, "user_id": user_id, "amount_cents": amount_cents, "ref": ref},
        headers=_headers(),
        timeout=10,
    )
    r.raise_for_status()
    return r.json()


def wallet_balances(user_id, accounts) -> dict:
    accounts = [a for a in accounts if a]
    if not accounts:
        return {}
    r = requests.post(
        f"{current_app.config['WALLET_URL']}/internal/balances",
        json={"user_id": user_id, "accounts": accounts},
        headers=_headers(),
        timeout=10,
    )
    r.raise_for_status()
    return r.json().get("balances", {})


# ---- Join codes -----------------------------------------------------------
def _random_code() -> str:
    return "WAYG-" + "".join(secrets.choice(_CODE_ALPHABET) for _ in range(4))


def generate_join_code() -> str:
    for _ in range(10):
        code = _random_code()
        if not League.query.filter_by(join_code=code).first():
            return code
    return _random_code() + secrets.choice(_CODE_ALPHABET)


# ---- Shared helpers -------------------------------------------------------
def current_period(league_id):
    p = LeaguePeriod.query.filter_by(league_id=league_id, status=period_model.OPEN).first()
    if p:
        return p
    return (
        LeaguePeriod.query.filter_by(league_id=league_id)
        .order_by(LeaguePeriod.index.desc())
        .first()
    )


def add_feed(league_id, kind, *, event_type=None, author_id=None, title=None,
             body=None, link_url=None, link_label=None, meta=None, dedup_key=None):
    item = LeagueFeed(
        league_id=league_id, kind=kind, event_type=event_type, author_id=author_id,
        title=title, body=body, link_url=link_url, link_label=link_label,
        meta=meta, dedup_key=dedup_key,
    )
    db.session.add(item)
    return item


def warm_event_cache(league_id):
    ids = [s.sport_league_id for s in LeagueSport.query.filter_by(league_id=league_id).all()]
    if not ids:
        return
    try:
        ingestor_warm_cache(ids)
    except Exception as exc:  # noqa: BLE001
        print(f"[leagues] cache warm failed for {league_id}: {exc}", flush=True)


def grant_starting_balance(league, user_id):
    if not (league.is_money and league.starting_balance_cents):
        return
    try:
        wallet_grant(
            league.account, user_id, league.starting_balance_cents,
            f"league_grant:{league.id}",
        )
    except Exception as exc:  # noqa: BLE001
        print(f"[leagues] grant failed for {user_id} in {league.id}: {exc}", flush=True)


# ---- Pick'em grading ------------------------------------------------------
def grade_period(period) -> int:
    picks = Pick.query.filter_by(period_id=period.id, correct=None).all()
    graded = 0
    for pick in picks:
        try:
            event = get_event(pick.event_id)
            if not event:
                continue
            if event.get("status") != period_model.FINAL:
                continue
            winner = event.get("winner_side")
            if winner not in (HOME, AWAY):
                continue
            pick.correct = (pick.pick_side == winner)
            db.session.commit()
            graded += 1
        except Exception as exc:  # noqa: BLE001
            db.session.rollback()
            print(f"[grading] failed to grade pick {pick.id}: {exc}", flush=True)
    return graded


def grade_open_periods() -> int:
    periods = LeaguePeriod.query.filter(
        LeaguePeriod.status.in_([period_model.OPEN, period_model.CLOSED])
    ).all()
    total = 0
    for period in periods:
        try:
            total += grade_period(period)
        except Exception as exc:  # noqa: BLE001
            db.session.rollback()
            print(f"[grading] failed to grade period {period.id}: {exc}", flush=True)
    return total


# ---- Period rollover ------------------------------------------------------
def _rollover_feed(league_id, event_type, title, body, dedup_key=None):
    db.session.add(LeagueFeed(
        league_id=league_id, kind=ACTIVITY, event_type=event_type,
        title=title, body=body, dedup_key=dedup_key,
    ))


def rollover_periods() -> int:
    now = datetime.utcnow()
    rolled = 0
    for p in LeaguePeriod.query.filter_by(status=OPEN).all():
        if not p.ends_at or p.ends_at > now:
            continue
        league = db.session.get(League, p.league_id)
        if not league:
            continue
        p.status = FINAL
        _rollover_feed(league.id, "period_final", f"{p.label} is final",
                       "Standings are locked for this period.", dedup_key=f"period_final:{p.id}")
        if league.period_type == WEEKLY and league.status == L_ACTIVE:
            start = p.ends_at
            nxt = LeaguePeriod(
                league_id=league.id, index=p.index + 1, label=f"Week {p.index + 1}",
                starts_at=start, ends_at=start + timedelta(days=7), status=OPEN,
            )
            db.session.add(nxt)
            _rollover_feed(league.id, "period_opened", f"{nxt.label} is open",
                           "Betting is now open.", dedup_key=f"period_opened:{league.id}:{nxt.index}")
        db.session.commit()
        rolled += 1
    return rolled


# ---- League handlers ------------------------------------------------------
def _membership(league_id, user_id):
    return LeagueMember.query.filter_by(
        league_id=league_id, user_id=user_id, status=ACTIVE
    ).first()


def _feed_since(league_id, user_id, joined_at):
    row = LeagueFeedRead.query.filter_by(league_id=league_id, user_id=user_id).first()
    return row.last_read_at if row else joined_at


def _unread_feed_count(league_id, user_id, joined_at) -> int:
    since = _feed_since(league_id, user_id, joined_at)
    return LeagueFeed.query.filter(
        LeagueFeed.league_id == league_id,
        LeagueFeed.created_at > since,
    ).count()


def _mark_feed_read(league_id, user_id):
    now = datetime.utcnow()
    row = LeagueFeedRead.query.filter_by(league_id=league_id, user_id=user_id).first()
    if row:
        row.last_read_at = now
    else:
        db.session.add(LeagueFeedRead(league_id=league_id, user_id=user_id, last_read_at=now))
    db.session.commit()


def _parse_dt(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).replace(tzinfo=None)
    except (ValueError, AttributeError):
        return None


def _detail(league, me):
    members = LeagueMember.query.filter_by(league_id=league.id, status=ACTIVE).all()
    users = resolve_users_full([m.user_id for m in members])
    sports = LeagueSport.query.filter_by(league_id=league.id).all()
    period = current_period(league.id)

    my_balance = None
    if league.is_money:
        bal = wallet_balances(me, [league.account])
        my_balance = bal.get(league.account, 0)

    d = league.to_dict()
    d["members"] = [
        {
            **m.to_dict(),
            "display_name": (users.get(m.user_id) or {}).get("display_name") or f"User {m.user_id[:8]}",
            "avatar_key": (users.get(m.user_id) or {}).get("avatar_key"),
        }
        for m in members
    ]
    d["sports"] = [{"sport_league_id": s.sport_league_id, "name": s.name} for s in sports]
    d["current_period"] = period.to_dict() if period else None
    d["my_balance_cents"] = my_balance
    d["my_role"] = next((m.role for m in members if m.user_id == me), MEMBER)
    return d


def _join(league, user_id):
    existing = LeagueMember.query.filter_by(league_id=league.id, user_id=user_id).first()
    if existing:
        created = existing.status != ACTIVE
        existing.status = ACTIVE
        member = existing
    else:
        member = LeagueMember(league_id=league.id, user_id=user_id, role=MEMBER, status=ACTIVE)
        db.session.add(member)
        created = True
    if created:
        name = resolve_users([user_id]).get(user_id, "A new member")
        add_feed(league.id, feed_model.ACTIVITY, event_type="member_joined",
                 title=f"{name} joined", body=f"{name} joined the league.",
                 meta={"user_id": user_id})
    db.session.commit()
    grant_starting_balance(league, user_id)
    return member, created


def create_league(me, data):
    name = (data.get("name") or "").strip()
    league_type = data.get("league_type")
    period_type = data.get("period_type") or "season"
    sports = data.get("sports") or []

    if not name:
        return {"error": "name is required"}, 400
    if league_type not in LEAGUE_TYPES:
        return {"error": f"league_type must be one of {LEAGUE_TYPES}"}, 400
    if period_type not in PERIOD_TYPES:
        return {"error": f"period_type must be one of {PERIOD_TYPES}"}, 400
    if not sports:
        return {"error": "select at least one sport"}, 400

    starting = data.get("starting_balance_cents")
    if league_type == PICKEM:
        starting = None
    else:
        if not starting or int(starting) <= 0:
            return {"error": "starting_balance_cents must be > 0 for money leagues"}, 400
        starting = int(starting)

    league = League(
        name=name,
        logo_url=(data.get("logo_url") or None),
        description=(data.get("description") or None),
        commissioner_id=me,
        league_type=league_type,
        status=DRAFT,
        join_code=generate_join_code(),
        period_type=period_type,
        starting_balance_cents=starting,
        min_wager_cents=data.get("min_wager_cents"),
        max_wager_cents=data.get("max_wager_cents"),
        rules=data.get("rules") or {},
        starts_at=_parse_dt(data.get("starts_at")),
        ends_at=_parse_dt(data.get("ends_at")),
    )
    db.session.add(league)
    db.session.flush()

    db.session.add(LeagueMember(
        league_id=league.id, user_id=me, role=COMMISSIONER, status=ACTIVE
    ))
    seen = set()
    for item in sports:
        if isinstance(item, dict):
            sid, nm = str(item.get("sport_league_id") or ""), item.get("name")
        else:
            sid, nm = str(item), None
        if not sid or sid in seen:
            continue
        seen.add(sid)
        db.session.add(LeagueSport(league_id=league.id, sport_league_id=sid, name=nm))

    add_feed(league.id, feed_model.ACTIVITY, event_type="league_created",
             title=f"{name} created", body="The league was created.")
    db.session.commit()
    grant_starting_balance(league, me)
    warm_event_cache(league.id)
    return {"league": _detail(league, me)}, 201


def my_leagues(me):
    rows = (
        db.session.query(League, LeagueMember)
        .join(LeagueMember, LeagueMember.league_id == League.id)
        .filter(
            LeagueMember.user_id == me,
            LeagueMember.status == ACTIVE,
            League.status != ARCHIVED,
        )
        .order_by(League.created_at.desc())
        .all()
    )
    money_accounts = [lg.account for lg, _ in rows if lg.is_money]
    balances = wallet_balances(me, money_accounts) if money_accounts else {}

    cards = []
    for lg, mem in rows:
        period = current_period(lg.id)
        member_count = LeagueMember.query.filter_by(league_id=lg.id, status=ACTIVE).count()
        cards.append({
            "id": lg.id,
            "name": lg.name,
            "logo_url": lg.logo_url,
            "league_type": lg.league_type,
            "status": lg.status,
            "member_count": member_count,
            "my_balance_cents": balances.get(lg.account, 0) if lg.is_money else None,
            "current_period": period.to_dict() if period else None,
            "unread_feed_count": _unread_feed_count(lg.id, me, mem.joined_at),
        })
    return {"leagues": cards}, 200


def preview(me=None):
    code = (request.args.get("code") or "").strip().upper()
    token = request.args.get("invite_token")
    league = None
    if code:
        league = League.query.filter_by(join_code=code).first()
    elif token:
        league = League.query.filter_by(invite_token=token).first()
    if not league:
        return {"error": "invite not found"}, 404
    commissioner = resolve_users([league.commissioner_id]).get(league.commissioner_id)
    member_count = LeagueMember.query.filter_by(league_id=league.id, status=ACTIVE).count()
    sports = [
        {"sport_league_id": s.sport_league_id, "name": s.name}
        for s in LeagueSport.query.filter_by(league_id=league.id).all()
    ]
    viewer_membership = None
    if me:
        row = LeagueMember.query.filter_by(league_id=league.id, user_id=me).first()
        if row and row.status == ACTIVE:
            viewer_membership = "member"
        elif row and row.status == LEFT:
            viewer_membership = "left"
        else:
            viewer_membership = "none"
    return {"preview": {
        "id": league.id,
        "name": league.name,
        "logo_url": league.logo_url,
        "description": league.description,
        "league_type": league.league_type,
        "status": league.status,
        "period_type": league.period_type,
        "starting_balance_cents": league.starting_balance_cents,
        "min_wager_cents": league.min_wager_cents,
        "max_wager_cents": league.max_wager_cents,
        "rules": league.rules or {},
        "member_count": member_count,
        "sports": sports,
        "commissioner_name": commissioner,
        "join_code": league.join_code,
        "viewer_membership": viewer_membership,
    }}, 200


def get_league(league_id, me):
    league_id = str(league_id)
    league = db.session.get(League, league_id)
    if not league or not _membership(league_id, me):
        return {"error": "league not found"}, 404
    return {"league": _detail(league, me)}, 200


def edit_league(league_id, me, data):
    league_id = str(league_id)
    league = db.session.get(League, league_id)
    if not league or not _membership(league_id, me):
        return {"error": "league not found"}, 404
    if league.commissioner_id != me:
        return {"error": "only the commissioner can edit the league"}, 403

    for field in ("name", "logo_url", "description", "min_wager_cents", "max_wager_cents", "rules"):
        if field in data:
            setattr(league, field, data[field])

    if "sports" in data:
        sports = data.get("sports") or []
        if not sports:
            return {"error": "select at least one sport"}, 400
        LeagueSport.query.filter_by(league_id=league_id).delete()
        seen = set()
        for item in sports:
            if isinstance(item, dict):
                sid, nm = str(item.get("sport_league_id") or ""), item.get("name")
            else:
                sid, nm = str(item), None
            if not sid or sid in seen:
                continue
            seen.add(sid)
            db.session.add(LeagueSport(league_id=league_id, sport_league_id=sid, name=nm))

    db.session.commit()
    if "sports" in data:
        warm_event_cache(league_id)
    return {"league": _detail(league, me)}, 200


def activate_league(league_id, me):
    league_id = str(league_id)
    league = db.session.get(League, league_id)
    if not league or not _membership(league_id, me):
        return {"error": "league not found"}, 404
    if league.commissioner_id != me:
        return {"error": "only the commissioner can activate the league"}, 403
    if league.status != DRAFT:
        return {"error": "league is already active"}, 400

    now = datetime.utcnow()
    rules = league.rules or {}
    if league.period_type == "weekly":
        wd = _WEEKDAYS.get(str(rules.get("week_starts_on", "monday")).lower(), 0)
        anchor = league.starts_at or now
        back = (anchor.weekday() - wd) % 7
        start = (anchor - timedelta(days=back)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        period = LeaguePeriod(
            league_id=league.id, index=1, label="Week 1",
            starts_at=start, ends_at=start + timedelta(days=7),
            status=period_model.OPEN,
        )
    else:
        year = rules.get("season_year")
        period = LeaguePeriod(
            league_id=league.id, index=1,
            label=f"Season {year}" if year else "Season",
            starts_at=league.starts_at or now, ends_at=league.ends_at,
            status=period_model.OPEN,
        )
    league.status = L_ACTIVE
    db.session.add(period)
    add_feed(league.id, feed_model.ACTIVITY, event_type="period_opened",
             title=f"{period.label} is open", body="Betting is now open.")
    db.session.commit()
    warm_event_cache(league.id)
    return {"league": _detail(league, me)}, 200


def submit_picks(league_id, period_id, me, data):
    league_id, period_id = str(league_id), str(period_id)
    league = db.session.get(League, league_id)
    if not league or not _membership(league_id, me):
        return {"error": "league not found"}, 404
    if league.league_type != PICKEM:
        return {"error": "picks are only for pickem leagues"}, 400

    period = db.session.get(LeaguePeriod, period_id)
    if not period or period.league_id != league_id:
        return {"error": "period not found"}, 404
    if period.status != period_model.OPEN:
        return {"error": "picks are locked"}, 400

    incoming = data.get("picks") or []
    cleaned = []
    for p in incoming:
        event_id = str((p or {}).get("event_id") or "").strip()
        side = (p or {}).get("side")
        if not event_id:
            return {"error": "each pick needs an event_id"}, 400
        if side not in PICK_SIDES:
            return {"error": f"side must be one of {PICK_SIDES}"}, 400
        cleaned.append((event_id, side))

    existing = {
        row.event_id: row
        for row in Pick.query.filter_by(period_id=period_id, user_id=me).all()
    }
    for event_id, side in cleaned:
        row = existing.get(event_id)
        if row:
            row.pick_side = side
        else:
            row = Pick(
                league_id=league_id, period_id=period_id, user_id=me,
                event_id=event_id, pick_side=side,
            )
            db.session.add(row)
            existing[event_id] = row
    db.session.commit()

    picks = (
        Pick.query.filter_by(period_id=period_id, user_id=me)
        .order_by(Pick.created_at.asc())
        .all()
    )
    return {"picks": [p.to_dict() for p in picks]}, 200


def get_picks(league_id, period_id, me):
    league_id, period_id = str(league_id), str(period_id)
    league = db.session.get(League, league_id)
    if not league or not _membership(league_id, me):
        return {"error": "league not found"}, 404
    period = db.session.get(LeaguePeriod, period_id)
    if not period or period.league_id != league_id:
        return {"error": "period not found"}, 404

    picks = (
        Pick.query.filter_by(period_id=period_id, user_id=me)
        .order_by(Pick.created_at.asc())
        .all()
    )
    events = {}
    for p in picks:
        if p.event_id in events:
            continue
        try:
            events[p.event_id] = get_event(p.event_id)
        except Exception:  # noqa: BLE001
            events[p.event_id] = None
    out = []
    for p in picks:
        d = p.to_dict()
        d["event"] = events.get(p.event_id)
        out.append(d)
    return {"picks": out}, 200


def standings(league_id, me):
    league_id = str(league_id)
    league = db.session.get(League, league_id)
    if not league or not _membership(league_id, me):
        return {"error": "league not found"}, 404

    period = current_period(league_id)
    members = LeagueMember.query.filter_by(league_id=league_id, status=ACTIVE).all()

    if league.league_type != PICKEM:
        balances = wallet_account_balances(league.account)
        records = contests_league_record(league_id)
        users = resolve_users_full([m.user_id for m in members])
        start = league.starting_balance_cents or 0
        rows = []
        for m in members:
            bal = balances.get(m.user_id, 0)
            rec = records.get(m.user_id, {})
            u = users.get(m.user_id) or {}
            rows.append({
                "user_id": m.user_id,
                "display_name": u.get("display_name") or f"User {m.user_id[:8]}",
                "avatar_key": u.get("avatar_key"),
                "balance_cents": bal,
                "net_cents": bal - start,
                "wins": rec.get("wins", 0),
                "losses": rec.get("losses", 0),
                "pushes": rec.get("pushes", 0),
            })
        rows.sort(key=lambda r: r["balance_cents"], reverse=True)
        return {"standings": rows, "period_id": period.id if period else None}, 200

    picks = Pick.query.filter_by(league_id=league_id).all()
    wins = {m.user_id: 0 for m in members}
    losses = {m.user_id: 0 for m in members}
    for p in picks:
        if p.user_id not in wins:
            continue
        if p.correct is True:
            wins[p.user_id] += 1
        elif p.correct is False:
            losses[p.user_id] += 1

    users = resolve_users_full([m.user_id for m in members])
    rows = [
        {
            "user_id": m.user_id,
            "display_name": (users.get(m.user_id) or {}).get("display_name") or f"User {m.user_id[:8]}",
            "avatar_key": (users.get(m.user_id) or {}).get("avatar_key"),
            "wins": wins[m.user_id],
            "losses": losses[m.user_id],
            "pushes": 0,
        }
        for m in members
    ]
    rows.sort(key=lambda r: r["wins"], reverse=True)
    return {"standings": rows, "period_id": period.id if period else None}, 200


def get_feed(league_id, me):
    league_id = str(league_id)
    if not _membership(league_id, me):
        return {"error": "league not found"}, 404
    _mark_feed_read(league_id, me)
    limit = min(int(request.args.get("limit", 50)), 200)
    items = (
        LeagueFeed.query.filter_by(league_id=league_id)
        .order_by(LeagueFeed.created_at.desc())
        .limit(limit)
        .all()
    )
    author_ids = [i.author_id for i in items if i.author_id]
    names = resolve_users(author_ids) if author_ids else {}
    out = []
    for i in items:
        d = i.to_dict()
        d["author_name"] = names.get(i.author_id) if i.author_id else None
        out.append(d)
    return {"feed": out}, 200


def post_feed(league_id, me, data):
    league_id = str(league_id)
    league = db.session.get(League, league_id)
    if not league or not _membership(league_id, me):
        return {"error": "league not found"}, 404
    if league.commissioner_id != me:
        return {"error": "only the commissioner can post updates"}, 403
    body = (data.get("body") or "").strip()
    title = (data.get("title") or "").strip() or None
    if not body and not title:
        return {"error": "title or body is required"}, 400
    item = add_feed(
        league_id, feed_model.ANNOUNCEMENT, author_id=me, title=title, body=body,
        link_url=(data.get("link_url") or None), link_label=(data.get("link_label") or None),
    )
    db.session.commit()
    return {"item": item.to_dict()}, 201


def join_by_code(me, data):
    code = (data.get("code") or "").strip().upper()
    token = data.get("invite_token")
    league = None
    if code:
        league = League.query.filter_by(join_code=code).first()
    elif token:
        league = League.query.filter_by(invite_token=str(token)).first()
    if not league:
        return {"error": "no league with that code"}, 404
    _join(league, me)
    return {"league": _detail(league, me)}, 201


def accept_invite(league_id, me):
    league_id = str(league_id)
    league = db.session.get(League, league_id)
    if not league:
        return {"error": "league not found"}, 404
    inv = LeagueInvite.query.filter_by(
        league_id=league_id, invitee_id=me, status=INV_PENDING
    ).first()
    if inv:
        inv.status = INV_ACCEPTED
    _join(league, me)
    return {"league": _detail(league, me)}, 201


def invite_friends(league_id, me, data):
    league_id = str(league_id)
    league = db.session.get(League, league_id)
    if not league or not _membership(league_id, me):
        return {"error": "league not found"}, 404
    if league.commissioner_id != me:
        return {"error": "only the commissioner can invite"}, 403
    invited = []
    for uid in data.get("invitee_ids") or []:
        uid = str(uid)
        if _membership(league_id, uid):
            continue
        if LeagueInvite.query.filter_by(
            league_id=league_id, invitee_id=uid, status=INV_PENDING
        ).first():
            continue
        db.session.add(LeagueInvite(
            league_id=league_id, inviter_id=me, invitee_id=uid, status=INV_PENDING
        ))
        invited.append(uid)
    db.session.commit()
    return {"invited": invited}, 201


def my_invites(me):
    invs = LeagueInvite.query.filter_by(invitee_id=me, status=INV_PENDING).all()
    if not invs:
        return {"invites": []}, 200
    leagues = {
        lg.id: lg
        for lg in League.query.filter(League.id.in_([i.league_id for i in invs])).all()
    }
    names = resolve_users([i.inviter_id for i in invs])
    out = []
    for i in invs:
        lg = leagues.get(i.league_id)
        if not lg:
            continue
        out.append({
            "invite_id": i.id,
            "league_id": lg.id,
            "league_name": lg.name,
            "league_logo": lg.logo_url,
            "league_type": lg.league_type,
            "inviter_name": names.get(i.inviter_id),
        })
    return {"invites": out}, 200


def leave_league(league_id, me):
    league_id = str(league_id)
    league = db.session.get(League, league_id)
    m = _membership(league_id, me)
    if not league or not m:
        return {"error": "league not found"}, 404
    if league.commissioner_id == me:
        return {"error": "the commissioner can't leave; transfer or archive instead"}, 400
    m.status = LEFT
    db.session.commit()
    return {"ok": True}, 200


def remove_member(league_id, uid, me):
    league_id, uid = str(league_id), str(uid)
    league = db.session.get(League, league_id)
    if not league or not _membership(league_id, me):
        return {"error": "league not found"}, 404
    if league.commissioner_id != me:
        return {"error": "only the commissioner can remove members"}, 403
    if uid == me:
        return {"error": "the commissioner can't remove themselves"}, 400
    m = _membership(league_id, uid)
    if not m:
        return {"error": "member not found"}, 404
    m.status = REMOVED
    db.session.commit()
    return {"ok": True}, 200


def archive_league(league_id, me):
    league_id = str(league_id)
    league = db.session.get(League, league_id)
    if not league or not _membership(league_id, me):
        return {"error": "league not found"}, 404
    if league.commissioner_id != me:
        return {"error": "only the commissioner can archive the league"}, 403
    league.status = ARCHIVED
    db.session.commit()
    return {"ok": True}, 200


def advance_period(league_id, me):
    league_id = str(league_id)
    league = db.session.get(League, league_id)
    if not league or not _membership(league_id, me):
        return {"error": "league not found"}, 404
    if league.commissioner_id != me:
        return {"error": "only the commissioner can advance the period"}, 403
    if league.status != L_ACTIVE:
        return {"error": "league isn't active"}, 400
    period = (
        LeaguePeriod.query.filter_by(league_id=league_id, status=period_model.OPEN)
        .order_by(LeaguePeriod.index.desc()).first()
    )
    if not period:
        return {"error": "no open period to advance"}, 400

    period.status = period_model.FINAL
    add_feed(league_id, feed_model.ACTIVITY, event_type="period_final",
             title=f"{period.label} is final", body="Standings are locked for this period.")
    if league.period_type == "weekly":
        start = period.ends_at or datetime.utcnow()
        nxt = LeaguePeriod(
            league_id=league_id, index=period.index + 1, label=f"Week {period.index + 1}",
            starts_at=start, ends_at=start + timedelta(days=7), status=period_model.OPEN,
        )
        db.session.add(nxt)
        add_feed(league_id, feed_model.ACTIVITY, event_type="period_opened",
                 title=f"{nxt.label} is open", body="Betting is now open.")
    db.session.commit()
    return {"league": _detail(league, me)}, 200