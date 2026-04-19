#!/usr/bin/env bash
# sync-skills.sh — copia skills de SKILLS_VM/skills/ a ~/.claude/skills/user/
#
# Uso:
#   bash sync-skills.sh               # sync normal (overwrite)
#   bash sync-skills.sh --dry-run     # muestra qué haría sin hacerlo
#   bash sync-skills.sh --clean       # borra skills user previas antes de copiar
#
# Asumimos que Claude Cowork lee skills desde:
#   /sessions/practical-vibrant-shannon/mnt/.claude/skills/
#
# Las skills del sistema viven en subcarpetas (docx/, pdf/, pptx/, etc.) y
# están en read-only. Las skills custom del user van en subcarpeta 'user/'.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILLS_SRC="$(dirname "$SCRIPT_DIR")/skills"
CANON_SRC="$(dirname "$SCRIPT_DIR")/_CANON"
# Destino: carpeta estándar de skills de Claude (en tu Mac: ~/.claude/skills/user/)
SKILLS_DST="${HOME}/.claude/skills/user"

DRY_RUN=false
CLEAN=false

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --clean) CLEAN=true ;;
    --help|-h)
      head -n 10 "$0" | tail -n 9 | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Argumento desconocido: $arg" >&2
      exit 1
      ;;
  esac
done

echo "🧠 Sync SKILLS_VM"
echo "  Source skills : $SKILLS_SRC"
echo "  Source canon  : $CANON_SRC"
echo "  Destination   : $SKILLS_DST"
echo ""

if [ ! -d "$SKILLS_SRC" ]; then
  echo "❌ No existe $SKILLS_SRC" >&2
  exit 1
fi

# Contar skills
SKILL_COUNT=$(find "$SKILLS_SRC" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')
echo "  Skills a sincronizar: $SKILL_COUNT"
echo ""

if $DRY_RUN; then
  echo "DRY RUN — no se va a copiar nada. Listo:"
  find "$SKILLS_SRC" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sort
  echo ""
  echo "Canon files:"
  find "$CANON_SRC" -type f -name '*.md' -exec basename {} \; | sort
  exit 0
fi

# Asegurar directorio destino
mkdir -p "$SKILLS_DST"

# Modo clean: borrar skills user previas (sin tocar system skills)
if $CLEAN; then
  echo "🗑  Limpiando $SKILLS_DST ..."
  rm -rf "${SKILLS_DST:?}"/*
fi

# Copiar cada skill
COPIED=0
for skill_dir in "$SKILLS_SRC"/*/; do
  skill_name=$(basename "$skill_dir")
  dst="$SKILLS_DST/$skill_name"
  rm -rf "$dst"
  cp -r "$skill_dir" "$dst"
  COPIED=$((COPIED + 1))
  printf "  ✓ %s\n" "$skill_name"
done

# Copiar canon como carpeta sibling (no es skill, pero las skills lo leen)
CANON_DST="$SKILLS_DST/_CANON"
rm -rf "$CANON_DST"
cp -r "$CANON_SRC" "$CANON_DST"
echo "  ✓ _CANON (positioning-canon + brand-voice)"

echo ""
echo "✅ Sincronizadas $COPIED skills + canon"
echo ""
echo "Abrí una nueva sesión de Cowork o recargá la actual para que"
echo "Claude detecte las skills nuevas."
