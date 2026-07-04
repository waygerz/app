"""Internal notifications: render, send, preferences (service-to-service)."""
import re

from flask import current_app

from app.extensions import db
from app.models.message import FAILED, SENT, Message
from app.models.preference import NotificationPreference
from app.models.template import NotificationTemplate
from app.utils.config import Config

_VAR = re.compile(r"\{\{\s*(\w+)\s*\}\}")


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


def get_provider() -> SmsProvider:
    return AwsProvider() if current_app.config["SMS_PROVIDER"] == "aws" else LogProvider()


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

    if not (user_id and to and key):
        return {"error": "user_id, to and template_key are required"}, 400

    prefs = _prefs(user_id)
    if prefs.opted_out:
        return {"skipped": "opted_out"}, 200
    if category == "weekly_digest" and not prefs.weekly_digest:
        return {"skipped": "not_subscribed"}, 200
    if category == "wager_alert" and not prefs.wager_alerts:
        return {"skipped": "muted"}, 200

    if dedup_key and Message.query.filter_by(dedup_key=dedup_key).first():
        return {"deduped": True}, 200

    try:
        body = render(key, context)
    except RenderError as e:
        return {"error": str(e)}, 400

    msg = Message(user_id=user_id, category=category, body=body, dedup_key=dedup_key)
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


def set_preferences(data: dict) -> tuple[dict, int]:
    p = _prefs(str(data.get("user_id", "")))
    for f in ("wager_alerts", "weekly_digest", "opted_out"):
        if f in data:
            setattr(p, f, bool(data[f]))
    db.session.commit()
    return {"preferences": p.to_dict()}, 200