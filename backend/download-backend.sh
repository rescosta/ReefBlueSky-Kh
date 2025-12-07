#!/bin/bash

# ============================================================================
# ReefBlueSky-Kh - Sync da pasta backend
# Uso: ./download-backend.sh
# Vai baixar/sincronizar todos arquivos importantes de backend/ do Git
# ============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

REPO_BASE="https://raw.githubusercontent.com/rescosta/ReefBlueSky-Kh/main/backend"
BACKUP_DIR="backups_backend"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Lista principal de arquivos de backend
FILES_ROOT=(
  "server.js"
  "display-endpoints.js"
  "package.json"
  "package-lock.json"
  ".env.example"
)

echo -e "${BLUE}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║ ReefBlueSky-Kh - Sync completo do backend            ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

mkdir -p "${BACKUP_DIR}/${TIMESTAMP}"

echo -e "${YELLOW}[INFO]${NC} Fazendo backup dos arquivos de raiz em ${BACKUP_DIR}/${TIMESTAMP}"
for f in "${FILES_ROOT[@]}"; do
  if [ -f "$f" ]; then
    cp "$f" "${BACKUP_DIR}/${TIMESTAMP}/$f"
  fi
done

# Backup da pasta public inteira
if [ -d "public" ]; then
  echo -e "${YELLOW}[INFO]${NC} Backup da pasta public/ para ${BACKUP_DIR}/${TIMESTAMP}/public"
  cp -r public "${BACKUP_DIR}/${TIMESTAMP}/public"
fi

echo -e "${GREEN}[✓]${NC} Backup concluído"
echo ""

# Baixar arquivos de raiz do backend
for f in "${FILES_ROOT[@]}"; do
  URL="${REPO_BASE}/${f}"
  DEST="${f}"

  echo -e "${BLUE}[DOWNLOAD]${NC} ${f}"
  echo -e "${BLUE}[URL]${NC} ${URL}"

  if curl -f -o "${DEST}" "${URL}"; then
    echo -e "${GREEN}[✓]${NC} Atualizado: ${DEST}"
  else
    echo -e "${RED}[✗]${NC} Falha ao baixar ${f}, backup em ${BACKUP_DIR}/${TIMESTAMP}/${f}"
  fi

  echo ""
done

# Sincronizar pasta public usando o outro script (se existir)
if [ -f "./download-public.sh" ]; then
  echo -e "${BLUE}[INFO]${NC} Chamando ./download-public.sh para sincronizar public/"
  ./download-public.sh
fi

echo ""
echo -e "${YELLOW}[PRÓXIMOS PASSOS]${NC}"
echo " 1. Conferir diffs: git diff (se tiver repo local)."
echo " 2. Reinstalar dependências se package.json mudou: npm install."
echo " 3. Testar o servidor: node server.js."
echo " 4. Reiniciar PM2: pm2 restart reef."
echo ""
echo -e "${GREEN}[✓]${NC} Sync completo do backend finalizado. Backups em: ${BACKUP_DIR}/${TIMESTAMP}"
