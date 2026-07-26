"""comments

Revision ID: b1c2d3e4f5a6
Revises:
Create Date: 2026-06-27 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = "b1c2d3e4f5a6"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "comments",
        sa.Column("id", UUID(as_uuid=False), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("post_id", UUID(as_uuid=False), nullable=False),
        sa.Column("league_id", UUID(as_uuid=False), nullable=False),
        sa.Column("author_id", UUID(as_uuid=False), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("comments", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_comments_author_id"), ["author_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_comments_created_at"), ["created_at"], unique=False)
        batch_op.create_index(batch_op.f("ix_comments_league_id"), ["league_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_comments_post_id"), ["post_id"], unique=False)


def downgrade():
    with op.batch_alter_table("comments", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_comments_post_id"))
        batch_op.drop_index(batch_op.f("ix_comments_league_id"))
        batch_op.drop_index(batch_op.f("ix_comments_created_at"))
        batch_op.drop_index(batch_op.f("ix_comments_author_id"))

    op.drop_table("comments")