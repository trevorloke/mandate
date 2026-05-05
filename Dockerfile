# Multi-stage Dockerfile for Mandate.
#
# Stage 1 builds the frontend (Vite). Stage 2 installs only production
# server deps and copies in the built dist + server source. The DB lives
# at /data/mandate.db inside the container — mount a volume there.

# ── Stage 1: build the frontend ─────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
# Install ALL deps for the build (vite/react needed)
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Skip the local DB during build context if present
RUN rm -f mandate.db mandate.db-shm mandate.db-wal
RUN npm run build

# ── Stage 2: runtime ────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV MANDATE_HOST=0.0.0.0
ENV MANDATE_DB=/data/mandate.db
ENV MANDATE_SERVE_STATIC=1

# better-sqlite3 needs a C toolchain at install time. Re-install with --omit=dev.
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
 && true
COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
 && apk del .build-deps

# Copy built frontend + server source
COPY --from=build /app/dist ./dist
COPY server ./server

# Persistent volume for SQLite
VOLUME ["/data"]
RUN mkdir -p /data && chown -R node:node /data
USER node

EXPOSE 3000

# Healthcheck pings /api/health
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server/index.js"]
