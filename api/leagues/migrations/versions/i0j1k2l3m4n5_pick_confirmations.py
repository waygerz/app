"""league_pick_confirmations (commissioner per-week member confirmation)

Revision ID: i0j1k2l3m4n5
Revises: h9i0j1k2l3m4
Create Date: 2026-07-08 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = 'i0j1k2l3m4n5'
down_revision = 'h9i0j1k2l3m4'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'league_pick_confirmations',
        sa.Column('id', UUID(as_uuid=False), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('league_id', UUID(as_uuid=False), nullable=False),
        sa.Column('period_id', UUID(as_uuid=False), nullable=False),
        sa.Column('user_id', UUID(as_uuid=False), nullable=False),
        sa.Column('confirmed', sa.Boolean(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('period_id', 'user_id', name='uq_pick_confirm'),
    )
    with op.batch_alter_table('league_pick_confirmations', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_league_pick_confirmations_league_id'), ['league_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_league_pick_confirmations_period_id'), ['period_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_league_pick_confirmations_user_id'), ['user_id'], unique=False)


def downgrade():
    with op.batch_alter_table('league_pick_confirmations', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_league_pick_confirmations_user_id'))
        batch_op.drop_index(batch_op.f('ix_league_pick_confirmations_period_id'))
        batch_op.drop_index(batch_op.f('ix_league_pick_confirmations_league_id'))
    op.drop_table('league_pick_confirmations')
