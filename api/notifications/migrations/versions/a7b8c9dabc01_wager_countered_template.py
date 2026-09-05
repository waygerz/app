"""seed the wager_countered SMS template (counter-offer notifications)

Revision ID: a7b8c9dabc01
Revises: f6a7b8c9dbef
Create Date: 2026-09-05 00:00:00.000000

The counter-offer feature (contests) fires a `wager_countered` notification, but
no such template was ever seeded — so notify() raised RenderError and dropped the
whole notification (no feed row, no SMS). `flask seed-templates` only inserts a
missing v1 on demand and isn't wired into deploy, so seed the row here as a data
migration that ships via `migrate=true`. Idempotent (INSERT ... WHERE NOT EXISTS),
so it no-ops if the row already exists (e.g. a prior `flask seed-templates`).
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a7b8c9dabc01'
down_revision = 'f6a7b8c9dbef'
branch_labels = None
depends_on = None

_KEY = "wager_countered"
_BODY = (
    "{{other_name}} countered your bet — now {{amount}} (was {{was}}) "
    "on {{matchup}} in {{league}}. Open the app to respond."
)


def upgrade():
    # id has a gen_random_uuid() server default; created_at has only a
    # Python-side default so it's set explicitly here. Guarded against the
    # seed catalog's uq (key, locale, channel, version) so a re-run — or a
    # prior `flask seed-templates` — is a no-op.
    op.get_bind().execute(
        sa.text(
            "INSERT INTO notification_templates "
            "(key, locale, channel, body, active, version, created_at) "
            "SELECT :key, 'en', 'sms', :body, true, 1, now() "
            "WHERE NOT EXISTS ("
            "  SELECT 1 FROM notification_templates "
            "  WHERE key = :key AND locale = 'en' AND channel = 'sms' AND version = 1)"
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
