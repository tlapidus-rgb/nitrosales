# SKILLS_VM — Skills de Ventas y Marketing para NitroSales

> Carpeta con las skills del Claude VM. Las skills son el conocimiento aplicado — fórmulas, procesos, templates, playbooks — que Claude VM ejecuta cuando Tomy pide algo concreto.
>
> **Separación de rol**: esto es lo opuesto al PKB (`CONOCIMIENTO_PRODUCTO/`). El PKB es la **verdad del producto** (qué es NitroSales, cómo se posiciona). Las skills son el **cómo hacer cosas con esa verdad** (cómo escribir una landing, cómo calificar un lead, cómo armar un QBR).

---

## Cómo está organizado

```
SKILLS_VM/
├── README.md                    ← este archivo
├── _CANON/                      ← contexto compartido que todas las skills leen
│   ├── positioning-canon.md     ← posicionamiento v5 destilado para skills
│   └── brand-voice.md           ← voz destilada para skills
├── skills/                      ← las skills propiamente dichas
│   ├── positioning-canon/       ← cada carpeta es una skill
│   │   ├── SKILL.md             ← frontmatter + instrucciones
│   │   └── references/          ← archivos auxiliares
│   └── ... (N más)
├── scripts/
│   └── sync-skills.sh           ← copia skills/ → ~/.claude/skills/user/
├── docs/
│   ├── SKILLS_A_INSTALAR.md     ← brief de packs externos de skills.sh
│   ├── MAPA_EJECUCION.md        ← checklist de qué se construyó
│   └── GUIA_USO.md              ← cómo usar las skills día a día
```

---

## Cómo se usan las skills

Las skills de Cowork se invocan:

1. **Automáticamente**: si Claude detecta que el request matchea la `description` de una skill, la invoca.
2. **Explícitamente**: Tomy escribe `/positioning-canon` (o el nombre de la skill) en el chat.

Para que Cowork las vea, tienen que vivir en `/sessions/.../.claude/skills/user/`. El script `scripts/sync-skills.sh` hace esa copia desde acá.

---

## Instalación inicial

Una vez en la computadora de Tomy:

```bash
cd /sessions/practical-vibrant-shannon/mnt/nitrosales/SKILLS_VM
bash scripts/sync-skills.sh
```

Eso copia (con overwrite) todas las carpetas de `skills/` a `/sessions/practical-vibrant-shannon/mnt/.claude/skills/user/`. Cowork va a detectarlas en la próxima sesión o al recargar.

**Opcional**: instalar los packs externos curados. Ver `docs/SKILLS_A_INSTALAR.md`.

---

## Filosofía de las skills

1. **Fórmula base**: `skill externa curada × positioning-canon × brand-voice = skill NitroSales potente`.
   - Las skills que construimos 100% propias están en `skills/` (las "Construir" y "Mergear" del mapa).
   - Las skills externas se referencian en `docs/SKILLS_A_INSTALAR.md` con instrucciones de qué pack instalar.

2. **Todo tiene que cargar el canon**: cada skill en su SKILL.md tiene una línea que dice "lee primero `_CANON/positioning-canon.md` y `_CANON/brand-voice.md` antes de generar output". Así ninguna skill produce output sin voz NitroSales.

3. **Profundidad > amplitud**: preferimos 40 skills profundas con templates y ejemplos que 100 skills con una sola instrucción genérica.

4. **El PKB alimenta las skills**: las skills leen del PKB (`/nitrosales/CONOCIMIENTO_PRODUCTO/`) cuando necesitan datos del producto. No duplican el conocimiento.

---

## Estado del mapa (total)

Ver `docs/MAPA_EJECUCION.md` para el estado detallado de cada skill del mapa original.

Resumen:
- **36 skills construidas** (las marcadas como "Construir" y "Mergear" en el mapa).
- **~25 skills externas recomendadas** para instalar desde skills.sh (brief en `docs/SKILLS_A_INSTALAR.md`).
- **3 skills descartadas** (redundantes, absorbidas en otras).
- **2 skills diferidas** hasta decisión de Tomy (pricing-modeler con andamio vacío).

---

## Para Claude VM en futuras sesiones

Al inicio de cada sesión, si Tomy pide algo que matchea una skill:
1. Lee el SKILL.md de la skill relevante.
2. Lee `_CANON/positioning-canon.md` y `_CANON/brand-voice.md`.
3. Si la skill apunta al PKB, carga lo relevante desde `CONOCIMIENTO_PRODUCTO/`.
4. Ejecutá con voz NitroSales siempre.
