"""wager SMS copy: name the opponent + end with the bare /c link (drop CTA text)

Revision ID: b1c2d3e4f5a6
Revises: a7b8c9dabc01
Create Date: 2026-09-05 00:00:00.000000

Rewrites the five wager SMS bodies to the reviewed copy: identify the opponent
and end with the bet's /c/<code> link (which opens the scored bet view), with no
"Accept or reject" / "Open the app" filler. Also removes the em dashes and the 🎉
that were forcing UCS-2 (2x segments) — every body is now 1-segment GSM-7. The
seed catalog only inserts a MISSING v1, so it never refreshes an existing row;
this UPDATEs them in place (v1, sms), mirroring e5f6a7b8c9da.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b1c2d3e4f5a6'
down_revision = 'a7b8c9dabc01'
branch_labels = None
depends_on = None

# key -> (new body, previous body for downgrade)
_BODIES = {
    "wager_proposed": (
        "{{from_name}} bet you {{amount}} on {{matchup}}. {{link}}",
        "{{from_name}} bet you {{amount}} on {{matchup}} in {{league}}. Accept or reject: {{link}}",
    ),
    "wager_accepted": (
        "{{other_name}} accepted your bet on {{matchup}}. {{link}}",
        "{{other_name}} accepted your bet on {{matchup}} ({{league}}).",
    ),
    "wager_countered": (
        "{{other_name}} countered: {{amount}} (was {{was}}) on {{matchup}}. {{link}}",
        "{{other_name}} countered your bet — now {{amount}} (was {{was}}) on {{matchup}} in {{league}}. Open the app to respond.",
    ),
    "wager_settled_win": (
        "You beat {{other_name}} and won {{amount}} on {{matchup}}. {{link}}",
        "You won {{amount}} on {{matchup}} in {{league}}! \U0001F389",
    ),
    "wager_settled_loss": (
        "{{other_name}} beat you on {{matchup}}. {{link}}",
        "Tough luck — you lost your bet on {{matchup}} ({{league}}).",
    ),
}


def _set(key: str, body: str):
    op.get_bind().execute(
        sa.text(
            "UPDATE notification_templates SET body = :body "
            "WHERE key = :key AND channel = 'sms' AND version = 1"
        ),
        {"body": body, "key": key},
    )


def upgrade():
    for key, (new, _old) in _BODIES.items():
        _set(key, new)


def downgrade():
    for key, (_new, old) in _BODIES.items():
        _set(key, old)
