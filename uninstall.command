#!/usr/bin/env bash
# The Attic AI — Uninstaller
# Double-click this file on macOS to remove all containers, images, and data.

set -euo pipefail
cd "$(dirname "$0")"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BOLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'

echo ""
echo -e "${RED}${BOLD}══════════════════════════════════════════════${NC}"
echo -e "${RED}${BOLD}  The Attic AI — Uninstaller${NC}"
echo -e "${RED}${BOLD}══════════════════════════════════════════════${NC}"
echo ""
echo -e "  This will ${BOLD}permanently remove${NC}:"
echo -e "    • All Docker containers"
echo -e "    • All Docker images (MySQL, Redis, Ollama, Qdrant, app)"
echo -e "    • All data volumes (database, AI models, documents)"
echo ""
echo -e "  ${YELLOW}This cannot be undone.${NC}"
echo ""
echo -e "  Press ${BOLD}Enter${NC} to continue or ${BOLD}Ctrl+C${NC} to cancel..."
read

if ! docker info &>/dev/null; then
  echo -e "${RED}Docker is not running. Start Docker Desktop first.${NC}"
  echo "Press any key to close..."
  read -n 1 -s
  exit 1
fi

echo ""
echo -e "${YELLOW}[▸]${NC}  Stopping and removing containers..."
if [ -f docker-compose.yml ]; then
  docker compose -f docker-compose.yml --profile full down -v 2>/dev/null || true
fi

echo -e "${YELLOW}[▸]${NC}  Removing Docker images..."
docker rmi attic-admin:latest 2>/dev/null || true
docker rmi attic-sidecar:latest 2>/dev/null || true
docker rmi mysql:8.0 2>/dev/null || true
docker rmi redis:7-alpine 2>/dev/null || true
docker rmi ollama/ollama:latest 2>/dev/null || true
docker rmi qdrant/qdrant:v1.12.1 2>/dev/null || true
docker rmi falkordb/falkordb-server:latest 2>/dev/null || true

echo -e "${YELLOW}[▸]${NC}  Removing orphan volumes..."
for vol in attic_mysql_data attic_redis_data attic_ollama_data attic_qdrant_data attic_falkordb_data attic_app_storage; do
  docker volume rm "$vol" 2>/dev/null || true
done

echo -e "${YELLOW}[▸]${NC}  Pruning unused Docker resources..."
docker system prune -f --volumes 2>/dev/null || true

echo ""
echo -e "${GREEN}${BOLD}Uninstall complete.${NC} All Attic AI data has been removed."
echo ""
echo "Press any key to close this window..."
read -n 1 -s
