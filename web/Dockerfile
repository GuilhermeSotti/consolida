# syntax=docker/dockerfile:1.7
# ConsolidaHub web (Next.js standalone). NEXT_PUBLIC_* values are public and baked at build time.
ARG NODE_IMAGE=node:22.22.0-alpine

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM deps AS build
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_ENTRA_TENANT_ID
ARG NEXT_PUBLIC_ENTRA_CLIENT_ID
ARG NEXT_PUBLIC_API_SCOPE
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL} \
    NEXT_PUBLIC_ENTRA_TENANT_ID=${NEXT_PUBLIC_ENTRA_TENANT_ID} \
    NEXT_PUBLIC_ENTRA_CLIENT_ID=${NEXT_PUBLIC_ENTRA_CLIENT_ID} \
    NEXT_PUBLIC_API_SCOPE=${NEXT_PUBLIC_API_SCOPE}
COPY . .
RUN npm run build

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3001 HOSTNAME=0.0.0.0
WORKDIR /app
RUN apk add --no-cache tini
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3001
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
