# syntax=docker/dockerfile:1

# ── Base: Alpine + openssl + tini + pnpm ─────────────────────
FROM node:26-alpine AS base
RUN apk add --no-cache openssl tini
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV COREPACK_HOME="/corepack"
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate
WORKDIR /app

# ── Base-worker: adds poppler-utils for PDF thumbnails ───────
FROM base AS base-worker
RUN apk add --no-cache poppler-utils

# ── Deps: install all dependencies (dev + prod) ─────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# ── Build: generate Prisma client + React Router build ───────
FROM deps AS build
COPY app/database ./app/database
COPY prisma.config.ts ./
RUN pnpm prisma generate
COPY . .
RUN pnpm run build

# ── Prod-deps: prune to production dependencies only ─────────
FROM deps AS prod-deps
RUN pnpm prune --prod

# ── Runtime: web server ──────────────────────────────────────
FROM base AS runtime
LABEL org.opencontainers.image.title="unitae" \
      org.opencontainers.image.description="Unitae web server" \
      org.opencontainers.image.licenses="AGPL-3.0-only"
ENV NODE_ENV=production
ENV UNITAE_WEB_PORT=8080
RUN addgroup -g 1001 -S unitae && \
    adduser -u 1001 -S unitae -G unitae -s /sbin/nologin -H
RUN mkdir -p /app/content/uploads && chown -R 1001:1001 /app/content
COPY --from=build --chown=1001:1001 /app/build ./build
COPY --from=build --chown=1001:1001 /app/public ./public
COPY --from=build --chown=1001:1001 /app/package.json ./
COPY --from=prod-deps --chown=1001:1001 /app/node_modules ./node_modules
USER 1001
EXPOSE 8080
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "PORT=${UNITAE_WEB_PORT:-3000} node_modules/.bin/react-router-serve ./build/server/index.js"]

# ── Worker: background job processor ─────────────────────────
FROM base-worker AS worker
LABEL org.opencontainers.image.title="unitae-worker" \
      org.opencontainers.image.description="Unitae background job processor" \
      org.opencontainers.image.licenses="AGPL-3.0-only"
ENV NODE_ENV=production
RUN addgroup -g 1001 -S unitae && \
    adduser -u 1001 -S unitae -G unitae -s /sbin/nologin -H
COPY --from=build --chown=1001:1001 /app/app ./app
COPY --from=build --chown=1001:1001 /app/package.json ./
COPY --from=build --chown=1001:1001 /app/tsconfig.json ./
COPY --from=build --chown=1001:1001 /app/prisma.config.ts ./
COPY --from=prod-deps --chown=1001:1001 /app/node_modules ./node_modules
USER 1001
EXPOSE 9090
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node_modules/.bin/tsx", "./app/workers/worker.server.ts"]

# ── Migrate: database migration runner (one-shot job) ────────
FROM base AS migrate
LABEL org.opencontainers.image.title="unitae-migrate" \
      org.opencontainers.image.description="Unitae database migration runner" \
      org.opencontainers.image.licenses="AGPL-3.0-only"
ENV NODE_ENV=production
RUN addgroup -g 1001 -S unitae && \
    adduser -u 1001 -S unitae -G unitae -s /sbin/nologin -H
COPY --from=build --chown=1001:1001 /app/app/database/schema.prisma ./app/database/schema.prisma
COPY --from=build --chown=1001:1001 /app/app/database/migrations ./app/database/migrations
COPY --from=build --chown=1001:1001 /app/prisma.config.ts ./
COPY --from=build --chown=1001:1001 /app/package.json ./
COPY --from=deps --chown=1001:1001 /app/node_modules ./node_modules
USER 1001
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node_modules/.bin/prisma", "migrate", "deploy"]
