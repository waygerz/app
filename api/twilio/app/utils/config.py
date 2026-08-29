from __future__ import annotations

import json
import logging
import os
import re


def _as_bool(val: str, default: bool) -> bool:
    # Treat unset AND empty/whitespace as "use the default" — a blank env var
    # (e.g. an empty SSM param) must NOT silently read as False and disable
    # signature validation in prod.
    if val is None or not val.strip():
        return default
    return val.strip().lower() in ("1", "true", "yes", "on")


def _as_int(name: str, default: int) -> int:
    """Env int with a clear failure: a non-numeric value fails fast at import with
    a named error rather than an opaque ValueError deep in the stack."""
    raw = os.environ.get(name)
    if raw is None or not raw.strip():
        return default
    try:
        return int(raw)
    except ValueError as exc:
        raise RuntimeError(f"{name} must be an integer, got {raw!r}") from exc


logger = logging.getLogger(__name__)


_DIGITS = re.compile(r"\d")


def normalize_e164(raw: str, default_country: str = "1") -> str:
    """Best-effort E.164 normalization so self/sender-exclude comparisons can't be
    defeated by formatting ('+1 833…' vs '833…'). Keeps a leading +, strips all
    other non-digits, and prepends the default country code for a bare NANP
    10-digit number. Not a full libphonenumber — just enough to compare our own
    roster and the inbound `From` consistently."""
    if not raw:
        return ""
    raw = raw.strip()
    digits = "".join(_DIGITS.findall(raw))
    if not digits:
        return ""
    if len(digits) == 10:  # bare NANP number -> add country code
        digits = default_country + digits
    return "+" + digits


class Config:
    SERVICE_GROUP = os.environ.get("SERVICE_GROUP", "platform")
    SERVICE_NAME = os.environ.get("SERVICE_NAME", "twilio")
    APP_ENV = os.environ.get("APP_ENV", "development")
    GIT_SHA = os.environ.get("GIT_SHA", "dev")
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-change-me")

    REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")

    # --- Twilio credentials (SecureString via SSM in prod; dummy locally) ------
    # The auth token doubles as the webhook signature key AND the REST send key.
    TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
    TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
    TWILIO_FROM = normalize_e164(os.environ.get("TWILIO_FROM", ""))

    # --- Signature validation --------------------------------------------------
    # Twilio signs the exact public URL it called; behind the ALB Flask can't see
    # it, so we reconstruct from this base. No safe default — create_app() fails
    # fast if it's unset while validation is on (see __init__).
    TWILIO_WEBHOOK_BASE_URL = os.environ.get("TWILIO_WEBHOOK_BASE_URL", "").rstrip("/")
    TWILIO_VALIDATE_SIGNATURE = _as_bool(os.environ.get("TWILIO_VALIDATE_SIGNATURE"), True)

    # --- Behavior --------------------------------------------------------------
    SMS_BRAND_PREFIX = os.environ.get("SMS_BRAND_PREFIX", "Waygerz")
    VOICE_SCREEN = _as_bool(os.environ.get("VOICE_SCREEN"), True)
    VOICE_TIMEOUT = _as_int("VOICE_TIMEOUT", 20)
    # Seconds the answering party has to press 1 to accept (the whisper Gather).
    # Longer = more forgiving for a distracted human, but a voicemail leg also
    # sits "answered" this much longer — VOICE_SCREEN_GRACE below tracks it.
    VOICE_SCREEN_TIMEOUT = _as_int("VOICE_SCREEN_TIMEOUT", 5)
    # How long the "human pressed 1" accept marker lives — must outlast the call
    # so /voice/after can still read it after the parties hang up.
    VOICE_ACCEPT_TTL = _as_int("VOICE_ACCEPT_TTL", 3600)
    # Fan-out cap + per-sender rate limit (abuse / cost guard).
    FORWARD_MAX = _as_int("FORWARD_MAX", 10)
    RATE_LIMIT_MAX = _as_int("RATE_LIMIT_MAX", 20)  # inbound / window / sender
    RATE_LIMIT_WINDOW = _as_int("RATE_LIMIT_WINDOW", 3600)  # seconds

    @classmethod
    def api_prefix(cls) -> str:
        return f"/v1/{cls.SERVICE_GROUP}/{cls.SERVICE_NAME}"

    @classmethod
    def forward_to(cls) -> list[dict]:
        """Parse the FORWARD_TO roster (SSM JSON) into normalized entries:
        [{"number": "+1…", "name": "Sam"|None}]. Accepts a JSON array of objects,
        a JSON array of bare number strings, or a comma-separated string. Numbers
        are E.164-normalized; the main line (TWILIO_FROM) is excluded so a forward
        can never loop back to itself. Empty/invalid entries are dropped."""
        raw = os.environ.get("FORWARD_TO", "").strip()
        if not raw:
            return []
        entries: list[dict] = []
        if raw.startswith("[") or raw.startswith("{"):
            # Looks like JSON — parse it strictly. Do NOT fall through to
            # digit-scraping on failure: a truncated roster would otherwise
            # synthesize a bogus destination from digits in the broken JSON.
            try:
                parsed = json.loads(raw)
            except json.JSONDecodeError:
                logger.error("FORWARD_TO is not valid JSON; treating roster as empty")
                return []
            if isinstance(parsed, dict):
                parsed = [parsed]
        else:
            parsed = [p for p in re.split(r"[,\n]", raw) if p.strip()]
        for item in parsed:
            if isinstance(item, str):
                number, name = item, None
            elif isinstance(item, dict):
                number, name = item.get("number", ""), item.get("name")
            else:
                continue
            e164 = normalize_e164(number)
            if not e164 or e164 == cls.TWILIO_FROM:
                continue
            entries.append({"number": e164, "name": name})
        # de-dupe by number, preserve order
        seen, out = set(), []
        for e in entries:
            if e["number"] not in seen:
                seen.add(e["number"])
                out.append(e)
        return out
