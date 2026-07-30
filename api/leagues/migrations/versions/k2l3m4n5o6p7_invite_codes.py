"""invite codes: league_invite_codes table, drop join_code/invite_token

Revision ID: k2l3m4n5o6p7
Revises: j1k2l3m4n5o6
Create Date: 2026-07-30 00:00:00.000000

"""
import secrets

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision = 'k2l3m4n5o6p7'
down_revision = 'j1k2l3m4n5o6'
branch_labels = None
depends_on = None

_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def _code() -> str:
    return "L" + "".join(secrets.choice(_ALPHABET) for _ in range(6))


def upgrade():
    op.create_table(
        'league_invite_codes',
        sa.Column('id', UUID(as_uuid=False), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('code', sa.String(length=16), nullable=False),
        sa.Column('league_id', UUID(as_uuid=False), nullable=False),
        sa.Column('created_by', UUID(as_uuid=False), nullable=False),
        sa.Column('single_use', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        sa.Column('consumed_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    # Uniqueness comes from the unique index (matches the model's
    # `unique=True, index=True`) — no separate named constraint, to avoid drift.
    with op.batch_alter_table('league_invite_codes', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_league_invite_codes_code'), ['code'], unique=True)
        batch_op.create_index(batch_op.f('ix_league_invite_codes_league_id'), ['league_id'], unique=False)

    # Seed one reusable code per existing league so old leagues stay joinable.
    conn = op.get_bind()
    rows = conn.execute(sa.text('SELECT id, commissioner_id FROM leagues')).fetchall()
    seen = set()
    for lid, commish in rows:
        code = _code()
        while code in seen:
            code = _code()
        seen.add(code)
        conn.execute(
            sa.text(
                "INSERT INTO league_invite_codes "
                "(code, league_id, created_by, single_use, created_at) "
                "VALUES (:code, :lid, :cb, false, timezone('utc', now()))"
            ),
            {"code": code, "lid": lid, "cb": commish},
        )

    # Old share-link storage — replaced by the unified /j/<code> route.
    # Postgres drops the dependent unique constraints/indexes with the columns.
    with op.batch_alter_table('leagues', schema=None) as batch_op:
        batch_op.drop_column('invite_token')
        batch_op.drop_column('join_code')


def downgrade():
    with op.batch_alter_table('leagues', schema=None) as batch_op:
        batch_op.add_column(sa.Column('join_code', sa.String(length=16), nullable=True))
        batch_op.add_column(sa.Column(
            'invite_token', UUID(as_uuid=False),
            server_default=sa.text('gen_random_uuid()'), nullable=True,
        ))
        batch_op.create_index(batch_op.f('ix_leagues_join_code'), ['join_code'], unique=False)
        batch_op.create_unique_constraint('uq_league_join_code', ['join_code'])
        batch_op.create_unique_constraint('uq_league_invite_token', ['invite_token'])

    with op.batch_alter_table('league_invite_codes', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_league_invite_codes_league_id'))
        batch_op.drop_index(batch_op.f('ix_league_invite_codes_code'))
    op.drop_table('league_invite_codes')
