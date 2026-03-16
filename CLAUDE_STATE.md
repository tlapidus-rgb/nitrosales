# CLAUDE_STATE.md — Estado del Proyecto NitroSales
> **INSTRUCCIÓN OBLIGATORIA**: Claude DEBE leer este archivo al inicio de CADA sesión antes de hacer CUALQUIER cambio.
> Si este archivo no se lee primero, se corre riesgo de perder trabajo ya hecho.

## Última actualización: 2026-03-16

---

## REGLAS CRÍTICAS

1. **NO retroceder versiones** — Cada archivo tiene una versión actual que NO debe revertirse.
2. **NO tocar archivos que no estén explícitamente mencionados** en la tarea actual.
3. **Cambios QUIRÚRGICOS solamente** — No reescribir archivos enteros si solo se necesita un cambio puntual.
4. **LEER este archivo ANTES de cualquier modificación**.
5. **ACTUALIZAR este archivo** después de cada cambio exitoso.

---

## ARCHIVOS CRÍTICOS — VERSIONES ACTUALES

### FRONTEND (Visual)

| Archivo | Versión | Estado | Notas |
|---------|---------|--------|-------|
| `src/app/(app)/products/page.tsx` | **v10** | ✅ ESTABLE | NO TOCAR. KPIs, tabla, gráficos, filtros, Tendencias + Stock Inteligente. Fixes: optional chaining toLocaleString + useMemo early return guard (Fix 1L). |
| `src/app/(app)/dashboard/page.tsx` | — | Sin cambios | No modificado por Claude |
| `src/app/(app)/orders/page.tsx` | — | Sin cambios | No modificado por Claude |

### BACKEND (APIs)

| Archivo | Versión | Estado | Notas |
|---------|---------|--------|-------|
| `src/app/api/metrics/products/route.ts` | **v1** | ✅ ESTABLE | NO TOCAR. Alimenta la página de productos. |
| `src/app/api/fix-brands/route.ts` | **v5** | ✅ OPERATIVO | Mejoras incrementales OK. BrandId→BrandName 2-step, CategoryId→CategoryName, acciones: stats/test/test-category/fix-vtex/fix-categories/deduplicate/debug. |
| `src/app/api/backfill/vtex/route.ts` | **v1** | ✅ ESTABLE | NO TOCAR. Backfill original con credenciales hardcodeadas. |

### INFRAESTRUCTURA

| Archivo | Versión | Estado | Notas |
|---------|---------|--------|-------|
| `src/lib/db/client.ts` | **v1** | ✅ ESTABLE | NO TOCAR. Prisma client singleton. Import: `@/lib/db/client` |
| `prisma/schema.prisma` | **v1** | ✅ ESTABLE | NO TOCAR sin migración. brand y category son String? (no FK). |
| `middleware.ts` | — | Sin cambios | No modificado por Claude |

---

## FUNCIONALIDADES COMPLETADAS (NO TOCAR)

### Tendencias + Stock Inteligente ✅ COMPLETADO
- **Estado**: YA IMPLEMENTADO Y FUNCIONANDO — incluido en products/page.tsx v10
- **⚠️ NO volver a mencionarlo como pendiente NUNCA**

### Página de Productos ✅ COMPLETADA
- KPIs de revenue, órdenes, items
- Tabla de productos con filtros
- Gráficos de distribución
- Tendencias + Stock Inteligente
- Bug TypeError toLocaleString: RESUELTO
- Bug 86% sin marca: EN PROCESO (batch corriendo)

---

## PROCESOS EN CURSO

### Batch de Marcas + Categorías (2026-03-16)
- **Endpoint**: fix-brands?action=fix-vtex
- **Progreso**: ~26% completado (~8,100 de 31,214 productos con marca+categoría)
- **Script**: Corre autónomamente en el browser via window._fixProgress
- **Categorías ya resueltas**: nombres legibles (ej: "Pistas", "Inflables y Piletas", "Robots y Transformables")
- **Pendiente post-batch**: Correr fix-categories para los ~1,286 que se procesaron antes del fix de categorías (tienen marca pero categoría numérica)

---

## STACK TÉCNICO

- **Framework**: Next.js 14 App Router
- **ORM**: Prisma (import desde `@/lib/db/client`)
- **DB**: PostgreSQL en Railway
- **Deploy**: Vercel Hobby (10s function timeout, ISR revalidate=300)
- **VTEX Account**: mundojuguete
- **Org ID**: cmmmga1uq0000sb43w0krvvys
- **Credenciales VTEX**: env var DJQFRI + fallback backfill ZMTYUJ

---

## HISTORIAL DE CAMBIOS

### 2026-03-16
- CLAUDE_STATE.md: Creado sistema de versiones (v1, actualizado a v2 con separación visual/API)
- fix-brands v5: Agregada resolución CategoryId → CategoryName via VTEX Category API
- fix-brands v5: Agregada acción fix-categories para productos con categoría numérica
- fix-brands v5: Stats ahora incluyen cobertura de categorías (withCategory/withoutCategory)
- Batch processing de marcas+categorías iniciado (~23K productos pendientes)

### 2026-03-15
- products/page.tsx v10: Fix TypeError toLocaleString con optional chaining
- products/page.tsx v10: Fix 1L useMemo early return guard
- fix-brands v3: Creado endpoint con lookup VTEX 2-step (BrandId→BrandName)
- fix-brands v4: Agregadas credenciales VTEX de backfill como fallback
- Env var VTEX_APP_KEY agregada en Vercel

## Changelog

### v10.1 — Visual Fixes (2026-03-16)
- Fixed 85+ double-encoded UTF-8 mojibake characters (Facturacion->Facturacion, etc)
- Fixed Bolsas de Compra section appearing in Tendencias and Stock Inteligente tabs (moved inside activeTab === "overview" condition)
- Fixed 6 double-encoded FFFD replacement characters in Bolsas section (Adopcion, ordenes, dias, Ultimos)
- Commits: 4bbf299, 877615a, 05eb35e
