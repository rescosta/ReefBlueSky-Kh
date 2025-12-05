#!/bin/bash

# ============================================================================
# ReefBlueSky-Kh - Script de Download do dashboard.html
# ============================================================================
# Uso: ./download-dashboard.sh
# Este script baixa o dashboard.html mais recente do GitHub
# ============================================================================

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuração
REPO_URL="https://raw.githubusercontent.com/rescosta/ReefBlueSky-Kh/main/backend/dashboard.html"
BRANCH="main"
BACKUP_DIR="backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Criar diretório de backups se não existir
mkdir -p "$BACKUP_DIR"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  ReefBlueSky-Kh - Download de dashboard.html                  ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Verificar se o arquivo dashboard.html existe
if [ -f "dashboard.html" ]; then
  echo -e "${YELLOW}[INFO]${NC} Arquivo dashboard.html atual encontrado"
  echo -e "${YELLOW}[INFO]${NC} Criando backup: ${BACKUP_DIR}/dashboard.html.${TIMESTAMP}.bak"
  cp dashboard.html "${BACKUP_DIR}/dashboard.html.${TIMESTAMP}.bak"
  echo -e "${GREEN}[✓]${NC} Backup criado com sucesso"
  echo ""
else
  echo -e "${YELLOW}[INFO]${NC} Nenhum dashboard.html anterior encontrado (primeira instalação)"
  echo ""
fi

# Download do arquivo
echo -e "${BLUE}[DOWNLOAD]${NC} Baixando dashboard.html do GitHub..."
echo -e "${BLUE}[URL]${NC} ${REPO_URL}"
echo ""

if curl -f -o dashboard.html "$REPO_URL"; then
  echo -e "${GREEN}[✓]${NC} Download concluído com sucesso"
  echo ""
  
  # Verificar integridade básica
  if grep -q "ReefBlueSky KH Monitor" dashboard.html; then
    echo -e "${GREEN}[✓]${NC} Arquivo validado (contém header esperado)"
  else
    echo -e "${RED}[✗]${NC} Erro: Arquivo não parece válido"
    if [ -f "${BACKUP_DIR}/dashboard.html.${TIMESTAMP}.bak" ]; then
      echo -e "${YELLOW}[INFO]${NC} Restaurando backup..."
      cp "${BACKUP_DIR}/dashboard.html.${TIMESTAMP}.bak" dashboard.html
      exit 1
    fi
  fi
  
  echo ""
  echo -e "${BLUE}[INFO]${NC} Informações do arquivo:"
  ls -lh dashboard.html
  echo ""
  wc -l dashboard.html | awk '{print "  Linhas: " $1}'
  echo ""
  
  echo -e "${GREEN}[✓]${NC} Download finalizado! Backups estão em: ${BACKUP_DIR}/"
  
else
  echo -e "${RED}[✗]${NC} Erro ao baixar o arquivo"
  echo -e "${YELLOW}[INFO]${NC} Verifique:"
  echo "  - Conexão com internet"
  echo "  - URL do repositório"
  echo "  - Permissões de acesso"
  echo ""
  if [ -f "${BACKUP_DIR}/dashboard.html.${TIMESTAMP}.bak" ]; then
    echo -e "${YELLOW}[INFO]${NC} Seu arquivo anterior foi preservado em:"
    echo "     ${BACKUP_DIR}/dashboard.html.${TIMESTAMP}.bak"
  fi
  exit 1
fi
