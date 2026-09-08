"""friend_request SMS copy: end with the /friends link (drop "Open the app")

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-09-08 00:00:00.000000

Adds a tappable link to the friend-request SMS, matching the wager/league copy.
The recipient lands on their friends list (where the request is accepted), so
"Open the app to accept." becomes a bare https://waygerz.com/friends link. Stays
1-segment GSM-7. The seed catalog only inserts a MISSING v1, so it never refreshes
an existing row; this UPDATEs it in place (v1, sms), mirroring b1c2d3e4f5a6.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c2d3e4f5a6b7'
down_revision = 'b1c2d3e4f5a6'
branch_labels = None
depends_on = None

_KEY = "friend_request"
_NEW = "{{from_name}} sent you a friend request on Waygerz. {{link}}"
_OLD = "{{from_name}} sent you a friend request on Waygerz. Open the app to accept."


def _set(body: str):
    op.get_bind().execute(
        sa.text(
            "UPDATE notification_templates SET body = :body "
            "WHERE key = :key AND channel = 'sms' AND version = 1"
        ),
        {"body": body, "key": _KEY},
    )


def upgrade():
    _set(_NEW)


def downgrade():
    _set(_OLD)
