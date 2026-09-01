"""durable auth sessions table (moved out of Redis)

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-09-01 00:00:00.000000

Sessions used to live only in Redis (memory-capped, allkeys-lru, no persistence),
so they were being evicted / lost — and a missing session fails the next refresh,
logging the user out. Make the session store durable by moving it to Postgres.
Runs with search_path=<DB_SCHEMA> (auth), so the table lands in the auth schema.

NOTE: on cutover, existing Redis-only sessions are not migrated (there's no
durable copy to migrate). Every user re-logs in once after deploy, then their
session is durable from then on.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f6a7b8c9d0e1'
down_revision = 'e5f6a7b8c9d0'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'sessions',
        sa.Column('device_uuid', sa.String(length=64), nullable=False),
        sa.Column('user_uuid', sa.String(length=36), nullable=False),
        sa.Column('phone', sa.String(length=32), nullable=False),
        sa.Column('status', sa.String(length=16), nullable=False, server_default='active'),
        sa.Column('refresh_token_hash', sa.String(length=64), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('last_seen', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('device_uuid'),
    )
    op.create_index('ix_sessions_user_uuid', 'sessions', ['user_uuid'])
    op.create_index('ix_sessions_expires_at', 'sessions', ['expires_at'])


def downgrade():
    op.drop_index('ix_sessions_expires_at', table_name='sessions')
    op.drop_index('ix_sessions_user_uuid', table_name='sessions')
    op.drop_table('sessions')
