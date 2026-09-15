"""seed the pickem_week SMS template (league gameplay week notifications)

Revision ID: d3e4f5a6b7c8
Revises: c2d3e4f5a6b7
Create Date: 2026-09-15 00:00:00.000000

The leagues service fires a `pickem_week` notification (category league_alert)
when a pick'em week opens and/or a week finishes — one combined message. The
shared body is a pre-computed headline + the /play link. Idempotent
(INSERT ... WHERE NOT EXISTS), mirroring a7b8c9dabc01. The seed catalog only
inserts a missing v1, so this covers already-provisioned environments.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd3e4f5a6b7c8'
down_revision = 'c2d3e4f5a6b7'
branch_labels = None
depends_on = None

_KEY = "pickem_week"
_BODY = "{{headline}} {{link}}"


def upgrade():
    op.get_bind().execute(
        sa.text(
            "INSERT INTO notification_templates "
            "(key, locale, channel, body, active, version, created_at) "
            "SELECT :key, 'en', 'sms', :body, true, 1, now() "
            "WHERE NOT EXISTS (SELECT 1 FROM notification_templates "
            "WHERE key = :key AND locale = 'en' AND channel = 'sms' AND version = 1)"
        ),
        {"key": _KEY, "body": _BODY},
    )


def downgrade():
    op.get_bind().execute(
        sa.text(
            "DELETE FROM notification_templates "
            "WHERE key = :key AND locale = 'en' AND channel = 'sms' AND version = 1"
        ),
        {"key": _KEY},
    )
