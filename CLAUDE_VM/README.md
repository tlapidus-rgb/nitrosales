# CLAUDE_VM/ — Carpeta del Claude de Ventas & Marketing

Esta carpeta contiene **todo lo que pertenece al agente Claude de Ventas & Marketing (Claude VM)** de NitroSales.

## ⚠️ Regla para el Claude de Producto

Si sos el Claude de Producto (el que trabaja con el código de la app en `src/`, `prisma/`, etc.):

**No entres acá. No edites, no crees, no borres nada dentro de `CLAUDE_VM/`.**

Esta carpeta es dominio exclusivo del Claude VM. Solo podés leer archivos de acá si necesitás contexto comercial (ej: `CONOCIMIENTO_PRODUCTO/POSICIONAMIENTO_Y_VOZ.md`). Nunca escribir.

Si detectás algo desactualizado o incorrecto en esta carpeta, avisale a Tomy en el chat — él decidirá si se lo pasa al Claude VM.

## Qué hay adentro

```
CLAUDE_VM/
├── README.md                              ← este archivo
├── REGLAS_CLAUDE_VENTAS_MARKETING.md      ← reglas de trabajo del Claude VM
├── HISTORIAL_SESIONES_VENTAS_MARKETING.md ← registro de sesiones VM
├── MAPA_SKILLS_SH_VS_NITROSALES.md        ← mapa de skills externas vs locales
├── CONOCIMIENTO_PRODUCTO/                 ← PKB: posicionamiento, voz, productos, competidores, etc.
│   ├── POSICIONAMIENTO_Y_VOZ.md
│   ├── QUE_ES_CADA_PRODUCTO.md
│   ├── SECCIONES_DEL_PRODUCTO.md
│   ├── ULTIMAS_ACTUALIZACIONES_PRODUCTO.md
│   ├── INTEGRACIONES.md
│   ├── COMPETIDORES.md
│   ├── OBJECIONES_COMUNES.md
│   ├── CASOS_DE_EXITO.md
│   └── PRECIOS.md
└── SKILLS_VM/                             ← 36 skills locales + docs + scripts
    ├── README.md
    ├── _CANON/
    ├── skills/                            ← 36 SKILL.md
    ├── docs/                              ← GUIA_USO, MAPA_EJECUCION, SKILLS_A_INSTALAR
    └── scripts/sync-skills.sh
```

## Separación clara

| Quién | Dónde trabaja | Qué toca |
|---|---|---|
| **Claude de Producto** | root del repo + `src/`, `prisma/`, `scripts/`, etc. | código, migraciones, deploys |
| **Claude VM** | solo `CLAUDE_VM/` | copy, skills, PKB, ventas, marketing |
| **Compartido** | `BACKLOG_PENDIENTES.md` (root) | items con prefijo `VM-` o `PR-` |

## Cómo sincronizar las skills

Desde el root del repo (`/Users/ttt/Documents/GitHub/nitrosales`):

```bash
bash CLAUDE_VM/SKILLS_VM/scripts/sync-skills.sh
```

Esto copia las 36 skills a `~/.claude/skills/user/` para que Cowork las detecte.

## Si sos una sesión nueva de Claude VM

1. Leé primero `REGLAS_CLAUDE_VENTAS_MARKETING.md`.
2. Leé `HISTORIAL_SESIONES_VENTAS_MARKETING.md` para saber qué pasó antes.
3. Si Tomy tiene pendientes específicos, están en `BACKLOG_PENDIENTES.md` (root) con prefijo `VM-`.
4. Antes de trabajar en copy, leé los 9 archivos de `CONOCIMIENTO_PRODUCTO/` en el orden recomendado.

---

_Última actualización: 2026-04-19 — Reestructuración: todo lo VM agrupado adentro de esta carpeta._
