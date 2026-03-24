#!/usr/bin/env bash
# Build a distributable deployment package for The Attic AI.
# Usage: ./scripts/bundle.sh [--no-models] [--version X.Y.Z]
#
# Produces: dist/attic-ai-vX.Y.Z-arm64.zip
# Prerequisites: Docker Desktop running, all services built/pulled.

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'
info()  { echo -e "${BLUE}[info]${NC}  $*"; }
ok()    { echo -e "${GREEN}[ok]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $*"; }
fail()  { echo -e "${RED}[fail]${NC}  $*"; exit 1; }

# ---------------------------------------------------------------------------
# Arguments
# ---------------------------------------------------------------------------
INCLUDE_MODELS=true
VERSION=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-models)  INCLUDE_MODELS=false; shift ;;
    --version)    VERSION="$2"; shift 2 ;;
    *)            fail "Unknown arg: $1" ;;
  esac
done

cd "$(dirname "$0")/.."
PROJECT_ROOT="$(pwd)"

if [ -z "$VERSION" ]; then
  VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "0.0.0")
fi

DIST_DIR="$PROJECT_ROOT/dist"
STAGING="$DIST_DIR/attic-ai-v${VERSION}-arm64"
BUNDLE_NAME="attic-ai-v${VERSION}-arm64.zip"

info "Bundling The Attic AI v${VERSION} for arm64"

# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------
if ! docker info &>/dev/null; then
  fail "Docker is not running. Start Docker Desktop and try again."
fi

# ---------------------------------------------------------------------------
# 1. Build app image (multi-stage, production)
# ---------------------------------------------------------------------------
info "Building attic-admin image..."
docker build --platform linux/arm64 -t attic-admin:latest -t "attic-admin:v${VERSION}" . --quiet
ok "attic-admin image built"

# Build sidecar if it exists
if [ -f sidecar/Dockerfile ]; then
  info "Building attic-sidecar image..."
  docker build --platform linux/arm64 -t attic-sidecar:latest -t "attic-sidecar:v${VERSION}" ./sidecar --quiet
  ok "attic-sidecar image built"
fi

# ---------------------------------------------------------------------------
# 2. Pull dependency images
# ---------------------------------------------------------------------------
IMAGES=(
  "mysql:8.0"
  "redis:7-alpine"
  "ollama/ollama:latest"
  "qdrant/qdrant:v1.12.1"
)

for img in "${IMAGES[@]}"; do
  info "Pulling $img..."
  docker pull --platform linux/arm64 "$img" --quiet
done
ok "All dependency images pulled"

# ---------------------------------------------------------------------------
# 3. Save all images to tarball
# ---------------------------------------------------------------------------
rm -rf "$STAGING"
mkdir -p "$STAGING/images"

ALL_IMAGES=(
  "attic-admin:latest"
  "${IMAGES[@]}"
)
if [ -f sidecar/Dockerfile ]; then
  ALL_IMAGES+=("attic-sidecar:latest")
fi

info "Saving Docker images (this takes a few minutes)..."
docker save "${ALL_IMAGES[@]}" | gzip > "$STAGING/images/attic-images.tar.gz"
IMAGE_SIZE=$(du -sh "$STAGING/images/attic-images.tar.gz" | cut -f1)
ok "Images saved ($IMAGE_SIZE)"

# ---------------------------------------------------------------------------
# 4. Export Ollama models (from running volume)
# ---------------------------------------------------------------------------
if $INCLUDE_MODELS; then
  if docker volume inspect ollama_data &>/dev/null || \
     docker volume inspect "${PROJECT_ROOT##*/}_ollama_data" &>/dev/null; then
    VOL_NAME="ollama_data"
    docker volume inspect ollama_data &>/dev/null || VOL_NAME="${PROJECT_ROOT##*/}_ollama_data"

    info "Exporting Ollama models from volume '${VOL_NAME}'..."
    mkdir -p "$STAGING/models"
    docker run --rm \
      -v "${VOL_NAME}:/data:ro" \
      -v "$STAGING/models:/backup" \
      alpine tar czf /backup/ollama-models.tar.gz -C /data .
    MODEL_SIZE=$(du -sh "$STAGING/models/ollama-models.tar.gz" | cut -f1)
    ok "Models exported ($MODEL_SIZE)"
  else
    warn "No ollama_data volume found — skipping model export"
    warn "Users will need to download models on first run"
  fi
fi

# ---------------------------------------------------------------------------
# 5. Copy distribution files
# ---------------------------------------------------------------------------
info "Assembling distribution package..."

cp "$PROJECT_ROOT/docker-compose.prod.yml" "$STAGING/docker-compose.yml"

# Create Docker-ready .env
cat > "$STAGING/.env.example" << 'ENVEOF'
# The Attic AI — Environment Configuration
# Copy this to .env and adjust as needed. The install script does this automatically.

TZ=UTC
PORT=3333
HOST=0.0.0.0
LOG_LEVEL=info
APP_KEY=__GENERATED_ON_INSTALL__
NODE_ENV=production
SESSION_DRIVER=cookie

# Database (Docker service names — do not change unless customizing)
DB_HOST=mysql
DB_PORT=3306
DB_USER=attic
DB_PASSWORD=attic_password
DB_DATABASE=attic
DB_ROOT_PASSWORD=attic_root

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=

# Queue
QUEUE_REDIS_HOST=redis
QUEUE_REDIS_PORT=6379
QUEUE_REDIS_PASSWORD=

# Ollama
OLLAMA_HOST=http://ollama:11434

# Qdrant
QDRANT_HOST=http://qdrant:6333
QDRANT_API_KEY=
QDRANT_COLLECTION=attic_knowledge_base

# FalkorDB (requires --profile full)
FALKORDB_ENABLED=false
FALKORDB_HOST=falkordb
FALKORDB_PORT=6379

# Python sidecar (requires --profile full)
SIDECAR_URL=http://sidecar:8100

# Sync
NODE_ID=attic-node-1
BUNDLE_DIR=/app/storage/bundles
ENVEOF

# Copy install/uninstall scripts
cp "$PROJECT_ROOT/install.command" "$STAGING/install.command"
cp "$PROJECT_ROOT/uninstall.command" "$STAGING/uninstall.command"
chmod +x "$STAGING/install.command" "$STAGING/uninstall.command"

# Create README
cat > "$STAGING/README.txt" << 'README'
The Attic AI — Offline Knowledge Platform
==========================================

REQUIREMENTS:
  - macOS (Apple Silicon)
  - Docker Desktop (https://docker.com/products/docker-desktop)

INSTALL:
  1. Install Docker Desktop if you don't have it
  2. Start Docker Desktop and wait for it to be ready
  3. Double-click install.command

  The installer loads all Docker images, sets up the database,
  and starts all services. When complete, open:

    http://localhost:3333

UNINSTALL:
  Double-click uninstall.command to remove all containers,
  images, and data volumes.

NOTES:
  - First run takes 2-5 minutes depending on your hardware
  - The app uses ~4GB of RAM with default settings
  - Downloaded maps and documents are stored in Docker volumes
  - All AI inference runs locally via Ollama — nothing leaves your machine
README

ok "Distribution files assembled"

# ---------------------------------------------------------------------------
# 6. Create zip
# ---------------------------------------------------------------------------
info "Creating zip archive..."
cd "$DIST_DIR"
# Use -X to preserve Unix permissions (executable .command files)
zip -qr -X "$BUNDLE_NAME" "attic-ai-v${VERSION}-arm64/"
TOTAL_SIZE=$(du -sh "$BUNDLE_NAME" | cut -f1)
SHA=$(shasum -a 256 "$BUNDLE_NAME" | cut -d' ' -f1)

# Cleanup staging
rm -rf "$STAGING"

echo ""
echo -e "${GREEN}${BOLD}Bundle complete!${NC}"
echo -e "  File:     ${BOLD}dist/${BUNDLE_NAME}${NC}"
echo -e "  Size:     ${TOTAL_SIZE}"
echo -e "  SHA-256:  ${SHA}"
echo ""
echo -e "To test: unzip dist/${BUNDLE_NAME} && cd attic-ai-v${VERSION}-arm64 && ./install.command"
