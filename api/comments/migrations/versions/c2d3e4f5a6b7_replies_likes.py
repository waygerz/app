"""replies and post likes

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-06-27 00:00:01.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = "c2d3e4f5a6b7"
down_revision = "b1c2d3e4f5a6"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("comments", schema=None) as batch_op:
        batch_op.add_column(sa.Column("parent_id", UUID(as_uuid=False), nullable=True))
        batch_op.create_index(batch_op.f("ix_comments_parent_id"), ["parent_id"], unique=False)
        batch_op.create_foreign_key(
            "fk_comments_parent_id", "comments", ["parent_id"], ["id"], ondelete="CASCADE"
        )

    op.create_table(
        "post_likes",
        sa.Column("id", UUID(as_uuid=False), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("post_id", UUID(as_uuid=False), nullable=False),
        sa.Column("user_id", UUID(as_uuid=False), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("post_id", "user_id", name="uq_post_like_user"),
    )
    with op.batch_alter_table("post_likes", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_post_likes_post_id"), ["post_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_post_likes_user_id"), ["user_id"], unique=False)


def downgrade():
    op.drop_table("post_likes")
    with op.batch_alter_table("comments", schema=None) as batch_op:
        batch_op.drop_constraint("fk_comments_parent_id", type_="foreignkey")
        batch_op.drop_index(batch_op.f("ix_comments_parent_id"))
        batch_op.drop_column("parent_id")