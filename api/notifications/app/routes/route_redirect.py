"""Public `/c/R<code>` redirect — resolve → log click → 302. Mounted OUTSIDE the
`/v1/...` prefix; only `/c/R*` reaches this service (routed by the ALB/gateway),
while `/c/B|L|F` go to the webui invite page."""
from flask import Blueprint, redirect, request
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request

from app.services.service_links import record_link_click, resolve_target

redirect_bp = Blueprint("redirect", __name__)

# Link-preview / scanner user-agents whose prefetch shouldn't count as a click.
_BOT_UA = (
    "bot", "crawler", "spider", "preview", "slackbot", "facebookexternalhit",
    "whatsapp", "telegrambot", "twitterbot", "discordbot", "curl", "wget",
    "python-requests", "go-http-client", "headless", "monitor", "pingdom",
)


def _client_ip():
    xff = request.headers.get("X-Forwarded-For", "")
    if xff:
        return xff.split(",")[0].strip()
    return request.headers.get("X-Real-IP") or request.remote_addr


def _is_bot_or_prefetch() -> bool:
    if request.headers.get("Purpose") == "prefetch" or request.headers.get("X-Purpose"):
        return True
    ua = (request.headers.get("User-Agent") or "").lower()
    return any(b in ua for b in _BOT_UA)


@redirect_bp.get("/<code>")
def follow(code):
    resolved = resolve_target(code)
    if resolved is None:
        # Unknown/expired code — 302 home, log nothing (don't let /c/R<random>
        # scans write rows).
        return redirect("/", code=302)
    target_path, kind = resolved

    if not _is_bot_or_prefetch():
        # Optional attribution — an expired/malformed cookie must NOT 5xx.
        user_id = None
        try:
            verify_jwt_in_request(optional=True)
            user_id = get_jwt_identity()
        except Exception:  # noqa: BLE001
            user_id = None
        record_link_click(
            code, kind, user_id=user_id,
            ua=request.headers.get("User-Agent"), ip=_client_ip(),
        )

    # 302 (never 301) to the stored relative path+query; browsers accept a
    # relative Location.
    return redirect(target_path, code=302)
