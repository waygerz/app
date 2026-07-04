# WebUI — Agent Instructions

React 19 + Vite 7 + Tailwind v4 + shadcn/ui frontend for Waygerz. Based on Metronic Starter Kit v9 (`layout-35` shell only).

## Structure

```
webui/src/
  lib/           # API clients (auth.ts, leagues.ts, wagers.ts, wallet.ts, …)
  pages/         # Route-level pages
  components/    # Shared UI (ui/ = shadcn primitives)
  routing/       # app-routing-setup.tsx — all routes under RequireAuth
  styles/        # globals.css, layout.css (Tailwind v4)
```

## API clients

- One file per backend domain in `src/lib/`.
- Versioned path prefixes live in `src/lib/api-paths.ts` (must match backend `Config.api_prefix()`).
- Base URL from the shared `API_BASE` in `src/lib/api-paths.ts` (built from `VITE_API_URL`); append `API.<service>` for the path.
- Production (Docker): single `VITE_API_URL=/api` — e.g. `/api` + `/v1/core/auth/login`. For the ALB, build with `VITE_API_URL=""` so the browser calls `/v1/...` directly.
- Local dev: leave `VITE_API_URL` unset (defaults to `/api`); Vite proxies `/api` → the gateway via `VITE_DEV_PROXY_TARGET` (see `vite.config.ts`). The old per-service `VITE_*_URL` overrides (each pointing at a different localhost port) were consolidated into this one base.
- Every authenticated request sends `Authorization: Bearer <token>` (token in `localStorage`, key `waygerz_token`).
- Throw on non-OK responses; surface `data.error` when present.

When adding a new backend integration, follow the pattern in `src/lib/leagues.ts` or `src/lib/auth.ts`.

## Routing

League-first navigation (see `_docs/APP_PLAN.md` §5):

| Route | Purpose |
|-------|---------|
| `/` | Dashboard — league avatar cards |
| `/leagues` | List + create/join |
| `/leagues/new` | Create league wizard |
| `/leagues/:id` | League home (balance, feed, standings, CTA) |
| `/leagues/:id/bet` | Type-aware betting (head-to-head / pool) |
| `/leagues/:id/picks` | Pick'em picks |
| `/leagues/:id/manage` | Commissioner panel |

Register new routes in `src/routing/app-routing-setup.tsx`.

## UI conventions

- **Tailwind v4** for all styling — no CSS modules unless already present.
- **shadcn/ui** primitives in `src/components/ui/` — extend, don't fork.
- **Forms**: react-hook-form + zod (already in stack).
- **Data fetching**: @tanstack/react-query for server state.
- **Toasts**: sonner.
- **Money display**: integer cents from API → format as credits/dollars in the UI layer.
- **League type badges**: `head_to_head`, `pool`, `pickem` — show human labels, branch CTAs by type.
- **Pick'em**: no balance UI; show record/rank instead.

## Type awareness

Components that render league-specific UI must check `league_type`:

- `head_to_head` — propose/accept wagers, even-money flow
- `pool` — stake into shared pot, parimutuel display
- `pickem` — picks form + scoreboard, no wallet calls

## Build & verify

```bash
cd app/webui
npm run build     # tsc && vite build — must pass before deploy
npm run lint      # eslint --fix
npm run dev       # local dev server (:5173)
```

Production build runs inside `app/webui/Dockerfile.prod` during `docker compose build webui`.

After webui deploy, reload gateway so nginx picks up the new container IP:
```bash
docker compose exec gateway nginx -s reload
```

## Do not

- Re-add Metronic demo layouts or Supabase auth — both were removed intentionally.
- Hardcode API URLs — always use `VITE_*` env vars.
- Put business logic in components — keep it in `lib/` clients or small hooks.
- Create new global wallet UI — balances are per-league (`account=league:{id}`).
- Edit `dist/` — it is generated output.