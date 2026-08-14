"""Import models so Flask-Migrate sees them on the metadata."""
from app.models.profile import Profile  # noqa: F401
from app.models.favorite_team import FavoriteTeam  # noqa: F401
