# The Attic AI — Multi-stage Production Dockerfile

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files first for layer caching
COPY package.json package-lock.json* ./
RUN npm ci --legacy-peer-deps

# Copy source and build
COPY . .
RUN node ace build

# Install production-only deps inside build output
WORKDIR /app/build
RUN cp /app/package-lock.json . 2>/dev/null || true && \
    npm ci --omit=dev --legacy-peer-deps

# Stage 2: Production (slim — no devDeps, no source)
FROM node:20-alpine AS production

WORKDIR /app

# Install runtime dependencies only
RUN apk add --no-cache curl tini

# Copy only the built application (includes its own node_modules)
COPY --from=builder /app/build .

# Set production environment
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3333
ENV LOG_LEVEL=info

# Create non-root user
RUN addgroup -g 1001 -S attic && \
    adduser -S attic -u 1001 -G attic && \
    mkdir -p /app/storage/maps /app/storage/zim /app/storage/docs /app/.tools && \
    chown -R attic:attic /app

USER attic

EXPOSE 3333

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3333/health || exit 1

# Use tini as init process
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "bin/server.js"]
