#!/bin/bash
set -e

# ============================================================================
# ReefBlueSky-Kh - Sync da pasta backend (JS)
# Uso: ./download-server.sh
# ============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

REPO_BASE="https://raw.githubusercontent.com/rescosta/ReefBlueSky-Kh/main/backend"
BACKUP_DIR="backups_backend"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)


# JS dentro de backend (conforme pasta js do Git)
FILES_JS=(
  "alerts-helpers.js"
  "db-pool.js"
  "display-endpoints.js"
  "dosing-device-routes.js"
  "dosing-iot-routes.js"
  "dosing-user-routes.js"
  "server.js"
  "iot-ota.js"
  "user-timezone.js"

)

echo -e "${BLUE}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║ ReefBlueSky-Kh - Sync da pasta backend               ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

mkdir -p "${BACKUP_DIR}/${TIMESTAMP}"

echo -e "${YELLOW}[INFO]${NC} Fazendo backup atual em ${BACKUP_DIR}/${TIMESTAMP}"

# Backup JS
for f in "${FILES_JS[@]}"; do
  if [ -f "backend/$f" ]; then
    cp "backend/$f" "${BACKUP_DIR}/${TIMESTAMP}/$f"
  fi
done

echo -e "${GREEN}[✓]${NC} Backup concluído"
echo ""

# Baixar JS
for f in "${FILES_JS[@]}"; do
  URL="${REPO_BASE}/${f}"
  DEST="backend/${f}"

  echo -e "${BLUE}[DOWNLOAD]${NC} ${f}"
  echo -e "${BLUE}[URL]${NC} ${URL}"

  if curl -f -o "${DEST}" "${URL}"; then
    echo -e "${GREEN}[✓]${NC} Atualizado: ${DEST}"
  else
    echo -e "${RED}[✗]${NC} Falha ao baixar ${f}, verifique se existe em ${URL}"
  fi
  echo ""
done

echo -e "${BLUE}[INFO]${NC} Conteúdo final de backend/:"
ls -Rlh backend
echo ""
echo -e "${GREEN}[✓]${NC} Sync da pasta backend concluído. Backups em: ${BACKUP_DIR}/${TIMESTAMP}"

