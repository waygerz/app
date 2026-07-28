# notifications (Phase 7 — scaffold)

SMS notifications service. **Scaffolded but not deployed** — it needs an AWS
account + **A2P 10DLC** registration before it can send real texts, so it is
intentionally left out of `app/docker-compose.yml` and OTP delivery still uses the
existing mock (`app/auth/app/services/service_auth.py`).

## What's here
- **Models**: `messages` (audit + idempotency), `notification_preferences`
  (per-user; weekly digest opt-in per TCPA), `notification_templates`
  (named, versioned, `{{placeholders}}`).
- **Provider seam** (`app/services/provider.py`): `LogProvider` (default — prints,
  sends nothing) and `AwsProvider` (AWS End User Messaging via boto3
  `send_text_message`). `SMS_PROVIDER=log|aws`.
- **Renderer** (`app/services/render.py`): strict `{{var}}` interpolation +
  brand prefix; fails loudly on a missing variable.
- **Endpoints** (`/internal/*`, token-guarded): `POST /internal/send`
  (render + send, respects prefs + dedup), `POST /internal/preferences`.
- **CLI**: `flask init-schema`, `flask seed-templates` (starter catalog).

## To stand it up (when AWS is ready)
1. **10DLC**: register Brand + Campaign in AWS End User Messaging (days–weeks
   lead time, fees) — required for all app→person SMS incl. OTP. Get an
   origination identity (phone pool / number id).
2. Add to `app/docker-compose.yml`: a `notifications` service (schema
   `notifications`, port internal `:8000`) + gateway is NOT needed (server-only).
   Give it `INTERNAL_TOKEN`, `SMS_PROVIDER=aws`, `AWS_REGION`,
   `SMS_ORIGINATION_IDENTITY`, and IAM creds (prefer an instance role) with
   `sms-voice:SendTextMessage`. Add `NOTIFICATIONS_URL=http://notifications:8000`
   to `auth`/`contests`/`leagues`.
3. Generate the initial migration (`flask db migrate` from these models) and run
   `init-schema` + `db upgrade` + `seed-templates` (fold into `_scripts/deploy.sh`).
4. **Wire triggers**:
   - OTP: swap `auth` signup/login to call `POST /internal/send` (template
     `otp_code`) instead of returning `dev_otp` — keep the Redis OTP logic.
   - Wager alerts: `contests` fires proposed/accepted/declined/settled.
   - Weekly digest: the leagues period-rollover worker fires per league/period.
5. **STOP/HELP**: mirror AWS's opt-out list into `opted_out`; never enqueue to
   opted-out users.
6. Move sends behind a Redis queue (§10) so a slow provider never blocks a request.
