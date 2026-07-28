"""Import models so Flask-Migrate sees them on the metadata."""
from app.models.user import User  # noqa: F401
