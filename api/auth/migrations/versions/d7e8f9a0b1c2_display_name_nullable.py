"""display_name nullable (pre-drop, for rolling-deploy coexistence)

Revision ID: d7e8f9a0b1c2
Revises: d4e5f6a7b8c9
Create Date: 2026-08-14 00:00:00.000000

Split A3 into nullable-then-drop so old and new auth images can run side by side
during a rolling deploy:
  * OLD image still declares display_name and sets it on INSERT — works against a
    nullable column.
  * NEW image (identity-only) omits display_name on INSERT — a nullable column
    (no NOT NULL) accepts the omission instead of erroring.
Run THIS migration BEFORE rolling the new auth image. The column is dropped later
by e5f6a7b8c9d0, once every auth instance is on the new image.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd7e8f9a0b1c2'
down_revision = 'd4e5f6a7b8c9'
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column('users', 'display_name', existing_type=sa.String(length=64), nullable=True)


def downgrade():
    op.alter_column('users', 'display_name', existing_type=sa.String(length=64), nullable=False)
