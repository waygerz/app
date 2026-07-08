from datetime import datetime

from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.extensions import db

# league_type
HEAD_TO_HEAD = "head_to_head"
PICKEM = "pickem"
LEAGUE_TYPES = (HEAD_TO_HEAD, PICKEM)
MONEY_TYPES = (HEAD_TO_HEAD,)  # types that carry a wallet balance

# status
DRAFT = "draft"
ACTIVE = "active"
COMPLETED = "completed"
ARCHIVED = "archived"

# period_type
WEEKLY = "weekly"
SEASON = "season"
PERIOD_TYPES = (WEEKLY, SEASON)


class League(db.Model):
    __tablename__ = "leagues"

    id = db.Column(
        UUID(as_uuid=False), primary_key=True, server_default=db.text("gen_random_uuid()")
    )
    name = db.Column(db.String(120), nullable=False)
    # League logo shown as the dashboard avatar. Holds either a URL or an
    # uploaded image as a data: URL (hence Text). Null -> generated initials avatar.
    logo_url = db.Column(db.Text, nullable=True)
    description = db.Column(db.Text, nullable=True)  # shown on the invite page
    commissioner_id = db.Column(UUID(as_uuid=False), nullable=False, index=True)
    league_type = db.Column(db.String(16), nullable=False, index=True)
    status = db.Column(db.String(16), nullable=False, default=DRAFT, index=True)
    # Short, human-typeable code (e.g. WAYG-4F2K) for manual join.
    join_code = db.Column(db.String(16), nullable=False, unique=True, index=True)
    # Opaque token for share links.
    invite_token = db.Column(
        UUID(as_uuid=False), nullable=False, unique=True, server_default=db.text("gen_random_uuid()")
    )
    period_type = db.Column(db.String(8), nullable=False, default=SEASON)
    starting_balance_cents = db.Column(db.BigInteger, nullable=True)  # null for pickem
    min_wager_cents = db.Column(db.BigInteger, nullable=True)
    max_wager_cents = db.Column(db.BigInteger, nullable=True)
    rules = db.Column(JSONB, nullable=False, default=dict, server_default="{}")
    starts_at = db.Column(db.DateTime, nullable=True)
    ends_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    @property
    def is_money(self) -> bool:
        return self.league_type in MONEY_TYPES

    @property
    def account(self) -> str:
        """The wallet account key for this league's balances."""
        return f"league:{self.id}"

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "logo_url": self.logo_url,
            "description": self.description,
            "commissioner_id": self.commissioner_id,
            "league_type": self.league_type,
            "status": self.status,
            "join_code": self.join_code,
            "invite_token": self.invite_token,
            "period_type": self.period_type,
            "starting_balance_cents": self.starting_balance_cents,
            "min_wager_cents": self.min_wager_cents,
            "max_wager_cents": self.max_wager_cents,
            "rules": self.rules or {},
            "starts_at": self.starts_at.isoformat() + "Z" if self.starts_at else None,
            "ends_at": self.ends_at.isoformat() + "Z" if self.ends_at else None,
            "created_at": self.created_at.isoformat() + "Z",
        }
