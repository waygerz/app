"""conversation reads

Revision ID: e4f5a6b7c8d9
Revises: d3e4f5a6b7c8
Create Date: 2026-07-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = "e4f5a6b7c8d9"
down_revision = "d3e4f5a6b7c8"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "conversation_reads",
        sa.Column("user_id", UUID(as_uuid=False), nullable=False),
        sa.Column("conversation_id", UUID(as_uuid=False), nullable=False),
        sa.Column("last_read_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "conversation_id"),
    )
    with op.batch_alter_table("conversation_reads", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_conversation_reads_conversation_id"),
            ["conversation_id"],
            unique=False,
        )


def downgrade():
    with op.batch_alter_table("conversation_reads", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_conversation_reads_conversation_id"))
    op.drop_table("conversation_reads")