"""Friends domain: requests, listings, accept/decline + auth lookups."""
import requests
from flask import current_app
from sqlalchemy import and_, or_

from app.extensions import db
from app.models.friendship import ACCEPTED, PENDING, Friendship


def _auth_headers():
    return {"X-Internal-Token": current_app.config["INTERNAL_TOKEN"]}


def _auth_base():
    return current_app.config["AUTH_URL"]


def resolve_users(ids) -> dict:
    ids = list({str(i) for i in ids})
    if not ids:
        return {}
    resp = requests.post(
        f"{_auth_base()}/internal/users",
        json={"ids": ids},
        headers=_auth_headers(),
        timeout=10,
    )
    resp.raise_for_status()
    return {u["id"]: u["display_name"] for u in resp.json().get("users", [])}


def pair(a: str, b: str):
    return Friendship.query.filter(
        or_(
            and_(Friendship.requester_id == a, Friendship.addressee_id == b),
            and_(Friendship.requester_id == b, Friendship.addressee_id == a),
        )
    ).first()


def _relationship(me: str | None, target_id: str) -> str:
    if not me or me == target_id:
        return "none"
    row = pair(me, target_id)
    if not row:
        return "none"
    if row.status == ACCEPTED:
        return "friends"
    if row.status == PENDING:
        return "pending_out" if row.requester_id == me else "pending_in"
    return "none"


def invite_preview(me: str | None, target_id: str) -> tuple[dict, int]:
    target_id = str(target_id)
    name = resolve_users([target_id]).get(target_id)
    if not name:
        return {"error": "user not found"}, 404
    rel = _relationship(me, target_id)
    if me and me == target_id:
        rel = "self"
    row = pair(me, target_id) if me else None
    request_id = row.id if row and row.status == PENDING else None
    return {
        "user": {"id": target_id, "display_name": name},
        "relationship": rel,
        "request_id": request_id,
    }, 200


def send_request(me: str, data: dict) -> tuple[dict, int]:
    user_id = data.get("user_id")
    if user_id is None or not str(user_id):
        return {"error": "user_id is required"}, 400

    target_id = str(user_id)
    name = resolve_users([target_id]).get(target_id)
    if not name:
        return {"error": "user not found"}, 404
    target = {"id": target_id, "display_name": name}
    if target_id == str(me):
        return {"error": "you can't add yourself"}, 400
    if pair(me, target_id):
        return {"error": "already friends or a request is pending"}, 409

    fr = Friendship(requester_id=me, addressee_id=target_id, status=PENDING)
    db.session.add(fr)
    db.session.commit()
    return {
        "request": {
            "id": fr.id,
            "user_id": target_id,
            "display_name": target["display_name"],
            "status": fr.status,
        }
    }, 201


def list_friends(me: str) -> tuple[dict, int]:
    rows = Friendship.query.filter(
        Friendship.status == ACCEPTED,
        or_(Friendship.requester_id == me, Friendship.addressee_id == me),
    ).all()
    names = resolve_users([r.other_id(me) for r in rows])
    friends = [
        {
            "friendship_id": r.id,
            "user_id": r.other_id(me),
            "display_name": names.get(r.other_id(me), f"User {r.other_id(me)}"),
        }
        for r in rows
    ]
    return {"friends": friends}, 200


def list_requests(me: str) -> tuple[dict, int]:
    incoming = Friendship.query.filter_by(addressee_id=me, status=PENDING).all()
    outgoing = Friendship.query.filter_by(requester_id=me, status=PENDING).all()
    names = resolve_users(
        [r.requester_id for r in incoming] + [r.addressee_id for r in outgoing]
    )
    return {
        "incoming": [
            {
                "id": r.id,
                "user_id": r.requester_id,
                "display_name": names.get(r.requester_id, f"User {r.requester_id}"),
            }
            for r in incoming
        ],
        "outgoing": [
            {
                "id": r.id,
                "user_id": r.addressee_id,
                "display_name": names.get(r.addressee_id, f"User {r.addressee_id}"),
            }
            for r in outgoing
        ],
    }, 200


def accept(me: str, req_id: str) -> tuple[dict, int]:
    fr = db.session.get(Friendship, req_id)
    if not fr or fr.addressee_id != me or fr.status != PENDING:
        return {"error": "request not found"}, 404
    fr.status = ACCEPTED
    db.session.commit()
    return {"ok": True}, 200


def decline(me: str, req_id: str) -> tuple[dict, int]:
    fr = db.session.get(Friendship, req_id)
    if not fr or fr.addressee_id != me or fr.status != PENDING:
        return {"error": "request not found"}, 404
    db.session.delete(fr)
    db.session.commit()
    return {"ok": True}, 200


def remove_friend(me: str, user_id: str) -> tuple[dict, int]:
    """Unfriend: delete the accepted friendship between me and user_id (either
    direction)."""
    fr = Friendship.query.filter(
        Friendship.status == ACCEPTED,
        or_(
            and_(Friendship.requester_id == me, Friendship.addressee_id == user_id),
            and_(Friendship.requester_id == user_id, Friendship.addressee_id == me),
        ),
    ).first()
    if not fr:
        return {"error": "friendship not found"}, 404
    db.session.delete(fr)
    db.session.commit()
    return {"ok": True}, 200