#!/bin/bash
set -e

# ============================================================================
# ReefBlueSky-Kh - Sync dos arquivos .js do backend (raiz apenas)
# Uso: ./download-backend.sh
# ============================================================================
# IMPORTANTE: Este script atualiza APENAS arquivos .js na RAIZ do backend
# NÃO mexe em subpastas (node_modules, firmware, public, uploads, logs, etc)
# ============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

REPO_BASE="https://raw.githubusercontent.com/rescosta/ReefBlueSky-Kh/main/backend"
BACKUP_DIR="backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Lista de arquivos .js na RAIZ do backend (adicione novos conforme necessário)
FILES_JS=(
  "server.js"
  # Adicione outros arquivos .js da raiz aqui se existirem
  # "config.js"
  # "utils.js"
)

echo -e "${BLUE}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║ ReefBlueSky-Kh - Sync de arquivos .js do backend    ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}[AVISO]${NC} Este script atualiza APENAS arquivos .js na raiz"
echo -e "${YELLOW}[AVISO]${NC} Subpastas (node_modules, firmware, public) NÃO são tocadas"
echo ""

# Criar diretório de backups
mkdir -p "${BACKUP_DIR}/${TIMESTAMP}"

echo -e "${YELLOW}[INFO]${NC} Fazendo backup em ${BACKUP_DIR}/${TIMESTAMP}"

# Backup dos arquivos .js existentes
for f in "${FILES_JS[@]}"; do
  if [ -f "$f" ]; then
    cp "$f" "${BACKUP_DIR}/${TIMESTAMP}/$f"
    echo -e "${GREEN}[✓]${NC} Backup: $f"
  else
    echo -e "${YELLOW}[INFO]${NC} Arquivo $f não existe (será criado se existir no Git)"
  fi
done

echo ""
echo -e "${GREEN}[✓]${NC} Backup concluído"
echo ""

# Baixar arquivos .js da raiz
for f in "${FILES_JS[@]}"; do
  URL="${REPO_BASE}/${f}"
  DEST="${f}"

  echo -e "${BLUE}[DOWNLOAD]${NC} ${f}"
  echo -e "${BLUE}[URL]${NC} ${URL}"

  if curl -f -o "${DEST}" "${URL}"; then
    echo -e "${GREEN}[✓]${NC} Atualizado: ${DEST}"

    # Validação básica para server.js
    if [ "$f" = "server.js" ]; then
      if grep -q "ReefBlueSky" "${DEST}"; then
        echo -e "${GREEN}[✓]${NC} Arquivo validado"
      else
        echo -e "${RED}[✗]${NC} Arquivo não parece válido, restaurando backup"
        cp "${BACKUP_DIR}/${TIMESTAMP}/$f" "$f"
      fi
    fi
  else
    echo -e "${RED}[✗]${NC} Falha ao baixar ${f}"
    if [ -f "${BACKUP_DIR}/${TIMESTAMP}/$f" ]; then
      echo -e "${YELLOW}[INFO]${NC} Mantendo versão anterior"
    fi
  fi
  echo ""
done

echo -e "${BLUE}[INFO]${NC} Arquivos .js na raiz do backend:"
ls -lh *.js 2>/dev/null || echo "  Nenhum arquivo .js encontrado"
echo ""

echo -e "${YELLOW}[PRÓXIMOS PASSOS]${NC}"
echo "  1. Verificar alterações:"
echo "     git diff server.js"
echo ""
echo "  2. Reinstalar dependências (se houver novas):"
echo "     npm install"
echo ""
echo "  3. Reiniciar servidor:"
echo "     pm2 restart server"
echo ""
echo -e "${GREEN}[✓]${NC} Sync concluído! Backups em: ${BACKUP_DIR}/${TIMESTAMP}"
