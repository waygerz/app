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

    # SMS provider: "log" (default — prints, sends nothing), "aws", or "twilio".
    # Switch off "log" only once the provider's number/registration is approved.
    SMS_PROVIDER = os.environ.get("SMS_PROVIDER", "log")
    AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
    # 10DLC pool / origination identity (phone pool ARN or number id).
    SMS_ORIGINATION_IDENTITY = os.environ.get("SMS_ORIGINATION_IDENTITY", "")
    SMS_BRAND_PREFIX = os.environ.get("SMS_BRAND_PREFIX", "Waygerz")
    # Twilio (used when SMS_PROVIDER=twilio). TWILIO_FROM is a number or
    # Messaging Service SID. Empty until real credentials are wired via secrets.
    TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
    TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
    TWILIO_FROM = os.environ.get("TWILIO_FROM", "")

    @classmethod
    def api_prefix(cls) -> str:
        return f"/v1/{cls.SERVICE_GROUP}/{cls.SERVICE_NAME}"