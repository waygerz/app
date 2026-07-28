"""notifications initial (messages, preferences, templates)

Revision ID: f0e1d2c3b4a5
Revises:
Create Date: 2026-07-06 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = "f0e1d2c3b4a5"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "messages",
        sa.Column("id", UUID(as_uuid=False), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=False), nullable=False),
        sa.Column("channel", sa.String(length=16), nullable=False),
        sa.Column("category", sa.String(length=32), nullable=False),
        sa.Column("dedup_key", sa.String(length=160), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("provider_msg_id", sa.String(length=128), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("dedup_key", name="uq_messages_dedup_key"),
    )
    with op.batch_alter_table("messages", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_messages_user_id"), ["user_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_messages_status"), ["status"], unique=False)

    op.create_table(
        "notification_preferences",
        sa.Column("user_id", UUID(as_uuid=False), nullable=False),
        sa.Column("wager_alerts", sa.Boolean(), nullable=False),
        sa.Column("weekly_digest", sa.Boolean(), nullable=False),
        sa.Column("opted_out", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("user_id"),
    )

    op.create_table(
        "notification_templates",
        sa.Column("id", UUID(as_uuid=False), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("locale", sa.String(length=8), nullable=False),
        sa.Column("channel", sa.String(length=16), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("key", "locale", "channel", "version", name="uq_template_ver"),
    )
    with op.batch_alter_table("notification_templates", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_notification_templates_key"), ["key"], unique=False)


def downgrade():
    with op.batch_alter_table("notification_templates", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_notification_templates_key"))
    op.drop_table("notification_templates")

    op.drop_table("notification_preferences")

    with op.batch_alter_table("messages", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_messages_status"))
        batch_op.drop_index(batch_op.f("ix_messages_user_id"))
    op.drop_table("messages")
