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

## FUNCIONALIDADES COMPLETADAS (NO TOCAR)

### 1. Página de Productos — v10 ✅ ESTABLE
- **Archivo**: `src/app/(app)/products/page.tsx`
- **Estado**: PRODUCCIÓN — NO MODIFICAR sin razón explícita
- **Incluye**: KPIs, tabla de productos, gráficos, filtros, Tendencias + Stock Inteligente
- **Fixes aplicados**:
  - Optional chaining para toLocaleString (previene TypeError)
  - useMemo con early return guard (Fix 1L)
  - Todos los KPIs, charts y tabla funcionando correctamente

### 2. API Metrics Products ✅ ESTABLE
- **Archivo**: `src/app/api/metrics/products/route.ts`
- **Estado**: PRODUCCIÓN — NO MODIFICAR

### 3. API Fix Brands ✅ OPERATIVO
- **Archivo**: `src/app/api/fix-brands/route.ts`
- **Estado**: OPERATIVO — puede recibir mejoras incrementales
- **Funcionalidades**:
  - Resolución de BrandId → BrandName via VTEX Brand API (2-step lookup)
  - Resolución de CategoryId → CategoryName via VTEX Category API
  - Acciones: stats, test, test-category, fix-vtex, fix-categories, deduplicate, debug
  - Credenciales VTEX con fallback a backfill credentials
- **Último commit**: 1c4d6e8 (2026-03-16)

### 4. API Backfill VTEX ✅ ESTABLE
- **Archivo**: `src/app/api/backfill/vtex/route.ts`
- **Estado**: PRODUCCIÓN — NO MODIFICAR

### 5. Tendencias + Stock Inteligente ✅ COMPLETADO
- **Estado**: YA IMPLEMENTADO Y FUNCIONANDO
- **NO volver a mencionarlo como pendiente**

---

## PROCESOS EN CURSO

### Batch de Marcas + Categorías (2026-03-16)
- **Endpoint**: fix-brands?action=fix-vtex
- **Progreso**: ~25% completado (7,797 de 31,214 productos con marca)
- **Script**: Corre autónomamente en el browser via window._fixProgress
- **Después del batch**: Correr fix-categories para los ~1,286 que se procesaron solo con marca

---

## STACK TÉCNICO

- **Framework**: Next.js 14 App Router
- **ORM**: Prisma (import desde `@/lib/db/client`)
- **DB**: PostgreSQL en Railway
- **Deploy**: Vercel Hobby (10s function timeout, ISR revalidate=300)
- **VTEX Account**: mundojuguete
- **Org ID**: cmmmga1uq0000sb43w0krvvys

---

## ARCHIVOS CRÍTICOS — VERSIONES ACTUALES

| Archivo | Estado | Última modificación | Notas |
|---------|--------|-------------------|-------|
| `src/app/(app)/products/page.tsx` | v10 ESTABLE | 2026-03-15 | NO TOCAR |
| `src/app/api/metrics/products/route.ts` | ESTABLE | 2026-03-15 | NO TOCAR |
| `src/app/api/fix-brands/route.ts` | OPERATIVO | 2026-03-16 | Mejoras incrementales OK |
| `src/app/api/backfill/vtex/route.ts` | ESTABLE | Original | NO TOCAR |
| `src/lib/db/client.ts` | ESTABLE | Original | NO TOCAR |
| `prisma/schema.prisma` | ESTABLE | Original | NO TOCAR sin migración |

---

## HISTORIAL DE CAMBIOS

### 2026-03-16
- fix-brands: Agregada resolución CategoryId → CategoryName via VTEX Category API
- fix-brands: Agregada acción fix-categories para productos con categoría numérica
- fix-brands: Stats ahora incluyen cobertura de categorías (withCategory/withoutCategory)
- Batch processing de marcas+categorías iniciado (~23K productos pendientes)

### 2026-03-15
- products/page.tsx: Fix TypeError toLocaleString con optional chaining
- products/page.tsx: Fix 1L useMemo early return guard
- fix-brands: Creado endpoint con lookup VTEX 2-step (BrandId→BrandName)
- fix-brands: Agregadas credenciales VTEX de backfill como fallback
- Env var VTEX_APP_KEY agregada en Vercel
