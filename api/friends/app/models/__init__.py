"""Import models so Flask-Migrate sees them on the metadata."""
from app.models.friendship import Friendship  # noqa: F401
from app.models.invite_code import FriendInviteCode  # noqa: F401
