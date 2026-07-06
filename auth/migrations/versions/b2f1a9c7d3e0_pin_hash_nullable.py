"""pin_hash nullable (passwordless auth)

Revision ID: b2f1a9c7d3e0
Revises: 90ac34d3d02d
Create Date: 2026-07-06 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b2f1a9c7d3e0'
down_revision = '90ac34d3d02d'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.alter_column('pin_hash', existing_type=sa.String(length=255), nullable=True)


def downgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.alter_column('pin_hash', existing_type=sa.String(length=255), nullable=False)
