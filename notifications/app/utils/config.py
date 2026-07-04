import os


class Config:
    SERVICE_GROUP = os.environ.get("SERVICE_GROUP", "platform")
    SERVICE_NAME = os.environ.get("SERVICE_NAME", "notifications")
    APP_ENV = os.environ.get("APP_ENV", "development")
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-change-me")

    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL",
        "postgresql+psycopg2://waygerz:waygerz@pgsql:5432/waygerz",
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    DB_SCHEMA = os.environ.get("DB_SCHEMA", "notifications")
    SQLALCHEMY_ENGINE_OPTIONS = {
        "connect_args": {"options": f"-csearch_path={DB_SCHEMA}"}
    }

    INTERNAL_TOKEN = os.environ.get("INTERNAL_TOKEN", "dev-internal-token")

    # SMS provider: "log" (default — prints, sends nothing) or "aws".
    # Switch to "aws" only once 10DLC registration is approved (see README).
    SMS_PROVIDER = os.environ.get("SMS_PROVIDER", "log")
    AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
    # 10DLC pool / origination identity (phone pool ARN or number id).
    SMS_ORIGINATION_IDENTITY = os.environ.get("SMS_ORIGINATION_IDENTITY", "")
    SMS_BRAND_PREFIX = os.environ.get("SMS_BRAND_PREFIX", "Waygerz")

    @classmethod
    def api_prefix(cls) -> str:
        return f"/v1/{cls.SERVICE_GROUP}/{cls.SERVICE_NAME}"