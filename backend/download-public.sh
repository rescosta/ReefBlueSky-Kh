#!/bin/bash
set -e

# ============================================================================
# ReefBlueSky-Kh - Sync da pasta public (HTML + JS + CSS)
# Uso: ./download-public.sh
# ============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

REPO_BASE="https://raw.githubusercontent.com/rescosta/ReefBlueSky-Kh/main/backend/public"
BACKUP_DIR="backups_public"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# HTML na raiz de public (conforme pasta do Git)
FILES_HTML=(
  "login.html"
  "dashboard.html"
  "dashboard-config.html"
  "dashboard-graficos.html"
  "dashboard-logs.html"
  "dashboard-main.html"
  "dashboard-sistema.html"
  "dashboard-dosing.html"
  "dashboard-account.html"

)

# JS dentro de public/js (conforme pasta js do Git)
FILES_JS=(
  "dashboard-main.js"
  "dashboard-config.js"
  "dashboard-graficos.js"
  "dashboard-logs.js"
  "dashboard-sistema.js"
  "dashboard-common.js"
  "dashboard-dosing.js"
  "dashboard-account.js"
)

# JS dentro de public/css (conforme pasta css do Git)
FILES_CSS=(
  "dashboard-base.css"

)

echo -e "${BLUE}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║ ReefBlueSky-Kh - Sync da pasta public                ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

mkdir -p "${BACKUP_DIR}/${TIMESTAMP}"
mkdir -p "public/js"
mkdir -p "public/css"


echo -e "${YELLOW}[INFO]${NC} Fazendo backup atual em ${BACKUP_DIR}/${TIMESTAMP}"

# Backup HTML
for f in "${FILES_HTML[@]}"; do
  if [ -f "public/$f" ]; then
    cp "public/$f" "${BACKUP_DIR}/${TIMESTAMP}/$f"
  fi
done

# Backup JS
if [ -d "public/js" ]; then
  mkdir -p "${BACKUP_DIR}/${TIMESTAMP}/js"
  for f in "${FILES_JS[@]}"; do
    if [ -f "public/js/$f" ]; then
      cp "public/js/$f" "${BACKUP_DIR}/${TIMESTAMP}/js/$f"
    fi
  done
fi


# Backup CSS
if [ -d "public/css" ]; then
  mkdir -p "${BACKUP_DIR}/${TIMESTAMP}/css"
  for f in "${FILES_CSS[@]}"; do
    if [ -f "public/css/$f" ]; then
      cp "public/css/$f" "${BACKUP_DIR}/${TIMESTAMP}/css/$f"
    fi
  done
fi


echo -e "${GREEN}[✓]${NC} Backup concluído"
echo ""

# Baixar HTML
for f in "${FILES_HTML[@]}"; do
  URL="${REPO_BASE}/${f}"
  DEST="public/${f}"

  echo -e "${BLUE}[DOWNLOAD]${NC} ${f}"
  echo -e "${BLUE}[URL]${NC} ${URL}"

  if curl -f -o "${DEST}" "${URL}"; then
    echo -e "${GREEN}[✓]${NC} Atualizado: ${DEST}"
  else
    echo -e "${RED}[✗]${NC} Falha ao baixar ${f}, verifique se existe em ${URL}"
  fi
  echo ""
done

# Baixar JS (subpasta js)
for f in "${FILES_JS[@]}"; do
  URL="${REPO_BASE}/js/${f}"
  DEST="public/js/${f}"

  echo -e "${BLUE}[DOWNLOAD]${NC} js/${f}"
  echo -e "${BLUE}[URL]${NC} ${URL}"

  if curl -f -o "${DEST}" "${URL}"; then
    echo -e "${GREEN}[✓]${NC} Atualizado: ${DEST}"
  else
    echo -e "${RED}[✗]${NC} Falha ao baixar js/${f}, verifique se existe em ${URL}"
  fi
  echo ""
done

# Baixar CSS (subpasta CSS)
for f in "${FILES_CSS[@]}"; do
  URL="${REPO_BASE}/css/${f}"
  DEST="public/css/${f}"

  echo -e "${BLUE}[DOWNLOAD]${NC} css/${f}"
  echo -e "${BLUE}[URL]${NC} ${URL}"

  if curl -f -o "${DEST}" "${URL}"; then
    echo -e "${GREEN}[✓]${NC} Atualizado: ${DEST}"
  else
    echo -e "${RED}[✗]${NC} Falha ao baixar css/${f}, verifique se existe em ${URL}"
  fi
  echo ""
done

echo -e "${BLUE}[INFO]${NC} Conteúdo final de public/:"
ls -Rlh public
echo ""
echo -e "${GREEN}[✓]${NC} Sync da pasta public concluído. Backups em: ${BACKUP_DIR}/${TIMESTAMP}"

