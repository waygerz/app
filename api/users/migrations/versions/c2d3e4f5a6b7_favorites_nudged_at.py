"""profiles.favorites_nudged_at

Revision ID: c2d3e4f5a6b7
Revises: b1f2a3c4d5e6
Create Date: 2026-08-14 00:00:00.000000

Tracks the one-time no-favorites nudge (see service_tick) so the scheduler tick
doesn't re-notify a user who already got it.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c2d3e4f5a6b7'
down_revision = 'b1f2a3c4d5e6'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('profiles', schema=None) as batch_op:
        batch_op.add_column(sa.Column('favorites_nudged_at', sa.DateTime(), nullable=True))
    # Partial index for the nudge tick: only un-nudged rows are indexed, so it
    # stays near-empty once everyone has been nudged.
    op.create_index(
        'ix_profiles_pending_nudge',
        'profiles',
        ['created_at'],
        postgresql_where=sa.text('favorites_nudged_at IS NULL'),
    )


def downgrade():
    op.drop_index('ix_profiles_pending_nudge', table_name='profiles')
    with op.batch_alter_table('profiles', schema=None) as batch_op:
        batch_op.drop_column('favorites_nudged_at')
