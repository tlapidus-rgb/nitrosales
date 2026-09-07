# Handoff del proyecto — NitroSales

> **Versionado el 2026-09-07 (E-17).** Esto vivía sólo como `PROJECT-HANDOFF.local.md`, excluido del
> repositorio por `.gitignore` (`*.local.md`) — a pesar de autodescribirse como *"documento maestro,
> para un chat nuevo leé esto primero"*. Era la pieza principal de que el bus factor fuera 1: no por
> falta de documentación (hay muchísima) sino porque **la que importa no estaba versionada**.
>
> Esta copia es la misma, con los secretos sacados. La versión local sigue existiendo y puede tener
> notas de sesión que no valen la pena versionar; **si las dos divergen, gana esta**.

## ⚠️ Nota de secretos

Donde el original tenía valores en texto plano, acá dice `<VER-NOTA-DE-SECRETOS>`. Los valores reales
están en Vercel → Settings → Environment Variables.

Y hay algo que conviene saber antes de tocarlos: **`ADMIN_API_KEY` y `NEXTAUTH_SECRET` son el mismo
literal**, verificado contra producción el 2026-09-07. Ese valor está además en `vercel.json`, que sí
está versionado. Con él se puede forjar una sesión de staff.

Rotarlo tiene un orden estricto y no es opcional: hacerlo antes de que el webhook de órdenes de VTEX
tenga su propio secreto **corta la ingesta de los cuatro clientes, en silencio**. Ver R-C07 → R-C08 →
R-C09 en `PLAN_REMEDIACION.md`.

---

> **Documento maestro / punto de entrada.** Para un chat nuevo: leé esto primero; abajo está el
> mapa a los docs de detalle (memorias + `*.local.md` + `docs/`). Escrito por Claude tras una
> sesión larga que cerró el rediseño enterprise + varios fixes, todo **ya en producción**.

---

## 0. Reglas operativas CRÍTICAS (no romperlas)

- **La DB de prod NO se toca desde acá.** El usuario corre TODO el SQL en la **consola de Neon**. Claude **nunca** ejecuta contra la DB de prod ni maneja connection strings (una vez se filtró un `DATABASE_URL` y se rotó la password de `neondb_owner`).
- **CORE PROTECTED — no tocar nunca:** `src/lib/pixel/attribution.ts`, `src/app/api/webhooks/vtex/orders/route.ts`.
- **Merge a main / go-live = requiere OK explícito del usuario** (Tomy es el que aprueba diseño/producto).
- **Admin/cron key (prod):** `<VER-NOTA-DE-SECRETOS>` (= `ADMIN_API_KEY`).
- **Repos van a `C:\Users\axelf\github\nitrosales`** (NO en `OneDrive\Documents`: Defender/CFA bloquea git/shell ahí). Al correr git/bash usar `cd /c/Users/axelf/github/nitrosales`.
- Windows + git-bash. tsc puede dar **falso exit-2 por `.next/types` stale** al cambiar de branch → `rm -rf .next/types` y re-correr.

## 1. Qué es NitroSales

SaaS de analytics/atribución e-commerce (multi-tenant). Next.js (App Router) + Prisma + Postgres (Neon) + Vercel. Módulos: **NitroPixel** (pixel propio de first-party data + atribución), **Bondly** (CRM/segmentos/LTV), **Aura** (creators/influencers), **Campañas** (Meta/Google Ads), **Finanzas**, **Productos/Pedidos**, **MercadoLibre**, **SEO/Competencia**, **Aurum** (asistente AI). Prod: `app.nitrosales.ai`. Repo: `github.com/tlapidus-rgb/nitrosales`, branch default `main` (prod).

**Orgs reales de referencia** (ver [[nitrosales-org-ids]]): `cmmmga1uq0000sb43w0krvvys` = **El Mundo del Juguete** (la "org grande", mucho volumen); `cmohl80fx009j1sdusurp7fbj` = **Arredo**; `cmod6ns420047dlnth544px9c` = **TeVe Compras**. NO inferir orgs por ID, correr query.

## 2. Estado actual (main @ `9ad4616d`, TODO EN PROD)

**Rediseño "enterprise sobrio" (Linear/Vercel/Claude) — MERGEADO A PROD 2026-08-26.** Toda la app migrada de un look "consumer" (dark/cyan/glow/gradientes/orbes) a warm-neutral con tokens `--ent-*`, Geist, verde de acento solo-status. Verificado en 5 pasadas (cada método encontró una clase distinta de slop que el detector no marca: indigo/cyan chrome, cool-slate, cool-gray). tsc/build/tests 396 pass/detector 0 en cada commit. Detalle: [[nitrosales-enterprise-design-appstack]] + `DESIGN-AUDIT-2026-08-24.local.md` + `MIGRATION-RECIPE.local.md`.

Junto con el diseño salió a prod (vía la misma branch reconciliada con main):
- **Canales** (panel self-service `/pixel/canales` para clasificar orígenes→canales; metodología 2-ejes) — [[nitrosales-canales-feature]], `docs/CANALES-METODOLOGIA.md`.
- **Fixes de rollup del pixel** (mails de frescura resueltos de raíz) — [[nitrosales-pixel-rollup-incident]].
- **RBAC: rol base MEMBER/"Editor" restringido** = igual al rol custom "Standard" de clientes (solo `nitropixel`/`pixel`/`aura`). `src/lib/permissions.ts`.
- **Fix 504 de Canales** (org grande): `channels-breakdown` bajó de 4 scans a 2 + maxDuration 300.
- **Logo → landing por permisos** (`/` en vez de `/dashboard` hardcodeado).
- **Logos de marca coloridos** en "Canales — Truth Score" (analytics): `iconKeyFor` fuzzy nombre-canal→marca.

### ⚠️ Vigilar post-deploy
1. **MEMBER base ahora ve solo NitroPixel + Aura** para TODOS los Editors sin rol custom. Editor interno que necesite más → asignarle rol custom en Settings→Permisos (clientes con "Standard" no cambian).
2. **504 de Canales** no debe volver en la org grande.
3. Logos coloridos: es heurístico y quedó solo en Analytics; `pixel/page.tsx` (Atribución) usa color-por-hash (no gris) — si quieren marca exacta ahí también, aplicar el mismo `iconKeyFor`.

## 3. Arquitectura clave (dónde mirar)

- **Pixel / rollups / Medallion:** el pixel captura eventos → rollups HLL diarios (`pixel_daily_*`) + capa Gold (`gold_attribution_*`). Serve rápido detrás de flags (`PIXEL_USE_GOLD`, `PIXEL_USE_CHANNELS`, `PIXEL_USE_GOLD_CHANNEL`). Crons refrescan por rotación. Ver [[nitrosales-microservices-migration]] (plan monolito modular + Medallion), [[nitrosales-prod-crons-perf]], `docs/MEDALLION_STATUS.md` + `docs/RUNBOOK-GOLD-*.md`.
- **Incidente recurrente de FRESCURA (mails):** RESUELTO de raíz (main `35f358a1`): `channel` era "tabla veneno" (pixel_daily_channel vacía → MAX(day) null → se robaba todos los turnos de la rotación → las 7 tablas monitoreadas nunca refrescaban). Fix = excluir channel de `ROTATION_TABLES` + red externa GitHub Actions (`.github/workflows/keep-pixel-rollups-fresh.yml`, cada 15min, needs secret `NITRO_CRON_KEY`). Vercel SÍ dispara. **Todo el detalle + BUGs latentes en [[nitrosales-pixel-rollup-incident]].**
- **Multi-tenant:** 2da org activa en prod → `AmbiguousOrgError` rompe endpoints sin orgId. Ver [[nitrosales-prod-multitenant-transition]].
- **Identidad de producto VTEX:** productId vs skuId en `products.externalId` (~24% colisiona). Ver [[nitrosales-vtex-product-identity]].
- **RBAC/permisos:** acceso POR SECCIÓN (`/api/me/permissions` → `{role, permissions: Record<Section,AccessLevel>}`). Base roles OWNER/ADMIN/MEMBER (`DEFAULT_PERMISSIONS` en `src/lib/permissions.ts`) + roles CUSTOM per-org (`custom_roles` table, `Settings→Team→Permisos`, `api/settings/custom-roles`). El nav se esconde solo (NavItemGate/NavGroupGate + `hrefToSection`) según `read` por sección. Landing inteligente en `src/app/page.tsx` (`landingPathForAllowedSections`, nitropixel primero). Impersonate: `api/admin/impersonate`.
- **Design system:** tokens `--ent-*` (CSS vars en `src/app/globals.css`) referenciados por Tailwind; primitivas en `src/components/enterprise/ui.tsx`; receta de migración en `MIGRATION-RECIPE.local.md`; detector de slop `node C:/Users/axelf/.agents/skills/impeccable/scripts/detect.mjs --json <file>`.

## 4. Cómo verificar / preview

- **Gates:** `npx tsc --noEmit` (0), `npm run build` (guards+depcruise+next build, EXIT 0), `npm test` (`vitest run`, 396 pass), detector de slop 0. `npm run lint` NO está configurado (ignorar). `@ts-nocheck`: ~290 archivos lo tienen (tsc ciego ahí; el build agarra syntax, no tipos).
- **Preview de Vercel** de una branch: `nitrosales-git-<branch>-tlapidus-rgbs-projects.vercel.app` (needs login; la URL exacta está en Vercel→Deployments). claude-in-chrome tiene el dominio bloqueado → usar browser interno `mcp__Claude_Browser__` o pedir screenshots. Ver [[nitrosales-preview-browser-loop]].
- **DB del preview:** apunta a una branch de Neon; para data fresca, "Reset from parent" (si el parent es production).
- **Sweeps perl** (migración light→warm): `slate-sweep.pl`/`gray-sweep.pl` en el scratchpad de la sesión (mapeos en `MIGRATION-RECIPE.local.md`). OJO: editar archivos con acentos vía la tool Edit metió null bytes una vez → si pasa, `git checkout HEAD -- <file>` y re-aplicar con perl ASCII.

## 5. Pendientes / follow-ups (no urgentes)

- **Perf 30d del pixel** para orgs grandes (`/api/metrics/pixel` range 30d timeout en frío). Pre-existente.
- **`pixel_daily_channel` vacía**: su rollup es un no-op silencioso (escribe 0 filas); NO monitoreada (no manda mails). Investigar por qué / backfill.
- **BUG1 general "tabla veneno"** en el cron de rollups: cooldown/skip por tabla que no avanza (channel era la única conocida, ya excluida).
- **Logos coloridos en Atribución** (`pixel/page.tsx`): aplicar `iconKeyFor` si quieren marca exacta.
- Backlog vivo de Tomy en [[nitrosales-backlog]].
- Otros hilos previos: REST migration ([[paw-rest-migration-state]]), hotfixes jul-15 ([[nitrosales-hotfixes-tomy-jul15]]), Aura ([[nitrosales-aura-fixes-state]]).

## 6. Mapa de documentación (qué hay y dónde)

**Memorias** (`C:\Users\axelf\.claude\projects\C--Users-axelf-OneDrive-Documents-github-paw-2025b-12\memory\`, se cargan solas vía `MEMORY.md` si el chat nuevo corre EN ESTA máquina):
- `nitrosales-enterprise-design-appstack.md` — rediseño (historia completa + estado prod).
- `nitrosales-canales-feature.md` — feature canales.
- `nitrosales-pixel-rollup-incident.md` — incidente frescura + fixes + BUGs latentes.
- `nitrosales-microservices-migration.md` — plan Medallion.
- `nitrosales-prod-crons-perf.md`, `nitrosales-prod-multitenant-transition.md`, `nitrosales-vtex-product-identity.md`, `nitrosales-org-ids.md`, `nitrosales-preview-browser-loop.md`, `nitrosales-backlog.md`, `nitrosales-aura-fixes-state.md`, `nitrosales-hotfixes-tomy-jul15.md`, `paw-rest-migration-state.md`, `windows-cfa-blocks-documents.md`, `claude-tooling-node-bun-gstack.md`, `gstack-tools-reference.md`, `ecc-tools-reference.md`.

**Docs de trabajo en el repo (`*.local.md`, gitignored):** `MIGRATION-RECIPE.local.md` (receta tokens), `DESIGN-AUDIT-2026-08-24.local.md` (auditoría diseño), `design-appstack-enterprise.local.md` (sistema completo), + los de canales (`PLAN-CANALES*`, `REVIEW-CANALES`, `canales-*`, `PARA-TOMY-*`, `DISEÑO-CANALES-OPCION-C`), `AUDITORIA-ESTRUCTURA`, `PENDIENTES`, `RETOMAR`, `SQL-INDICES-VENTANA-SILVER`.

**Docs formales (`docs/`, commiteados):** `CANALES-METODOLOGIA.md`, `MEDALLION_STATUS.md` + `MEDALLION_EXECUTION.md`, `RUNBOOK-*.md` (gold/silver/segments), `PLAN_ARQUITECTURA_MODULAR_MONOLITO.md`, `PLAN-VTEX-PRODUCT-ID.md`, `nitropixel-score-rollout.md`, `SQL-PENDIENTE-*.md`, `FASE-1.5-SPEC.md`.

---
**TL;DR para el chat nuevo:** rediseño enterprise + canales + RBAC restringido + fixes → **TODO EN PROD (main @ 9ad4616d)**. No tocar la DB (SQL lo corre el usuario en Neon) ni CORE PROTECTED; merges necesitan OK. Vigilar: MEMBER base restringido, 504 canales. Deep-dive por tema en las memorias/docs de arriba.
