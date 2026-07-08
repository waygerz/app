"""drop pools + pool_stakes — the Pool league type is retired

The `pools`/`pool_stakes` tables (created in f6a7b8c9d0e1) are removed now that
the Pool league type is gone from the product. The create migration is left in
the chain on purpose: prod has already applied it, so it must stay resolvable —
this migration simply drops what it built. Reversible via downgrade().

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-07-08 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = 'b8c9d0e1f2a3'
down_revision = 'a7b8c9d0e1f2'
branch_labels = None
depends_on = None


def upgrade():
    op.drop_table('pool_stakes')
    op.drop_table('pools')


def downgrade():
    # Recreate exactly as f6a7b8c9d0e1 built them, so the drop is reversible.
    op.create_table('pools',
    sa.Column('id', UUID(as_uuid=False), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('league_id', UUID(as_uuid=False), nullable=False),
    sa.Column('period_id', UUID(as_uuid=False), nullable=True),
    sa.Column('event_id', sa.String(length=64), nullable=False),
    sa.Column('event_name', sa.String(length=200), nullable=True),
    sa.Column('league', sa.String(length=40), nullable=True),
    sa.Column('home_team', sa.String(length=120), nullable=True),
    sa.Column('away_team', sa.String(length=120), nullable=True),
    sa.Column('start_time', sa.String(length=40), nullable=True),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('winner_side', sa.String(length=8), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('settled_at', sa.DateTime(), nullable=True),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('league_id', 'event_id', name='uq_pool_event')
    )
    with op.batch_alter_table('pools', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_pools_event_id'), ['event_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_pools_league_id'), ['league_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_pools_status'), ['status'], unique=False)

    op.create_table('pool_stakes',
    sa.Column('id', UUID(as_uuid=False), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('pool_id', UUID(as_uuid=False), nullable=False),
    sa.Column('league_id', UUID(as_uuid=False), nullable=False),
    sa.Column('user_id', UUID(as_uuid=False), nullable=False),
    sa.Column('side', sa.String(length=8), nullable=False),
    sa.Column('amount_cents', sa.BigInteger(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('pool_stakes', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_pool_stakes_league_id'), ['league_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_pool_stakes_pool_id'), ['pool_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_pool_stakes_user_id'), ['user_id'], unique=False)
