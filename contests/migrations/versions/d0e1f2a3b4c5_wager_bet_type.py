"""wager bet type + line: moneyline / spread / total

Adds wagers.bet_type (default 'moneyline', so every existing wager reads as a
straight-up pick) and wagers.line (the proposer's spread/total number, null for
moneyline). proposer_side now also carries over|under for total bets.

Revision ID: d0e1f2a3b4c5
Revises: c9d0e1f2a3b4
Create Date: 2026-07-24 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'd0e1f2a3b4c5'
down_revision = 'c9d0e1f2a3b4'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('wagers', schema=None) as batch_op:
        batch_op.add_column(sa.Column(
            'bet_type', sa.String(length=12), nullable=False,
            server_default='moneyline',
        ))
        batch_op.add_column(sa.Column('line', sa.Float(), nullable=True))


def downgrade():
    with op.batch_alter_table('wagers', schema=None) as batch_op:
        batch_op.drop_column('line')
        batch_op.drop_column('bet_type')
