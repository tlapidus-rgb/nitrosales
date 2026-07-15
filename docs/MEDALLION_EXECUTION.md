# Ejecución del plan Medallion — reconciliación + orden por dolor

> **Estado (2026-07-15):** el equipo adoptó `PLAN_ARQUITECTURA_MODULAR_MONOLITO.md` como **plan maestro**.
> Este doc lo aterriza: qué taxonomía usamos, cómo encaja lo ya construido, el orden de ejecución
> por dolor (no por número de fase), y qué está gateado por acceso a la DB de prod.

## Decisiones que quedan fijas
1. **Plan maestro = `PLAN_ARQUITECTURA_MODULAR_MONOLITO.md`** (Modular Monolith + Medallion Bronze/Silver/Gold). Reemplaza el objetivo "15 servicios" y el "ETL = 3 servicios" (ambos descartados en el doc, §3).
2. **Taxonomía = la del doc:** `src/modules/{extract,transform,serve,product,shared}` + `src/data/{bronze,silver,gold,bdd}`. **Supersede el `src/domains/` intermedio** que se empezó en la Fase 1.5. Lo ya movido a `domains/` (orders, audiences) se reubica en la Fase 3 (modularización), no se tira.
3. **CORE atribución + webhooks de órdenes protegidos** (`CORE-ATTRIBUTION.md`): no se tocan sin OK del fundador. Consistente con el marcador en `webhooks/vtex/orders/route.ts`.

## Inventario Fase 0 (medido 2026-07-15, sobre el código real)
- **Serve leyendo `pixel_events` CRUDO (el gap a cerrar con Gold):** `metrics/conversion`, `metrics/pixel/funnel`, `metrics/pixel`, `metrics/pixel/sales-by-ad`, `metrics/products` (5 rutas; funnel/pixel/products son híbridas Gold-first + fallback crudo). `pixel/event` NO cuenta: es Extract escribiendo Bronze.
- **`LATERAL` (anti-patrón asesino, §13):** en Serve → `metrics/orders` y `metrics/pixel`. Targets directos de Silver (pre-computar device/channel elimina el LATERAL).
- **Ya Gold-first:** funnel/pixel/products (híbridos) + los crons que arman los rollups (`refresh-pixel-rollups`, `warm-cache`, `refresh-pixel-first-source`). **Adopción de Gold ya parcial — no se parte de cero.**

## Cómo encaja lo ya construido (nada se tira)
| Ya hecho | Dónde entra en el plan maestro |
|---|---|
| Contrato "orden válida" en `domains/orders` + `check-order-contract.mjs` | La regla de Silver "orden válida una sola vez" (§6.2). El guard la hace cumplir |
| boundary lint: dependency-cruiser, 0 ciclos, `no-circular`=error | Fase 3 "enforce import boundaries" (§12). Mecanismo ya probado; se re-apunta a los límites `modules/` |
| **`check-serve-gold-first.mjs`** (nuevo, este commit) | Fase 1 "Serve: bloquear scans crudos en dashboard (lint/rule)" (§12) |
| Cola de ingesta QStash (`lib/ingest/queue.ts`, I1a/b en pixel+ml) | Fase 4 "worker opcional + cola durable" (§12) |
| fix RETURNED, audiences → domains | Regla de orden válida / módulo Product |

## Orden de ejecución por DOLOR (no por número de fase)
Lo que mata los timeouts + inconsistencia es la **capa de datos (Gold/Silver)**, no el reorg de módulos. Y todo lo que sea tabla nueva (Silver/Gold) es **migración de DB que corre el equipo en Neon** (Vercel no migra DB — §13, Error #13).

**A) Puedo hacer YO ahora (código, en branch, sin DB, reversible):**
- ✅ Fase 0 inventario (hecho, arriba).
- ✅ Fase 1 guard "Serve = Gold-first" (hecho, este commit; cableado al build).
- BDD: escribir las features Gherkin del contrato de orden válida + funnel en `docs/bdd/features/` + 2-3 tests de paridad (arranque liviano, no Cucumber completo).
- Fase 4: cola de ingesta — I1a/b hechos (pixel+ml); **VTEX pendiente de OK del fundador**.

**B) Gateado por la DB de prod (lo corre el equipo en Neon; yo dejo el SQL/migración preparada):**
- Fase 1: backfill masivo `BP-PIXEL-CHANNEL-ROLLUP` (funnel×canal).
- Fase 2: tablas Silver (`silver_orders` con flags `valid/web/marketplace` pre-computados) + jobs incrementales Bronze→Silver.
- Migrar helpers de `orders.ts` a leer Silver; eliminar los `LATERAL`.

**C) Reorg grande (Fase 3, después de la capa de datos):**
- `src/modules/{extract,transform,serve,product,shared}` + rutas = thin handlers. Acá se folden `domains/orders` y `domains/audiences`.

## Guards que ya hacen cumplir el plan (en el build de Vercel, branch preview)
- `check-order-contract.mjs` — "orden válida" definida en un solo lugar.
- `check-serve-gold-first.mjs` — Serve no escanea `pixel_events` crudo (allowlist de 5, ratchet down al migrar cada una a Gold).
- `depcruise` (`no-circular`=error) — 0 ciclos.

## Próximo
Con la capa de datos gateada por la DB, lo de mayor valor que puedo avanzar solo es **BDD del contrato** (hace testeable el "12 vs 16") y dejar **preparada la migración de `silver_orders`** para que el equipo la corra. El reorg `modules/` (Fase 3) va después de Silver/Gold.
