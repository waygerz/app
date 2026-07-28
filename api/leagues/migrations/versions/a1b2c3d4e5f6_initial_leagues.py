"""initial leagues schema

Revision ID: a1b2c3d4e5f6
Revises:
Create Date: 2026-06-20 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID


# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('leagues',
    sa.Column('id', UUID(as_uuid=False), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('name', sa.String(length=120), nullable=False),
    sa.Column('logo_url', sa.String(length=500), nullable=True),
    sa.Column('commissioner_id', UUID(as_uuid=False), nullable=False),
    sa.Column('league_type', sa.String(length=16), nullable=False),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('join_code', sa.String(length=16), nullable=False),
    sa.Column('invite_token', UUID(as_uuid=False), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('period_type', sa.String(length=8), nullable=False),
    sa.Column('starting_balance_cents', sa.BigInteger(), nullable=True),
    sa.Column('min_wager_cents', sa.BigInteger(), nullable=True),
    sa.Column('max_wager_cents', sa.BigInteger(), nullable=True),
    sa.Column('rules', JSONB(), server_default='{}', nullable=False),
    sa.Column('starts_at', sa.DateTime(), nullable=True),
    sa.Column('ends_at', sa.DateTime(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('join_code', name='uq_league_join_code'),
    sa.UniqueConstraint('invite_token', name='uq_league_invite_token')
    )
    with op.batch_alter_table('leagues', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_leagues_commissioner_id'), ['commissioner_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_leagues_join_code'), ['join_code'], unique=False)
        batch_op.create_index(batch_op.f('ix_leagues_league_type'), ['league_type'], unique=False)
        batch_op.create_index(batch_op.f('ix_leagues_status'), ['status'], unique=False)

    op.create_table('league_members',
    sa.Column('id', UUID(as_uuid=False), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('league_id', UUID(as_uuid=False), nullable=False),
    sa.Column('user_id', UUID(as_uuid=False), nullable=False),
    sa.Column('role', sa.String(length=16), nullable=False),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('joined_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('league_id', 'user_id', name='uq_league_member')
    )
    with op.batch_alter_table('league_members', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_league_members_league_id'), ['league_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_league_members_status'), ['status'], unique=False)
        batch_op.create_index(batch_op.f('ix_league_members_user_id'), ['user_id'], unique=False)

    op.create_table('league_periods',
    sa.Column('id', UUID(as_uuid=False), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('league_id', UUID(as_uuid=False), nullable=False),
    sa.Column('index', sa.Integer(), nullable=False),
    sa.Column('label', sa.String(length=40), nullable=False),
    sa.Column('starts_at', sa.DateTime(), nullable=True),
    sa.Column('ends_at', sa.DateTime(), nullable=True),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('league_periods', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_league_periods_league_id'), ['league_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_league_periods_status'), ['status'], unique=False)

    op.create_table('league_sports',
    sa.Column('id', UUID(as_uuid=False), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('league_id', UUID(as_uuid=False), nullable=False),
    sa.Column('sport_league_id', sa.String(length=64), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('league_id', 'sport_league_id', name='uq_league_sport')
    )
    with op.batch_alter_table('league_sports', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_league_sports_league_id'), ['league_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_league_sports_sport_league_id'), ['sport_league_id'], unique=False)

    op.create_table('league_invites',
    sa.Column('id', UUID(as_uuid=False), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('league_id', UUID(as_uuid=False), nullable=False),
    sa.Column('inviter_id', UUID(as_uuid=False), nullable=False),
    sa.Column('invitee_id', UUID(as_uuid=False), nullable=False),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('league_invites', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_league_invites_invitee_id'), ['invitee_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_league_invites_league_id'), ['league_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_league_invites_status'), ['status'], unique=False)

    op.create_table('league_feed',
    sa.Column('id', UUID(as_uuid=False), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('league_id', UUID(as_uuid=False), nullable=False),
    sa.Column('kind', sa.String(length=16), nullable=False),
    sa.Column('event_type', sa.String(length=40), nullable=True),
    sa.Column('author_id', UUID(as_uuid=False), nullable=True),
    sa.Column('title', sa.String(length=160), nullable=True),
    sa.Column('body', sa.Text(), nullable=True),
    sa.Column('link_url', sa.String(length=500), nullable=True),
    sa.Column('link_label', sa.String(length=80), nullable=True),
    sa.Column('meta', JSONB(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('dedup_key', sa.String(length=120), nullable=True),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('dedup_key', name='uq_feed_dedup')
    )
    with op.batch_alter_table('league_feed', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_league_feed_created_at'), ['created_at'], unique=False)
        batch_op.create_index(batch_op.f('ix_league_feed_kind'), ['kind'], unique=False)
        batch_op.create_index(batch_op.f('ix_league_feed_league_id'), ['league_id'], unique=False)


def downgrade():
    op.drop_table('league_feed')
    op.drop_table('league_invites')
    op.drop_table('league_sports')
    op.drop_table('league_periods')
    op.drop_table('league_members')
    op.drop_table('leagues')
