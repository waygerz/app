"""Twilio webhook authentication.

These routes are public (no waygerz JWT). We authenticate each request by
validating the `X-Twilio-Signature` HMAC that Twilio computes over the exact
public URL it called plus the POST params. Behind the ALB, Flask can't see that
public URL (different scheme/host, no `/api`), so we reconstruct it from
`TWILIO_WEBHOOK_BASE_URL` + the route suffix rather than trusting `request.url`.
"""
from functools import wraps

from flask import abort, current_app, request
from twilio.request_validator import RequestValidator


def _public_url() -> str:
    """The exact URL Twilio signed: base + this request's path below the api
    prefix + any query string. Uses the actual matched path, so /voice/after and
    /voice/screen (incl. the ?call= we thread onto the screen callbacks) validate
    the same way /voice does — no hardcoded suffix, and the query string is part
    of what Twilio signs."""
    base = current_app.config["TWILIO_WEBHOOK_BASE_URL"]
    prefix = f"/v1/{current_app.config['SERVICE_GROUP']}/{current_app.config['SERVICE_NAME']}"
    suffix = request.path[len(prefix):] if request.path.startswith(prefix) else request.path
    qs = request.query_string.decode("latin-1")
    return base + suffix + (f"?{qs}" if qs else "")


def twilio_signature_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not current_app.config["TWILIO_VALIDATE_SIGNATURE"]:
            return fn(*args, **kwargs)
        signature = request.headers.get("X-Twilio-Signature", "")
        validator = RequestValidator(current_app.config["TWILIO_AUTH_TOKEN"])
        # request.form is exactly the urlencoded POST params Twilio signed.
        if not validator.validate(_public_url(), request.form.to_dict(flat=True), signature):
            current_app.logger.warning(
                "twilio signature rejected path=%s from=%s",
                request.path, request.form.get("From"),
            )
            abort(403)
        return fn(*args, **kwargs)

    return wrapper
