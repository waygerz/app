"""sport_leagues catalog + events.sport_league_id

Revision ID: f1a2b3c4d5e6
Revises: cb4e92ca37fc
Create Date: 2026-06-20 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = 'f1a2b3c4d5e6'
down_revision = 'cb4e92ca37fc'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('sport_leagues',
    sa.Column('id', UUID(as_uuid=False), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('sport', sa.String(length=40), nullable=False),
    sa.Column('league', sa.String(length=40), nullable=False),
    sa.Column('name', sa.String(length=120), nullable=True),
    sa.Column('logo', sa.String(length=400), nullable=True),
    sa.Column('active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
    sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('sport', 'league', name='uq_sport_league')
    )
    op.add_column('events', sa.Column('sport_league_id', UUID(as_uuid=False), nullable=True))
    with op.batch_alter_table('events', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_events_sport_league_id'), ['sport_league_id'], unique=False)

    # Backfill the catalog from existing events, then link events to it.
    op.execute(
        "INSERT INTO sport_leagues (id, sport, league, name) "
        "SELECT gen_random_uuid(), sport, league, league "
        "FROM (SELECT DISTINCT sport, league FROM events) d"
    )
    op.execute(
        "UPDATE events e SET sport_league_id = sl.id "
        "FROM sport_leagues sl WHERE e.sport = sl.sport AND e.league = sl.league"
    )


def downgrade():
    with op.batch_alter_table('events', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_events_sport_league_id'))
    op.drop_column('events', 'sport_league_id')
    op.drop_table('sport_leagues')
