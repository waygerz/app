"""Friends domain: requests, listings, accept/decline + auth lookups."""
import secrets
from datetime import datetime

import requests
from flask import current_app
from sqlalchemy import and_, or_

from app.extensions import db
from app.models.friendship import ACCEPTED, PENDING, Friendship
from app.models.invite_code import FriendInviteCode

# No ambiguous characters (no I/O/0/1). Leading "F" marks a friend code so a
# client routes /c/<code> by prefix without a lookup.
_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CODE_PREFIX = "F"
_CODE_BODY_LEN = 6


def _auth_headers():
    return {"X-Internal-Token": current_app.config["INTERNAL_TOKEN"]}


def _auth_base():
    return current_app.config["AUTH_URL"]


def resolve_users_full(ids) -> dict:
    """id -> full user dict ({display_name, avatar_key, ...}) from auth."""
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
    return {u["id"]: u for u in resp.json().get("users", [])}


def resolve_users(ids) -> dict:
    """id -> display_name only (for callers that don't need the avatar)."""
    return {uid: u.get("display_name") for uid, u in resolve_users_full(ids).items()}


def pair(a: str, b: str):
    return Friendship.query.filter(
        or_(
            and_(Friendship.requester_id == a, Friendship.addressee_id == b),
            and_(Friendship.requester_id == b, Friendship.addressee_id == a),
        )
    ).first()


def _notify_friend(user_id, template_key, from_name, *, ref_id=None, dedup_key=None):
    """Fan a friend event out to the recipient's notifications (in-app + SMS).
    Best-effort — a notification failure must never affect the friendship action."""
    try:
        base = current_app.config["NOTIFICATIONS_URL"]
        # ref_id is the sender's user_id and from_name is their name — attach
        # them (plus avatar) as the actor so the sheet shows their face.
        actor = None
        if ref_id:
            u = resolve_users_full([ref_id]).get(str(ref_id)) or {}
            actor = {"id": str(ref_id), "name": from_name, "avatar_key": u.get("avatar_key")}
        requests.post(
            f"{base}/internal/notify",
            json={
                "user_id": str(user_id),
                "category": "friend_request",
                "template_key": template_key,
                "title": from_name,
                "context": {"from_name": from_name},
                "actor": actor,
                "ref_type": "friend",
                "ref_id": ref_id,
                "deep_link": "/friends",
                "dedup_key": dedup_key,
            },
            headers=_auth_headers(),
            timeout=10,
        )
    except Exception:  # noqa: BLE001
        current_app.logger.exception("friend notify failed user=%s key=%s", user_id, template_key)


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


# ---- Invite codes ---------------------------------------------------------
def generate_friend_code() -> str:
    """A unique, type-prefixed invite code (e.g. F7M2PJH)."""
    for _ in range(10):
        code = CODE_PREFIX + "".join(secrets.choice(_CODE_ALPHABET) for _ in range(_CODE_BODY_LEN))
        if not FriendInviteCode.query.filter_by(code=code).first():
            return code
    return CODE_PREFIX + "".join(secrets.choice(_CODE_ALPHABET) for _ in range(_CODE_BODY_LEN + 1))


def _code_state(rec) -> str:
    if rec.consumed_at:
        return "consumed"
    if rec.expires_at and rec.expires_at < datetime.utcnow():
        return "expired"
    return "ok"


def my_code(me: str) -> tuple[dict, int]:
    """Get-or-create the caller's reusable personal friend link code."""
    rec = (
        FriendInviteCode.query.filter_by(owner_id=me, single_use=False)
        .order_by(FriendInviteCode.created_at.asc())
        .first()
    )
    if not rec:
        rec = FriendInviteCode(code=generate_friend_code(), owner_id=me, single_use=False)
        db.session.add(rec)
        db.session.commit()
    return {"code": rec.code}, 200


def resolve_code(me: str | None, code: str) -> tuple[dict, int]:
    """Unified /c/<code> resolver — the shared contract shape (see
    INVITE_CODES_DESIGN.md). JWT optional so signed-out users see the preview."""
    code = (code or "").strip().upper()
    rec = FriendInviteCode.query.filter_by(code=code).first()
    if not rec:
        return {"type": "friend", "code": code, "target_id": None,
                "state": "invalid", "single_use": False,
                "viewer": {"authenticated": bool(me), "relationship": "none"},
                "preview": None, "actions": []}, 404
    owner = str(rec.owner_id)
    user = resolve_users_full([owner]).get(owner) or {}
    state = _code_state(rec)
    rel = _relationship(me, owner) if me else "none"
    if me and me == owner:
        rel = "self"
    row = pair(me, owner) if me else None
    request_id = row.id if row and row.status == PENDING else None

    actions: list[str] = []
    if state == "ok" and me and rel not in ("self", "friends", "pending_out"):
        actions = ["accept", "decline"] if rel == "pending_in" else ["add"]

    return {
        "type": "friend",
        "code": code,
        "target_id": owner,
        "state": state,
        "single_use": rec.single_use,
        "viewer": {
            "authenticated": bool(me),
            "relationship": rel,
            "request_id": request_id,
        },
        "preview": {"user": {
            "id": owner,
            "display_name": user.get("display_name") or f"User {owner[:8]}",
            "avatar_key": user.get("avatar_key"),
        }},
        "actions": actions,
    }, 200


def act_on_code(me: str, code: str, data: dict) -> tuple[dict, int]:
    """Perform a /c/<code> action (add/accept/decline), consuming single-use codes."""
    action = (data.get("action") or "").strip().lower()
    code = (code or "").strip().upper()
    rec = FriendInviteCode.query.filter_by(code=code).first()
    if not rec:
        return {"error": "invite not found"}, 404
    owner = str(rec.owner_id)
    state = _code_state(rec)
    if state != "ok":
        return {"error": f"invite {state}"}, 409
    if me == owner:
        return {"error": "you can't add yourself"}, 400

    if action == "add":
        _body, status = send_request(me, {"user_id": owner})
        if status >= 400:
            return _body, status
    elif action in ("accept", "decline"):
        row = pair(me, owner)
        if not row or row.status != PENDING or row.addressee_id != me:
            return {"error": "no pending request to act on"}, 409
        _body, status = accept(me, row.id) if action == "accept" else decline(me, row.id)
        if status >= 400:
            return _body, status
    else:
        return {"error": "unsupported action"}, 400

    if rec.single_use:
        rec.consumed_at = datetime.utcnow()
        db.session.commit()
    return {"type": "friend", "target_id": owner}, 200


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
    my_name = resolve_users([me]).get(str(me)) or "Someone"
    _notify_friend(target_id, "friend_request", my_name, ref_id=str(me),
                   dedup_key=f"friend_req:{fr.id}")
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
    users = resolve_users_full([r.other_id(me) for r in rows])
    friends = [
        {
            "friendship_id": r.id,
            "user_id": r.other_id(me),
            "display_name": (users.get(r.other_id(me)) or {}).get("display_name")
            or f"User {r.other_id(me)}",
            "avatar_key": (users.get(r.other_id(me)) or {}).get("avatar_key"),
        }
        for r in rows
    ]
    return {"friends": friends}, 200


def list_requests(me: str) -> tuple[dict, int]:
    incoming = Friendship.query.filter_by(addressee_id=me, status=PENDING).all()
    outgoing = Friendship.query.filter_by(requester_id=me, status=PENDING).all()
    users = resolve_users_full(
        [r.requester_id for r in incoming] + [r.addressee_id for r in outgoing]
    )

    def _row(rid, uid):
        u = users.get(uid) or {}
        return {
            "id": rid,
            "user_id": uid,
            "display_name": u.get("display_name") or f"User {uid}",
            "avatar_key": u.get("avatar_key"),
        }

    return {
        "incoming": [_row(r.id, r.requester_id) for r in incoming],
        "outgoing": [_row(r.id, r.addressee_id) for r in outgoing],
    }, 200


def accept(me: str, req_id: str) -> tuple[dict, int]:
    fr = db.session.get(Friendship, req_id)
    if not fr or fr.addressee_id != me or fr.status != PENDING:
        return {"error": "request not found"}, 404
    fr.status = ACCEPTED
    db.session.commit()
    my_name = resolve_users([me]).get(str(me)) or "Someone"
    _notify_friend(fr.requester_id, "friend_accepted", my_name, ref_id=str(me),
                   dedup_key=f"friend_acc:{fr.id}")
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