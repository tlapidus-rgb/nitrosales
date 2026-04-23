# NEXT_SESSION_PROMPT.md — Retomar auditoría VTEX (S56 cerrada)

> **Actualizado S56 (2026-04-23 noche)**: Tomy se va a dormir. S56 cerró con todos los KPIs MELI matcheando 1:1 con UI de MELI. Mañana arrancamos **auditoría sección por sección de VTEX**.

---

## ✅ QUE SE RESOLVIÓ EN S56 (no toques, confirmado funcionando)

**Fix crítico: /orders MELI ahora muestra exacto lo mismo que MELI UI.**

Problemas encontrados y resueltos:
1. **Status mapping bug**: `paid → "PAID"` pero enum Prisma no tenía PAID → 0 ventas paid visibles. Fix: `paid → APPROVED`, cancelled/invalid siempre gana sobre tag delivered histórico, `partially_refunded → APPROVED`.
2. **Dedup packs (pack_id)**: 1 carrito MELI con N items = N rows en nuestra DB pero 1 venta en MELI UI. Fix: columna `Order.packId` + `COUNT(DISTINCT COALESCE(packId, externalId))` en 25 queries de `/api/metrics/orders` + `/api/mercadolibre/dashboard`.
3. **Anti-join mixtos + mapping status terminales**: packs que MELI cancela después pero tenían tag="delivered" histórico. Fix: cancelled SIEMPRE gana + partially_refunded mapeado + endpoint `/api/admin/ml-force-refresh` para actualizar data existente sin guard.
4. **MELI bootstrap post-backfill**: listings + reputation + questions se sincronizan automáticamente tras `approve-backfill` (commit `13be0bc`). Multi-tenant safe.
5. **Listings pagination fix**: bug que cortaba a 100 items de >1000 (commit `f25283f`). Scroll_id ahora funciona correctamente.

**Validación final (ya confirmada por Tomy)**:
- `/orders` filtro 12m MELI: **1196 ventas** = MELI UI "concretadas + en camino" ✓
- Canceladas: **182** ✓
- Total packs: **1378** ✓
- `1196 + 182 = 1378` ✓

**Errores S56 documentados** en `ERRORES_CLAUDE_NO_REPETIR.md`:
- `#S56-TAG-OVERRIDES-STATUS`
- `#S56-UNMAPPED-STATUS-SILENT-FALLBACK`
- `#S56-ITERATE-WITHOUT-VLOOKUP` ← error de proceso más costoso del día

---

## 🎯 TAREA MAÑANA: Auditoría VTEX sección por sección

Tomy quiere validar que el backfill de VTEX traiga TODA la data posible y que se despliegue correctamente en toda la plataforma.

### Plan propuesto

**Primero: re-ejecutar backfill VTEX** (Tomy lo pidió explícitamente).

**Después: BUSCARV por sección** (mismo patrón que usamos con MELI — NO iterar sin medir primero).

### Orden de secciones a auditar

1. **Pedidos/orders** — ya fixeado en S55, solo validar match con VTEX OMS panel (cantidad + revenue).
2. **Productos / catálogo** — ¿está poblada la tabla `Product`? ¿cuántos SKUs tiene VTEX vs nosotros? ¿falta algún producto que nunca se vendió?
3. **Stock** — ¿viene el stock por SKU? ¿se actualiza? (no parece estar en el vtex-processor actual).
4. **Costos (costPrice)** — ¿cuántos productos tienen costo null? ¿VTEX devuelve cost por order item?
5. **Imágenes** — ¿cuántos productos tienen `imageUrl = null`? ¿podemos traer de catálogo VTEX?
6. **Brand / Category** — ¿poblado?
7. **Clientes** — ¿cuántos tienen email? ¿dirección completa?
8. **Promociones / cupones** — ¿se captan todos los `marketingData.coupon` y `ratesAndBenefitsData`?

### Endpoints que hay que crear (uno por sección, patrón similar a ml-diff-detail)

- `/api/admin/vtex-audit-products` — compara catálogo VTEX vs DB (SKUs faltantes, campos nulos).
- `/api/admin/vtex-audit-stock` — pide stock de VTEX API y compara con DB (si hay).
- `/api/admin/vtex-audit-customers` — compara email/dirección completa por cliente.

### Ritual de arranque mañana

1. Leer CLAUDE.md + ERRORES_CLAUDE_NO_REPETIR.md + MEMORY.md + este archivo.
2. `git status` y `git pull` para asegurar main limpio.
3. Confirmar con Tomy: "¿arrancamos con re-backfill VTEX + sección 1 (productos/catálogo)?"
4. **NO iterar fixes sin hacer primero el BUSCARV contra VTEX API** (aplicar regla #S56-ITERATE-WITHOUT-VLOOKUP).

### Consideraciones técnicas previas

- VTEX tiene 5 APIs relevantes: Orders (OMS), Catalog, Logistics/Inventory, Brand, Category.
- Cada una tiene sus límites y quirks. Antes de escribir código de sync para una nueva API, leer docs y detectar limites de paginación (regla #S55-VTEX-PAGE-LIMIT).
- Reset test env está disponible si Tomy quiere arrancar limpio: `/api/admin/reset-test-env` con `{email}`.

---

## 📋 Estado del repo al cierre de S56

- **Branch**: `main` (clean, todo pusheado).
- **Último commit**: `3a4f251` — docs errores S56.
- **DB prod**: columna `Order.packId` creada + índice. `email_log` operativo. Data de test de Tomy (MELI) matcheada 1:1 con MELI UI.
- **Endpoints nuevos S56**:
  - `/api/admin/migrate-orders-pack-id` (ya ejecutado)
  - `/api/admin/validate-orders-count` (validador 1196 vs MELI)
  - `/api/admin/ml-audit-packs` (BUSCARV MELI vs DB)
  - `/api/admin/ml-diff-detail` (detalle por status)
  - `/api/admin/ml-force-refresh` (re-sync forzado)
  - `/api/sync/mercadolibre/bootstrap` (listings + reputation + questions)

- **Pending de Tomy**: ninguno. Todo validado y funcionando.

---

_Última actualización: 2026-04-23 23:30 ART (S56 cierre)._
