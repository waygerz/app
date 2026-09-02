from flask import Blueprint

from app.controllers import controller_webhooks as ctrl
from app.utils.guards import twilio_signature_required

twilio_webhooks_bp = Blueprint("webhooks", __name__)


@twilio_webhooks_bp.post("/voice")
@twilio_signature_required
def incoming_voice():
    return ctrl.incoming_voice()


@twilio_webhooks_bp.post("/voice/screen")
@twilio_signature_required
def voice_screen():
    return ctrl.voice_screen()


@twilio_webhooks_bp.post("/voice/after")
@twilio_signature_required
def voice_after():
    return ctrl.voice_after()


@twilio_webhooks_bp.post("/sms")
@twilio_signature_required
def incoming_sms():
    return ctrl.incoming_sms()


# --- Notifications line (TWILIO_FROM) auto-attendant ------------------------
# The outbound-only sender number isn't forwarded; inbound calls/texts get an
# announcement pointing at the help line. Point that number's Twilio voice/sms
# webhooks at these paths (the help line stays on /voice and /sms above).
@twilio_webhooks_bp.post("/notify/voice")
@twilio_signature_required
def notify_voice():
    return ctrl.notify_voice()


@twilio_webhooks_bp.post("/notify/sms")
@twilio_signature_required
def notify_sms():
    return ctrl.notify_sms()
