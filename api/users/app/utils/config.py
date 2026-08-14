import os
from datetime import timedelta


class Config:
    SERVICE_GROUP = os.environ.get("SERVICE_GROUP", "platform")
    SERVICE_NAME = os.environ.get("SERVICE_NAME", "users")
    APP_ENV = os.environ.get("APP_ENV", "development")
    GIT_SHA = os.environ.get("GIT_SHA", "dev")
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-change-me")

    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL",
        "postgresql+psycopg2://waygerz:waygerz@pgsql:5432/waygerz",
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    DB_SCHEMA = os.environ.get("DB_SCHEMA", "users")
    SQLALCHEMY_ENGINE_OPTIONS = {
        "connect_args": {"options": f"-csearch_path={DB_SCHEMA}"}
    }

    # JWT is minted by the auth service; we only *verify* it locally with the
    # shared secret (flask-jwt-extended). Same cookie/header contract as every
    # other service so `Authorization: Bearer` and the web cookie both work.
    JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "dev-jwt-secret-change-me")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(
        seconds=int(os.environ.get("JWT_ACCESS_TOKEN_EXPIRES", 15 * 60))
    )
    JWT_TOKEN_LOCATION = ["cookies", "headers"]
    JWT_COOKIE_SECURE = os.environ.get("AUTH_COOKIE_SECURE", "false").lower() in ("1", "true", "yes")
    JWT_COOKIE_SAMESITE = os.environ.get("AUTH_COOKIE_SAMESITE", "Lax")
    JWT_COOKIE_CSRF_PROTECT = False
    JWT_ACCESS_COOKIE_NAME = os.environ.get("AUTH_COOKIE_ACCESS_NAME", "waygerz_access")
    JWT_REFRESH_COOKIE_NAME = os.environ.get("AUTH_COOKIE_REFRESH_NAME", "waygerz_refresh")

    REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")
    CORS_ALLOWED_ORIGINS = [
        o.strip()
        for o in os.environ.get(
            "CORS_ALLOWED_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173,https://waygerz.com",
        ).split(",")
        if o.strip()
    ]

    INTERNAL_TOKEN = os.environ.get("INTERNAL_TOKEN", "dev-internal-token")

    # Avatar keys are minted by the media service under this prefix; the profile
    # avatar setter enforces it so an arbitrary S3 key can't be stored. Mirrors
    # the guard that used to live in auth.set_avatar.
    AVATAR_KEY_PREFIX = os.environ.get("AVATAR_KEY_PREFIX", "members/avatars/")

    # Favorite-team cap per user (enforced in the service, not the DB).
    FAVORITE_TEAMS_MAX = int(os.environ.get("FAVORITE_TEAMS_MAX", 6))

    # No-favorites nudge (scheduler-driven /internal/tick). A user with zero
    # favorites this long after signup gets a one-time in-app notification. The
    # notifications base includes the /v1/... prefix; /internal/notify is
    # appended. In prod this MUST be the https://waygerz.com ALB form.
    NOTIFICATIONS_URL = os.environ.get(
        "INTERNAL_NOTIFICATIONS_URL", "http://notifications:8000/v1/platform/notifications"
    )
    FAVORITES_NUDGE_AFTER_HOURS = int(os.environ.get("FAVORITES_NUDGE_AFTER_HOURS", 24))
    # Kept small so batch × per-nudge timeout stays well under the scheduler's
    # 120s per-tick read window even if notifications is slow.
    FAVORITES_NUDGE_BATCH = int(os.environ.get("FAVORITES_NUDGE_BATCH", 25))
    FAVORITES_NUDGE_DEEP_LINK = os.environ.get("FAVORITES_NUDGE_DEEP_LINK", "/account")

    @classmethod
    def api_prefix(cls) -> str:
        return f"/v1/{cls.SERVICE_GROUP}/{cls.SERVICE_NAME}"
