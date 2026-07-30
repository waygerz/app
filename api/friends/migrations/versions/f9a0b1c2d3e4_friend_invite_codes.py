"""friend_invite_codes

Revision ID: f9a0b1c2d3e4
Revises: f8859c39f61d
Create Date: 2026-07-30 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision = 'f9a0b1c2d3e4'
down_revision = 'f8859c39f61d'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'friend_invite_codes',
        sa.Column('id', UUID(as_uuid=False), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('code', sa.String(length=16), nullable=False),
        sa.Column('owner_id', UUID(as_uuid=False), nullable=False),
        sa.Column('single_use', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        sa.Column('consumed_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('code', name='uq_friend_invite_code'),
    )
    with op.batch_alter_table('friend_invite_codes', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_friend_invite_codes_code'), ['code'], unique=True)
        batch_op.create_index(batch_op.f('ix_friend_invite_codes_owner_id'), ['owner_id'], unique=False)


def downgrade():
    with op.batch_alter_table('friend_invite_codes', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_friend_invite_codes_owner_id'))
        batch_op.drop_index(batch_op.f('ix_friend_invite_codes_code'))
    op.drop_table('friend_invite_codes')
