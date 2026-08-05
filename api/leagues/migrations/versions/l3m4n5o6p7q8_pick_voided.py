"""pick voided flag: no-contest picks excluded from the win/loss tally

Adds league_picks.voided (bool, default false). A game that is cancelled /
postponed or that never produces a result (e.g. a stale event the ingestor swept
to a terminal status) voids its picks: they are *resolved* — so the period can
finalize — but excluded from the standings tally, never counted as a loss.

Revision ID: l3m4n5o6p7q8
Revises: k2l3m4n5o6p7
Create Date: 2026-08-05 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'l3m4n5o6p7q8'
down_revision = 'k2l3m4n5o6p7'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('league_picks', schema=None) as batch_op:
        batch_op.add_column(sa.Column(
            'voided', sa.Boolean(), nullable=False, server_default=sa.false(),
        ))


def downgrade():
    with op.batch_alter_table('league_picks', schema=None) as batch_op:
        batch_op.drop_column('voided')
