#!/usr/bin/env bash
set -euo pipefail

# Build an offline install bundle for The Attic AI
# Pre-packages Docker images, Ollama models, npm deps, and whisper model
# Usage: ./scripts/build_offline_bundle.sh [--output /path/to/bundle]

OUTPUT_DIR="${1:-/tmp/attic-offline-bundle}"
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   The Attic AI — Offline Bundle Builder      ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# Detect hardware for model selection
TOTAL_RAM_GB=16
if [[ "$(uname -s)" == "Darwin" ]]; then
  TOTAL_RAM_BYTES=$(sysctl -n hw.memsize 2>/dev/null || echo "0")
  TOTAL_RAM_GB=$((TOTAL_RAM_BYTES / 1024 / 1024 / 1024))
else
  TOTAL_RAM_KB=$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}' || echo "0")
  TOTAL_RAM_GB=$((TOTAL_RAM_KB / 1024 / 1024))
fi

echo "RAM: ${TOTAL_RAM_GB} GB"
echo "Output: $OUTPUT_DIR"
echo ""

# Create output structure
mkdir -p "$OUTPUT_DIR/images"
mkdir -p "$OUTPUT_DIR/ollama-models"

# 1. Save Docker images
echo "Saving Docker images..."
IMAGES=(
  "mysql:8.0"
  "redis:7-alpine"
  "ollama/ollama:latest"
  "qdrant/qdrant:v1.13"
)

for img in "${IMAGES[@]}"; do
  SAFE_NAME=$(echo "$img" | tr '/:' '__')
  echo "  → $img"
  docker pull "$img" 2>/dev/null || true
  docker save "$img" -o "$OUTPUT_DIR/images/${SAFE_NAME}.tar"
  echo "  ✓ Saved $SAFE_NAME.tar"
done

# Optional: FalkorDB (for full profile)
echo "  → falkordb/falkordb-server:latest"
docker pull falkordb/falkordb-server:latest 2>/dev/null || true
docker save falkordb/falkordb-server:latest -o "$OUTPUT_DIR/images/falkordb__falkordb-server__latest.tar" 2>/dev/null || echo "  ⚠ FalkorDB save skipped"

echo ""

# 2. Export Ollama models
echo "Exporting Ollama models..."

# Ensure Ollama container is running
if docker exec attic_ollama ollama list >/dev/null 2>&1; then
  # Copy model blobs from Ollama volume
  OLLAMA_VOLUME=$(docker volume inspect ollama_data --format '{{.Mountpoint}}' 2>/dev/null || echo "")
  if [ -n "$OLLAMA_VOLUME" ] && [ -d "$OLLAMA_VOLUME" ]; then
    cp -r "$OLLAMA_VOLUME/." "$OUTPUT_DIR/ollama-models/"
    echo "  ✓ Ollama models exported"
  else
    echo "  ⚠ Cannot access Ollama volume directly, models must be pulled after install"
  fi
else
  echo "  ⚠ Ollama container not running, skipping model export"
fi
echo ""

# 3. Package npm dependencies
echo "Packaging npm dependencies..."
if [ -d "$SCRIPT_DIR/node_modules" ]; then
  cp -r "$SCRIPT_DIR/node_modules" "$OUTPUT_DIR/"
  echo "  ✓ node_modules copied"
else
  echo "  ⚠ node_modules not found, run npm install first"
fi
echo ""

# 4. Copy project source
echo "Copying project source..."
rsync -a --exclude='node_modules' --exclude='.git' --exclude='tmp' \
  --exclude='storage' --exclude='build' \
  "$SCRIPT_DIR/" "$OUTPUT_DIR/source/"
echo "  ✓ Source code copied"
echo ""

# 5. Calculate bundle size
BUNDLE_SIZE=$(du -sh "$OUTPUT_DIR" | awk '{print $1}')
echo "Bundle size: $BUNDLE_SIZE"
echo "Location: $OUTPUT_DIR"
echo ""

# 6. Create single archive (optional)
echo "Creating compressed archive..."
ARCHIVE_PATH="/tmp/attic-offline-$(date +%Y%m%d).tar.gz"
tar -czf "$ARCHIVE_PATH" -C "$(dirname "$OUTPUT_DIR")" "$(basename "$OUTPUT_DIR")"
ARCHIVE_SIZE=$(du -sh "$ARCHIVE_PATH" | awk '{print $1}')
echo "  ✓ Archive: $ARCHIVE_PATH ($ARCHIVE_SIZE)"
echo ""

echo "╔══════════════════════════════════════════════╗"
echo "║        Offline Bundle Ready!                  ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "  To install on a disconnected machine:"
echo "  1. Copy $ARCHIVE_PATH to a USB drive"
echo "  2. Extract: tar -xzf $(basename "$ARCHIVE_PATH")"
echo "  3. Run: ./install.sh --offline $(basename "$OUTPUT_DIR")"
echo ""
