"""wager confirmed bool: replace confirmed_by_id with a single confirmed flag

The result is now decided by the final score, and only the winner confirms
(claiming the pot). We no longer track *who* confirmed or support a manual
concede/draw, so `confirmed_by_id` collapses to a single boolean `confirmed`.
Backfill it true for wagers that already settled.

Revision ID: e1f2a3b4c5d6
Revises: d0e1f2a3b4c5
Create Date: 2026-07-24 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = 'e1f2a3b4c5d6'
down_revision = 'd0e1f2a3b4c5'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('wagers', schema=None) as batch_op:
        batch_op.add_column(sa.Column(
            'confirmed', sa.Boolean(), nullable=False, server_default=sa.text('false'),
        ))
    # A settled wager was, by definition, confirmed by its winner.
    op.execute("UPDATE wagers SET confirmed = true WHERE status = 'settled'")
    with op.batch_alter_table('wagers', schema=None) as batch_op:
        batch_op.drop_column('confirmed_by_id')


def downgrade():
    with op.batch_alter_table('wagers', schema=None) as batch_op:
        batch_op.add_column(sa.Column(
            'confirmed_by_id', postgresql.UUID(as_uuid=False), nullable=True,
        ))
        batch_op.drop_column('confirmed')
