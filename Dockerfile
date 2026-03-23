# The Attic AI — Multi-stage Production Dockerfile

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files first for layer caching
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps

# Copy source and build
COPY . .
RUN node ace build

# Stage 2: Production
FROM node:20-alpine AS production

WORKDIR /app

# Install runtime dependencies only
RUN apk add --no-cache \
  curl \
  tini

# Copy built application
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Set production environment
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3333
ENV LOG_LEVEL=info

# Create non-root user
RUN addgroup -g 1001 -S attic && \
    adduser -S attic -u 1001 -G attic && \
    chown -R attic:attic /app

USER attic

EXPOSE 3333

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3333/api/health || exit 1

# Use tini as init process
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "build/bin/server.js"]
