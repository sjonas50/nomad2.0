#!/usr/bin/env bash
# Create a GitHub Release with the install bundle.
# Usage: ./scripts/release.sh v1.0.0
#
# Prerequisites:
#   - GitHub CLI (gh) installed and authenticated
#   - Docker Desktop running
#   - All services built

set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <version-tag>"
  echo "Example: $0 v1.0.0"
  exit 1
fi

TAG="$1"
VERSION="${TAG#v}"

cd "$(dirname "$0")/.."

# Verify gh is authenticated
if ! gh auth status &>/dev/null; then
  echo "Not authenticated. Run: gh auth login"
  exit 1
fi

# Build the bundle (without models — too large for GitHub releases)
echo "Building bundle..."
./scripts/bundle.sh --no-models --version "$VERSION"

BUNDLE="dist/attic-ai-v${VERSION}-arm64.zip"
if [ ! -f "$BUNDLE" ]; then
  echo "Bundle not found: $BUNDLE"
  exit 1
fi

SHA=$(shasum -a 256 "$BUNDLE" | cut -d' ' -f1)
SIZE=$(du -sh "$BUNDLE" | cut -f1)

echo ""
echo "Bundle: $BUNDLE ($SIZE)"
echo "SHA-256: $SHA"
echo ""

# Create tag if it doesn't exist
if ! git rev-parse "$TAG" &>/dev/null; then
  echo "Creating tag $TAG..."
  git tag -a "$TAG" -m "Release $TAG"
  git push origin "$TAG"
fi

# Create the release
echo "Creating GitHub release..."
gh release create "$TAG" "$BUNDLE" \
  --title "The Attic AI $TAG" \
  --draft \
  --notes "$(cat <<EOF
## Installation

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) if you don't have it
2. Download \`attic-ai-v${VERSION}-arm64.zip\` below
3. Unzip and double-click \`install.command\`
4. Open http://localhost:3333

**Requirements:** macOS (Apple Silicon), Docker Desktop

> AI models (~1-5GB) are downloaded automatically on first run.
> First install takes 5-10 minutes depending on your internet speed.

**SHA-256:** \`$SHA\`
EOF
)"

echo ""
echo "Draft release created! Review and publish at:"
gh release view "$TAG" --json url -q .url
