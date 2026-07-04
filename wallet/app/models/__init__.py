"""Import models so Flask-Migrate sees them on the metadata."""
from app.models.balance import Balance  # noqa: F401
from app.models.transaction import Transaction  # noqa: F401
