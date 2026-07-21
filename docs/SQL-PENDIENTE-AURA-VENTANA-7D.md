# SQL pendiente — default de ventana de atribución de Aura 14 → 7

> Acompaña a la branch `feat/aura-ventana-editable-default-7`.
> Orden recomendado: **merge → deploy → SQL**. Vercel NO migra la DB: esto va a
> mano en la consola de Neon, como siempre.
>
> **Lo importante no es el orden, es que hacen falta LOS DOS.** `createCreatorSimple`
> no pasa `attributionWindowDays` al crear el creador, así que Prisma omite la
> columna en el INSERT y **el valor lo pone Postgres con su DEFAULT**. El
> `@default(7)` del schema es declarativo (este proyecto no corre `prisma migrate`
> contra prod): quien decide con qué ventana nace un creador nuevo es el `ALTER`
> de acá abajo. Si mergeás y no corrés esto, los creadores nuevos siguen en 14 y
> el pedido queda a medias sin que se note.
>
> Correrlo antes del merge no rompe nada — el motor lee la ventana de la DB y
> atribuye bien con 7. Quedan dos detalles cosméticos hasta que deploye: el botón
> de "resetear al default" del desplegable de afiliados escribe 14 (código viejo)
> y la etiqueta muestra "Custom · 7d" en vez de "Default · 7d".

## Contexto

`Influencer.attributionWindowDays` es `NOT NULL DEFAULT 14`. La branch cambia el
default del motor a **7** (`AURA_DEFAULT_ATTRIBUTION_WINDOW_DAYS` en
`src/lib/aura/validation.ts`, que ahora es la única fuente de verdad) y el
`@default(7)` de Prisma. Prisma solo declara el default: **la columna en Neon
sigue en 14 hasta que corras el `ALTER` de abajo.**

⚠️ Ojo con lo que este cambio NO hace: la ventana se evalúa **al momento de
atribuir** (`src/lib/pixel/influencer-attribution.ts`) y el motor solo hace
`create`, nunca `delete`. O sea, **las atribuciones y comisiones ya existentes no
se tocan**. El cambio afecta a las órdenes que entren de acá en adelante: se
pierde la cola de los días 7 al 14. La única forma de recalcular hacia atrás
sería correr `admin/replay-attribution` a mano — no lo corras salvo que Tomy lo
pida explícitamente.

## 1. Ver qué hay hoy (antes de tocar nada)

```sql
SELECT "attributionWindowDays" AS ventana, COUNT(*) AS creadores
FROM influencers
GROUP BY 1
ORDER BY 1;
```

Sirve para saber cuántos creadores tienen ventana propia (≠ 14) y no pisarlos.

## 2. Cambiar el default de la columna

Solo afecta a las filas NUEVAS. Metadata-only en Postgres, no reescribe la tabla.

```sql
ALTER TABLE influencers
  ALTER COLUMN "attributionWindowDays" SET DEFAULT 7;
```

## 3. Migrar los creadores que están en el default viejo

Decisión de Axel (2026-07-20): pasar a 7 a los que hoy están en 14.
**El `WHERE ... = 14` es a propósito**: respeta a quien tenga una ventana puesta
a mano (30, 60, …). No lo saques.

```sql
UPDATE influencers
SET "attributionWindowDays" = 7
WHERE "attributionWindowDays" = 14;
```

## 4. Verificar

```sql
-- Debería mostrar la mayoría en 7 y, si había, las custom intactas.
SELECT "attributionWindowDays" AS ventana, COUNT(*) AS creadores
FROM influencers
GROUP BY 1
ORDER BY 1;

-- Y que el default quedó en 7:
SELECT column_default
FROM information_schema.columns
WHERE table_name = 'influencers'
  AND column_name = 'attributionWindowDays';
```

## Rollback

```sql
ALTER TABLE influencers
  ALTER COLUMN "attributionWindowDays" SET DEFAULT 14;

UPDATE influencers
SET "attributionWindowDays" = 14
WHERE "attributionWindowDays" = 7;
```

⚠️ El rollback del paso 3 es **impreciso**: si algún creador ya estaba en 7 a
propósito antes de la migración, vuelve a 14 con los demás. Por eso conviene
guardar el resultado de la query del paso 1 antes de correr nada.
