"""friendships

Revision ID: f8859c39f61d
Revises:
Create Date: 2026-06-20 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision = 'f8859c39f61d'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('friendships',
    sa.Column('id', UUID(as_uuid=False), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('requester_id', UUID(as_uuid=False), nullable=False),
    sa.Column('addressee_id', UUID(as_uuid=False), nullable=False),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('requester_id', 'addressee_id', name='uq_friend_pair')
    )
    with op.batch_alter_table('friendships', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_friendships_addressee_id'), ['addressee_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_friendships_requester_id'), ['requester_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_friendships_status'), ['status'], unique=False)


def downgrade():
    with op.batch_alter_table('friendships', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_friendships_status'))
        batch_op.drop_index(batch_op.f('ix_friendships_requester_id'))
        batch_op.drop_index(batch_op.f('ix_friendships_addressee_id'))

    op.drop_table('friendships')
