"""per-(category, channel) notification preferences

Replaces the two coarse booleans on notification_preferences with a sparse
per-type, per-channel opt-in table. notification_preferences keeps only the
global `opted_out` kill-switch.

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-07-27 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = 'c3d4e5f6a7b8'
down_revision = 'b2c3d4e5f6a7'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'notification_channel_prefs',
        sa.Column('user_id', UUID(as_uuid=False), nullable=False),
        sa.Column('category', sa.String(length=32), nullable=False),
        sa.Column('channel', sa.String(length=16), nullable=False),
        sa.Column('enabled', sa.Boolean(), server_default=sa.text('true'), nullable=False),
        sa.PrimaryKeyConstraint('user_id', 'category', 'channel'),
    )
    with op.batch_alter_table('notification_preferences', schema=None) as batch_op:
        batch_op.drop_column('wager_alerts')
        batch_op.drop_column('weekly_digest')


def downgrade():
    with op.batch_alter_table('notification_preferences', schema=None) as batch_op:
        batch_op.add_column(sa.Column('weekly_digest', sa.Boolean(), server_default=sa.text('false'), nullable=False))
        batch_op.add_column(sa.Column('wager_alerts', sa.Boolean(), server_default=sa.text('true'), nullable=False))
    op.drop_table('notification_channel_prefs')
