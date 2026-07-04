"""logo_url -> Text (holds uploaded data: URLs)

Revision ID: c3d4e5f6a7b8
Revises: a1b2c3d4e5f6
Create Date: 2026-06-20 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'c3d4e5f6a7b8'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column('leagues', 'logo_url',
                    existing_type=sa.String(length=500), type_=sa.Text(),
                    existing_nullable=True)


def downgrade():
    op.alter_column('leagues', 'logo_url',
                    existing_type=sa.Text(), type_=sa.String(length=500),
                    existing_nullable=True)
