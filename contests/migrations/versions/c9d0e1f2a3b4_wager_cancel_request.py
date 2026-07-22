"""mutual wager cancellation: cancel_requested_by + cancel_requested_at

Backs the "Request cancel" / "Approve cancel" flow on an *accepted* wager,
where both sides have money held and neither can back out alone. Open wagers
are unaffected — the proposer still withdraws those in one step.

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-07-22 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = 'c9d0e1f2a3b4'
down_revision = 'b8c9d0e1f2a3'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('wagers', schema=None) as batch_op:
        batch_op.add_column(sa.Column('cancel_requested_by', UUID(as_uuid=False), nullable=True))
        batch_op.add_column(sa.Column('cancel_requested_at', sa.DateTime(), nullable=True))


def downgrade():
    with op.batch_alter_table('wagers', schema=None) as batch_op:
        batch_op.drop_column('cancel_requested_at')
        batch_op.drop_column('cancel_requested_by')
