#!/usr/bin/env bash
# The Attic AI — Installer
# Double-click this file on macOS to install and start all services.
# Prerequisite: Docker Desktop installed.

set -euo pipefail

# cd to the directory containing this script (macOS opens .command in $HOME)
cd "$(dirname "$0")"

# ---------------------------------------------------------------------------
# Colors and helpers
# ---------------------------------------------------------------------------
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'
BOLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'

info()    { echo -e "${BLUE}[▸]${NC}  $*"; }
ok()      { echo -e "${GREEN}[✓]${NC}  $*"; }
warn()    { echo -e "${YELLOW}[!]${NC}  $*"; }
fail()    { echo -e "${RED}[✗]${NC}  $*"; exit 1; }
section() { echo ""; echo -e "${BOLD}$*${NC}"; echo -e "${DIM}$(printf '%.0s─' {1..50})${NC}"; }

# Remove macOS quarantine bit (file downloaded from internet)
xattr -rd com.apple.quarantine . 2>/dev/null || true

# ---------------------------------------------------------------------------
# 1. Check Docker Desktop
# ---------------------------------------------------------------------------
section "Checking prerequisites"

if ! command -v docker &>/dev/null; then
  echo ""
  fail "Docker Desktop is not installed.
  Download it from: https://www.docker.com/products/docker-desktop/
  Install it, then run this installer again."
fi

if ! docker info &>/dev/null; then
  info "Docker Desktop is not running. Attempting to start it..."
  open -a Docker 2>/dev/null || true

  WAITED=0
  while ! docker info &>/dev/null; do
    sleep 2
    WAITED=$((WAITED + 2))
    if [ "$WAITED" -ge 90 ]; then
      fail "Docker Desktop did not start after 90 seconds.
  Please start it manually and run this installer again."
    fi
    printf "\r${DIM}  Waiting for Docker... (%ds)${NC}  " "$WAITED"
  done
  echo ""
fi
ok "Docker Desktop is running"

# Check Docker Compose
if ! docker compose version &>/dev/null; then
  fail "Docker Compose not found. Update Docker Desktop to the latest version."
fi
ok "Docker Compose available"

# ---------------------------------------------------------------------------
# 2. Load Docker images
# ---------------------------------------------------------------------------
section "Loading Docker images"

if [ -f images/attic-images.tar.gz ]; then
  info "Loading images from bundle (this takes a few minutes)..."
  gunzip -c images/attic-images.tar.gz | docker load
  ok "Docker images loaded"
else
  info "No bundled images found — pulling from registry (requires internet)..."
  docker compose -f docker-compose.yml pull
  ok "Docker images pulled"
fi

# ---------------------------------------------------------------------------
# 3. Import Ollama models
# ---------------------------------------------------------------------------
section "Setting up AI models"

if [ -f models/ollama-models.tar.gz ]; then
  info "Importing pre-bundled AI models..."
  docker volume create attic_ollama_data 2>/dev/null || true
  docker run --rm \
    -v attic_ollama_data:/data \
    -v "$(pwd)/models":/backup \
    alpine sh -c "cd /data && tar xzf /backup/ollama-models.tar.gz"
  ok "AI models imported"
else
  warn "No pre-bundled models found. Models will be downloaded on first run."
fi

# ---------------------------------------------------------------------------
# 4. Generate .env
# ---------------------------------------------------------------------------
section "Configuring environment"

if [ ! -f .env ]; then
  cp .env.example .env

  # Generate APP_KEY without Node.js
  APP_KEY=$(openssl rand -base64 32)
  if [[ "$(uname -s)" == "Darwin" ]]; then
    sed -i '' "s|^APP_KEY=.*|APP_KEY=${APP_KEY}|" .env
  else
    sed -i "s|^APP_KEY=.*|APP_KEY=${APP_KEY}|" .env
  fi
  ok "Environment configured with generated APP_KEY"
else
  ok "Existing .env found — keeping current configuration"
fi

# ---------------------------------------------------------------------------
# 5. Start services
# ---------------------------------------------------------------------------
section "Starting services"

info "Starting Docker Compose services..."
docker compose -f docker-compose.yml up -d

# Wait for services to be healthy
wait_healthy() {
  local container="$1"
  local timeout="${2:-120}"
  local waited=0

  while [ "$waited" -lt "$timeout" ]; do
    STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "missing")
    case "$STATUS" in
      healthy)  return 0 ;;
      unhealthy) return 1 ;;
    esac
    sleep 3
    waited=$((waited + 3))
    printf "\r${DIM}  Waiting for %s... (%ds)${NC}  " "$container" "$waited"
  done
  return 1
}

for svc in attic_mysql attic_redis attic_ollama attic_qdrant; do
  if wait_healthy "$svc" 120; then
    echo ""
    ok "$svc is healthy"
  else
    echo ""
    warn "$svc did not become healthy in time (may still be starting)"
  fi
done

# Wait for the app container specifically
info "Waiting for The Attic AI to start..."
if wait_healthy "attic_admin" 120; then
  echo ""
  ok "The Attic AI is running"
else
  echo ""
  warn "App container is still starting. Proceeding with setup..."
fi

# ---------------------------------------------------------------------------
# 6. Run database migrations and seeds
# ---------------------------------------------------------------------------
section "Setting up database"

info "Running database migrations..."
docker exec attic_admin node ace migration:run --force 2>&1 || {
  warn "Migration failed — the app may already be set up"
}

info "Seeding default data..."
docker exec attic_admin node ace db:seed 2>&1 || {
  warn "Seed failed — defaults may already exist"
}
ok "Database ready"

# ---------------------------------------------------------------------------
# 7. Ensure Ollama models are available
# ---------------------------------------------------------------------------
section "Checking AI models"

pull_model_if_missing() {
  local model="$1"
  if docker exec attic_ollama ollama list 2>/dev/null | grep -q "$model"; then
    ok "$model already available"
  else
    info "Downloading $model (this may take a few minutes)..."
    docker exec attic_ollama ollama pull "$model"
    ok "$model downloaded"
  fi
}

pull_model_if_missing "nomic-embed-text"

# Detect hardware and pull appropriate chat model
TOTAL_RAM_GB=8
if [[ "$(uname -s)" == "Darwin" ]]; then
  TOTAL_RAM_BYTES=$(sysctl -n hw.memsize 2>/dev/null || echo "8589934592")
  TOTAL_RAM_GB=$((TOTAL_RAM_BYTES / 1024 / 1024 / 1024))
fi

if [ "$TOTAL_RAM_GB" -ge 48 ]; then
  CHAT_MODEL="qwen2.5:32b"
elif [ "$TOTAL_RAM_GB" -ge 24 ]; then
  CHAT_MODEL="qwen2.5:14b"
elif [ "$TOTAL_RAM_GB" -ge 16 ]; then
  CHAT_MODEL="qwen2.5:7b"
else
  CHAT_MODEL="qwen2.5:1.5b"
fi

info "Detected ${TOTAL_RAM_GB}GB RAM — recommended chat model: $CHAT_MODEL"
pull_model_if_missing "$CHAT_MODEL"

# ---------------------------------------------------------------------------
# 8. Final health check
# ---------------------------------------------------------------------------
section "Verifying installation"

sleep 2
if curl -sf http://localhost:3333/health &>/dev/null; then
  ok "Health check passed"
else
  warn "Health check failed — the app may need a moment to fully start"
fi

# ---------------------------------------------------------------------------
# Done!
# ---------------------------------------------------------------------------
echo ""
echo -e "${GREEN}${BOLD}══════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}  The Attic AI is ready!${NC}"
echo -e "${GREEN}${BOLD}══════════════════════════════════════════════${NC}"
echo ""
echo -e "  Open in your browser:  ${BOLD}http://localhost:3333${NC}"
echo ""
echo -e "  ${DIM}Chat model:    $CHAT_MODEL${NC}"
echo -e "  ${DIM}RAM detected:  ${TOTAL_RAM_GB}GB${NC}"
echo -e "  ${DIM}Stop services: docker compose -f docker-compose.yml down${NC}"
echo ""
echo -e "  ${DIM}Optional services (enable in Admin > Services):${NC}"
echo -e "  ${DIM}  FalkorDB:    docker compose -f docker-compose.yml --profile graph up -d falkordb${NC}"
echo -e "  ${DIM}  Sidecar:     docker compose -f docker-compose.yml --profile zim up -d sidecar${NC}"
echo -e "  ${DIM}  TAK Server:  docker compose -f docker-compose.yml --profile tak up -d opentakserver${NC}"
echo ""
echo -e "  Press any key to close this window..."
read -n 1 -s
