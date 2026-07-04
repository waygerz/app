"""Parimutuel pools: many league members stake on one event; winners split the pot.

Every pool belongs to a league; money moves through the wallet on that league's
account (``league:{league_id}``). At settlement the whole pot is divided among the
winning side in proportion to each member's stake (integer-cent floor division).
"""
from datetime import datetime

import requests
from flask import current_app, request

from app.extensions import db
from app.models.pool import (
    CANCELLED,
    OPEN,
    REFUNDED,
    SETTLED,
    Pool,
    PoolStake,
)


class InsufficientFunds(Exception):
    pass


def _itoken():
    return {"X-Internal-Token": current_app.config["INTERNAL_TOKEN"]}


def get_event(external_id):
    base = current_app.config["INGESTOR_URL"]
    resp = requests.get(f"{base}/v1/data/ingestor/events/{external_id}", timeout=10)
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    return resp.json().get("event")


def refresh_event(external_id):
    base = current_app.config["INGESTOR_URL"]
    resp = requests.post(
        f"{base}/internal/events/{external_id}/refresh",
        headers=_itoken(),
        timeout=20,
    )
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    return resp.json().get("event")


def league_context(league_id):
    base = current_app.config["LEAGUES_URL"]
    resp = requests.post(
        f"{base}/internal/league-context",
        json={"league_id": league_id},
        headers=_itoken(),
        timeout=10,
    )
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    return resp.json().get("context")


def post_league_activity(league_id, payload):
    base = current_app.config["LEAGUES_URL"]
    try:
        requests.post(
            f"{base}/internal/leagues/{league_id}/feed",
            json=payload, headers=_itoken(), timeout=10,
        )
    except Exception:  # noqa: BLE001
        pass


def _wallet_op(op, account, user_id, amount_cents, ref):
    base = current_app.config["WALLET_URL"]
    resp = requests.post(
        f"{base}/internal/{op}",
        json={"account": account, "user_id": user_id, "amount_cents": amount_cents, "ref": ref},
        headers=_itoken(),
        timeout=10,
    )
    if resp.status_code == 402:
        raise InsufficientFunds()
    resp.raise_for_status()
    return resp.json()


def hold(account, user_id, amount_cents, ref):
    return _wallet_op("hold", account, user_id, amount_cents, ref)


def payout(account, user_id, amount_cents, ref):
    return _wallet_op("payout", account, user_id, amount_cents, ref)


def refund(account, user_id, amount_cents, ref):
    return _wallet_op("refund", account, user_id, amount_cents, ref)


class PoolError(Exception):
    pass


def _stake_ref(stake_id):
    return f"pool_stake:{stake_id}"


def _payout_ref(stake_id):
    return f"pool_payout:{stake_id}"


def _account(league_id):
    return f"league:{league_id}"


def _validate_context(league_id, amount):
    """Resolve + check the league context for a new stake. Returns the context."""
    ctx = league_context(league_id)
    if not ctx:
        raise PoolError("league not found")
    if ctx.get("league_type") != "pool":
        raise PoolError("this league isn't a pool league")
    if ctx.get("status") != "active":
        raise PoolError("this league isn't active yet")
    if ctx.get("period_status") != "open":
        raise PoolError("betting is closed for this period")
    if amount <= 0:
        raise PoolError("amount must be positive")
    minw, maxw = ctx.get("min_wager_cents"), ctx.get("max_wager_cents")
    if minw and amount < minw:
        raise PoolError("amount is below the league minimum")
    if maxw and amount > maxw:
        raise PoolError("amount is above the league maximum")
    return ctx


def _get_or_create_pool(league_id, period_id, event_id, event):
    pool = Pool.query.filter_by(league_id=league_id, event_id=event_id).first()
    if pool:
        return pool
    pool = Pool(
        league_id=league_id,
        period_id=period_id,
        event_id=event_id,
        event_name=event.get("name"),
        league=event.get("league"),
        home_team=event.get("home_team"),
        away_team=event.get("away_team"),
        start_time=event.get("start_time"),
        status=OPEN,
    )
    db.session.add(pool)
    db.session.flush()  # assign id
    return pool


def place_stake(user_id, league_id, event_id, side, amount_cents):
    side = (side or "").lower()
    if side not in ("home", "away"):
        raise PoolError("side must be 'home' or 'away'")
    amount = int(amount_cents)

    ctx = _validate_context(league_id, amount)

    event = get_event(event_id)
    if not event:
        raise PoolError("event not found")
    if event.get("status") != "scheduled":
        raise PoolError("this event is no longer open for betting")

    pool = _get_or_create_pool(league_id, ctx.get("period_id"), event_id, event)
    if pool.status != OPEN:
        raise PoolError("this pool is no longer open")

    stake = PoolStake(
        pool_id=pool.id,
        league_id=league_id,
        user_id=user_id,
        side=side,
        amount_cents=amount,
    )
    db.session.add(stake)
    db.session.flush()  # assign id for the ref

    try:
        hold(_account(league_id), user_id, amount, _stake_ref(stake.id))
    except InsufficientFunds:
        db.session.rollback()
        raise
    db.session.commit()
    return stake, pool


def _post_settled_activity(pool):
    post_league_activity(pool.league_id, {
        "event_type": "pool_settled",
        "title": "A pool settled",
        "body": pool.event_name,
        "dedup_key": f"pool_settled:{pool.id}",
        "meta": {"pool_id": pool.id, "winner_side": pool.winner_side},
    })


def _refund_all(pool, stakes, account, status):
    for stake in stakes:
        refund(account, stake.user_id, stake.amount_cents, _stake_ref(stake.id))
    pool.status = status
    pool.settled_at = datetime.utcnow()
    db.session.commit()


def settle_pool(pool):
    """Settle an open pool if its event is final/cancelled. No-op otherwise."""
    if pool.status != OPEN:
        return pool
    account = _account(pool.league_id)
    event = get_event(pool.event_id)
    if not event:
        return pool

    stakes = PoolStake.query.filter_by(pool_id=pool.id).all()
    status = event.get("status")

    if status == "cancelled":
        _refund_all(pool, stakes, account, CANCELLED)
        return pool

    if status != "final":
        return pool  # not finished yet

    winner_side = event.get("winner_side")
    if winner_side not in ("home", "away"):
        # draw / push / no winner — refund everyone
        _refund_all(pool, stakes, account, REFUNDED)
        return pool

    total_pot = sum(s.amount_cents for s in stakes)
    winning = [s for s in stakes if s.side == winner_side]
    winning_total = sum(s.amount_cents for s in winning)

    if winning_total == 0:
        # nobody backed the winner — refund everyone
        _refund_all(pool, stakes, account, REFUNDED)
        return pool

    # Parimutuel split: each winning stake claims its proportional share of the
    # whole pot (integer-cent floor division).
    for stake in winning:
        payout_cents = (stake.amount_cents * total_pot) // winning_total
        payout(account, stake.user_id, payout_cents, _payout_ref(stake.id))

    pool.winner_side = winner_side
    pool.status = SETTLED
    pool.settled_at = datetime.utcnow()
    db.session.commit()
    _post_settled_activity(pool)
    return pool


def _has_started(pool) -> bool:
    if not pool.start_time:
        return True
    try:
        dt = datetime.fromisoformat(pool.start_time.replace("Z", "+00:00")).replace(tzinfo=None)
    except (ValueError, AttributeError):
        return True
    return dt <= datetime.utcnow()


def settle_due_pools(refresh=True) -> int:
    """Settle every open pool whose event has finished. Returns count settled."""
    pools = Pool.query.filter_by(status=OPEN).all()

    if refresh:
        refreshed = set()
        for pool in pools:
            if pool.event_id in refreshed or not _has_started(pool):
                continue
            refreshed.add(pool.event_id)
            try:
                refresh_event(pool.event_id)
            except Exception:  # noqa: BLE001
                pass

    settled = 0
    for pool in pools:
        before = pool.status
        try:
            settle_pool(pool)
        except Exception:  # noqa: BLE001
            db.session.rollback()
            continue
        if pool.status != before:
            settled += 1
    return settled


# ---- HTTP handlers --------------------------------------------------------
def _totals(stakes):
    home = sum(s.amount_cents for s in stakes if s.side == "home")
    away = sum(s.amount_cents for s in stakes if s.side == "away")
    return {
        "home_cents": home,
        "away_cents": away,
        "total_cents": home + away,
        "stake_count": len(stakes),
    }


def _pool_view(pool, me):
    stakes = PoolStake.query.filter_by(pool_id=pool.id).all()
    return {
        "pool": pool.to_dict(),
        "totals": _totals(stakes),
        "my_stakes": [s.to_dict() for s in stakes if s.user_id == me],
    }


def stake(me, data):
    league_id = data.get("league_id")
    if not league_id:
        return {"error": "league_id is required"}, 400
    event_id = data.get("event_id")
    if not event_id:
        return {"error": "event_id is required"}, 400

    try:
        s, pool = place_stake(
            user_id=me,
            league_id=str(league_id),
            event_id=str(event_id),
            side=data.get("side"),
            amount_cents=data.get("amount_cents", 0),
        )
    except PoolError as e:
        return {"error": str(e)}, 400
    except InsufficientFunds:
        return {"error": "insufficient balance to cover the stake"}, 402

    return {"stake": s.to_dict(), "pool": pool.to_dict()}, 201


def list_pools(me):
    league_id = request.args.get("league_id")
    if not league_id:
        return {"error": "league_id is required"}, 400
    rows = (
        Pool.query.filter_by(league_id=league_id)
        .order_by(Pool.created_at.desc())
        .limit(200)
        .all()
    )
    return {"pools": [_pool_view(p, me) for p in rows]}, 200


def get_pool(pool_id, me):
    pool = db.session.get(Pool, str(pool_id))
    if not pool:
        return {"error": "pool not found"}, 404
    view = _pool_view(pool, me)
    return view, 200