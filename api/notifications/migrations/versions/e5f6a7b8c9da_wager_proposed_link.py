"""wager_proposed SMS template: add the /c/<code> deep link

Revision ID: e5f6a7b8c9da
Revises: d4e5f6a7b8c9
Create Date: 2026-07-30 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e5f6a7b8c9da'
down_revision = 'd4e5f6a7b8c9'
branch_labels = None
depends_on = None

_NEW = "{{from_name}} bet you {{amount}} on {{matchup}} in {{league}}. Accept or reject: {{link}}"
_OLD = "{{from_name}} bet you {{amount}} on {{matchup}} in {{league}}. Open the app to accept."


def _set_body(body: str):
    op.get_bind().execute(
        sa.text(
            "UPDATE notification_templates SET body = :body "
            "WHERE key = 'wager_proposed' AND channel = 'sms' AND version = 1"
        ),
        {"body": body},
    )


def upgrade():
    # In-place body update (the seed catalog only inserts a missing v1, so it
    # would never refresh an existing row). Mirrors the league_invite {{link}}.
    _set_body(_NEW)


def downgrade():
    _set_body(_OLD)
