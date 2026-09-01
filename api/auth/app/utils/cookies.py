"""HttpOnly auth cookies + non-HttpOnly session marker for the SPA."""
import logging

from app.utils.config import Config

logger = logging.getLogger(__name__)

SESSION_MARKER_COOKIE = "waygerz_session"


def auth_cookie_names() -> tuple[str, str]:
    return Config.JWT_ACCESS_COOKIE_NAME, Config.JWT_REFRESH_COOKIE_NAME


def auth_cookie_kwargs() -> dict:
    samesite = (Config.JWT_COOKIE_SAMESITE or "Lax").strip()
    secure = bool(Config.JWT_COOKIE_SECURE)

    if samesite.lower() == "none" and not secure:
        logger.warning("auth_cookie_invalid_config_samesite_none_requires_secure")
        secure = True

    kwargs = {
        "httponly": True,
        "secure": secure,
        "samesite": samesite,
        "path": Config.JWT_COOKIE_PATH or "/",
    }
    if Config.JWT_COOKIE_DOMAIN:
        kwargs["domain"] = Config.JWT_COOKIE_DOMAIN
    return kwargs


def session_marker_kwargs() -> dict:
    kwargs = auth_cookie_kwargs()
    kwargs["httponly"] = False
    return kwargs


def _expire_all_scopes(response, name: str, *, httponly: bool) -> None:
    """Expire a cookie in BOTH scopes it may exist in: the configured domain
    (e.g. ``.waygerz.com``) AND host-only (no Domain).

    A host-only straggler left over from before the cookie domain was configured
    (or signed with an older JWT secret) would otherwise survive a fresh login
    and be sent on the next refresh, failing signature verification and logging
    the user out — every time, in a loop. Expiring both scopes kills it."""
    base = auth_cookie_kwargs() if httponly else session_marker_kwargs()
    response.set_cookie(name, "", max_age=0, expires=0, **base)
    if "domain" in base:
        host_only = {k: v for k, v in base.items() if k != "domain"}
        response.set_cookie(name, "", max_age=0, expires=0, **host_only)


def _sweep_host_only(response) -> None:
    """When a cookie domain is configured, proactively expire any host-only
    variants so a stale straggler is swept the moment we set fresh cookies —
    healing an affected user on their next login, with no extra logout."""
    if not Config.JWT_COOKIE_DOMAIN:
        return
    access_name, refresh_name = auth_cookie_names()
    host_only = {k: v for k, v in auth_cookie_kwargs().items() if k != "domain"}
    marker_host = {k: v for k, v in session_marker_kwargs().items() if k != "domain"}
    for name in (access_name, refresh_name):
        response.set_cookie(name, "", max_age=0, expires=0, **host_only)
    response.set_cookie(SESSION_MARKER_COOKIE, "", max_age=0, expires=0, **marker_host)


def attach_auth_cookies(response, access_token: str, refresh_token: str) -> None:
    access_name, refresh_name = auth_cookie_names()
    cookie_kwargs = auth_cookie_kwargs()
    response.set_cookie(
        access_name,
        access_token,
        max_age=int(Config.JWT_ACCESS_TOKEN_EXPIRES.total_seconds()),
        **cookie_kwargs,
    )
    response.set_cookie(
        refresh_name,
        refresh_token,
        max_age=int(Config.JWT_REFRESH_TOKEN_EXPIRES.total_seconds()),
        **cookie_kwargs,
    )
    set_session_marker(response)
    # Sweep any legacy host-only cookies (a different scope than what we just
    # set) so they can't poison the next refresh.
    _sweep_host_only(response)


def clear_auth_cookies(response) -> None:
    access_name, refresh_name = auth_cookie_names()
    _expire_all_scopes(response, access_name, httponly=True)
    _expire_all_scopes(response, refresh_name, httponly=True)
    _expire_all_scopes(response, SESSION_MARKER_COOKIE, httponly=False)


def set_session_marker(response) -> None:
    response.set_cookie(
        SESSION_MARKER_COOKIE,
        "1",
        max_age=int(Config.JWT_REFRESH_TOKEN_EXPIRES.total_seconds()),
        **session_marker_kwargs(),
    )


