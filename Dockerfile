# syntax=docker/dockerfile:1

# =============================================================================
# GGRun — production image (multi-stage)
#
#   docker build -t ggrun .
#
# The runner stage keeps the full source tree + full node_modules on purpose:
# `next start` needs node_modules, and the db:* management scripts
# (db:push / db:seed / db:admin) are executed from the entrypoint at container
# start, so drizzle-kit + tsx must also be present at runtime.
# =============================================================================

############### deps — install everything once ###############
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
RUN npm install -g pnpm@9
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

############### builder — compile the Next.js app ###############
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat
RUN npm install -g pnpm@9
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* variables are inlined at build time —
# pass them via `--build-arg` or the compose `build.args`.
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL

RUN pnpm build

############### runner — minimal runtime ###############
FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat
RUN npm install -g pnpm@9
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/ .

COPY docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["./entrypoint.sh"]