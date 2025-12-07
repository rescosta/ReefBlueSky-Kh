#!/bin/bash

# ============================================================================
# ReefBlueSky-Kh - Sync da pasta public (dashboard web)
# Uso: ./download-public.sh
# Vai baixar/sincronizar todos arquivos da pasta public/ do Git
# ============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

REPO_BASE="https://raw.githubusercontent.com/rescosta/ReefBlueSky-Kh/main/backend/public"
BACKUP_DIR="backups_public"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Arquivos que existem hoje na pasta public do backend
FILES=(
  "login.html"
  "dashboard.html"
  "dashboard-main.html"
  "dashboard-config.html"
  "dashboard-graficos.html"
  "dashboard-logs.html"
  "dashboard-sistema.html"
  "dashboard-main.js"
  "dashboard-config.js"
  "dashboard-graficos.js"
  "dashboard-logs.js"
  "dashboard-sistema.js"
  "dashboard-common.js"
)

echo -e "${BLUE}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║ ReefBlueSky-Kh - Sync da pasta public                ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

mkdir -p "$BACKUP_DIR"
mkdir -p "public"

echo -e "${YELLOW}[INFO]${NC} Fazendo backup dos arquivos atuais em ${BACKUP_DIR}/${TIMESTAMP}"
mkdir -p "${BACKUP_DIR}/${TIMESTAMP}"

for f in "${FILES[@]}"; do
  if [ -f "public/$f" ]; then
    cp "public/$f" "${BACKUP_DIR}/${TIMESTAMP}/$f"
  fi
done
echo -e "${GREEN}[✓]${NC} Backup concluído"
echo ""

for f in "${FILES[@]}"; do
  URL="${REPO_BASE}/${f}"
  DEST="public/${f}"

  echo -e "${BLUE}[DOWNLOAD]${NC} ${f}"
  echo -e "${BLUE}[URL]${NC} ${URL}"

  if curl -f -o "${DEST}" "${URL}"; then
    echo -e "${GREEN}[✓]${NC} Atualizado: ${DEST}"
  else
    echo -e "${RED}[✗]${NC} Falha ao baixar ${f}, mantendo backup em ${BACKUP_DIR}/${TIMESTAMP}/${f}"
  fi

  echo ""
done

echo -e "${BLUE}[INFO]${NC} Conteúdo final da pasta public/:"
ls -lh public
echo ""
echo -e "${GREEN}[✓]${NC} Sync da pasta public concluído. Backups em: ${BACKUP_DIR}/${TIMESTAMP}"
