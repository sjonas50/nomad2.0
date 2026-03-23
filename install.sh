#!/usr/bin/env bash
set -euo pipefail

# The Attic AI — Installation Script
# Usage: ./install.sh [--dry-run] [--profile <full|graph|zim>]

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DRY_RUN=false
PROFILE=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run) DRY_RUN=true; shift ;;
    --profile) PROFILE="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

log() { echo "  → $*"; }
ok()  { echo "  ✓ $*"; }
err() { echo "  ✗ $*" >&2; }

run() {
  if $DRY_RUN; then
    echo "  [dry-run] $*"
  else
    eval "$@"
  fi
}

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║         The Attic AI — Installer         ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# 1. Hardware detection
echo "🔍 Detecting hardware..."
TOTAL_RAM_KB=$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}' || sysctl -n hw.memsize 2>/dev/null | awk '{print int($1/1024)}' || echo "0")
TOTAL_RAM_GB=$((TOTAL_RAM_KB / 1024 / 1024))
CPU_CORES=$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo "1")
ARCH=$(uname -m)

log "RAM: ${TOTAL_RAM_GB} GB"
log "CPUs: ${CPU_CORES}"
log "Architecture: ${ARCH}"

# Recommend profile based on RAM
if [ -z "$PROFILE" ]; then
  if [ "$TOTAL_RAM_GB" -ge 16 ]; then
    PROFILE="full"
    ok "Recommended profile: full (16GB+ detected)"
  elif [ "$TOTAL_RAM_GB" -ge 12 ]; then
    PROFILE="graph"
    ok "Recommended profile: graph (12GB+ detected)"
  else
    PROFILE=""
    ok "Recommended profile: default (core services only)"
  fi
fi
echo ""

# 2. Check prerequisites
echo "🔧 Checking prerequisites..."

command -v docker >/dev/null 2>&1 || { err "Docker not found. Install Docker first."; exit 1; }
ok "Docker installed"

command -v node >/dev/null 2>&1 || { err "Node.js not found. Install Node.js 20+."; exit 1; }
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  err "Node.js 20+ required, found v${NODE_VERSION}"
  exit 1
fi
ok "Node.js v$(node -v)"

command -v npm >/dev/null 2>&1 || { err "npm not found."; exit 1; }
ok "npm $(npm -v)"

docker compose version >/dev/null 2>&1 || docker-compose version >/dev/null 2>&1 || { err "Docker Compose not found."; exit 1; }
ok "Docker Compose available"
echo ""

# 3. Environment setup
echo "📋 Setting up environment..."
if [ ! -f "$SCRIPT_DIR/.env" ]; then
  if [ -f "$SCRIPT_DIR/.env.example" ]; then
    run "cp '$SCRIPT_DIR/.env.example' '$SCRIPT_DIR/.env'"
    # Generate APP_KEY
    APP_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")
    if ! $DRY_RUN; then
      sed -i.bak "s/^APP_KEY=.*/APP_KEY=${APP_KEY}/" "$SCRIPT_DIR/.env" && rm -f "$SCRIPT_DIR/.env.bak"
    fi
    ok "Created .env with generated APP_KEY"
  else
    err ".env.example not found"
    exit 1
  fi
else
  ok ".env already exists"
fi
echo ""

# 4. Install dependencies
echo "📦 Installing Node.js dependencies..."
run "cd '$SCRIPT_DIR' && npm install --legacy-peer-deps"
ok "Dependencies installed"
echo ""

# 5. Start Docker services
echo "🐳 Starting Docker services..."
if [ -n "$PROFILE" ]; then
  run "cd '$SCRIPT_DIR' && docker compose --profile $PROFILE up -d"
  ok "Docker services started with profile: $PROFILE"
else
  run "cd '$SCRIPT_DIR' && docker compose up -d"
  ok "Docker services started (core profile)"
fi
echo ""

# 6. Wait for services
echo "⏳ Waiting for services to be healthy..."
if ! $DRY_RUN; then
  RETRIES=30
  until docker exec attic_mysql mysqladmin ping -h localhost --silent 2>/dev/null || [ $RETRIES -eq 0 ]; do
    RETRIES=$((RETRIES - 1))
    sleep 2
  done
  if [ $RETRIES -eq 0 ]; then
    err "MySQL failed to start within 60 seconds"
  else
    ok "MySQL healthy"
  fi

  RETRIES=30
  until curl -sf http://localhost:11434/api/tags >/dev/null 2>&1 || [ $RETRIES -eq 0 ]; do
    RETRIES=$((RETRIES - 1))
    sleep 2
  done
  if [ $RETRIES -eq 0 ]; then
    err "Ollama failed to start within 60 seconds"
  else
    ok "Ollama healthy"
  fi
else
  log "[dry-run] Would wait for MySQL and Ollama health checks"
fi
echo ""

# 7. Pull AI models
echo "🤖 Pulling required AI models..."
run "docker exec attic_ollama ollama pull nomic-embed-text"
ok "nomic-embed-text (embedding model)"
run "docker exec attic_ollama ollama pull qwen2.5:1.5b"
ok "qwen2.5:1.5b (classifier model)"

# Recommend a larger model if RAM allows
if [ "$TOTAL_RAM_GB" -ge 16 ]; then
  log "Tip: You have ${TOTAL_RAM_GB}GB RAM. Consider pulling a larger model:"
  log "  docker exec attic_ollama ollama pull llama3.2:3b"
elif [ "$TOTAL_RAM_GB" -ge 32 ]; then
  log "Tip: You have ${TOTAL_RAM_GB}GB RAM. Consider pulling:"
  log "  docker exec attic_ollama ollama pull llama3.1:8b"
fi
echo ""

# 8. Run database migrations
echo "🗄️  Running database migrations..."
run "cd '$SCRIPT_DIR' && node ace migration:run --force"
ok "Migrations complete"
echo ""

# 9. Build frontend
echo "🏗️  Building frontend assets..."
run "cd '$SCRIPT_DIR' && node ace build"
ok "Build complete"
echo ""

# Summary
echo "╔══════════════════════════════════════════╗"
echo "║          Installation Complete!          ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "  Profile:   ${PROFILE:-default}"
echo "  RAM:       ${TOTAL_RAM_GB} GB"
echo "  CPUs:      ${CPU_CORES}"
echo ""
echo "  Start:     node ace serve --hmr     (development)"
echo "             node bin/server.js       (production)"
echo ""
echo "  Open:      http://localhost:3333"
echo "  Setup:     Create your admin account on first visit"
echo ""
