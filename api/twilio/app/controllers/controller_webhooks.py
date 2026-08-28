"""Thin request/response wiring for the Twilio webhooks. All responses are TwiML
(text/xml), never JSON."""
from flask import Response, request

from app.services import service_sms, service_voice

_XML = "text/xml"


def _xml(body: str) -> Response:
    return Response(body, mimetype=_XML)


def incoming_voice() -> Response:
    return _xml(service_voice.build_incoming(request.form.get("CallSid")))


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
