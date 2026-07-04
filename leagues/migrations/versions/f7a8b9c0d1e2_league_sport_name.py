"""add league_sports.name (display label)

Revision ID: f7a8b9c0d1e2
Revises: e5f6a7b8c9d0
Create Date: 2026-06-20 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'f7a8b9c0d1e2'
down_revision = 'e5f6a7b8c9d0'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('league_sports', sa.Column('name', sa.String(length=120), nullable=True))


def downgrade():
    op.drop_column('league_sports', 'name')
