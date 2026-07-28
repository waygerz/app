"""event season/week columns + schedule indexes

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-07-13 00:00:00.000000

Adds native-week metadata to events so the ESPN schedule ingester can tag each
game with its season + week, and composite indexes so per-league week queries
(the master schedule read path) stay fast.
"""
from alembic import op
import sqlalchemy as sa


revision = 'b2c3d4e5f6a7'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('events', sa.Column('season_year', sa.Integer(), nullable=True))
    op.add_column('events', sa.Column('week_number', sa.Integer(), nullable=True))
    op.add_column('events', sa.Column('week_label', sa.String(length=80), nullable=True))
    op.create_index('ix_events_sport_league_start', 'events', ['sport_league_id', 'start_time'])
    op.create_index('ix_events_league_start', 'events', ['league', 'start_time'])


def downgrade():
    op.drop_index('ix_events_league_start', table_name='events')
    op.drop_index('ix_events_sport_league_start', table_name='events')
    op.drop_column('events', 'week_label')
    op.drop_column('events', 'week_number')
    op.drop_column('events', 'season_year')
