# Waygerz API — Endpoint Inventory

Every HTTP route across the 10 Flask services, extracted from each service's
`app/routes/`. Full path = **service prefix** (shown per section) + the listed
path. Auth is decentralized JWT (cookies for web, `Authorization: Bearer` for
mobile) unless noted.

**Legend**
- **REST** — resource CRUD (verb + noun, standard semantics)
- **action** — RPC-style action on a resource (verb in the path)
- **deep-link** — shareable `/c/<code>` link surface (resolve is JWT-optional)
- **internal** — service-to-service, guarded by `X-Internal-Token`
  (`internal_only`), **not routed by the gateway** — reachable only on the
  compose network (scheduler + sibling services)
- **admin** — privileged, also `internal_only`
- **health** — `GET /health` liveness (used by the ALB), present on every service

Every service also exposes `GET <prefix>/health` (omitted from the tables below).

---

## platform group

### auth — `/v1/platform/auth`
| Method | Path | Type |
|--------|------|------|
| POST | `/otp/start` | action |
| POST | `/otp/verify` | action |
| POST | `/otp/complete` | action |
| POST | `/refresh` | action |
| POST | `/logout` | action |
| GET | `/me` | REST |
| PATCH | `/me` | REST |
| PATCH | `/me/avatar` | REST |
| POST | `/internal/lookup-phone` | internal |
| POST | `/internal/users` | internal |

### notifications — `/v1/platform/notifications`
| Method | Path | Type |
|--------|------|------|
| GET | `/me` | REST (feed) |
| GET | `/me/unread-count` | REST (read) |
| POST | `/me/read` | action |
| GET | `/me/preferences` | REST |
| PUT | `/me/preferences` | REST |
| POST | `/me/devices` | REST (register push token) |
| DELETE | `/me/devices` | REST |
| POST | `/internal/send` | internal |
| POST | `/internal/notify` | internal |
| POST | `/internal/preferences` | internal |

### media — `/v1/platform/media`
| Method | Path | Type |
|--------|------|------|
| POST | `/uploads/presign` | action (S3 presign) |
| POST | `/uploads/<asset_id>/complete` | action |
| GET | `/uploads/resolve` | action (key → URL) |
| GET | `/uploads/mine` | REST |
| GET | `/uploads/<asset_id>` | REST |
| DELETE | `/uploads/<asset_id>` | REST |
| POST | `/internal/verify` | internal |

### ingestor — `/v1/platform/ingestor`
| Method | Path | Type |
|--------|------|------|
| GET | `/events` | REST |
| GET | `/events/<key>` | REST |
| POST | `/events/sync` | action |
| GET | `/schedule/<sport>/<league>/weeks` | REST |
| GET | `/schedule/by-catalog/<sport_league_id>/weeks` | REST |
| GET | `/sports` | REST |
| GET | `/sports/<sport>/leagues` | REST |
| GET | `/sports/<sport>/leagues/<league>/teams` | REST |
| GET | `/sports/<sport>/leagues/<league>/events` | REST |
| GET | `/sports/<sport>/leagues/<league>/events/<event_id>/odds` | REST |
| GET | `/cricket/matches` · `/cricket/matches/<external_id>` | REST |
| GET | `/golf/tournaments` · `/golf/tournaments/<external_id>` | REST |
| GET | `/mma/cards` · `/mma/cards/<external_id>` | REST |
| GET | `/racing/events` · `/racing/events/<external_id>` | REST |
| POST | `/internal/events/<key>/refresh` | internal |
| POST | `/internal/tick` | internal (scheduler) |
| POST | `/internal/catalog/sync` | internal |

---

## social group

### friends — `/v1/social/friends`
| Method | Path | Type |
|--------|------|------|
| GET | `/` | REST (friend list) |
| GET | `/my-code` | action (my share code) |
| GET | `/c/<code>` | deep-link (JWT-optional) |
| POST | `/c/<code>/act` | deep-link action |
| POST | `/requests` | REST (create request) |
| GET | `/requests` | REST |
| POST | `/requests/<req_id>/accept` | action |
| POST | `/requests/<req_id>/decline` | action |
| DELETE | `/users/<user_id>` | REST (unfriend) |
| POST | `/internal/are-friends` | internal |

### comments — `/v1/social/comments`
| Method | Path | Type |
|--------|------|------|
| GET | `/posts/<post_id>/comments` | REST |
| POST | `/posts/<post_id>/comments` | REST |
| DELETE | `/comments/<comment_id>` | REST |
| POST | `/posts/<post_id>/like` | action |
| POST | `/posts/engagement` | action (batch counts) |

### messaging — `/v1/social/messaging`
| Method | Path | Type |
|--------|------|------|
| GET | `/conversations` | REST |
| POST | `/conversations` | REST |
| GET | `/conversations/unread-count` | REST (read) |
| GET | `/conversations/<id>/messages` | REST |
| POST | `/conversations/<id>/messages` | REST |
| GET | `/conversations/<id>/stream` | action (SSE stream) |
| POST | `/conversations/<id>/read` | action |
| POST | `/conversations/<id>/typing` | action |
| PATCH | `/messages/<id>` | REST |
| DELETE | `/messages/<id>` | REST |
| POST | `/internal/messages` | internal (bet-in-DM cards) |

---

## gameplay group

### wallet — `/v1/gameplay/wallet`
| Method | Path | Type |
|--------|------|------|
| GET | `/me?account=…` | REST (balance) |
| GET | `/me/transactions?account=…` | REST (ledger) |
| POST | `/internal/balances` | internal |
| POST | `/internal/account-balances` | internal |
| POST | `/internal/grant` | internal |
| POST | `/internal/hold` | internal |
| POST | `/internal/payout` | internal |
| POST | `/internal/refund` | internal |

> Wallet has **no public write** endpoints — money only moves via internal
> grant/hold/payout/refund called by leagues + contests.

### contests — `/v1/gameplay/contests`
| Method | Path | Type |
|--------|------|------|
| GET | `/c/<code>` | deep-link (JWT-optional) |
| POST | `/c/<code>/act` | deep-link action |
| POST | `/wagers` | REST (create; fans out to N acceptors) |
| GET | `/wagers` | REST (list; `?league_id` `?status`) |
| GET | `/wagers/<id>` | REST |
| POST | `/wagers/<id>/accept` | action |
| POST | `/wagers/<id>/decline` | action |
| POST | `/wagers/<id>/cancel` | action |
| POST | `/wagers/<id>/cancel/request` | action |
| POST | `/wagers/<id>/cancel/approve` | action |
| POST | `/wagers/<id>/cancel/reject` | action |
| POST | `/wagers/<id>/confirm` | action (legacy — see H2H plan B1) |
| POST | `/admin/settle` | admin (`internal_only`) |
| POST | `/internal/league-record` | internal |
| POST | `/internal/tick` | internal (scheduler) |

### leagues — `/v1/gameplay/leagues`
| Method | Path | Type |
|--------|------|------|
| POST | `/` | REST (create) |
| GET | `/` | REST (my leagues) |
| GET | `/c/<code>` | deep-link (JWT-optional) |
| POST | `/c/<code>/act` | deep-link action |
| GET | `/<id>` | REST |
| PATCH | `/<id>` | REST |
| POST | `/<id>/activate` | action |
| GET | `/<id>/periods` | REST |
| POST | `/<id>/periods/regenerate` | action |
| GET | `/<id>/periods/<pid>/picks` | REST |
| PUT | `/<id>/periods/<pid>/picks` | REST (upsert picks) |
| GET | `/<id>/periods/<pid>/results` | REST |
| GET | `/<id>/periods/<pid>/members/<uid>/picks` | REST |
| PUT | `/<id>/periods/<pid>/members/<uid>/confirm` | action |
| GET | `/<id>/standings` | REST |
| GET | `/<id>/feed` | REST |
| POST | `/<id>/feed` | REST |
| POST | `/<id>/join` | action (accept invite) |
| POST | `/<id>/invites` | REST (send invites) |
| GET | `/invites` | REST (my invites) |
| POST | `/<id>/leave` | action |
| DELETE | `/<id>/members/<uid>` | REST (remove) |
| PATCH | `/<id>/members/<uid>/role` | REST |
| POST | `/<id>/members/<uid>/transfer` | action (transfer commissioner) |
| POST | `/<id>/archive` | action |
| POST | `/<id>/advance-period` | action |
| POST | `/internal/share-membership` | internal |
| POST | `/internal/user-league-ids` | internal |
| POST | `/internal/member-access` | internal |
| POST | `/internal/are-comembers` | internal |
| POST | `/internal/league-context` | internal |
| POST | `/internal/feed-post-access` | internal |
| POST | `/internal/feed-posts-access` | internal |
| POST | `/internal/leagues/<id>/feed` | internal (other services push activity) |
| POST | `/internal/tick` | internal (scheduler) |

---

## Notes

- **`/internal/*` (and contests `/admin/settle`) are private** — the gateway
  (`api/gateway/conf.d/default.conf`) does not route them; they're only reachable
  on the compose network via `X-Internal-Token`. The `scheduler` service drives
  the three `/internal/tick` endpoints (contests, leagues, ingestor) every 30s.
- **Mobile parity:** `mobile/lib/config.dart` mirrors these prefixes; the app
  currently wires auth, notifications, leagues, wagers, and wallet.
- **Style:** REST conventions for CRUD, RPC-style sub-routes for actions
  (`/accept`, `/activate`, `/advance-period`, `/otp/verify`, …). No GraphQL/gRPC.
  Messaging's `/conversations/<id>/stream` is Server-Sent Events, not request/response.
