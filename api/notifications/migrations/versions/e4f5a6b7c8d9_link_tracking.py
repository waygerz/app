"""link tracking: redirect_links + link_clicks (/c/R shorten + click log)

Revision ID: e4f5a6b7c8d9
Revises: d3e4f5a6b7c8
Create Date: 2026-09-15 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'e4f5a6b7c8d9'
down_revision = 'd3e4f5a6b7c8'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "redirect_links",
        sa.Column("code", sa.String(length=16), primary_key=True),
        sa.Column("target_path", sa.Text(), nullable=False),
        sa.Column("kind", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("target_path", "kind", name="uq_redirect_target_kind"),
    )
    op.create_table(
        "link_clicks",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=False), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("source", sa.String(length=8), nullable=False),
        sa.Column("kind", sa.String(length=64), nullable=False),
        sa.Column("code", sa.String(length=16), nullable=True),
        sa.Column("user_id", sa.dialects.postgresql.UUID(as_uuid=False), nullable=True),
        sa.Column("ua", sa.String(length=512), nullable=True),
        sa.Column("ip", sa.String(length=64), nullable=True),
        sa.Column("at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_link_clicks_user_id", "link_clicks", ["user_id"])
    op.create_index("ix_link_clicks_kind_user", "link_clicks", ["kind", "user_id"])


def downgrade():
    op.drop_index("ix_link_clicks_kind_user", table_name="link_clicks")
    op.drop_index("ix_link_clicks_user_id", table_name="link_clicks")
    op.drop_table("link_clicks")
    op.drop_table("redirect_links")
