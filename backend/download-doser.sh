#!/bin/bash

# ============================================================================
# ReefBlueSky-Kh - Script de Download do dosing-api-routes.js
# ============================================================================
# Uso: ./download-doser.sh
# Este script baixa o dosing-api-routes.js mais recente do GitHub
# ============================================================================

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuração
REPO_URL="https://raw.githubusercontent.com/rescosta/ReefBlueSky-Kh/main/backend/dosing-api-routes.js"
BRANCH="main"
BACKUP_DIR="backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Criar diretório de backups se não existir
mkdir -p "$BACKUP_DIR"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  ReefBlueSky-Kh - Download de dosing-api-routes.js         ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Verificar se o arquivo dosing-api-routes.js existe
if [ -f "dosing-api-routes.js" ]; then
  echo -e "${YELLOW}[INFO]${NC} Arquivo dosing-api-routes.js atual encontrado"
  echo -e "${YELLOW}[INFO]${NC} Criando backup: ${BACKUP_DIR}/dosing-api-routes.js.${TIMESTAMP}.bak"
  cp dosing-api-routes.js "${BACKUP_DIR}/dosing-api-routes.js.${TIMESTAMP}.bak"
  echo -e "${GREEN}[✓]${NC} Backup criado com sucesso"
  echo ""
else
  echo -e "${YELLOW}[INFO]${NC} Nenhum dosing-api-routes.js anterior encontrado (primeira instalação)"
  echo ""
fi

# Download do arquivo
echo -e "${BLUE}[DOWNLOAD]${NC} Baixando dosing-api-routes.js do GitHub..."
echo -e "${BLUE}[URL]${NC} ${REPO_URL}"
echo ""

if curl -f -o dosing-api-routes.js "$REPO_URL"; then
  echo -e "${GREEN}[✓]${NC} Download concluído com sucesso"
  echo ""
  
  # Verificar integridade básica
  if grep -q "ReefBlueSky KH Monitor" dosing-api-routes.js; then
    echo -e "${GREEN}[✓]${NC} Arquivo validado (contém header esperado)"
  else
    echo -e "${RED}[✗]${NC} Erro: Arquivo não parece válido"
    if [ -f "${BACKUP_DIR}/dosing-api-routes.js.${TIMESTAMP}.bak" ]; then
      echo -e "${YELLOW}[INFO]${NC} Restaurando backup..."
      cp "${BACKUP_DIR}/dosing-api-routes.js.${TIMESTAMP}.bak" dosing-api-routes.js
      exit 1
    fi
  fi
  
  echo ""
  echo -e "${BLUE}[INFO]${NC} Informações do arquivo:"
  ls -lh dosing-api-routes.js
  echo ""
  wc -l dosing-api-routes.js | awk '{print "  Linhas: " $1}'
  echo ""
  
  echo -e "${YELLOW}[PRÓXIMOS PASSOS]${NC}"
  echo "  1. Revise o arquivo se necessário:"
  echo "     cat dosing-api-routes.js"
  echo ""
  echo "  2. Reinstale dependências (se houver novas):"
  echo "     npm install"
  echo ""
  echo "  3. Teste o servidor:"
  echo "     node dosing-api-routes.js"
  echo ""
  echo "  4. Se tudo OK, reinicie com PM2:"
  echo "     pm2 restart reef"
  echo ""
  echo -e "${GREEN}[✓]${NC} Download finalizado! Backups estão em: ${BACKUP_DIR}/"
  
else
  echo -e "${RED}[✗]${NC} Erro ao baixar o arquivo"
  echo -e "${YELLOW}[INFO]${NC} Verifique:"
  echo "  - Conexão com internet"
  echo "  - URL do repositório"
  echo "  - Permissões de acesso"
  echo ""
  if [ -f "${BACKUP_DIR}/dosing-api-routes.js.${TIMESTAMP}.bak" ]; then
    echo -e "${YELLOW}[INFO]${NC} Seu arquivo anterior foi preservado em:"
    echo "     ${BACKUP_DIR}/dosing-api-routes.js.${TIMESTAMP}.bak"
  fi
  exit 1
fi