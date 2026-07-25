"""messages.user_id nullable — transactional OTP has no user

OTP texts go to a phone that may not be a user yet (signup), so a message can
carry no user_id. Relax the NOT NULL constraint.

Revision ID: a1b2c3d4e5f6
Revises: f0e1d2c3b4a5
Create Date: 2026-07-25 00:00:00.000000

"""
from alembic import op
from sqlalchemy.dialects.postgresql import UUID


revision = 'a1b2c3d4e5f6'
down_revision = 'f0e1d2c3b4a5'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('messages', schema=None) as batch_op:
        batch_op.alter_column('user_id', existing_type=UUID(as_uuid=False), nullable=True)


def downgrade():
    with op.batch_alter_table('messages', schema=None) as batch_op:
        batch_op.alter_column('user_id', existing_type=UUID(as_uuid=False), nullable=False)
