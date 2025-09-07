FROM node:22-slim AS base
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV COREPACK_HOME="/corepack"
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS build
COPY app/database ./app/database
COPY prisma.config.ts ./
RUN pnpm prisma generate
COPY . .
RUN pnpm run build

FROM base AS runtime
ENV NODE_ENV=production
ENV PORT="8080"
RUN groupadd --gid 1001 unitae && \
    useradd --uid 1001 --gid unitae --shell /bin/sh --create-home unitae
COPY --from=build --chown=unitae:unitae /app .
RUN pnpm prune --prod
USER unitae
EXPOSE 8080
CMD ["pnpm", "start"]

FROM base AS migrate
ENV NODE_ENV=production
RUN groupadd --gid 1001 unitae && \
    useradd --uid 1001 --gid unitae --shell /bin/sh --create-home unitae
COPY --from=build --chown=unitae:unitae /app .
USER unitae
CMD ["pnpm", "prisma", "migrate", "deploy"]
