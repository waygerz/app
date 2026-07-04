"""league-scope wagers (league_id, period_id)

Revision ID: e5f6a7b8c9d0
Revises: 3a9abd5ba810
Create Date: 2026-06-20 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = 'e5f6a7b8c9d0'
down_revision = '3a9abd5ba810'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('wagers', sa.Column('league_id', UUID(as_uuid=False), nullable=False))
    op.add_column('wagers', sa.Column('period_id', UUID(as_uuid=False), nullable=True))
    with op.batch_alter_table('wagers', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_wagers_league_id'), ['league_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_wagers_period_id'), ['period_id'], unique=False)


def downgrade():
    with op.batch_alter_table('wagers', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_wagers_period_id'))
        batch_op.drop_index(batch_op.f('ix_wagers_league_id'))
    op.drop_column('wagers', 'period_id')
    op.drop_column('wagers', 'league_id')
