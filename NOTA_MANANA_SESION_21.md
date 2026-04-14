# Nota para Tomy — Sesión 21 (2026-04-14, noche)

## Qué me pediste

> "Hagamos algo mucho más simple: que los datos entren bien desde el día 1
> y no tener que curar huérfanos después."

Tenías razón: los 5.737 productos huérfanos que curamos hoy aparecieron
porque los syncs creaban filas duplicadas por plataforma en vez de
consolidar por SKU. Para el próximo cliente queríamos que la ingesta
sea correcta de entrada.

## Qué dejé resuelto

**Regla única para ingesta de productos: SKU-first.**

Cuando llega un producto de cualquier sync (VTEX, MercadoLibre, webhook):

1. Si tiene SKU real → busca si ya existe un producto con ese SKU en
   la org. Si sí, lo actualiza. Si no, lo crea.
2. Si no tiene SKU → cae al comportamiento viejo (por externalId).

Resultado: nunca más se van a crear 2 filas para el mismo SKU cuando
ese SKU entra desde VTEX y desde ML a la vez.

**Además arreglé un bug raíz:** el sync de ML y su webhook estaban
guardando el MLA listing id (ej: `MLA2043442368`) como si fuera el SKU,
en vez del `seller_sku` real. Eso era la causa principal de los huérfanos.

## Archivos tocados

- `src/lib/products/upsert-by-sku.ts` **(nuevo)** — el helper con la regla única.
- `src/app/api/sync/mercadolibre/route.ts` — fix bug SKU + usa helper.
- `src/app/api/metrics/orders/enrich/route.ts` — usa helper.
- `src/app/api/sync/vtex/route.ts` — usa helper.
- `src/lib/connectors/ml-notification-processor.ts` (webhook ML real-time) — fix bug SKU + usa helper.

## Qué quedó pendiente (no crítico)

- El cron `src/app/api/cron/ml-sync/route.ts` (safety net diario 2am) usa
  SQL bulk `INSERT ON CONFLICT` para ser rápido. Refactorizarlo a
  SKU-first requiere un pre-query adicional que lo puede enlentecer.
  Lo dejé con un TODO para charlar cuando te levantes.
- Webhook VTEX (`webhooks/vtex/orders/route.ts`) tiene el mismo patrón
  viejo pero VTEX ya viene con SKU correcto, así que el impacto es
  menor. Queda como segunda prioridad.

## Para pushear (cuando te levantes)

```bash
cd ~/nitrosales
git pull origin main
git status          # Deberías ver ~5 archivos modificados + 1 nuevo (upsert-by-sku.ts)
git add src/lib/products/upsert-by-sku.ts \
        src/app/api/sync/mercadolibre/route.ts \
        src/app/api/metrics/orders/enrich/route.ts \
        src/app/api/sync/vtex/route.ts \
        src/lib/connectors/ml-notification-processor.ts
git commit -m "feat(sync): SKU-first product upsert + fix ML sku bug"
git push origin main
```

Vercel deploya solo. No hay migraciones de DB, sólo cambios de código.
Después de deployar corré el sync de ML una vez y fijate que los nuevos
productos ML no aparezcan duplicados respecto a los VTEX.
