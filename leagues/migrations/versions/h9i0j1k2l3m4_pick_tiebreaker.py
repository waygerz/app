"""add league_picks.tiebreaker_total (Monday-night total-score tie-breaker)

Revision ID: h9i0j1k2l3m4
Revises: g8h9i0j1k2l3
Create Date: 2026-07-08 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'h9i0j1k2l3m4'
down_revision = 'g8h9i0j1k2l3'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('league_picks', schema=None) as batch_op:
        batch_op.add_column(sa.Column('tiebreaker_total', sa.Integer(), nullable=True))


def downgrade():
    with op.batch_alter_table('league_picks', schema=None) as batch_op:
        batch_op.drop_column('tiebreaker_total')
