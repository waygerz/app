"""wagers (UUID)

Revision ID: 3a9abd5ba810
Revises:
Create Date: 2026-06-15 18:42:44.149421

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision = '3a9abd5ba810'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('wagers',
    sa.Column('id', UUID(as_uuid=False), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('event_id', sa.String(length=64), nullable=False),
    sa.Column('event_name', sa.String(length=200), nullable=True),
    sa.Column('league', sa.String(length=40), nullable=True),
    sa.Column('home_team', sa.String(length=120), nullable=True),
    sa.Column('away_team', sa.String(length=120), nullable=True),
    sa.Column('start_time', sa.String(length=40), nullable=True),
    sa.Column('proposer_id', UUID(as_uuid=False), nullable=False),
    sa.Column('acceptor_id', UUID(as_uuid=False), nullable=False),
    sa.Column('proposer_side', sa.String(length=8), nullable=False),
    sa.Column('amount_cents', sa.BigInteger(), nullable=False),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('winner_user_id', UUID(as_uuid=False), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('settled_at', sa.DateTime(), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('wagers', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_wagers_acceptor_id'), ['acceptor_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_wagers_event_id'), ['event_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_wagers_proposer_id'), ['proposer_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_wagers_status'), ['status'], unique=False)


def downgrade():
    with op.batch_alter_table('wagers', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_wagers_status'))
        batch_op.drop_index(batch_op.f('ix_wagers_proposer_id'))
        batch_op.drop_index(batch_op.f('ix_wagers_event_id'))
        batch_op.drop_index(batch_op.f('ix_wagers_acceptor_id'))

    op.drop_table('wagers')
