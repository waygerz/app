"""messaging

Revision ID: d3e4f5a6b7c8
Revises:
Create Date: 2026-06-27 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = "d3e4f5a6b7c8"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "conversations",
        sa.Column("id", UUID(as_uuid=False), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("type", sa.String(length=16), nullable=False),
        sa.Column("league_id", UUID(as_uuid=False), nullable=True),
        sa.Column("direct_key", sa.String(length=80), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("league_id"),
        sa.UniqueConstraint("direct_key"),
    )
    with op.batch_alter_table("conversations", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_conversations_type"), ["type"], unique=False)

    op.create_table(
        "chat_messages",
        sa.Column("id", UUID(as_uuid=False), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("conversation_id", UUID(as_uuid=False), nullable=False),
        sa.Column("author_id", UUID(as_uuid=False), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("chat_messages", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_chat_messages_author_id"), ["author_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_chat_messages_conversation_id"), ["conversation_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_chat_messages_created_at"), ["created_at"], unique=False)


def downgrade():
    op.drop_table("chat_messages")
    with op.batch_alter_table("conversations", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_conversations_type"))
    op.drop_table("conversations")