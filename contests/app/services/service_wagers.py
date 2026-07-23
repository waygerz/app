"""Wager lifecycle: propose / accept / decline / cancel / settle — league-scoped.

Every wager belongs to a league; money moves through the wallet on that league's
account (``league:{league_id}``). Validation is delegated to the leagues service
(``league_context`` + ``are_comembers``) — friendship is no longer required.
"""
from datetime import datetime, timedelta

import requests
from flask import current_app, request

from app.extensions import db
from app.models.wager import (
    ACCEPTED,
    CANCELLED,
    COMPLETED,
    DECLINED,
    OPEN,
    REFUNDED,
    SETTLED,
    Wager,
)

# Once an event's start time is this far in the past we treat it as over, so a
# wager can move to `completed` (awaiting the winner's confirmation) even when
# our data never reports a definitive final — head-to-head results are settled
# by the members themselves, not by feed data.
COMPLETE_AFTER_HOURS = 6

# How close to kickoff cancellation locks shut, for both the proposer's
# withdrawal of an open wager and the mutual cancel of an accepted one.
CANCEL_LOCK_SECONDS = 10 * 60


class InsufficientFunds(Exception):
    pass


def _itoken():
    return {"X-Internal-Token": current_app.config["INTERNAL_TOKEN"]}


def get_event(external_id):
    # INGESTOR_URL already includes the /v1/<group>/ingestor prefix (matches the
    # leagues service); do not prepend it again or the path doubles and 404s.
    base = current_app.config["INGESTOR_URL"]
    resp = requests.get(f"{base}/events/{external_id}", timeout=10)
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


def are_comembers(league_id, a, b) -> bool:
    base = current_app.config["LEAGUES_URL"]
    resp = requests.post(
        f"{base}/internal/are-comembers",
        json={"league_id": league_id, "user_a": a, "user_b": b},
        headers=_itoken(),
        timeout=10,
    )
    resp.raise_for_status()
    return bool(resp.json().get("are_comembers"))


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


def resolve_users(ids) -> dict:
    base = current_app.config["AUTH_URL"]
    ids = list({str(i) for i in ids if i is not None})
    if not ids:
        return {}
    resp = requests.post(
        f"{base}/internal/users", json={"ids": ids}, headers=_itoken(), timeout=10
    )
    resp.raise_for_status()
    return {u["id"]: u["display_name"] for u in resp.json().get("users", [])}


class WagerError(Exception):
    pass


def _ref(wager_id):
    return f"wager:{wager_id}"


def _account(league_id):
    return f"league:{league_id}"


def _validate_context(league_id, proposer_id, amount):
    """Resolve + check the league context for a new bet. Returns the context."""
    ctx = league_context(league_id)
    if not ctx:
        raise WagerError("league not found")
    if ctx.get("league_type") != "head_to_head":
        raise WagerError("this league isn't a head-to-head league")
    if ctx.get("status") != "active":
        raise WagerError("this league isn't active yet")
    if ctx.get("period_status") != "open":
        raise WagerError("betting is closed for this period")
    if amount <= 0:
        raise WagerError("amount must be positive")
    minw, maxw = ctx.get("min_wager_cents"), ctx.get("max_wager_cents")
    if minw and amount < minw:
        raise WagerError("amount is below the league minimum")
    if maxw and amount > maxw:
        raise WagerError("amount is above the league maximum")
    rules = ctx.get("rules") or {}
    if rules.get("who_can_propose") == "commissioner" and proposer_id != ctx.get("commissioner_id"):
        raise WagerError("only the commissioner can propose bets in this league")
    return ctx


# Field sports (golf, racing) are player/driver matchups: the "event" is a
# tournament with a whole field, so there's no fixed home/away. The proposer
# picks two competitors and always backs the first (home); the picks become the
# wager's home/away teams. Every other sport uses the event's own two sides.
_FIELD_SPORTS = {"golf", "racing"}


def _resolve_sides(event, side, home_team, away_team):
    """(home_team, away_team, proposer_side) for a new wager."""
    if event.get("sport") in _FIELD_SPORTS:
        home = (home_team or "").strip()
        away = (away_team or "").strip()
        if not home or not away:
            raise WagerError("pick a competitor for each side")
        if home.casefold() == away.casefold():
            raise WagerError("pick two different competitors")
        return home, away, "home"
    return event.get("home_team"), event.get("away_team"), side


def propose(proposer_id, league_id, event_id, side, amount_cents, acceptor_id,
            home_team=None, away_team=None):
    side = (side or "").lower()
    if side not in ("home", "away"):
        raise WagerError("side must be 'home' or 'away'")
    amount = int(amount_cents)
    if acceptor_id == proposer_id:
        raise WagerError("you can't bet against yourself")

    ctx = _validate_context(league_id, proposer_id, amount)
    if not are_comembers(league_id, proposer_id, acceptor_id):
        raise WagerError("you can only bet against members of this league")

    event = get_event(event_id)
    if not event:
        raise WagerError("event not found")
    if event.get("status") != "scheduled":
        raise WagerError("this event is no longer open for betting")
    # Sport-scope: enforce only when both sides carry a catalog id (soft until the
    # ingestor sport_leagues catalog lands.
    allowed = ctx.get("sport_league_ids") or []
    ev_slid = event.get("sport_league_id")
    if allowed and ev_slid and ev_slid not in allowed:
        raise WagerError("this game isn't in your league's sports")

    ev_home, ev_away, proposer_side = _resolve_sides(event, side, home_team, away_team)

    account = ctx["account"]
    w = Wager(
        league_id=league_id,
        period_id=ctx.get("period_id"),
        event_id=event_id,
        event_name=event.get("name"),
        league=event.get("league"),
        home_team=ev_home,
        away_team=ev_away,
        start_time=event.get("start_time"),
        proposer_id=proposer_id,
        acceptor_id=acceptor_id,
        proposer_side=proposer_side,
        amount_cents=amount,
        status=OPEN,
    )
    db.session.add(w)
    db.session.flush()  # assign id for the ref

    try:
        hold(account, proposer_id, amount, _ref(w.id))
    except InsufficientFunds:
        db.session.rollback()
        raise
    db.session.commit()
    return w


def propose_many(proposer_id, league_id, event_id, side, amount_cents, acceptor_ids,
                 home_team=None, away_team=None):
    """Send the same bet to several members — one independent wager each."""
    results = []
    for aid in acceptor_ids:
        try:
            wager = propose(proposer_id, league_id, event_id, side, amount_cents, aid,
                            home_team=home_team, away_team=away_team)
            results.append({"acceptor_id": aid, "wager": wager})
        except WagerError as exc:
            results.append({"acceptor_id": aid, "error": str(exc)})
        except InsufficientFunds:
            results.append({"acceptor_id": aid, "error": "insufficient balance"})
    return results


def _format_credits(amount_cents):
    return f"{amount_cents / 100:.2f}"


def _format_stake(amount_cents):
    """Dollar-style stake for the feed title: $10, or $10.50 when not whole."""
    dollars = amount_cents / 100
    return f"${dollars:.0f}" if amount_cents % 100 == 0 else f"${dollars:.2f}"


def _opponent_phrase(names):
    """"Johnny" / "Johnny and Richard" / "Johnny, Richard and 2 others"."""
    n = len(names)
    if n == 0:
        return ""
    if n == 1:
        return names[0]
    if n == 2:
        return f"{names[0]} and {names[1]}"
    extra = n - 2
    return f"{names[0]}, {names[1]} and {extra} other{'s' if extra > 1 else ''}"


def _post_accepted_activity(wager):
    # One bet can be offered to several members (propose_many makes an
    # independent wager per opponent). Collapse the accepted siblings — same
    # proposer, event, side and stake — into a single feed post that names all
    # the opponents, upserted so it grows as each of them accepts.
    siblings = (
        Wager.query.filter_by(
            league_id=wager.league_id, event_id=wager.event_id,
            proposer_id=wager.proposer_id, proposer_side=wager.proposer_side,
            amount_cents=wager.amount_cents, status=ACCEPTED,
        )
        .order_by(Wager.created_at.asc())
        .all()
    )
    names = resolve_users([wager.proposer_id] + [w.acceptor_id for w in siblings])
    proposer = names.get(wager.proposer_id, "Member")
    team = wager.home_team if wager.proposer_side == "home" else wager.away_team
    opponents = [names.get(w.acceptor_id, "Member") for w in siblings]
    connector = "against" if len(opponents) == 1 else "over"
    # Short heading = the matchup; the pick sentence goes in the body, which
    # wraps — so a bet against many opponents doesn't blow out the title line.
    sentence = (
        f"{proposer} took {team} for {_format_stake(wager.amount_cents)} "
        f"{connector} {_opponent_phrase(opponents)}"
    )
    post_league_activity(wager.league_id, {
        "event_type": "wager_accepted",
        "author_id": wager.proposer_id,
        "title": wager.event_name or "Bet accepted",
        "body": sentence,
        "dedup_key": (
            f"wager_accepted:{wager.proposer_id}:{wager.event_id}:"
            f"{wager.proposer_side}:{wager.amount_cents}"
        ),
        "upsert": True,
        "meta": {
            "amount_cents": wager.amount_cents,
            "proposer_id": wager.proposer_id,
            "acceptor_ids": [w.acceptor_id for w in siblings],
        },
    })


def accept(wager, user_id):
    if wager.status != OPEN:
        raise WagerError("this wager is no longer open")
    if wager.acceptor_id != user_id:
        raise WagerError("this wager isn't addressed to you")
    hold(_account(wager.league_id), user_id, wager.amount_cents, _ref(wager.id))
    wager.status = ACCEPTED
    db.session.commit()
    _post_accepted_activity(wager)
    return wager


def decline(wager, user_id):
    if wager.status != OPEN:
        raise WagerError("this wager is no longer open")
    if wager.acceptor_id != user_id:
        raise WagerError("this wager isn't addressed to you")
    refund(_account(wager.league_id), wager.proposer_id, wager.amount_cents, _ref(wager.id))
    wager.status = DECLINED
    db.session.commit()
    return wager


def cancel(wager, user_id):
    """Withdraw an unaccepted proposal. Only the proposer has money at stake."""
    if wager.status != OPEN:
        raise WagerError("only an open wager can be cancelled")
    if wager.proposer_id != user_id:
        raise WagerError("only the proposer can cancel")
    _require_cancel_window(wager)
    refund(_account(wager.league_id), wager.proposer_id, wager.amount_cents, _ref(wager.id))
    wager.status = CANCELLED
    db.session.commit()
    return wager


def request_cancel(wager, user_id):
    """Ask the other side to call off an accepted wager.

    Both sides have money held once a wager is accepted, so neither can back out
    alone — this only records the request; `approve_cancel` moves the money.
    """
    if wager.status != ACCEPTED:
        raise WagerError("only an accepted wager needs both sides to cancel")
    _require_cancel_window(wager)
    if wager.cancel_requested_by == user_id:
        raise WagerError("you've already asked to cancel this wager")
    if wager.cancel_requested_by:
        raise WagerError("the other side already asked to cancel — approve or reject it")
    wager.cancel_requested_by = user_id
    wager.cancel_requested_at = datetime.utcnow()
    db.session.commit()
    return wager


def approve_cancel(wager, user_id):
    """Agree to the other side's cancel request: void the wager, refund both."""
    if wager.status != ACCEPTED:
        raise WagerError("only an accepted wager needs both sides to cancel")
    if not wager.cancel_requested_by:
        raise WagerError("nobody has asked to cancel this wager")
    if wager.cancel_requested_by == user_id:
        raise WagerError("the other side has to approve your request")
    _require_cancel_window(wager)
    account = _account(wager.league_id)
    for uid in (wager.proposer_id, wager.acceptor_id):
        refund(account, uid, wager.amount_cents, _ref(wager.id))
    wager.status = CANCELLED
    wager.cancel_requested_by = None
    wager.cancel_requested_at = None
    db.session.commit()
    return wager


def reject_cancel(wager, user_id):
    """Turn down the other side's cancel request; the wager stands."""
    if wager.status != ACCEPTED:
        raise WagerError("only an accepted wager needs both sides to cancel")
    if not wager.cancel_requested_by:
        raise WagerError("nobody has asked to cancel this wager")
    if wager.cancel_requested_by == user_id:
        raise WagerError("you can't reject your own request")
    wager.cancel_requested_by = None
    wager.cancel_requested_at = None
    db.session.commit()
    return wager


def _post_settled_activity(wager, headline):
    post_league_activity(wager.league_id, {
        "event_type": "wager_settled",
        "title": headline,
        "body": wager.event_name,
        "dedup_key": f"wager_settled:{wager.id}",
        "meta": {"wager_id": wager.id, "amount_cents": wager.amount_cents},
    })


def _parse_start(wager):
    if not wager.start_time:
        return None
    try:
        return datetime.fromisoformat(wager.start_time.replace("Z", "+00:00")).replace(tzinfo=None)
    except (ValueError, AttributeError):
        return None


def _cancel_locked(wager) -> bool:
    """True once we're inside the pre-game window where nobody may cancel.

    An *unknown* start time does not lock: we can't prove we're inside the
    window, and locking would strand both holds until the wager settles. That's
    safe because cancelling an accepted wager already needs both sides to agree,
    and cancelling an open one only returns the proposer's own stake.
    """
    dt = _parse_start(wager)
    if dt is None:
        return False
    return datetime.utcnow() >= dt - timedelta(seconds=CANCEL_LOCK_SECONDS)


def _require_cancel_window(wager):
    if _cancel_locked(wager):
        raise WagerError(
            f"too close to start time — bets lock {CANCEL_LOCK_SECONDS // 60} minutes before the game"
        )


def _has_started(wager) -> bool:
    """True unless we KNOW the event is still in the future.

    A known future start blocks settlement (no confirming before kickoff); a
    known past start allows it. An *unknown* start time also allows it: we can't
    prove it hasn't started, and blocking would strand a wager forever if the
    data source never reports a start time or a `final` (both holds stuck). Under
    the loser-concedes model an early concession only pays the opponent, so this
    is safe.
    """
    dt = _parse_start(wager)
    return dt is None or dt <= datetime.utcnow()


def _likely_over(wager) -> bool:
    """True once the event's start time is well past — our cue that it's done.

    Unknown start time returns False: we won't declare an event "over" when we
    can't tell, so those wait for a data `final` or a manual confirmation.
    """
    dt = _parse_start(wager)
    if dt is None:
        return False
    return dt + timedelta(hours=COMPLETE_AFTER_HOURS) <= datetime.utcnow()


def settle_one(wager):
    """Advance an accepted wager once its event is over.

    Head-to-head results are peer-confirmed, so this does NOT pick a winner or
    pay out — it just moves the wager to `completed` (awaiting the winner's
    confirmation). A cancelled event is the one unambiguous case, so it refunds
    both sides automatically. No-op until the event is over.
    """
    if wager.status != ACCEPTED:
        return wager
    account = _account(wager.league_id)
    event = get_event(wager.event_id)
    status = event.get("status") if event else None

    if status == "cancelled":
        refund(account, wager.proposer_id, wager.amount_cents, _ref(wager.id))
        refund(account, wager.acceptor_id, wager.amount_cents, _ref(wager.id))
        wager.status = REFUNDED
        wager.settled_at = datetime.utcnow()
        db.session.commit()
        return wager

    if status == "final" or _likely_over(wager):
        wager.status = COMPLETED
        wager.completed_at = datetime.utcnow()
        db.session.commit()
        _post_completed_activity(wager)
    return wager


def _post_completed_activity(wager):
    post_league_activity(wager.league_id, {
        "event_type": "wager_completed",
        "title": "A bet is ready to settle",
        "body": f"{wager.event_name} — the winner can now confirm the result.",
        "dedup_key": f"wager_completed:{wager.id}",
        "meta": {"wager_id": wager.id, "amount_cents": wager.amount_cents},
    })


def confirm(wager, user_id, result):
    """Peer-settle a completed head-to-head wager.

    ``result`` is relative to the caller: 'lost' (caller concedes — pays the
    other side) or 'draw' (no contest — refund both). A caller cannot claim
    their own win: nothing verifies the result, so allowing 'won' would let
    either party take the pot unilaterally. The winner is paid when the loser
    concedes.

    Allowed once the event is over: from `completed`, or directly from
    `accepted` once the event has started (so it works before the scheduled sweep
    flips it). A known *future* start is blocked; an unknown start time is
    allowed (see _has_started — blocking it would strand funds).
    """
    if not wager.involves(user_id):
        raise WagerError("this wager isn't yours to settle")
    if wager.status == COMPLETED:
        pass
    elif wager.status == ACCEPTED and _has_started(wager):
        pass
    elif wager.status == ACCEPTED:
        raise WagerError("you can confirm the result once the event has started")
    else:
        raise WagerError("this wager has already been settled")

    result = (result or "").lower()
    account = _account(wager.league_id)
    now = datetime.utcnow()

    if result == "draw":
        refund(account, wager.proposer_id, wager.amount_cents, _ref(wager.id))
        refund(account, wager.acceptor_id, wager.amount_cents, _ref(wager.id))
        wager.status = REFUNDED
        wager.confirmed_by_id = user_id
        wager.settled_at = now
        db.session.commit()
        _post_settled_activity(wager, "A bet was called a draw")
        return wager

    if result == "lost":
        # The losing side concedes; the pot goes to the other player.
        winner = wager.acceptor_id if user_id == wager.proposer_id else wager.proposer_id
    elif result == "won":
        raise WagerError("you can't claim your own win — the losing player concedes, or report a draw")
    else:
        raise WagerError("result must be 'lost' or 'draw'")

    payout(account, winner, wager.amount_cents * 2, _ref(wager.id))
    wager.winner_user_id = winner
    wager.confirmed_by_id = user_id
    wager.status = SETTLED
    wager.settled_at = now
    db.session.commit()
    _post_settled_activity(wager, "A wager was settled")
    return wager


def settle_due(refresh=True) -> int:
    """Advance every accepted wager whose event has finished. Returns the count moved."""
    accepted = Wager.query.filter_by(status=ACCEPTED).all()

    if refresh:
        refreshed = set()
        for wager in accepted:
            if wager.event_id in refreshed or not _has_started(wager):
                continue
            refreshed.add(wager.event_id)
            try:
                refresh_event(wager.event_id)
            except Exception:  # noqa: BLE001
                pass

    moved = 0
    for wager in accepted:
        before = wager.status
        try:
            settle_one(wager)
        except Exception:  # noqa: BLE001
            db.session.rollback()
            continue
        if wager.status != before:
            moved += 1
    return moved


# ---- HTTP handlers --------------------------------------------------------
def _enrich(wagers):
    ids = set()
    for w in wagers:
        ids.update([w.proposer_id, w.acceptor_id, w.winner_user_id])
    names = resolve_users(ids)
    out = []
    for w in wagers:
        d = w.to_dict()
        d["proposer_name"] = names.get(w.proposer_id, f"User {w.proposer_id}")
        d["acceptor_name"] = names.get(w.acceptor_id, f"User {w.acceptor_id}")
        d["winner_name"] = names.get(w.winner_user_id) if w.winner_user_id else None
        out.append(d)
    return out


def propose_wagers(me, data):
    league_id = data.get("league_id")
    if not league_id:
        return {"error": "league_id is required"}, 400

    raw_ids = data.get("acceptor_ids")
    if not raw_ids:
        single = data.get("acceptor_id")
        raw_ids = [single] if single is not None else []
    try:
        acceptor_ids = sorted({str(a) for a in raw_ids})
    except (TypeError, ValueError):
        return {"error": "invalid member selection"}, 400
    if not acceptor_ids:
        return {"error": "select at least one member"}, 400

    results = propose_many(
        proposer_id=me,
        league_id=str(league_id),
        event_id=str(data.get("event_id", "")),
        side=data.get("side"),
        amount_cents=data.get("amount_cents", 0),
        acceptor_ids=acceptor_ids,
        # Player/driver picks for a field-sport (golf, racing) matchup; ignored
        # for team/1v1 events, which carry their own two sides.
        home_team=data.get("home_team"),
        away_team=data.get("away_team"),
    )
    created = [r["wager"] for r in results if "wager" in r]
    errors = [
        {"acceptor_id": r["acceptor_id"], "error": r["error"]}
        for r in results
        if "error" in r
    ]
    status = 201 if created else 200
    return {"created": _enrich(created), "errors": errors}, status


def my_wagers(me):
    q = Wager.query.filter(
        (Wager.proposer_id == me) | (Wager.acceptor_id == me)
    )
    league_id = request.args.get("league_id")
    if league_id:
        q = q.filter(Wager.league_id == league_id)
    status = request.args.get("status")
    if status:
        q = q.filter_by(status=status)
    rows = q.order_by(Wager.created_at.desc()).limit(200).all()
    return {"wagers": _enrich(rows)}, 200


def get_wager(wager_id, me):
    wager_id = str(wager_id)
    w = db.session.get(Wager, wager_id)
    if not w or not w.involves(me):
        return {"error": "wager not found"}, 404
    return {"wager": _enrich([w])[0]}, 200


def _act(wager_id, me, fn):
    wager_id = str(wager_id)
    w = db.session.get(Wager, wager_id)
    if not w or not w.involves(me):
        return {"error": "wager not found"}, 404
    try:
        fn(w, me)
    except WagerError as e:
        return {"error": str(e)}, 400
    except InsufficientFunds:
        return {"error": "insufficient balance to cover the stake"}, 402
    return {"wager": _enrich([w])[0]}, 200


def accept_wager(wager_id, me):
    return _act(wager_id, me, accept)


def decline_wager(wager_id, me):
    return _act(wager_id, me, decline)


def cancel_wager(wager_id, me):
    return _act(wager_id, me, cancel)


def request_cancel_wager(wager_id, me):
    return _act(wager_id, me, request_cancel)


def approve_cancel_wager(wager_id, me):
    return _act(wager_id, me, approve_cancel)


def reject_cancel_wager(wager_id, me):
    return _act(wager_id, me, reject_cancel)


def confirm_wager(wager_id, me, data):
    wager_id = str(wager_id)
    w = db.session.get(Wager, wager_id)
    if not w or not w.involves(me):
        return {"error": "wager not found"}, 404
    try:
        confirm(w, me, (data or {}).get("result"))
    except WagerError as e:
        return {"error": str(e)}, 400
    except InsufficientFunds:
        return {"error": "insufficient balance to settle"}, 402
    return {"wager": _enrich([w])[0]}, 200


def settle_due_admin():
    return {"settled": settle_due()}, 200