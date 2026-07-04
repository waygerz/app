# Waygerz — Web UI

Frontend for Waygerz, built on the Metronic 9 React starter (React 19, Vite 7,
Tailwind v4, shadcn/ui, react-router v7, @tanstack/react-query, react-hook-form + zod).

> **Auth note:** The Metronic starter's Supabase-based auth has been removed. Waygerz
> authenticates against its own **`auth` service** (phone number + 4-digit PIN + mock OTP,
> JWT bearer tokens). See the root `INF_PLAN.md` for the service architecture.

## Development

```bash
npm install --force   # React 19 peer-dep resolution
npm run dev           # Vite dev server on http://localhost:5173
```

The API base URLs for each backend service are provided via `VITE_*` env vars
(see `app/.env`).

## Build

```bash
npm run build         # tsc + vite build → dist/
npm run preview       # preview the production build
```

Production is served by nginx (`nginx.conf`).
