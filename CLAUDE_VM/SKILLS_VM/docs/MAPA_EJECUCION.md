# MAPA DE EJECUCIÓN — Skills VM

> Tracking de lo que se construyó, lo que se difirió, y lo que quedó como nice-to-have.
> Este doc es el "audit trail" del trabajo de skills VM.

**Estado**: Sesión 2 VM completada el 2026-04-19.
**Total skills construidas**: 36.
**Total docs creados**: 4 (este + SKILLS_A_INSTALAR + GUIA_USO + README).
**Total scripts**: 1 (sync-skills.sh).

---

## Inventario de skills por capa

### Capa 1 — Fundamentos de marca / mensaje (3/3 ✅)

| Skill | Estado | Ubicación |
|---|---|---|
| `positioning-canon` | ✅ | `skills/positioning-canon/` |
| `brand-voice` | ✅ | `skills/brand-voice/` |
| `naming-lab` | ✅ | `skills/naming-lab/` |

### Capa 2 — Messaging / copy (5/5 ✅)

| Skill | Estado | Extras |
|---|---|---|
| `landing-copy` | ✅ | + `references/heroes-banco.md` |
| `email-copy` | ✅ | + `references/templates-listos.md` |
| `ad-copy` | ✅ | — |
| `whatsapp-copy` | ✅ | — |
| `sales-collateral` | ✅ | — |

### Capa 3 — Content / SEO / growth (4/4 ✅)

| Skill | Estado |
|---|---|
| `content-calendar` | ✅ |
| `blog-writer` | ✅ |
| `social-content` | ✅ |
| `newsletter-writer` | ✅ |

### Capa 4 — Outbound prospecting (3/3 ✅)

| Skill | Estado |
|---|---|
| `prospect-list-builder` | ✅ |
| `personalized-outreach` | ✅ |
| `multi-touch-sequence` | ✅ |

### Capa 5 — Sales execution (4/4 ✅)

| Skill | Estado |
|---|---|
| `discovery-prep` | ✅ |
| `demo-script` | ✅ |
| `objection-handler` | ✅ |
| `proposal-generator` | ✅ |

### Capa 6 — Inbound / qualification (1/1 ✅)

| Skill | Estado |
|---|---|
| `lead-qualifier` | ✅ |

### Capa 7 — Onboarding / implementación (4/4 ✅)

| Skill | Estado |
|---|---|
| `implementation-playbook` | ✅ |
| `pixel-install-guide` | ✅ |
| `aha-moment-tracker` | ✅ |
| `data-quality-auditor` | ✅ |

### Capa 8 — CS / retention / expansion (5/5 ✅)

| Skill | Estado |
|---|---|
| `qbr-generator` | ✅ |
| `health-score` | ✅ |
| `churn-risk-detector` | ✅ |
| `expansion-opportunity` | ✅ |
| `case-study-builder` | ✅ |

### Capa 9 — Pricing (1/1 ✅ scaffold)

| Skill | Estado | Nota |
|---|---|---|
| `pricing-modeler` | ✅ scaffold | Depende de `PRECIOS.md`. ROI modeling activo, pricing absoluto en stand-by. |

### Capa 10 — Research / intel (3/3 ✅)

| Skill | Estado |
|---|---|
| `account-research` | ✅ |
| `icp-profiler` | ✅ |
| `competitive-intel` | ✅ |

### Capa 11 — Operaciones / meta (3/3 ✅)

| Skill | Estado |
|---|---|
| `sales-dashboard` | ✅ |
| `pipeline-reviewer` | ✅ |
| `handoff-claude-to-claude` | ✅ |

---

## TOTAL: 36/36 skills locales ✅

---

## Skills DIFERIDAS (no construidas esta sesión)

Ninguna. Todo el mapa quedó cubierto.

---

## Skills NO construidas a propósito

- **Skills de producto / código / repo**: son dominio de Claude de Producto. VM no las construye.
- **Skills de finanzas corporativas** (contabilidad, impuestos, cap table): fuera del scope de VM.
- **Skills de HR / hiring**: no son prioridad hoy.
- **Skills de legal / compliance / contratos**: se manejan ad-hoc con Tomy y abogado.

---

## Dependencias externas / pending items

### 1. `PRECIOS.md` — pricing canónico

**Owner**: Tomy.
**Impacto**: `pricing-modeler` está en scaffold. En cuanto Tomy cierre pricing, esta skill queda plenamente operativa.

### 2. `CONOCIMIENTO_PRODUCTO/` — PKB de producto

**Owner**: Tomy + equipo.
**Impacto**: varias skills referencian PKB (activos, features, constraints). Si no está completo, skills funcionan pero con info parcial.

### 3. Listas de leads reales

**Owner**: Tomy.
**Impacto**: `prospect-list-builder` necesita ICP cerrado + fuentes operadas. Hoy devuelve frameworks, no lista poblada.

### 4. Data de pipeline real

**Owner**: Tomy (spreadsheet / CRM).
**Impacto**: `sales-dashboard` y `pipeline-reviewer` necesitan data. Sin data, devuelven plantillas vacías.

### 5. Skills externas del marketplace

**Owner**: Tomy instala desde Cowork.
**Impacto**: hay 5-12 packs externos recomendados (ver `SKILLS_A_INSTALAR.md`). Claude VM puede operar sin ellos, pero se complementan bien.

---

## Decisiones tomadas en esta sesión

1. **36 skills locales vs tercerizar**: decidido construir las 36 locales. Adaptación a canon NitroSales justifica el costo de escribirlas.
2. **Formato uniforme**: todas las skills siguen: YAML frontmatter + "Cuándo se dispara" + "Proceso" + "Output format" + "Principios" + "Anti-patrones" + "Conexión con otras skills". Consistencia facilita lectura.
3. **Bilingüe**: skills en español rioplatense (matching el tono de Tomy), pero con términos técnicos en inglés cuando es lo natural (ROI, pipeline, churn).
4. **Progressive disclosure**: skills grandes tienen `references/` con templates expandibles (ej: `landing-copy`, `email-copy`).
5. **Separation of concerns**: skills no se pisan entre sí. Cada una tiene un rol claro y punta a las otras cuando corresponde.
6. **Anti-patterns explícitos**: cada skill incluye qué NO hacer. Previene errores comunes.

---

## Criterios de "listo" cumplidos

- [x] 36 skills con SKILL.md completo.
- [x] YAML frontmatter con `name` + `description` pushy (que triggere bien).
- [x] Cada skill tiene al menos 1 ejemplo de output o estructura de output.
- [x] Cross-referencias entre skills (sección "Conexión con otras skills").
- [x] Sin archivos del repo de producto tocados.
- [x] docs/SKILLS_A_INSTALAR.md listo.
- [x] docs/MAPA_EJECUCION.md (este doc).
- [x] docs/GUIA_USO.md listo.

---

## Próximos pasos (siguientes sesiones VM)

1. **Tomy revisa skills**: que Tomy haga un pass por las skills clave (`positioning-canon`, `brand-voice`, `email-copy`, `landing-copy`) y me dé feedback.
2. **Tomy cierra `PRECIOS.md`**: desbloquea `pricing-modeler` + `proposal-generator` completos.
3. **Primera ejecución real**: usar una skill en un caso real (ej: un cold email, un blog post, un health score de cliente existente) y calibrar.
4. **Instalar skills externas**: Tomy instala 3-5 packs recomendados desde Cowork.
5. **Ajuste iterativo**: después de 2-3 ejecuciones reales, revisar qué skills necesitan refinamiento.

---

## Versionado

- **v1.0 — 2026-04-19**: 36 skills + 3 docs + sync script. Primera versión completa.

---

## Changelog

Cada vez que se agregue / modifique una skill, anotar acá:

### v1.0.1 — 2026-04-19

- **Fix** `scripts/sync-skills.sh`: destino cambiado de path hardcoded del sandbox (`/sessions/practical-vibrant-shannon/mnt/.claude/skills/user`) a `${HOME}/.claude/skills/user` para que funcione en cualquier Mac.
- **Sync ejecutado** por primera vez en la Mac de Tomy (`/Users/ttt/Documents/GitHub/nitrosales`). 36 skills + canon copiadas a `~/.claude/skills/user/`.

### v1.0.2 — 2026-04-19 — Reestructuración del repo

- **Movimiento**: todos los archivos VM del root del repo se agruparon en `CLAUDE_VM/`. Ahora `SKILLS_VM/` vive en `CLAUDE_VM/SKILLS_VM/` (junto con `CONOCIMIENTO_PRODUCTO/`, `HISTORIAL`, `REGLAS`, `MAPA_SKILLS`).
- **Comando de sync actualizado**: `bash CLAUDE_VM/SKILLS_VM/scripts/sync-skills.sh` (antes era `bash SKILLS_VM/scripts/sync-skills.sh`).
- **Razón**: evitar que Claude VM y Claude de Producto se confundan con archivos del otro. Separación visual clara en el root del repo.
- **Archivo nuevo**: `CLAUDE_VM/README.md` como puerta de entrada + guard para Claude Producto.
