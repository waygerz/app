"""wager peer-confirmation: completed_at + confirmed_by_id

Adds the columns backing the head-to-head "winner confirms the win" flow.
The new ``completed`` status reuses the existing ``status`` string column, so
no schema change is needed for it.

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-07-08 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = 'a7b8c9d0e1f2'
down_revision = 'f6a7b8c9d0e1'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('wagers', schema=None) as batch_op:
        batch_op.add_column(sa.Column('confirmed_by_id', UUID(as_uuid=False), nullable=True))
        batch_op.add_column(sa.Column('completed_at', sa.DateTime(), nullable=True))


def downgrade():
    with op.batch_alter_table('wagers', schema=None) as batch_op:
        batch_op.drop_column('completed_at')
        batch_op.drop_column('confirmed_by_id')
