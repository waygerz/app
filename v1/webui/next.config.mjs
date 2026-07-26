/** @type {import('next').NextConfig} */
// Served at the domain root (no basePath). The Metronic starter hardcoded
// '/metronic/starter-kits/nextjs' for its demo host — that made every route
// (incl. /api/health) 404. Only apply a basePath if explicitly set.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

const nextConfig = {
  basePath,
  assetPrefix: basePath || undefined,

  // Standalone output for Docker/ECS (node server.js).
  output: 'standalone',
};

export default nextConfig;
