"""Import models so Flask-Migrate sees them on the metadata."""
from app.models.wager import Wager  # noqa: F401
from app.models.wager_invite_code import WagerInviteCode  # noqa: F401
