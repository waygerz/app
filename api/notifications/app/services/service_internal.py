"""Internal notifications: render, send, preferences (service-to-service)."""
import logging
import re

import requests
from flask import current_app

from app.extensions import db
from app.models.channel_pref import NotificationChannelPref
from app.models.device_token import DeviceToken
from app.models.message import FAILED, SENT, Message
from app.models.notification import Notification
from app.models.preference import NotificationPreference
from app.models.template import NotificationTemplate
from app.utils.config import Config

_VAR = re.compile(r"\{\{\s*(\w+)\s*\}\}")
logger = logging.getLogger(__name__)

# The user-configurable notification types and their default per-channel opt-in.
# `weekly_digest` and `marketing` are promotional → opt-in (off); everything
# else is transactional-ish and on by default. A category absent here is treated
# as on for both channels (so a newly added event type still notifies).
CHANNELS = ("sms", "inapp", "push")
CHANNEL_DEFAULTS = {
    "wager_alert": {"sms": True, "inapp": True, "push": True},
    "league_invite": {"sms": True, "inapp": True, "push": True},
    "friend_request": {"sms": True, "inapp": True, "push": True},
    # Post reactions — in-app only (never SMS/push), on by default, mutable.
    "reaction": {"sms": False, "inapp": True, "push": False},
    "weekly_digest": {"sms": False, "inapp": False, "push": False},
    # Promotional / marketing. Off by default — express opt-in only (TCPA), and
    # the toggle on /account is where users grant or withdraw that consent.
    "marketing": {"sms": False, "inapp": False, "push": False},
}


# Transactional "app notifications". `marketing` is intentionally NOT here — it's
# a separate promotional opt-in, governed only by its own toggle, never by the
# app-notifications master.
APP_NOTIFICATION_CATEGORIES = {"wager_alert", "league_invite", "friend_request", "weekly_digest"}


def channel_default(category: str, channel: str) -> bool:
    return CHANNEL_DEFAULTS.get(category, {}).get(channel, True)


def channel_enabled(user_id: str, category: str, channel: str) -> bool:
    """Is (category, channel) on for this user?

    `opted_out` is the "text me app notifications" master: when set it pauses
    SMS for the transactional categories only — it does NOT silence the in-app
    bell, and it never touches `marketing` (a separate opt-in). Otherwise a
    stored override wins; otherwise the code default."""
    if (
        channel == "sms"
        and category in APP_NOTIFICATION_CATEGORIES
        and _prefs(user_id).opted_out
    ):
        return False
    row = db.session.get(NotificationChannelPref, (str(user_id), category, channel))
    return row.enabled if row is not None else channel_default(category, channel)


def _resolve_phone(user_id: str):
    """Look a recipient's phone up from auth so triggers only pass user_id."""
    try:
        base = current_app.config["INTERNAL_AUTH_URL"]
        resp = requests.post(
            f"{base}/internal/users",
            json={"ids": [user_id]},
            headers={"X-Internal-Token": current_app.config["INTERNAL_TOKEN"]},
            timeout=10,
        )
        if resp.ok:
            users = resp.json().get("users") or []
            if users:
                return users[0].get("phone")
    except Exception:  # noqa: BLE001
        logger.exception("notify phone lookup failed user_id=%s", user_id)
    return None


class RenderError(ValueError):
    pass


class SmsProvider:
    def send(self, to: str, body: str) -> str:  # pragma: no cover - interface
        raise NotImplementedError


class LogProvider(SmsProvider):
    """Sends nothing — logs the message. Safe default until 10DLC is approved."""

    def send(self, to: str, body: str) -> str:
        print(f"[notifications:log] -> {to}: {body}", flush=True)
        return "log-noop"


class AwsProvider(SmsProvider):
    """AWS End User Messaging SMS (pinpoint-sms-voice-v2 SendTextMessage)."""

    def send(self, to: str, body: str) -> str:
        import boto3  # imported lazily so the dev image doesn't need AWS configured
        client = boto3.client("pinpoint-sms-voice-v2", region_name=current_app.config["AWS_REGION"])
        resp = client.send_text_message(
            DestinationPhoneNumber=to,
            OriginationIdentity=current_app.config["SMS_ORIGINATION_IDENTITY"],
            MessageBody=body,
            MessageType="TRANSACTIONAL",
        )
        return resp.get("MessageId", "")


class TwilioProvider(SmsProvider):
    """Twilio Programmable Messaging."""

    def send(self, to: str, body: str) -> str:
        from twilio.rest import Client  # imported lazily so log/aws don't need it
        client = Client(
            current_app.config["TWILIO_ACCOUNT_SID"],
            current_app.config["TWILIO_AUTH_TOKEN"],
        )
        msg = client.messages.create(
            to=to, from_=current_app.config["TWILIO_FROM"], body=body
        )
        return msg.sid


def get_provider() -> SmsProvider:
    provider = current_app.config["SMS_PROVIDER"]
    if provider == "aws":
        return AwsProvider()
    if provider == "twilio":
        return TwilioProvider()
    return LogProvider()


# --- Push (mobile) ---------------------------------------------------------
# One provider covers both platforms: FCM's HTTP v1 API delivers to Android
# directly and relays to APNs for iOS. Default "log" sends nothing until creds
# are wired, mirroring the SMS provider pattern.

class PushProvider:
    def send(self, token: str, title: str, body: str, data: dict) -> str:  # pragma: no cover - interface
        raise NotImplementedError


class LogPushProvider(PushProvider):
    def send(self, token: str, title: str, body: str, data: dict) -> str:
        print(f"[notifications:push:log] -> {token[:12]}…: {title} — {body}", flush=True)
        return "log-noop"


class FcmProvider(PushProvider):
    """Firebase Cloud Messaging HTTP v1. Service-account auth; one call per token."""

    def _credentials(self):
        import json
        from google.oauth2 import service_account  # lazy: only fcm needs it

        scopes = ["https://www.googleapis.com/auth/firebase.messaging"]
        raw = current_app.config.get("FCM_CREDENTIALS_JSON")
        if raw:
            return service_account.Credentials.from_service_account_info(json.loads(raw), scopes=scopes)
        return service_account.Credentials.from_service_account_file(
            current_app.config["FCM_CREDENTIALS_FILE"], scopes=scopes
        )

    def send(self, token: str, title: str, body: str, data: dict) -> str:
        from google.auth.transport.requests import Request as GAuthRequest

        creds = self._credentials()
        creds.refresh(GAuthRequest())
        project = current_app.config["FCM_PROJECT_ID"]
        # FCM data values must be strings.
        str_data = {k: str(v) for k, v in (data or {}).items() if v is not None}
        resp = requests.post(
            f"https://fcm.googleapis.com/v1/projects/{project}/messages:send",
            headers={"Authorization": f"Bearer {creds.token}"},
            json={"message": {"token": token, "notification": {"title": title, "body": body}, "data": str_data}},
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json().get("name", "")


def get_push_provider() -> PushProvider:
    if current_app.config["PUSH_PROVIDER"] == "fcm":
        return FcmProvider()
    return LogPushProvider()


def register_device(user_id: str, platform: str, token: str) -> dict:
    """Upsert a device push token. A token is globally unique, so re-registering
    moves it to the current user (e.g. a shared/handed-down device)."""
    platform = (platform or "").strip().lower()
    token = (token or "").strip()
    if platform not in ("ios", "android") or not token:
        raise ValueError("platform must be ios|android and token is required")
    row = DeviceToken.query.filter_by(token=token).first()
    if row is None:
        row = DeviceToken(user_id=str(user_id), platform=platform, token=token)
        db.session.add(row)
    else:
        row.user_id = str(user_id)
        row.platform = platform
    db.session.commit()
    return row.to_dict()


def unregister_device(user_id: str, token: str) -> int:
    """Remove one of the caller's tokens (logout / uninstall)."""
    n = DeviceToken.query.filter_by(user_id=str(user_id), token=(token or "").strip()).delete()
    db.session.commit()
    return n


def _send_push(user_id: str, title: str, body: str, data: dict) -> dict:
    """Fan a notification out to all of a user's registered devices. Best-effort:
    a dead token is pruned; a provider error is logged, never raised."""
    tokens = DeviceToken.query.filter_by(user_id=str(user_id)).all()
    if not tokens:
        return {"sent": 0}
    provider = get_push_provider()
    sent = 0
    for dt in tokens:
        try:
            provider.send(dt.token, title, body, data)
            sent += 1
        except Exception as exc:  # noqa: BLE001
            msg = str(exc)
            # FCM reports a stale token with 404/UNREGISTERED — prune it.
            if "404" in msg or "UNREGISTERED" in msg or "not a valid FCM" in msg:
                db.session.delete(dt)
                db.session.commit()
            else:
                logger.exception("push send failed user=%s", user_id)
    return {"sent": sent}


def render(key: str, context: dict, *, locale: str = "en", channel: str = "sms") -> str:
    tpl = (
        NotificationTemplate.query.filter_by(key=key, channel=channel, active=True)
        .order_by(NotificationTemplate.version.desc())
        .first()
    )
    if not tpl:
        raise RenderError(f"no active template for {key}/{channel}")

    missing = [v for v in _VAR.findall(tpl.body) if v not in context]
    if missing:
        raise RenderError(f"missing template vars for {key}: {missing}")

    body = _VAR.sub(lambda m: str(context[m.group(1)]), tpl.body)
    return f"{Config.SMS_BRAND_PREFIX}: {body}" if not body.startswith(Config.SMS_BRAND_PREFIX) else body


def _prefs(user_id) -> NotificationPreference:
    p = db.session.get(NotificationPreference, user_id)
    if not p:
        p = NotificationPreference(user_id=user_id)
        db.session.add(p)
        db.session.commit()
    return p


def send(data: dict) -> tuple[dict, int]:
    """Render a template + send it (respecting prefs + dedup). Body:
    { user_id, to (phone), category, template_key, context{}, dedup_key? }."""
    user_id = str(data.get("user_id", ""))
    to = data.get("to")
    category = data.get("category", "")
    key = data.get("template_key", "")
    context = data.get("context") or {}
    dedup_key = data.get("dedup_key")

    # OTP is transactional: it always sends, needs no known user (a phone may be
    # signing up), and ignores marketing preferences.
    transactional = category == "otp"
    if not (to and key):
        return {"error": "to and template_key are required"}, 400
    if not (user_id or transactional):
        return {"error": "user_id is required for non-transactional messages"}, 400

    if user_id and not transactional and not channel_enabled(user_id, category, "sms"):
        return {"skipped": "muted"}, 200

    if dedup_key and Message.query.filter_by(dedup_key=dedup_key).first():
        return {"deduped": True}, 200

    try:
        body = render(key, context)
    except RenderError as e:
        return {"error": str(e)}, 400

    msg = Message(user_id=user_id or None, category=category, body=body, dedup_key=dedup_key)
    db.session.add(msg)
    db.session.flush()
    try:
        msg.provider_msg_id = get_provider().send(to, body)
        msg.status = SENT
    except Exception as exc:  # noqa: BLE001
        msg.status = FAILED
        db.session.commit()
        return {"error": f"send failed: {exc}", "message": msg.to_dict()}, 502
    db.session.commit()
    return {"message": msg.to_dict()}, 200


def notify(data: dict) -> tuple[dict, int]:
    """One trigger, fanned out to the in-app feed and (optionally) SMS. Body:
      { user_id, category, title, template_key?, context{}, to?,
        channels? (default ["inapp","sms"]), ref_type?, ref_id?, deep_link?,
        dedup_key? }

    The template renders the shared body (used for both the feed row and the
    text). The feed row is the app's notifications sheet; SMS reuses send() so
    it keeps the same prefs, dedup and delivery. A fully opted-out user gets
    neither. Returns what happened per channel.
    """
    user_id = str(data.get("user_id", ""))
    category = data.get("category", "")
    title = data.get("title", "")
    key = data.get("template_key", "")
    context = data.get("context") or {}
    channels = data.get("channels") or ["inapp", "sms"]
    to = data.get("to")
    dedup_key = data.get("dedup_key")

    if not (user_id and category and (title or key)):
        return {"error": "user_id, category and a title or template_key are required"}, 400

    # Shared body: render the template if given, else fall back to the title.
    try:
        body = render(key, context) if key else title
    except RenderError as e:
        return {"error": str(e)}, 400

    result: dict = {}

    # In-app feed. Honors the global stop and the per-type in-app opt-in.
    if "inapp" in channels:
        if not channel_enabled(user_id, category, "inapp"):
            result["inapp"] = "muted"
        elif dedup_key and Notification.query.filter_by(dedup_key=dedup_key).first():
            result["inapp"] = "deduped"
        else:
            actor = data.get("actor") or {}
            n = Notification(
                user_id=user_id,
                category=category,
                template_key=key or None,
                title=title or body,
                body=body,
                actor_id=actor.get("id"),
                actor_name=actor.get("name"),
                actor_avatar_key=actor.get("avatar_key"),
                ref_type=data.get("ref_type"),
                ref_id=data.get("ref_id"),
                deep_link=data.get("deep_link"),
                dedup_key=dedup_key,
            )
            db.session.add(n)
            db.session.commit()
            result["inapp"] = n.id

    # SMS via the existing pipeline (prefs + dedup + provider). Needs a template
    # to render and a phone — resolved from the recipient's user_id when the
    # caller didn't pass one. A distinct dedup suffix keeps it independent of the
    # feed row's dedup.
    if "sms" in channels and key and not to:
        to = _resolve_phone(user_id)
    if "sms" in channels and to and key:
        sms_body, _ = send(
            {
                "user_id": user_id,
                "to": to,
                "category": category,
                "template_key": key,
                "context": context,
                "dedup_key": f"{dedup_key}:sms" if dedup_key else None,
            }
        )
        result["sms"] = sms_body

    # Push to the user's registered mobile devices. Honors the per-type push
    # opt-in; reuses the rendered body + title and carries the deep link so a tap
    # lands on the right screen.
    if "push" in channels and channel_enabled(user_id, category, "push"):
        result["push"] = _send_push(
            user_id,
            title or body,
            body,
            {
                "category": category,
                "ref_type": data.get("ref_type"),
                "ref_id": data.get("ref_id"),
                "deep_link": data.get("deep_link"),
            },
        )

    return {"result": result}, 200


def get_preferences_matrix(user_id: str) -> dict:
    """The user's full preference state: the global stop plus every configurable
    (category, channel) resolved to its effective on/off (stored override or
    default)."""
    user_id = str(user_id)
    stored = {
        (r.category, r.channel): r.enabled
        for r in NotificationChannelPref.query.filter_by(user_id=user_id).all()
    }
    channels = {
        cat: {
            ch: stored.get((cat, ch), channel_default(cat, ch))
            for ch in CHANNELS
        }
        for cat in CHANNEL_DEFAULTS
    }
    return {"opted_out": _prefs(user_id).opted_out, "channels": channels}


def set_preferences_matrix(user_id: str, data: dict) -> dict:
    """Apply a partial preference patch. `opted_out` sets the app-notifications
    SMS master (true = pause transactional SMS); `channels` is
    {category: {channel: bool}} and upserts only the pairs given. Unknown
    categories/channels are ignored."""
    user_id = str(user_id)
    p = _prefs(user_id)
    if "opted_out" in data:
        p.opted_out = bool(data["opted_out"])
    for cat, chans in (data.get("channels") or {}).items():
        if cat not in CHANNEL_DEFAULTS or not isinstance(chans, dict):
            continue
        for ch, val in chans.items():
            if ch not in CHANNELS:
                continue
            row = db.session.get(NotificationChannelPref, (user_id, cat, ch))
            if row is None:
                row = NotificationChannelPref(user_id=user_id, category=cat, channel=ch)
                db.session.add(row)
            row.enabled = bool(val)
    db.session.commit()
    return get_preferences_matrix(user_id)


def set_preferences(data: dict) -> tuple[dict, int]:
    """Internal (service-to-service) entrypoint — user_id comes from the body."""
    matrix = set_preferences_matrix(str(data.get("user_id", "")), data)
    return {"preferences": matrix}, 200