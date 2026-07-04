"""persist event odds to SQL

Revision ID: a1b2c3d4e5f6
Revises: f1a2b3c4d5e6
Create Date: 2026-06-20 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision = 'a1b2c3d4e5f6'
down_revision = 'f1a2b3c4d5e6'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('events', sa.Column('odds', JSONB(), nullable=True))
    op.add_column('events', sa.Column('odds_updated_at', sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column('events', 'odds_updated_at')
    op.drop_column('events', 'odds')
