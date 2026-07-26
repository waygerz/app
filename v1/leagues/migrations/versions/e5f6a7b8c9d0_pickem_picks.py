"""add league_picks (pickem)

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-06-20 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = 'e5f6a7b8c9d0'
down_revision = 'd4e5f6a7b8c9'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('league_picks',
    sa.Column('id', UUID(as_uuid=False), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('league_id', UUID(as_uuid=False), nullable=False),
    sa.Column('period_id', UUID(as_uuid=False), nullable=False),
    sa.Column('user_id', UUID(as_uuid=False), nullable=False),
    sa.Column('event_id', sa.String(length=64), nullable=False),
    sa.Column('pick_side', sa.String(length=8), nullable=False),
    sa.Column('correct', sa.Boolean(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('period_id', 'user_id', 'event_id', name='uq_pick')
    )
    with op.batch_alter_table('league_picks', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_league_picks_league_id'), ['league_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_league_picks_period_id'), ['period_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_league_picks_user_id'), ['user_id'], unique=False)


def downgrade():
    op.drop_table('league_picks')
