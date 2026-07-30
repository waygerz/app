"""notification: template_key + actor (id/name/avatar) for the rich sheet

Revision ID: f6a7b8c9dbef
Revises: e5f6a7b8c9da
Create Date: 2026-07-30 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f6a7b8c9dbef'
down_revision = 'e5f6a7b8c9da'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('notifications', schema=None) as batch_op:
        batch_op.add_column(sa.Column('template_key', sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column('actor_id', sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column('actor_name', sa.String(length=120), nullable=True))
        batch_op.add_column(sa.Column('actor_avatar_key', sa.Text(), nullable=True))


def downgrade():
    with op.batch_alter_table('notifications', schema=None) as batch_op:
        batch_op.drop_column('actor_avatar_key')
        batch_op.drop_column('actor_name')
        batch_op.drop_column('actor_id')
        batch_op.drop_column('template_key')
