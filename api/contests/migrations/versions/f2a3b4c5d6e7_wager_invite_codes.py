"""wager_invite_codes

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-07-30 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision = 'f2a3b4c5d6e7'
down_revision = 'e1f2a3b4c5d6'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'wager_invite_codes',
        sa.Column('id', UUID(as_uuid=False), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('code', sa.String(length=16), nullable=False),
        sa.Column('wager_id', UUID(as_uuid=False), nullable=False),
        sa.Column('created_by', UUID(as_uuid=False), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    # Uniqueness comes from the unique index (matches the model's
    # `unique=True, index=True`) — no separate named constraint, to avoid drift.
    with op.batch_alter_table('wager_invite_codes', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_wager_invite_codes_code'), ['code'], unique=True)
        batch_op.create_index(batch_op.f('ix_wager_invite_codes_wager_id'), ['wager_id'], unique=False)


def downgrade():
    with op.batch_alter_table('wager_invite_codes', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_wager_invite_codes_wager_id'))
        batch_op.drop_index(batch_op.f('ix_wager_invite_codes_code'))
    op.drop_table('wager_invite_codes')
