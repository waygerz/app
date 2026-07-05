# docker/Dockerfile — Waygerz webui (Next.js standalone)
# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS deps
WORKDIR /app
ENV CI=1
# .npmrc carries legacy-peer-deps=true — the lock was generated with it, so
# npm ci needs it too or it re-resolves peers and rejects the lock.
COPY package.json package-lock.json* .npmrc* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

FROM node:20-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV CI=1

# NEXT_PUBLIC_* are inlined at build time. Empty default => same-origin /v1
# (browser calls https://waygerz.com/v1/... through the ALB, cookie-friendly).
ARG NEXT_PUBLIC_API_URL=""
ARG NEXT_PUBLIC_WEB_URL="https://waygerz.com"
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_WEB_URL=${NEXT_PUBLIC_WEB_URL}

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN --mount=type=cache,target=/app/.next/cache \
    npm run build

FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

RUN addgroup -S nextjs && adduser -S nextjs -G nextjs

COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static

COPY docker/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
  && chown -R nextjs:nextjs /app /usr/local/bin/docker-entrypoint.sh

USER nextjs
EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
