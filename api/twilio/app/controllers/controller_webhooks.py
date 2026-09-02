"""Thin request/response wiring for the Twilio webhooks. All responses are TwiML
(text/xml), never JSON."""
from flask import Response, request

from app.services import service_notify, service_sms, service_voice

_XML = "text/xml"


def _xml(body: str) -> Response:
    return Response(body, mimetype=_XML)


def incoming_voice() -> Response:
    return _xml(
        service_voice.build_incoming(request.form.get("CallSid"), request.form.get("From"))
    )


def voice_screen() -> Response:
    # `call` (query) = the parent call SID threaded from /voice, so the accept
    # marker correlates to the original inbound call, not this child leg.
    return _xml(service_voice.build_screen(request.form.get("Digits"), request.args.get("call")))


def voice_after() -> Response:
    return _xml(
        service_voice.build_after(
            request.form.get("CallSid"),
            request.form.get("DialCallStatus"),
            request.form.get("DialCallDuration"),
        )
    )


def incoming_sms() -> Response:
    return _xml(service_sms.handle_inbound(request.form))


def notify_voice() -> Response:
    # Inbound call to the notifications line: announce the help number, hang up.
    return _xml(service_notify.announce_voice())


def notify_sms() -> Response:
    # Inbound text to the notifications line: auto-reply with the help number.
    return _xml(service_notify.announce_sms(request.form))
