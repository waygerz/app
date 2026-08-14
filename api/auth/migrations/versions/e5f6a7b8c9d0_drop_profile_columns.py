"""drop profile columns (moved to users service)

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-08-14 00:00:00.000000

Contract phase of the auth->users split. display_name/avatar_key have been
backfilled into users.profiles and every reader now sources them from the users
service, so drop them from auth.users. Run ONLY after the backfill + read
migration are deployed and verified.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e5f6a7b8c9d0'
down_revision = 'd4e5f6a7b8c9'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('display_name')
        batch_op.drop_column('avatar_key')


def downgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('avatar_key', sa.String(length=512), nullable=True))
        batch_op.add_column(
            sa.Column('display_name', sa.String(length=64), nullable=False, server_default='Player')
        )
