# docker/Dockerfile — Waygerz webui (Next.js standalone)
# syntax=docker/dockerfile:1.7
# Debian (glibc) base, NOT Alpine/musl: Tailwind v4's lightningcss native
# binary installs reliably on glibc (linux-arm64-gnu); the musl variant is
# flaky to install under npm.

FROM node:20-slim AS deps
WORKDIR /app
ENV CI=1
# Deliberately NO package-lock.json here: the committed lock is generated on
# Windows and omits the linux native binaries (e.g. lightningcss for Tailwind
# v4), so `npm ci` can't fetch them. Copying only package.json makes
# `npm install` resolve fresh for the build target (arm64/glibc) and pull the
# right native binaries. (.npmrc keeps legacy-peer-deps in sync with local.)
COPY package.json .npmrc* ./
RUN --mount=type=cache,target=/root/.npm \
    npm install --no-audit --no-fund

FROM node:20-slim AS build
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

FROM node:20-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

RUN groupadd -r nextjs && useradd -r -g nextjs nextjs

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
