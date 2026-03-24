#!/usr/bin/env bash
set -euo pipefail

# The Attic AI — Installation Script
# Usage: ./install.sh [--dry-run] [--profile <full|graph|zim|tak>] [--offline /path/to/bundle]

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DRY_RUN=false
PROFILE=""
OFFLINE_BUNDLE=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run) DRY_RUN=true; shift ;;
    --profile) PROFILE="$2"; shift 2 ;;
    --offline) OFFLINE_BUNDLE="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

log() { echo "  → $*"; }
ok()  { echo "  ✓ $*"; }
err() { echo "  ✗ $*" >&2; }
warn() { echo "  ⚠ $*"; }

run() {
  if $DRY_RUN; then
    echo "  [dry-run] $*"
  else
    "$@"
  fi
}

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║         The Attic AI — Installer         ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# 1. Hardware detection (macOS-optimized)
echo "Detecting hardware..."
IS_MACOS=false
IS_APPLE_SILICON=false
ARCH=$(uname -m)

if [[ "$(uname -s)" == "Darwin" ]]; then
  IS_MACOS=true
  TOTAL_RAM_BYTES=$(sysctl -n hw.memsize 2>/dev/null || echo "0")
  TOTAL_RAM_GB=$((TOTAL_RAM_BYTES / 1024 / 1024 / 1024))
  CPU_CORES=$(sysctl -n hw.ncpu 2>/dev/null || echo "1")
  if [[ "$ARCH" == "arm64" ]]; then
    IS_APPLE_SILICON=true
    # Detect specific chip
    CHIP_NAME=$(sysctl -n machdep.cpu.brand_string 2>/dev/null || echo "Apple Silicon")
    ok "Apple Silicon detected: $CHIP_NAME"
  fi
else
  TOTAL_RAM_KB=$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}' || echo "0")
  TOTAL_RAM_GB=$((TOTAL_RAM_KB / 1024 / 1024))
  CPU_CORES=$(nproc 2>/dev/null || echo "1")
fi

log "RAM: ${TOTAL_RAM_GB} GB"
log "CPUs: ${CPU_CORES}"
log "Architecture: ${ARCH}"

# Model recommendations based on hardware
RECOMMENDED_MODEL="qwen2.5:1.5b"
WHISPER_MODEL="base.en"
if [ "$TOTAL_RAM_GB" -ge 48 ]; then
  RECOMMENDED_MODEL="qwen2.5:32b"
  WHISPER_MODEL="small.en"
  ok "48GB+ RAM: recommending 32B model + small.en whisper"
elif [ "$TOTAL_RAM_GB" -ge 24 ]; then
  RECOMMENDED_MODEL="qwen2.5:14b"
  WHISPER_MODEL="small.en"
  ok "24GB+ RAM: recommending 14B model + small.en whisper"
elif [ "$TOTAL_RAM_GB" -ge 16 ]; then
  RECOMMENDED_MODEL="qwen2.5:7b"
  WHISPER_MODEL="base.en"
  ok "16GB RAM: recommending 7B model + base.en whisper"
fi

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
echo "Checking prerequisites..."

# macOS: Check for Homebrew
if $IS_MACOS; then
  if command -v brew >/dev/null 2>&1; then
    ok "Homebrew installed"
  else
    warn "Homebrew not found. Install from https://brew.sh"
  fi
fi

command -v docker >/dev/null 2>&1 || { err "Docker not found. Install Docker Desktop."; exit 1; }
ok "Docker installed"

# macOS: Check Docker Desktop specifically
if $IS_MACOS; then
  if pgrep -x "Docker" >/dev/null 2>&1 || docker info >/dev/null 2>&1; then
    ok "Docker Desktop is running"
  else
    warn "Docker Desktop may not be running. Start it first."
  fi
fi

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

# 2b. Offline bundle check
if [ -n "$OFFLINE_BUNDLE" ]; then
  echo "Offline install from: $OFFLINE_BUNDLE"
  if [ ! -d "$OFFLINE_BUNDLE" ]; then
    err "Offline bundle directory not found: $OFFLINE_BUNDLE"
    exit 1
  fi

  # Load Docker images from bundle
  if [ -d "$OFFLINE_BUNDLE/images" ]; then
    log "Loading Docker images..."
    for img in "$OFFLINE_BUNDLE/images"/*.tar; do
      [ -f "$img" ] || continue
      run docker load -i "$img"
      ok "Loaded: $(basename "$img")"
    done
  fi

  # Copy Ollama models from bundle
  if [ -d "$OFFLINE_BUNDLE/ollama-models" ]; then
    log "Copying Ollama models..."
    OLLAMA_VOLUME=$(docker volume inspect ollama_data --format '{{.Mountpoint}}' 2>/dev/null || echo "")
    if [ -n "$OLLAMA_VOLUME" ]; then
      run cp -r "$OFFLINE_BUNDLE/ollama-models/." "$OLLAMA_VOLUME/"
      ok "Ollama models copied"
    else
      warn "Ollama volume not found, models will be pulled after start"
    fi
  fi

  # Copy npm modules from bundle
  if [ -d "$OFFLINE_BUNDLE/node_modules" ]; then
    log "Copying npm modules..."
    run cp -r "$OFFLINE_BUNDLE/node_modules" "$SCRIPT_DIR/"
    ok "node_modules restored from bundle"
  fi

  echo ""
fi

# 3. Environment setup
echo "Setting up environment..."
if [ ! -f "$SCRIPT_DIR/.env" ]; then
  if [ -f "$SCRIPT_DIR/.env.example" ]; then
    run cp "$SCRIPT_DIR/.env.example" "$SCRIPT_DIR/.env"
    # Generate APP_KEY
    APP_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")
    if ! $DRY_RUN; then
      if $IS_MACOS; then
        sed -i '' "s/^APP_KEY=.*/APP_KEY=${APP_KEY}/" "$SCRIPT_DIR/.env"
      else
        sed -i "s/^APP_KEY=.*/APP_KEY=${APP_KEY}/" "$SCRIPT_DIR/.env"
      fi

      # Set node ID
      NODE_ID="attic-$(hostname -s 2>/dev/null || echo 'node')-$(date +%s | tail -c 5)"
      if $IS_MACOS; then
        sed -i '' "s/^NODE_ID=.*/NODE_ID=${NODE_ID}/" "$SCRIPT_DIR/.env"
      else
        sed -i "s/^NODE_ID=.*/NODE_ID=${NODE_ID}/" "$SCRIPT_DIR/.env"
      fi
    fi
    ok "Created .env with generated APP_KEY and NODE_ID"
  else
    err ".env.example not found"
    exit 1
  fi
else
  ok ".env already exists"
fi

# Apple Silicon: set Metal GPU env for Ollama
if $IS_APPLE_SILICON; then
  log "Enabling Metal GPU acceleration for Ollama"
fi
echo ""

# 4. Install dependencies
echo "Installing Node.js dependencies..."
if [ -z "$OFFLINE_BUNDLE" ] || [ ! -d "$SCRIPT_DIR/node_modules" ]; then
  run npm install --legacy-peer-deps --prefix "$SCRIPT_DIR"
fi
ok "Dependencies installed"
echo ""

# 5. Start Docker services
echo "Starting Docker services..."
if [ -n "$PROFILE" ]; then
  run docker compose --project-directory "$SCRIPT_DIR" --profile "$PROFILE" up -d
  ok "Docker services started with profile: $PROFILE"
else
  run docker compose --project-directory "$SCRIPT_DIR" up -d
  ok "Docker services started (core profile)"
fi
echo ""

# 6. Wait for services
echo "Waiting for services to be healthy..."
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
echo "Pulling required AI models..."
if [ -z "$OFFLINE_BUNDLE" ]; then
  run docker exec attic_ollama ollama pull nomic-embed-text
  ok "nomic-embed-text (embedding model)"
  run docker exec attic_ollama ollama pull qwen2.5:1.5b
  ok "qwen2.5:1.5b (classifier model)"

  # Pull recommended model if different from classifier
  if [ "$RECOMMENDED_MODEL" != "qwen2.5:1.5b" ]; then
    log "Pulling recommended generation model: $RECOMMENDED_MODEL"
    run docker exec attic_ollama ollama pull "$RECOMMENDED_MODEL"
    ok "$RECOMMENDED_MODEL (generation model)"
  fi
else
  ok "Models pre-loaded from offline bundle"
fi
echo ""

# 8. Run database migrations
echo "Running database migrations..."
run node ace migration:run --force --cwd "$SCRIPT_DIR"
ok "Migrations complete"
echo ""

# 9. Build frontend
echo "Building frontend assets..."
run node ace build --cwd "$SCRIPT_DIR"
ok "Build complete"
echo ""

# Summary
echo "╔══════════════════════════════════════════╗"
echo "║          Installation Complete!          ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "  Profile:        ${PROFILE:-default}"
echo "  RAM:            ${TOTAL_RAM_GB} GB"
echo "  CPUs:           ${CPU_CORES}"
if $IS_APPLE_SILICON; then
echo "  GPU:            Metal (Apple Silicon)"
fi
echo "  Gen Model:      ${RECOMMENDED_MODEL}"
echo "  Whisper Model:  ${WHISPER_MODEL}"
echo ""
echo "  Start:          node ace serve --hmr     (development)"
echo "                  node bin/server.js       (production)"
echo ""
echo "  Open:           http://localhost:3333"
echo "  Setup:          Create your admin account on first visit"
echo ""
echo "  Sync:           node ace sync:export     (create .attic bundle)"
echo "                  node ace sync:import     (import .attic bundle)"
echo ""
