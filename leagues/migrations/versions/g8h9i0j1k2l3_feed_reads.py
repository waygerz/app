"""league feed read watermarks

Revision ID: g8h9i0j1k2l3
Revises: f7a8b9c0d1e2
Create Date: 2026-07-02 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'g8h9i0j1k2l3'
down_revision = 'f7a8b9c0d1e2'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'league_feed_reads',
        sa.Column('id', postgresql.UUID(as_uuid=False), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('league_id', postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column('last_read_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('league_id', 'user_id', name='uq_league_feed_read'),
    )
    with op.batch_alter_table('league_feed_reads', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_league_feed_reads_league_id'), ['league_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_league_feed_reads_user_id'), ['user_id'], unique=False)


def downgrade():
    op.drop_table('league_feed_reads')