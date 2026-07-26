from datetime import datetime

from sqlalchemy.dialects.postgresql import UUID

from app.extensions import db


class NotificationTemplate(db.Model):
    """Named, versioned message templates with {{placeholders}}."""

    __tablename__ = "notification_templates"
    __table_args__ = (
        db.UniqueConstraint("key", "locale", "channel", "version", name="uq_template_ver"),
    )

    id = db.Column(
        UUID(as_uuid=False), primary_key=True, server_default=db.text("gen_random_uuid()")
    )
    key = db.Column(db.String(64), nullable=False, index=True)   # e.g. otp_code
    locale = db.Column(db.String(8), nullable=False, default="en")
    channel = db.Column(db.String(16), nullable=False, default="sms")
    body = db.Column(db.Text, nullable=False)  # with {{placeholders}}
    active = db.Column(db.Boolean, nullable=False, default=True)
    version = db.Column(db.Integer, nullable=False, default=1)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)


# Seed catalog (insert on first migrate). category drives footer/compliance.
STARTER_TEMPLATES = [
    ("otp_code", "otp", "Waygerz: your code is {{code}}. Expires in 5 min."),
    ("wager_proposed", "wager_alert",
     "{{from_name}} bet you {{amount}} on {{matchup}} in {{league}}. Open the app to accept."),
    ("wager_accepted", "wager_alert",
     "{{other_name}} accepted your bet on {{matchup}} ({{league}})."),
    ("wager_settled_win", "wager_alert",
     "You won {{amount}} on {{matchup}} in {{league}}! \U0001F389"),
    ("wager_settled_loss", "wager_alert",
     "Tough luck — you lost your bet on {{matchup}} ({{league}})."),
    ("league_invite", "wager_alert",
     "{{inviter_name}} invited you to {{league}} on Waygerz. Join: {{link}}"),
    ("weekly_digest", "weekly_digest",
     "{{league}} {{period}}: {{standings_line}}. See full standings in the app."),
]
