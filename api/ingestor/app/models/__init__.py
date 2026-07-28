"""Import models so Flask-Migrate sees them on the metadata."""
from app.models.event import Event  # noqa: F401
from app.models.team import Team  # noqa: F401
