"""device push tokens

One row per device push token (FCM registration token). Written by the mobile
apps registering for push; read by notify() when fanning out the push channel.

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-07-28 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = 'd4e5f6a7b8c9'
down_revision = 'c3d4e5f6a7b8'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'device_tokens',
        sa.Column('id', UUID(as_uuid=False), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('user_id', UUID(as_uuid=False), nullable=False),
        sa.Column('platform', sa.String(length=16), nullable=False),
        sa.Column('token', sa.String(length=512), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('last_seen_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('token', name='uq_device_tokens_token'),
    )
    with op.batch_alter_table('device_tokens', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_device_tokens_user_id'), ['user_id'], unique=False)


def downgrade():
    with op.batch_alter_table('device_tokens', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_device_tokens_user_id'))
    op.drop_table('device_tokens')
