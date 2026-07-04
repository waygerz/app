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


def clear_auth_cookies(response) -> None:
    access_name, refresh_name = auth_cookie_names()
    cookie_kwargs = auth_cookie_kwargs()
    response.set_cookie(access_name, "", max_age=0, expires=0, **cookie_kwargs)
    response.set_cookie(refresh_name, "", max_age=0, expires=0, **cookie_kwargs)
    clear_session_marker(response)


def set_session_marker(response) -> None:
    response.set_cookie(
        SESSION_MARKER_COOKIE,
        "1",
        max_age=int(Config.JWT_REFRESH_TOKEN_EXPIRES.total_seconds()),
        **session_marker_kwargs(),
    )


def clear_session_marker(response) -> None:
    response.set_cookie(
        SESSION_MARKER_COOKIE,
        "",
        max_age=0,
        expires=0,
        **session_marker_kwargs(),
    )