#!/usr/bin/env bash
# push-vm.sh — sube los cambios de CLAUDE_VM/ a GitHub en un solo comando.
#
# Uso desde el root del repo:
#   bash CLAUDE_VM/scripts/push-vm.sh                     # commit con mensaje genérico
#   bash CLAUDE_VM/scripts/push-vm.sh "tu mensaje acá"    # commit con mensaje custom
#
# Qué hace (en orden):
#   1. cd al root del repo.
#   2. git pull origin main  (trae commits nuevos del remoto).
#   3. git add CLAUDE_VM/    (agrega SOLO la carpeta VM — no toca archivos de Producto).
#   4. git commit -m "..."   (si no hay cambios, no falla).
#   5. git push origin main  (sube a GitHub).

set -e

# Ubicar el root del repo (el script está en CLAUDE_VM/scripts/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$REPO_ROOT"

MSG="${1:-"Update CLAUDE_VM — $(date +%Y-%m-%d)"}"

echo "📂 Repo: $REPO_ROOT"
echo ""

echo "📥 1/4 — git pull origin main"
git pull origin main
echo ""

echo "📝 2/4 — git status (antes de add):"
git status --short
echo ""

echo "➕ 3/4 — git add CLAUDE_VM/"
git add CLAUDE_VM/
echo ""

echo "💾 3b/4 — git commit"
if git diff --cached --quiet; then
  echo "   (nada nuevo para commitear — seguimos al push igual)"
else
  git commit -m "$MSG"
fi
echo ""

echo "🚀 4/4 — git push origin main"
git push origin main
echo ""

echo "✅ Listo. CLAUDE_VM sincronizado con GitHub."
echo "   En tu otra compu corré: git pull origin main"
