"""favorite_leagues

Revision ID: d3e4f5a6b7c8
Revises: c2d3e4f5a6b7
Create Date: 2026-09-18 00:00:00.000000

Pinned sports leagues, previously kept only in the web client's localStorage;
now per-user so web and mobile share them.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = 'd3e4f5a6b7c8'
down_revision = 'c2d3e4f5a6b7'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'favorite_leagues',
        sa.Column('id', postgresql.UUID(as_uuid=False), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column('sport', sa.String(length=32), nullable=False),
        sa.Column('league', sa.String(length=32), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('abbreviation', sa.String(length=24), nullable=True),
        sa.Column('logo', sa.String(length=400), nullable=True),
        sa.Column('position', sa.SmallInteger(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'sport', 'league', name='uq_favorite_league'),
    )
    with op.batch_alter_table('favorite_leagues', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_favorite_leagues_user_id'), ['user_id'], unique=False)


def downgrade():
    with op.batch_alter_table('favorite_leagues', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_favorite_leagues_user_id'))
    op.drop_table('favorite_leagues')
