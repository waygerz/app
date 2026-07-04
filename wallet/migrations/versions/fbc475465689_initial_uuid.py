"""initial uuid + league-scoped accounts

Revision ID: fbc475465689
Revises:
Create Date: 2026-06-20 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision = 'fbc475465689'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('balances',
    sa.Column('account', sa.String(length=64), nullable=False),
    sa.Column('user_id', UUID(as_uuid=False), nullable=False),
    sa.Column('balance_cents', sa.BigInteger(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('account', 'user_id')
    )
    op.create_table('transactions',
    sa.Column('id', UUID(as_uuid=False), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('account', sa.String(length=64), nullable=False),
    sa.Column('user_id', UUID(as_uuid=False), nullable=False),
    sa.Column('ref', sa.String(length=64), nullable=True),
    sa.Column('type', sa.String(length=32), nullable=False),
    sa.Column('amount_cents', sa.BigInteger(), nullable=False),
    sa.Column('balance_after_cents', sa.BigInteger(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('account', 'user_id', 'ref', 'type', name='uq_txn_idem')
    )
    with op.batch_alter_table('transactions', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_transactions_account'), ['account'], unique=False)
        batch_op.create_index(batch_op.f('ix_transactions_ref'), ['ref'], unique=False)
        batch_op.create_index(batch_op.f('ix_transactions_user_id'), ['user_id'], unique=False)


def downgrade():
    with op.batch_alter_table('transactions', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_transactions_user_id'))
        batch_op.drop_index(batch_op.f('ix_transactions_ref'))
        batch_op.drop_index(batch_op.f('ix_transactions_account'))

    op.drop_table('transactions')
    op.drop_table('balances')
