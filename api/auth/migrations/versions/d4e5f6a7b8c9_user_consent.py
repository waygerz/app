"""add users consent columns (tos + sms)

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-08-01 00:00:00.000000

Records consent captured on the create-account step: agreement to the Terms of
Service + Privacy Policy (timestamp + version) and SMS opt-in (transactional +
marketing). Existing rows keep a null tos and default-false SMS flags.
"""
from alembic import op
import sqlalchemy as sa


revision = 'd4e5f6a7b8c9'
down_revision = 'c3d4e5f6a7b8'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('tos_accepted_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('tos_version', sa.String(length=32), nullable=True))
        batch_op.add_column(
            sa.Column(
                'sms_transactional_consent',
                sa.Boolean(),
                nullable=False,
                server_default=sa.text('false'),
            )
        )
        batch_op.add_column(
            sa.Column(
                'sms_marketing_consent',
                sa.Boolean(),
                nullable=False,
                server_default=sa.text('false'),
            )
        )


def downgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('sms_marketing_consent')
        batch_op.drop_column('sms_transactional_consent')
        batch_op.drop_column('tos_version')
        batch_op.drop_column('tos_accepted_at')
