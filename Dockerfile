# syntax=docker/dockerfile:1.7
# ConsolidaHub — API and worker image (same artifact, different command) + migration target.
#
#   docker build --target runtime  -t consolidahub-api .        # API:    node dist/main.js
#                                                                 # Worker: node dist/worker.js
#   docker build --target migrator -t consolidahub-migrator .    # prisma migrate deploy + seed
#
# Reproducibility: the base image is pinned by version; production pipelines should also pin
# it by digest (NODE_IMAGE=node:22.22.0-alpine@sha256:...) and rebuild on security updates.
ARG NODE_IMAGE=node:22.22.0-alpine

# ---------------------------------------------------------------- dependencies + Prisma client
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
ENV CI=true
# Prisma detects the OpenSSL version to pick its query engine; keep detection identical in the
# build (prisma generate) and runtime stages.
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
COPY prisma ./prisma
# Install scripts are disabled; the Prisma client is generated explicitly for this platform.
RUN npm ci --ignore-scripts --no-audit --no-fund && npx prisma generate

# ---------------------------------------------------------------- compile
FROM deps AS build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build:api

# ---------------------------------------------------------------- production dependencies only
FROM ${NODE_IMAGE} AS prod-deps
WORKDIR /app
ENV CI=true
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

# ---------------------------------------------------------------- migrations (one-off job)
FROM build AS migrator
ENV NODE_ENV=production
USER node
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/database/seed.js"]

# ---------------------------------------------------------------- runtime (API / worker)
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    TZ=UTC \
    PORT=3000
WORKDIR /app
RUN apk add --no-cache tini openssl
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 3000
# HTTP liveness for the API. The worker runs the same image with another command and reports its
# health through WORKER_HEARTBEAT_FILE instead (see docker-compose.yml and the Container Apps probes).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/v1/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "--enable-source-maps", "dist/main.js"]
