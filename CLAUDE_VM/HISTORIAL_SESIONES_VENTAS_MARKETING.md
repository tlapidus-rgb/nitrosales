# HISTORIAL_SESIONES_VENTAS_MARKETING.md — Sesiones del Claude de Ventas & Marketing

> Este archivo lleva el registro de cada sesión de Claude VM. Es el equivalente VM del `CLAUDE_STATE.md` que usa Claude Producto, pero **separado** para que los dos estados no se mezclen.
>
> Claude VM lo lee al inicio de cada sesión para saber:
> - Cuál fue la última sesión VM.
> - Cuál fue el último SHA de git sincronizado desde Producto.
> - Qué pendientes quedaron.

---

## Estado de sync

| Campo | Valor |
|---|---|
| **Último SHA sincronizado desde Producto** | `6441ec25d8c1ba2632fc5836d723ae74e299b2d9` |
| **Última sesión de Producto leída en el sync** | Sesión 42 (2026-04-18) — P&L Pulso Fase 1 completa |
| **Última sesión VM ejecutada** | Sesión 2 VM (2026-04-19) — Skills VM (36 construidas) |

---

## Sesión 1 VM — 2026-04-18 — Bootstrap: estructura de datos VM + PKB inicial

### Objetivo

Crear la estructura de datos parallel de Ventas & Marketing sin tocar nada del lado de Producto. Setear al Claude VM con conocimiento profundo del producto para poder trabajar en ventas y marketing sin frenar en cada pedido para re-investigar qué es NitroSales.

### SHA sincronizado

`6441ec25d8c1ba2632fc5836d723ae74e299b2d9` (cierre de Sesión 42 de Producto — P&L Pulso Fase 1 completa con Cash Runway hero, Marketing Financiero, Sparkline 12m, Costos YTD, narrative engine, alerts engine, manual cash override, Aurum context).

### Archivos creados (todos del lado VM, ninguno de Producto tocado)

1. `REGLAS_CLAUDE_VENTAS_MARKETING.md` — 10 reglas del agente VM. Regla #1: no tocar archivos de Producto.
2. `HISTORIAL_SESIONES_VENTAS_MARKETING.md` — este archivo.
3. `CONOCIMIENTO_PRODUCTO/ULTIMAS_ACTUALIZACIONES_PRODUCTO.md` — changelog comercial con estado inicial al cierre de S42.
4. `CONOCIMIENTO_PRODUCTO/POSICIONAMIENTO_Y_VOZ.md` — posicionamiento v5, arquetipo, 4 pilares, manifiesto, tono de voz, palabras a usar/evitar.
5. `CONOCIMIENTO_PRODUCTO/QUE_ES_CADA_PRODUCTO.md` — los 4 activos con marca: NitroPixel, Aurum, Bondly, Aura.
6. `CONOCIMIENTO_PRODUCTO/SECCIONES_DEL_PRODUCTO.md` — las 5 secciones funcionales: Control de Gestión, Marketing Digital, Comercial, Marketplaces, Finanzas (P&L).
7. `CONOCIMIENTO_PRODUCTO/COMPETIDORES.md` — Triple Whale, Northbeam, Klaviyo, Polar, Tapcart + LATAM (Tiendanube, Nubimetrics, VTEX IO Dashboards). Diferenciadores de NitroSales.
8. `CONOCIMIENTO_PRODUCTO/INTEGRACIONES.md` — VTEX, MercadoLibre, Meta Ads, Google Ads, GA4, GSC, Resend, Anthropic, AFIP, dolarapi, INDEC.
9. `CONOCIMIENTO_PRODUCTO/CASOS_DE_EXITO.md` — esqueleto + plantilla + el único cliente beta documentado (El Mundo del Juguete) como caso en construcción.
10. `CONOCIMIENTO_PRODUCTO/OBJECIONES_COMUNES.md` — las 12 objeciones más probables con respuestas alineadas a posicionamiento.
11. `CONOCIMIENTO_PRODUCTO/PRECIOS.md` — modelos candidatos (SaaS mensual, % de GMV, híbrido), sin decisión tomada, estructura para cuando Tomy defina.

### Archivos de Producto leídos (solo lectura, no tocados)

- `CLAUDE.md`
- `CLAUDE_STATE.md` (3569 líneas — 42 sesiones de dev)
- `UI_VISION_NITROSALES.md`
- `ERRORES_CLAUDE_NO_REPETIR.md`
- `BACKLOG_PENDIENTES.md`
- `PROPUESTA_SIDEBAR_REORG.md`
- `CORE-ATTRIBUTION.md`
- `NOTA_SESION_21_CAMPAIGNS_PHASE1.md`
- `NOTA_MANANA_SESION_21.md`
- `README.md`
- `MAPA_SKILLS_SH_VS_NITROSALES.md`
- `src/app/(app)` (listado de rutas)

### Decisiones tomadas esta sesión

- **Separación estricta de archivos**: Claude VM nunca toca archivos de Producto. Regla #1 del `REGLAS_CLAUDE_VENTAS_MARKETING.md`.
- **Dos archivos separados** para productos y secciones (no uno solo): mental models distintos se actualizan a ritmos distintos.
- **Sync dinámico via pull al arranque de cada sesión VM**, con skip si el SHA no cambió.
- **Un solo cliente documentado** (El Mundo del Juguete / El Mundo del Bebé) se trata como **cliente beta / caso en construcción**, no como caso de éxito cerrado.
- **Pricing**: sin decisión. PRECIOS.md queda con 3 modelos candidatos listos para cuando Tomy defina.

### Pendientes para la próxima sesión VM

- **Skills**: Trabajo 2. Instalar las 50 skills curadas en `MAPA_SKILLS_SH_VS_NITROSALES.md` y conectarlas con el PKB. Decisión de Tomy: esperar una semana usando el PKB antes de arrancar con skills.
- **Pricing**: cuando Tomy tenga un primer draft del modelo de precios, completar `PRECIOS.md`.
- **Casos de éxito**: cuando aparezca el primer cliente pagando, convertir la plantilla en caso real.
- **Landing + web**: Tomy puede empezar a pedir landing / one-pagers / decks cuando quiera. Todo el PKB está listo para alimentar outputs.

### Notas

- El primer sync pass "completo" fue este bootstrap: leer 42 sesiones de producto y destilar lo comercialmente relevante al PKB. Próximos syncs serán **incrementales** (solo los commits nuevos desde el último SHA).
- El comando `git rev-parse HEAD` devolvió `6441ec25d8c1ba2632fc5836d723ae74e299b2d9` al momento de cierre de sesión 1 VM.
- Ningún archivo de Producto fue modificado. Si Tomy corre `git status` solo debe ver archivos nuevos del lado VM.

---

_Próxima sesión VM: cuando Tomy abra una nueva conversación acá, Claude VM debe leer este archivo primero para saber el último SHA y retomar desde ahí._

---

## Sesión 2 VM — 2026-04-19 — Skills VM: 36 skills locales + docs de uso

### Objetivo

Ejecutar Trabajo 2 del mapa: construir las skills locales de Claude VM basadas en `MAPA_SKILLS_SH_VS_NITROSALES.md`. Decisión previa de Tomy: hacer todo el mapa en profundidad, con templates y ejemplos, en lugar de esperar para instalar solo packs externos.

### Scope ejecutado

- **36 skills locales** construidas en `SKILLS_VM/skills/`, distribuidas en 11 capas.
- **3 documentos** en `SKILLS_VM/docs/`: `SKILLS_A_INSTALAR.md` (brief de packs externos), `MAPA_EJECUCION.md` (audit trail), `GUIA_USO.md` (cómo usar las skills día a día).
- **0 archivos del repo de Producto tocados**. Todo el trabajo es del lado VM.

### Skills por capa

| Capa | Skills | Cantidad |
|---|---|---|
| 1. Fundamentos de marca | positioning-canon, brand-voice, naming-lab | 3 |
| 2. Messaging / copy | landing-copy, email-copy, ad-copy, whatsapp-copy, sales-collateral | 5 |
| 3. Content / SEO / growth | content-calendar, blog-writer, social-content, newsletter-writer | 4 |
| 4. Outbound prospecting | prospect-list-builder, personalized-outreach, multi-touch-sequence | 3 |
| 5. Sales execution | discovery-prep, demo-script, objection-handler, proposal-generator | 4 |
| 6. Inbound / qualification | lead-qualifier | 1 |
| 7. Onboarding / implementación | implementation-playbook, pixel-install-guide, aha-moment-tracker, data-quality-auditor | 4 |
| 8. CS / retention / expansion | qbr-generator, health-score, churn-risk-detector, expansion-opportunity, case-study-builder | 5 |
| 9. Pricing | pricing-modeler (scaffold, depende de PRECIOS.md) | 1 |
| 10. Research / intel | account-research, icp-profiler, competitive-intel | 3 |
| 11. Operaciones / meta | sales-dashboard, pipeline-reviewer, handoff-claude-to-claude | 3 |
| **Total** | | **36** |

### Formato uniforme de todas las skills

- YAML frontmatter con `name` + `description` pushy (para triggering).
- Secciones estándar: "Cuándo se dispara", "Pre-condiciones" (si aplica), "Proceso", "Output format", "Principios", "Anti-patrones", "Conexión con otras skills".
- Cross-referencias entre skills para flujos encadenados.
- Español rioplatense sutil, términos técnicos en inglés cuando es natural (ROI, pipeline, churn).
- Anti-patterns explícitos en cada una para prevenir errores comunes.
- Skills grandes con subfiles `references/` para progressive disclosure (landing-copy, email-copy).

### Decisiones tomadas en esta sesión

1. **Construir las 36 locales en lugar de tercerizar a packs externos**: justificado por la adaptación a canon NitroSales (positioning v5, voice, casos LATAM).
2. **Dejar pricing-modeler como scaffold**: depende de `PRECIOS.md` cerrado. Modo ROI activo, pricing absoluto en stand-by hasta que Tomy decida.
3. **Handoff protocol formal**: skill `handoff-claude-to-claude` define cómo Claude VM y Claude Producto se pasan contexto sin pisarse. Usa `BACKLOG_PENDIENTES.md` como archivo compartido con prefijos `VM-` y `PR-`.
4. **Packs externos diferidos a instalación manual de Tomy**: ver `SKILLS_A_INSTALAR.md` con 12 recomendados (prioridad 1: sales-skills, Corey Haines, Lenny, Manoj, onewave).

### Pendientes post-Sesión 2 VM

- **Tomy**: instalar 3-5 packs externos desde Cowork UI (prioridad 1 en `SKILLS_A_INSTALAR.md`).
- **Tomy**: revisar skills clave (`positioning-canon`, `brand-voice`, `email-copy`, `landing-copy`) y dar feedback.
- **Tomy**: cerrar `PRECIOS.md` cuando esté listo → desbloquea `pricing-modeler` + `proposal-generator` completos.
- **Tomy**: primera ejecución real de una skill en un caso concreto (cold email, QBR, post LinkedIn) para calibrar.
- **Próxima sesión VM**: iterar sobre skills basadas en el primer uso real.

### Archivos creados esta sesión

Skills (36 SKILL.md + algunos references):
- Capa 1-11 completas (ver tabla arriba).

Docs (3):
- `SKILLS_VM/docs/SKILLS_A_INSTALAR.md`
- `SKILLS_VM/docs/MAPA_EJECUCION.md`
- `SKILLS_VM/docs/GUIA_USO.md`

### Archivos de Producto tocados

Ninguno. `git status` del lado repo solo debería mostrar cambios bajo `SKILLS_VM/` + `HISTORIAL_SESIONES_VENTAS_MARKETING.md`.

### Notas

- Esta sesión se retomó post-compactación. Hubo un arranque con fricción que Tomy notó ("que paso que no terminaste en tanto tiempo?"); se retomó y se ejecutó el batch completo de una.
- El ritual de arranque (leer `REGLAS_CLAUDE_VENTAS_MARKETING.md`, `HISTORIAL_SESIONES_VENTAS_MARKETING.md`, `MAPA_SKILLS_SH_VS_NITROSALES.md`) se respetó al retomar.

### Post-sync (cierre de sesión)

- **Fix del script**: el `sync-skills.sh` tenía hardcoded el path del sandbox (`/sessions/practical-vibrant-shannon/mnt/.claude/skills/user`). Se cambió a `${HOME}/.claude/skills/user` para que funcione en la Mac de Tomy (y en cualquier Mac futura).
- **Sync ejecutado con éxito en la Mac de Tomy**: 36 skills + `_CANON` copiadas a `/Users/ttt/.claude/skills/user/`. Output del script confirmó "✅ Sincronizadas 36 skills + canon".
- **Ubicación del repo en la Mac de Tomy**: `/Users/ttt/Documents/GitHub/nitrosales`. Anotado acá para futuras sesiones.
- **Tomy reinició Cowork** para que detecte las skills nuevas.

### Reestructuración — todo VM agrupado en `CLAUDE_VM/`

A pedido de Tomy, para evitar confusión entre Claude VM y Claude de Producto cuando trabaje con su otra compu.

**Cambio**: todos los archivos y carpetas VM se movieron desde el root del repo hacia `CLAUDE_VM/`:

| Antes (root) | Ahora |
|---|---|
| `REGLAS_CLAUDE_VENTAS_MARKETING.md` | `CLAUDE_VM/REGLAS_CLAUDE_VENTAS_MARKETING.md` |
| `HISTORIAL_SESIONES_VENTAS_MARKETING.md` | `CLAUDE_VM/HISTORIAL_SESIONES_VENTAS_MARKETING.md` |
| `MAPA_SKILLS_SH_VS_NITROSALES.md` | `CLAUDE_VM/MAPA_SKILLS_SH_VS_NITROSALES.md` |
| `CONOCIMIENTO_PRODUCTO/` | `CLAUDE_VM/CONOCIMIENTO_PRODUCTO/` |
| `SKILLS_VM/` | `CLAUDE_VM/SKILLS_VM/` |

**Archivos actualizados para reflejar los paths nuevos:**
- `CLAUDE_VM/REGLAS_CLAUDE_VENTAS_MARKETING.md`: tabla de archivos VM y ritual de arranque.
- `CLAUDE_VM/SKILLS_VM/docs/GUIA_USO.md`: comando de sync es ahora `bash CLAUDE_VM/SKILLS_VM/scripts/sync-skills.sh`.

**Archivo nuevo:**
- `CLAUDE_VM/README.md`: puerta de entrada + guard para Claude Producto ("si sos Producto, no entres acá").

**Impacto en git**: cero. Todos los archivos VM estaban en `untracked` → el movimiento no rompe commits ni historia.

**Pendiente para Tomy en su otra compu (Claude Producto)**: pedirle al Claude Producto que agregue en `CLAUDE.md` del repo la regla: *"No tocar la carpeta `CLAUDE_VM/` — es dominio exclusivo del Claude VM."* Una carpeta, una regla, quedó blindado.

---
