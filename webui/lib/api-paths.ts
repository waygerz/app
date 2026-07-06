/** Versioned public API prefixes — must match backend Config.api_prefix() per service. */
export const API = {
  auth: '/v1/platform/auth',
  friends: '/v1/social/friends',
  wallet: '/v1/gameplay/wallet',
  contests: '/v1/gameplay/contests',
  leagues: '/v1/gameplay/leagues',
  comments: '/v1/social/comments',
  messaging: '/v1/social/messaging',
  media: '/v1/platform/media',
  ingestor: '/v1/platform/ingestor',
} as const;