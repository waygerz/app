"""Internal contests endpoints for cross-service calls."""
from flask import request

from app.models.wager import REFUNDED, SETTLED, Wager
from app.services import service_pools as pool_service
from app.services import service_wagers as wager_service


def league_record():
    data = request.get_json(silent=True) or {}
    league_id = str(data.get("league_id", ""))
    rows = Wager.query.filter(
        Wager.league_id == league_id, Wager.status.in_([SETTLED, REFUNDED])
    ).all()
    rec: dict = {}

    def _ensure(u):
        rec.setdefault(u, {"wins": 0, "losses": 0, "pushes": 0})

    for w in rows:
        if w.status == SETTLED and w.winner_user_id:
            loser = w.acceptor_id if w.winner_user_id == w.proposer_id else w.proposer_id
            _ensure(w.winner_user_id)
            rec[w.winner_user_id]["wins"] += 1
            _ensure(loser)
            rec[loser]["losses"] += 1
        elif w.status == REFUNDED:
            for u in (w.proposer_id, w.acceptor_id):
                _ensure(u)
                rec[u]["pushes"] += 1
    return {"records": rec}, 200


def tick():
    """Settle due wagers and pools. Called by the scheduler service."""
    wagers = wager_service.settle_due()
    pools = pool_service.settle_due_pools()
    return {"wagers_settled": wagers, "pools_settled": pools}, 200