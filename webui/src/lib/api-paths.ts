/** Versioned public API prefixes — must match backend Config.api_prefix() per service. */
export const API = {
  auth: '/v1/core/auth',
  friends: '/v1/core/friends',
  wallet: '/v1/gameplay/wallet',
  contests: '/v1/gameplay/contests',
  leagues: '/v1/gameplay/leagues',
  comments: '/v1/social/comments',
  messaging: '/v1/social/messaging',
  media: '/v1/platform/media',
  ingestor: '/v1/data/ingestor',
} as const;

/**
 * Single same-origin API base for every service client (each appends its own
 * prefix from `API` above). "/api" today — the nginx gateway strips it before
 * proxying. For the ALB, build with VITE_API_URL="" so the browser calls
 * /v1/... directly (the ALB matches /v1/* and can't strip a prefix). Vite
 * inlines this at build time.
 */
export const API_BASE = import.meta.env.VITE_API_URL ?? '/api';