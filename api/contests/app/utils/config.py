import os
from datetime import timedelta


class Config:
    SERVICE_GROUP = os.environ.get("SERVICE_GROUP", "gameplay")
    SERVICE_NAME = os.environ.get("SERVICE_NAME", "contests")
    APP_ENV = os.environ.get("APP_ENV", "development")
    GIT_SHA = os.environ.get("GIT_SHA", "dev")
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-change-me")

    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL",
        "postgresql+psycopg2://waygerz:waygerz@pgsql:5432/waygerz",
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # This service owns its own Postgres schema (pinned via search_path).
    DB_SCHEMA = os.environ.get("DB_SCHEMA", "contests")
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
    CORS_ALLOWED_ORIGINS = [
        o.strip()
        for o in os.environ.get(
            "CORS_ALLOWED_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173,https://waygerz.com",
        ).split(",")
        if o.strip()
    ]

    MIN_WAGER_CENTS = int(os.environ.get("GAMEPLAY_MIN_WAGER_CENTS", 100))  # 1.00

    # Service-to-service (docker network) + shared internal secret.
    INTERNAL_TOKEN = os.environ.get("INTERNAL_TOKEN", "dev-internal-token")
    # Profiles (display_name/avatar) moved to the users service (split A2). Full
    # /v1 prefix in the default so Service Connect resolves it. Internal calls use
    # the mesh name http://users:8000 (Cloud Map namespace "waygerz"), like every
    # other service — NOT the https://waygerz.com ALB, whose private-zone IPs drift
    # on ALB rotation and time out. Leave INTERNAL_USERS_URL unset in prod so this
    # default applies (users must be registered in Service Connect).
    USERS_URL = os.environ.get("INTERNAL_USERS_URL", "http://users:8000/v1/platform/users")
    # Full /v1/{group}/{svc} suffix in every default — callers append /internal/...
    # (and ingestor /events/...) onto these, and each service mounts internal
    # blueprints at api_prefix()+"/internal". A bare host:8000 default 404s. Prod
    # leaves these unset so the mesh default applies (Service Connect namespace).
    FRIENDS_URL = os.environ.get("INTERNAL_FRIENDS_URL", "http://friends:8000/v1/social/friends")
    WALLET_URL = os.environ.get("INTERNAL_WALLET_URL", "http://wallet:8000/v1/gameplay/wallet")
    INGESTOR_URL = os.environ.get("INTERNAL_INGESTOR_URL", "http://ingestor:8000/v1/platform/ingestor")
    LEAGUES_URL = os.environ.get("INTERNAL_LEAGUES_URL", "http://leagues:8000/v1/gameplay/leagues")
    # Notifications fan-out (in-app feed + SMS). Base incl. the /v1/... prefix;
    # the /internal/notify path is appended.
    NOTIFICATIONS_URL = os.environ.get(
        "INTERNAL_NOTIFICATIONS_URL", "http://notifications:8000/v1/platform/notifications"
    )

    @classmethod
    def api_prefix(cls) -> str:
        return f"/v1/{cls.SERVICE_GROUP}/{cls.SERVICE_NAME}"