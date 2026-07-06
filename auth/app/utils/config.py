import os
from datetime import timedelta


class Config:
    SERVICE_GROUP = os.environ.get("SERVICE_GROUP", "platform")
    SERVICE_NAME = os.environ.get("SERVICE_NAME", "auth")
    APP_ENV = os.environ.get("APP_ENV", "development")
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-change-me")

    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL",
        "postgresql+psycopg2://waygerz:waygerz@pgsql:5432/waygerz",
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    DB_SCHEMA = os.environ.get("DB_SCHEMA", "auth")
    SQLALCHEMY_ENGINE_OPTIONS = {
        "connect_args": {"options": f"-csearch_path={DB_SCHEMA}"}
    }

    JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "dev-jwt-secret-change-me")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(
        seconds=int(os.environ.get("JWT_ACCESS_TOKEN_EXPIRES", 15 * 60))
    )
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(
        seconds=int(os.environ.get("JWT_REFRESH_TOKEN_EXPIRES", 60 * 60 * 24 * 90))
    )
    JWT_TOKEN_LOCATION = ["cookies", "headers"]
    JWT_COOKIE_SECURE = os.environ.get("AUTH_COOKIE_SECURE", "false").lower() in ("1", "true", "yes")
    JWT_COOKIE_SAMESITE = os.environ.get("AUTH_COOKIE_SAMESITE", "Lax")
    JWT_COOKIE_CSRF_PROTECT = False
    JWT_ACCESS_COOKIE_NAME = os.environ.get("AUTH_COOKIE_ACCESS_NAME", "waygerz_access")
    JWT_REFRESH_COOKIE_NAME = os.environ.get("AUTH_COOKIE_REFRESH_NAME", "waygerz_refresh")
    JWT_COOKIE_DOMAIN = os.environ.get("AUTH_COOKIE_DOMAIN") or None
    JWT_COOKIE_PATH = os.environ.get("AUTH_COOKIE_PATH", "/")

    REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")
    CORS_ALLOWED_ORIGINS = [
        o.strip()
        for o in os.environ.get(
            "CORS_ALLOWED_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173,https://waygerz.com",
        ).split(",")
        if o.strip()
    ]
    OTP_TTL_SECONDS = int(os.environ.get("AUTH_OTP_TTL_SECONDS", 300))
    # Reveal the OTP in the API response (shown beneath the login card). Non-prod
    # always reveals; in prod this flag turns it on for testing until real SMS is
    # wired. WARNING: while on, there is no real phone verification.
    AUTH_REVEAL_OTP = os.environ.get("AUTH_REVEAL_OTP", "false").lower() in ("1", "true", "yes")
    # Anti-abuse for OTP-only auth.
    AUTH_OTP_RESEND_COOLDOWN_SECONDS = int(os.environ.get("AUTH_OTP_RESEND_COOLDOWN_SECONDS", 30))
    AUTH_OTP_MAX_ATTEMPTS = int(os.environ.get("AUTH_OTP_MAX_ATTEMPTS", 5))
    # Short-lived "phone proven, awaiting profile" ticket for new-user signup.
    AUTH_REG_TICKET_TTL_SECONDS = int(os.environ.get("AUTH_REG_TICKET_TTL_SECONDS", 900))
    INTERNAL_TOKEN = os.environ.get("INTERNAL_TOKEN", "dev-internal-token")

    @classmethod
    def api_prefix(cls) -> str:
        return f"/v1/{cls.SERVICE_GROUP}/{cls.SERVICE_NAME}"