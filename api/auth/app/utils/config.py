import os
from datetime import timedelta


class Config:
    SERVICE_GROUP = os.environ.get("SERVICE_GROUP", "platform")
    SERVICE_NAME = os.environ.get("SERVICE_NAME", "auth")
    APP_ENV = os.environ.get("APP_ENV", "development")
    GIT_SHA = os.environ.get("GIT_SHA", "dev")
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
    # The toll-free number that sends codes (and takes STOP/START). Shown to an
    # opted-out user so they know where to text START. Same number as the
    # notifications TWILIO_FROM; kept as its own env so the copy can't drift.
    AUTH_SMS_SENDER = os.environ.get("AUTH_SMS_SENDER", "+18335885058")
    # Anti-abuse for OTP-only auth.
    AUTH_OTP_RESEND_COOLDOWN_SECONDS = int(os.environ.get("AUTH_OTP_RESEND_COOLDOWN_SECONDS", 30))
    AUTH_OTP_MAX_ATTEMPTS = int(os.environ.get("AUTH_OTP_MAX_ATTEMPTS", 5))
    # Short-lived "phone proven, awaiting profile" ticket for new-user signup.
    AUTH_REG_TICKET_TTL_SECONDS = int(os.environ.get("AUTH_REG_TICKET_TTL_SECONDS", 900))
    # OTP is delivered by the notifications service (see service_sms). Points at
    # its API base incl. the /v1/... prefix; the send path is appended. Empty
    # falls back to log-only (the code is written to the auth logs).
    INTERNAL_NOTIFICATIONS_URL = os.environ.get(
        "INTERNAL_NOTIFICATIONS_URL", "http://notifications:8000/v1/platform/notifications"
    )
    # Profiles (display_name/avatar) now live in the users service; auth creates
    # the profile row at signup. Base incl. the /v1/... prefix; the
    # /internal/profiles/upsert path is appended. Internal calls use the Service
    # Connect mesh name http://users:8000 (namespace "waygerz") like every other
    # service — NOT the https://waygerz.com ALB, whose private-zone IPs drift on
    # ALB rotation. Leave INTERNAL_USERS_URL unset in prod so this default applies
    # (users must be registered in Service Connect).
    INTERNAL_USERS_URL = os.environ.get(
        "INTERNAL_USERS_URL", "http://users:8000/v1/platform/users"
    )
    # Fan-out targets for account deletion (DELETE /account orchestrator). Each is
    # a base incl. the /v1/<group>/<service> prefix; "/internal/purge-user" is
    # appended. Note the group is NOT uniform — gameplay/social/platform — so the
    # defaults are spelled out per service. Like the URLs above these use the
    # Service Connect mesh name (http://<svc>:8000); leave them UNSET in prod so
    # the mesh default applies (never the drifting ALB private zone).
    INTERNAL_CONTESTS_URL = os.environ.get(
        "INTERNAL_CONTESTS_URL", "http://contests:8000/v1/gameplay/contests"
    )
    INTERNAL_WALLET_URL = os.environ.get(
        "INTERNAL_WALLET_URL", "http://wallet:8000/v1/gameplay/wallet"
    )
    INTERNAL_LEAGUES_URL = os.environ.get(
        "INTERNAL_LEAGUES_URL", "http://leagues:8000/v1/gameplay/leagues"
    )
    INTERNAL_FRIENDS_URL = os.environ.get(
        "INTERNAL_FRIENDS_URL", "http://friends:8000/v1/social/friends"
    )
    INTERNAL_MESSAGING_URL = os.environ.get(
        "INTERNAL_MESSAGING_URL", "http://messaging:8000/v1/social/messaging"
    )
    INTERNAL_COMMENTS_URL = os.environ.get(
        "INTERNAL_COMMENTS_URL", "http://comments:8000/v1/social/comments"
    )
    INTERNAL_MEDIA_URL = os.environ.get(
        "INTERNAL_MEDIA_URL", "http://media:8000/v1/platform/media"
    )
    INTERNAL_TOKEN = os.environ.get("INTERNAL_TOKEN", "dev-internal-token")

    @classmethod
    def api_prefix(cls) -> str:
        return f"/v1/{cls.SERVICE_GROUP}/{cls.SERVICE_NAME}"