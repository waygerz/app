"""post reactions: add reaction column to post_likes

Revision ID: d3e4f5a6b7c8
Revises: c2d3e4f5a6b7
Create Date: 2026-08-15 15:30:00.000000

Additive: a NOT NULL `reaction` with server_default 'like' so every existing like
row backfills to a 👍 automatically and old code that inserts without the column
keeps working during the rolling deploy. The server_default is intentionally kept
(harmless) so a mid-roll old-image insert never violates NOT NULL.
"""
from alembic import op
import sqlalchemy as sa


revision = "d3e4f5a6b7c8"
down_revision = "c2d3e4f5a6b7"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("post_likes", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("reaction", sa.String(length=16), nullable=False, server_default="like")
        )


def downgrade():
    with op.batch_alter_table("post_likes", schema=None) as batch_op:
        batch_op.drop_column("reaction")
