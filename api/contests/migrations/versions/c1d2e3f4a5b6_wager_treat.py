"""add wagers.treat (beer | shot) for $0 bragging-rights bets

Revision ID: c1d2e3f4a5b6
Revises: a1b2c3d4e5f6
Create Date: 2026-09-05 00:00:00.000000

A $0 bragging-rights bet now carries what the loser owes — a beer or a shot.
Additive, NOT NULL with a server default of 'beer' so existing rows (and any
in-flight insert that predates the app roll) backfill to beer.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c1d2e3f4a5b6'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'wagers',
        sa.Column('treat', sa.String(length=8), nullable=False, server_default='beer'),
    )


def downgrade():
    op.drop_column('wagers', 'treat')
