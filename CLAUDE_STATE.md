# CLAUDE_STATE.md â Estado del Proyecto NitroSales

> **INSTRUCCIÃN OBLIGATORIA**: Claude DEBE leer este archivo al inicio de CADA sesiÃ³n antes de hacer CUALQUIER cambio.
> Si este archivo no se lee primero, se corre riesgo de perder trabajo ya hecho.

## Ultima actualizacion: 2026-04-19 (Sesion 45 — Finanzas P&L Fase 4 Costos UI premium: 5 sub-fases de polish visual world-class segun UI_VISION_NITROSALES.md)

> Este bloque consolida los **5 commits** a `main` del 2026-04-19 (segunda ronda del dia) que llevan `/finanzas/costos` del nivel "funcional Fase 3" al nivel **visual premium world-class** definido en `UI_VISION_NITROSALES.md` (Linear / Stripe / Vercel / Notion). 5 sub-fases iterativas (4a→4e) pusheadas directo a `main` con validacion `tsc --noEmit` clean despues de cada una. Sin migracion de DB, sin cambios de API, sin deps nuevas — solo rewiring de UI sobre el codigo de Fase 3. Diff neto: **+662 / -170 lineas** en un solo archivo (`src/app/(app)/finanzas/costos/page.tsx`).

### Sesion 45 — 2026-04-19 — Finanzas P&L Fase 4 Costos UI premium (5 sub-fases iterativas)

**Objetivo**: llevar `/finanzas/costos` al nivel visual de `/pulso` y `/estado` (Fase 0/1/2 premium) aplicando la biblia `UI_VISION_NITROSALES.md`: aurora radial + prism delimiters, tipografia tracking-tight, multi-layer shadows con hover lift, lucide-react icons (cero emojis en chrome), count-up cubic ease, skeleton shimmer, empty states con CTA, toast bottom-right con pulse-dot, modal con backdrop-blur + aurora interno. Todo respeta `prefers-reduced-motion` y mantiene accesibilidad (role=dialog, aria-modal, aria-checked, aria-live).

Fase 4 segun roadmap `PROPUESTA_PNL_REORG.md` §Fase 4 UI Polish y checklist de calidad visual en `UI_VISION_NITROSALES.md` §Premium Tier.

#### Commits a `main`

| Commit | Sub-fase | Que |
|---|---|---|
| `78603c3` | **4a** — Hero + KPI strip premium | Header con aurora radial (teal + violet) + prism delimiter bottom (teal→indigo→violet). Titulo 28px font-semibold tracking-tight. Controles (input month, checkbox IPC, boton copy) con backdrop-blur + multi-layer shadow + hover lift. Componente `CountUp` con easing cubic out-quart (4ta potencia), `prefers-reduced-motion` respect, `performance.now()` + `requestAnimationFrame` cleanup. 4 KPI cards (Total Mensual teal, % Fijo teal, % Variable amber, Con ajuste IPC violet) con prism gradient top bar, CountUp animado (700ms), tabular-nums, hover lift. |
| `c8abbf7` | **4b** — Category cards premium | Imports `lucide-react`: `Truck, Users, Wrench, FileText, Building2, Camera, TrendingDown, Package, ChevronDown, Sparkles`. Maps `CATEGORY_ICONS` (emoji → lucide component) + `CATEGORY_ACCENTS` ({icon textClass, bg, bar hex}) para las 8 categorias. Rebuild del header de cada card: icon en contenedor 36x36 rounded-xl con bg accent, multi-layer shadow reposo/hover, prism delimiter top con accent color, pre-resumen "N items · $X · Y% del total" cuando collapsed, ChevronDown con rotate transition, Sparkles icon para badges "Auto:". Stagger entrance: `animate-fade-in-up` existente + inline `animationDelay: ${idx * 45}ms`. |
| `35b94e5` | **4c** — Header controls premium | Helpers `formatMonthLabel(monthStr)` (es-AR "Abril de 2026") y `addMonthsToStr(monthStr, delta)`. Selector de mes custom: `<ChevronLeft />` + label clickeable con native `<input type="month">` invisible encima + `<ChevronRight />` (disabled si `>= nowMonth`). Toggle IPC convertido a pill `role="switch"` con `aria-checked`, fondo teal-500 cuando on, dot blanco que desliza `translate-x-4 ↔ translate-x-0`. Boton "Copiar mes anterior" con icon lucide `Copy` + hover lift. |
| `f8ad579` | **4d** — Empty states + skeleton shimmer + toast premium | Empty state per categoria: contenedor 48x48 con gradient de la categoria + lucide icon, heading "Sin costos en {label}", hint, CTA "Agregar primer costo" con accent teal. Toast movido a bottom-right con `animate-fade-in-up 260ms`, `role="status"`, `aria-live="polite"`, bg gray-900, pulse-dot teal, multi-layer shadow ambient. Loading state reemplazado de spinner a **full skeleton shimmer**: hero skeleton (titulo + subtitulo + 3 controles) + KPI strip skeleton (4 cards) + 3 category cards skeleton (icon + label + sublabel + amount). Usa keyframe `shimmer` existente de `globals.css` via `::before` pseudo-element con translate-x animado. |
| `e1aa8e6` | **4e** — Modal DRIVER_BASED premium | Imports lucide: `X, Plus, Trash2, Calculator`. `useEffect` global con handler Escape key + cleanup para cerrar modal. Rewrite completo: overlay `bg-black/50 + backdrop-blur-md + animate-fade-in-up`, container `rounded-3xl` con shadow 32px ambient + 12px medium, aurora interno (indigo + violet radial gradients), header con Calculator icon en contenedor 40x40 gradient + titulo tracking-tight + prism delimiter bottom + close X lucide. Body Notion-style: drivers table con column labels + cards individuales con hover border-indigo + Trash2 delete, textarea con shadow + focus ring indigo-100, Preview destacada con pill "Formula valida"/"Sin resultado" + `CountUp 420ms` + tabular-nums. Footer glassmorphism (bg-white/60 + backdrop-blur) con `<kbd>Esc</kbd>` hint, cancel + save (gradient + hover lift + custom border-spinner). `role="dialog"`, `aria-modal="true"`, `aria-labelledby="formula-modal-title"`. |

**Arquitectura Fase 4**:
- **Zero cambios de API o DB**. Todo es rewiring de UI sobre la estructura de Fase 3. Los endpoints (`/api/finance/manual-costs`, `/bulk-update`, `copyFrom con IPC`, driver-formula lib) siguen intactos — se tocan sus consumers unicamente.
- **Reuso de primitivas existentes**: `animate-fade-in-up`, `animate-pulse-live`, keyframe `shimmer`, `var(--ease-nitro)` — todo de `globals.css` ya montado en Fase 0. Se evito crear clases nuevas excepto donde inline styles eran mas claros (delays de stagger por index).
- **lucide-react como unico sistema de iconos**: confirmado ya instalado (`0.383.0`). Prohibido emojis en chrome (se mantuvieron emojis solo en datos historicos de categorias como display secundario opcional). Maps `CATEGORY_ICONS` + `CATEGORY_ACCENTS` en modulo-scope para referencia estable en renders.
- **CountUp reutilizable**: componente puro con API `{ value, duration, format, className }`, respeta `prefers-reduced-motion: reduce` (setea al valor final sin animar), cleanup de `requestAnimationFrame`. Se usa en KPI strip + Preview del modal.
- **Skeleton shimmer modular**: reproduce la estructura real de la pagina (hero + 4 KPIs + 3 cards) — no es un spinner generico. Reduce CLS percibido cuando llega data real.
- **Month selector hibrido**: el `<input type="month">` nativo queda debajo del label custom (opacity-0, cubriendo el area del label). Asi se conserva la UX nativa de calendario del browser pero el visual luce custom.
- **Accesibilidad preservada**: toggle es `role="switch"` con `aria-checked`, modal es `role="dialog"` con `aria-modal` + `aria-labelledby`, toast es `role="status"` + `aria-live="polite"`, botones de mes tienen `aria-label` explicito.

**Checklist de cierre Fase 4**:
- ✅ `npx tsc --noEmit` clean despues de cada sub-fase (4a/4b/4c/4d/4e).
- ✅ 5 commits separados en `main` para revert granular por sub-fase.
- ✅ Sin cambios de schema, API ni deps nuevas — rewiring puro de UI.
- ✅ Todos los numeros financieros pasan por `tabular-nums` para alineacion perfecta.
- ✅ `prefers-reduced-motion` respetado en `CountUp` (y heredado de `animate-*` de globals).
- ✅ Modal cierra con Escape key + click en backdrop + boton X (3 rutas de salida).
- ✅ Month selector respeta el limite del mes actual (ChevronRight disabled si `current >= nowMonth`).
- ✅ Empty states con CTA accionable ("Agregar primer costo") en vez de mensaje pasivo.
- ✅ Toast no tapa el content (bottom-right en vez de bottom-center).
- ✅ Diff neto `+662 / -170` lineas en un solo archivo — cirugia quirurgica, no rewrite completo.

**Proximos pasos sugeridos (fuera de Fase 4)**:
- **Fase 5 Escenarios (what-if)**: combinar Fase 3 (comportamiento + formulas) con sliders de revenue/volumen y ver como escalan los costos automaticamente. La taxonomia Variable/Fijo/Semi-fijo de Fase 3 + los drivers de formulas DRIVER_BASED + los chips visuales de Fase 4 dan la base para que un slider impacte `CountUp` en vivo.
- **Consolidar taxonomia de `CostBehavior`** entre client (`/finanzas/estado` usa mapping hardcoded por categoria) y server (`ManualCost.behavior`). Idealmente `/finanzas/estado` leeria `behavior` real en vez del mapping.
- **Tests unitarios de `driver-formula.ts`** (casos: formula valida, division por cero, identificador prohibido, formula muy larga, drivers con key invalida).
- **Extraer componentes del archivo**: `page.tsx` va creciendo (~2750 lineas despues de Fase 4). Sacar `CountUp`, `CategoryCard`, `FormulaModal` a `src/components/finanzas/costos/` cuando haya bandwidth.

---

## Ultima actualizacion previa: 2026-04-19 (Sesion 44 — Finanzas P&L Fase 3 Costos pro completa: schema + chips Fijo/Variable + bulk edit + copy-from-prev con IPC + editor de formula DRIVER_BASED)

> Este bloque consolida los **6 commits** a `main` del 2026-04-19 que construyen la **Fase 3 completa del rediseño de Finanzas P&L** (`/finanzas/costos` — Costos pro). 6 sub-fases iterativas (3a→3f) pusheadas directo a main con validación `tsc --noEmit` clean. Incluye migración de schema (4 campos nuevos en `ManualCost`), chips visibles FIJO/VARIABLE/SEMI-FIJO con ratio en header, edición masiva por categoría (aumento %, comportamiento, clasificación fiscal), copia del mes anterior con ajuste por IPC opcional, y editor de fórmulas DRIVER_BASED con drivers editables y preview en vivo.

### Sesion 44 — 2026-04-19 — Finanzas P&L Fase 3 Costos pro completa (6 sub-fases iterativas)

**Objetivo**: convertir `/finanzas/costos` de una grilla simple de ítems en una herramienta profesional que permita a Tomy clasificar cada costo por comportamiento (Fijo/Variable/Semi-fijo) y tipo fiscal, ver en header qué porcentaje del total es fijo vs variable, editar masivamente varios costos con un bulk bar flotante, copiar el mes anterior aplicando ajuste por IPC automático solo a costos marcados, y definir costos con fórmulas tipo `DRIVER_BASED` (variables nombradas + expresión matemática).

Fase 3 según roadmap `PROPUESTA_PNL_REORG.md` §5.3 y §Fase 3.

#### Commits a `main`

| Commit | Sub-fase | Qué |
|---|---|---|
| `49cf26f` | **3a** — Migración DB | Endpoint admin `/api/admin/migrate-manualcost-fase3` que agrega 4 columnas a `manual_costs` (`fiscalType`, `behavior`, `driverFormula` JSONB, `autoInflationAdjust` bool) + índice parcial sobre `driverFormula`. Idempotente (`ADD COLUMN IF NOT EXISTS`). Ejecutado en prod. |
| `c6671fd` | **3b** — Schema + API | Schema Prisma actualizado con los 4 campos (tipos strict unions). API `/api/finance/manual-costs` GET devuelve `summary: { fixed, variable, semiFixed }`. POST/PUT validan los nuevos campos + `validateDriverFormula()` helper para el DSL JSON. `rateType` agrega `DRIVER_BASED` al enum. |
| `6b2d732` | **3c** — UI ratio + chips | Constantes `BEHAVIOR_LABELS`, `BEHAVIOR_STYLES` + `effectiveBehavior()` con fallback a `type` legacy. Barra apilada tricolor (teal/amber/violet) en header con verdict (≥70% fijo = warning). Chips visibles en cada fila del P&L. Selector de comportamiento en el add-form (default: LOGISTICA/MERMA = VARIABLE, resto = FIXED). |
| `079c4ae` | **3d** — Bulk edit | Endpoint `/api/finance/manual-costs/bulk-update` con 5 operaciones (`percentage_increase`, `set_amount`, `set_behavior`, `set_fiscal_type`, `set_auto_inflation`), scope `{ organizationId, id: { in: ids } }`, max 500 IDs por call, `$transaction` para el pct increase. UI: checkbox por fila + header "seleccionar todos por categoría" + bulk action bar flotante sticky con 3 ops expuestas (pct / behavior / fiscal). Limpia selección al cambiar de mes. |
| `5f5a160` | **3e** — Copy-from-prev con IPC | Extensión del POST `copyFrom` para aceptar `adjustByInflation: boolean`. Consulta `InflationIndexMonthly` source y target, calcula `factor = ipcAcumulado(target)/ipcAcumulado(source)`, aplica factor solo a items con `autoInflationAdjust=true`, agrega nota auditable `[IPC {pct}% aplicado — {from} → {to}]`. Response enriquecida con `ipcAdjusted`, `ipcFactor`, `ipcMessage`. UI: toggle "Ajustar por IPC" en header (default on), toast muestra factor; badge "IPC auto" (rose) en items con autoInflationAdjust=true; checkbox en add-form. |
| `204004a` | **3f** — Editor DRIVER_BASED | Nuevo lib `src/lib/finanzas/driver-formula.ts` con `validateFormulaSyntax` (regex whitelist + identifier allowlist), `evaluateDriverFormula` (`new Function()` con Math helpers aliased), `buildDriverFormulaPayload` (dto listo para PUT/POST). UI: `DRIVER_BASED` habilitado como rateType en PLATAFORMAS/FISCAL/INFRAESTRUCTURA/MARKETING/MERMA/OTROS. En add-form cuando `rateType=DRIVER_BASED` se oculta input de monto y Guardar pasa a "Siguiente: configurar fórmula" que abre el modal. Botón "ƒx" en rows con rateType=DRIVER_BASED abre el editor. Modal con drivers editables (key/label/value/unit) + textarea para fórmula + preview en vivo del monto calculado + save via PUT (edit) o POST (create). |

**Arquitectura Fase 3**:
- **Migración DB aparte del código**: endpoint admin primero, ejecución en prod, después schema + código (regla de oro para evitar `column does not exist` en deploy de Vercel).
- **Lib pura nueva**: `src/lib/finanzas/driver-formula.ts` (167 líneas, pure functions, testeable). Evaluación segura con `new Function()` + whitelist regex + identifier check (rechaza `constructor`, `eval`, `require`, etc.).
- **Backward compat**: `effectiveBehavior(item)` con fallback `behavior → type legacy (FIXED/VARIABLE) → FIXED`. SEMI_FIXED mapea a VARIABLE legacy en POST body.
- **Scope seguro en bulk**: endpoint siempre filtra por `{ organizationId, id: { in: ids } }` — imposible afectar otra org.
- **IPC aplicado por-item, no masivo**: solo ítems con `autoInflationAdjust=true` reciben factor. Items sin el flag se copian con monto intacto.
- **Sin deps nuevas**. Todo con el stack existente (Prisma, Next.js, Tailwind).

**Checklist de cierre Fase 3**:
- ✅ `npx tsc --noEmit` clean después de cada sub-fase.
- ✅ 6 commits separados en `main` para revert granular.
- ✅ Migración idempotente con `ADD COLUMN IF NOT EXISTS` + índice parcial.
- ✅ Validación del DSL de driverFormula tanto en lib client como en API (`validateDriverFormula` server-side).
- ✅ Evaluador de fórmulas con defense-in-depth (regex + identifier whitelist + `new Function` sin acceso a globals fuera de Math aliases).
- ✅ UI responsive: modal con `max-w-[95vw]`, bulk bar con `flex-wrap`.
- ✅ ESC/backdrop cierran modal, click en backdrop ignora clicks internos (`e.target === e.currentTarget`).
- ✅ No se rompió el flujo legacy: items sin `behavior` siguen funcionando (fallback a `type`).

**Próximos pasos sugeridos (fuera de Fase 3)**:
- Fase 4 Escenarios (what-if): combinar Fase 3 (comportamiento + fórmulas) con sliders de revenue/volumen y ver cómo escalan los costos automáticamente.
- Consolidar taxonomía de `CostBehavior` entre client (`/finanzas/estado` usa mapping hardcodeado por categoría) y server (`ManualCost.behavior`). Idealmente `/finanzas/estado` leería `behavior` real en vez del mapping.
- Tests unitarios de `driver-formula.ts` (casos: fórmula válida, división por cero, identificador prohibido, formula muy larga, drivers con key inválida).

---

## Ultima actualizacion previa: 2026-04-18 (Sesion 43 — Finanzas P&L Fase 2 Estado completa: Waterfall hero premium + Drill-down lateral + Toggle $/% + Variables vs Fijos + Export PDF/Excel)

> Este bloque consolida los **5 commits** a `main` del 2026-04-18 (segunda ronda) que construyen la **Fase 2 completa del rediseño de Finanzas P&L** (`/finanzas/estado` vista narrativa detallada): 5 sub-fases iterativas (2a→2e) pusheadas directo a main con validación `tsc --noEmit` clean. Incluye Waterfall SVG custom premium con stagger animations + tooltip con mini-barra comparativa, drill-down lateral deslizable al clickear cualquier barra, toggle $ vs % en el waterfall, taxonomía Variables/Fijos/Semi-fijos con badges por línea + strip de composición, y sistema completo de export PDF (vía `window.print()` + CSS dedicado) y Excel (vía `exceljs` dynamic import con 3 hojas: P&L, Composición, Costos manuales).

### Sesion 43 — 2026-04-18 — Finanzas P&L Fase 2 Estado completa (5 sub-fases iterativas)

**Objetivo**: convertir `/finanzas/estado` de un P&L estático a una experiencia narrativa y accionable que permita interrogar los números (drill-down), entender la composición del costo (Variables/Fijos) y exportar la vista completa (PDF/Excel) sin salir de la app. Fase 2 según roadmap `linear-pondering-lemur.md` y `PROPUESTA_PNL_REORG.md` §Fase 2.

#### Commits a `main`

| Commit | Sub-fase | Qué |
|---|---|---|
| `fe4190f` | **2a** — Waterfall hero premium (SVG custom) | Reemplaza el waterfall de recharts por un componente SVG custom `WaterfallHero.tsx` con: responsive viewport, 2-line labels (valor abs + Δ vs prev), barras con gradients por kind (positive/negative/subtotal/total), stagger animation 60ms/bar con ES easing, tooltip custom con backdrop-blur premium, mini-barra comparativa con periodo anterior, `@media (prefers-reduced-motion)` respetado, colores del sistema NitroSales (cyan/rose/violet/emerald). Tabular-nums en todos los números. |
| `0c5a259` | **2b** — Drill-down lateral | Panel deslizable desde la derecha al clickear cualquier barra del waterfall. Muestra desglose del ítem (ej: Revenue → VTEX + MELI con órdenes/AOV; COGS → por canal; Ads → Meta vs Google; Envios → real vs cobrado vs subsidio cuando hay datos reales; Medios Pago → desglose por método; Otros → categorías de costos manuales con labels humanos). Incluye badges de origen del dato (auto/calc/manual) para transparencia. ESC key + backdrop click cierran. Stagger 40ms por row. |
| `938895d` | **2c** — Toggle $ vs % en waterfall | Segmented control ($/%) en el header del chart mode Cascada. Cuando `%` activo, cada barra muestra su peso relativo al revenue (ej: "COGS = 42.3%"), y el tooltip además muestra el valor absoluto para contexto. Fuera del modo Cascada el toggle no se renderiza. Accesible: role="group", aria-pressed. |
| `b1d39c7` | **2d** — Variables vs Fijos + badges behavior | Taxonomía `CostBehavior` (VARIABLE / FIJO / SEMIFIJO) con mapping `CATEGORY_BEHAVIOR` client-side (sin DB migration). Badge visual por línea del P&L: cyan Variable, violet Fijo, amber Semi-fijo. COGS, Ads, Envios, Comisiones, Medios Pago, Descuentos marcados como VARIABLE; costos manuales derivan según su categoría (LOGISTICA→VARIABLE, EQUIPO/PLATAFORMAS/FISCAL/INFRAESTRUCTURA→FIJO, MARKETING/OTROS→SEMIFIJO). Strip de Composición al pie del P&L con totales + barra ratio tricolor. |
| `0babd6a` | **2e** — Export PDF + Excel del P&L | `ExportMenu` dropdown (PDF / Excel) en el header del P&L. PDF: `window.print()` + CSS `@media print` dedicado (oculta sidebar/backdrop/toggles/filtros/chart, force white bg, page-break-inside:avoid sobre el bloque P&L, banner print-only con el periodo). Excel: `src/lib/finanzas/export.ts` con dynamic import de `exceljs` (ya instalado, tree-shakeable). 3 hojas: **P&L** (formato numérico, colores por fila, frozen pane 4), **Composición** (Variables/Fijos/Semi-fijos con totales + %), **Costos manuales** (categoría + comportamiento). Respeta el view de moneda actual (USD / ARS / ARS_ADJ). Archivo: `NitroSales_PnL_{from}_{to}.xlsx`. |

**Arquitectura Fase 2**:
- **Componentes nuevos**: `WaterfallHero.tsx` (SVG custom), `WaterfallDrillPanel.tsx` (aside slide-in), `ExportMenu.tsx` (dropdown PDF/Excel).
- **Lib pura nueva**: `src/lib/finanzas/export.ts` con `exportPnLToExcel({ rows, manualCosts, composition, rangeLabel, currencyLabel, generatedAtLabel })` usando exceljs. Pure function, no React.
- **Página editada**: `src/app/(app)/finanzas/estado/page.tsx` — extiende `DetailedView` con props `dateFrom/dateTo`, hooks de export, ExportMenu montado en el header del P&L, `print:hidden` selectivo, `<style jsx global>{@media print}` con 11 reglas para imprimir limpio.
- **Sin migración DB**. Toda la taxonomía Variables/Fijos/Semi-fijos es client-side hasta que Fase 3 la mueva a `ManualCost` schema si hace falta persistirla por organización.
- **Sin deps nuevas**. `exceljs` ya estaba instalado; para PDF se usa `window.print()` nativo del browser (zero-dep, calidad nativa, user elige "Save as PDF" en el dialog).

**Checklist de cierre Fase 2**:
- ✅ `npx tsc --noEmit` clean después de cada sub-fase.
- ✅ 5 commits separados en `main` para revert granular.
- ✅ Waterfall clickeable desde teclado (Enter/Space) + aria-labels completos.
- ✅ Drill panel con ESC + backdrop click + focus trap implícito + `prefers-reduced-motion`.
- ✅ Toggle $/% solo en Cascada; Tendencia no tiene toggle porque no aplica.
- ✅ Badges Variables/Fijos en el render del P&L + strip de composición al pie del bloque.
- ✅ ExportMenu con `print:hidden` (no aparece en el PDF) + busy state en el botón mientras genera el XLSX.
- ✅ Print CSS oculta sidebar `<aside>`, toggles, filtros, y el chart; muestra banner meta "Periodo: X → Y".

### Sesion 42 — 2026-04-18 — Finanzas P&L Fase 1 Pulso completa (5 sub-fases iterativas)

**Objetivo**: construir la portada financiera narrativa del módulo Finanzas rediseñado — `/finanzas/pulso` — como "cockpit" del fundador con respuesta en 2 segundos a "¿cómo estamos?". Fase 1 según roadmap `linear-pondering-lemur.md` y `PROPUESTA_PNL_REORG.md` §Fase 1 (semanas 3-4).

#### Commits a `main`

| Commit | Sub-fase | Qué |
|---|---|---|
| `ba21f24` | **1a** — Cash Runway hero + endpoint agregador | Crea `/api/finanzas/pulso` como agregador único que ejecuta las queries del pulso en paralelo (burn rate 30d, cash balance, revenue YTD, suscripciones mensuales) y devuelve JSON estructurado. Hero card con runway en meses + 4 estados (critical < 3m rojo / warn 3-6m amarillo / safe 6-12m verde / healthy 12m+ dorado). Progress bar + ticks en 3, 6, 12 meses. Usa `useCurrencyView` para respetar toggle tri-moneda. |
| `f39f786` | **1b** — Marketing Financiero (CAC vs LTV por canal) | Panel con CAC payback period + ratio LTV:CAC por canal (Meta Ads, Google Ads, ML Ads, organic). Health badges verde/amarillo/rojo por ratio (>3x healthy, 2-3x ok, <2x concern, <1x quemando plata). Pure function `src/lib/finanzas/marketing.ts` testable sin React. |
| `fda92f9` | **1c** — Sparkline 12m + costos YTD | Mini-chart revenue vs burn rate últimos 12 meses (SVG determinista, sin libraries). Barras de costos YTD separados en fijos/variables/marketing con % del total. Muestra tendencia de cash flow month-over-month. |
| `8c202ef` | **1d** — Narrativa determinista + alertas financieras | Rule engine 100% determinista (sin LLM) en `src/lib/finanzas/narrative.ts` que analiza los inputs (runway, tendencia, CAC payback, margins) y emite una narrativa de 3-4 líneas con tono adecuado por estado: `critical_burning` / `warning_decline` / `healthy_scale` / `healthy_steady`. Motor de alertas `src/lib/finanzas/alerts.ts` que dispara alertas accionables (ej: "CAC de Meta aumentó 34% vs mes pasado, revisar creatives"). Seed determinista `simpleHash(orgId + monthIso)` para rotación de variantes sin aleatoriedad. |
| `d6fb3f0` | **1e-migration** | Endpoint admin `/api/admin/migrate-cash-balance-override` con `CREATE TABLE IF NOT EXISTS` para `cash_balance_overrides` (organizationId, month YYYY-MM, amount DECIMAL(15,2), currency, note, createdAt, updatedAt; unique(organizationId, month); índice desc por organizationId+month). Protegido con `NEXTAUTH_SECRET`. **Pusheado primero y ejecutado por Tomy en prod ANTES del código que la usa**, respetando la regla de orden de migraciones de CLAUDE.md. |
| `bf03f86` | **1e-code** | Override manual del cash balance: endpoint `/api/finanzas/cash-balance/override` con GET/POST/DELETE usando `prisma.$queryRaw` / `$executeRaw` (sin tocar `schema.prisma` todavía — tabla en DB, código la consume por SQL raw con try/catch). Modal premium `CashBalanceOverride.tsx` con amount input + note textarea + live preview del impacto en runway + 3 acciones (guardar / cancelar / volver a automático). Botón "Ajustar saldo real" en `CashRunwayHero` ahora funcional (gold gradient) que abre el modal. Pulso recarga automáticamente tras guardar via `refreshTick`. Integración con Aurum bubble: `useAurumPageContext` publica snapshot completo (runway, sparkline12m, narrative, alerts, meta) con 4 suggestions contextuales — el bubble ahora entiende el estado financiero sin duplicar fetch. |

**Arquitectura Fase 1**:
- **Endpoint único**: `/api/finanzas/pulso` ejecuta ~8 queries en paralelo con `Promise.all` (respetando pool=8, max 3 parallel). Devuelve `PulsoPageData` (type en `src/types/finanzas.ts`).
- **Pure functions por dominio**: `src/lib/finanzas/runway.ts` (con soporte `manualOverride`), `marketing.ts`, `narrative.ts`, `alerts.ts`. Testables sin React.
- **Componentes cliente**: `CashRunwayHero`, `MarketingFinancialsCard`, `SparklineCard`, `CostsBarChart`, `NarrativeCard`, `FinancialAlertsCard`, `CashBalanceOverride` modal.
- **Página**: `src/app/(app)/finanzas/pulso/page.tsx` con loading/error states premium, refreshTick state para re-fetch tras override, useAurumPageContext wiring.
- **Sin JOIN a customers** desde orders (regla CLAUDE.md). Sin CAST(... AS int) sobre postalCode.

**Endpoints admin ejecutados en producción (Sesion 42)**:
- `/api/admin/migrate-cash-balance-override?key=<NEXTAUTH_SECRET>` — creó tabla `cash_balance_overrides` con unique + índice. ✅ Respuesta: `{"ok":true,"tables":["cash_balance_overrides"],"indexes":["cash_balance_overrides_org_month_key","cash_balance_overrides_org_month_desc_idx"]}`.

**Smoke tests prod (post-Fase 1e)**:
- `GET /api/finanzas/cash-balance/override` → HTTP 200 en 0.9s, `{"month":"2026-04","override":null}`.
- `GET /api/finanzas/pulso` → HTTP 200 en 0.9s, `runway.source="auto"`, `monthsRemaining=16.1`, `cashBalance=$1.495M ARS`, `status="safe"`, `narrative.rule="healthy_scale"`, 1 alert activa, YTD 2026-01-01 → 2026-04-18.

### Estado final en produccion al cierre de Sesion 42

- **Último commit en `main`**: `bf03f86`.
- **URL prod**: `https://nitrosales.vercel.app`.
- **Deploys Vercel**: todos verdes.
- **Finanzas P&L con 5 pestañas premium en producción**:
  - `/finanzas` → redirect automático a `/finanzas/pulso`.
  - `/finanzas/pulso` — **Fase 1 COMPLETA**: Cash Runway hero + override manual, Marketing Financiero por canal, Sparkline 12m, costos YTD, narrativa determinista, alertas financieras, Aurum contextual. Badge "Pulso · Fase 1e".
  - `/finanzas/estado` — P&L completo actual + toggle tri-currency (de Sesion 41).
  - `/finanzas/costos` — intacto.
  - `/finanzas/escenarios` — placeholder (Fase 4).
  - `/finanzas/fiscal` — placeholder (Fase 5).
- **1 tabla nueva en DB**: `cash_balance_overrides` (organizationId, month YYYY-MM, amount, currency, note + unique + índice desc). Global pero con organizationId — multi-tenant safe. **No está declarada en `schema.prisma` todavía** (se consume por SQL raw). Deuda técnica menor aceptada para Sesion 42; se puede modelar en Prisma en housekeeping futuro si se quiere.

### Decisiones arquitectonicas tomadas en Sesion 42

1. **Endpoint agregador único `/api/finanzas/pulso`** en vez de múltiples endpoints por componente: minimiza round-trips desde el cliente, simplifica loading/error states, facilita cache futuro.
2. **Narrativa 100% determinista (sin LLM)**: usar rule engine con seeded hash (`orgId + monthIso`) para rotación de variantes. Trade-off: menos flexible que un LLM, pero cero dependencia de red, cero costo, cero non-determinism, auditable. Si en el futuro se quiere variedad mayor, sumar capa LLM opt-in por encima.
3. **Override manual via SQL raw ($queryRaw / $executeRaw)**, sin tocar `schema.prisma`: respeta la regla de orden de migraciones (tabla primero en DB, luego código), con `try/catch` envolviendo el read para que el Pulso siga funcionando incluso si la migración no se corrió.
4. **Pusheo de 1e en 2 commits separados** (`1e-migration` sin código que la use → `1e-code` después de ejecutar): asegura que ningún deploy intermedio quede con código que referencia tabla inexistente.
5. **Integración Aurum via `useAurumPageContext`** (no fetch propio del bubble): el Pulso publica su snapshot JSON y Aurum lo consume. Evita duplicar queries entre página y bubble, mantiene single source of truth.
6. **Botón funcional "Ajustar saldo real"** en el hero (antes era disabled placeholder): cambia etiqueta a "Actualizar saldo" cuando `runway.source === "manual"`. Gold gradient consistente con módulo Finanzas.
7. **Todo directo en `main`** sin branches: los 6 commits respetan el modelo main-only de CLAUDE.md. Vercel deploya cada commit y valida en CI (sandbox local timeouts fueron bypaseados con confianza en `tsc --noEmit` passing).

### Pendientes / backlog de Sesion 42

- **Agregar modelo `CashBalanceOverride` a `schema.prisma`** (deuda técnica): la tabla existe en prod pero no está tipada en Prisma. Consumida por SQL raw. Housekeeping futuro.
- **Uso real del Pulso unos días**: verificar que la narrativa no se vuelva repetitiva, que el override se use como se esperaba, que falten KPIs o sobren distracciones.
- **Fase 2 Estado (waterfall hero + taxonomía pro de costos)**: próximo paso natural del roadmap (semanas 5-6 según PROPUESTA_PNL_REORG.md). Pendiente de plan detallado con sub-fases iterativas.
- **Fase 3 Costos pro (fijos/variables/%/driver)**: semanas 7-8.
- **Fase 4 Escenarios (forecast + simulación)**: semanas 9-11.
- **Fase 5 Fiscal enhanced + Bridge profundo Bondly/Campañas**: semana 12.
- **BP-001 pLTV rails de sanidad** (CRITICAL backlog, sin fecha todavía): fix del caso Ariel Lizárraga + rails duros + capa contextual Haiku + drift monitor + XGBoost. Tomy pidió entender en detalle antes de empezar.

---

## Actualizacion previa: 2026-04-18 madrugada (Sesion 41 — Backlog + sidebar reorg + Aurum fallback + Finanzas P&L Fase 0 completa con tri-currency toggle)

> Este bloque consolida los **11 commits** a `main` del 2026-04-17 (tarde y noche) hasta el 2026-04-18 madrugada, que redondean el backlog priorizado, reorganizan el sidebar a 8 tiers con vocabulario ecommerce, agregan fallback universal + fade-in a Aurum, y construyen la **Fase 0 completa del rediseño de Finanzas P&L** (5 pestañas premium + 2 crons nacionales FX/IPC + hook de conversión tri-moneda USD/ARS/ARS_ADJ con toggle premium cableado a las KPI cards de `/finanzas/estado`).

### Sesion 41 — 2026-04-17 tarde → 2026-04-18 madrugada — Backlog housekeeping + sidebar reorg + Aurum polish + Finanzas P&L Fase 0

**Objetivo**: cerrar housekeeping pendiente de Bondly (backlog priorizado escalado + sidebar reorganizado con lenguaje ecommerce + polish final de Aurum) y entregar la **Fase 0 del rediseño de Finanzas P&L** con foundations para tri-currency view (USD/ARS/ARS_ADJ) y datos nacionales FX+IPC en DB alimentados por crons diarios/mensuales, todo sin tocar el P&L actual.

#### 1. Backlog + sidebar + Aurum polish

| Commit | Qué |
|---|---|
| `07c2b00` | **Backlog**: BP-001 escalado a "Bondly — el producto de LTV más robusto del mercado" (no solo fix del pLTV sino plan de plataforma LTV premium). Agrega BP-005 "Mensajería multi-canal (WhatsApp/email/SMS) nativa" + BP-006 "Aura marketplace de afiliados" como pendientes estratégicos priorizados. |
| `b4131bc` | **Sidebar reorg a 8 tiers con vocabulario ecommerce**: ACTIVOS DIGITALES arriba (dominios/pixel/data), luego OPERACIÓN (órdenes/inventario/customers), GROWTH, FINANZAS, INTELIGENCIA, CONFIGURACIÓN. Nueva `PROPUESTA_SIDEBAR_REORG.md` con el racional completo. Orden + copy alineado a como piensa un fundador de ecommerce. |
| `d57065c` | **Aurum polish**: fallback universal para rutas sin contenido contextual específico (antes quedaban vacías) + botón flotante con fade-in `opacity 0→1` al cargar data para evitar pop-in. Comportamiento uniforme en todo el app. |

#### 2. Finanzas P&L — Fase 0 (foundations, sin tocar el P&L actual)

| Commit | Qué |
|---|---|
| `c278c47` | **Fase 0a — 5 pestañas premium**: `/finanzas` redirige a `/finanzas/pulso`. El P&L actual completo se movió **tal cual** (git rename, cero cambios funcionales) a `/finanzas/estado/page.tsx`. Layout compartido `/finanzas/layout.tsx` con tabs premium UI_VISION (gradient dorado activo, dot pulsante, prism delimiter, aurora radial, easing `cubic-bezier(0.16,1,0.3,1)`). Sub-rutas con placeholders elegantes: `/finanzas/pulso` (Fase 1), `/finanzas/escenarios` (Fase 4), `/finanzas/fiscal` (Fase 5). Sidebar muestra los 5 children. Aurum con fallbacks contextuales por pestaña. **Cero tabla de DB tocada, cero query cambiada.** |
| `9660a95` | **Fase 0b — endpoint admin `migrate-finanzas-fx-indices`**: crea 2 tablas **globales** (sin organizationId porque FX e IPC son nacionales): `ExchangeRateDaily` (oficial/MEP/CCL/blue, DECIMAL(12,4), unique por fecha) + `InflationIndexMonthly` (ipc% mensual + ipcAcumulado base 100, unique por mes). Patrón `CREATE TABLE IF NOT EXISTS` protegido con NEXTAUTH_SECRET. No toca schema Prisma todavía (ese es 0c.1, después de ejecutar). |
| `e140d3e` | **Fase 0c.1 — schema + 2 crons**: modelos Prisma `ExchangeRateDaily` + `InflationIndexMonthly`. Cron `/api/cron/exchange-rates` (15 UTC = 12 ART diario) con fetch paralelo a dolarapi.com (oficial/bolsa/CCL/blue) tolerante a fallas parciales. Cron `/api/cron/inflation-index` (13 UTC = 10 ART día 16 mensual) con fetch a argentinadatos.com (serie INDEC) + cálculo iterativo de `ipcAcumulado` base 100. Ambos idempotentes, auth via SYNC_KEY. `vercel.json` actualizado con los 2 schedules. |
| `13ce791` | **Fase 0c.2 — hook + toggle premium**: endpoint `/api/finanzas/fx-ipc` sirve la última FX + todo el IPC listo para el cliente. Hook `/src/hooks/useCurrencyView` con persistencia en localStorage (`nitrosales.finanzas.currencyView`), cache global del payload (10 min TTL) para evitar refetch, event bus de listeners para sincronizar entre instancias. Funciones `convert(amountARS, dateOfAmount)` + `format(value)`. **3 modos**: USD (default MEP) / ARS nominal / ARS ajustado a hoy. **4 fuentes USD**: oficial / MEP / CCL / blue. Componente `/components/finanzas/CurrencyToggle` pill premium dorado con sub-pills cuando USD, caption con la cotización activa y fecha. Montado al tope de `/finanzas/estado`. En este commit es **solo visual + persistencia** — la conversión efectiva se cablea en 0c.4. |
| `2f8e7b4` | **Fase 0c.3 hotfix — rebase IPC a 2017-01-01**: el seed del cron IPC tiró **539 errores `numeric field overflow`** en `ipcAcumulado` DECIMAL(12,4). Causa: la serie INDEC arranca en 1943 y la hiperinflación 1975-1991 llevó el índice acumulado a 3.55e18 para 2026 (tope DECIMAL(12,4) = 10^8). Fix: filtrar serie desde **2017-01-01** (post-normalización INDEC). `ipcAcumulado` 2017-2026 ronda 10-20M, holgado. Data práctica para un negocio post-2023 (nadie ajusta ticket 2026 contra precios de 1950). Cleanup automático al inicio del cron borra cualquier mes `< baseDate` de corridas previas fallidas. Idempotente: re-correr limpia y re-popula coherente. **Sin migración de schema.** |
| `de981ff` | **Fase 0c.4 — cablear KPI cards al hook**: bug reportado — el toggle aparecía pero los números no cambiaban al switchear (era puramente cosmético). Fix: importar `useCurrencyView` en `/finanzas/estado/page.tsx`, llamarlo en cada subvista (`ExecutiveView` + `DetailedView`), crear helper local `fm(v,d) = format(convert(v,d))`, reemplazar las ~30 llamadas `formatARS(x)` por `fm(x)` (replace_all seguro). Los YAxis `tickFormatter` wrappean con `convert(v)` antes del `formatCompact`. Arquitectura multi-instancia: `useCurrencyView()` se llama en 3 lugares (ExecutiveView, DetailedView, CurrencyToggle); el hook tiene cache modular + event bus (`listeners` Set) + `notifyAll()` que sincroniza toggle entre las 3 instancias. Limitaciones conocidas aceptables para el primer cut: tooltips de charts no pasan fecha del punto (muestra nominal en ARS_ADJ); `bySource` usa el modo actual sin date. |
| `5189b27` | **Fase 0c.5 — midDate a sub-views**: bug — `USD ↔ ARS` andaba, pero `ARS_ADJ` no cambiaba los números. Causa: `fm()` no le pasaba fecha a `convert()`, y en modo ARS_ADJ sin `dateOfAmount` el hook hace early return sin ajuste. Fix: `FinanzasPage` calcula `midDate = punto medio entre dateFrom y dateTo` y lo pasa como prop a `ExecutiveView` + `DetailedView`. `fm()` de cada sub-view usa `midDate` como fallback cuando el caller no pasa fecha: `format(convert(v, d ?? midDate))`. Con esto, al mover el toggle a "ARS ajustado" los números se inflan por factor IPC acumulado del mes central del periodo (~1-2% arriba del nominal para 30 días con inflación mensual 3.4%). |
| `8c997b5` | **Fase 0c.6 — fix ARS_ADJ con rangos recientes**: 2 bugs adicionales tras 0c.5. **(1) Fallback silencioso**: si el mes del monto no estaba en `ipcByMonth` (ej: abril 2026 con último cron hasta marzo), `convert()` retornaba el nominal. Ahora cae al mes disponible más cercano hacia atrás (`allKeys.filter(k => k <= monthKey).pop()`). **(2) IPC "actual" = último mes publicado**: para un monto del último mes el factor quedaba 1.0 (sin ajuste visible). Ahora `ipcToday` se extrapola desde el último mes prorrateando la inflación mensual por días transcurridos: `extraFactor = 1 + (lastIpcMensual/100) × (daysSince / daysInCurMonth)`. Con esto, un monto del 1 de abril 2026 (hoy 17/abr, último IPC marzo con 3.4%) ve factor ~1.019 en vez de ~1.0. |

**Endpoints admin ejecutados en producción (Sesion 41):**
- `/api/admin/migrate-finanzas-fx-indices?key=<NEXTAUTH_SECRET>` — creó las 2 tablas globales FX + IPC. ✅
- `/api/cron/exchange-rates` — seed inicial FX (oficial/MEP/CCL/blue para el día). ✅
- `/api/cron/inflation-index` — seed post-hotfix 0c.3 con serie INDEC desde 2017-01. ✅

**Crons programados (nuevos en `vercel.json`):**
- `exchange-rates`: diario 15:00 UTC (12:00 ART).
- `inflation-index`: mensual día 16 a las 13:00 UTC (10:00 ART).

### Estado final en produccion al cierre de Sesion 41

- **Último commit en `main`**: `8c997b5`.
- **URL prod**: `https://nitrosales.vercel.app`.
- **Deploys Vercel**: todos verdes.
- **Finanzas P&L con 5 pestañas premium en producción**:
  - `/finanzas` → redirect automático a `/finanzas/pulso`.
  - `/finanzas/pulso` — placeholder (Fase 1).
  - `/finanzas/estado` — **P&L completo actual funcionando** + toggle tri-currency premium (USD/ARS/ARS_ADJ con 4 fuentes USD) cableado a todos los KPI cards + ejes de charts. Persistencia en localStorage.
  - `/finanzas/costos` — intacto (pre-existía).
  - `/finanzas/escenarios` — placeholder (Fase 4).
  - `/finanzas/fiscal` — placeholder (Fase 5).
- **2 tablas nuevas globales en DB** (sin organizationId — FX e IPC son nacionales):
  - `ExchangeRateDaily`: oficial/MEP/CCL/blue, DECIMAL(12,4), unique por fecha, alimentada diaria 12 ART.
  - `InflationIndexMonthly`: IPC mensual + ipcAcumulado base 100 desde 2017-01-01, unique por mes, alimentada mensual día 16 10 ART.
- **Sidebar reorganizado a 8 tiers** con vocabulario ecommerce (ACTIVOS DIGITALES → OPERACIÓN → GROWTH → FINANZAS → INTELIGENCIA → CONFIGURACIÓN).
- **Aurum FloatingAurum** con fallback universal para rutas sin contenido contextual + fade-in al cargar data.
- **Backlog actualizado** (`BACKLOG_PENDIENTES.md`): BP-001 escalado a plataforma LTV más robusta del mercado; BP-005 mensajería multi-canal; BP-006 Aura marketplace de afiliados.

### Decisiones arquitectonicas tomadas en Sesion 41

1. **Git rename para mover el P&L actual a `/finanzas/estado`**: cero cambios de contenido (byte-por-byte), git diff muestra rename puro. Garantiza zero-risk en el primer paso del rediseño.
2. **FX + IPC como tablas globales sin organizationId**: son datos nacionales compartidos por todos los tenants. Un solo fetch alimenta a todo el multi-tenant.
3. **2 crons separados con cadencias distintas** (FX diario 12 ART, IPC mensual día 16 10 ART): FX cambia todos los días; IPC se publica una vez al mes por INDEC. Idempotentes para re-corrida segura.
4. **Rebase IPC a 2017-01-01 en vez de escalar DECIMAL**: DECIMAL(12,4) alcanza para la serie post-hiperinflación. La data práctica para un negocio ecommerce post-2023 arranca en 2017. Evita migración de schema.
5. **Extrapolación IPC de hoy por prorrateo diario de la inflación del último mes**: permite ver ajuste visible (~1-2%) en montos recientes del mes actual, sin esperar la publicación mensual de INDEC.
6. **Hook multi-instancia con cache módulo-level + event bus**: `useCurrencyView()` se llama 3+ veces en la misma página sin refetch ni desincronización. Patrón reutilizable.
7. **`midDate` como fallback de fecha en `fm()`**: cuando el caller no tiene una fecha específica por dato (KPIs agregados de un rango), usar el punto medio del rango en ARS_ADJ da un ajuste razonable y consistente entre KPI cards.
8. **Fase 0 es puramente foundations**: 0 cambios en queries/calculations del P&L actual. El P&L sigue siendo el mismo código, solo vive en `/finanzas/estado` y ahora está envuelto por un toggle de vista.

### Pendientes / backlog de Sesion 41

- **Fase 1 Pulso**: portada narrativa de `/finanzas/pulso` con insights y visualizaciones de alto nivel (pendiente de diseño/plan).
- **Tooltips de charts en ARS_ADJ**: pasar la fecha del punto al `convert()` para que el ajuste sea por mes exacto y no por `midDate`. Refinable pre-convirtiendo `dailyTrend` antes del `AreaChart`.
- **`bySource` revenue en ARS_ADJ**: hoy usa el modo actual sin date, ajusta al valor nominal del breakdown (no al mes de venta individual).
- **Fase 2 Costos Premium / Fase 3 Reconstrucción P&L / Fase 4 Escenarios / Fase 5 Fiscal**: pendientes de plan detallado.
- **Tomy verifica** el toggle ARS_ADJ con rango 30 días y rango largo (6-12 meses) para confirmar que los números cambian y el ajuste es razonable tras 0c.6.

---

## Actualizacion previa: 2026-04-17 madrugada (Sesiones 37-40 — Módulo Bondly completo: unificación + Pulse + Señales + Customer 360 + pixel linking + LTV rediseño premium de 8 commits)

> Este bloque consolida los **26 commits** a `main` entre el 2026-04-16 00:58 y el 2026-04-17 02:46 que construyen el módulo **Bondly** de cero a producción completa, y rematan con el rediseño premium de la sección LTV (triple capa: histórico / predicho post-compra / behavioral pre-compra).

### Sesion 37 — 2026-04-16 madrugada — Módulo Bondly: unificación + Pulse + Señales + Customer 360

**Objetivo**: unificar Clientes + LTV + Audiencias en un módulo nuevo llamado **Bondly**, con pulso en vivo, módulo de señales (Moments + Live Feed) y Customer 360.

| Commit | Qué |
|---|---|
| `7349481` | **Fase 1 Bondly**: unificar Clientes + LTV + Audiencias en un módulo. Estructura de navegación y páginas base. |
| `e484438` | **Pulse banner** en `/bondly` con 2 timelines LIVE (commerce + NitroPixel). |
| `5a499c8` | Fix: excluir MercadoLibre del timeline commerce de Pulse. |
| `3725e94` | Fix: eliminar MELI de todo el módulo Bondly. **Bondly es VTEX-only** (Aura cubre creators, Bondly cubre customer intelligence VTEX). |
| `f0d35f1` | **Fase 2 Bondly/Señales**: módulo Señales con Moments + Live Feed. |
| `631e113` | **Fase 3 Bondly/Clientes**: Customer 360 con lista enriquecida + ficha detalle. |
| `aa8d898` | Fix: sidebar sub-items de Bondly + error 500 en `/bondly/clientes`. |

### Sesion 38 — 2026-04-16 tarde — Timeline y 3-way identity en ficha del cliente

**Objetivo**: que la timeline de cada cliente en Customer 360 muestre info real y dedupeada, resolviendo 3-way identity (customerId OR email).

| Commit | Qué |
|---|---|
| `4dac1f2` | Fix: resolver pixel data con 3-way identity (customerId OR email). |
| `ed955a5` | Feat: timeline con títulos humanos en vez de URL cruda. |
| `d57b2de` | Feat: mapear tipos reales de eventos + deduplicar timeline. |
| `a68ca32` | Fix: dedupe timeline robusto por URL normalizada + ventana de 3 min. |

### Sesion 39 — 2026-04-16 noche — Anónimos + linking visitor-customer + backfill

**Objetivo**: mostrar visitantes anónimos en la lista, linkear visitors de NitroPixel con customers nuevos en tiempo real (via webhook VTEX), backfill de la relación para data pre-existente.

| Commit | Qué |
|---|---|
| `c04dec6` | Feat: anónimos en la lista `/bondly/clientes` + filtro por período. |
| `6bbea18` | Feat: utilidades `link-visitor` + pre-pixel (sin side-effects todavía). |
| `84509af` | **Endpoint admin**: `/api/admin/backfill-visitor-customer-link` + ajuste de match. |
| `c3c9750` | Feat: hook `linkVisitorToCustomer` en webhook VTEX tras customer upsert. |
| `b553dce` | Fix: anti-dupe en anonymousQuery via `NOT EXISTS`. |
| `934461b` | Feat: badge "Pre-pixel" en timeline de órdenes (para órdenes anteriores al deploy del pixel). |
| `ca18a28` | Feat: paginación numerada en `/bondly/clientes` + fix bug que traía toda la lista. |

**Endpoints admin ejecutados en producción (Sesion 39):**
- `backfill-visitor-customer-link`: linkea visitantes pixel con customers pre-existentes por email. ✅

### Sesion 40 — 2026-04-17 madrugada — Bondly LTV rediseño premium (8 commits)

**Objetivo**: rediseñar `/bondly/ltv` para que sea "el producto de LTV más robusto del ecommerce argentino". **Triple capa** (histórico / predicho post-compra con BG/NBD + Gamma-Gamma de Fader & Hardie / behavioral pre-compra desde NitroPixel) + Insights Engine + Churn Risk Scoreboard + Customer Journey drawer + Product Affinity Matrix + Top clientes tier-aware. **Sin tocar schema ni BG/NBD.**

| Commit | Qué |
|---|---|
| `fc94ab3` | **Commit 1**: extract shared Bondly primitives — constants (colors, `BONDLY_GRAD`, `GOLD_GRAD`, `VIP_GRAD`, easing `ES = cubic-bezier(0.16,1,0.3,1)`), `KpiTile` con count-up animado, `BondlyKeyframes` global. |
| `5553a43` | **Commit 2**: backend LTV expandido +5 queries (`deciles`, `sparkline12m`, `cohortRevenueCumulative`, `productAffinity`, `periodChanges` expandido). Respeta `§REGLA #3b`: pool ≤ 3 paralelas, sin JOIN a customers desde orders, sin CAST riesgoso. |
| `1e7a80c` | **Commit 3**: behavioral LTV engine + customer journey timeline. Endpoints: `/api/bondly/behavioral-ltv` (scoring 0-100 desde NitroPixel) + `/api/bondly/customer-journey/:id`. **READ-ONLY** sobre NitroPixel. |
| `dccf1e0` | **Commit 4**: insights engine + churn risk. Endpoints: `/api/bondly/ltv-insights` (5 detectores: canal tóxico, sweet spot, cohorte estrella, visitantes VIP, whales en riesgo) + `/api/bondly/churn-risk` (scoring 0-100 con tiers crítico/alto/medio/bajo, cutoffs 75/55/30). |
| `0723af3` | **Commit 5**: UI rewrite — hero premium con aurora `BONDLY_GRAD` + 7 `KpiTile` animados (3 capas de LTV: histórico/predicho/behavioral + 4 secundarios: LTV:CAC, recompra 30d, mediana, concentración Pareto con alerta ≥60%) + panel pLTV con **Trust Strip** "Compatible con Meta · Google · Basado en investigación de Wharton" + intervalos P10/P50/P90. |
| `e7db3a3` | **Commit 6**: 4 secciones nuevas inline — Insights Engine cards (3 accionables), Behavioral LTV Explorer (filtros anónimos/identificados/clientes), Customer Journey Drawer expandible por cliente, Deciles + Pareto visualization. |
| `757eda8` | **Commit 7**: Product Affinity Matrix (cross-sell categoría→categoría con gradient emerald por intensidad de LTV), Churn Risk Scoreboard (dark panel con rose accents, tier badges, CTA "Ver journey"), Top Clientes tier-aware (VIP/GOLD/BRONZE para top 3 + columna Journey). |
| `a7e73ed` | **Commit 8**: columna "Acción" en tabla de canales — CTAs tier-aware por LTV:CAC. LTV:CAC ≥ 3 → "Escalar inversión" (verde, linkea `/campaigns/meta` o `/campaigns/google`); < 1 → "Revisar audiencia" (rojo); repeat rate > 40% → "Crear lookalike" (indigo, disabled con tooltip "Próximamente"). |

**Nuevos endpoints API agregados en producción (Sesion 40):**
- `/api/bondly/behavioral-ltv` — scoring behavioral 0-100 desde NitroPixel (READ-ONLY).
- `/api/bondly/customer-journey/:id` — timeline unificado commerce + pixel + email.
- `/api/bondly/ltv-insights` — 5 detectores de insights rule-based sobre la data de LTV.
- `/api/bondly/churn-risk` — scoring de churn con tiers + razones humanas por cliente.
- `/api/metrics/ltv` expandido con `deciles`, `sparkline12m`, `cohortRevenueCumulative`, `productAffinity`, `periodChanges`.

**Cero migraciones de DB en la Sesion 40.** El rediseño entero NO tocó `schema.prisma` ni agregó tablas. Todo es lectura sobre datos existentes. Respeta el compromiso explícito pre-sesión.

### Estado final en produccion al cierre de Sesion 40

- **Ultimo commit en main**: `a7e73ed`.
- **URL prod**: `https://nitrosales.vercel.app`.
- **Deploys Vercel**: todos verdes.
- **Módulo Bondly completo en producción**:
  - `/bondly` — overview con Pulse banner (2 timelines LIVE commerce + pixel).
  - `/bondly/clientes` — Customer 360 con anónimos + paginación + 3-way identity + filtro por período.
  - `/bondly/clientes/:id` — ficha con timeline de eventos + ventas unificados (pixel + commerce).
  - `/bondly/ltv` — **rediseño premium**: hero con 7 KPI + pLTV con Trust Strip + Insights + Behavioral Explorer + Journey drawer + Deciles + Affinity Matrix + Churn Scoreboard + Top tier-aware + canales con CTAs.
  - `/bondly/senales` — Moments + Live Feed.
  - `/bondly/audiencias` — base sin contenido todavía (próxima sección del rediseño Bondly).
- **Bondly es VTEX-only**: MELI excluido explícitamente de todo el módulo.
- **Pixel linking activo**: el webhook VTEX auto-linkea visitors con customers al upsert. Backfill histórico ejecutado.

### Decisiones arquitectonicas tomadas en Sesion 40 (rediseño LTV)

1. **Triple capa de LTV** (histórico / predicho post-compra con BG/NBD / behavioral pre-compra desde pixel): cada capa con método propio, número propio y UI propia. No mezclar en un solo número compuesto.
2. **BG/NBD + Gamma-Gamma intacto** en `/api/ltv/predict`: el modelo matemático no se tocó en el rediseño. (Ver `BACKLOG_PENDIENTES.md` → "pLTV predictivo: piso de antigüedad + cap sanidad + IA contextual" para el fix pendiente.)
3. **Trust Strip honesto** ("Compatible con" en vez de "Validado por"): mostrar integraciones reales + fuente académica, sin prometer validación que no existe.
4. **Customer Journey Drawer** como overlay en vez de pantalla nueva: mantiene contexto del ranking (churn + top clientes). Accesible desde múltiples lugares.
5. **Disabled CTAs con tooltip "Próximamente"** para features del roadmap no implementadas (Crear audiencia, Crear lookalike, Activar retargeting): transparencia > falsa promesa.
6. **Pool ≤ 3 queries paralelas** + sin JOIN customers desde orders + sin CAST riesgoso (§REGLA #3b): protege la página en blanco.
7. **@ts-nocheck en `/bondly/ltv/page.tsx`**: pragma pre-existente respetado. No se refactorizó a tipado estricto para no bloquear la iteración rápida.

### Pendientes / backlog (ver `BACKLOG_PENDIENTES.md` para tracking detallado)

- **[CRÍTICO] pLTV predictivo — credibilidad**: clientes con T<30 días reciben predicciones absurdas (ej: 2 compras en 4 días → pLTV 365d = $4,8M con 54% confianza). Fix Fase 1 priorizado: hard rules + cap de sanidad + piso de antigüedad. Expansión Fase 2: capa contextual LLM + señales macro. Detalles completos en `BACKLOG_PENDIENTES.md`.
- `/bondly/audiencias` sin contenido todavía — próxima sección del rediseño Bondly.
- Row expansions en tabla de cohortes de LTV (click en mes → drill de clientes del cohorte).
- Feed de Behavioral Explorer podría pasar a cursor pagination si la tabla crece.

---

## Actualizacion previa: 2026-04-15 (Sesiones 31-36 — Módulo Aura completo: Inicio → Creadores → Campañas → Contenido → Pagos → Deals reestructuración)

> Este bloque consolida los 34 commits a `main` del 15-abr (tarde/noche) que construyen el módulo Aura creator economy de cero a producción completa. Sesiones anteriores (23-30) documentadas más abajo.

### Sesion 31 — 2026-04-15 tarde — Aura Inicio: las 7 zonas

**Objetivo**: construir `/aura/inicio` como dashboard principal del módulo creator economy, con 7 zonas bien definidas.

| Commit | Qué |
|---|---|
| `2c68abe` | **Zona 1**: saludo personalizado + pulso Aurum + selector de periodo (7d/30d/90d). |
| `60a0bc8` | **Zona 2**: hero metrics (revenue, órdenes, comisiones, AOV, creadores activos) + fix margen blanco. |
| `52b3064` | **Zona 3**: Hall of Flame — podio top 3 creadores como trading cards con halo + sparkles. |
| `55a9f55` | **Zona 4**: bandeja de acciones pendientes (apps por revisar, contenido por aprobar, campañas por cerrar, creadores silenciados). |
| `7054b2f` | **Zona 5**: campañas en vuelo — flight deck con barra de progreso vs bonus y ETA de cierre. |
| `ed4c027` | **Zona 6**: content radar — plataformas activas + top piezas por engagement + UGC reciente. |
| `0bf9e12` | **Zona 7**: insights rápidos — 4 insights rule-based (top creator, mejor campaña, contenido viral, alerta). |
| `60dd592` | Unificar color system a monochrome champagne (antes había mezcla de tonos). |

### Sesion 32 — 2026-04-15 tarde — Aura Creadores + Campañas + sistema visual Creator Gradient

**Objetivo**: módulos CRUD completos de creadores y campañas + definir el sistema visual de Aura.

| Commit | Qué |
|---|---|
| `f458005` | **Creadores completo**: lista con cards + perfil individual + pipeline de aplicaciones (PENDING→APPROVED→REJECTED). APIs: `/api/aura/creators`, `/api/aura/applications`. |
| `e1b3497` | Página `/paletas` para comparar 4 direcciones visuales (Tomy eligió Creator Gradient). |
| `7b5ab4f` | **Creator Gradient** (#ff0080 → #a855f7 → #00d4ff) aplicado a Inicio + Creadores como sistema visual oficial de Aura. |
| `60644c5` | **Campañas completo**: lista + crear + detalle. APIs: `/api/aura/campaigns`. 3 pantallas con Creator Gradient. |

### Sesion 33 — 2026-04-15 noche — Sidebar Aura + Contenido + fixes visuales

**Objetivo**: integrar Aura en el sidebar con sub-rutas agrupadas + módulo de contenido.

| Commit | Qué |
|---|---|
| `8852f1d` | Sub-rutas de Aura en sidebar (Inicio, Creadores, Aplicaciones, Campañas, Nueva). |
| `2a212c7` | Fix: sub-items de Aura no heredaban el estilo magenta/purple del parent premium. |
| `ff85c75` | Fix: botones primarios de creadores eran blanco sobre blanco → aplicar gradient. |
| `71b5cfb` | Fix: halo del header más suave, link de venta con dominio correcto del store, botón dashboard del creador. |
| `d582c50` | **Contenido completo**: módulo briefings (crear/gestionar) + aprobaciones de contenido. |
| `7a6518e` | Mini-headers en sidebar para agrupar sub-rutas (CREADORES / CAMPAÑAS / CONTENIDO / PAGOS). |
| `97d411e` | Fix: doble selección en sidebar — match más específico gana sobre match parcial. |
| `abca17c` | Sidebar Aura: estilo holográfico premium + copy "Tu nuevo canal de ventas." |

### Sesion 34 — 2026-04-15 noche — Pagos v1 + Dashboard público del creador + Ventana de atribución

**Objetivo**: sistema de compensación multi-modelo + dashboard público mejorado + configuración de atribución.

| Commit | Qué |
|---|---|
| `1c8d116` | **Pagos v1**: deals (7 tipos: COMMISSION, FLAT_FEE, PERFORMANCE_BONUS, TIERED_COMMISSION, CPM, GIFTING, HYBRID) + payouts multi-estado. Schema: `influencer_deals` + `payouts`. |
| `35f89a0` | Dashboard del creador con Creator Gradient + Deals UI + auto-cálculo de comisiones según tipo de deal. |
| `30a0fec` | Ver y enviar por mail la contraseña del dashboard público del creador. |
| `abf0c05` | Mover acceso/contraseña del creador a la página de detalle (no en lista). |
| `8d42bd6` | **Ventana de atribución personalizable por creador** (1-180 días, default 14). Campo `attributionWindowDays` en schema + API PATCH. |
| `de889d0` | Ventana de atribución visible en card del creador + KPIs en detalle. |
| `26a8740` | Fix imagen de producto en dashboard público: fallback + upgrade a HTTPS. |

### Sesion 35 — 2026-04-15 noche — Deals como entidad central de campañas (reestructuración arquitectónica)

**Objetivo**: reestructurar la arquitectura para que deals vivan DENTRO de campañas (no como sección separada). Campaña "Always On" auto-creada al aprobar creador. Regla de unicidad de comisión.

| Commit | Qué |
|---|---|
| `12badf7` | Integrar Deals en perfil del creador (inline en campaigns, no sección propia). |
| `56319a7` | Approval + deal unificado: al aprobar un creador, se crea el deal automáticamente dentro de la aprobación. |
| `ba0fa79` | Dashboard público adaptado al tipo de deal (muestra info relevante según COMMISSION/FLAT_FEE/etc). |
| `7ef49f1` | **Reestructuración central**: deals → campañas como entidad central. Eliminar sección Deals del perfil del creador. Campaña "Always On" + deal base al aprobar. Toggle `excludeFromCommission`. Validación de unicidad de comisión (solo 1 deal tipo COMMISSION/TIERED/HYBRID activo por creador). Schema: `isAlwaysOn` en campaigns, `excludeFromCommission` en deals. |

### Sesion 36 — 2026-04-15 noche — Fix migración DB + backfill Always On + cleanup sidebar

**Objetivo**: arreglar error de producción (columnas nuevas no existían en DB) + crear campañas Always On para creadores existentes + limpiar sidebar legacy.

| Commit | Qué |
|---|---|
| `ce92b83` | **Fix urgente**: desactivar columnas `isAlwaysOn`/`excludeFromCommission` en queries (no existían en DB). Crear endpoint `/api/admin/migrate-aura-columns` para aplicar migración. |
| `46218b5` | Reactivar columnas post-migración + endpoint `/api/admin/backfill-always-on` que crea campañas Always On + deal base para creadores activos existentes. |
| `11897a8` | Eliminar secciones legacy "Influencers" y "Contenido" del sidebar (todo vive dentro de Aura ahora). |

**Migraciones ejecutadas en producción:**
- `migrate-aura-columns`: `ALTER TABLE influencer_campaigns ADD COLUMN IF NOT EXISTS "isAlwaysOn"` + `ALTER TABLE influencer_deals ADD COLUMN IF NOT EXISTS "excludeFromCommission"`. ✅
- `backfill-always-on`: creó campañas Always On + deal de comisión para todos los creadores activos sin una. ✅

### Estado final en produccion al cierre de Sesion 36

- **Ultimo commit en main**: `11897a8`.
- **URL prod**: `https://nitrosales.vercel.app`.
- **Deploys Vercel**: todos verdes.
- **Módulo Aura completo en producción**:
  - `/aura/inicio` — dashboard con 7 zonas (saludo, métricas, Hall of Flame, acciones, campañas en vuelo, content radar, insights).
  - `/aura/creadores` — lista + perfil individual con deals inline en campaigns, ventana de atribución, dashboard público.
  - `/aura/creadores/aplicaciones` — pipeline de aplicaciones (PENDING→APPROVED→REJECTED) con creación de campaña Always On + deal al aprobar.
  - `/aura/campanas` — lista + crear campaña con deal integrado (7 tipos) + validación unicidad de comisión.
  - `/aura/contenido` — overview + briefings + aprobaciones.
  - `/aura/deals` — ahora redirige conceptualmente a campañas (deals viven dentro de campañas).
  - `/aura/pagos` — gestión de payouts multi-estado.
- **Sistema visual**: Creator Gradient (#ff0080 → #a855f7 → #00d4ff).
- **Sidebar**: limpio, sin secciones legacy. Aura con sub-rutas agrupadas por mini-headers.
- **Modelo de datos Aura**:
  - Creator → Campaign(s) → Deal(s) → Attribution(s) → Payout(s)
  - Cada creador tiene 1 campaña "Always On" (isAlwaysOn=true) con deal base.
  - Solo 1 deal de tipo comisión activo por creador (COMMISSION/TIERED_COMMISSION/HYBRID).
  - Toggle `excludeFromCommission` en deals no-comisión para evitar doble pago con UTM.

### Decisiones arquitectonicas tomadas en estas sesiones

1. **Deals dentro de campañas** (S35): no como sección separada. Simplifica la UI y la jerarquía de datos.
2. **Always On automática** (S35): al aprobar creador, se crea campaña Always On + deal base. Toda acción con creadores debe tener campaña.
3. **Unicidad de comisión** (S35): solo 1 deal de tipo comisión activo por creador. Evita ambigüedad de atribución UTM.
4. **Migración via endpoints admin** (S36): pattern confirmado: SQL idempotente en endpoint protegido con NEXTAUTH_SECRET, no `prisma db push` en build.
5. **Creator Gradient** (S32): sistema visual oficial de Aura (#ff0080 → #a855f7 → #00d4ff).
6. **Sidebar limpio** (S36): secciones legacy eliminadas. Todo creator economy vive dentro de Aura.

### Pendientes / backlog

- `/aura/deals` como página standalone podría eliminarse o redirigir a `/aura/campanas` ya que deals ahora viven dentro de campañas.
- Dashboard público del creador: podría mostrar info del deal Always On de forma más prominente.
- Las páginas legacy `/influencers/*` siguen existiendo como rutas (aunque no están en el sidebar). Evaluar si eliminarlas o mantenerlas como redirect.

---

## Actualizacion previa: 2026-04-15 (Sesiones 23-30 — Creativos Lab + Google/Meta rebuild + SEO premium + Aurum flotante global)

> Este bloque consolida TODOS los deploys desde el 14-abr tarde hasta el 15-abr (recien). 47 commits a `main` agrupados por sesion/alcance. Documentacion escrita en Sesion 30.

### Sesion 23 — 2026-04-14 tarde/noche — Creativos Lab Phase B1 (endpoints + video fix)

**Objetivo**: arreglar que los videos de Meta no se veian ni reproducian en `/campaigns/creatives` + capa de endpoints para alimentar el Lab jerarquico.

| Commit | Qué |
|---|---|
| `88c91c3` | Endpoints nuevos: `/api/media/proxy` (thumbnails anti-CORS), `/api/media/video/[creativeId]` (streaming lazy), `/api/metrics/ads/structure` (jerarquia Meta Campaign->AdSet->Ad + Google por tipo). Filtro `adSet` en `/api/metrics/ads`. |
| `42e0c02` | Fix videos no se reproducian: UI intentaba reproducir sin `videoUrl` resuelto. |
| `b508d45` | Video resolver con permalink fallback + HD poster via `thumbnails{}` + diag cuando Meta niega `source_url`. |
| `62ad20d` | Permalink fallback SIEMPRE disponible (no solo cuando falla source) → embed de video de Facebook como backup confiable. |
| `14daa52` | Video resolver usa `META_PAGE_ACCESS_TOKEN` (no user token) para leer `video_source.source_url` — es el unico token que Meta acepta para ese campo. |
| `2d0c288` | Fix: `effective_object_story_id` NO se puede pedir en fields del `/ads` endpoint; solo vive en `/adcreatives`. Movido al sub-request correcto. |
| `ae72069` | Poster HD via `thumbnails{uri,is_preferred}` en vez de `thumbnail_url` single. UI de error state mejor (placeholder con mensaje). |
| `df1a28c` | `isVideo` ahora usa `c.type === 'VIDEO'` en vez de inferir desde `videoPlays > 0` (ads nuevos pueden ser video sin plays todavia). |
| `d6b683f` | Null-check de `videoPlays` en metricas — `isVideo=true` no implica `videoPlays` numerico. |
| `bd34efb` | Resolver de imagen on-demand + UI "Catalogo Dinamico" como vista por default para creatives con assets sin thumbnails cacheados. |

### Sesion 24 — 2026-04-14 noche — Creativos Lab Phase B2 (drilldown Campaign->AdSet->Ad)

**Objetivo**: agregar drilldown jerarquico al Lab + Google split por tipo de campaña.

| Commit | Qué |
|---|---|
| `615aee4` | **Phase B2**: toggle "Galeria / Drilldown" + navegacion Campaign → AdSet → Ad (L1 → L2 → L3) en Meta. Google queda split por tipo (Search / Shopping / PMax / Display / Video). |
| `1108c6d` | Fix Postgres strict: `mediaUrls`, `type` y `name` debian ir en el `GROUP BY` del structure endpoint. |
| `8d4eb54` | Fix crash del drilldown: import `ChevronRight` de `lucide-react` faltaba. |
| `165bfbd` | L2 (AdSet detail) con fetch dedicado de creativos por `adSetId` — no depender de filtros de la galeria general. |
| `84a625a` | L2 muestra TODOS los creativos del adSet (incluso sin spend). Antes filtraba por spend > 0 y dejaba adsets vacios. |
| `4ff2d51` | Endpoint dedicado `/api/metrics/ads/by-adset` que devuelve todos los creatives de un adset sin filtros. |
| `f5609b1` | Fix build: import correcto de `prisma` y `getOrganizationId` en `/by-adset` (habian quedado mal). |
| `abdd9d2` | Fallback: L2 usa `galleryCreatives.filter(adSetId)` si `/by-adset` devuelve vacio — nunca quedar sin nada. |
| `6697e57` | Debug: fallback via `AdSet` lookup por `id` o `externalId` + logging detallado cuando L2 venga vacio. |
| `470ce10` | Fix: Prisma `groupBy` requiere `orderBy` si se usa `_count` — agregado. |
| `e694d0b` | L2 fallback: si `adSetId` no matchea (PMax / null en Google), usar creativos de la **campana padre**. |
| `50c97d9` | Fix duplicacion: no usar fallback de campaña cuando hay multiples adsets — duplicaba creativos entre adsets. |
| `188749a` | **ROOT CAUSE L2 vacio**: el sync de Meta no linkeaba `AdCreative -> AdSet`. Fix en `/api/sync/meta`: resolver `adSetId` desde `ad.adset_id` al upsertear el AdCreative. |

### Sesion 25 — 2026-04-14 noche — Intento de crons para ads-sync (REVERTIDO)

| Commit | Qué |
|---|---|
| `ea230cc` | Feat: crons multi-tenant (horario para Meta, diario para Google) que llamaban `/api/sync/meta` y `/api/sync/google` para todas las orgs activas. |
| `743ab9d` | **Revert**: volver al modelo on-demand. Razon: con la escala actual (1 org activa) los crons eran overkill y consumian API quota sin beneficio. On-demand al abrir `/campaigns/*` + `useSyncStatus` sigue siendo mejor. |

> **Decision arquitectonica**: Meta/Google Ads se syncan on-demand por ahora. Volver a crons solo cuando haya multi-tenant real o el usuario necesite datos frescos sin abrir la pagina.

### Sesion 26 — 2026-04-15 mañana — Google Creativos rediseño premium + datos rich

| Commit | Qué |
|---|---|
| `3aa9309` | Panel izquierdo rico para Google Search y PMax en Creativos Lab (headlines, descriptions, extensions, final URL, paths). |
| `3f018ca` | Self-heal de la columna `metadata` en google-sync: si la migracion no corrio, el sync crea la columna idempotentemente (evita fallas silenciosas). |
| `4b313f8` | Capa de datos rich para creativos Google: `metadata` JSONB con `headlines[]`, `descriptions[]`, `paths[]`, `finalUrl`, `extensions{}` persistidos por creative. |
| `6366884` | Rediseño premium del tab "Creativos" por tipo de campaña: Search SERP-style mock, Shopping cards, PMax asset groups, Display/Video placeholders. |
| `48f7ba1` | Fix TDZ: `useEffect` referenciaba `fetchData` antes de su declaracion → `ReferenceError` en mount. Reordenado. |
| `fda03f8` | Fix UI: los KPIs de PMax hacian wrap del valor cuando era grande → `whitespace-nowrap` + `font-size: 15px`. |

### Sesion 27 — 2026-04-15 mañana — Meta subsection + Overview rebuild + revert

| Commit | Qué |
|---|---|
| `011e7dd` | Rebuild premium `/campaigns/google` con arquitectura por tipo (mismo approach del Lab). |
| `e347936` | Rebuild de la subsection Meta y del Overview de `/campaigns` desde cero — version nueva con cards y jerarquia distinta. |
| `4e43d4f` | **Revert overview**: Tomy rechazo la nueva version del Overview: _"restauralo tal cual estaba"_. Meta subsection se mantuvo; overview vuelve al diseño previo. |

> **Leccion**: no reescribir secciones enteras sin pedido explicito, aunque "parezca una mejora". Ver ERRORES_CLAUDE_NO_REPETIR #S27-REBUILD.

### Sesion 28 — 2026-04-15 — Fix scroll /sinapsis

| Commit | Qué |
|---|---|
| `e5be3a7` | `/sinapsis` no permitia scroll — `overflow: hidden` heredado del layout. Fix puntual. |

### Sesion 29 — 2026-04-15 — SEO rebuild premium + AurumSectionCard in-page

| Commit | Qué |
|---|---|
| `e371f60` | `/seo` rebuild premium: headers educativos explicando que significa cada metrica, tipografia y spacing mas generoso, breakdown del health score visible. |
| `79ae0cc` | Coaches accionables en cada seccion (Health, Opportunities, Movers, Keywords, Pages, Cannibalization, Device) + breakdown de los 4 componentes del health score. |
| `c3e568f` | Reemplazar los `CoachCards` estaticos por `AurumSectionCard` — card embebida que llama a `/api/aurum/section-insight` con el contexto de esa tab y renderiza la respuesta de Aurum. |
| `b7e965b` | `AurumSectionCard` con chat contenido adentro + header explicativo (no todo inline en la card, mejor UX). |
| `9359f88` | `AurumSectionCard` minimizable — pill dorada premium colapsada, expand al click. |
| `4d8b6fd` | Tablas de Keywords y Pages: compactas con scroll interno + sticky header. |
| `4dc6bc4` | Aurum tambien en las tablas Keywords y Pages (coach para listas, no solo para overview). |

### Sesion 30 — 2026-04-15 (hoy) — Aurum flotante global + orb Saturno + fallback pathname

**Objetivo**: reemplazar las 7 `AurumSectionCard` inline del `/seo` por una unica burbuja flotante contextual disponible en toda la app.

| Commit | Qué |
|---|---|
| `fde10e1` | **Burbuja flotante premium global**: `FloatingAurum` component + `AurumContext` (provider + hook `useAurumPageContext`). Bubble bottom-right en todas las rutas de `(app)` (excepto `/chat` y `/login`). Panel con insight inicial auto-generado + chat contextual. `/seo` migrado: 7 secciones ahora publican contextData unico via `useAurumPageContext`. AurumSectionCard y AurumOrbMini quedan como dead code (no removido todavia). |
| `fdb56e9` | **Orb dorado con anillo Saturno** en todos los tamaños (tiny 16px y completo 64px). Variante elegida de 4 (Saturno / Atomo / Ondas / Arco) presentadas en `aurum-orb-variants.html`. Intensidad: sutil pero siempre presente. |
| `af396ff` | Fix halo de la burbuja: reemplazar div blur por `box-shadow` (siempre circular, sin artifacts rectangulares) + `overflow: hidden` para contener el glow interno del orb. Sidebar actualizado con el nuevo `<AurumOrb size={26} />`. |
| `51765d3` | **Fix 3D del anillo Saturno**: el anillo se dividio en 2 mitades via `clip-path`. Back half (`z=0`, detras del orb), orb (`z=1`), front half (`z=2`, delante del orb). Ahora el anillo PASA por detras de la esfera en la mitad de atras — oclusion 3D correcta. |
| `6e45d53` | **Fallback de contexto por pathname**: mapa de ~30 rutas en `FloatingAurum` que sintetiza `{section, contextLabel, suggestions}` cuando la pagina no publica nada via `useAurumPageContext`. Ahora Aurum se puede usar en toda la app (Dashboard, Orders, Products, Rentabilidad, Finanzas, Campaigns, Customers, ML, Competitors, Influencers, Pixel, Alertas, Sinapsis, Memory, Boveda, Settings). Paginas con datos ricos (SEO) siguen publicando contextData especifico que pisa el fallback. |

### Estado final en produccion al cierre de Sesion 30

- **Ultimo commit en main**: `6e45d53`.
- **URL prod**: `https://nitrosales.vercel.app`.
- **Deploys Vercel**: todos verdes.
- **Feature flagship nuevo**: FloatingAurum disponible en toda la app con fallback + contexto rico en SEO.
- **Dead code pendiente de cleanup** (opcional, no urgente):
  - `AurumSectionCard` y `AurumOrbMini` en `src/app/(app)/seo/page.tsx` — ya no se usan, quedaron como funciones sin invocacion.

### Decisiones arquitectonicas tomadas en estas sesiones

1. **Ads-sync: on-demand > crons** (S25 revert). Volver a crons solo si hay multi-tenant real o necesidad de data fresca sin abrir la pagina.
2. **Overview /campaigns: no reescribir** (S27 revert). Cambios estructurales no pedidos requieren aprobacion explicita antes.
3. **Imagenes: fix en ingesta, no backfills** (S22 precedente, ratificado). Cualquier dato faltante se arregla en el webhook/sync, no con endpoints de backfill.
4. **Aurum ubiquity**: burbuja global con fallback por pathname, upgrade progresivo con `useAurumPageContext` cuando la pagina tenga datos analizables.
5. **Ring 3D via clip-path**: patron visual para elementos que deben "abrazar" otros elementos en 2D CSS (back half z=0, objeto z=1, front half z=2).

---

## Ultima actualizacion previa: 2026-04-14 (Sesion 22 — Stock Muerto + Alerta Quiebre premium light + fix imageUrl en webhook VTEX)

**Ultimo cambio:**
1. En `/rentabilidad` (products/page.tsx), rediseño de las tablas "Alerta de Quiebre de Stock" y "Stock Muerto":
   - Tema **LIGHT** (blanco/gris) — Tomy rechazó la primera iteración oscura: "para analizar datos me gusta siempre claro".
   - Iconos de alerta animados tipo premium (`animate-ping`): ámbar para Quiebre, rose para Muerto.
   - **Scroll interno** con sticky header (`max-h-[420px]` Quiebre, `max-h-[480px]` Muerto) para evitar tablas infinitas.
   - Titulo truncado (`line-clamp-2`), columna **Costo** nueva, **Valor** muestra precio unitario + total, **imágenes clickeables** (abren modal de zoom).
   - Filtros matching: search, brand, category, sort (incluye costo), pagination.
   - **Alerta de Quiebre nueva lógica**: velocity ≥ 0.2 uds/día + (stock=0 vendido en últimos 30 días O stock>0 con <14 días de cobertura). Antes era "stock=0" a secas.

2. **Fix de imageUrl en webhook de órdenes VTEX** (`src/app/api/webhooks/vtex/orders/route.ts`):
   - **Root cause**: VTEX a veces NO incluye `imageUrl` en el payload de órdenes. El código creaba productos con `imageUrl: null` que quedaban así para siempre.
   - **Fix**: antes del upsert, chequea si el producto existe y tiene imagen. Si no, llama al catalog API (`/api/catalog_system/pvt/sku/stockkeepingunitbyid/{id}`) para traer la imagen real. Así capturamos la imagen en la fuente, sin backfills.
   - Deploy: commit `96c5b6e` en main.
   - **Decisión arquitectónica de Tomy**: "No quiero resolverlo con syncs, me parece inescalable. Las imágenes tienen que tomarse bien de la plataforma." → rechazó endpoint de backfill; el fix debe estar en la ingesta.

Archivos tocados: `src/app/(app)/products/page.tsx`, `src/app/api/webhooks/vtex/orders/route.ts`, `src/app/api/metrics/products/route.ts` (Query 8 y 9 de Sesion 22 ya existentes), ProductImage component.

---

## Ultima actualizacion previa: 2026-04-14 (Sesion 21 — Resumen cockpit + Break-even ROAS en /campaigns, Meta y Google)

**Ultimo cambio:** `/campaigns` redisenado como "Resumen · Marketing & Adquisicion" con banner de salud (Blended ROAS VTEX vs Break-even), 8 KPIs, bloque "Plataformas vs Realidad", chart diario con linea BE. Meta y Google Overview tienen chip de salud + subtitle BE en el KPI "ROAS". Scope VTEX-only: MELI queda aparte como organico no atribuible.

Archivos nuevos: `src/lib/hooks/useBreakeven.ts`, `src/components/campaigns/BreakevenChip.tsx`. Ver **`NOTA_SESION_21_CAMPAIGNS_PHASE1.md`** para detalles.

Fase 2 pausada a pedido del usuario (demo cliente). Tracks pendientes: (A) Creativos Lab, (B) Google split por tipo, (C) Meta Placements+Audiencias.

---

## Ultima actualizacion previa: 2026-04-14 (Sesion 20 — categoryPath + consolidacion multi-canal por SKU + tablas compactas en /rentabilidad)

---

## ð¨ð¨ð¨ ACCIONES PROHIBIDAS â LEER ANTES QUE NADA ð¨ð¨ð¨

**ESTAS ACCIONES ESTÃN TERMINANTEMENTE PROHIBIDAS. Si el resumen de contexto, un plan anterior, o cualquier otra fuente sugiere hacerlas, IGNORAR COMPLETAMENTE.**

### PROHIBIDO #1: Deployar "API v3" o "page v4" o cualquier archivo desde la carpeta local NitroSales IA/
- Los archivos api-metrics-products-route-v3.ts, products-page-v10.tsx, page_v4.tsx, etc. en la carpeta local son BORRADORES VIEJOS
- La producciÃ³n YA tiene todo implementado y funcionando
- **NUNCA** leer estos archivos locales para "deployar" o "pushear" a GitHub
- **NUNCA** crear commits que reemplacen archivos de producciÃ³n con versiones locales

### PROHIBIDO #2: Re-implementar Tendencias de Venta, Stock Inteligente o Margenes
- Tendencias de Venta: YA ESTÃ EN PRODUCCIÃN dentro de products/page.tsx v10.1
- Stock Inteligente: YA ESTÃ EN PRODUCCIÃN dentro de products/page.tsx v10.1
- Margenes (IVA fix, cross-filtering, markup, column selector, catalogo): YA ESTA EN PRODUCCION dentro de products/page.tsx v11
- Los tabs Overview, Tendencias, Stock Inteligente, Margenes: YA FUNCIONAN
- **NUNCA** intentar "agregar" estos features â ya existen

### PROHIBIDO #3: Reemplazar archivos enteros en producciÃ³n
- **NUNCA** hacer PUT de un archivo completo a GitHub sin que el usuario lo pida explÃ­citamente
- Solo hacer cambios QUIRÃRGICOS (edits puntuales, no rewrite total)
- Si necesitÃ¡s cambiar algo, primero leer el archivo actual de GitHub, luego hacer el edit mÃ­nimo

### PROHIBIDO #4: Actuar por iniciativa propia sin instrucciÃ³n del usuario
- **NUNCA** empezar a deployar, crear archivos, o pushear cÃ³digo sin que el usuario lo pida
- Si la sesiÃ³n arranca desde un resumen de contexto, PREGUNTAR al usuario quÃ© quiere hacer
- El resumen de contexto puede contener informaciÃ³n desactualizada o mal interpretada

---

## REGLAS CRÃTICAS

1. **NO retroceder versiones** â Cada archivo tiene una versiÃ³n actual que NO debe revertirse.
2. **NO tocar archivos que no estÃ©n explÃ­citamente mencionados** en la tarea actual.
3. **Cambios QUIRÃRGICOS solamente** â No reescribir archivos enteros si solo se necesita un cambio puntual.
4. **LEER este archivo ANTES de cualquier modificaciÃ³n**.
5. **ACTUALIZAR este archivo** despuÃ©s de cada cambio exitoso.
6. **PREGUNTAR al usuario** antes de cualquier deploy o push a producciÃ³n.

---

## ARCHIVOS CRÃTICOS â VERSIONES ACTUALES

### FRONTEND (Visual)

| Archivo | VersiÃ³n | Estado | Notas |
|---------|---------|--------|-------|
| src/app/(app)/products/page.tsx | **v11** | ACTIVO | 4 tabs (Overview + Tendencias + Stock Inteligente + Margenes). Tab Margenes: KPIs, distribucion, brand/category tables con cross-filtering, markup %, catalog completo con column selector, inline filters, CSV export. IVA fix aplicado. 1865 lineas. |
| src/app/(app)/dashboard/page.tsx | **v3** | ACTIVO | **Sesion 15 (2026-04-08)** — Overhaul completo. Sistema de slots por filas (`layout.rows[].slots[]`), 5 row templates (kpi-6 / kpi-3 / trio-md / chart-duo / chart-full) que suman 6 cols cada uno, 5 slot sizes (xs/sm/md/lg/xl) c/familia de formats permitida. Widgets multi-formato (kpi, big-number, sparkline, mini-line, mini-bar, list, donut, area-full, bar-full). Drag & drop de filas con drop indicator + titulo inline opcional por row. Template picker modal con mini-preview + slot widget picker filtrado por `allowedFormats`. **3-tier backward compat**: layout v3 → widgets v2 (derivados) → default layout. Dual persistence (layout + derived widgets) para rollback safety. Hero + DashboardTodayBlock + DashboardChartCard + WidgetFormats integrados. Replace button en edit mode sobre cada widget. Fix critical: `setCatalogOpen(false)` → `setTemplatePickerOpen(false); setSlotPickerOpen(null);`. |
| src/app/(app)/orders/page.tsx | **v2** | ACTIVO | **Sesion 17**: 3-layer resilience (Error Boundary + safeQuery + Suspense). Grafico ventas diarias con lineas VTEX/MELI en vista Todos. CohortsCard movido al fondo. RefreshCw retry button en estados de error/loading. ~1400 lineas. |
| src/app/(app)/orders/error.tsx | **v1** | ACTIVO | **Sesion 17**: Next.js Error Boundary para orders. Muestra "Recargar seccion" en vez de pantalla en blanco. |
| src/app/(app)/finanzas/page.tsx | **v3** | ACTIVO | P&L dual view (Ejecutivo/Detallado). InfoTips explicativos. Health semaphore. Payment fees, IVA, discounts. |
| src/app/(app)/finanzas/costos/page.tsx | **v1** | ACTIVO | 1532 lineas. 8 categorias costos, perfil fiscal, tarifas envio, constancia AFIP import. |
| src/app/(app)/analytics/page.tsx | **v3** | ACTIVO | **Sesion 18**: Rewrite completo. 7 zonas: KPI Strip, Channel Truth Table + ROAS, Attribution Indicator (read-only, respeta config NitroPixel), Channel Role Map (descubrimiento/asistencia/cierre), Funnel + Journeys (10, static widths), Revenue Intelligence (truth vs channels toggle), Conversion Speed (lag buckets), Devices (PieChart) + Top Paginas (visitantes unicos, sin checkout, slugs prettified), Pixel Coverage Timeline (AreaChart + ReferenceLine 80%). ~1300 lineas. Payment gateway filter (gocuotas etc). Try-catch por zona. |
| src/app/(app)/pixel/page.tsx | **v2** | ACTIVO | PeriodSelector integrado (2026-04-01). |
| src/app/(app)/mercadolibre/page.tsx | **v2** | ACTIVO | PeriodSelector integrado (2026-04-01). |
| src/app/(app)/seo/page.tsx | **v3** | ACTIVO | PeriodSelector + audit fixes (country translations). |
| src/components/PeriodSelector.tsx | **v1** | ACTIVO | Componente reutilizable. Quick ranges + Hoy/Ayer + custom date. |
| src/components/dashboard/DateRangeFilter.tsx | **v2** | ACTIVO | Usado en finanzas. Quick ranges + date inputs. |
| src/components/dashboard/DashboardHero.tsx | **v1** | NEW (S15) | Hero header del dashboard con nombre del org, greeting dinamico, period selector integrado. Sesion 15. |
| src/components/dashboard/DashboardTodayBlock.tsx | **v1** | NEW (S15) | Bloque "Lo que importa hoy" — KPIs destacados + alertas contextuales. Sesion 15. |
| src/components/dashboard/DashboardChartCard.tsx | **v1** | NEW (S15) | Wrapper para charts full-width (area-full, bar-full). Maneja responsive + skeleton. Sesion 15. |
| src/components/dashboard/DashboardSparkline.tsx | **v1** | NEW (S15) | Sparkline minimalista para slots sm/md (formats sparkline, mini-line, mini-bar). Sesion 15. |
| src/components/dashboard/DashboardStyles.tsx | **v1** | NEW (S15) | CSS-in-JS centralizado del dashboard: `.dash-card`, `.dash-stagger`, `.dash-filter-popover`, `.dash-filter-backdrop`, `.dash-filter-segmented`, etc. Sesion 15 ab5f504: `.dash-filter-popover` cambiado de `position: absolute` a `position: fixed` + z-index 70 para soportar el portal. Mobile media query preservada con `!important`. |
| src/components/dashboard/WidgetFormats.tsx | **v1** | NEW (S15) | Dispatcher visual por format (kpi, big-number, sparkline, mini-line, mini-bar, list, donut). Cada format es un subcomponente self-contained con su propio loading/error/empty state. |
| src/components/dashboard/WidgetFilterPopover.tsx | **v2** | ACTIVO | **Sesion 15 ab5f504** — Refactorizado a React Portal con fixed positioning. `createPortal(..., document.body)` + `getBoundingClientRect()` + auto-flip si overflow. Reposiciona en scroll/resize via listeners. Soluciona clipping/stacking context bug donde el popover quedaba tapado por rows adyacentes. Mobile sigue siendo bottom-sheet. |
| src/components/dashboard/WidgetFilterChips.tsx | **v1** | NEW (S15) | Chips inline que muestran los filtros activos de cada card con boton X para clear individual. |

### BACKEND (APIs)

| Archivo | VersiÃ³n | Estado | Notas |
|---------|---------|--------|-------|
| src/app/api/metrics/products/route.ts | **v2** | ACTIVO | IVA fix: revenueNeto = revenue / 1.21, avgPriceNeto. Margen y markup calculados sin IVA. marginAnalysis con byBrand, byCategory, distribution, top/bottom. |
| src/app/api/metrics/top/route.ts | **v1** | NEW (S15) | Top-N endpoint generico para widgets `list`. Soporta query params para metric/dimension. Usado por widgets multi-formato del dashboard. |
| src/app/api/metrics/distribution/route.ts | **v1** | NEW (S15) | Distribution endpoint para widgets `donut`. Devuelve slices por categoria/brand/canal. Usado por widgets multi-formato del dashboard. |
| src/app/api/dashboard/preferences/route.ts | **v2** | ACTIVO | **Sesion 15** — Soporta schema v3 `layout.rows[].slots[]` ademas del v2 legacy (widgets array). Fix TS: `data: { settings: newSettings as any }` para el tipo Prisma JsonValue. Persistencia dual (layout + widgets derivados) como rollback safety. |
| src/lib/dashboard/slot-layout.ts | **v1** | NEW (S15) | Definiciones del sistema de slots: `SLOT_SIZES` (xs/sm/md/lg/xl con colSpan y allowedFormats), `ROW_TEMPLATES` (5 templates que suman 6 cols), types `Layout`/`LayoutRow`/`LayoutSlot`, helpers para crear rows/slots por defecto. Fuente unica de verdad del layout engine. |
| src/lib/dashboard/format-config.ts | **v1** | NEW (S15) | Catalogo de widget formats con `FormatDef` (id, label, icon, defaultEndpoint, allowedSlotSizes). Define los 9 formats (kpi, big-number, sparkline, mini-line, mini-bar, list, donut, area-full, bar-full). |
| src/lib/dashboard/filter-config.ts | **v1** | NEW (S15) | Pool de filtros por `SectionKey` (orders, products, customers, ads, etc.). Helpers `getApplicableFilters`, `countActiveFilters`. Cada widget declara su section y hereda los filtros aplicables. Tipos: `FilterDef`, `SectionKey`. |
| src/hooks/useAnimatedValue.ts | **v1** | NEW (S15) | Hook de easing (cubic-bezier) para animar cambios numericos en KPIs. Usado por WidgetFormats. |
| src/app/api/fix-brands/route.ts | **v5** | â OPERATIVO | Mejoras incrementales OK. BrandIdâBrandName 2-step, CategoryIdâCategoryName, acciones: stats/test/test-category/fix-vtex/fix-categories/deduplicate/debug. |
| src/app/api/backfill/vtex/route.ts | **v1** | â ESTABLE | **NO TOCAR.** Backfill original con credenciales hardcodeadas. |

### MERCADOLIBRE (Seller Integration)

| Archivo | Version | Estado | Notas |
|---------|---------|--------|-------|
| src/lib/connectors/mercadolibre-seller.ts | **v2** | ACTIVO | READ-ONLY connector. Token auto-refresh. Pagination fixes applied. |
| src/lib/connectors/ml-notification-processor.ts | **v1** | ACTIVO | Async webhook processor. 5 topic handlers. |
| src/app/api/webhooks/mercadolibre/route.ts | **v1** | ACTIVO | Webhook endpoint. Responds <500ms. |
| src/app/api/cron/ml-sync/route.ts | **v1** | ACTIVO | Cron backup each 4h. missed_feeds + reputation. maxDuration=800 via vercel.json. |
| src/app/api/sync/mercadolibre/backfill/route.ts | **v1** | ACTIVO | Chunked backfill. Weekly orders. maxDuration=800 via vercel.json. TESTEADO: 123.9s OK. |

### SEO (Google Search Console)

| Archivo | Version | Estado | Notas |
|---------|---------|--------|-------|
| src/lib/connectors/gsc.ts | **v1** | ACTIVO | JWT auth con SA de GA4. Paginacion 25K rows. |
| src/app/api/sync/gsc/route.ts | **v1** | ACTIVO | Cron sync dia-por-dia. maxDuration=800. |
| src/app/api/metrics/seo/route.ts | **v2** | ACTIVO | 14 queries paralelas. Opportunities, movers, cannibalization. |
| src/app/(app)/seo/page.tsx | **v3** | ACTIVO | 5 tabs + PeriodSelector + country translations. Commits 2600e73, b42e533. |

### FINANZAS (P&L + Costos Operativos) — NUEVO 2026-04-02

| Archivo | Version | Estado | Notas |
|---------|---------|--------|-------|
| src/app/(app)/finanzas/page.tsx | **v3** | ACTIVO | P&L dual view (Ejecutivo/Detallado). InfoTip tooltips. Health semaphore. Payment fees, IVA RI, discounts, channel breakdown. |
| src/app/(app)/finanzas/costos/page.tsx | **v1** | ACTIVO | 1532 lineas. 8 categorias: LOGISTICA, EQUIPO, PLATAFORMAS, FISCAL, INFRAESTRUCTURA, MARKETING, MERMA, OTROS. Tarifas envio. Perfil fiscal. Constancia AFIP PDF. |
| src/app/api/metrics/pnl/route.ts | **v3** | ACTIVO | P&L completo con: source breakdown (MELI/VTEX), payment fees por metodo, IVA debito fiscal para RI, descuentos, manual costs por categoria, platform config. 284+ lineas nuevas. |
| src/app/api/finance/manual-costs/route.ts | **v1** | ACTIVO | CRUD costos manuales. GET (by month+category), POST (create), PUT (update), DELETE. |
| src/app/api/finance/fiscal-profile/route.ts | **v1** | ACTIVO | GET/POST perfil fiscal (condicion IVA, IIBB, jurisdiccion, CUIT). Auto-genera impuestos argentinos. |
| src/app/api/finance/fiscal-profile/parse-constancia/route.ts | **v1** | ACTIVO | Parsea PDF de constancia AFIP para auto-fill fiscal profile. Usa pdf-parse. |
| src/app/api/finance/auto-costs/route.ts | **v1** | ACTIVO | Calcula costos automaticos: comisiones ML (del revenue MELI real) y merma (del revenue total). |
| src/app/api/finance/platform-config/route.ts | **v1** | ACTIVO | GET/POST config de plataformas: comision VTEX %, fees medios de pago (tarjeta, debito, MP, transferencia). |
| src/app/api/finance/shipping-rates/route.ts | **v1** | ACTIVO | CRUD tarifas de envio por carrier+servicio+CP. |
| src/app/api/finance/shipping-rates/import/route.ts | **v1** | ACTIVO | Import masivo de tarifas desde Excel (.xlsx). Usa exceljs. |
| src/app/api/finance/shipping-rates/template/route.ts | **v1** | ACTIVO | Genera template Excel para importar tarifas. |
| src/app/api/finance/shipping-rates/calculate/route.ts | **v1** | ACTIVO | Calcula costo de envio dado carrier+service+CP. |
| src/app/api/finance/shipping-rates/carriers/route.ts | **v1** | ACTIVO | Lista carriers y servicios disponibles. |
| src/app/api/sync/cost-prices/route.ts | **v2** | ACTIVO | Sync precios de costo desde VTEX. Usa Pricing API (primary) + Catalog API (fallback). Fix critico: Pricing API tiene el costPrice, Catalog NO. |

### LTV & PREDICCION (Lifetime Value) — ACTUALIZADO 2026-04-03

| Archivo | Version | Estado | Notas |
|---------|---------|--------|-------|
| src/app/(app)/customers/ltv/page.tsx | **v3** | ACTIVO | Dashboard LTV + seccion pLTV con hero credibilidad (BG/NBD, Meta/Google badges, pipeline NitroPixel). Umbrales configurables con auto-sugerencia por percentiles. Top 20 con customer detail expandible. Nota "Sin datos" para clientes pre-NitroPixel. |
| src/app/api/metrics/ltv/route.ts | **v2** | ACTIVO | 7 queries paralelas: summary, prev period, by channel, cohort retention, repurchase, ad spend, top customers. MELI_EXCLUDE en todas las queries. |
| src/app/api/ltv/predict/route.ts | **v2** | ACTIVO | GET: predicciones + resumen + customer details en top 20. POST: batch prediction con umbrales de org settings. maxDuration=60. |
| src/app/api/ltv/customer-detail/route.ts | **v1** | ACTIVO | GET: historial de ordenes de un cliente + detalles de prediccion. Product names via JOIN a products table. |
| src/app/api/settings/ltv/route.ts | **v1** | ACTIVO | GET: umbrales actuales + auto-sugeridos (p50/p90 redondeados a 5K). PUT: valida y guarda umbrales. Min 100 clientes para sugerencias. |
| src/lib/ltv/prediction-engine.ts | **v3** | ACTIVO | Motor con 3 guardrails: (1) min 30 dias para personal_history, (2) freq cap 1/7 dia, (3) prediction cap 3x gasto real. Metodo cohort_boosted para 2+ ordenes con <30 dias. |
| src/lib/ltv/send-meta.ts | **v1** | DESACTIVADO | Envia predicted_ltv a Meta CAPI. Triple candado: LTV_SEND_ENABLED env var + confidence >= 0.5 + flag sentToMeta por cliente. NO ACTIVAR sin aprobacion de Tomy. |
| src/lib/ltv/send-google.ts | **v1** | DESACTIVADO | Envia RESTATEMENT a Google Ads ConversionAdjustmentUploadService. Triple candado identico al de Meta. Ventana de ajuste: 55 dias. NO ACTIVAR sin aprobacion de Tomy. |

### INFRAESTRUCTURA

| Archivo | VersiÃ³n | Estado | Notas |
|---------|---------|--------|-------|
| package.json | **v3** | ACTIVO | Build: `prisma generate && next build`. Sesion 11: Sentry y Axiom instalados pero REVERTIDOS por performance issues. No contienen @sentry/nextjs ni next-axiom. |
| src/lib/vtex-credentials.ts | **v1** | NEW | Centralized VTEX credential access (DB > env vars) |
| src/lib/crypto.ts | **v1** | NEW | AES-256-GCM credential encryption |
| src/lib/auth-guard.ts | **v1** | NEW | Org resolution from NextAuth session |
| src/lib/db/client.ts | **v1.1** | â ESTABLE | **NO TOCAR.** Prisma client singleton. Import: @/lib/db/client. Sesion 10: removido connection_limit=5 y pool_timeout=10 (causaban pool exhaustion). Sesion 11: removed &connection_limit=1 y &pool_timeout=30 de DATABASE_URL (no eran causa raiz). NUNCA agregar connection_limit al DATABASE_URL. |
| prisma/schema.prisma | **v6** | ACTIVO | Sesion 12: +BotMemory model (id, organizationId, type, priority, content, source, timestamps). Sesion 13: +AurumUsageLog model (15 cols, 4 indices) para telemetria de Aurum reasoning modes. Tabla SQL: bot_memories (creada manual en S12), aurum_usage_logs (creada con prisma db execute en S13 sobre preview Y production Neon). |
| vercel.json | **v2** | ACTIVO | functions maxDuration=800 para sync/** y cron/**. 9 crons configurados. Sesion 11: "regions": ["gru1"] agregado para mantener funciones en São Paulo (match con DB). Sesion 17: crons Meta/Google eliminados, VTEX/ML/chain reducidos a 1x/dia. |
| src/app/api/sync/inventory/route.ts | **v4.1** | ACTIVO | Sesion 17: browser navigation guard (sec-fetch-dest/mode). Si un navegador intenta abrir la URL, redirige al dashboard. Logging temporal de caller info. |
| src/app/api/sync/chain/route.ts | **v1.1** | ACTIVO | Sesion 17: browser navigation guard. Redirige a / si detecta navegador. |
| src/app/api/sync/route.ts | **v1.1** | ACTIVO | Sesion 17: browser navigation guard. Redirige a / si detecta navegador. |
| src/app/(app)/layout.tsx | **v6** | ACTIVO | Sesion 12: Aurum movido a HERRAMIENTAS como card gold con animaciones globales (aurumShimmer, aurumOrbit, aurumBreath, aurumFloat, aurumFadeUp, aurumPulseRing). Sub-items expandibles Chat/Sinapsis/Boveda/Memory. Fix S12: position: relative en Link del sidebar (commit 09d69e7) para que el indicador absolute no escape como rectangulo negro. Sesion 13: `<main>` condicional segun si la ruta esta en aurumRoutes — Aurum routes = full-bleed dark, resto = padding + bg claro. NO TOCAR el bloque de animaciones ni el position: relative del Link. |
| src/lib/intelligence/tools.ts | **v1** | NEW (S12) | Definiciones de las 12 tools de Intelligence Engine v2 (Aurum). 190 lineas. NO TOCAR sin entender el flujo de tool calling de Anthropic SDK. |
| src/lib/intelligence/handlers.ts | **v1** | NEW (S12) | Implementacion de cada tool (handlers que ejecutan las queries reales contra Prisma). 1124 lineas. Sesion 13: TS errors limpiados (Decimal vs number en spend, conversionValue, totalSpent, etc.). |
| src/app/api/chat/route.ts | **v3** | ACTIVO | Sesion 12: refactor a tool calling architecture. Sesion 13: agregada seleccion de modelo segun reasoning mode (Flash=Haiku, Core=Sonnet, Deep=Opus) + telemetria fire-and-forget a aurum_usage_logs. System prompt dinamico desde Organization.settings.businessContext. |
| src/app/api/onboarding/route.ts | **v2** | ACTIVO (S13) | GET y POST. Sesion 13 fix CRITICO: query directa adicional a prisma.organization.findUnique({ select: { settings: true } }) porque getOrganization() solo devuelve id/name/slug. Sin esto el wizard reaparecia en cada refresh y los POST pisaban el campo settings. NO REMOVER esa query. |
| src/app/api/aurum/context-autodetect/route.ts | **v1** | NEW (S13) | Auto-detect de campos del onboarding desde data existente del org. NO calcula antiguedad por ultima venta (esta mal — el usuario lo aclaro explicitamente). 191 lineas. |
| src/app/api/admin/usage/route.ts | **v1** | NEW (S13) | Dashboard API con secret key (`usage-2026` hardcoded — pendiente mover a env var). Devuelve breakdown agregado de aurum_usage_logs. 179 lineas. |
| src/app/admin/usage/page.tsx | **v1** | NEW (S13) | Dashboard visual `/admin/usage?key=usage-2026`. 468 lineas. |
| src/app/(app)/chat/page.tsx | **v4** | ACTIVO | Sesion 12: rediseño dark gold + thinking animations + onboarding wizard 6 pasos. Sesion 13: selector de reasoning mode (Flash/Core/Deep), welcome screen rediseñada (halo, badge, gradient headline, CyclingHeadline, suggestion cards), aurumCanvas SIN margin negativo (eliminado en S13 — se rompia en desktop). |
| src/app/(app)/sinapsis/page.tsx | **v1** | NEW (S12) | Pagina visual de relaciones/memoria del bot. 1229 lineas (en main al merge). Sesion 13: agregado ProfileChip subcomponent con datos del onboarding. |
| src/app/(app)/boveda/page.tsx | **v1** | NEW (S12) | Placeholder para vault de insights. 132 lineas. |
| src/app/(app)/memory/page.tsx | **v2** | ACTIVO | Refactor en S12 — gran parte de la logica delegada a Sinapsis. |
| src/app/api/memory/route.ts | **v1** | NEW (S12) | CRUD de BotMemory (GET, POST). REQUIERE authOptions en getServerSession. |
| src/app/api/memory/[id]/route.ts | **v1** | NEW (S12) | PATCH/DELETE individual. REQUIERE authOptions. |
| src/app/api/memory/seed/route.ts | **v1** | NEW (S12) | Seed inicial de 5 reglas business generales. |
| prisma/migrations/aurum_usage_log.sql | **v1** | NEW (S13) | Migration idempotente: CREATE TABLE IF NOT EXISTS + 3 CREATE INDEX IF NOT EXISTS. Aplicada manualmente con prisma db execute en preview Y production Neon. |
| src/app/api/setup/ensure-indexes/route.ts | **v1** | CRITICO (S9, re-ejecutado S14) | POST endpoint con secret key. Crea 6 indices criticos: idx_orders_org_status_date, idx_oi_order_product, idx_cust_org_first_order, idx_adm_org_plat_date, idx_acmd_org_date, idx_pattr_org_model_created. **OBLIGATORIO ejecutar despues de cualquier migracion de DB o branch nuevo de Neon.** Ver PREVENCION #11. |
| src/app/api/metrics/orders/route.ts | **v3.1** | ACTIVO | Sesion 14: agregado `export const maxDuration = 60;` (red de seguridad). 14 queries en paralelo. La causa raiz del problema reportado en S14 fueron indices faltantes en Neon, no maxDuration. NO TOCAR. |
| src/app/api/metrics/products/route.ts | **v2.1** | ACTIVO | Sesion 14: agregado `export const maxDuration = 60;` (red de seguridad). NO TOCAR. |
| middleware.ts | â | Sin cambios | No modificado por Claude |

---

## FUNCIONALIDADES COMPLETADAS (NO TOCAR, NO RE-IMPLEMENTAR, NO MENCIONAR COMO PENDIENTES)

### Modulo Influencer Marketing (Nitro Creators) -- COMPLETADO Y EN PRODUCCION (2026-04-04)

**5 fases implementadas en sesiones 6-7. 18 commits. Modulo completo de influencer marketing.**

#### Fase 1: Base del modulo (commits 8735ddd, 1b427d5, b7cb5d9)
- Modelos Prisma: Influencer, InfluencerCampaign, InfluencerAttribution
- CRUD influencers con slug/code unicos
- Dashboard publico en /i/[slug]/[code] con password SHA-256
- Tracking link con UTM: ?utm_source=influencer&utm_medium=referral&utm_campaign=[slug]
- Atribucion via ordenes con UTM matching
- Comisiones por tier (porcentaje del revenue)
- Campanas con bonus % y fechas

#### Fase 2: Dashboard publico world-class (commit cdf0ea7)
- KPIs: revenue generado, comisiones, ordenes, tasa conversion
- Chart de ventas temporal
- Tabla de campanas activas con bonus
- Cupones asociados
- Estadisticas detalladas (ticket promedio, mejores dias, ventas recientes)

#### Fase 3: Self-service applications + emails (commits 0c07fc9, 1e4abc6, e740770, 7c81b4b, 599c593)
- Formulario publico de aplicacion en /i/[slug]/apply
- Admin: lista de aplicaciones con aprobar/rechazar
- Al aprobar: auto-crea Influencer + envia email via Resend con credenciales
- Tracking link visible en dashboard publico
- Fixes: input visibility (CSS specificity), Internal Error on approve, post-password loading

#### Fase 4: Analytics avanzados + Leaderboard + CSV (commits fa94143, 6216b80)
- Leaderboard: ranking de influencers por revenue/ordenes/comisiones
- Analytics: graficos temporales, top campaigns, channel breakdown
- CSV export de datos de influencers
- Empty states para paginas sin datos

#### Fase 5: Content management (commit 1abc297)
- Modelos: InfluencerBriefing, ContentSubmission, ProductSeeding
- Admin Briefings: CRUD, tipos (GENERAL/REEL/STORY/POST/UNBOXING/REVIEW), status management
- Admin Aprobaciones: grid de submissions, review workflow (approve/reject/revision), feedback
- Admin UGC Library: galeria de contenido aprobado como UGC, filtro por plataforma
- Admin Product Seeding: envio de productos, tracking PENDING->SHIPPED->DELIVERED->CONTENT_RECEIVED
- Public content API: influencers ven briefings y envian contenido desde su dashboard

#### Post-Fase 5: UX improvements (commits 75b7b0d, 15cce14, e3890cd, 4849eee, ba52674)
- Product breakdown: toggle isProductBreakdownEnabled para controlar visibilidad de productos vendidos en dashboard del influencer
- Tab unification: dashboard publico unificado en 1 URL con 2 tabs ("Mis Ganancias" / "Mi Contenido")
- Content data lazy-loaded solo al activar tab Contenido
- Nitro Creators: seccion propia en nav admin con gradient premium
- Premium cards: NitroPixel y LTV con cards especiales (glow, badges LIVE/AI, descripcion)

#### Patrones tecnicos criticos del modulo Influencer:
- **CSS Specificity**: globals.css tiene `body { color: var(--nitro-text) }` donde `--nitro-text: #FFFFFF`. MUST usar `style={{ color: "#111827", backgroundColor: "#ffffff" }}` en inputs de paginas admin
- **Store URL**: Organization NO tiene campo `website`. Usar `process.env.STORE_URL || "https://elmundodeljuguete.com.ar"`
- **Data isolation**: queries SIEMPRE filtran por `influencerId` AND `organizationId`, con defense-in-depth en JOINs a products
- **Password**: SHA-256 hash, verificado via /api/public/influencers/[slug]/[code]/verify
- **UGC es interno**: el influencer solo envia contenido, la empresa decide que es UGC (toggle en admin)
- **Email**: Resend REST API (no SDK) para emails de onboarding

- **ESTADO: MODULO COMPLETO EN PRODUCCION. 5 FASES IMPLEMENTADAS.**
- **PROHIBIDO: NO re-implementar ninguna fase. NO separar el portal en 2 URLs (ya unificado en tabs).**

### Modulo Margenes Completo -- COMPLETADO Y EN PRODUCCION (2026-04-03)
- Tab "Margenes" en products/page.tsx v11
- IVA fix: todos los margenes calculados con precioNeto (precio / 1.21) porque precios incluyen 21% IVA y costos no
- KPIs: Margen Bruto Prom (ponderado), Revenue Neto (sin IVA), Ganancia Bruta, Productos Sin Costo
- Distribucion por rango de margen (5 rangos con chips de filtro y conteo)
- Margen por Marca: chart horizontal top 10, respeta filtro de categoria activo
- Margen por Categoria: tabla con Revenue, COGS, Margen %, Markup %, Ganancia, Productos. Respeta filtro de marca activo
- Cross-filtering: seleccionar marca -> tabla categorias se filtra. Seleccionar categoria -> chart marcas se filtra
- Dropdowns de marca/categoria en header de tabla categorias
- Catalogo completo de margenes: tabla con 10 columnas (Producto, Precio, Costo, Margen %, Markup %, Margen $/ud, Unidades, Facturacion, Ganancia, Stock, ABC)
- Column Selector: dropdown con checkboxes para elegir columnas visibles (en tabla Overview y tabla Margenes)
- Filtros inline: busqueda por nombre/SKU, dropdown marca, dropdown categoria
- Paginacion 50 items/pagina, sort por cualquier columna
- CSV export con todos los campos incluyendo markup
- Top 10 mas rentables + Top 10 menos rentables
- computedByCategory y computedByBrand calculados client-side desde `filtered` para soportar cross-filtering
- Commits: ebc168a, d63fd48, 2da1b43, efbeacb, 9173a9d
- **ESTADO: TERMINADO. PROHIBIDO volver a implementar.**
- **PROHIBIDO: NO comparar precio con IVA contra costo sin IVA para calcular margenes.**

### LTV Dashboard + Prediccion de LTV -- COMPLETADO Y EN PRODUCCION
- Dashboard: src/app/(app)/customers/ltv/page.tsx v3 -- 5 secciones analiticas + seccion predicciones con hero de credibilidad
- Motor de prediccion: src/lib/ltv/prediction-engine.ts v3 -- Cohort-based pLTV con 3 guardrails de produccion
- API predict: src/app/api/ltv/predict/route.ts v2 -- GET/POST, batch con umbrales configurables
- API settings: src/app/api/settings/ltv/route.ts -- GET/PUT umbrales + auto-sugerencia percentiles
- API customer detail: src/app/api/ltv/customer-detail/route.ts -- Historial de ordenes expandible
- Envio Meta CAPI: src/lib/ltv/send-meta.ts -- Campo predicted_ltv en custom_data -- **DESACTIVADO**
- Envio Google Ads: src/lib/ltv/send-google.ts -- RESTATEMENT ConversionAdjustmentUploadService -- **DESACTIVADO**
- Nav: Clientes > Segmentacion | Lifetime Value (children en layout.tsx)
- MELI excluido de TODOS los queries (no tiene datos de clientes)
- Triple candado de seguridad: env var LTV_SEND_ENABLED + confidence threshold 0.5 + flag por cliente
- Modelo v3 con 3 guardrails:
  - Fix 1: Clientes con <30 dias de historia usan cohort_boosted (no extrapolan frecuencia personal)
  - Fix 2: Frecuencia personal capeada a max 1 compra cada 7 dias
  - Fix 3: Prediccion capeada a 3x gasto real como red de seguridad
- Metodos: cohort_lookup (1 compra), cohort_boosted (2+ compras, <30 dias), personal_history (2+ compras, 30+ dias)
- Umbrales: configurables por usuario + auto-sugeridos (low=p50, medium=p90, redondeados a 5K). Default: low=$25K, medium=$100K
- Commits: d950cef, b058253, d4eb371, 0aafb0d, 1b60f12, 4409537, 9eec0de, 6ff64d1, 0ca3726, 90df13e, 6da6c9d
- Prisma model: CustomerLtvPrediction con campos predictedLtv90d, predictedLtv365d, confidence, acquisitionChannel, segmentBucket, sentToMeta, sentToGoogle
- **ESTADO: ANALYTICS TERMINADO. GUARDRAILS IMPLEMENTADOS. ENVIO A PLATAFORMAS PENDIENTE APROBACION DE TOMY.**
- **PROHIBIDO: NO activar LTV_SEND_ENABLED ni enviar datos a Meta/Google sin aprobacion explicita del usuario.**
- **PENDIENTE: Recalcular predicciones desde la UI para que los guardrails se apliquen a la data existente.**

### Decisiones del usuario sobre LTV (para contexto de proximas sesiones)
- Tomy quiere validar las predicciones en el dashboard antes de activar envio a plataformas
- Preocupacion principal: que predicciones malas sean arma de doble filo
- No quiere que solo se envien los de alto valor -- entiende que Meta/Google necesitan el rango completo para optimizar
- Pregunto sobre estacionalidad (Dia del Nino en agosto para jugueteria) -- modelo actual no la considera explicitamente pero captura patrones via datos historicos. Se podria agregar indice estacional como mejora futura.
- Para clientes nuevos de NitroSales: el modelo empieza a dar valor con 50-100 clientes recurrentes. Primeros meses = solo dashboard, envio a plataformas cuando confianza promedio > 60-70%.
- Tomy quiere que umbrales sean configurables por el usuario pero con sugerencia automatica del sistema
- Tomy pidio customer detail expandible para verificar manualmente por que cada cliente fue clasificado como fue

### â Tendencias de Venta â COMPLETADO Y EN PRODUCCIÃN
- Incluido en products/page.tsx v10.1
- Tab "Tendencias" con AreaCharts de categorÃ­as y marcas
- WoW (week-over-week) comparisons
- **ESTADO: TERMINADO. PROHIBIDO volver a implementar.**

### â Stock Inteligente â COMPLETADO Y EN PRODUCCIÃN
- Incluido en products/page.tsx v10.1
- Tab "Stock Inteligente" con health indicators, ABC classification, dead stock
- **ESTADO: TERMINADO. PROHIBIDO volver a implementar.**

### â Encoding/Mojibake Fixes â COMPLETADO (v10.1)
- 85+ caracteres UTF-8 double-encoded corregidos
- Bolsas de Compra movida dentro de activeTab === "overview"
- 6 caracteres FFFD en secciÃ³n Bolsas corregidos
- Commits: 4bbf299, 877615a, 05eb35e
- **ESTADO: TERMINADO.**

### â PÃ¡gina de Productos â COMPLETADA
- KPIs de revenue, Ã³rdenes, items
- Tabla de productos con filtros
- GrÃ¡ficos de distribuciÃ³n
- Tendencias + Stock Inteligente
- Bug TypeError toLocaleString: RESUELTO
- Bug 86% sin marca: EN PROCESO (batch corriendo)

---

## PROCESOS EN CURSO

### Batch de Marcas + CategorÃ­as (2026-03-16)
- **Endpoint**: fix-brands?action=fix-vtex
- **Progreso**: ~26% completado (~8,100 de 31,214 productos con marca+categorÃ­a)
- **Script**: Corre autÃ³nomamente en el browser via window._fixProgress
- **CategorÃ­as ya resueltas**: nombres legibles (ej: "Pistas", "Inflables y Piletas", "Robots y Transformables")
- **Pendiente post-batch**: Correr fix-categories para los ~1,286 que se procesaron antes del fix de categorÃ­as (tienen marca pero categorÃ­a numÃ©rica)

---

## STACK TÃCNICO

- **Framework**: Next.js 14 App Router
- **ORM**: Prisma (import desde @/lib/db/client)
- **DB**: PostgreSQL en Neon (São Paulo, sa-east-1). Sesion 11: Migrado de Railway. Production + dev + preview branches via Neon-Vercel integration. Pooled: DATABASE_URL (PgBouncer). Unpooled: DATABASE_URL_UNPOOLED. Vercel functions en gru1 (São Paulo) — IMPORTANTE: region debe coincidir con DB.
- **Deploy**: Vercel Pro (800s function timeout max, ISR revalidate=300). Fluid Compute habilitado. Region: iad1
- **Error Tracking**: Sentry account existe (nitrosales.sentry.io) pero NO ESTÁ CONECTADO al código. Instalado en commit ce90c81 pero revertido en 68a415b por performance issues (15-25s cold start). Cuentas siguen activas para futura integración lightweight.
- **Structured Logging**: Axiom account existe (nitrosales-et7s) pero NO ESTÁ CONECTADO al código. Instalado en commit 4002a50 pero revertido en 68a415b por performance issues. Cuentas siguen activas para futura integración lightweight.
- **VTEX Account**: mundojuguete
- **Org ID**: cmmmga1uq0000sb43w0krvvys
- **Credenciales VTEX**: env var DJQFRI + fallback backfill ZMTYUJ

---



---

## FASES DEL PLAN TECNICO

| Fase | Nombre | Estado | Commits |
|------|--------|--------|---------|
| 0 | Instrumentacion y fetch-retry | COMPLETADA | Sesion anterior |
| 1 | Proteccion de datos (sync-lock, f_status) | COMPLETADA | Sesion anterior |
| 2 | Integracion de protecciones en rutas | COMPLETADA | 8256d3f |
| 3 | Tests + integridad de datos + tipado | COMPLETADA | dcdcb22..71ff8b9 |
| 4A | Infra: Prisma Migrate, cred centralization, encryption, auth guard | EN CURSO | pendiente commit |
| 4B | Bot de IA con datos multi-fuente | EN DEFINICION — concepto 2 capas, detalles pendientes | - |

### Pendiente: Connection Pooling (Fase 2.5)
- Requiere DATABASE_URL_DIRECT env var en Vercel
- Pospuesto hasta que se configure

## HISTORIAL DE CAMBIOS

### 2026-04-12 — Sesion 18 (NitroPixel Analytics Fase 1+2: world-class first-party analytics dashboard)

**Commits**: `fadc25b`, `4be6b3a`, `8a33e22`, `b115345`, `349e445`, `b226cd7`, `05bfbda`, `3a1b89b`, `244dca5`, `a8860a1`, `ca4bbbd`, `6a7102a`, `364e978`
**Deploy**: Todo directo en main, Vercel auto-deploy.

#### OBJETIVO
Reemplazar analytics basado en GA4 con dashboard de NitroPixel first-party data. "Google mide para Google. Meta mide para Meta. NitroPixel mide para vos."

#### FASE 1 — 4 zonas implementadas
1. **KPI Strip**: Visitantes, Sesiones, PageViews, Identificados, Carrito, Compradores, con cambios % vs periodo anterior
2. **Channel Truth Table**: ROAS real (pixel) vs ROAS plataforma, Truth Score (pixelRevenue/platformRevenue), spend, con tooltips de rol de canal (Descubrimiento/Asistencia/Cierre). Attribution Indicator read-only que muestra modelo activo desde config NitroPixel (no seleccionable por usuario).
3. **Funnel + Journeys**: Funnel con anchos estaticos [100,84,68,52,38] (no proporcional a datos). 10 journeys recientes con touchpoints visuales.
4. **Revenue Intelligence**: Toggle truth/channels. Truth = AreaChart pixel vs plataforma + ad spend. Channels = BarChart stacked por canal.

#### FASE 2 — 3 zonas nuevas
5. **Velocidad de Conversion**: Barras horizontales de conversion lag (Mismo dia, 1-3 dias, etc.) con auto-insight textual.
6. **Dispositivos + Top Paginas**: PieChart ring mobile/desktop/tablet + Top 6 paginas por visitantes unicos (sin checkout, slugs prettified, URLs decoded, productos numericos como "Producto #726").
7. **Pixel Coverage Timeline**: AreaChart de cobertura % por dia con ReferenceLine 80% y alerta automatica si hay drops.

#### CHANNEL ROLES — Backend computation
- Query SQL dedicada sobre TODAS las atribuciones del periodo (no solo 15 journeys recientes)
- Computa first_touch, assist_touch, last_touch, solo_touch por source
- Frontend muestra 3 columnas: Descubrimiento, Asistencia, Cierre con logos de canal y porcentajes

#### GOCUOTAS CLEANUP — Datos historicos corruptos
- gocuotas (medio de pago) aparecia como canal de trafico en attribution data
- El attribution engine ya tenia PAYMENT_GATEWAY_PATTERNS pero habia 1,375 atribuciones historicas con gocuotas
- Limpieza en 3 pasos: solo-gocuotas→direct (725), all-gocuotas-multi→direct (85), mixed-multi→removido touchpoint (565)
- Aun despues de limpieza DB, Vercel edge cache servia data vieja → bust cache key a v2
- Agregado PAYMENT_GATEWAY_SOURCES blacklist filter en respuesta de pixel route Y discrepancy route

#### BUGS ENCONTRADOS Y CORREGIDOS
1. **Client-side exception post-Fase 2**: Faltaban try-catch en zonas nuevas + device field mismatch (API devuelve `device`, frontend esperaba `deviceType`). Fix: try-catch por zona + normalizacion defensiva.
2. **Top Paginas vacias (Home x6, 0 views)**: API devuelve `url` y `pageViews`, frontend buscaba `pageUrl` y `views`. Fix: normalizacion con fallback a ambos nombres.
3. **Top Paginas duplicadas (Home x2, checkout x3)**: Query SQL agrupaba por URL completa, frontend simplificaba despues. Fix: agrupar por label simplificado y sumar views.
4. **URLs encoded (`1%20a%203%20a%C3%B1os`)**: Faltaba `decodeURIComponent`. Fix: decode en prettifyPath.
5. **Checkout > Home (imposible)**: Query usaba `COUNT(*)` (eventos crudos) en vez de visitantes unicos. Checkout genera muchos eventos por usuario (cada step). Fix: `COUNT(DISTINCT visitorId)` + exclusion de checkout paths.
6. **"726" como pagina**: Paths numericos eran IDs de producto sin slug. Fix: detectar regex `/^\d+$/` y mostrar "Producto #726".
7. **HTTP 500 (API crash)**: `regexp_replace` con `'\?'` en template literal — JS consume el backslash antes de que llegue a PostgreSQL. Fix: reemplazar por `SPLIT_PART(url, '?', 1)`.

#### DECISION DE USUARIO — Roadmap Fase 3+
Tomy decidio que en analytics solo agregaria:
- **Tasas de conversion** (por fuente, categoria, marca, producto, dispositivo, dia/hora)
- **Journey Intelligence** (combinaciones ganadoras, largo optimo, canales catalizadores)
El resto del roadmap propuesto (rentabilidad real, inteligencia de clientes, creative intelligence, alertas) encaja mejor en otros features/secciones de NitroSales.

#### ARCHIVOS MODIFICADOS
- `src/app/(app)/analytics/page.tsx` (v2 → v3, ~1300 lineas, rewrite completo)
- `src/app/api/metrics/pixel/route.ts` (v1 → v2, 26 queries, nuevos campos)
- `src/app/api/metrics/pixel/discrepancy/route.ts` (v1 → v1.1, payment gateway filter)

---

### 2026-04-08 — Sesion 15 (Dashboard overhaul: sistema de slots por filas + widgets multi-formato + filtros por card + popover via portal)

**Commits** (staging → main fast-forward, 10 commits):
- `cd07370` feat(dashboard): Tanda 1 — hero header + KPI cards rediseñadas + skeleton
- `e10b181` feat(dashboard): Tanda 2 — bloque "Lo que importa hoy" + filtro repensado
- `3a9b8db` feat(dashboard): Tanda 3 — charts premium + catalog modal + toast world-class
- `1e3add1` fix(dashboard): elimino NitroInsightsPanel viejo + centrado catalog modal
- `35268f6` feat(dashboard): per-card filter system with section pool model
- `148cb43` feat(dashboard): multi-format widget system with format picker
- `489825f` feat(dashboard): row-based slot layout system with draggable rows
- `ab5f504` fix(dashboard): render widget filter popover via portal with fixed positioning

**Deploy**: staging 10 commits → fast-forward merge → main → Vercel auto-deploy OK en produccion (`app.nitrosales.io`).
**Modelo de branches respetado**: 2 branches (main + staging). Cero branches feature. Todo el trabajo se hizo en staging, validado por Tomy, y recien entonces merge a main con confirmacion explicita.

#### OBJETIVO
Reemplazar el viejo dashboard de widgets flotantes por un sistema estructurado tipo "rompecabezas":
- Tomy necesita un canvas predecible donde cada fila tenga una forma definida
- Poder mover filas enteras via drag & drop
- Poder elegir entre multiples formatos visuales por cada slot (KPI, chart, list, donut, etc.)
- Filtrar cada card independientemente con filtros que hereden del pool de la seccion del widget
- Popover de filtros que no se tape con el contenido adyacente

#### ARQUITECTURA NUEVA — Sistema de slots por filas

**Capa 1: slot-layout.ts** (fuente de verdad)
- `SLOT_SIZES`: xs, sm, md, lg, xl → cada size tiene `colSpan` (1-6) y `allowedFormats` (que formats caben ahi)
- `ROW_TEMPLATES`: 5 templates predefinidos que SUMAN 6 cols cada uno
  - `kpi-6`: 6 slots xs (6 KPIs en una fila)
  - `kpi-3`: 3 slots sm (3 KPIs mas grandes)
  - `trio-md`: 3 slots md (trio de medium widgets)
  - `chart-duo`: 2 slots lg (dos charts lado a lado)
  - `chart-full`: 1 slot xl (un chart full-width)
- `Layout = { version: 3, rows: LayoutRow[] }`
- `LayoutRow = { id, templateId, title?, slots: LayoutSlot[] }`
- `LayoutSlot = { id, size, format, widgetId?, filters? }`

**Capa 2: format-config.ts** (catalogo visual)
- 9 formats: kpi, big-number, sparkline, mini-line, mini-bar, list, donut, area-full, bar-full
- Cada `FormatDef` define que slot sizes lo permiten, su endpoint default, su icon
- Al hacer pick de un slot, el picker filtra los formats por `SLOT_SIZES[slot.size].allowedFormats`

**Capa 3: filter-config.ts** (pool de filtros por seccion)
- `SectionKey`: orders | products | customers | ads | marketing | fulfillment
- Cada seccion tiene su pool de `FilterDef[]` (ej. orders tiene status, channel, paymentMethod)
- Los widgets declaran su section al mount → heredan los filtros aplicables automaticamente
- `getApplicableFilters(section, excludeFilters?)` + `countActiveFilters(values)`

**Capa 4: dashboard/page.tsx** (render + interacciones)
- `renderSlotContent(row, slot, slotIdx)` — helper dispatch que para cada (slot + format) renderiza el componente correcto
- Render loop: `layout.rows.map(row => row.slots.map(slot => renderSlotContent))`
- Grid de slots: `grid-cols-2 md:grid-cols-3 lg:grid-cols-6` con colSpan aplicado por tamaño de slot
- Drag & drop a nivel fila: handle `GripVertical`, drop indicator visual, reordena `layout.rows`
- Row toolbar (edit mode): drag handle + title input opcional + template dropdown + delete button
- Empty slot: placeholder clickable en edit mode, dashed border en read mode
- Replace button en cada widget (edit mode) para swap rapido de format

**Backward compat** (3-tier):
1. Si el settings tiene `layout.rows` (v3) → usa el sistema nuevo
2. Si solo tiene `widgets` (v2 legacy) → los derivamos a un layout default
3. Si no tiene nada → layout default hardcoded (kpi-6 + chart-duo + chart-full)
- **Dual persistence**: al guardar siempre se persisten AMBOS (layout + widgets derivados) como red de seguridad por si hay que rollbackear el schema.

#### FIX CRITICO del popover de filtros (commit ab5f504)

**Problema reportado por Tomy**: al abrir el popover "Filtros de la card" desde la esquina superior derecha de un widget, el popover se veia tapado por el contenido de la fila siguiente. Captura de pantalla enviada por el usuario.

**Root cause**: `WidgetFilterPopover.tsx` usaba `position: absolute; top: 100%; right: 0;` anclado al trigger. El popover quedaba DENTRO del stacking context de la card, con `overflow` y `z-index` del padre compitiendo contra las cards vecinas. En `grid` de 6 cols con multiples rows, el row siguiente ganaba la z-battle visualmente.

**Fix aplicado** — Migracion a React Portal con fixed positioning:
1. `import { useLayoutEffect, useRef, useState } from "react"` + `import { createPortal } from "react-dom"`
2. Estado nuevo: `mounted` (SSR-safe portal flag) + `coords: { top, left } | null`
3. Funcion `updateCoords()`:
   - `const rect = triggerRef.current.getBoundingClientRect()`
   - Anchor right-aligned al trigger (`left = rect.right - POPOVER_W`)
   - Clampeo a viewport con margen 8px
   - **Auto-flip vertical**: si `rect.bottom + POPOVER_H > viewportH`, flip arriba; si ni arriba ni abajo entra, pega al borde inferior visible
4. `useLayoutEffect(() => { if (open) updateCoords() }, [open])` — calcula coords sincronico al abrir
5. Extension del `useEffect` existente para agregar `window.addEventListener("scroll", reflow, true)` + `"resize"` — reposiciona si el usuario scrollea o redimensiona
6. JSX: `{open && mounted && createPortal(<><backdrop /><popover style={{ top, left }} /></>, document.body)}`
7. CSS en `DashboardStyles.tsx`: `.dash-filter-popover` pasa a `position: fixed; top: 0; left: 0;` + `z-index: 70`. Mobile media query preserva el bottom-sheet con `!important`.

**Resultado**: el popover vive ahora en `document.body`, escapa todos los stacking contexts, y las coordenadas calculadas via `getBoundingClientRect` lo mantienen perfectamente anclado al trigger incluso con scroll.

#### PROCESO DE MERGE (Regla #2 del CLAUDE.md respetada)
1. Tomy valido visualmente en el preview URL fijo de staging
2. Tomy autorizo merge con "me gustaria ahora pasar el tablero de control a main. Tenes todo para poder hacerlo prolijamente y que salga bien?"
3. Verifique staging clean, 10 commits ahead, 0 divergencia con main
4. `npx next build` local → green
5. `git checkout main && git pull && git merge --ff-only staging && git push origin main`
6. Verificado que main y staging apuntan al mismo SHA `ab5f504a1f01c9c896f25b02bafa0b28da1898e1`
7. `git checkout staging` — vuelta automatica a staging

#### ARCHIVOS NUEVOS CREADOS EN S15
Frontend:
- `src/components/dashboard/DashboardHero.tsx`
- `src/components/dashboard/DashboardTodayBlock.tsx`
- `src/components/dashboard/DashboardChartCard.tsx`
- `src/components/dashboard/DashboardSparkline.tsx`
- `src/components/dashboard/DashboardStyles.tsx`
- `src/components/dashboard/WidgetFormats.tsx`
- `src/components/dashboard/WidgetFilterPopover.tsx`
- `src/components/dashboard/WidgetFilterChips.tsx`
- `src/hooks/useAnimatedValue.ts`

Lib:
- `src/lib/dashboard/slot-layout.ts`
- `src/lib/dashboard/format-config.ts`
- `src/lib/dashboard/filter-config.ts`

API:
- `src/app/api/metrics/top/route.ts`
- `src/app/api/metrics/distribution/route.ts`

Archivos modificados:
- `src/app/(app)/dashboard/page.tsx` (v2 → v3)
- `src/app/api/dashboard/preferences/route.ts` (v1 → v2, schema v3 + fix TS JsonValue)

#### LECCIONES DE ESTA SESION
1. **Portal + fixed positioning es la cura estandar para popovers que se tapan** en layouts con stacking context denso (grids, cards con overflow). `absolute` solo sirve cuando el padre directo es el contenedor de referencia.
2. **`getBoundingClientRect` + auto-flip vertical** da UX profesional con cero dependencias externas (Popper/Floating UI). Mas liviano.
3. **Schema dual-persistence (layout + widgets derivados)** permite lanzar cambios de estructura sin romper usuarios existentes ni quedarte sin via de rollback. Si v3 falla en produccion, basta con ignorar `layout` y leer `widgets`.
4. **Row templates fijos con suma constante = 6** simplifican el mental model: Tomy no tiene que pensar en grid spans, solo en "que tipo de fila quiere".
5. **Modelo staging-unico funciono perfecto**: 10 commits seguidos en staging, 1 fast-forward a main al final. Cero confusion de branches, cero preview URLs cambiantes.

---

### 2026-04-07 — Sesion 14 (Hotfix produccion: indices faltantes en Neon + maxDuration en metrics routes)

**Commits**: `d627885` (hotfix maxDuration en main)
**Deploy**: d627885 → main → Vercel auto-deploy OK
**Branch hotfix**: `hotfix/metrics-timeout` (mergeado a main por fast-forward)

#### PROBLEMA REPORTADO
Tomy reporto que en produccion (`nitrosales.vercel.app`):
- `/orders` nunca terminaba de cargar (loading infinito)
- `/products` a veces cargaba, a veces fallaba con error 500
- En la preview branch todo funcionaba rapido y bien

#### INVESTIGACION INICIAL (incorrecta — primer fix incompleto)
1. Verifique con `git ls-remote` que main y la preview tienen IDENTICO codigo (`160fbab`).
2. Conclui que la diferencia era el volumen de datos en la DB de produccion.
3. Lei `src/app/api/metrics/orders/route.ts` (585 lineas) — corre 14 queries en paralelo via Promise.all.
4. Lei `vercel.json` y comprobe que `/api/metrics/**` NO tenia `maxDuration` configurado.
5. Asumi que el problema era timeout: 14 queries pesadas + default Vercel ~15s + DB pesada = function killed.
6. Aplique fix surgico: agregue `export const maxDuration = 60;` en orders y products routes (1 linea cada uno).
7. Commit `d627885`, merge a main, deploy automatico.

#### EL FIX NO ALCANZO — Tomy reporto que SEGUIA con error 500 + lentitud
- Esto indico que el problema NO era solo timeout, era algo mas profundo.
- Hice `curl -m 90` directo contra `/api/metrics/orders` en produccion:
  - **HTTP 504 `FUNCTION_INVOCATION_TIMEOUT` a los 60.4 segundos** — el max nuevo se estaba alcanzando.
  - Las queries genuinamente tardaban >60s, lo cual es absurdo para tablas con indices correctos.

#### CAUSA RAIZ REAL — Indices faltantes en la DB de Neon production
- Existe un endpoint `POST /api/setup/ensure-indexes?key=...` que crea 6 indices criticos via `CREATE INDEX IF NOT EXISTS`.
- Este endpoint **fue creado en Sesion 9** especificamente para resolver queries lentas en metrics.
- Cuando se migro de Railway a Neon en Sesion 11, **ese endpoint nunca fue ejecutado contra la nueva DB de produccion**.
- Sin esos indices, las 14 queries del route hacian **full table scan sobre 60K+ ordenes** → cada query tardaba 5-10s → total >60s → timeout.
- Los indices que faltaban:
  - `idx_orders_org_status_date` ON orders (organizationId, status, orderDate) — el mas critico
  - `idx_oi_order_product` ON order_items (orderId, productId) — para JOIN en topProducts
  - `idx_cust_org_first_order` ON customers (organizationId, firstOrderAt) — para topCustomers
  - `idx_adm_org_plat_date` ON ad_metrics_daily (organizationId, platform, date)
  - `idx_acmd_org_date` ON ad_creative_metrics_daily (organizationId, date)
  - `idx_pattr_org_model_created` ON pixel_attributions (organizationId, model, createdAt)

#### FIX REAL APLICADO — Cero cambios de codigo
1. Llamada HTTP a produccion: `POST /api/setup/ensure-indexes?key=nitrosales-secret-key-2024-production`
2. Respuesta en 1.36s — todos los 6 indices reportaron status `created` (confirmando que NO existian).
3. Verificacion empirica post-fix con curl:
   - `/api/metrics/orders?from=2026-03-01&to=2026-04-07` → **HTTP 200 en 0.76s** (antes: 504 en 60.4s = ~80x mejora)
   - `/api/metrics/products?from=2026-03-01&to=2026-04-07` → **HTTP 200 en 0.70s** (antes: 500 en 10.9s = ~15x mejora)
4. Re-verificacion 2da vez en vivo (orders 0.41s, products 0.84s) — estable.

#### Que aprendi
- **NO basta con leer codigo: hay que verificar empiricamente con curl directo a produccion ANTES de proponer un fix.**
- El sintoma "loading infinito" puede ser timeout O queries bloqueadas en full scan — son cosas distintas.
- El fix de `maxDuration=60` que apliqué primero NO causo dano (sigue como red de seguridad), pero NO era la causa raiz.
- **Cualquier migracion de DB (Railway → Neon, branch nueva, etc.) DEBE re-ejecutar `ensure-indexes` despues del primer deploy.** Los indices NO se transfieren automaticamente entre DBs aunque el schema Prisma este igual — `prisma db push` solo crea las tablas, NO los indices definidos en raw SQL fuera del schema.
- El endpoint `ensure-indexes` esta documentado pero su ejecucion no esta en ningun checklist post-migracion → este olvido se repitio una vez ya, no debe repetirse otra vez.

#### Archivos modificados en esta sesion
- `src/app/api/metrics/orders/route.ts` — agregado `export const maxDuration = 60;` (linea 22, 1 linea aditiva)
- `src/app/api/metrics/products/route.ts` — agregado `export const maxDuration = 60;` (linea 9, 1 linea aditiva)
- (Commit `d627885`, mergeado a main por fast-forward)

#### Cambios en la DB de Neon production (NO en codigo)
- 6 indices creados via `CREATE INDEX IF NOT EXISTS` ejecutado por el endpoint `/api/setup/ensure-indexes`
- Persistentes en Neon — sobreviven deploys, redeploys, y branches futuros.

#### Reglas de prevencion derivadas
- Ver **PREVENCION #11** — checklist obligatorio post-migracion de DB.

---

### 2026-04-05 — Sesiones 9-10 (Fix critico: connection pool exhaustion + force-dynamic)

**Commits sesion 9**: 06dd847, 841d6b1, 5104869, 0e5146a, efc7c0ad, 12e22bcc (6 commits — varios causaron problemas)
**Commits sesion 10**: 703dc6a, acc44a5, e4b7516, d0d4bcf, b0b8119 (5 commits — b0b8119 es el fix definitivo)
**Deploy**: b0b8119 -> main. Vercel Ready. 10/10 APIs 200 OK.

#### Que paso:
1. Sesion 9 intento arreglar APIs que no respondian. Agrego connection_limit=5 al pool de Prisma (commit 5104869), lo cual CAUSO el problema en vez de arreglarlo. Tambien reescribio APIs a raw SQL y agrego cache.
2. Sesion 10 identifico la causa raiz con tests empiricos (1 API OK, 5 APIs timeout). Removio connection_limit (703dc6a) y todo funciono.
3. Se intento remover force-dynamic de 72 rutas para optimizar builds (e4b7516) pero rompio las APIs — Next.js las pre-renderizaba estaticamente.
4. Se restauro force-dynamic (b0b8119) y todo volvio a funcionar definitivamente.

#### Errores criticos documentados (ver seccion REGLAS DE PREVENCION):
- NUNCA agregar connection_limit al pool de Prisma
- NUNCA remover force-dynamic de rutas API
- NUNCA hacer multiples cambios sin testear cada uno por separado
- NUNCA reescribir Prisma ORM a raw SQL sin demostrar con datos que el ORM es el problema

---

### 2026-04-04 — Sesiones 6-7 (Influencer Module Completo Fases 1-5 + Nitro Creators + Premium Nav)

**Commits**: 8735ddd, 1b427d5, b7cb5d9, d7b29fd, cdf0ea7, 0c07fc9, 1e4abc6, e740770, 7c81b4b, 599c593, fa94143, 6216b80, 75b7b0d, 15cce14, 1abc297, e3890cd, 4849eee, ba52674 (18 commits)
**Deploy**: Vercel auto-deploy OK para cada commit (ba52674 ultimo -> main)

#### Errores encontrados y corregidos:

1. **Inputs invisibles en admin pages — texto blanco sobre fondo blanco** (ERROR UX)
   - SINTOMA: Al crear influencer, los inputs del formulario no mostraban texto. Parecia un form roto.
   - CAUSA RAIZ: `globals.css` tiene `body { color: var(--nitro-text) }` donde `--nitro-text: #FFFFFF`. Los inputs heredaban color blanco sobre fondo blanco.
   - FIX: Inline styles `style={{ color: "#111827", backgroundColor: "#ffffff" }}` en TODOS los inputs de paginas admin.
   - APRENDIZAJE: **En TODAS las paginas admin de NitroSales, los inputs DEBEN tener inline style con color="#111827" y backgroundColor="#ffffff". Tailwind classes como `text-gray-900` NO funcionan porque globals.css tiene mayor especificidad.**
   - Commit: 7c81b4b

2. **Internal Error al aprobar aplicacion — campo website en Organization** (ERROR DB)
   - SINTOMA: Al hacer click en "Aprobar" una aplicacion de influencer, error 500 Internal Server Error.
   - CAUSA RAIZ: El endpoint de aprobacion usaba `org.website` para construir el email de bienvenida, pero Organization NO tiene campo `website`. Ese campo esta en CompetitorStore.
   - FIX: Reemplazado `org.website` por `process.env.STORE_URL || "https://elmundodeljuguete.com.ar"`
   - APRENDIZAJE: **El modelo Organization NO tiene campo `website`. La URL de la tienda se obtiene de `process.env.STORE_URL` o se hardcodea. NUNCA asumir que Organization tiene campos que no estan en schema.prisma.**
   - Commit: 7c81b4b

3. **Dashboard publico "no disponible" tras crear influencer** (ERROR FLUJO)
   - SINTOMA: Tras aprobar aplicacion, el influencer recibia email con link al dashboard, pero al entrar decia "Dashboard no disponible".
   - CAUSA RAIZ: La pagina de verificacion de password no manejaba correctamente el loading state post-autenticacion. El fetch del dashboard fallaba silenciosamente.
   - FIX: Corregido flow de loading, agregado manejo de errores, validacion de slug/code.
   - Commit: 599c593

4. **Tracking link no visible en dashboard publico** (ERROR UX)
   - SINTOMA: El influencer entraba a su dashboard pero no veia donde estaba su link de tracking.
   - CAUSA RAIZ: El tracking link se generaba pero no se mostraba en la UI del dashboard publico.
   - FIX: Agregada card con el tracking link copiable en el dashboard publico.
   - Commit: e740770

5. **Toggle de productos habilitado pero seccion no visible** (ERROR LOGICA)
   - SINTOMA: Admin habilitaba isProductBreakdownEnabled para un influencer, pero en el dashboard no aparecia la seccion de productos.
   - CAUSA RAIZ: La condicion era `data.topProducts && data.topProducts.length > 0`, que ocultaba la seccion cuando habia 0 productos (caso de influencer nuevo sin ventas aun).
   - FIX: Cambiado a `data.topProducts !== undefined` con mensaje de empty state "Cuando tus ventas se registren, vas a ver aca que productos vendiste".
   - APRENDIZAJE: **Para secciones con toggle, mostrar empty state cuando esta habilitado pero sin datos, NO ocultar la seccion. El usuario necesita feedback de que el toggle funciona.**
   - Commit: 15cce14

6. **Portal del influencer con 2 URLs confusas** (ERROR ARQUITECTURA)
   - SINTOMA: El influencer tenia una URL para ganancias (/i/[slug]/[code]) y otra para contenido (/i/[slug]/[code]/content). El usuario (Tomy) se confundio sobre quien usaba cual.
   - CAUSA RAIZ: Se implementaron como paginas separadas durante Fase 5, cuando deberian haber sido una sola experiencia.
   - FIX: Unificado en 1 URL con 2 tabs ("Mis Ganancias" / "Mi Contenido"). La URL /content ahora redirige automaticamente.
   - APRENDIZAJE: **Para portales de usuario externo (influencers), UNA sola URL con navegacion interna (tabs). Los influencers necesitan la experiencia mas simple posible. Si hay duda, unificar.**
   - Commit: e3890cd

7. **Nav admin sobrecargado — 10 items bajo Influencers** (ERROR UX)
   - SINTOMA: Tomy reporto que el sidebar se sentia "muy cargado" con Briefings, Contenido, UGC Library y Product Seeding dentro de Influencers.
   - CAUSA RAIZ: Se agregaron los items de Fase 5 al dropdown existente sin reorganizar.
   - FIX: Creada seccion "NITRO CREATORS" con 2 sub-arboles: Influencers (6 items) y Contenido (4 items). Despues se promovieron NitroPixel y LTV a premium cards.
   - APRENDIZAJE: **Cuando un dropdown supera 6-7 items, reorganizar en secciones separadas. El usuario nota la sobrecarga antes que el developer.**
   - Commit: 4849eee, ba52674

#### Que se hizo (resumen por commit):

1. **Fase 1 base** (8735ddd) — Modelos Prisma, CRUD, dashboard publico, tracking, atribucion
2. **Password protection** (1b427d5) — SHA-256 auth para dashboards publicos, fix tipografia inputs
3. **Coupon attribution + commission tiers** (b7cb5d9) — Cupones, tiers de comision, bonus de campana
4. **DB schema sync** (d7b29fd) — Trigger redeploy post-push schema
5. **Dashboard publico v2** (cdf0ea7) — KPIs, chart, campanas, cupones, stats completos
6. **Fase 3 self-service** (0c07fc9) — Aplicaciones, form publico, email automatico via Resend
7. **Link form publico en admin** (1e4abc6) — Card con URL copiable del formulario
8. **Fixes Phase 3** (e740770) — Tracking link visible, bugs menores
9. **Fix Internal Error + inputs** (7c81b4b) — org.website fix, CSS specificity fix
10. **Fix email + loading** (599c593) — Nombre org en email, loading post-password
11. **Fase 4 analytics** (fa94143) — Leaderboard, analytics, CSV export
12. **Empty states** (6216b80) — Analytics y leaderboard con empty states
13. **Product breakdown** (75b7b0d) — Toggle isProductBreakdownEnabled, productos en dashboard
14. **Empty state productos** (15cce14) — Mostrar seccion vacia cuando toggle on pero sin ventas
15. **Fase 5 contenido** (1abc297) — Briefings, submissions, UGC library, product seeding
16. **Tab unification** (e3890cd) — 2 tabs en dashboard, redirect /content, nav reorganizado
17. **Nitro Creators** (4849eee) — Seccion propia con gradient premium, smart isActive
18. **Premium cards** (ba52674) — NitroPixel y LTV con cards glowing, badges, descripciones

#### Archivos nuevos creados (30+):
- 11 paginas admin bajo `/influencers/*`
- 3 paginas publicas bajo `/i/[slug]/*`
- 15 API routes bajo `/api/influencers/*` y `/api/public/influencers/*`
- 7 modelos Prisma nuevos

#### Archivos modificados:
- `prisma/schema.prisma` — v3 -> v4: +7 modelos influencer, +isProductBreakdownEnabled
- `src/app/(app)/layout.tsx` — v2 -> v4: NITRO CREATORS seccion + premium cards + smart routing
- `src/app/i/[slug]/[code]/page.tsx` — Reescrito 3 veces (v1 base -> v2 world-class -> v3 tabs)
- `src/app/i/[slug]/[code]/content/page.tsx` — Full page -> redirect only

#### Decisiones tomadas con Tomy:
- Content/UGC es concepto 100% interno de la empresa, NO se expone al influencer
- Influencer solo "envia contenido", la empresa decide que es UGC
- Portal del influencer DEBE ser lo mas simple posible — 1 URL, 2 tabs
- Admin nav reorganizado: Influencers (performance) separado de Contenido (creative)
- NitroPixel y LTV promovidos a premium cards para darles mas peso visual
- Nombre del producto: "Nitro Creators" (elegido sobre AFI, INFLUX, AMPLI)
- Ubicacion: seccion propia con gradient, al mismo nivel que HERRAMIENTAS

---

### 2026-04-03 — Sesion 5 (LTV Guardrails + Build Fix + Configurable Thresholds + Deep Audit + Sidebar Reorg)

**Commits**: 0aafb0d, 1b60f12, 4409537, 9eec0de, 6ff64d1, 0ca3726, 90df13e, 6da6c9d, 83676eb, 042445b (10 commits)
**Deploy**: Vercel auto-deploy OK (042445b -> main). Build time volvio a ~50s tras fix.

#### Errores encontrados y corregidos:

1. **Build colgado en Vercel — 8+ minutos** (ERROR CRITICO)
   - SINTOMA: Deploys en Vercel tardaban 8-9 minutos en vez de ~50 segundos. Build se quedaba en "Building..."
   - CAUSA RAIZ: `prisma db push` estaba en el build command de package.json (`prisma generate && prisma db push && next build`). `prisma db push` es un comando de DESARROLLO que hace schema introspection contra la DB en vivo. En cada deploy, se conectaba a la Railway DB de produccion y bloqueaba.
   - POR QUE NO SE VIO ANTES: Cuando la DB era chica, el schema introspection era rapido. Con crecimiento de datos y indices, empezo a tardar minutos.
   - FIX: Removido `prisma db push` del build command. Ahora: `prisma generate && next build`
   - APRENDIZAJE: **`prisma db push` NUNCA debe estar en un build de produccion. Es solo para desarrollo local. Las migraciones de schema en produccion se hacen con `prisma migrate deploy` y de forma separada al build.**
   - Commit: 0aafb0d

2. **`column "totalOrders" does not exist`** (Error en query de top customers)
   - SINTOMA: Al intentar mostrar detalles de clientes en la tabla top 20, query fallaba
   - CAUSA RAIZ: Se intento acceder a `customer_ltv_predictions."totalOrders"` como columna directa, pero `totalOrders` vive dentro del campo JSON `inputFeatures`
   - FIX: Cambiado a `p."inputFeatures"->>'totalOrders'` con cast apropiado
   - APRENDIZAJE: **Los datos de features de prediccion estan en `inputFeatures` (JSONB), NO como columnas separadas.**

3. **`column oi.productName does not exist`** (Error en customer detail)
   - SINTOMA: Endpoint customer-detail tiraba error SQL al intentar mostrar nombres de productos
   - CAUSA RAIZ: Tabla `order_items` NO tiene columna `productName`. Los nombres estan en tabla `products` via `productId` FK.
   - FIX: JOIN a `products` table y usar `COALESCE(p.name, 'Producto')`
   - APRENDIZAJE: **Schema de order_items: id, quantity, unitPrice, totalPrice, costPrice, orderId, productId. SIN productName.**

4. **SQL LIMIT inside string_agg** (Error de sintaxis PostgreSQL)
   - SINTOMA: Query con `string_agg(p.name, ', ' LIMIT 5)` fallaba
   - CAUSA RAIZ: PostgreSQL no permite LIMIT directamente dentro de una funcion de agregacion
   - FIX: Wrapping en subselect: `SELECT string_agg(sub.name, ', ') FROM (SELECT ... LIMIT 5) sub`
   - APRENDIZAJE: **Para limitar items en string_agg, siempre usar subquery wrapping.**

5. **Predicciones LTV infladas — $4.8M para cliente de $158K** (BUG MATEMATICO)
   - SINTOMA: Clientes con 2 compras en 3-4 dias aparecian con predicciones de millones de pesos
   - CAUSA RAIZ: El motor extrapolaba frecuencia personal linealmente. 2 compras en 4 dias = 0.25 compras/dia = ~91 compras en 365 dias. Multiplicado por ticket promedio, daba millones.
   - ANALISIS: 35 clientes con ratio > 5x (muy inflados), 122 con ratio 3-5x. El 93.8% de high_value tenia ratio razonable (<2x).
   - FIX: 3 guardrails implementados:
     - Guardrail 1 (MIN_HISTORY_DAYS=30): Clientes con <30 dias usan cohort_boosted, no personal_history
     - Guardrail 2 (MAX_FREQ_PER_DAY=1/7): Frecuencia personal capeada a max 1 compra/semana
     - Guardrail 3 (PREDICTION_CAP_MULTIPLIER=3): Prediccion max = 3x gasto real
   - BENCHMARKS: Google CrystalValue usa zero-inflated lognormal (modela prob de no-compra). Klaviyo requiere 180+ dias. Triple Whale ni siquiera predice individual.
   - APRENDIZAJE: **Toda extrapolacion de frecuencia necesita: (a) minimo de historia, (b) cap de frecuencia, (c) cap de prediccion. Sin estos guardrails, clientes recientes con multiples compras generan predicciones absurdas.**
   - Commit: 6da6c9d

6. **`inputFeatures` null para orderCount/totalSpent** (datos legacy)
   - SINTOMA: Campos dentro de inputFeatures mostraban null en la UI
   - CAUSA RAIZ: Las predicciones en DB fueron escritas por la v2 del engine (test run anterior) que no incluia estos campos. La v3 SI los escribe.
   - FIX: No se corrigio directamente — se recalculan las predicciones desde la UI con el POST /api/ltv/predict
   - APRENDIZAJE: **Tras cambiar el schema de inputFeatures, hay que recalcular las predicciones para que los datos nuevos se graben.**

#### Que se hizo:

1. **Fix build colgado** (0aafb0d)
   - Removido `prisma db push` del build command

2. **Customer details en top 20 predicciones** (1b60f12)
   - Agregado ordenes, gasto total, primera/ultima orden, dias como cliente al query GET /api/ltv/predict

3. **Nota "Sin datos"** (4409537)
   - Clientes con canal "Sin datos" son anteriores a la instalacion del NitroPixel
   - Nota explicativa en la UI

4. **Umbrales configurables con auto-sugerencia** (9eec0de)
   - Nuevo endpoint /api/settings/ltv (GET + PUT)
   - Auto-sugerencia basada en percentiles reales (p50=low, p90=medium, redondeados a 5K)
   - UI colapsable en pagina LTV para configurar
   - Motor parametrizado: recibe umbrales como argumentos

5. **Customer detail expandible** (6ff64d1)
   - Click en chevron en top 20 -> expande historial de ordenes
   - Muestra: prediction features + lista de ordenes con fecha, monto, status, items, productos

6. **Fix customer detail query** (0ca3726)
   - Corregido JOIN a products para nombres, subselect para LIMIT en string_agg

7. **Hero de credibilidad** (90df13e)
   - Banner gradiente violeta con descripcion BG/NBD
   - Badges: Meta CAPI, Google Ads, NitroPixel
   - Pipeline visual: Purchase Data -> pLTV Engine -> NitroPixel -> Meta/Google

8. **3 guardrails anti-inflacion** (6da6c9d)
   - MIN_HISTORY_DAYS = 30 (usa cohort_boosted si <30 dias)
   - MAX_FREQ_PER_DAY = 1/7 (cap de frecuencia)
   - PREDICTION_CAP_MULTIPLIER = 3 (max prediccion = 3x gasto)
   - Nuevo metodo `cohort_boosted` con boost 1.5x (2 ordenes) o 2x (3+)
   - Confidence reducida para clientes con historia insuficiente

9. **Documentacion Session 5** (83676eb)
   - Actualizado CLAUDE_STATE.md con todos los commits, errores, aprendizajes de la sesion

10. **Reorganizacion sidebar** (042445b)
   - Estructura cambiada de NavItem[] flat a NavGroup[] con 7 grupos
   - Grupos: OPERACIONES (Centro de Control, Pedidos, Analytics), CATALOGO (Productos), MARKETING Y ADQUISICION (Campanas, NitroPixel, SEO), CLIENTES (Segmentacion, Lifetime Value), CANALES (MercadoLibre, Competencia), FINANZAS (P&L con children), sin-grupo (Alertas, Chat IA, Configuracion)
   - Labels renombrados: Overview -> Centro de Control, Ordenes -> Pedidos, Finanzas -> P&L
   - Separadores visuales sutiles entre grupos (border-t + label uppercase tracking)
   - 14 items preservados sin cambios en rutas, iconos, children ni logica
   - Decision: nombres mayormente en espanol con terminos estrategicos en ingles (Lifetime Value, SEO)

#### Archivos nuevos creados (2):
- `src/app/api/settings/ltv/route.ts` — GET/PUT umbrales + auto-sugerencia
- `src/app/api/ltv/customer-detail/route.ts` — Historial de ordenes de cliente

#### Archivos modificados (5):
- `package.json` — Removido `prisma db push` del build command
- `src/lib/ltv/prediction-engine.ts` — v1 -> v3: parametrizado + 3 guardrails + cohort_boosted
- `src/app/api/ltv/predict/route.ts` — v1 -> v2: lee umbrales de settings + customer details en top 20
- `src/app/(app)/customers/ltv/page.tsx` — v2 -> v3: threshold config UI + expandable customer detail + nota Sin datos + hero credibilidad
- `src/app/(app)/layout.tsx` — v1 -> v2: sidebar reorganizado en 7 grupos con separadores visuales y labels renombrados

#### Investigacion realizada:
- Analisis profundo de 47,264 predicciones contra datos reales
- Benchmark contra 6 sistemas de produccion: Google CrystalValue (ZILN), Klaviyo (BG/NBD), Triple Whale (cohortes), Meta pLTV (clasificacion), Lifetimely (ML), Northbeam (analitico)
- Cross-tab gasto real vs segmento predicho: 10,988 clientes medium por gasto real clasificados como high por prediccion
- Repeat rates reales: high bucket 6.2%, medium 16.3%, low 13.6%
- 85.9% de clientes compraron 1 sola vez

#### Decisiones tomadas con Tomy:
- Umbrales deben ser configurables por el usuario + auto-sugeridos por el sistema
- Tomy pidio analisis McKinsey-level de datos reales antes de definir umbrales
- Nuevos umbrales propuestos y aceptados: low=$25K, medium=$100K (basados en percentiles reales)
- Customer detail expandible para verificacion humana de predicciones
- Hero de credibilidad para mostrar validacion Meta/Google y pipeline NitroPixel
- Guardrails aprobados para implementar, pero envio a plataformas NO activar sin aprobacion explicita

---

### 2026-04-03 — Sesion 4 (Modulo Margenes Completo + IVA Fix + Cross-Filtering)

**Commits**: ebc168a, d63fd48, 2da1b43, efbeacb, 9173a9d (5 commits)
**Deploy**: Vercel auto-deploy OK (9173a9d -> main)

#### Que se hizo:

1. **Tab Margenes en Productos** (ebc168a)
   - Nuevo tab "Margenes" en products/page.tsx
   - 4 KPI cards: Margen Bruto Prom (ponderado por revenue), Revenue Neto, Ganancia Bruta, Productos Sin Costo
   - Chart distribucion por rango de margen (Negativo, 0-30%, 30-50%, 50-70%, 70%+)
   - Chart horizontal margen por marca (top 10)
   - Tabla margen por categoria: Revenue, COGS, Margen %, Ganancia, Productos
   - Top 10 mas rentables y Top 10 menos rentables
   - Datos: solo productos con costPrice cargado

2. **Catalogo Completo de Margenes** (d63fd48)
   - Tabla full catalog dentro del tab Margenes con 10 columnas
   - Columnas: Producto, Precio, Costo, Margen %, Margen $/ud, Unidades, Facturacion, Ganancia, Stock, ABC
   - Paginacion (50 items/pagina)
   - Sort por cualquier columna
   - Chips de filtro por rango de margen (Negativo, 0-30%, 30-50%, 50-70%, 70%+) con conteo
   - Exportar CSV con todos los campos

3. **Fix IVA + Filtros Inline** (2da1b43) — Fix critico identificado por Tomy
   - PROBLEMA: El precio de venta incluye 21% IVA pero el costo NO incluye IVA
   - Todos los margenes estaban inflados porque comparaban precio con IVA vs costo sin IVA
   - FIX API: Agregado IVA_RATE = 1.21, revenueNeto = revenue / 1.21, avgPriceNeto = avgPrice / 1.21
   - Recalculados TODOS los margenes con revenueNeto: distribucion, byBrand, byCategory, marginAnalysis
   - Agregados campos revenueNeto y avgPriceNeto al tipo ProductMetrics y response
   - FIX FRONTEND: Parseo de nuevos campos, tooltips actualizados a "sin IVA"
   - Agregados filtros inline en catalogo de margenes: busqueda, dropdown marca, dropdown categoria

4. **Markup % + Column Selector** (efbeacb)
   - Columna Markup % en tabla de margenes: markup = (precioNeto - costo) / costo * 100
   - Badges de color: verde >= 100%, amarillo >= 50%, rojo < 50%
   - Sort por Markup
   - Markup incluido en CSV export
   - Componente ColumnSelector reutilizable (dropdown con checkboxes Eye/EyeOff)
   - Aplicado a tabla Overview (10 columnas configurables) y tabla Margenes (10 columnas configurables)
   - Tipo ColumnConfig: { key, label, defaultVisible }

5. **Cross-Filter Category/Brand + Markup en Tabla Categorias** (9173a9d)
   - PROBLEMA: Las tablas de "Margen por Categoria" y "Margen por Marca" usaban datos pre-computados del API, no respetaban los filtros de marca/categoria
   - FIX: computedByCategory y computedByBrand calculados client-side desde `filtered` (que ya respeta brandFilter/categoryFilter)
   - Seleccionar una marca -> tabla categorias muestra solo categorias de esa marca
   - Seleccionar una categoria -> chart marcas muestra solo marcas de esa categoria
   - Dropdowns de marca y categoria en el header de la tabla de categorias
   - Indicadores de filtro activo en ambas secciones
   - Columna Markup % en tabla de categorias con badges de color

#### Archivos modificados:
- `src/app/api/metrics/products/route.ts` — v1 -> v2: IVA fix, +revenueNeto, +avgPriceNeto, recalculo de todos los margenes
- `src/app/(app)/products/page.tsx` — v10.1 -> v11: +tab Margenes completo, +catalog table, +column selector, +inline filters, +markup, +cross-filtering. De ~1200 a 1865 lineas

#### Decisiones tomadas con Tomy:
- El IVA fix fue identificado por Tomy: "el precio tiene IVA incluido, y el costo no tiene IVA"
- Tomy pidio que las tablas de categoria se puedan filtrar por marca (cross-filtering)
- Tomy pidio columna Markup % ademas de Margen %
- Tomy pidio poder personalizar que columnas ver en las tablas

---

### 2026-04-02 — Sesion 3 (LTV Dashboard + Motor de Prediccion pLTV)

**Commits**: d950cef (LTV dashboard), b058253 (MELI exclusion fix), d4eb371 (prediction engine + send modules)
**Deploy**: Vercel auto-deploy OK (d4eb371 -> main)

#### Que se hizo:
1. **LTV Analytics Dashboard** (d950cef)
   - Nuevo endpoint GET /api/metrics/ltv con 7 queries paralelas SQL
   - Nueva pagina /customers/ltv con: KPIs (LTV promedio, tasa recompra, dias p/ recompra, LTV:CAC), chart por canal, cohort retention heatmap, patron de recompra, top 20 clientes
   - Nav actualizado: Clientes ahora tiene children (Segmentacion + Lifetime Value)

2. **MercadoLibre Exclusion** (b058253) — fix critico identificado por Tomy
   - MercadoLibre no comparte datos de clientes (no email, no nombre, no customerId)
   - Agregado `AND o."source" != 'MELI'` a TODAS las queries LTV
   - Removido ML del frontend, agregado badge "Solo Tienda Propia (VTEX)"

3. **Motor de Prediccion pLTV** (d4eb371)
   - prediction-engine.ts: modelo cohort-based inspirado en BG/NBD. Segmentos = canal x ticket bucket
   - Clientes 1 compra: cohort lookup. Clientes 2+: blend 70% personal / 30% segmento
   - POST /api/ltv/predict: batch prediction para todos los clientes
   - send-meta.ts: envio de predicted_ltv a Meta CAPI (DESACTIVADO)
   - send-google.ts: RESTATEMENT a Google Ads Conversion Adjustments (DESACTIVADO)
   - Frontend: seccion predicciones en dashboard LTV con KPIs, tabla, distribucion
   - Prisma: nuevo modelo CustomerLtvPrediction con triple candado seguridad

#### Schema changes:
- Nuevo model: CustomerLtvPrediction (customer_ltv_predictions table)
- Relaciones: Customer.ltvPredictions[], Organization.ltvPredictions[]
- Indices: orgId+segmentBucket, orgId+sentToMeta, orgId+sentToGoogle
- **prisma db push ejecutado exitosamente**

#### Decisiones tomadas con Tomy:
- Envio a Meta/Google DESACTIVADO hasta que Tomy apruebe (ve y valida las predicciones primero)
- Se discutio enviar solo alto valor — explicado que Meta/Google necesitan rango completo
- Se discutio estacionalidad (Dia del Nino agosto) — modelo captura patrones via datos historicos, mejora futura posible
- Se discutio requisito de datos historicos — no requiere 3 anios, con 50-100 clientes recurrentes ya funciona
- Ruta cost-free: prediccion in-house + batch delivery, sin Google Vertex AI

### 2026-04-02 — Sesion 2 (P&L Dual View + InfoTips + Cost Prices Sync Fix)

**Commits**: 5c056f2, 36e9aec
**Deploy**: Vercel auto-deploy OK (36e9aec -> main)

#### Que se hizo:

1. **Fix critico: Sync de precios de costo desde VTEX**
   - El endpoint `/api/sync/cost-prices` usaba VTEX Catalog API (`stockkeepingunitbyid`) que NO devuelve costPrice
   - DESCUBIERTO: El costPrice vive en VTEX Pricing API (`/api/pricing/prices/{skuId}`), NO en Catalog
   - Se necesitaba permiso "Read prices" en VTEX License Manager (recurso "Price List")
   - Se actualizo el endpoint con dual-source: Pricing API (primary) + Catalog (fallback)
   - Se sincronizaron ~1,487 de 22,673 productos antes de frenar (el resto se cargara via Excel)
   - Commit: 5c056f2

2. **P&L Dual View: Vista Ejecutiva + Detallada**
   - Vista Ejecutiva: Score card con semaforo de salud (Excelente/Saludable/Aceptable/Ajustado/Negativo), cascada de 3 cards (Facturacion/Costos/Resultado), mini sparkline, canales de un vistazo
   - Vista Detallada: 5 KPI cards consolidadas, unit economics (AOV, costo x unidad, margen x unidad), waterfall/trend chart toggle, P&L statement completo con IVA para RI, payment fees detallados, descuentos, costos manuales, P&L por canal, margen por categoria y marca
   - Toggle Ejecutivo/Detallado en header
   - `getHealthStatus()` con 5 niveles y colores
   - Commit: 5c056f2

3. **InfoTip tooltips explicativos en todo el P&L**
   - Componente `InfoTip` con icono "?" y tooltip hover
   - +30 tooltips en ambas vistas explicando terminos financieros en espanol claro
   - Pensado para usuarios no-financieros: Revenue, COGS, Margen Bruto, AOV, Beneficio Neto, comisiones, envios, IVA, etc.
   - Cada fila del P&L statement tiene su propio tooltip con `row.tip`
   - Commit: 36e9aec

#### Archivos modificados:
- `src/app/(app)/finanzas/page.tsx` — Rewrite completo (955 lineas): dual view + InfoTips
- `src/app/api/sync/cost-prices/route.ts` — Pricing API primary + Catalog fallback

### 2026-04-02 — Sesion 1 (Modulo Finanzas completo + Period Selector + Deep Audit)

**Commits**: 2600e73..3dd6d00 (22 commits)
**Deploy**: Vercel auto-deploy OK para cada commit

#### Que se hizo:

1. **SEO Intelligence v2** (2600e73)
   - 5 tabs: Overview, Keywords, Pages, Oportunidades, Movimientos
   - 14 queries paralelas en metrics/seo
   - Cannibalization detection, movers up/down

2. **Audit fixes quirurgicos** (b42e533)
   - ML Dashboard: filtro status `notIn: ['CANCELLED', 'RETURNED']` en KPIs y graficos
   - ML Preguntas: removido `take: 200` de promedio tiempo respuesta
   - Google Ads sync: timezone corregido a `-03:00` en 5 instancias
   - SEO frontend: traducciones paises faltantes (DOM, VEN, CRI, PAN, GTM)

3. **PeriodSelector unificado** (d58cf24, c2e39c3)
   - Componente reutilizable `PeriodSelector.tsx`
   - Quick ranges (7d, 14d, 30d, 90d) + Hoy + Ayer + rango custom con boton Aplicar
   - Integrado en: Dashboard, Analytics, Pixel, MercadoLibre, SEO (5 secciones)

4. **P&L Source Breakdown** (4ee511b)
   - P&L separado por canal: VTEX vs MELI
   - Comisiones de plataforma por canal con labels descriptivos
   - `platformFee`, `platformFeeLabel`, `mlCommission`, `mlTaxWithholdings` por source

5. **Modulo Costos Operativos completo** (d8e336a..8fd35fd, 10 commits)
   - Pagina `/finanzas/costos` con 1532 lineas
   - 8 categorias: LOGISTICA, EQUIPO, PLATAFORMAS, FISCAL, INFRAESTRUCTURA, MARKETING, MERMA, OTROS
   - Tarifas de envio: import Excel, template download, calculo por CP+carrier+servicio
   - Perfil fiscal: Monotributo vs RI, IIBB jurisdiccion, auto-generacion impuestos argentinos
   - Constancia AFIP: import PDF para auto-fill con pdf-parse
   - Costos auto-calculados: comisiones ML (% real del revenue MELI), merma estimada
   - Platform config: comision VTEX %, fees medios de pago editables
   - 12 nuevos API endpoints en `/api/finance/*`
   - 2 nuevos modelos Prisma: ManualCost, ShippingRate
   - 2 nuevos packages: exceljs, pdf-parse

6. **Deep Audit P&L** (323ced8, 3dd6d00)
   - Payment fees por metodo de pago con detalle
   - IVA debito fiscal para Responsable Inscripto
   - Descuentos y promociones separados
   - VTEX config editable (comision, fees medios de pago)
   - Merma tipos: roturas, devoluciones no recuperables, diferencias inventario

#### Archivos nuevos creados (12):
- `src/app/(app)/finanzas/costos/page.tsx`
- `src/app/api/finance/manual-costs/route.ts`
- `src/app/api/finance/fiscal-profile/route.ts`
- `src/app/api/finance/fiscal-profile/parse-constancia/route.ts`
- `src/app/api/finance/auto-costs/route.ts`
- `src/app/api/finance/platform-config/route.ts`
- `src/app/api/finance/shipping-rates/route.ts`
- `src/app/api/finance/shipping-rates/import/route.ts`
- `src/app/api/finance/shipping-rates/template/route.ts`
- `src/app/api/finance/shipping-rates/calculate/route.ts`
- `src/app/api/finance/shipping-rates/carriers/route.ts`
- `src/components/PeriodSelector.tsx`

#### Archivos modificados (22):
- `src/app/(app)/finanzas/page.tsx` — P&L source breakdown + manual costs
- `src/app/(app)/seo/page.tsx` — v2 con tabs + PeriodSelector
- `src/app/(app)/dashboard/page.tsx` — PeriodSelector
- `src/app/(app)/analytics/page.tsx` — PeriodSelector
- `src/app/(app)/pixel/page.tsx` — PeriodSelector
- `src/app/(app)/mercadolibre/page.tsx` — PeriodSelector
- `src/app/(app)/layout.tsx` — Nav submenu Finanzas (P&L + Costos)
- `src/app/api/metrics/pnl/route.ts` — +284 lineas: source breakdown, payment fees, IVA, discounts, manual costs
- `src/app/api/metrics/seo/route.ts` — v2 con 14 queries
- `src/app/api/metrics/route.ts` — PeriodSelector compat
- `src/app/api/metrics/trends/route.ts` — PeriodSelector compat
- `src/app/api/mercadolibre/dashboard/route.ts` — Fix status filter
- `src/app/api/mercadolibre/preguntas/route.ts` — Fix response time calc
- `src/app/api/sync/google-ads/route.ts` — Timezone fix -03:00
- `src/app/api/sync/vtex-details/route.ts` — +postalCode capture
- `src/app/api/sync/cost-prices/route.ts` — Pricing API + Catalog fallback
- `src/components/dashboard/DateRangeFilter.tsx` — Refactor para finanzas
- `prisma/schema.prisma` — +ManualCost, +ShippingRate, +Order fields
- `package.json` — +exceljs, +pdf-parse
- `src/types/pdf-parse.d.ts` — Type declaration

### 2026-04-02 (Auditoria completa + fixes quirurgicos pre-demo)
- Auditoria profunda de las 10 secciones, 29 rutas de sync, 9 crons, y consistencia cross-seccion
- Fix ML Dashboard: agregado status filter `notIn: ['CANCELLED', 'RETURNED']` a KPIs, grafico diario, y payment methods
- Fix ML Preguntas: removido `take: 200` del calculo de promedio de tiempo de respuesta (ahora usa todas las 1,048 respondidas)
- Fix Google Ads sync: cambiado timezone de `T00:00:00Z` a `T00:00:00.000-03:00` en 5 instancias (campaign, ad group, creative metrics)
- Fix SEO frontend: agregadas traducciones de paises faltantes (DOM, VEN, CRI, PAN, GTM)
- Verificado GA4 sync: FUNCIONANDO (7K-12K sessions/dia, datos hasta 31/03)
- Verificado VIEW_PRODUCT y ADD_TO_CART: FUNCIONANDO (75K y 12K eventos respectivamente)
- Verificado brand coverage: 66.3% (15,298 de 23,088 productos), mejorado desde 26%
- CLAUDE_STATE actualizado con hallazgos reales vs documentados

### 2026-04-01 (GSC Integration + SEO Intelligence v2)
- GSC conectado: service account con permiso Completo en Search Console
- GSC sync: endpoint dia-por-dia para evitar OOM (14K-33K rows/dia)
- Backfill 90 dias: 1,982,896 query rows + 236,531 page rows via script local
- SEO API v2: 14 queries paralelas (opportunities, movers up/down, new/lost keywords, cannibalization, country)
- SEO Frontend v2: 5 tabs (Overview, Keywords, Pages, Oportunidades, Movimientos)
- Commits: 70262ef (GSC sync fix), 2600e73 (SEO v2 completo)

### 2026-04-01 (Vercel Pro 800s + ML Data Verification)
- Vercel Pro CONFIRMADO visualmente en dashboard (badge Pro, Fluid Compute ON)
- maxDuration 800s configurado en vercel.json functions config (sync/** y cron/**)
- CRITICO: export const maxDuration en route files NO es suficiente — vercel.json functions config es OBLIGATORIO
- Verificacion quirurgica de produccion: reputation 3.1s OK, backfill 123.9s OK, todas las paginas HTTP 200
- ML Dashboard API verificado: 7,495 ordenes, 23M revenue, 32,936 listings, 1,051 preguntas
- Import ML sales: 185,765 ordenes desde 4 XLSX exports (mar 2025 a mar 2026) via import_ml_sales.py
- Backfill listings: 32,936 (6,375 active + 26,180 paused) via backfill_listings.py directo a ML API
- Backfill questions: 1,051 via backfill_questions.py directo a ML API
- Commits: c73edbf, c522591, 28816e5

### 2026-03-31 (MercadoLibre Seller Integration)
- Seccion ML completa: Dashboard, Publicaciones, Reputacion, Preguntas
- Nav submenu agregado a layout.tsx (patron Campanas)
- 4 API routes: /api/mercadolibre/{dashboard,publicaciones,reputacion,preguntas}
- 4 UI pages: /mercadolibre, /publicaciones, /reputacion, /preguntas
- Webhook real-time: /api/webhooks/mercadolibre (ML Notifications API)
- Notification processor: ml-notification-processor.ts (orders, items, questions, payments, shipments)
- Cron backup: /api/cron/ml-sync (cada 4h, missed_feeds + reputation)
- Vercel cron configurado en vercel.json
- mercadolibre-seller.ts v2: paginacion corregida, status filter, scroll_id para >1000 items
- Backfill chunkeado: /api/sync/mercadolibre/backfill (weekly orders, 60s timeout compatible)
- ML Developer Portal configurado: 9 topics + callback URL

### 2026-03-20 (Fase 4A: Infraestructura)
- 4A.1: Script init-prisma-migrate.sh para baseline migration
- 4A.2: Centralized VTEX credentials (vtex-credentials.ts) - eliminated ALL hardcoded tokens
- 4A.3: AES-256-GCM encryption module (crypto.ts) + migration script
- 4A.4: Auth guard module (auth-guard.ts) for org resolution from session
- Refactored 7 routes to use centralized credential access
- Removed hardcoded VTEX tokens from: backfill, webhooks, fix-brands, sync routes

### 2026-03-20 (Fase 3 completa)
- 3.1: Shared vtex-status.ts module + refactor 3 routes (dcdcb22)
- 3.2/3.3: Order validation module + 24 idempotency/anti-ghost tests (f14d4d0)
- 3.4: Float->Decimal(12,2) en 10 campos monetarios + auto-conversion middleware (a67f885)
- 3.5: DateTime->timestamptz en 5 campos de fecha (665fc10)
- 3.6: Tipar conector VTEX: eliminar 8 any types (71ff8b9)
- Fix: webhook routes usan shared Prisma singleton (no mas new PrismaClient())

### 2026-03-19 (Fase 2 completa)
- 2.1: fetchWithRetry integrado en VtexConnector (5 metodos)
- 2.2: Sync lock (mutex DB-based) en sync/route.ts y chain/route.ts
- 2.3: f_status filter en backfill/vtex (ultimo entry point anti-ghost)
- 2.4: Promise.allSettled batching en fetchProducts (grupos de 10)
- Commit: 8256d3f, deploy exitoso en Vercel

### 2026-03-16
- CLAUDE_STATE.md v3: Agregadas secciones PROHIBIDAS explÃ­citas para prevenir regresiones
- v10.1: Fixed 85+ mojibake characters + Bolsas solo en Overview + 6 FFFD fixes
- CLAUDE_STATE.md: Creado sistema de versiones (v1, actualizado a v2 con separaciÃ³n visual/API)
- fix-brands v5: Agregada resoluciÃ³n CategoryId â CategoryName via VTEX Category API
- fix-brands v5: Agregada acciÃ³n fix-categories para productos con categorÃ­a numÃ©rica
- fix-brands v5: Stats ahora incluyen cobertura de categorÃ­as (withCategory/withoutCategory)
- Batch processing de marcas+categorÃ­as iniciado (~23K productos pendientes)

### 2026-03-15
- products/page.tsx v10: Fix TypeError toLocaleString con optional chaining
- products/page.tsx v10: Fix 1L useMemo early return guard
- fix-brands v3: Creado endpoint con lookup VTEX 2-step (BrandIdâBrandName)
- fix-brands v4: Agregadas credenciales VTEX de backfill como fallback
- Env var VTEX_APP_KEY agregada en Vercel


---

## 🚨🚨🚨 REGISTRO DE ERRORES Y LECCIONES — LEER OBLIGATORIAMENTE 🚨🚨🚨

> **Fecha**: 2026-03-16 / 2026-03-17
> **Severidad**: CRITICA — Estos errores costaron horas de debugging y generaron datos incorrectos en produccion.
> **Regla**: Antes de CUALQUIER cambio, verificar que NO se esta por cometer uno de estos errores.

---

### ERROR #1: DATOS INCONSISTENTES ENTRE SECCIONES — Fuentes de verdad diferentes
**Que paso**: La pagina de Productos calculaba KPIs (Facturacion Total, Unidades) sumando `p.revenue` de cada fila de producto (tabla `order_items`), mientras que la pagina de Pedidos usaba `orders.totalValue` (tabla `orders`). Los numeros siempre diferian.
**Causa raiz**: El frontend de Products ignoraba el `summary` de la API y recalculaba totales desde product rows.
**Fix aplicado**: Commit `18d9780` — Products page ahora usa `summary.totalRevenue30d` / `totalItems30d` de la API (misma fuente que Orders).
**REGLA PERMANENTE**: 
- **UNA SOLA fuente de verdad para KPIs globales**: la tabla `orders` via `summary` de la API.
- **NUNCA** calcular totales globales sumando filas de `order_items` en el frontend — siempre usar el `summary` del backend.
- Antes de crear un KPI nuevo, preguntar: "de que tabla viene este dato? Es la misma que usa Orders?"

---

### ERROR #2: TIMEZONE UTC vs UTC-3 — Queries inconsistentes entre APIs
**Que paso**: Products API usaba `T23:59:59.999Z` (UTC) y Orders API usaba `T23:59:59.999-03:00` (Argentina). Esto generaba que las ordenes del borde del dia aparecieran en una seccion pero no en la otra.
**Causa raiz**: Copy-paste desde codigo generico sin adaptar al timezone del negocio.
**Fix aplicado**: Commit `1818df6` — Todas las fechas ahora usan `-03:00`.
**REGLA PERMANENTE**:
- **TODA fecha en queries SQL DEBE usar `-03:00` (America/Argentina/Buenos_Aires)**.
- **NUNCA usar `Z` (UTC)** en parametros de fecha para queries de NitroSales.
- **TODA funcion date_trunc() DEBE incluir `AT TIME ZONE 'America/Argentina/Buenos_Aires'`**.
- CHECKLIST antes de pushear queries con fechas: (1) timezone -03:00? (2) AT TIME ZONE presente? (3) Misma logica que Orders API?

---

### ERROR #3: BACKFILL SIN PAGINACION REAL — Perdia 67% de ordenes
**Que paso**: El backfill iteraba meses (batch=0,1,2...) pero SIEMPRE empezaba de page=1 en cada llamada. Con el timeout de 8s, procesaba ~5 de 15 ordenes por pagina, y luego saltaba al siguiente batch (mes), perdiendo las ordenes restantes de esa pagina y todas las paginas siguientes del mes.
**Causa raiz**: El parametro `page` no se pasaba correctamente entre llamadas. Luego, incluso con `page` arreglado, no habia `startIndex` para retomar DENTRO de una pagina despues de un timeout.
**Fix aplicado**: Commit `8f03833` (startIndex) + commit `88a1aa1` (page parameter).
**REGLA PERMANENTE**:
- **Todo proceso de paginacion DEBE tener**: (1) parametro `page`, (2) parametro `startIndex`, (3) logica de timeout que guarde la posicion exacta.
- **NUNCA** asumir que una pagina se procesa completa en un solo request — Vercel Hobby tiene 10s timeout.
- **SIEMPRE** devolver `nextPage` + `nextIndex` en la respuesta para retomar exactamente donde se corto.
- **VERIFICAR** despues de implementar paginacion: llamar una vez, ver que nextPage/nextIndex NO salten una pagina entera.

---

### ERROR #4: STATUS FILTER INCONSISTENTE — CANCELLED vs CANCELLED+RETURNED
**Que paso**: Products API excluia solo `CANCELLED` pero Orders API excluia `CANCELLED` y `RETURNED`. Las ordenes devueltas se contaban en Products pero no en Orders.
**Fix aplicado**: Commit `1818df6` — Ambas APIs ahora excluyen `('CANCELLED', 'RETURNED')`.
**REGLA PERMANENTE**:
- **El filtro de status DEBE ser identico en TODAS las APIs**: `NOT IN ('CANCELLED', 'RETURNED')`.
- Si se agrega un status nuevo a excluir, DEBE actualizarse en TODAS las APIs simultaneamente.
- CHECKLIST: metrics/orders, metrics/products, y cualquier query futura que filtre por status.

---

### ERROR #5: DEPLOYAR ARCHIVOS LOCALES VIEJOS — Sobreescribir produccion con drafts
**Que paso**: Se pusheo un archivo viejo desde la carpeta NitroSales IA/ que sobreescribio codigo de produccion ya funcionando, causando regresiones.
**REGLA PERMANENTE** (ya existia, se refuerza):
- **ABSOLUTAMENTE PROHIBIDO** pushear archivos desde `/NitroSales IA/`. Son BORRADORES.
- **SIEMPRE** leer el archivo ACTUAL de GitHub antes de modificar (fetch via GitHub API → read → modify → push).
- **NUNCA** hacer full-file rewrite. Solo cambios quirurgicos con string.replace() sobre el codigo actual de GitHub.

---

### ERROR #6: COLUMNA INEXISTENTE EN SQL — updatedAt en ON CONFLICT
**Que paso**: El SQL de backfill referenciaba `"updatedAt" = NOW()` en la clausula ON CONFLICT, pero la tabla `orders` no tiene columna `updatedAt` en el schema de Prisma.
**Fix aplicado**: Commit `a295f71` — Removida la referencia a updatedAt.
**REGLA PERMANENTE**:
- **ANTES de escribir SQL raw**, verificar que TODAS las columnas existen en `prisma/schema.prisma`.
- **NO asumir** que una tabla tiene campos estandar como updatedAt/createdAt — verificar el schema.

---

### ERROR #7: ENCODING MOJIBAKE — Caracteres Unicode rotos
**Que paso**: Caracteres como acentos (a, e, i, o, u), ene, emojis, y el signo menos Unicode se rompian al pasar por btoa/atob, resultando en texto garbled en produccion.
**Fix aplicado**: Multiples commits de correccion de encoding.
**REGLA PERMANENTE**:
- **USAR SOLO ASCII en strings visibles** al usuario: `a` en vez de `a`, `-` (guion ASCII 0x2D) en vez de `−` (minus sign Unicode).
- **Para btoa() con Unicode**: SIEMPRE usar `btoa(unescape(encodeURIComponent(content)))`.
- **EVITAR emojis en codigo fuente** — usar texto plano o entidades HTML.
- **VERIFICAR visualmente** despues de cada deploy que no haya caracteres rotos.

---

### ERROR #8: NO LEER CLAUDE_STATE.md — Repetir errores ya documentados
**Que paso**: En sesiones nuevas, se empezaba a trabajar sin leer este archivo, lo que llevaba a repetir errores ya cometidos y documentados.
**REGLA PERMANENTE**:
- **PRIMERA ACCION de TODA sesion**: leer CLAUDE_STATE.md completo.
- **Si el resumen de contexto dice algo diferente a CLAUDE_STATE.md**, prevalece CLAUDE_STATE.md.
- **NUNCA** confiar en el resumen de sesion anterior como unica fuente — siempre cruzar con este archivo.

---

### ERROR #9: HACER CAMBIOS SIN VERIFICAR CONTRA PRODUCCION
**Que paso**: Se pusheaban cambios y se asumia que funcionaban sin verificar los datos en la pagina real. Esto permitia que errores se acumularan sin deteccion.
**REGLA PERMANENTE**:
- **Despues de CADA push**: esperar deploy, recargar la pagina, y verificar que los numeros cambiaron como se esperaba.
- **Comparar siempre** Products vs Orders despues de cualquier cambio en queries.
- **Si un numero no cambio despues de un fix**, investigar cache ISR (Products API tiene revalidate=300, Orders tiene revalidate=0).

---

### ERROR #10: ASUMIR QUE SECCIONES DIFERENTES USAN LA MISMA LOGICA
**Que paso**: Se asumia que porque las APIs devolvian los mismos numeros, las paginas mostrarian lo mismo. Pero el frontend recalculaba sus propios totales.
**REGLA PERMANENTE**:
- **API alineada NO significa frontend alineado** — siempre verificar COMO el frontend consume los datos.
- **Leer el codigo del frontend** antes de declarar que un fix de API resuelve el problema.
- **Buscar** todos los `.reduce()`, `.map()`, y calculos client-side que puedan re-derivar numeros.

---

### ERROR #11: VTEX PRICING API vs CATALOG API — costPrice NO esta en Catalog
**Que paso**: El endpoint `/api/sync/cost-prices` usaba VTEX Catalog API (`/api/catalog_system/pvt/sku/stockkeepingunitbyid/{skuId}`) para obtener precios de costo. Sincronizo 22,673 productos pero TODOS quedaron con costPrice=0 (100 skipped, 0 updated).
**Causa raiz**: La VTEX Catalog API NO devuelve el campo CostPrice. El precio de costo vive en la VTEX **Pricing API** (`/api/pricing/prices/{skuId}`), que es un modulo separado con sus propios permisos.
**Investigacion**: Se probaron multiples endpoints de VTEX (catalog, pricing, computed prices, fixed prices, legacy pricing) hasta confirmar que `/api/pricing/prices/{skuId}` devuelve `costPrice: 6798` correctamente.
**Fix aplicado**: Commit 5c056f2 — El endpoint ahora usa Pricing API como fuente primaria con Catalog como fallback. Incluye check de permisos al inicio.
**REGLA PERMANENTE**:
- **El costPrice de VTEX vive en Pricing API, NO en Catalog API.**
- La Pricing API requiere permiso "Read prices" en License Manager (recurso "Price List").
- VTEX tiene modulos separados con permisos independientes — SIEMPRE verificar que el API key tiene el permiso del modulo correcto.
- Si un campo que deberia existir viene null/undefined, no asumir que no tiene dato — puede estar en OTRO modulo de VTEX.

---

### ERROR #12: VTEX PERMISSION 403 — Role no asociado al API key
**Que paso**: Despues de que el usuario tildo "Read prices" en License Manager, el endpoint seguia dando 403 Forbidden en Pricing API.
**Causa raiz (hipotesis 1)**: El usuario no habia guardado los cambios (confirmo que guardo "10 segundos despues" de la prueba).
**Causa raiz (real)**: El permiso "Read prices" se agrego al rol correcto (el asociado al API key de NitroSales), pero tomo unos segundos en propagarse.
**Cadena de permisos VTEX**: API Key -> Role -> Resources. Los tres eslabones deben estar conectados.
**REGLA PERMANENTE**:
- Verificar la cadena completa: (1) el recurso esta tildado? (2) en el rol correcto? (3) el rol esta asociado al API key correcto?
- Despues de cambiar permisos en VTEX License Manager, esperar 10-30 segundos antes de re-probar.
- Si sigue 403, pedir al usuario que verifique que GUARDO los cambios.

---

### ERROR #13: SYNC TIMEOUT POR SANDBOX — Proceso largo muere sin aviso
**Que paso**: Al correr el sync de cost-prices para 22,673 productos, el proceso murio repetidamente despues de ~1,200-1,500 productos sin error explicito.
**Causa raiz**: El sandbox de ejecucion tiene timeout implicito. No es un error de VTEX ni de la API.
**Workaround**: Se implemento ThreadPoolExecutor (15 workers) con resume capability (query solo productos sin costPrice). Se lograron ~1,487 antes de que el usuario pidiera frenar.
**Decision del usuario**: Cargar los costos restantes via Excel al dia siguiente.
**REGLA PERMANENTE**:
- Procesos que tocan >1000 registros con API calls externas NO se deben correr en sandbox interactivo.
- Para bulk operations, disenar endpoints con chunks y resume capability (query `WHERE costPrice IS NULL`).
- Siempre tener un plan B (Excel import, script local) para cuando el sync automatico sea lento.

---

### ERROR #14: CAMBIOS NO VISIBLES EN PRODUCCION — Falta commit + push
**Que paso**: Despues de reescribir finanzas/page.tsx completo (P&L dual view), el usuario dijo "la sigo viendo igual que antes" y "me parece que no se aplicaron los datos".
**Causa raiz**: Los cambios se hicieron en el repositorio local pero NO se committearon ni pushearon. Vercel necesita un push a main para triggear deploy.
**Fix**: Se hizo `git add + commit + push` y Vercel deployo automaticamente.
**REGLA PERMANENTE**:
- **Despues de CADA cambio significativo, commitear y pushear.**
- No dar por terminado un cambio hasta que este committeado, pusheado, y el usuario confirme que lo ve en produccion.
- Si el usuario dice "no veo los cambios", lo primero es verificar: (1) se committeo? (2) se pusheo? (3) Vercel deployo? (4) cache del browser?

---

### ERROR #15: IVA EN CALCULO DE MARGEN — Precios con IVA vs Costos sin IVA (2026-04-03)
**Que paso**: La pagina de Margenes mostraba margenes inflados para todos los productos. Por ejemplo, un producto con precio $12,100 y costo $6,798 aparecia con 43.8% de margen, cuando el real es 31.9%.
**Causa raiz**: En Argentina, los precios de venta incluyen 21% IVA pero los costos de compra no lo incluyen. El calculo de margen comparaba precio CON IVA vs costo SIN IVA, inflando el numerador artificialmente.
**Fix aplicado**: Commit 2da1b43 — Se agrego IVA_RATE = 1.21 en la API. revenueNeto = revenue / 1.21, avgPriceNeto = avgPrice / 1.21. TODOS los calculos de margen ahora usan revenueNeto: distribucion, byBrand, byCategory, marginAnalysis completo.
**REGLA PERMANENTE**:
- **En Argentina, precio de venta SIEMPRE incluye 21% IVA.** Para calcular margen, dividir precio por 1.21 primero.
- **Costo de compra (costPrice) NO incluye IVA.** Es el precio neto del proveedor.
- Formula correcta: `marginPct = (precioNeto - costo) / precioNeto * 100` donde `precioNeto = precio / 1.21`
- Formula markup: `markupPct = (precioNeto - costo) / costo * 100`
- NUNCA comparar precio con IVA contra costo sin IVA — el margen siempre saldra inflado.
- Si se agrega un modulo nuevo que calcule margenes, verificar que use revenueNeto, no revenue.

---

### ERROR #16: DATOS PRE-COMPUTADOS NO RESPETAN FILTROS — Tablas agregadas vs filtros activos (2026-04-03)
**Que paso**: La tabla "Margen por Categoria" mostraba TODAS las categorias sin importar si el usuario habia seleccionado una marca en los filtros. El usuario seleccionaba "Mattel" pero la tabla seguia mostrando categorias de todas las marcas.
**Causa raiz**: Los datos byCategory y byBrand venian pre-computados desde el API (`marginAnalysis.byCategory`), calculados sobre TODOS los productos. Los filtros de marca/categoria solo afectaban la tabla del catalogo, no las tablas agregadas.
**Fix aplicado**: Commit 9173a9d — Se movio el calculo de byCategory y byBrand al frontend como `useMemo` derivados de `filtered` (que ya respeta brandFilter/categoryFilter/searchTerm). Las tablas agregadas ahora usan `computedByCategory` y `computedByBrand` en vez de `marginAnalysis.byCategory/byBrand`.
**REGLA PERMANENTE**:
- **Si una seccion tiene filtros, TODAS las tablas/charts de esa seccion deben respetar los filtros**, no solo la tabla principal.
- Datos pre-computados en la API son utiles para la carga inicial, pero si hay filtros client-side, las agregaciones deben recalcularse en el frontend.
- Patron: usar `useMemo` derivado del array ya filtrado, no del response original de la API.
- Antes de agregar una tabla/chart nueva, preguntar: "esta tabla respeta los filtros activos de la seccion?"

---

### ERROR #17: INPUTS INVISIBLES POR CSS SPECIFICITY — globals.css override (2026-04-04)
**Que paso**: Los inputs en paginas admin del modulo Influencer no mostraban texto (blanco sobre blanco).
**Causa raiz**: `globals.css` tiene `body { color: var(--nitro-text) }` con `--nitro-text: #FFFFFF`. Los inputs heredan este color. Tailwind classes como `text-gray-900` pierden contra la especificidad de globals.css.
**Fix aplicado**: Inline styles `style={{ color: "#111827", backgroundColor: "#ffffff" }}` en todos los inputs.
**REGLA PERMANENTE**:
- **Inputs en paginas admin SIEMPRE necesitan inline style `color: "#111827"` y `backgroundColor: "#ffffff"`.**
- Tailwind text-color classes NO funcionan para inputs en NitroSales por la especificidad de globals.css.
- Este problema afecta a CUALQUIER pagina nueva que tenga formularios.

---

### ERROR #18: ASUMIR CAMPOS EN MODELOS SIN VERIFICAR SCHEMA — org.website (2026-04-04)
**Que paso**: El endpoint de aprobacion de influencers usaba `org.website` que no existe en el modelo Organization.
**Causa raiz**: Se asumio que Organization tenia campo `website` sin verificar schema.prisma. El campo `website` existe en CompetitorStore, no en Organization.
**Fix aplicado**: Reemplazado por `process.env.STORE_URL || "https://elmundodeljuguete.com.ar"`
**REGLA PERMANENTE**:
- **ANTES de acceder a un campo de cualquier modelo, verificar que EXISTE en prisma/schema.prisma.**
- En particular: Organization tiene name, slug, createdAt, settings (JSON). NO tiene website, url, domain, ni nada similar.
- Si necesitas la URL de la tienda: `process.env.STORE_URL` o hardcoded.

---

### ERROR #19: TOGGLE HABILITADO PERO SECCION OCULTA — Condicion con length > 0 (2026-04-04)
**Que paso**: Admin activo el toggle de productos para un influencer, pero la seccion no aparecia en el dashboard.
**Causa raiz**: La condicion `data.topProducts && data.topProducts.length > 0` ocultaba la seccion cuando el array estaba vacio (influencer nuevo sin ventas).
**Fix aplicado**: Cambiado a `data.topProducts !== undefined` con mensaje de empty state.
**REGLA PERMANENTE**:
- **Para features con toggle: mostrar empty state cuando habilitado pero sin datos, NO ocultar la seccion.**
- El usuario necesita feedback visual de que el toggle funciono.
- Patron: `{feature !== undefined ? (items.length > 0 ? <Content/> : <EmptyState/>) : null}`

---

### ERROR #20: PORTAL EXTERNO CON MULTIPLES URLs — Confusion del usuario (2026-04-04)
**Que paso**: El influencer tenia /i/[slug]/[code] para ganancias y /i/[slug]/[code]/content para contenido. Tomy se confundio.
**Causa raiz**: Se implementaron como paginas separadas durante Fase 5 por comodidad de desarrollo.
**Fix aplicado**: Unificado en 1 URL con 2 tabs. La URL /content redirige al dashboard principal.
**REGLA PERMANENTE**:
- **Portales para usuarios externos (influencers, proveedores, etc.) = UNA sola URL con navegacion interna.**
- Estos usuarios no son tech-savvy. Multiples URLs los confunden.
- Si necesitas secciones diferentes, usar tabs/accordions dentro de la misma pagina.
- Lazy-load el contenido de tabs no activos para performance.

---

### ERROR #21: NAV SIDEBAR SOBRECARGADO — Mas de 7 items en dropdown (2026-04-04)
**Que paso**: Tras Fase 5, el dropdown de Influencers tenia 10 items. Tomy dijo que estaba "muy cargado".
**Causa raiz**: Se agregaron items incrementalmente sin pensar en la experiencia del nav completo.
**Fix aplicado**: Separado en 2 secciones (Influencers + Contenido) bajo NITRO CREATORS.
**REGLA PERMANENTE**:
- **Un dropdown/submenu NO debe tener mas de 6-7 items.** Si excede, reorganizar en secciones.
- Antes de agregar items a un submenu existente, contar cuantos tiene. Si ya tiene 6+, crear nueva seccion.
- El usuario percibe la sobrecarga antes que el developer.

---

### PROTOCOLO PRE-CAMBIO (OBLIGATORIO)

Antes de CUALQUIER modificacion a codigo de NitroSales:

1. Lei CLAUDE_STATE.md completo?
2. Hice fetch del archivo ACTUAL de GitHub (no uso version local)?
3. Mi cambio es quirurgico (string.replace), no full-file rewrite?
4. Si toca fechas: uso -03:00 y AT TIME ZONE?
5. Si toca status filter: incluye CANCELLED y RETURNED?
6. Si toca SQL: todas las columnas existen en schema.prisma?
7. Si toca KPIs: uso summary de orders table, no calculo desde order_items?
8. Si toca paginacion: tengo page + startIndex + timeout handling?
9. Solo uso ASCII (sin acentos, sin emojis, sin Unicode especial)?
10. Pregunte al usuario antes de deployar?
11. Si calculo margenes: uso precioNeto (precio/1.21), no precio con IVA?
12. Si agrego tabla/chart: respeta los filtros activos de la seccion?
13. Si creo inputs en admin: tienen inline style color="#111827" backgroundColor="#ffffff"?
14. Si accedo a campos de un modelo: verifique que existen en schema.prisma?
15. Si agrego feature con toggle: muestro empty state cuando habilitado pero sin datos?
16. Si creo portal para usuario externo: es UNA sola URL con navegacion interna?
17. Si agrego items a un submenu: tiene menos de 7 items despues de agregar?

**Si alguno de estos puntos no se cumple, DETENER y corregir antes de continuar.**

---

## NITROPIXEL — Estado del Pixel de Atribucion

### Ultima actualizacion: 2026-03-25

### Archivos del Pixel

| Archivo | Estado | Notas |
|---------|--------|-------|
| src/lib/pixel/attribution.ts | ACTIVO | Motor de atribucion session-based v2. 4 modelos: LAST_CLICK, FIRST_CLICK, LINEAR, NITRO. |
| src/app/api/pixel/script/route.ts | ACTIVO | Script JS servido a tiendas via GTM. Fresh/stale signal detection. |
| src/app/api/pixel/event/route.ts | ACTIVO | Receptor de eventos. Bot filter, CAPI integration. |
| src/app/api/metrics/pixel/route.ts | **v2** | ACTIVO | **Sesion 18**: 26 queries paralelas. Nuevas: conversionLag (buckets), deviceBreakdown, popularPages (SPLIT_PART, uniqueVisitors, sin checkout), perDayCoverage, channelRoles (first/assist/last/solo touch), nitroWeights en meta. PAYMENT_GATEWAY_SOURCES blacklist filter. Cache key v2 (bust post-gocuotas cleanup). |
| src/app/api/metrics/pixel/discrepancy/route.ts | **v1.1** | ACTIVO | Revenue discrepancy report (pixel vs plataforma). Sesion 18: PAYMENT_GATEWAY_SOURCES filter aplicado. |
| src/lib/pixel/capi.ts | ACTIVO | Meta Conversions API integration. |
| src/lib/pixel/identity.ts | ACTIVO | Identity resolution, cross-device merge. |

### Commits del Pixel (cronologico)

| Commit | Descripcion |
|--------|-------------|
| 773449c | Phase 1: CAPI, cross-domain cookies, bot filter, PAGE_VIEW dedup, organic detection |
| 7b4e06b | Fix: remove 'whatsapp' from BOT_PATTERNS (bloqueaba WhatsApp in-app browser) |
| cd8a5c7 | Phase 2: attribution window configurable, early identify, discrepancy report, view-through |
| 797abd3 | Session-based touchpoint engine: fresh/stale signals, _isLanding fix, session dedup |
| 3e7871e | Audit fixes: backward compat, unknown sessionId by day, internal referrer protection |
| 8462cdd | CLAUDE_STATE.md update with NitroPixel section and pending tasks |
| 1333e46 | Complete conversion funnel tracking: VIEW_PRODUCT, ADD_TO_CART, IDENTIFY fix |
| 420db69 | FIX CRITICO: regex escaping bug en template literal + ADD_TO_CART via VTEX orderForm API |
| 8e7cba6 | SPA navigation tracking: pushState/popstate/hashchange hooks para VTEX SPA |

### Funcionalidades Completadas

- Cross-domain cookie persistence (LATAM multi-part TLDs: .com.ar, .com.br, etc.)
- Bot filtering (BOT_PATTERNS regex, UA validation) — CUIDADO: WhatsApp NO es bot
- PAGE_VIEW deduplication (1 per session)
- Organic/social/referral source detection via referrer
- Session-based touchpoint engine (1 touchpoint per session, not per event)
- Fresh vs stale signal detection (_signals_fresh, _is_landing flags)
- Configurable attribution window (7/14/30/60 days via org.settings.attributionWindowDays)
- Early identification (VTEX profile API, login forms, account pages)
- Revenue discrepancy report (pixel vs Meta/Google reported)
- View-through attribution (organic visits + active ad spend)
- Meta CAPI integration (fire-and-forget on PURCHASE)
- XSS protection on orgId parameter
- localStorage null-safety for visitor ID recovery
- Conversion funnel tracking: VIEW_PRODUCT (dataLayer + URL fallback + SPA), ADD_TO_CART (dataLayer + VTEX orderForm API)
- IDENTIFY events now persist to pixel_events (email stripped for PII)
- SPA navigation tracking: pushState, replaceState, popstate, hashchange hooks
- ADD_TO_CART via VTEX orderForm API interception (fetch + XMLHttpRequest)
- VTEX dataLayer interception: productView, addToCart, view_item, add_to_cart, Enhanced Ecommerce

### PENDIENTES PIXEL

#### PENDIENTE #1: RESUELTO — Comparacion NitroPixel vs GA4
- **Resultado 2026-03-25**: GA4 sync estuvo ROTO desde 19/03 hasta ~fin de marzo (mostraba 1-12 sesiones/dia).
  **RESUELTO**: Verificado 2026-04-01, datos normales desde al menos 02/03 (7K-12K sessions/dia). Sync OK.
- **Baseline GA4 (pre-19/03)**: avg 8,468 users/dia, 10.5 pages/session, 106K PVs/dia.
- **NitroPixel 24/03**: 5,087 visitors, 1.9 pages/session, 10,850 PVs.
- **Diagnostico**: NitroPixel mostraba MENOS que GA4 porque no trackeaba SPA navigation.
  VTEX es SPA, y GA4 cuenta cada navegacion interna. FIX aplicado en commit 8e7cba6.
- **POST-FIX esperado**: Con SPA tracking, NitroPixel deberia subir a ~8-10 pages/session,
  acercandose a GA4. Visitantes unicos deberian ser similares o ligeramente mayores.
- **RESUELTO 2026-04-01**: GA4 service account OK. Datos normales en todo marzo.

#### PENDIENTE #2: totalPageViews cuenta TODOS los eventos, no solo PAGE_VIEW
- **Que**: La query del dashboard usa COUNT(*) como "totalPageViews" pero cuenta IDENTIFY,
  ADD_TO_CART, PURCHASE, etc. Deberia ser COUNT(*) FILTER (WHERE type = 'PAGE_VIEW').
- **Impacto**: Numero inflado en el dashboard. No afecta atribucion ni visitantes unicos.
- **Prioridad**: Baja — corregir cuando se trabaje en el dashboard.

#### PENDIENTE #3: Warnings de la auditoria (no criticos, para futuro)
- View-through detection usa ventana de 24h (podria ser configurable)
- Session timeout no enforzado server-side (sesiones largas sin actividad)
- Script cache 5min puede causar data mixta durante deploys
- Implicit any en sort callback (attribution.ts linea 178)

#### PENDIENTE #4: Verificar que VIEW_PRODUCT y ADD_TO_CART fluyen post-deploy
- Los commits 420db69 y 8e7cba6 se deployaron el 25/03 ~01:00 UTC.
- Esperar trafico de producto y verificar que existen events type='VIEW_PRODUCT' y 'ADD_TO_CART'.
- El regex escaping bug impedia TODOS los VIEW_PRODUCT. Ya corregido.
- ADD_TO_CART ahora intercepta VTEX orderForm API (fetch + XHR).
- SPA tracking genera PAGE_VIEW + VIEW_PRODUCT en navegaciones internas.

#### PENDIENTE #5: RESUELTO — GA4 sync roto desde 19/03
- **Verificado 2026-04-01**: GA4 sync funcionando correctamente. Datos completos hasta 31/03.
- Volumenes normales: 7,000-12,000 sessions/dia, 6,000-10,000 users/dia, 65K-107K pageviews/dia.
- Connection status: ACTIVE, sin errores.

---

## MERCADOLIBRE SELLER INTEGRATION — Estado al 2026-04-01

### Ultima actualizacion: 2026-04-02

### Cuenta conectada
- **Seller**: ELMUNDODELJUG (KAVOR S.A.)
- **ML User ID**: 137081041
- **ML App ID**: 5750438437863167
- **Plataforma**: MercadoLibre Argentina
- **Conexion**: OAuth2 con refresh_token automatico

### Arquitectura de Sync (3 capas)

**Capa 1: Webhook en tiempo real (PRINCIPAL)**
- Endpoint: `/api/webhooks/mercadolibre` (POST)
- Recibe notificaciones push de ML para: orders_v2, items, questions, payments, shipments, orders_feedback, items_prices, stock_locations, fbm_stock_operations
- Responde 200 en <500ms (requisito ML), procesa async via fire-and-forget
- Procesador: `src/lib/connectors/ml-notification-processor.ts`
- Callback URL configurada en ML Developer Portal: `https://nitrosales.vercel.app/api/webhooks/mercadolibre`

**Capa 2: Cron backup (RED DE SEGURIDAD)**
- Endpoint: `/api/cron/ml-sync` (GET)
- Corre cada 4 horas via Vercel Cron
- Recupera notificaciones perdidas via `/missed_feeds` API
- Sincroniza snapshot de reputacion diario
- Configurado en `vercel.json`

**Capa 3: Sync manual completo**
- Endpoint: `/api/sync/mercadolibre` (GET) — sync de listings + reputacion + ordenes (6 meses) + preguntas
- Endpoint: `/api/sync/mercadolibre/backfill` (GET) — backfill chunkeado por semanas para evitar timeout
  - `?step=orders&week=1` hasta `week=26` (6 meses de historico)
  - `?step=listings` — todas las publicaciones activas+pausadas
  - `?step=questions` — hasta 500 preguntas
  - `?step=reputation` — snapshot de reputacion

### Archivos ML (Seller)

| Archivo | Estado | Notas |
|---------|--------|-------|
| src/lib/connectors/mercadolibre-seller.ts | ACTIVO | Conector READ-ONLY. Token auto-refresh. Funciones: getSellerToken, fetchSellerListings, fetchSellerOrders, fetchSellerReputation, fetchSellerQuestions, fetchShipmentForOrder |
| src/lib/connectors/ml-notification-processor.ts | ACTIVO | Procesador async de notificaciones. Handlers: processOrder, processItem, processQuestion, processPayment, processShipment |
| src/app/api/webhooks/mercadolibre/route.ts | ACTIVO | Webhook endpoint. POST=procesar notificacion, GET=status check |
| src/app/api/cron/ml-sync/route.ts | ACTIVO | Cron backup: missed_feeds + reputation snapshot |
| src/app/api/sync/mercadolibre/route.ts | ACTIVO | Sync manual completo (5min timeout, solo Pro plan) |
| src/app/api/sync/mercadolibre/backfill/route.ts | ACTIVO | Backfill chunkeado (60s timeout compatible con free plan) |
| src/app/api/mercadolibre/dashboard/route.ts | ACTIVO | Dashboard API: KPIs, ventas diarias, status breakdown, payment methods |
| src/app/api/mercadolibre/publicaciones/route.ts | ACTIVO | Listings API: paginada, filtrable por status y busqueda |
| src/app/api/mercadolibre/reputacion/route.ts | ACTIVO | Reputacion API: snapshot actual + historico |
| src/app/api/mercadolibre/preguntas/route.ts | ACTIVO | Preguntas API: paginada, filtrable, top items |
| src/app/(app)/mercadolibre/page.tsx | ACTIVO | Dashboard ML: KPIs, ventas diarias chart, status breakdown, pagos |
| src/app/(app)/mercadolibre/publicaciones/page.tsx | ACTIVO | Tabla publicaciones: thumbnail, precio, stock, tipo, envio |
| src/app/(app)/mercadolibre/reputacion/page.tsx | ACTIVO | Reputacion: nivel, ratings, metricas performance, historial |
| src/app/(app)/mercadolibre/preguntas/page.tsx | ACTIVO | Preguntas: cola, top items, KPIs respuesta |

### Tablas DB usadas por ML Seller

- `orders` (source="MELI") — ordenes de ML mapeadas al modelo unificado
- `ml_listings` — publicaciones activas/pausadas con detalles
- `ml_seller_metrics_daily` — snapshots diarios de reputacion y metricas
- `ml_questions` — preguntas de compradores con respuestas
- `connections` (platform="MERCADOLIBRE") — credenciales OAuth, tokens, estado sync

### Datos actuales en DB (2026-04-01) — BACKFILL COMPLETADO

| Tabla | Registros | Estado |
|-------|-----------|--------|
| orders (MELI) | 185,765 | COMPLETO — importado desde export XLSX (mar 2025 a mar 2026) |
| ml_listings | 32,936 | COMPLETO — 6,375 activas + 26,180 pausadas via ML API directa |
| ml_questions | 1,051 | COMPLETO — via ML API directa (2 sin responder) |
| ml_seller_metrics_daily | 1 | OK — se llena diariamente via cron |

### PENDIENTES ML

#### PENDIENTE ML #1: RESUELTO — Backfill historico completado (2026-04-01)
- Ordenes: 185,765 importadas desde export XLSX (4 archivos, mar 2025 a mar 2026)
- Listings: 32,936 importadas via script local contra ML API (scroll_id para >1000)
- Preguntas: 1,051 importadas via script local contra ML API
- Script de importacion: import_ml_sales.py (ordenes), backfill_listings.py, backfill_questions.py

#### PENDIENTE ML #2: Verificar webhook recibe notificaciones reales
- Webhook responde 200 a POST de prueba (verificado 2026-04-01)
- Falta verificar con eventos reales de ML (ordenes/preguntas nuevas)
- Verificar en Vercel logs que processMLNotification se ejecuta correctamente

#### PENDIENTE ML #3: RESUELTO — Vercel Pro 800s confirmado y verificado
- Vercel Pro CONFIRMADO visualmente en dashboard (badge Pro visible)
- Fluid Compute habilitado en Settings > Functions
- maxDuration=800 configurado en vercel.json (functions config, NO solo export const)
- VERIFICADO: questions backfill corrio 123.9s sin corte (antes cortaba a 60s)
- VERIFICADO: todas las paginas de produccion siguen respondiendo HTTP 200 en <1s
- vercel.json functions config es OBLIGATORIO — export const maxDuration solo NO alcanza
- Commits: c73edbf (300s), c522591 (vercel.json config), 28816e5 (bump a 800s)

---


## FINANZAS (P&L + Costos Operativos) — Estado al 2026-04-02

### Arquitectura

**Frontend**:
- `/finanzas` — P&L con dual view (Ejecutivo/Detallado), toggle en header, date picker
- `/finanzas/costos` — 8 categorias de costos manuales, perfil fiscal, tarifas envio, constancia AFIP

**Backend APIs**:
- `/api/metrics/pnl` — P&L completo con source breakdown, payment fees, IVA, discounts, manual costs
- `/api/finance/manual-costs` — CRUD costos por categoria y mes
- `/api/finance/fiscal-profile` — Perfil fiscal (condicion IVA, IIBB, jurisdiccion)
- `/api/finance/fiscal-profile/parse-constancia` — PDF parser para constancia AFIP
- `/api/finance/auto-costs` — Costos auto-calculados (comisiones ML, merma)
- `/api/finance/platform-config` — Config VTEX (comision %, fees medios de pago)
- `/api/finance/shipping-rates/*` — CRUD + import Excel + template + calculate + carriers
- `/api/sync/cost-prices` — Sync precios de costo desde VTEX Pricing API

**Modelos Prisma nuevos**:
- `ManualCost` — costos manuales por categoria/mes/tipo
- `ShippingRate` — tarifas de envio por carrier/servicio/CP

**Packages nuevos**: exceljs (Excel import/export), pdf-parse (constancia AFIP)

### Datos de costos en P&L

El P&L (`/api/metrics/pnl`) ahora calcula y devuelve:
- `revenue` — facturacion total
- `cogs` — costo de mercaderia (de product.costPrice)
- `cogsCoverage` — % de items con precio de costo cargado
- `adSpend` — Meta + Google (de ad_campaign_metrics)
- `shipping` — envios (de orders)
- `platformFees` — comisiones de plataforma (ML real + VTEX config %)
- `paymentFees` — fees medios de pago (por metodo: tarjeta, debito, MP, transferencia)
- `discounts` — descuentos y promociones (de orders.promotionNames)
- `manualCostsTotal` — costos manuales cargados por el usuario
- `isRI` — si la org es Responsable Inscripto
- `ivaDebitoFiscal` — IVA 21% sobre revenue (solo RI)
- `revenueNetoIVA` — revenue sin IVA (solo RI)
- `bySource[]` — breakdown por canal (MELI, VTEX) con P&L individual
- `paymentFees[]` — detalle de fees por metodo y source

### VTEX Cost Price Sync

**Estado actual**: ~1,487 de 22,673 productos tienen costPrice sincronizado.
**Pendiente**: El usuario va a proporcionar un Excel con todos los costos para bulk import.
**API correcta**: VTEX Pricing API (`/api/pricing/prices/{skuId}`) — NO Catalog API.
**Permiso necesario**: "Read prices" en License Manager, recurso "Price List".
**VTEX account**: mundojuguete
**API key**: vtexappkey-mundojuguete-ZMTYUJ (tiene el permiso)

### PENDIENTES FINANZAS

#### PENDIENTE FIN #1: Cargar costos restantes via Excel
- ~21,186 productos sin costPrice
- El usuario prometio proporcionar Excel con todos los costos
- Endpoint de import ya existe pero necesita adaptarse para bulk costPrice update

#### PENDIENTE FIN #2: UX de onboarding sync (para nuevos clientes)
- El usuario quiere: progress bar visible, proceso en background, estimacion de tiempo
- Idealmente webhook-based para no bloquear el browser
- No implementado, solo planificado conceptualmente

#### PENDIENTE FIN #3: Prisma migration pendiente
- Se agregaron ManualCost y ShippingRate al schema + campos en Order
- Requiere `prisma db push` o migration formal
- Los modelos estan en schema pero la migracion puede no haberse corrido en produccion

---

## PENDIENTE: BOT DE IA (Fase 4B)

### Estado: EN DEFINICION — no implementar sin aprobacion

### Concepto general
Bot de IA en 2 capas:
- **Capa 1**: Mini-bots contextuales por KPI/seccion (analiza el dato puntual que esta mirando el usuario)
- **Capa 2**: Bot general estrategico que cruza datos de todas las fuentes (MELI + SEO + VTEX + Stock)

### Notas
- Los detalles de arquitectura e implementacion NO estan definidos todavia
- Requiere ANTHROPIC_API_KEY en Vercel
- Todas las APIs de datos necesarias ya existen y funcionan
- NO avanzar con implementacion hasta que el usuario defina el alcance exacto


## GOOGLE SEARCH CONSOLE (SEO Intelligence) — Estado al 2026-04-01

### Ultima actualizacion: 2026-04-02

### Conexion
- **Propiedad**: https://www.elmundodeljuguete.com.ar/
- **Service Account**: nitrosales-analytics@nitrosales-489804.iam.gserviceaccount.com (misma que GA4)
- **Verificacion DNS**: TXT record ya configurado por el usuario
- **Permiso**: Completo (agregado manualmente en GSC > Configuracion > Usuarios)

### Arquitectura de Sync
- **Cron diario**: /api/sync/gsc (9am, ultimos 7 dias incremental)
- **Backfill manual**: /api/sync/gsc?days=90 (dia por dia para evitar OOM)
- **Estrategia**: Fetch dia-por-dia porque elmundodeljuguete genera ~14K-33K rows/dia en GSC
- **Safety cutoff**: 700s para no exceder maxDuration 800s

### Archivos GSC

| Archivo | Estado | Notas |
|---------|--------|-------|
| src/lib/connectors/gsc.ts | ACTIVO | JWT auth, fetchSearchAnalytics con paginacion 25K rows |
| src/app/api/sync/gsc/route.ts | ACTIVO | Cron sync dia-por-dia. maxDuration=800. ?days=7 default, ?days=90 backfill |
| src/app/api/metrics/seo/route.ts | **v2** ACTIVO | 14 queries paralelas: KPIs, trend, keywords, pages, opportunities, movers, cannibalization, country |
| src/app/(app)/seo/page.tsx | **v2** ACTIVO | 5 tabs: Overview, Keywords, Pages, Oportunidades, Movimientos |

### Tablas DB

| Tabla | Registros | Notas |
|-------|-----------|-------|
| seo_query_daily | 1,982,896 | 90 dias (29/12/2025 a 29/03/2026). ~22K rows/dia promedio |
| seo_page_daily | 236,531 | Agregado por landing page. ~2,600/dia promedio |

### Datos del dashboard SEO (marzo 2026)
- 15,991 clics organicos / 1.41M impresiones
- CTR promedio: 1.13% / Posicion promedio: 7.6
- 87,356 keywords totales / 6,531 en Top 3 / 59,849 en Top 10
- 30 oportunidades de CTR detectadas
- 20 keywords subiendo / 20 bajando
- 20 keywords con canibalizacion (3+ URLs)
- Top keyword: "el mundo del juguete" (26,789 clics)

### Commits GSC
- 70262ef: fix GSC sync day-by-day (OOM fix)
- 2600e73: feat SEO Intelligence v2 (tabs, opportunities, movers, cannibalization)

---

## NITRO CREATORS (INFLUENCER MODULE) — Estado al 2026-04-04

### Ultima actualizacion: 2026-04-04

### Arquitectura

**Portal Publico del Influencer** (1 URL, 2 tabs):
- URL: `/i/[slug]/[code]` — password-protected (SHA-256)
- Tab 1 "Mis Ganancias": KPIs, chart ventas, campanas, cupones, tracking link, stats, productos (si toggle on), mejores dias, ventas recientes
- Tab 2 "Mi Contenido": briefings asignados, seedings de productos, form para enviar contenido, historial de submissions
- Content data: lazy-loaded solo cuando el tab se activa
- Formulario de aplicacion: `/i/[slug]/apply` (publico, sin password)

**Admin (NITRO CREATORS seccion en sidebar)**:
- Influencers: Overview, Gestionar, Campanas, Aplicaciones, Leaderboard, Analytics
- Contenido: Briefings, Aprobaciones, UGC Library, Product Seeding

**Modelos Prisma** (7 nuevos):
- `Influencer` — slug, code, hashedPassword, commissionRate, isProductBreakdownEnabled, status
- `InfluencerCampaign` — name, bonus %, start/end dates, description
- `InfluencerAttribution` — orderId, influencerId, revenue, commission, attributedAt
- `InfluencerApplication` — name, email, instagram, tiktok, youtube, bio, status (PENDING/APPROVED/REJECTED)
- `InfluencerBriefing` — title, type (GENERAL/REEL/STORY/POST/UNBOXING/REVIEW), requirements, deadline, status
- `ContentSubmission` — type, platform, contentUrl, status (PENDING/APPROVED/REVISION/REJECTED), isUGC
- `ProductSeeding` — status (PENDING/SHIPPED/DELIVERED/CONTENT_RECEIVED), trackingNumber, productId

**Flujo de atribucion**:
1. Influencer comparte tracking link con UTM: `?utm_source=influencer&utm_medium=referral&utm_campaign=[slug]`
2. NitroPixel captura la visita con UTMs
3. Cuando se genera una orden, se busca el influencer por slug en utm_campaign
4. Se crea InfluencerAttribution con revenue y comision calculada
5. Influencer ve sus metricas en el dashboard publico

**Flujo de aplicaciones**:
1. Persona llena form en /i/[slug]/apply
2. Admin ve aplicacion en "Aplicaciones"
3. Al aprobar: auto-crea Influencer + envia email via Resend con slug, code y password temporal
4. Influencer accede a /i/[slug]/[code] con su password

**Data isolation**: todas las queries filtran por influencerId AND organizationId. Defense-in-depth en JOINs a products.

### PENDIENTES INFLUENCER

#### PENDIENTE INF #1: Recalcular atribuciones historicas
- Las ordenes existentes con UTM de influencers no tienen InfluencerAttribution creada
- Se podria hacer un backfill buscando ordenes con utm_campaign matching slug de influencers
- No implementado aun, depende de que haya influencers activos con ventas

#### PENDIENTE INF #2: Email templates mejorados
- Actualmente el email de onboarding es texto plano via Resend
- Se podria hacer un template HTML mas profesional con branding NitroSales

#### PENDIENTE INF #3: Notificaciones al influencer
- El influencer no recibe notificacion cuando un briefing nuevo se publica o cuando su contenido es aprobado/rechazado
- Se podria agregar email automatico en estos eventos

---

## ERRORES Y LECCIONES ML — 2026-03-31

### ERROR ML #1: fetchSellerOrders capped at 200 — perdia 90%+ de ordenes
**Que paso**: El sync de ordenes traia max 200 ordenes porque el parametro `limit` se usaba como tope Y como batch size. EMDJ tiene miles de ordenes por mes.
**Causa raiz**: Parametro `limit: 200` se pasaba a la funcion, que lo usaba como `maxOrders`.
**Fix aplicado**: Renombrado a `maxOrders` con default 50000. Paginacion correcta con offset + total check. ML hard limit: offset+limit <= 10000.
**REGLA PERMANENTE**:
- **NUNCA** usar el mismo parametro para batch size Y para total cap.
- **SIEMPRE** paginar hasta total (o hard limit de la API), no hasta un limite arbitrario bajo.
- Para EMDJ, esperar miles de ordenes por mes. Un limit de 200 es absurdo.

### ERROR ML #2: Fetching closed listings causaba timeout — 33K+ items
**Que paso**: fetchSellerListings traia TODAS las publicaciones incluyendo cerradas (33K+). Esto excedia el timeout de 60s.
**Causa raiz**: No se filtraba por status. ML devuelve todos los items del seller incluyendo historicos cerrados.
**Fix aplicado**: Filtro por status (active+paused solamente). Funcion `fetchItemIdsByStatus` con scroll_id para sets >1000.
**REGLA PERMANENTE**:
- **SIEMPRE** filtrar listings por status. NUNCA traer closed/inactive por defecto.
- Para listados >1000 items, usar `search_type=scan` con `scroll_id` (offset-based llega hasta 1000 max).
- EMDJ tiene 33K+ listings cerrados. Las activas+pausadas son bastante mas de 1000 (requiere scroll_id, no offset-based).

### ERROR ML #3: Sync completo excede timeout de Vercel free plan
**Que paso**: `/api/sync/mercadolibre` con maxDuration=300 seguia timeouting porque Vercel free plan solo da 60s.
**Causa raiz**: maxDuration=300 solo funciona en Vercel Pro. Free plan siempre corta a 60s.
**Fix aplicado**: Creado endpoint de backfill chunkeado con maxDuration=60. Chunks semanales para ordenes.
**REGLA PERMANENTE**:
- **CONFIRMADO Vercel Pro** — timeout real es hasta 800s (13 min). Configurado en vercel.json functions config.
- Disenar sync para chunks que quepan en 800s.
- Para EMDJ, el sync completo puede correr en la plataforma directamente.

### ERROR ML #4: Backfill mensual tambien excedia timeout
**Que paso**: Incluso un mes de ordenes de EMDJ excedia 60s de procesamiento.
**Causa raiz**: EMDJ procesa cientos/miles de ordenes por mes. Fetch + upsert individual toma ~50ms/orden.
**Fix aplicado**: Cambio de chunks mensuales a chunks semanales (week=1..26 para 6 meses).
**REGLA PERMANENTE**:
- Para sellers grandes como EMDJ, **usar chunks semanales, no mensuales**.
- Calcular: si un seller tiene 1000 ordenes/mes, y cada upsert toma 50ms, un mes = 50 segundos. Muy justo para 60s timeout.
- Una semana = ~250 ordenes = ~12.5 segundos. Margen amplio.

### PROTOCOLO PRE-CAMBIO ML (ADICIONAL AL GENERAL)

Antes de modificar cualquier endpoint de sync ML:
1. Es READ-ONLY desde ML API? (NUNCA escribir en la cuenta de EMDJ)
2. Cabe en 800s de timeout? (Vercel Pro max, configurado en vercel.json)
3. Tiene paginacion correcta? (offset + total check + hard limit de ML)
4. Filtra por status cuando corresponde? (no traer closed listings)
5. El token se auto-refresca? (getSellerToken maneja refresh automatico)

---

## AUDIENCE SYNC — Estado al 2026-04-04

**Sesion 8: Feature nueva completa. Backend + Frontend + Integraciones.**

### Que es
Sincroniza segmentos de clientes de NitroSales con Meta Custom Audiences y Google Customer Match. Permite crear audiencias basadas en segmentos RFM, LTV buckets, o criterios personalizados, y exportarlas a las plataformas de ads para lookalike audiences, retargeting, y exclusion lists.

### Arquitectura

**Modelos Prisma (2 nuevos):**
- `Audience` — Configuracion de audiencia (nombre, criterios, plataforma, status, IDs externos, match rates, auto-sync config)
- `AudienceSyncLog` — Log de cada sincronizacion (plataforma, resultado, clientes enviados, duracion, errores)
- SQL migration: `prisma/migrations/audience_sync_tables.sql` (ejecutar manualmente en Railway)

**Archivos creados:**

| Archivo | Descripcion |
|---|---|
| `src/lib/audiences/types.ts` | Tipos e interfaces: SegmentCriteria, MetaUserData, GoogleUserIdentifier, SyncResult, AudiencePreview |
| `src/lib/audiences/segment-engine.ts` | Motor de segmentacion: getMatchingCustomers() con filtros RFM/LTV/custom, previewAudience() para stats |
| `src/lib/audiences/send-meta.ts` | Integracion Meta Custom Audiences API v21.0: crear audience, hashear PII (SHA256), upload en batches de 10K, session-based, retry con backoff |
| `src/lib/audiences/send-google.ts` | Integracion Google Ads Customer Match API v17: crear user list, OfflineUserDataJob, operaciones en batches de 100K, Gmail normalization |
| `src/lib/audiences/index.ts` | Re-exports publicos |
| `src/app/api/audiences/route.ts` | CRUD API: GET (listar), POST (crear/preview), PUT (actualizar), DELETE |
| `src/app/api/audiences/sync/route.ts` | Sync API: POST con audienceId, ejecuta sync a Meta y/o Google, logs automáticos |
| `src/app/(app)/audiences/page.tsx` | UI admin: lista de audiencias, audience builder con segment picker, preview en tiempo real, sync manual, status badges |
| `prisma/migrations/audience_sync_tables.sql` | SQL migration para produccion (no usar prisma db push) |

**Archivos modificados:**

| Archivo | Cambio |
|---|---|
| `prisma/schema.prisma` | +2 modelos (Audience, AudienceSyncLog), +1 relacion en Organization |
| `src/app/(app)/layout.tsx` | v4 -> v5: Audience Sync premium card en HERRAMIENTAS (badge SYNC, color purple, glow) |

### Seguridad (Triple Candado)

1. **AUDIENCE_SYNC_ENABLED** — Variable de entorno. Si no es "true", toda la API de sync retorna skipped. Por defecto NO esta activado.
2. **Credenciales** — Requiere Connection de META_ADS y/o GOOGLE_ADS con status ACTIVE. Si no hay credenciales, retorna skipped.
3. **Minimo de audiencia** — Meta requiere minimo 20 clientes, Google similar. Si la audiencia es muy chica, retorna skipped.

### Flujo Meta Custom Audiences

1. Crear Custom Audience vacia (POST `/act_{AD_ACCOUNT_ID}/customaudiences`)
2. Generar session_id unico (random 64-bit int)
3. Hashear PII con SHA256: email, firstName, lastName, city, country, + EXTERN_ID (sin hash)
4. Subir en batches de 10,000 (maximo de Meta API)
5. Retry automatico con exponential backoff si rate limited (error 80003)
6. Marcar last_batch_flag=true en el ultimo batch

### Flujo Google Customer Match

1. Crear CrmBasedUserList (POST `/customers/{id}/userLists:mutate`)
2. Crear OfflineUserDataJob (tipo CUSTOMER_MATCH_USER_LIST, consent GRANTED)
3. Normalizar Gmail (remover dots y + aliases antes de hash)
4. Agregar operaciones en batches de 100K (AddOfflineUserDataJobOperations)
5. Ejecutar job (RunOfflineUserDataJob)
6. NOTA: Google depreca esta API desde Apr 1, 2026. Tokens activos siguen funcionando.

### Criterios de segmentacion soportados

- **RFM Segments**: Champions, Leales, Potenciales, Nuevos, Ocasionales, En riesgo, Perdidos
- **LTV Buckets**: high_value, medium_value, low_value
- **Custom filters**: minOrders, maxOrders, minSpent, maxSpent, recencyDaysMax, recencyDaysMin, cities, states, countries
- **ALL_CUSTOMERS**: todos los clientes con al menos 1 orden y email

### Preview (sin enviar nada)

La UI calcula en tiempo real:
- Total clientes que matchean
- Data completeness: con email, con nombre, con ciudad
- Estimated match rates: Meta (~65% base + multi-key bonus), Google (~45% base)
- Segment breakdown visual
- Top cities, AOV, avg lifetime orders

### Para activar en produccion

1. Ejecutar SQL migration en Railway: `prisma/migrations/audience_sync_tables.sql`
2. Configurar en Vercel env vars:
   - `AUDIENCE_SYNC_ENABLED=true`
   - Meta: `META_AD_ACCOUNT_ID`, `META_ADS_ACCESS_TOKEN` (o en Connection credentials)
   - Google: `GOOGLE_ADS_ACCESS_TOKEN`, `GOOGLE_ADS_CUSTOMER_ID`, `GOOGLE_ADS_DEVELOPER_TOKEN` (o en Connection credentials)
3. Las credenciales tambien se pueden guardar en la tabla `connections` (platform META_ADS / GOOGLE_ADS)

### Investigacion realizada (world-class patterns)

Se investigaron a fondo antes de implementar:
- **Meta Custom Audiences API v21.0**: endpoints, hashing SHA256, multi-key matching (6 fields), session-based uploads, batch de 10K, rate limits, policy updates 2025
- **Google Ads Customer Match API v17**: OfflineUserDataJob, CrmBasedUserList, Gmail normalization, consent metadata, deprecation notice Apr 2026
- **Triple Whale**: audience sync a Meta/Google/TikTok/Pinterest, segment builder, multi-destination
- **Klaviyo**: email-first audience sync, hourly frequency, 100 profile minimum, engagement-based segmentation
- **Segment (Twilio) Engage**: real-time segment evaluation, Generative Audiences (AI), trait activation, health monitoring
- **Hightouch**: warehouse-native reverse ETL, visual audience builder, composable architecture, 250+ destinations

### Pendientes Audience Sync

- [ ] Ejecutar SQL migration en Railway
- [ ] Configurar AUDIENCE_SYNC_ENABLED=true cuando Tomy tenga credenciales
- [ ] Cron de auto-sync (POST /api/cron/audience-sync) para audiencias con autoSync=true
- [ ] UI: editar audiencia existente (form pre-populated)
- [ ] UI: ver historial de syncs (AudienceSyncLog)
- [ ] Incremental sync (solo enviar nuevos/cambiados, no full list cada vez)
- [ ] TikTok Ads audience sync (futuro)
- [ ] Match rate tracking post-sync (Meta devuelve esto en el audience status)

---

## Sesion 9 — 2026-04-05: Problema critico de paginas no funcionando (RESUELTO EN SESION 10)

### PROBLEMA: RESUELTO en sesion 10

**Las paginas principales de NitroSales no cargaban**: overview/dashboard, pedidos, productos, analytics devolvian errores 500 o tardaban indefinidamente. Reportado por Tomy. El problema empezo despues de implementar el modulo de influencers (sesiones 6-7), pero la causa raiz fue lo que hizo esta sesion 9 intentando arreglar.

### Commits realizados en esta sesion (en orden cronologico)

1. `06dd847` — fix: correct Order field name totalAmount -> totalValue in influencers analytics
2. `841d6b1` — fix: add export const dynamic=force-dynamic to all API routes (72 archivos) — **NECESARIO, NO REMOVER**
3. `5104869` — fix: add connection pool limits to prevent DB connection exhaustion (connection_limit=5, pool_timeout=10 en src/lib/db/client.ts) — **ESTO FUE LA CAUSA RAIZ DEL PROBLEMA — REVERTIDO EN SESION 10**
4. `0e5146a` — perf: replace full-table loads with SQL aggregations in 3 critical APIs (metrics, campaigns, ads routes reescritos con $queryRawUnsafe)
5. `efc7c0ad` — perf: add response cache, SQL-optimize trends, create DB index endpoint (nuevo archivo src/lib/api-cache.ts, rewrite de trends/route.ts, nuevo endpoint ensure-indexes, cache en 5 rutas)
6. `12e22bcc` — fix: correct SQL table names (ad_metrics_daily, web_metrics_daily, ad_creative_metrics_daily) — corrige nombres de tablas SQL que estaban mal en commits 4 y 5

### Archivos nuevos creados en esta sesion

- `src/lib/api-cache.ts` — cache en memoria para respuestas de API (60s TTL)
- `src/app/api/setup/ensure-indexes/route.ts` — endpoint POST para crear 6 indices faltantes en la DB

### Archivos modificados en esta sesion

- `src/lib/db/client.ts` — agregado connection_limit=5 y pool_timeout=10 (**CAUSA RAIZ — revertido en sesion 10**)
- `src/app/api/metrics/route.ts` — reescrito de findMany a SQL aggregations
- `src/app/api/metrics/trends/route.ts` — reescrito de findMany a SQL GROUP BY
- `src/app/api/metrics/campaigns/route.ts` — prevMetrics reescrito a SQL aggregate
- `src/app/api/metrics/ads/route.ts` — prevMetrics reescrito a SQL aggregate
- `src/app/api/metrics/orders/route.ts` — agregado cache
- `src/app/api/metrics/products/route.ts` — agregado cache
- `src/app/api/metrics/pixel/route.ts` — agregado cache
- 72 archivos de API routes — agregado `export const dynamic = "force-dynamic"` (**NECESARIO**)

### Errores cometidos en esta sesion (documentados para prevencion)

1. **ERROR CRITICO: Agregar connection_limit=5 al pool de Prisma** — Esto limito a 5 conexiones simultaneas. Cuando el dashboard carga 10+ APIs en paralelo y cada API usa 1-2 conexiones (auth + query), se agota el pool instantaneamente. El error era: `Timed out fetching a new connection from the connection pool (connection_limit: 5, pool_timeout: 10)`. **NUNCA limitar el connection pool de Prisma en produccion.**

2. **ERROR: Reescribir APIs de Prisma ORM a raw SQL sin necesidad** — Se reescribieron metrics, campaigns, ads y trends de `findMany` a `$queryRawUnsafe` con `Promise.all` de 5-10 queries paralelas. Esto multiplico x3 la demanda de conexiones por request. Combinado con connection_limit=5, fue devastador.

3. **ERROR: Aplicar multiples cambios simultaneos** — Se hicieron 6 commits tocando cosas distintas (force-dynamic, pool limits, SQL rewrites, cache, table names) sin testear cada uno por separado. Esto hizo imposible identificar cual fue el cambio que rompio todo.

---

## Sesion 10 — 2026-04-05: Fix critico — connection pool + force-dynamic restaurado

### PROBLEMA: RESUELTO

**Todas las paginas de NitroSales volvieron a funcionar.** 10/10 APIs responden 200 OK en paralelo.

### Causa raiz identificada

La sesion 9 agrego `connection_limit=5` y `pool_timeout=10` al DATABASE_URL en `src/lib/db/client.ts`. Esto limitaba a 5 conexiones simultaneas a la base de datos. Cuando el dashboard de NitroSales carga, dispara 10+ APIs en paralelo. Cada API necesita al menos 1 conexion (auth-guard) + 1-N conexiones (queries). Con limit=5, las APIs competian por conexiones y las que no conseguian en 10 segundos tiraban error 500.

**Prueba empirica realizada:**
- 1 API sola: 200 OK (3.7s)
- 2 APIs en paralelo: 200 OK ambas
- 5 APIs en paralelo: 2 devolvieron 500 pool timeout, 3 timeout total
- 10 APIs en paralelo post-fix: 10/10 devuelven 200 OK

### Segundo problema: force-dynamic es OBLIGATORIO

Se intento remover `export const dynamic = "force-dynamic"` de las 72 rutas API para reducir el build time (que era 12+ min). El build bajo a 50 segundos, PERO las APIs dejaron de funcionar — Next.js intento optimizar estaticamente las rutas y sirvio respuestas rotas/cacheadas del build anterior.

**Conclusion: `force-dynamic` es OBLIGATORIO en todas las rutas API de NitroSales.** Sin el, Next.js puede pre-renderizar rutas que necesitan contexto de request (auth, DB queries) y servir respuestas estaticas corruptas.

El build de 12+ minutos con acc44a5 fue probablemente por cold cache de Vercel (primer build despues de muchos cambios de sesion 9). El build de b0b8119 con force-dynamic restaurado deberia ser mas rapido ahora que el cache esta warm.

### Commits de esta sesion (en orden cronologico)

1. `703dc6a` — **fix: remove connection pool limits causing API timeouts** — Removido connection_limit=5 y pool_timeout=10 de db/client.ts. **ESTE FUE EL FIX PRINCIPAL.**
2. `acc44a5` — docs: session 10 — fix connection pool exhaustion (update CLAUDE_STATE parcial)
3. `e4b7516` — perf: remove redundant force-dynamic from API routes — **ESTE COMMIT ROMPIO LAS APIs. Remover force-dynamic no es seguro.**
4. `d0d4bcf` — chore: trigger redeploy (commit vacio para forzar nuevo deploy en Vercel)
5. `b0b8119` — **fix: restore force-dynamic on all API routes** — Restauro force-dynamic en las 72 rutas. **ESTE COMMIT ARREGLO TODO DEFINITIVAMENTE.**

### Archivos modificados en esta sesion

- `src/lib/db/client.ts` — **REMOVIDO** el bloque que inyectaba connection_limit=5 y pool_timeout=10 al DATABASE_URL. El archivo ahora crea PrismaClient sin manipular la URL. v1 -> v1.1.
- 72 archivos de API routes — force-dynamic removido en e4b7516 y RESTAURADO en b0b8119. Estado final: **todas las rutas API tienen `export const dynamic = "force-dynamic"`**.

### Estado final de produccion

- **Commit en main**: `b0b8119`
- **db/client.ts**: Sin connection_limit, sin pool_timeout. Prisma usa defaults (pool_size segun CPU cores).
- **72 API routes**: Todas con `export const dynamic = "force-dynamic"`.
- **10/10 APIs**: 200 OK en paralelo (testeado con curl).

---

## Session 11 — 2026-04-05: Migracion a Neon + fix de region de Vercel (Sentry/Axiom intentados pero revertidos por performance)

### RESUMEN EJECUTIVO

La Sesion 11 logró resolver los timeouts de API migrando a Neon y descubriendo que **el verdadero problema NO era Sentry/Axiom**, sino que **las funciones de Vercel corrían en Virginia (iad1) mientras la DB estaba en São Paulo (sa-east-1)**, creando 1.3 segundos de latencia POR QUERY.

- **Fase 1-2**: Vercel build arreglado + Neon-Vercel integration = 10/10 APIs OK ✓
- **Fase 3-4**: Sentry + Axiom instalados → Cold start se disparó a 15-25 segundos → REVERTIDOS completamente ✓
- **Fase 5**: Descoberto el VERDADERO problema: función region mismatch. Agregado `"regions": ["gru1"]` a vercel.json → **21x speedup** ✓
- **Final state**: 9 APIs testeadas en 0.2-1.3 segundos. Clean codebase. Sentry/Axiom accounts activas pero desconectadas.

### Causa raiz: REGION MISMATCH + Packages pesados en serverless

Los timeouts NO vinieron de Sentry/Axiom features bloqueados en runtime — vinieron de dos cosas:

1. **Package bloat**: @sentry/nextjs + next-axiom agregaban ~15-25 segundos a cada cold start (bloqueaban TODO)
2. **Region mismatch**: Incluso sin Sentry/Axiom, las funciones en iad1 (Virginia) tardaban 1.3s POR QUERY contra DB en São Paulo

**La raiz raiz**: Vercel deploys a iad1 por DEFAULT. Nadie verifico que la region coincidiera.

### Commits de esta sesion (en orden cronologico)

1. `9470b86` — **chore: trigger build with correct build command (override removed)** — Removido Production Override `prisma db push --accept-data-loss`. Changed to `prisma generate && next build`.
2. `70e1d88` — **fix: update directUrl to DATABASE_URL_UNPOOLED for Neon-Vercel integration** — Schema Prisma: directUrl de DIRECT_URL → DATABASE_URL_UNPOOLED.
3. `ce90c81` — **feat: integrate Sentry error tracking for Next.js** — @sentry/nextjs instalado (SERÁ REVERTIDO en 68a415b)
4. `4002a50` — **feat: integrate Axiom structured logging** — next-axiom instalado (SERÁ REVERTIDO en 68a415b)
5. `123321a` — **fix: remove Sentry withSentryConfig wrapper** — Removido wrapper, kept Axiom. Aún lento.
6. `a758ba3` — **fix: disable Sentry/Axiom runtime** — Deshabilitó todo en instrumentation.ts. Aún lento — los packages siguen bloateando node_modules.
7. `68a415b` — **fix: remove Sentry/Axiom packages completely** — REVERTIDO TOTAL: Removidos @sentry/nextjs, next-axiom, sentry.*.config.ts, src/app/global-error.tsx, src/instrumentation.ts.
8. `10e5fff` — **debug: add connection diagnostic endpoint** — Creado /api/debug/connection para diagnosticar latencia y región.
9. `74d9b69` — **fix: move serverless functions to São Paulo (gru1)** — Agregado `"regions": ["gru1"]` a vercel.json. **ESTA FUE LA SOLUCIÓN REAL.** Connection time: 1293ms → 60ms (21x).
10. `1dfc88e` — **chore: remove debug endpoint** — Eliminado /api/debug/connection.

### Timeline detallado fase a fase

#### Fase 1: Vercel Build Arreglado (9470b86) ✓
- **Problema**: Build fallaba. Heredaba `prisma db push --accept-data-loss` de sesion 8 (Production Override).
- **Solucion**: Remover override → build command = `prisma generate && next build`
- **Resultado**: Build limpio, Vercel happy. ✓

#### Fase 2: Neon-Vercel Integration + Primeros Tests (70e1d88) ✓
- **Hecho**:
  - Creada `dev` branch en Neon para desarrollo
  - Instalada Neon-Vercel integration desde Marketplace
  - Linked existing Neon account a NitroSales project
  - Integration auto-seteó DATABASE_URL (pooler) + DATABASE_URL_UNPOOLED (direct)
  - Actualizado Prisma schema: directUrl = env("DATABASE_URL_UNPOOLED")
- **Test**: 10 APIs en curl → 10/10 200 OK (pero lentos: 10-15 segundos)

#### Fase 3: Sentry Installation (ce90c81) ✗ REVERTIDO
- **Hecho**:
  - npm: @sentry/nextjs v8+
  - Creados: sentry.client.config.ts, sentry.server.config.ts, sentry.edge.config.ts
  - next.config.js: withSentryConfig(nextConfig)
  - src/app/global-error.tsx con Sentry wrapper
  - src/instrumentation.ts con auto-instrument configs
- **Resultado**: withSentryConfig + autoInstrumentServerFunctions agregó **15-25 segundos a cold start**. Cada API timeout (30s limit).
- **Debug**: Metricas de Sentry mostró connection pool exhaustion.

#### Fase 4: Axiom Installation (4002a50) ✗ REVERTIDO
- **Hecho en paralelo a Sentry attempts**: next-axiom instalado, withAxiom wrapper en next.config.js
- **Resultado**: Similar performance hit. También lento.

#### Fase 5: Incremental Reverts (123321a → a758ba3) — No funcionaron
- `123321a`: Removido withSentryConfig wrapper, kept Axiom → Aún 16-28s por API
- `a758ba3`: Deshabilitado todo en instrumentation.ts (disabled auto-instrument) → Aún lento
- **Conclusion**: El problema NO es la ejecución de las features, es que **los packages en node_modules bloatean el bundle del serverless function**.

#### Fase 6: Complete Package Removal (68a415b) ✓ Parcial
- **Hecho**: Removidos completamente @sentry/nextjs y next-axiom de package.json
- **Resultado**: MEJOR, pero aún ~10 segundos por API → No era el cuello de botella primario

#### Fase 7: Root Cause Discovery (10e5fff → 74d9b69) ✓ VERDADERA SOLUCIÓN
- `10e5fff`: Creado /api/debug/connection que loguea region + connection latency
- **DISCOVERY**: Vercel functions en **iad1 (Virginia, US East)**. Neon DB en **sa-east-1 (São Paulo)**.
- **Math**: 1 query = 1.3s cross-continent latency. 11 queries/endpoint = 14.3s → TIMEOUT (30s limit).
- `74d9b69`: Agregado a vercel.json: `"regions": ["gru1"]` (São Paulo data center)
- **RESULT**: Functions now run in São Paulo. Connection latency: 1293ms → 60ms. **21x speedup**.
- **Final test**: 9 APIs curl en paralelo → 0.2-1.3 segundos cada una. ✓✓✓

#### Fase 8: Cleanup (1dfc88e)
- Removido endpoint de debug

### Estado ACTUAL en produccion (Post-Sesion 11)

#### Codigo limpio
- **package.json**: NO @sentry/nextjs, NO next-axiom. Build: `prisma generate && next build`
- **next.config.js**: CLEAN. No wrappers de Sentry ni Axiom.
- **No config files**: Eliminados sentry.*.config.ts, src/app/global-error.tsx, src/instrumentation.ts
- **vercel.json**: `"regions": ["gru1"]` agregado (CRITICAL)
- **prisma/schema.prisma**: directUrl = env("DATABASE_URL_UNPOOLED")

#### Database
- **Neon** (São Paulo, sa-east-1): Production + dev + preview branches
- **Vercel functions**: Region = gru1 (São Paulo) — MATCH con DB región

#### Monitoring & Logging (NO CONECTADOS pero accounts activas)
- **Sentry**: Org nitrosales.sentry.io, Project javascript-nextjs — **Desconectado del código**
  - Cuentas siguen activas para futura integración lightweight (solo browser errors, o Vercel native integration)
  - No instalar nuevamente @sentry/nextjs con wrappers (causa cold start issues)
  - Considerar: Vercel Analytics built-in, o Sentry solo para client-side sin Next.js wrapper
- **Axiom**: Dataset nitrosales-et7s — **Desconectado del código**
  - Cuentas siguen activas para futura integración
  - Considerar: Vercel-Axiom native integration, o logging ligero sin wrapper

#### Performance FINAL
- **Response time**: 0.2-1.3 segundos (9 APIs testeadas)
- **Cold start**: ~1 segundo (previo a Sentry/Axiom)
- **Queries por endpoint**: 11 promedio. Latencia por query: 60ms (was 1300ms)

#### Environment Variables en Vercel (actualizadas)

| Variable | Valor | Notas |
|----------|-------|-------|
| DATABASE_URL | `postgresql://...neon.tech/neondb?sslmode=require&pgbouncer=true` | Pooled (PgBouncer). SIN &connection_limit, SIN &pool_timeout |
| DATABASE_URL_UNPOOLED | `postgresql://...neon.tech/neondb?sslmode=require` | Direct (para migrations) |
| SENTRY_* | (vacíos o no seteados) | Cuentas activas pero no conectadas al código |
| AXIOM_* | (vacíos o no seteados) | Cuentas activas pero no conectadas al código |

### Pending / Notas para futuras sesiones

1. **Sentry re-integration**: Si se necesita error tracking, investigar alternativas:
   - Vercel Analytics (built-in, no overhead)
   - Sentry solo client-side (sin @sentry/nextjs wrapper) = bajo overhead
   - Sentry Vercel integration (si existe)

2. **Axiom re-integration**: Si se necesita structured logging:
   - Vercel-Axiom native integration (si existe)
   - Custom lightweight logging sin next-axiom wrapper

3. **Neon dev branch**: Creada pero no configurada en Vercel para development env. Opcional para onboarding de otros devs.

4. **Railway DB**: Antigua DB aún existe. Considerar decommission una vez Neon sea 100% stable (otro deploy o dos sin issues).

### Archivos modificados/eliminados en esta sesion

**Modificados**:
- `package.json` — Instalados y luego REMOVIDOS @sentry/nextjs, next-axiom
- `prisma/schema.prisma` — directUrl actualizado a DATABASE_URL_UNPOOLED
- `next.config.js` — Agregados y luego REMOVIDOS Sentry/Axiom wrappers
- `vercel.json` — Agregado `"regions": ["gru1"]` (MANTENER)

**Creados y luego ELIMINADOS**:
- `sentry.client.config.ts` — Eliminado
- `sentry.server.config.ts` — Eliminado
- `sentry.edge.config.ts` — Eliminado
- `src/app/global-error.tsx` — Eliminado
- `src/instrumentation.ts` — Eliminado
- `src/app/api/debug/connection.ts` — Creado, luego eliminado

**Última version en main**: `74d9b69` (con regions fix) + `1dfc88e` (cleanup)

---

## Session 12 — 2026-04-05/06: Intelligence Engine v1+v2 + Memory System + Onboarding Wizard + Aurum Chat Redesign

### RESUMEN EJECUTIVO

Sesion enorme con 27 commits. Se construyo desde cero la capa "Aurum" (chat IA conectado a TODA la data del negocio via tool calling), un sistema de memoria persistente del bot, un onboarding wizard de 6 pasos, y un rediseño visual completo del chat con animaciones gold. Tambien se libro la "saga del rectangulo negro" (3 commits para arreglar un overlay visual).

**Lo que entro a produccion:**
- Intelligence Engine v2 con 12 tools (sales, products, ads, traffic, customers, SEO, competitors, financial, ML, influencers, pixel attribution, ad creatives)
- BotMemory model + CRUD API + UI de gestion de memorias
- Onboarding wizard de 6 pasos con auto-generacion de memorias industria-especificas
- Rediseño Aurum: card gold con animaciones globales, sub-items Sinapsis + Boveda, chat UI con thinking animations
- Sub-paginas: /sinapsis (1229 lineas), /boveda (132 lineas), /memory (refactor)
- System prompt dinamico basado en datos de onboarding del org
- Fix critico del rectangulo negro del sidebar (3 intentos hasta resolverlo: 7c5e3fb, 800219c, 09d69e7+891c9d0+cd9fcef)

### Commits de esta sesion (en orden cronologico)

#### Bloque A — Intelligence Engine v1 → v2 (2026-04-05 noche)
1. `7902605` — **feat: Intelligence Engine v2 — tool calling architecture** — Reemplaza system prompt monolitico (~550 lineas con TODA la data) por arquitectura de tool calling. Claude pide solo lo que necesita via 10 tools especializadas. Reduce dramaticamente tokens por request.
2. `3e7d7f0` — **feat: add pixel attribution + ad creatives to Intelligence Engine** — 2 tools nuevas: `get_pixel_attribution` (multi-touch attribution, journey analysis, conversion lag) y `get_creative_performance`.
3. `7c5e3fb` — **fix: chat page layout overflow causing black rectangle** — Primer intento de arreglar overlay negro.
4. `800219c` — **fix: force light background on chat page** — Segundo intento.

#### Bloque B — Memory System (2026-04-06 tarde)
5. `6642594` — **feat: add BotMemory model for persistent bot learning system** — Nuevo modelo Prisma BotMemory con campos: id, organizationId, type (rule/fact/preference/calendar), priority, content, source, createdAt, updatedAt.
6. `107d524` — **feat: add memory CRUD API (GET list + POST create)** — `/api/memory` endpoint.
7. `beb4e41` — **feat: add memory individual API (PATCH update + DELETE)** — `/api/memory/[id]` endpoint.
8. `63121d8` — **feat: inject persistent memory + business rules into NitroBot system prompt** — Las memorias se inyectan en cada chat call.
9. `a30d6bb` — **feat: add memory management UI page with CRUD, filters, and priority** — Pagina `/memory` (en este momento todavia standalone, despues se refactoriza).
10. `33a9bb0` — **feat: add Memoria del Bot nav item to sidebar** — Entrada en sidebar.
11. `da266d3` — **feat: add memory seed endpoint with 5 initial business rules** — `/api/memory/seed` con reglas iniciales generales.
12. `8da4d3b` — **build: add prisma db push to build script for auto table creation** — INTENTO QUE FALLO.
13. `1713e96` — **revert: restore original build script** — Revertido el anterior porque `prisma db push` no es compatible con Vercel build (no tiene credenciales en build time).

#### Bloque C — Onboarding Wizard (2026-04-06 tarde)
14. `8b75dc6` — **feat: add onboarding API with industry-specific memory auto-generation** — `/api/onboarding` POST que crea memorias automaticas segun la industria (toys, fashion, beauty, food, electronics, etc.).
15. `c0197e2` — **feat: add onboarding wizard to chat page with 6-step business setup** — Wizard 6 pasos en `chat/page.tsx` (350 lineas agregadas). Pasos: 1) Industria, 2) Pais, 3) Tipo negocio, 4) Etapa, 5) Canales venta, 6) Canales ads.
16. `b4ec76c` — **feat: make system prompt dynamic based on org onboarding data** — System prompt se construye con los datos del onboarding (industria, pais, etc.) en lugar de hardcoded.
17. `d751c73` — **fix: add error handling to onboarding submit + show error messages to user** — Error handling visual.
18. `7891fda` — **fix: make memory generation non-blocking in onboarding API** — Problema: la generacion de memorias bloqueaba la respuesta. Solucion: fire-and-forget.

#### Bloque D — Hotfixes Memory Auth + UI (2026-04-06 tarde)
19. `54346e2` — **fix: add authOptions to getServerSession in memory API routes** — Sin authOptions, getServerSession devolvia null y los endpoints fallaban.
20. `e0e5403` — **fix: add authOptions to getServerSession in memory/[id] route** — Mismo fix en la ruta individual.
21. `e4a206b` — **fix: add error handling to memory page save form** — UX fix.

#### Bloque E — DB Setup Saga (2026-04-06 tarde) — CREADOS Y ELIMINADOS
22. `7e856c9` — **temp: add DB debug endpoint to diagnose bot_memories issue** — `/api/db-debug` (TEMPORAL).
23. `3d6f443` — **temp: add setup-memory-table action** — Endpoint para crear `bot_memories` en Neon DB manualmente porque la migration no se aplicaba automaticamente.
24. `d6b7307` — **chore: remove temporary db-debug endpoint** — Limpieza despues de crear la tabla.

#### Bloque F — Aurum Visual Redesign (2026-04-06 noche)
25. `f5438bd` — **feat(aurum): move Aurum to Herramientas with distinctive gold card + global animations** — Aurum sale del item normal del sidebar y pasa a una "card gold" distintiva en la seccion HERRAMIENTAS. Se agregan animaciones CSS globales al layout: `aurumShimmer`, `aurumOrbit`, `aurumBreath`, `aurumFloat`, `aurumFadeUp`, `aurumPulseRing`.
26. `edcb2b1` — **feat(aurum): innovative gold chat UI with wow-factor thinking animations** — Rediseño total del chat: paleta dark gold, mensajes con bordes gradient, thinking animations elaboradas (orbital glow, pulse rings, breath effect). Aprox +700 lineas en `chat/page.tsx`.
27. `93a209a` — **feat(aurum): Sinapsis + Boveda sub-items with legendary memory redesign** — Sinapsis = nueva pagina (1122 lineas) con vista visual del sistema de memoria/relaciones. Boveda = nueva pagina (132 lineas) placeholder. Memory page se refactoriza (-467 lineas, ahora mas chico). Sidebar: Aurum se vuelve grupo expandible con sub-items Chat, Sinapsis, Boveda, Memory.

#### Bloque G — Saga del Rectangulo Negro (2026-04-06 — 3 intentos)
28. `09d69e7` — **fix: add position relative to sidebar nav links to fix black rectangle** — El indicador activo del sidebar usa `position: absolute` pero el `<Link>` padre no tenia `position: relative`. Fix: agregar `relative` a la className del Link. Era un side effect de los cambios visuales del bloque F.
29. `891c9d0` — Mismo fix replicado.
30. `cd9fcef` — **fix: sync chat/page.tsx with production to fix black rectangle in preview** — Sync entre preview y prod.

### Funcionalidades nuevas en produccion

#### Intelligence Engine (Aurum Chat)
- **12 tools disponibles para Claude**:
  - `get_sales_overview`: revenue, orders, trends, devices
  - `get_products_inventory`: stock, dead stock, brands, search
  - `get_ads_performance`: ROAS, CPA por plataforma
  - `get_traffic_funnel`: sessions, funnel stages, bottleneck
  - `get_customers_ltv`: segmentacion, VIP, at-risk, predicciones
  - `get_seo_performance`: keywords, position changes, opportunities
  - `get_competitors_analysis`: price comparison, threats
  - `get_financial_pnl`: P&L, margins, channel breakdown
  - `get_mercadolibre_health`: listings, reputation, questions
  - `get_influencers_performance`: attributed revenue, top creators
  - `get_pixel_attribution`: multi-touch attribution, journey analysis
  - `get_creative_performance`: ad creatives breakdown
- **Files clave**:
  - `src/lib/intelligence/tools.ts` (190 lineas) — definiciones de tools
  - `src/lib/intelligence/handlers.ts` (1124 lineas) — implementacion de cada tool

#### Memory System
- Modelo Prisma `BotMemory` (id, organizationId, type, priority, content, source, timestamps)
- Tabla en Neon: `bot_memories` (creada manualmente via setup-memory-table action porque las migrations automaticas en Vercel no funcionan)
- API CRUD: `/api/memory` (GET, POST), `/api/memory/[id]` (PATCH, DELETE), `/api/memory/seed` (POST inicial)
- UI: pagina `/memory` con filtros, prioridad, tipo
- Las memorias se inyectan en cada llamada al chat

#### Onboarding Wizard (version v1 — sera mejorado en Sesion 13)
- 6 pasos en el chat: industria → pais → tipo negocio → etapa → canales venta → canales ads
- POST a `/api/onboarding` que guarda en `Organization.settings.businessContext`
- Auto-genera memorias industria-especificas (BotMemory rows)
- System prompt se construye dinamicamente con esos datos

#### Aurum Visual System
- 6 animaciones CSS globales en `layout.tsx`: `aurumShimmer`, `aurumOrbit`, `aurumBreath`, `aurumFloat`, `aurumFadeUp`, `aurumPulseRing`
- Card gold distintiva en sidebar HERRAMIENTAS
- Sub-items expandibles: Chat, Sinapsis, Boveda, Memory
- Chat UI con paleta dark gold + thinking animations

#### Pages nuevas
- `/sinapsis` — visualizacion de relaciones/memoria del bot (1229 lineas)
- `/boveda` — placeholder para vault de insights (132 lineas)
- `/memory` — refactor: ahora delega gran parte a Sinapsis
- `/admin/usage` — (este viene en Sesion 13)

### Errores cometidos en esta sesion (LEER PARA NO REPETIR)

#### ERROR #1: Intentar `prisma db push` en build script de Vercel
- **Commit problematico**: `8da4d3b`
- **Que paso**: Se agrego `prisma db push` al build script para que la tabla `bot_memories` se creara automaticamente al deployar.
- **Por que fallo**: Vercel build NO tiene `DATABASE_URL` con permisos de escritura. El build corre en un entorno sin credenciales de produccion.
- **Fix**: Revertido en `1713e96`. Solucion real: crear la tabla manualmente con un endpoint temporal (`3d6f443`).
- **REGLA**: Las migrations en Vercel NO se aplican automaticamente. Hay que aplicarlas manualmente con `prisma db execute` desde local apuntando a la DB de produccion, o con un endpoint temporal de setup.

#### ERROR #2: getServerSession sin authOptions
- **Commits problematicos**: rutas de memory creadas sin pasar authOptions a getServerSession
- **Que paso**: Las rutas devolvian null en lugar del usuario, todos los endpoints fallaban con 401.
- **Fix**: `54346e2`, `e0e5403` — agregaron authOptions.
- **REGLA**: SIEMPRE pasar `authOptions` como primer argumento a `getServerSession()`. Sin esto, NextAuth no sabe como autenticar.

#### ERROR #3: Saga del rectangulo negro (3 intentos)
- **Commits**: `7c5e3fb`, `800219c`, `09d69e7`
- **Que paso**: Despues del rediseño visual, aparecio un rectangulo negro sobre la pagina del chat.
- **Diagnosticos fallidos**: layout overflow (intento 1), background color (intento 2). Ninguno arreglo el problema real.
- **Diagnostico correcto**: el indicador activo del sidebar usaba `position: absolute` dentro de un `<Link>` que NO tenia `position: relative`. El absolute escapaba al ancestor mas cercano con position, que era el viewport, y se renderizaba como rectangulo negro sobre el contenido.
- **Fix real**: agregar `relative` a la className del Link en sidebar.
- **REGLA**: Si un elemento con `position: absolute` aparece en un lugar inesperado, verificar que su contenedor padre tenga `position: relative`. Esto es CSS basico pero facil de pasar por alto.

#### ERROR #4: Memory generation bloqueante
- **Commit problematico**: version inicial de `/api/onboarding`
- **Que paso**: El POST de onboarding generaba memorias sincronamente, lo cual hacia que el response tardara 5-10 segundos.
- **Fix**: `7891fda` — fire-and-forget. La generacion de memorias se dispara pero no se espera.
- **REGLA**: En endpoints que tienen que responder rapido al usuario, las operaciones secundarias (logging, side effects, generacion de contenido auxiliar) deben ser fire-and-forget con `.catch(() => {})` para evitar unhandled rejections.

### Estado al final de Sesion 12

- **Branch principal**: `feat/intelligence-engine-v1` (creada en algun momento de esta sesion)
- **Ultimo commit en main de esta sesion**: hasta `09d69e7` quedo en main; el resto siguio en `feat/intelligence-engine-v1`
- **Tabla bot_memories**: existe en Neon production
- **Sub-paginas creadas**: `/sinapsis`, `/boveda`, `/memory`
- **Files nuevos clave**:
  - `src/lib/intelligence/tools.ts`
  - `src/lib/intelligence/handlers.ts`
  - `src/app/api/memory/route.ts`
  - `src/app/api/memory/[id]/route.ts`
  - `src/app/api/memory/seed/route.ts`
  - `src/app/api/onboarding/route.ts` (v1)
  - `src/app/(app)/sinapsis/page.tsx`
  - `src/app/(app)/boveda/page.tsx`
  - `src/app/(app)/memory/page.tsx`

---

## Session 13 — 2026-04-07: Aurum Fase 2 (reasoning modes Flash/Core/Deep + telemetria) + Onboarding Inteligente + 3 fixes UX + merge a main

### RESUMEN EJECUTIVO

Sesion enfocada en madurar el motor Aurum: agregar 3 modos de razonamiento (Flash/Core/Deep), telemetria de uso, dashboard de admin para ver consumo, mejorar el onboarding para que auto-detecte campos desde la data existente, y resolver 3 bugs de UX. Todo se trabajo en `feat/intelligence-engine-v1` y al final se mergeo a main con simulacion previa.

**Lo que entro a produccion:**
- Reasoning modes Flash (Haiku) / Core (Sonnet) / Deep (Opus) con seleccion del usuario
- Telemetria fire-and-forget a tabla nueva `aurum_usage_logs`
- Dashboard `/admin/usage` con secret key + breakdown por modo, costo, latencia
- Onboarding inteligente: auto-detect de industry/country/business type/sales channels desde data existente del org (productos, ads, ML, etc.) — ya no hace preguntas si tiene la respuesta
- Fix critico: onboarding persistente (ya no vuelve a aparecer en cada refresh)
- Fix UX: chat full-bleed (sin margenes blancos)
- Fix UX: welcome screen rediseñada con halo, badge, gradient headline, suggestion cards

### Commits de esta sesion (en orden cronologico)

1. `849797d` — **feat(aurum): dynamic system prompt + naming cleanup** — System prompt usa orgName de getOrganization() en lugar de hardcoded "El Mundo del Bebe". Affecta: chat/route.ts, dashboard/page.tsx, layout.tsx, sinapsis/page.tsx, cron/digest, insights/route.ts, memory/seed, lib/ai/bot.ts. Tambien agrega ProfileChip subcomponent en sinapsis con datos del onboarding.

2. `9c97892` — **chore(types): fix all pre-existing TS errors + enforce typecheck on build** — Limpieza pre-Fase 2: arreglo de errores de TypeScript que estaban acumulados (Decimal vs number en totalSpent, totalPrice, price, costPrice, spend, conversionValue), $queryRawUnsafe siendo llamado como tagged template, y un parametro que era opcional cuando deberia ser requerido. Tambien: agrega `npm run typecheck` al build para que falle si hay errores de tipos. Affecta 12 archivos. **Esto es importante porque crea una red de seguridad antes de Fase 2.**

3. `f37299d` — **feat(aurum): Fase 2 reasoning modes + onboarding inteligente** — Commit grande: 7 archivos, +1123/-27.
   - Nueva tabla Prisma: `aurum_usage_logs` (15 columnas, 4 indices)
   - Nuevo endpoint: `/api/aurum/context-autodetect` (191 lineas) — corre queries contra la DB del org y devuelve campos auto-detectados (industry, country, business type, sales channels, ads platforms, ML presence, etc.)
   - Nuevo endpoint: `/api/admin/usage` (179 lineas) — GET con secret key que devuelve breakdown agregado de uso por modo, costo, latencia, top users
   - Nueva pagina: `/admin/usage` (468 lineas) — dashboard visual con cards de metricas y filtros
   - Modificado: `chat/route.ts` (+123) — agregada seleccion de modelo segun mode (Haiku/Sonnet/Opus), telemetria fire-and-forget a aurum_usage_logs
   - Modificado: `chat/page.tsx` (+130) — selector de modo Flash/Core/Deep en la UI del chat
   - Migration SQL: `prisma/migrations/aurum_usage_log.sql` (idempotente: CREATE TABLE IF NOT EXISTS + 3 CREATE INDEX IF NOT EXISTS)

4. `4fdc0cd` — **fix(aurum): onboarding persiste + canvas full-bleed + welcome screen mejorada** — 3 archivos, +142/-20. Tres bugs corregidos quirurgicamente:
   - **Bug 1 (CRITICO — onboarding persistente)**: `getOrganization()` en `auth-guard.ts` solo selecciona `id, name, slug` — nunca selecciona `settings`. Por eso `(org as any).settings || {}` siempre era `{}` y el wizard reaparecia en cada refresh, ademas de pisar el campo settings completo en cada POST. Fix: query directa adicional a `prisma.organization.findUnique({ where: { id }, select: { settings: true } })` en GET y POST de `/api/onboarding`.
   - **Bug 2 (margenes blancos)**: el `<main>` del layout tenia padding fijo `p-4 lg:p-6` que se aplicaba a TODAS las paginas, incluido el chat Aurum (que necesita full-bleed dark canvas). Fix: condicional basado en `usePathname()`: si la ruta esta en `aurumRoutes = ["/chat", "/sinapsis", "/boveda", "/memory"]` se usa `flex-1 p-0 overflow-hidden bg-[#0a0a0f]`, sino se mantiene el `flex-1 p-4 lg:p-6 bg-[#F7F8FA] overflow-y-auto` original.
   - **Bug 3 (welcome screen)**: rediseño visual del estado vacio del chat con halo radial 280px, badge "Intelligence Engine v1", headline con gradient (white→amber→gold), CyclingHeadline component que rota 3 frases cada 2.8s, suggestion cards con accent line top + arrow en hover. Tambien removido el `margin: -1rem` del aurumCanvas que solo compensaba el padding mobile y rompia en desktop.

5. `7168cd4` — **merge: feat/intelligence-engine-v1 into main** — Merge a main despues de simulacion local sin conflictos. 33 archivos, +5533/-677. Trae todo lo que estaba en preview que main no tenia (Aurum Fase 1+2, memory, onboarding, sinapsis, boveda, dashboard usage). Preserva el fix `position: relative` del sidebar (`09d69e7`) que estaba solo en main.

### Reasoning Modes — detalle tecnico

| Modo | Modelo | Uso recomendado | Costo |
|------|--------|-----------------|-------|
| Flash | claude-haiku-4-5 | Preguntas rapidas, lookups, queries simples | Bajo |
| Core | claude-sonnet-4-5 | Analisis, recomendaciones, razonamiento estandar | Medio |
| Deep | claude-opus-4-5 | Decisiones criticas, analisis profundo, multi-step | Alto |

- El usuario elige el modo en el selector del chat ANTES de mandar el mensaje.
- Default: Core (Sonnet).
- La eleccion se persiste por sesion del navegador.

### Telemetria — `aurum_usage_logs`

**Schema** (15 columnas):
- `id` (cuid PK)
- `organizationId` (FK)
- `userId` (FK opcional)
- `mode` (flash | core | deep)
- `model` (string exacto del modelo usado)
- `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheCreationTokens` (Int)
- `costUsd` (Decimal — costo calculado)
- `latencyMs` (Int)
- `toolCalls` (Int — cuantas tools llamo)
- `success` (Boolean)
- `errorMessage` (String?)
- `createdAt` (timestamp con index)

**Indices** (4):
- `aurum_usage_logs_pkey`
- `aurum_usage_logs_orgId_createdAt_idx`
- `aurum_usage_logs_mode_createdAt_idx`
- `aurum_usage_logs_createdAt_idx`

**Como se escribe**: fire-and-forget en `chat/route.ts` despues de cada respuesta. Si falla, se loguea pero NO bloquea la respuesta al usuario.

**Donde se aplico la migration**:
- Preview Neon (`ep-crimson-heart-acidomv6-pooler`): aplicada con `prisma db execute --file aurum_usage_log.sql --schema schema.prisma` con `DATABASE_URL` y `DATABASE_URL_UNPOOLED` ambos seteados inline.
- Production Neon (`ep-patient-union-acos5wqz-pooler`): aplicada con el mismo comando.
- **NO se aplico via Vercel build** porque Vercel build no tiene credenciales de escritura (ver Error #1 de Sesion 12).

### Dashboard `/admin/usage`

- URL: `https://nitrosales.vercel.app/admin/usage?key=usage-2026`
- Secret key: `usage-2026` (hardcoded, debe rotarse a env var en algun momento — pendiente)
- Muestra:
  - Total requests (24h, 7d, 30d)
  - Costo total USD
  - Breakdown por modo (Flash/Core/Deep)
  - Top organizaciones por uso
  - Latencia promedio
  - Error rate

### Onboarding Inteligente — diferencia con v1

- **Antes (v1, Sesion 12)**: el wizard preguntaba TODO al usuario (6 preguntas).
- **Ahora (v2, Sesion 13)**: antes de mostrar el wizard, el endpoint `/api/aurum/context-autodetect` corre queries contra la data existente del org y trata de inferir:
  - Industria → desde categorias de productos
  - Pais → desde currency/timezone del org
  - Tipo de negocio → desde si tiene productos fisicos vs servicios
  - Etapa → desde volumen de orders en los ultimos 30 dias
  - Canales venta → desde si tiene ML connection, VTEX, Shopify, etc.
  - Canales ads → desde si tiene ad_metrics_daily de Google, Meta, etc.
- **Lo que NO hace** (correccion explicita del usuario): no calcula la antiguedad del negocio en base a la ultima venta. Eso esta mal porque puede haber meses sin ventas y no significa que el negocio sea nuevo.
- Si encuentra todos los campos, el wizard no aparece y va directo al chat.
- Si solo encuentra algunos, el wizard aparece pero con esos campos pre-llenados.

### Errores y aprendizajes de esta sesion

#### ERROR #1: Aplicar la migration al DB equivocado
- **Que paso**: Al aplicar la migration de `aurum_usage_logs` por primera vez, use el `DATABASE_URL` del `.env.local` que apuntaba a Railway (DB vieja, ya migrada en Sesion 11). El dashboard `/admin/usage` en preview seguia mostrando "Tabla aurum_usage_logs no existe todavia".
- **Causa**: el `.env.local` no se actualizo cuando se hizo la migracion a Neon en Sesion 11.
- **Fix**: pedirle al usuario el `DATABASE_URL` de Vercel del branch `feat/intelligence-engine-v1` (preview Neon) y aplicar ahi.
- **REGLA**: NUNCA confiar en `.env.local` para apuntar a la DB correcta de produccion/preview. Siempre verificar contra Vercel env vars.

#### ERROR #2: Prisma `db execute` requiere ambas env vars
- **Que paso**: Primer intento de aplicar la migration fallo con "Environment variable not found: DATABASE_URL_UNPOOLED" porque el schema valida ambas env vars.
- **Fix**: pasar ambas inline:
  ```bash
  DATABASE_URL='...' DATABASE_URL_UNPOOLED='...' npx prisma db execute --file ... --schema ...
  ```
- **REGLA**: Cuando se usa `prisma db execute` con un schema que tiene `directUrl = env("DATABASE_URL_UNPOOLED")`, ambas variables tienen que estar definidas (aunque `db execute` solo use una). Setearlas inline en el comando es la forma mas segura.

#### ERROR #3: Onboarding wizard reaparecia en cada refresh (CRITICO)
- **Causa raiz**: `getOrganization()` en `src/lib/auth-guard.ts` hace `select: { id: true, name: true, slug: true }` — nunca selecciona `settings`. Codigo en `/api/onboarding` GET hacia `(org as any).settings || {}` que siempre era `{}`.
- **Doble peligro**: el POST tambien leia `currentSettings = (org as any).settings || {}`, asi que cada onboarding submit pisaba TODO el campo settings con solo el businessContext. Cualquier otro setting que estuviera ahi se perdia.
- **Fix**: query directa adicional en GET y POST: `prisma.organization.findUnique({ where: { id: org.id }, select: { settings: true } })`.
- **REGLA**: Cuando `getOrganization()` es selectivo (no trae todos los campos), las rutas que necesitan campos especificos DEBEN hacer su propia query directa. No asumir que `org.settings` existe solo porque TypeScript no se queja (porque se hace cast a `any`).

#### ERROR #4: `margin: -1rem` para compensar padding del layout
- **Que paso**: el aurumCanvas en chat/page.tsx tenia `margin: -1rem` para compensar el `p-4` del layout y verse full-bleed.
- **Por que estaba mal**: el layout tenia `p-4 lg:p-6`, asi que en mobile compensaba bien pero en desktop quedaba un margen blanco visible (porque -1rem es 16px pero `lg:p-6` es 24px).
- **Fix**: en lugar de compensar con margin negativo, hacer que el `<main>` del layout sea condicional: si es ruta Aurum, sin padding y bg dark; sino, padding y bg claro. Tambien remover el margin del aurumCanvas y dejarlo `height: 100% / width: 100%`.
- **REGLA**: NUNCA usar margen negativo para "deshacer" padding del padre. Es fragil (rompe en breakpoints distintos) y oculta intent. Mejor: hacer el padre condicional o usar un wrapper.

#### ERROR #5: Confusion al pushear con git push (token authentication)
- **Que paso**: `git push` daba "Invalid username or token. Password authentication is not supported".
- **Fix**: extraer el token de `/sessions/peaceful-nifty-meitner/.git-credentials` y usarlo inline:
  ```bash
  PASS=$(grep -oP '(?<=://)[^@]+' /sessions/peaceful-nifty-meitner/.git-credentials | head -1 | cut -d: -f2)
  git push "https://x-access-token:${PASS}@github.com/tlapidus-rgb/nitrosales.git" <branch>
  ```
- **REGLA**: Si `git push` falla con auth error, usar el token directamente en la URL del remote en el comando push. No tocar la config global de git.

#### ERROR #6: Tracking ref no se actualiza despues de manual push
- **Que paso**: Despues de pushear con la URL custom (workaround del Error #5), `git status` decia "Your branch is ahead of 'origin/...' by 1 commit" aunque ya estaba pusheado.
- **Causa**: el push manual no actualiza la ref `refs/remotes/origin/<branch>` local.
- **Fix**: `git update-ref refs/remotes/origin/<branch> <commit-sha>`
- **REGLA**: Despues de un push con URL custom, sincronizar manualmente la tracking ref con `git update-ref`.

#### ERROR #7: Asumi que main estaba al dia con el branch base
- **Que paso**: Al preparar el merge a main, asumi que main estaba en `9c97892` (el commit base de feat/intelligence-engine-v1). En realidad main estaba en `09d69e7`, con 1 commit que NO estaba en la rama (el fix `relative` del sidebar).
- **Diagnostico inicial alarmista**: pense que main habia sido revertida porque le faltaban las animaciones Aurum y tenia el `/chat` en otro lugar del sidebar. Pare y consulte al usuario.
- **Realidad**: el usuario habia estado trabajando todo en preview y main estaba "vieja a proposito" — nunca habia recibido los cambios visuales de Aurum.
- **Fix**: simulacion de merge en una rama local (`merge-test-local`), git resolvio el merge automaticamente sin conflictos, verificacion de que el fix `relative` se preservaba (linea 562 del layout mergeado), tsc clean, push.
- **REGLA**: Antes de mergear, verificar el commit actual de main con `git fetch && git log origin/main -3`. Si difiere del commit base esperado, NO entrar en panico — hacer una simulacion local primero. Y siempre consultar al usuario sobre el estado de main si las divergencias parecen significativas.

### Estado al final de Sesion 13

#### Branches
- `feat/intelligence-engine-v1`: en `4fdc0cd` (mergeado a main)
- `main`: en `7168cd4` (merge commit) — **PUSHED Y DEPLOYADO**
- `merge-test-local`: rama temporal local, puede borrarse

#### Files clave nuevos en main
- `src/app/admin/usage/page.tsx` (468 lineas) — dashboard de uso
- `src/app/api/admin/usage/route.ts` (179 lineas) — API del dashboard con secret key
- `src/app/api/aurum/context-autodetect/route.ts` (191 lineas) — auto-deteccion de campos del onboarding
- `prisma/migrations/aurum_usage_log.sql` — migration idempotente

#### Database state
- **Preview Neon** (`ep-crimson-heart-acidomv6-pooler`, sa-east-1): tabla `aurum_usage_logs` creada (15 cols, 4 indices, 0 rows al cierre)
- **Production Neon** (`ep-patient-union-acos5wqz-pooler`, sa-east-1): tabla `aurum_usage_logs` creada (15 cols, 4 indices, 0 rows al cierre)

#### Vercel
- Production build sobre `7168cd4`: **success** (verificado con GitHub status API)
- Preview build sobre `4fdc0cd`: **success**

### Pendientes para futuras sesiones

1. **Rotar passwords de Neon (preview + production)**: las URLs pasaron por chat, deberian rotarse cuando termine el bloque grande de Aurum (al cerrar Fase 3 o un milestone estable). NO rotarlas cada semana, es trabajo en circulo. Usuario informado.
2. **Secret key de `/admin/usage`**: hardcoded como `usage-2026`. Mover a env var (`AURUM_ADMIN_KEY`) cuando se quiera tener mas seguridad.
3. **Onboarding inteligente**: agregar mas heuristicas de auto-deteccion (ej: subcategorias mas finas dentro de "toys" como "hot wheels", "muñecas", etc.)
4. **Telemetria**: empezar a usar el dashboard `/admin/usage` regularmente. Agregar alertas si un mode tiene error rate > X% o latencia > Y segundos.
5. **CapsuleGeometry warning de Three.js (no relacionado con Aurum)**: si en algun momento se usa Three.js, recordar que `THREE.CapsuleGeometry` se introdujo en r142 y nuestro CDN serve r128. Usar alternativas.

### Reglas nuevas que salen de esta sesion (agregar a PREVENCION)

#### PREVENCION #11: Cuando una funcion auth selecciona campos especificos, las rutas que necesitan otros campos DEBEN hacer su propia query
- `getOrganization()` solo devuelve `id, name, slug`. Si necesitas `settings`, `brandKit`, `metadata`, etc, hace tu propia query directa con `prisma.organization.findUnique({ where: { id: org.id }, select: { ... } })`.
- TypeScript no te va a salvar porque la mayoria de rutas usan `(org as any).campo` que pasa el typecheck.
- El bug del onboarding persistente (Sesion 13) es el ejemplo perfecto: 2 dias de "anomalia" hasta que se diagnostico.

#### PREVENCION #12: NUNCA usar margen negativo para deshacer padding del contenedor padre
- Es fragil: rompe en breakpoints distintos cuando el padding del padre tiene clases responsive (`p-4 lg:p-6`).
- Oculta intent: alguien que lee el codigo no entiende por que hay un `-1rem`.
- Mejor: hacer el padre condicional, usar un wrapper, o usar `margin-inline: calc(var(--padding) * -1)` con custom properties.
- Caso real: aurumCanvas en chat/page.tsx tenia `margin: -1rem` que solo compensaba mobile.

#### PREVENCION #13: Antes de mergear preview → main, hacer simulacion local
- `git checkout -b merge-test-local origin/main && git merge <feature-branch> --no-commit --no-ff`
- Verificar:
  1. ¿Hubo conflictos automaticos? (si "Auto-merging" se completa solo, cero riesgo)
  2. Lista de archivos cambiados con `git diff --cached --stat`
  3. Tsc clean en el estado mergeado
  4. Verificar que features especificos del estado actual de main se preservan (ej: el fix `relative` del sidebar)
- Si todo OK, commitear el merge en la rama local y pushearlo a main como `main-local:main`.
- Si algo no esta bien, descartar la rama local con `git checkout - && git branch -D merge-test-local`. Main no se entera.

#### PREVENCION #14: NUNCA aplicar migrations en build de Vercel
- Vercel build NO tiene credenciales de escritura a la DB.
- Las migrations se aplican manualmente con `prisma db execute --file <migration.sql> --schema prisma/schema.prisma` desde local con las env vars correctas inline.
- O con un endpoint temporal de setup que se elimina despues (visto en Sesion 12).
- Caso real: `8da4d3b` agrego `prisma db push` al build script y todo se rompio. Revertido en `1713e96`.

---

## REGLAS DE PREVENCION — ERRORES APRENDIDOS (LEER OBLIGATORIO)

Estas reglas nacen de errores reales cometidos en sesiones 9 y 10. **Son tan importantes como las ACCIONES PROHIBIDAS.**

### PREVENCION #1: NUNCA modificar el connection pool de Prisma en produccion
- **NUNCA** agregar `connection_limit`, `pool_timeout`, `pool_size` al DATABASE_URL ni al constructor de PrismaClient.
- Prisma calcula automaticamente el pool optimo basado en CPU cores del serverless function.
- En Vercel serverless, cada funcion tiene su propio pool. Limitar a 5 significa que UNA funcion que recibe multiples requests se ahoga.
- Si hay problemas de conexion, la solucion es connection pooling externo (PgBouncer, Prisma Accelerate), NO limitar el pool de Prisma.
- **El archivo `src/lib/db/client.ts` NO DEBE TOCARSE.** Esta marcado como ESTABLE.

### PREVENCION #2: NUNCA remover force-dynamic de rutas API
- **Todas las rutas bajo `src/app/api/`** DEBEN tener `export const dynamic = "force-dynamic"` al inicio.
- Sin force-dynamic, Next.js puede intentar pre-renderizar las rutas en build time, lo cual falla porque no hay contexto de auth ni DB disponible durante el build.
- Esto causa que se sirvan respuestas estaticas corruptas o errores cacheados.
- Si el build time es lento, la solucion es otra (ver Prevencion #4), NO remover force-dynamic.

### PREVENCION #3: NUNCA hacer multiples cambios sin testear cada uno por separado
- La sesion 9 hizo 6 commits tocando cosas distintas (force-dynamic, pool limits, SQL rewrites, cache layer, table names) sin verificar cual cambio arreglaba o rompia que.
- **REGLA: Un cambio = un commit = un test.** Si el test falla, revertir ESE commit antes de intentar otra cosa.
- Nunca "apilar" fixes sin confirmar que cada uno funciona individualmente.

### PREVENCION #4: NUNCA reescribir APIs de Prisma ORM a raw SQL sin razon comprobada
- La sesion 9 reescribio metrics, campaigns, ads y trends de `findMany` a `$queryRawUnsafe` asumiendo que el ORM era lento.
- En realidad, el ORM no era el problema — el connection pool era el cuello de botella.
- Raw SQL con `Promise.all` de 10 queries paralelas MULTIPLICA la demanda de conexiones.
- **REGLA: Antes de reescribir una query, demostrar con datos que ESA query es el cuello de botella.** Usar `EXPLAIN ANALYZE` en PostgreSQL, no asumir.

### PREVENCION #5: Si un deploy rompe algo, REDEPLOY del ultimo deploy que funcionaba
- Vercel permite hacer "Redeploy" de cualquier deployment anterior con un click.
- Si un deploy rompe produccion, el camino mas rapido es redeploy del anterior, NO hacer commits nuevos a ciegas.
- **REGLA: Siempre tener identificado cual fue el ultimo deploy funcional antes de hacer cambios.**

### PREVENCION #6: Verificar en produccion con curl ANTES de confirmar que algo funciona
- La sesion 9 marco el problema como "no resuelto" sin testear empiricamente cada API.
- La sesion 10 uso curl para testear 1, 2, 5 y 10 APIs en paralelo y asi demostro la causa exacta.
- **REGLA: Siempre testear con `curl` paralelo contra la URL de produccion (`nitrosales.vercel.app`) despues de cada deploy.**

### PREVENCION #7: Builds lentos — diagnosticar antes de "optimizar"
- El build de 12+ minutos fue con acc44a5 (primer build post-sesion 9 con muchos cambios). El build de b0b8119 (con force-dynamic restaurado) deberia medirse antes de asumir que force-dynamic causa builds lentos.
- **REGLA: Si un build es lento, medir el SIGUIENTE build antes de concluir que algo especifico lo causa.** El cold cache de Vercel puede explicar builds lentos puntuales.
- Si los builds son consistentemente >3 minutos, investigar: `prisma db push` en build command (ya corregido sesion 5), dependencias pesadas, o rutas con imports circulares.

### PREVENCION #8: SIEMPRE verificar que las funciones de Vercel estan en la MISMA REGION que la base de datos
- **LA RAIZ DEL PROBLEMA EN SESION 11**: Vercel deploys serverless functions a iad1 (Virginia, US East) por DEFAULT.
- Si la DB esta en otra region (ej: São Paulo, sa-east-1), cross-continent latency = ~1.3 segundos POR QUERY.
- Con 11 queries por endpoint, total = 14+ segundos → TIMEOUT.
- **REGLA: Antes de agregar cualquier base de datos nueva:**
  1. Identificar la región de la DB
  2. Agregar `"regions": ["<region>"]` a vercel.json para match
  3. Regions mapping: São Paulo (sa-east-1) = "gru1", N. Virginia (us-east-1) = "iad1", EU West (eu-west-1) = "lhr1"
  4. Después del deploy, verificar con curl que la latencia por query es ~60ms, NO ~1300ms
- **Commit de Sesion 11**: 74d9b69 (agregó regions)

### PREVENCION #9: NUNCA instalar paquetes pesados en serverless sin medir el impacto en cold start
- **Sesion 11 descubrió**: @sentry/nextjs + next-axiom agregaron **15-25 segundos a cold start** incluso con todas las features deshabilitadas.
- El problema NO es la ejecución de las features — es que **el package en node_modules bloatea el bundle del serverless function**.
- Cada lambda cold start = unpacking code + instalación = massive overhead si el bundle es grande.
- **REGLA: Antes de agregar ANY npm package a un proyecto serverless:**
  1. Check bundle size: `npm install [package] && npm ls -a [package] | wc -l` para count archivos
  2. Si el package suma >5MB, considerar alternativas:
     - Vercel built-in features (Analytics, Web Vitals)
     - Lightweight alternatives (tiny-driver en lugar de full driver)
     - Client-only solutions (no server overhead)
  3. Si NECESITAS el package, medir el cold start ANTES y DESPUÉS del deploy
  4. Si cold start >5s (was ~1s), REVERTIR y considerar alternativas
- **Alternativas para Sesion 11**: Sentry client-side only (sin wrapper), Vercel-native integrations, custom lightweight logging

### PREVENCION #10: Al migrar una base de datos, SIEMPRE verificar la latencia desde la funcion
- **No verificar desde local machine** — localhost distorsiona la medición.
- **No asumir que la DB está optimizada** — latencia alta puede ser región, networking, o pool exhaustion.
- **REGLA: Crear un debug endpoint** que reporte:
  - Region de la función (via Vercel headers o environment)
  - Connection time (time to first query)
  - DATABASE_URL (redacted, sin credentials)
  - Sample query results
- **Ejemplo commit**: 10e5fff creó /api/debug/connection
- **Después de verificar**: Eliminar el endpoint (no dejar in production)

### PREVENCION #11: SIEMPRE ejecutar `/api/setup/ensure-indexes` despues de cualquier migracion o branch nuevo de DB
- **CONTEXTO**: En Sesion 14 (2026-04-07) Tomy reporto que `/orders` no cargaba en produccion y `/products` daba 500. La causa raiz no era codigo: eran 6 indices criticos que **nunca se crearon en la DB de Neon production** despues de la migracion de Sesion 11.
- Los indices definidos como `CREATE INDEX IF NOT EXISTS` dentro del endpoint `/api/setup/ensure-indexes` **NO son parte del schema Prisma**, por lo que `prisma db push` NO los crea.
- Sin esos indices, las queries de `/api/metrics/orders` (14 queries en paralelo sobre tabla de 60K+ ordenes) tardaban >60 segundos = timeout.
- **CHECKLIST OBLIGATORIO despues de cualquiera de estas situaciones:**
  1. Migracion de DB a un proveedor nuevo (Railway → Neon, etc.)
  2. Creacion de un branch nuevo de Neon (preview, dev, staging)
  3. `prisma db push` o `prisma migrate` sobre una DB virgen
  4. Restore de un backup
  5. Cualquier cambio en `vercel.json regions` (porque puede activar una DB en otra region)
- **Comando para ejecutar el checklist:**
  ```bash
  curl -X POST "https://nitrosales.vercel.app/api/setup/ensure-indexes?key=nitrosales-secret-key-2024-production"
  ```
  - La respuesta debe mostrar `status: "created"` o `status: "already exists"` para los 6 indices.
  - Si algun indice no aparece o da error, investigar antes de seguir.
- **Indices criticos que crea (ver `src/app/api/setup/ensure-indexes/route.ts`):**
  - `idx_orders_org_status_date` — orders (organizationId, status, orderDate)
  - `idx_oi_order_product` — order_items (orderId, productId)
  - `idx_cust_org_first_order` — customers (organizationId, firstOrderAt)
  - `idx_adm_org_plat_date` — ad_metrics_daily (organizationId, platform, date)
  - `idx_acmd_org_date` — ad_creative_metrics_daily (organizationId, date)
  - `idx_pattr_org_model_created` — pixel_attributions (organizationId, model, createdAt)
- **REGLA: Cuando se agreguen nuevos indices criticos en el futuro, agregarlos a `ensure-indexes/route.ts` Y documentarlos aqui.**
- **Verificacion post-ensure: Hacer curl al endpoint critico y medir el tiempo. Debe responder en <2s.**
  ```bash
  curl -s -o /dev/null -w "HTTP=%{http_code} TIME=%{time_total}s\n" -m 30 "https://nitrosales.vercel.app/api/metrics/orders?from=2026-03-01&to=2026-04-07"
  ```

### PREVENCION #12: Diagnostico de "loading infinito" en produccion — usar curl ANTES de modificar codigo
- **LECCION DE SESION 14**: La primera hipotesis fue "falta `maxDuration` en metrics routes". Apliqué el fix, deploye, y el problema **seguia**. La causa real eran indices faltantes en la DB.
- **REGLA: Antes de tocar codigo para diagnosticar lentitud en produccion, hacer SIEMPRE estos curls primero:**
  ```bash
  # 1. Check si responde y cuanto tarda
  curl -s -o /tmp/r.txt -w "HTTP=%{http_code} TIME=%{time_total}s\n" -m 90 "https://nitrosales.vercel.app/api/metrics/<endpoint>?from=...&to=..."
  # 2. Si HTTP 504 → es timeout (function killed por Vercel)
  # 3. Si HTTP 500 → leer /tmp/r.txt para ver el mensaje de error real
  # 4. Si HTTP 200 pero >5s → query lenta (probable falta de indices)
  # 5. Si HTTP 200 y <2s → no es el endpoint, es el frontend
  ```
- **El fix correcto depende del HTTP code:**
  - **504 timeout** → Investigar queries lentas + indices ANTES de aumentar `maxDuration`. Aumentar el timeout solo "esconde" el problema, no lo arregla.
  - **500 error** → Leer el mensaje del catch block (la mayoria de routes devuelven `error.message` en el body). El mensaje suele apuntar directo a la query que falla.
  - **200 lento** → Indices, plan de query (`EXPLAIN ANALYZE`), o cantidad excesiva de queries paralelas.
- **NUNCA asumir que un timeout = falta de `maxDuration`. Casi siempre es indices o queries mal diseñadas.**

### Notas tecnicas para futuras sesiones

- Los nombres de tabla correctos segun schema Prisma son: `orders`, `order_items`, `products`, `customers`, `ad_metrics_daily`, `ad_creative_metrics_daily`, `web_metrics_daily`, `ad_campaigns`, `ad_sets`, `ad_set_metrics_daily`, `ad_creatives`, `pixel_visitors`, `pixel_attributions`, `funnel_daily`
- CSS: globals.css tiene `body { color: var(--nitro-text) }` donde `--nitro-text: #FFFFFF`. Usar inline `style={{ color: "#hex" }}` para texto en fondos claros
- **Indices de la DB**: Ver PREVENCION #11. Re-ejecutar `/api/setup/ensure-indexes` despues de cualquier migracion. NO asumir que existen.
- El git local puede tener pack files corruptos. Si hay errores de git, usar GitHub API directamente (Contents API para archivos individuales, Git Data API para commits multi-archivo).
- **Workaround git corrupto (Sesion 17)**: El repo montado en `/mnt/nitrosales` tiene pack files corruptos que impiden `git add`/`commit`/`push`. Solucion: clonar fresco desde GitHub a un dir temporal, copiar los archivos editados, commitear y pushear desde el clone fresco.

---

## Sesion 16 — 2026-04-11: Fixes VTEX en Pedidos > Resumen (10 items)

### RESUMEN

Sesion de bugfixes en la seccion VTEX de Pedidos > Resumen. 10 items corregidos, cada uno con su propio commit. No se documento en CLAUDE_STATE.md en su momento.

### Commits (reconstruidos desde git log)

1. `2041c7d` — fix: geography query handles numeric postal codes (VTEX uses 4-digit CPs)
2. `1e5a0c0` — docs: add SQL query safety rules + error prevention log
3. `1cead2f` — fix: ProfitabilityCard shows Comisiones VTEX when source=VTEX
4. `cf868de` — fix: replace unicode escapes with real UTF-8 chars in ProfitabilityCard
5. `9368728` — fix: rename "Sin identificar" to "Clientes MercadoLibre" in CohortsCard
6. `8631122` — docs: update CLAUDE_STATE.md + ERRORES for session 16
7. Otros commits de la sesion 16 cubrieron ajustes menores en la vista VTEX de Resumen

### Archivos modificados

- `src/app/(app)/orders/page.tsx` — Multiples fixes en subcomponentes (ProfitabilityCard, CohortsCard, geography queries)
- `src/app/api/metrics/orders/route.ts` — Fix queries SQL de provincias y codigos postales
- `CLAUDE_STATE.md`, `CLAUDE.md` — Documentacion actualizada

---

## Sesion 17 — 2026-04-12: Resilience pagina pedidos + sync on-demand + limpieza crons

### RESUMEN EJECUTIVO

Sesion centrada en 3 problemas:
1. **Pagina de pedidos en blanco** — problema recurrente desde sesion 16. Se identifico la causa raiz (crons agresivos saturando Vercel) y se blindó la pagina con 3 capas de proteccion.
2. **Boton de sincronizacion manual** — abria pestanas no deseadas y saturaba el servidor. Eliminado.
3. **Crons agresivos** — 16+ ejecuciones pesadas/hora. Reducidos drasticamente. Meta/Google Ads migrados a modelo on-demand.

Ademas se completaron 2 mejoras visuales pedidas por Tomy:
- CohortsCard (tipos de cliente) movido al fondo de Resumen
- Grafico de ventas diarias con lineas individuales VTEX y MELI en vista "Todos"

### Causa raiz de la pagina en blanco

Los crons de sincronizacion (sync, chain, meta, google-ads) corrian **cada 15 minutos** — ~16 ejecuciones pesadas por hora, cada una con maxDuration=800s. Cuando el usuario abria la pagina de pedidos al mismo tiempo, las funciones serverless de Vercel estaban saturadas y respondian 503. La pagina no manejaba bien los 503 (se quedaba en blanco).

### Solucion implementada (3 capas)

**Capa 1 — Error Boundary (React)**: Archivo `error.tsx` que atrapa crashes de render y muestra boton "Recargar seccion" en vez de pantalla blanca.

**Capa 2 — safeQuery en API**: Wrapper que atrapa errores de queries individuales y devuelve fallback vacio. Si una query secundaria falla, las demas siguen funcionando (la API ya no es all-or-nothing).

**Capa 3 — UI de error/retry en pagina**: Cuando la API falla despues de 3 reintentos, muestra mensaje claro con boton "Recargar pagina" en vez de blanco. Si los datos tardan, muestra spinner con link de recarga manual.

### Migracion a sync on-demand (Meta/Google Ads)

**Antes**: Crons cada 4h disparaban sync de Meta y Google Ads en background, sin importar si alguien necesitaba los datos.

**Despues**: Cuando el usuario abre la pagina de campanas, se chequea la frescura de los datos (via `Connection.lastSyncAt`). Si tienen mas de 30 minutos, se dispara sync en background con `waitUntil` (fire-and-forget). La pagina muestra "Actualizando datos..." y se refresca automaticamente al terminar.

**Archivos nuevos creados:**
- `src/app/api/sync/trigger/route.ts` — Endpoint que recibe `?platform=META|GOOGLE`, verifica frescura, y dispara sync via `waitUntil`. Devuelve respuesta inmediata.
- `src/lib/hooks/useSyncStatus.ts` — Hook React reutilizable. Chequea frescura al montar, dispara sync si datos viejos, pollea `/api/sync/status` cada 5s hasta completar, llama callback de refresh.

### Limpieza de crons (vercel.json)

| Cron | Antes | Despues | Razon |
|------|-------|---------|-------|
| `/api/sync` (VTEX) | cada 4h | 1x/dia 3am | Webhooks cubren en tiempo real |
| `/api/sync/chain` (inventario) | cada 6h | 1x/dia 4am | Webhook de inventario cubre cambios |
| `/api/sync/meta` | cada 4h | **ELIMINADO** | Migrado a on-demand |
| `/api/sync/google-ads` | cada 4h | **ELIMINADO** | Migrado a on-demand |
| `/api/cron/ml-sync` | cada 4h | 1x/dia 2am | Webhook ML cubre en tiempo real |
| Otros (anomalies, digest, gsc, competitors) | sin cambios | sin cambios | Ya eran 1x/dia |

**Resultado**: De ~16 ejecuciones pesadas/hora a ~0 cuando nadie usa la app.

### Commits de esta sesion (en orden cronologico)

1. `5807586` — **fix: 3-layer resilience to permanently prevent blank orders page** — Error Boundary + safeQuery + Suspense wrapper
2. `4d34486` — **fix: remove manual Sync button from header — prevents server overload** — Eliminado boton "Sincronizar datos" del layout
3. `7c65c13` — **feat: move CohortsCard to bottom + add VTEX/MELI lines to daily sales chart** — Tipos de cliente al fondo + grafico con 3 lineas (Total violeta, VTEX verde, MELI ambar)
4. `cc5f287` — **fix: prevent blank page + reduce aggressive cron frequency** — UI de retry en pagina + crons reducidos de cada 15min a cada 4-6h
5. `d7b5b7f` — **feat: replace Meta/Google Ads crons with on-demand sync** — Trigger endpoint + useSyncStatus hook + paginas de campanas con sync bajo demanda + crons Meta/Google eliminados + VTEX/ML reducidos a 1x/dia
6. `1662942` — **docs: update CLAUDE_STATE + CLAUDE.md for sessions 16-17** — Documentacion completa de ambas sesiones
7. `55b494d` — **style: change VTEX line color to pink in daily sales chart** — Linea VTEX cambiada de verde (#10b981) a rosa (#ec4899) por pedido de Tomy
8. `a9cc35f` — **fix: block browser tabs from opening sync endpoints** — Browser navigation guard en /api/sync, /api/sync/chain, /api/sync/inventory. Si detecta navegador (sec-fetch-dest: document), redirige a dashboard. Logging temporal de caller info.

### Archivos modificados en esta sesion

| Archivo | Cambio |
|---------|--------|
| `src/app/(app)/orders/error.tsx` | NUEVO — Error Boundary |
| `src/app/(app)/orders/page.tsx` | Suspense, safeQuery refs, CohortsCard movido, grafico con lineas VTEX/MELI, UI retry |
| `src/app/api/metrics/orders/route.ts` | safeQuery wrapper, query dailySalesBySource |
| `src/app/(app)/layout.tsx` | Boton sync eliminado |
| `src/app/api/sync/trigger/route.ts` | REESCRITO — fire-and-forget con waitUntil |
| `src/lib/hooks/useSyncStatus.ts` | NUEVO — hook de sync on-demand |
| `src/app/(app)/campaigns/meta/page.tsx` | useSyncStatus + UI badge sync |
| `src/app/(app)/campaigns/google/page.tsx` | useSyncStatus + UI badge sync |
| `vercel.json` | Crons Meta/Google eliminados, VTEX/ML reducidos a 1x/dia |
| `src/app/(app)/orders/page.tsx` | Linea VTEX cambiada de verde a rosa (#ec4899) |
| `src/app/api/sync/inventory/route.ts` | Browser guard + caller logging |
| `src/app/api/sync/chain/route.ts` | Browser guard |
| `src/app/api/sync/route.ts` | Browser guard |

### Pestanas de sync/inventory abriendose solas (RESUELTO)

El usuario reporto 3 veces que pestanas del navegador se abrian solas mostrando el JSON crudo de `/api/sync/inventory`. Se investigo el codigo de la app completo (sin encontrar `window.open`, links, redirects — nada).

**Causa raiz: una tarea programada de Claude Desktop ("Inventory sync runner")**. Esta tarea habia sido creada en una sesion anterior para completar el sync inicial del catalogo VTEX (29K+ SKUs). Estaba configurada con `*/5 * * * *` (cada 5 minutos) y nunca se desactivo despues de cumplir su proposito. Claude Desktop abria el endpoint como una pestana del navegador cada vez que la ejecutaba.

**Solucion:**
1. Se desactivo la tarea programada "Inventory sync runner" (via `update_scheduled_task`, `enabled: false`)
2. Se agrego browser navigation guard como prevencion extra en los 3 endpoints de sync — si un navegador intenta abrirlos, redirige al dashboard en vez de mostrar JSON

**Leccion clave: antes de buscar bugs en el codigo de la app, verificar las tareas programadas de Claude Desktop** (seccion "Programado" en el sidebar izquierdo de Cowork).

### Estado final de produccion

- **Commit en main**: `a918590`
- **Pagina de pedidos**: Nunca mas queda en blanco. 3 capas de proteccion. Grafico con lineas VTEX (rosa) y MELI (ambar).
- **Crons**: 9 crons (antes 11). La mayoria 1x/dia. Meta y Google Ads son on-demand.
- **Sync model**: VTEX/MELI via webhooks (real-time) + safety net 1x/dia. Meta/Google Ads on-demand cuando usuario abre la pagina.
- **Browser guard**: Los 3 endpoints de sync (/api/sync, /api/sync/chain, /api/sync/inventory) detectan si un navegador intenta abrirlos como pestana y redirigen al dashboard. Prevencion extra.
- **Tareas programadas Claude Desktop**: "Inventory sync runner" DESACTIVADA. "Nitrosales brain sync" activa (1x/dia 8am).

### PREVENCION #13: Crons agresivos saturan funciones serverless

- **CONTEXTO**: Sesion 17. Pagina de pedidos en blanco repetidamente. La causa NO era el codigo de la pagina sino crons que corrian cada 15 minutos saturando las funciones serverless de Vercel.
- **REGLA**: Nunca configurar crons mas frecuentes que 1x/hora para sync pesados. Preferir modelo on-demand (sync cuando el usuario lo necesita).
- **REGLA**: Si ya hay webhooks configurados para una plataforma (VTEX, MELI), el cron de esa plataforma debe ser maximo 1x/dia como red de seguridad.
- **REGLA**: Antes de agregar un cron nuevo, verificar que no hay un webhook que ya cubra esa funcionalidad.

### PREVENCION #14: Pagina en blanco = NO es siempre un bug del frontend

- **CONTEXTO**: Sesion 17. El instinto fue buscar el bug en el codigo de la pagina, pero la causa real fue saturacion del servidor por crons.
- **REGLA**: Si una pagina queda en blanco, verificar PRIMERO:
  1. El network tab — si la API devuelve 503/504, el problema es el servidor, no la pagina
  2. Las tabs abiertas — otras pestanas consumiendo recursos
  3. Los crons de Vercel — si hay syncs corriendo al mismo tiempo
  4. RECIEN ENTONCES revisar el codigo del frontend

### PREVENCION #15: Tareas programadas de Claude Desktop pueden causar efectos secundarios

- **CONTEXTO**: Sesion 17. Pestanas del navegador se abrian solas cada 5 minutos mostrando JSON de /api/sync/inventory. Se investigo el codigo de la app SIN encontrar nada. La causa real era una tarea programada de Claude Desktop ("Inventory sync runner") creada en una sesion anterior y nunca desactivada.
- **REGLA**: Cuando algo inexplicable sucede en el navegador del usuario (pestanas que se abren solas, requests que aparecen sin trigger), ANTES de investigar el codigo de la app, **verificar las tareas programadas de Claude Desktop** con `list_scheduled_tasks`.
- **REGLA**: Toda tarea programada de Claude Desktop que se cree para un proposito temporal (sync inicial, backfill, etc.) debe desactivarse INMEDIATAMENTE despues de cumplir su objetivo. No dejarla corriendo indefinidamente.
- **REGLA**: Las tareas programadas de Claude Desktop aparecen en el sidebar izquierdo de Cowork bajo "Programado".

### PREVENCION #16: Endpoints de API deben tener browser navigation guard

- **CONTEXTO**: Sesion 17. Como prevencion extra, se agrego un guard a los endpoints de sync.
- **REGLA**: Todo endpoint de sync/cron que NO esta pensado para uso directo del browser debe detectar `sec-fetch-dest: document` o `sec-fetch-mode: navigate` y redirigir a `/` en vez de devolver JSON.
- **REGLA**: Esto no afecta a llamadas server-to-server (fetch desde crons o desde chain route) porque no envian esos headers.
- **PATRON**: Agregar al inicio del handler GET:
  ```
  const secFetchDest = req.headers.get("sec-fetch-dest");
  const secFetchMode = req.headers.get("sec-fetch-mode");
  if (secFetchDest === "document" || secFetchMode === "navigate") {
    return NextResponse.redirect(new URL("/", req.url));
  }
  ```

---

## Sesion 20 — 2026-04-14: categoryPath VTEX + consolidacion multi-canal por SKU + tablas compactas

### RESUMEN EJECUTIVO

Sesion centrada en 3 bloques de trabajo sobre la pagina `/products` (Comercial > Rentabilidad):

1. **categoryPath VTEX (tree categoria)**: Agregado el path jerarquico completo de VTEX (ej. `"Juguetes > Bebes > Sonajeros"`) a la tabla de productos. Nueva columna `categoryPath` en DB + backfill desde VTEX Category API + UI tree expandible (root → subcategorias) en la tabla "Margen por Categoria".
2. **Nueva tabla "Margen por Marca"**: Tabla full-width agregada despues de "Margen por Categoria" con el mismo look & feel.
3. **Consolidacion multi-canal por SKU**: Refactor arquitectural de `/api/metrics/products` para usar VTEX como catalogo maestro y sumar ventas VTEX + MELI por SKU. Antes: mismo SKU aparecia 2 veces en la tabla (una por canal), la fila MELI sin imagen. Despues: una fila por SKU, con metadata del master (VTEX priority) y ventas sumadas de todos los canales.
4. **Tablas compactas**: Reducidos paddings y tamano de fuente en 4 tablas (Categoria, Marca, Top 10 mas rentables, Top 10 menos rentables) + max-height + sticky headers para evitar scroll excesivo de la pagina.

### STAGE 1 — Migracion DB (EJECUTADA)

Se creo un endpoint admin idempotente con auth-key para correr el ALTER:

- `prisma/migrations/add_category_path.sql` — `ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "categoryPath" TEXT;`
- `src/app/api/admin/migrate-category-path/route.ts` — ejecuta el ALTER verificando `NEXTAUTH_SECRET` via query param `?key=`. Respuesta: `{ok, alreadyExisted, columnExistsNow}`.

**Resultado del run**: `{"ok":true,"alreadyExisted":false,"columnExistsNow":true}`. La columna quedo creada en produccion ANTES de modificar el schema.prisma (evita que Prisma genere SELECTs contra una columna inexistente).

### STAGE 2 — Codigo (APLICADO AL REPO, PENDIENTE DE PUSH)

**2a. Schema Prisma** (`prisma/schema.prisma`):
- Agregado `categoryPath String?` al modelo `Product`.

**2b. Sync VTEX** (`src/app/api/sync/vtex-details/route.ts`):
- `extractBrandCategory` devuelve `{ brand, category, categoryPath }` donde `categoryPath = names.join(" > ")`.
- Los callers (2 sitios) destructuran y escriben `categoryPath` tanto en `create` como en `update` del upsert.

**2c. Backfill endpoint** (`src/app/api/fix-brands/route.ts`):
- Nuevo cache `_categoryCache: Map<number, {name, fatherId}>` + helpers `getVtexCategoryInfo()` y `getVtexCategoryPath()` que suben por `FatherCategoryId` hasta la raiz (MAX_DEPTH=8).
- Nueva action `fix-category-paths`: pagina `limit/offset`, `BATCH_SIZE=50`, `DELAY_MS=200`. Para cada producto con VTEX productId, llama a la API de VTEX, construye el path, y upserta.
- Action `stats` extendida con `withCategoryPath / withoutCategoryPath / pctWithCategoryPath`.

**2d. Metrics endpoint** (`src/app/api/metrics/products/route.ts`) — REFACTOR POR SKU:
- Query 3 (productAggregation) reescrita con dos CTEs:
  - `master_products`: `DISTINCT ON (sku)` con prioridad de seleccion: (1) tiene imageUrl, (2) tiene categoryPath, (3) tiene costPrice, (4) mas antiguo. En la practica selecciona el row VTEX cuando existe.
  - `sales_by_sku`: agrega `units / revenue / orders` por `p.sku` joineando `order_items → orders → products`.
  - El SELECT final join-ea master + sales por SKU. `cogs` = `units * master.costPrice`.
- Query 5 (weeklySalesByProduct) reescrita: `GROUP BY p.sku` en vez de `productId`.
- Query 6 (lastSaleDateByProduct) reescrita: `GROUP BY p.sku` en vez de `productId`.
- Maps `weeklyTrendMap` y `lastSaleDateMap` ahora usan `sku` como key.
- Map function del response usa `weeklyTrendMap.get(prod.sku)` y `lastSaleDateMap.get(prod.sku)`.
- Agregado `categoryPath: string | null` al type `ProductMetrics` y al inner type de la query.

**2e. UI /products** (`src/app/(app)/products/page.tsx`):
- `ProductItem` extendido con `categoryPath: string | null`.
- Nuevo state `expandedCats: Record<string, boolean>` + useMemo `computedByCategoryTree` que parsea `categoryPath` por `" > "`, agrupa por root y acumula metricas por leaf. Fallback a categoria flat si no hay path.
- Tabla "Margen por Categoria" convertida en tree: row root con chevron ▶/▼ (click para expandir), rows hijas con `pl-10` de indent.
- Nueva tabla "Margen por Marca" agregada debajo, full-width, mismo look & feel.
- 4 tablas compactadas:
  - Categoria y Marca: `px-6 py-3 text-sm → px-4 py-1.5 text-xs`, wrapper `overflow-y-auto max-h-[440px]`, thead `sticky top-0 z-10`.
  - Top 10 y Bottom 10: header `p-4 → px-4 py-2.5`, celdas `px-4 py-2 → px-3 py-1`, `text-sm → text-xs`, nombre producto `text-xs → text-[11px] leading-tight`.

### Arquitectura post-consolidacion

```
products (DB)                              orders + order_items (DB)
  ├── row VTEX sku=ABC123 (imagen OK)         ├── item VTEX → productId=row_vtex
  └── row MELI sku=ABC123 (imagen null)       └── item MELI → productId=row_meli

            ↓ CTE master_products                          ↓ CTE sales_by_sku
            (DISTINCT ON sku,                               (SUM por p.sku
             prio VTEX)                                      joineando products)

              1 master row por SKU ←─────JOIN POR SKU─────→ ventas consolidadas
                                             ↓
                                    ProductMetrics (1 row por SKU fisico)
```

### Pendiente post-deploy

1. `git push origin main` de los cambios 2b-2e (el endpoint admin 2a ya esta en prod).
2. Correr la action `fix-category-paths` en loop via curl para backfillear el path VTEX de todos los productos. Pattern:
   ```
   curl -X POST 'https://nitrosales.vercel.app/api/fix-brands?action=fix-category-paths&limit=50&offset=0'
   curl -X POST 'https://nitrosales.vercel.app/api/fix-brands?action=fix-category-paths&limit=50&offset=50'
   ...
   ```
   Chequear progreso con `?action=stats`.
3. Validar en UI que:
   - Productos vendidos solo por MELI ahora muestran imagen VTEX (via master por SKU).
   - La tabla tree de categoria muestra root con chevron + hijos al expandir.
   - Las 4 tablas no hacen scroll desmesurado.

### Commits de esta sesion

Pendiente de push. Cambios locales agrupados en 2 commits:
1. `feat(productos): categoryPath VTEX + tree en Margen por Categoria + tabla Margen por Marca` — Stage 2a-2c + UI tree + tabla Marca
2. `feat(productos): consolidacion multi-canal por SKU + tablas compactas` — Stage 2d + compactacion

### Archivos modificados en esta sesion

| Archivo | Cambio |
|---------|--------|
| `prisma/schema.prisma` | `+ categoryPath String?` en Product |
| `prisma/migrations/add_category_path.sql` | NUEVO — ALTER idempotente |
| `src/app/api/admin/migrate-category-path/route.ts` | NUEVO — endpoint para correr la migracion |
| `src/app/api/sync/vtex-details/route.ts` | `extractBrandCategory` devuelve categoryPath, 2 callers escriben el campo |
| `src/app/api/fix-brands/route.ts` | Nueva action `fix-category-paths`, cache + walk de FatherCategoryId, stats extendido |
| `src/app/api/metrics/products/route.ts` | Queries 3/5/6 reescritas por SKU con CTE master_products + sales_by_sku, Maps por SKU, categoryPath en response |
| `src/app/(app)/products/page.tsx` | ProductItem.categoryPath, useMemo tree, tabla tree, tabla Marca nueva, 4 tablas compactadas |

### Estado final de produccion

- **Commit en main**: `a918590` (pre-sesion 20, sin los cambios de esta sesion todavia).
- **DB produccion**: Columna `categoryPath` ya existe (stage 1 ejecutado).
- **Codigo en main**: todavia no tiene los cambios stage 2 — pendiente de push.
- **URL produccion real**: `https://nitrosales.vercel.app` (CLAUDE.md tenia `app.nitrosales.io` — CORREGIDO en esta sesion).

---

## Sesion 22 (cont.) — 2026-04-14 tarde/noche: /campaigns premium polish + Creativos Lab Phase 1

> Update agregado al arrancar Sesion 23, reflejando commits pusheados despues de que CLAUDE_STATE fuera actualizado por ultima vez (9769b45, "docs S22"). Estos 8 commits estaban en main pero no documentados aqui.

### Commits pusheados a main (post 9769b45)

| Commit | Mensaje | Alcance |
|---|---|---|
| `7180a7f` | feat(/campaigns): bloque Acciones Urgentes (3 cards) + Salud del Mix TOF/MOF/BOF en Hoy | Tab "Hoy" de `/campaigns`: 3 cards de urgencias + mini distribucion TOF/MOF/BOF |
| `84fd33b` | feat(/campaigns): Hoy premium — 4 KPIs, Platform cards Meta/Google, chart unico + animaciones | Rediseño completo de tab "Hoy": 4 KPIs con count-up, 2 platform cards (Meta/Google), chart unico con animaciones easeOutExpo |
| `07d18a2` | feat(/campaigns): premium polish — pulso verde titilante + shimmer + Hero Plataformas vs Realidad | Pulso verde `animate-ping` en KPIs vivos, shimmer en banner, Hero "Plataformas vs Realidad" rediseñado |
| `0593ae9` | feat(/campaigns): fix Mix Health % + Acciones x6 + Hero suavizado + tooltips premium | Fix del calculo de % del Mix Health, Acciones ampliadas a 6 cards, tooltips custom premium |
| `81bceea` | fix(/campaigns): alias recharts Tooltip como RechartsTooltip para evitar colision con tooltip custom | Fix TS/runtime: import colision recharts vs tooltip custom. `import { Tooltip as RechartsTooltip }` |
| `801d144` | revert(/campaigns): vuelvo DiscrepancyBlock a diseno previo con 3 cards de colores fuertes | Revert visual a version anterior del DiscrepancyBlock (3 cards de colores, no la version "suave") |
| `eb5f1f0` | feat(/campaigns): banner Blended ROAS premium con zone gauge nombrado y multiplicador hero | Banner superior de `/campaigns`: zone gauge con nombres (Rojo/Ambar/Verde/Azul) + multiplicador hero animado |
| `2ff4cd9` | feat(/campaigns/creatives): Lab premium con Meta/Google separados, galeria visual, player y deteccion de fatiga | **Creativos Lab Phase 1 en main**: rewrite de `/campaigns/creatives/page.tsx` con Meta y Google separados, galeria visual, player de video y deteccion de fatiga (CTR decay) |

### Estado visual actual en producción (post 2ff4cd9)

- `/campaigns` (tab "Hoy"):
  - Banner superior con Blended ROAS (VTEX-only), zone gauge con nombres, multiplicador hero animado, shimmer premium.
  - 4 KPIs con count-up animado (Revenue, Ad Spend, Blended ROAS, CAC).
  - Bloque "Plataformas vs Realidad" (Hero) — Meta + Google cards con pulso verde titilante en KPIs vivos.
  - Chart unico diario con Meta / Google / Blended lines + linea break-even ROAS (ReferenceLine).
  - Bloque "Salud del Mix" — mini distribucion TOF / MOF / BOF con porcentajes correctos.
  - Bloque "Acciones Urgentes" — 6 cards (antes 3) con señales accionables.
  - DiscrepancyBlock con 3 cards de colores fuertes (revert del intento suave).
  - Tooltips custom premium reemplazando los defaults de recharts (alias `RechartsTooltip`).

- `/campaigns/creatives` (Creativos Lab Phase 1):
  - Pagina con Meta y Google separados en secciones propias.
  - Galeria visual de creatives con thumbnails.
  - Player de video para ads video-native.
  - Deteccion de fatiga (CTR decay) como señal principal.
  - **1061 lineas** en `src/app/(app)/campaigns/creatives/page.tsx` (estado al momento de 2ff4cd9).

### Cambios locales sin pushear (a trabajar en Sesion 23)

Archivos presentes en el working tree al arranque de S23:

- **Untracked**:
  - `src/app/api/media/proxy/route.ts` — proxy generico para thumbnails/imagenes (evita CORS y bloqueos de hotlinking de Meta/Google CDNs).
  - `src/app/api/media/video/[creativeId]/route.ts` — endpoint lazy-load para el video de un creative Meta (streaming `video_source.source_url`).
  - `src/app/api/metrics/ads/structure/route.ts` (298 lineas) — endpoint nuevo que devuelve la estructura jerarquica de Meta (Campaign → AdSet → Ad) y Google (por tipo de campaña: Search / Shopping / PMax / Display / Video). Alimenta el Lab reescrito.
- **Modified**:
  - `src/app/api/metrics/ads/route.ts` (+7 lineas) — soporte de filtro `adSet` para drilldown dentro del Lab.
  - `ERRORES_CLAUDE_NO_REPETIR.md` (+42 lineas) — Error #NUEVO-S22-F (paths placeholder + binarios locales) ya agregado al inicio del archivo.
- **Pendiente de rewrite**: `src/app/(app)/campaigns/creatives/page.tsx` — rewrite completo para integrar los 3 endpoints nuevos: helper `proxied()` para thumbnails via `/api/media/proxy`, vista Meta jerarquica (Campaign → AdSet → Ad) con toggle Galeria, Google por tipo de campaña (Search SERP-style, Shopping, PMax, Display, Video), modal con video lazy-load.

### Pendientes concretos (Sesion 23)

1. Pushear los 3 archivos untracked + los 2 modificados + rewrite del `page.tsx` en commits granulares a `main`.
2. Validar que Vercel buildeee limpio (sin TS errors).
3. Chequear en produccion que:
   - Los thumbnails de Meta/Google carguen via proxy (sin CORS).
   - El drilldown Campaign → AdSet → Ad de Meta funcione.
   - Google se segmente correctamente por tipo de campaña.
   - El modal de video haga lazy-load del `video_source.source_url`.

### Estado final de produccion al cierre de S22

- **Ultimo commit en main**: `2ff4cd9` (Creativos Lab Phase 1).
- **URL prod**: `https://nitrosales.vercel.app`.
- **Deploy Vercel**: verde.
- **Docs alineados**: este bloque agregado en S23 arranque.


