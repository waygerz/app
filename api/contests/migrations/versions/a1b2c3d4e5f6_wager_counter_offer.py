"""wager counter-offer negotiation columns

Adds the in-place negotiation state to `wagers` (see
.docs/pending/COUNTER_OFFER_PLAN.md): held_id / held_ref (the single currently-held
stake and its EXACT wallet ref), stake_round (monotonic, bumped only by counter),
accept_ref (the approver's exact ref once ACCEPTED), pending_id (whose turn), and
negotiation (append-only round log).

Backfill makes every pre-existing wager the zero-round case so it reconciles /
settles exactly as before: held_id = proposer, held_ref = the base ref "wager:{id}"
(where propose held), pending_id = acceptor while OPEN, and accept_ref = the base ref
for already-accepted/completed/settled rows (today's `accept` held the acceptor at the
base ref too). No wallet-table change: every new ref fits transactions.ref VARCHAR(64).

Revision ID: a1b2c3d4e5f6
Revises: f2a3b4c5d6e7
Create Date: 2026-09-05 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = 'a1b2c3d4e5f6'
down_revision = 'f2a3b4c5d6e7'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('wagers', schema=None) as batch_op:
        batch_op.add_column(sa.Column('held_id', postgresql.UUID(as_uuid=False), nullable=True))
        batch_op.add_column(sa.Column('held_ref', sa.String(length=80), nullable=True))
        batch_op.add_column(sa.Column(
            'stake_round', sa.Integer(), nullable=False, server_default='0'))
        batch_op.add_column(sa.Column('accept_ref', sa.String(length=80), nullable=True))
        batch_op.add_column(sa.Column('pending_id', postgresql.UUID(as_uuid=False), nullable=True))
        batch_op.add_column(sa.Column(
            'negotiation', postgresql.JSONB(astext_type=sa.Text()),
            nullable=False, server_default=sa.text("'[]'::jsonb")))

    # Backfill: pre-existing rows behave exactly as today (round 0, base refs).
    op.execute("UPDATE wagers SET held_id = proposer_id, held_ref = 'wager:' || id")
    op.execute("UPDATE wagers SET pending_id = acceptor_id WHERE status = 'open'")
    op.execute(
        "UPDATE wagers SET accept_ref = 'wager:' || id "
        "WHERE status IN ('accepted', 'completed', 'settled')"
    )


def downgrade():
    with op.batch_alter_table('wagers', schema=None) as batch_op:
        batch_op.drop_column('negotiation')
        batch_op.drop_column('pending_id')
        batch_op.drop_column('accept_ref')
        batch_op.drop_column('stake_round')
        batch_op.drop_column('held_ref')
        batch_op.drop_column('held_id')
