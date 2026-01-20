#!/usr/bin/env bash
set -euo pipefail

# Repositório e branch
REPO_URL="https://github.com/rescosta/ReefBlueSky-Kh.git"
REF="main"   # usa sempre o estado atual da main

# Pasta firmware no backend (onde o Node espera)
LOCAL_DIR="$(cd "$(dirname "$0")" && pwd)/firmware"   # ex: backend/firmware

# Clona em diretório temporário
TMP_DIR="$(mktemp -d)"

echo "Clonando $REPO_URL em $TMP_DIR ..."
git clone --depth 1 --branch "$REF" "$REPO_URL" "$TMP_DIR"

SRC_DIR="$TMP_DIR/backend/firmware"

if [ ! -d "$SRC_DIR" ]; then
  echo "Pasta $SRC_DIR não encontrada no repositório."
  rm -rf "$TMP_DIR"
  exit 1
fi

echo "Sincronizando $SRC_DIR -> $LOCAL_DIR"

# Cria destino e copia TODA a árvore (KH, LCD, DOSER, etc.)
mkdir -p "$LOCAL_DIR"
rsync -av --delete "$SRC_DIR"/ "$LOCAL_DIR"/

echo
echo "Conteúdo final de $LOCAL_DIR:"
find "$LOCAL_DIR" -maxdepth 3 -type f -ls

rm -rf "$TMP_DIR"

echo "Sincronização concluída."
