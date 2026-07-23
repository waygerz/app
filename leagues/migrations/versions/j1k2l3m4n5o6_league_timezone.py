"""league timezone: 4 AM-local weekly period boundaries

Adds leagues.timezone (IANA zone). Weekly period boundaries are computed at
4 AM in this zone so late/night games finish before a week rolls over. Existing
rows default to US Eastern.

Revision ID: j1k2l3m4n5o6
Revises: i0j1k2l3m4n5
Create Date: 2026-07-23 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'j1k2l3m4n5o6'
down_revision = 'i0j1k2l3m4n5'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('leagues', schema=None) as batch_op:
        batch_op.add_column(sa.Column(
            'timezone', sa.String(length=64), nullable=False,
            server_default='America/New_York',
        ))


def downgrade():
    with op.batch_alter_table('leagues', schema=None) as batch_op:
        batch_op.drop_column('timezone')
