"""profiles and favorite_teams

Revision ID: b1f2a3c4d5e6
Revises:
Create Date: 2026-08-14 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision = 'b1f2a3c4d5e6'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'profiles',
        sa.Column('user_id', UUID(as_uuid=False), nullable=False),
        sa.Column('display_name', sa.String(length=64), nullable=False),
        sa.Column('avatar_key', sa.String(length=512), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('user_id'),
    )
    op.create_table(
        'favorite_teams',
        sa.Column('id', UUID(as_uuid=False), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('user_id', UUID(as_uuid=False), nullable=False),
        sa.Column('sport', sa.String(length=32), nullable=False),
        sa.Column('league', sa.String(length=32), nullable=False),
        sa.Column('external_id', sa.String(length=64), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('abbreviation', sa.String(length=12), nullable=False),
        sa.Column('logo', sa.String(length=400), nullable=True),
        sa.Column('color', sa.String(length=16), nullable=True),
        sa.Column('position', sa.SmallInteger(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'sport', 'league', 'external_id', name='uq_favorite_team'),
    )
    with op.batch_alter_table('favorite_teams', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_favorite_teams_user_id'), ['user_id'], unique=False)


def downgrade():
    with op.batch_alter_table('favorite_teams', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_favorite_teams_user_id'))

    op.drop_table('favorite_teams')
    op.drop_table('profiles')
