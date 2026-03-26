#!/usr/bin/env bash
# The Attic AI — Remote Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/sjonas50/nomad2.0/main/scripts/install-remote.sh | bash
#
# Downloads the latest release, extracts it, and runs the installer.

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'
BOLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'

info()  { echo -e "${BLUE}[▸]${NC}  $*"; }
ok()    { echo -e "${GREEN}[✓]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[!]${NC}  $*"; }
fail()  { echo -e "${RED}[✗]${NC}  $*"; exit 1; }

REPO="sjonas50/nomad2.0"
INSTALL_DIR="$HOME/.attic-ai"

echo ""
echo -e "${GREEN}${BOLD}══════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}  The Attic AI — Installer${NC}"
echo -e "${GREEN}${BOLD}══════════════════════════════════════════════${NC}"
echo ""

# ---------------------------------------------------------------------------
# Preflight checks
# ---------------------------------------------------------------------------
if [[ "$(uname -s)" != "Darwin" ]]; then
  fail "This installer is for macOS only."
fi

if [[ "$(uname -m)" != "arm64" ]]; then
  warn "This app is optimized for Apple Silicon (arm64). It may not work on Intel Macs."
fi

if ! command -v docker &>/dev/null; then
  fail "Docker Desktop is not installed.
  Download it from: https://www.docker.com/products/docker-desktop/
  Install it, then run this installer again."
fi

if ! command -v curl &>/dev/null; then
  fail "curl is required but not found."
fi

# ---------------------------------------------------------------------------
# Find latest release
# ---------------------------------------------------------------------------
info "Finding latest release..."

LATEST_TAG=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
  | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')

if [ -z "$LATEST_TAG" ]; then
  fail "Could not determine latest release. Check https://github.com/${REPO}/releases"
fi

VERSION="${LATEST_TAG#v}"
ASSET_NAME="attic-ai-v${VERSION}-arm64.zip"
DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${LATEST_TAG}/${ASSET_NAME}"

ok "Latest release: ${LATEST_TAG}"

# ---------------------------------------------------------------------------
# Download and extract
# ---------------------------------------------------------------------------
info "Downloading ${ASSET_NAME}..."

TMPDIR_DL=$(mktemp -d)
trap 'rm -rf "$TMPDIR_DL"' EXIT

curl -fSL --progress-bar -o "${TMPDIR_DL}/${ASSET_NAME}" "$DOWNLOAD_URL"
ok "Download complete"

# Create install directory
mkdir -p "$INSTALL_DIR"

info "Extracting to ${INSTALL_DIR}..."
unzip -qo "${TMPDIR_DL}/${ASSET_NAME}" -d "$TMPDIR_DL"

# The zip contains a directory like attic-ai-vX.Y.Z/
EXTRACTED_DIR=$(find "$TMPDIR_DL" -maxdepth 1 -type d -name "attic-ai-*" | head -1)
if [ -z "$EXTRACTED_DIR" ]; then
  fail "Unexpected archive structure"
fi

# Copy contents to install dir (preserve existing .env if present)
if [ -f "$INSTALL_DIR/.env" ]; then
  cp "$INSTALL_DIR/.env" "${TMPDIR_DL}/.env.backup"
fi

cp -R "$EXTRACTED_DIR"/* "$INSTALL_DIR"/

if [ -f "${TMPDIR_DL}/.env.backup" ]; then
  cp "${TMPDIR_DL}/.env.backup" "$INSTALL_DIR/.env"
fi

chmod +x "$INSTALL_DIR/install.command" "$INSTALL_DIR/uninstall.command"
ok "Extracted to ${INSTALL_DIR}"

# ---------------------------------------------------------------------------
# Run the installer
# ---------------------------------------------------------------------------
info "Starting installation..."
echo ""

cd "$INSTALL_DIR"
bash ./install.command

