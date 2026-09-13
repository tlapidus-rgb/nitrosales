// ══════════════════════════════════════════════════════════════════════════
// src/lib/costos/consultas.ts — el SQL del reporte de consumo, como strings
// ══════════════════════════════════════════════════════════════════════════
// Vive acá y no inline en la ruta por un motivo concreto: **inline, nada lo
// ejecuta hasta que llega a producción**. Extraído, el test lo corre contra un
// Postgres real (PGlite) y mira los números, que es como el repo verifica el
// resto del SQL (ver `silver-orders-sql.test.ts`).
//
// Y se exporta UNA sola copia: si el test tuviera la suya, driftearían — que es
// el `#VARIABLE-CON-DOS-DUENOS` de siempre, sólo que en SQL.
//
// Todas toman `$1` = fecha desde (salvo las que no dependen del período).
// ══════════════════════════════════════════════════════════════════════════

import { ordersValidSql } from "@/domains/orders";

/** Órdenes válidas del período, por organización. */
export const ORDENES_POR_ORG = `
  SELECT o."organizationId" AS "organizationId", COUNT(*)::int AS n
  FROM orders o
  WHERE o."orderDate" >= $1::timestamptz AND ${ordersValidSql("o")}
  GROUP BY o."organizationId"
`;

/** SKUs activos en catálogo. No depende del período: es una foto de hoy. */
export const SKUS_POR_ORG = `
  SELECT p."organizationId" AS "organizationId", COUNT(*)::int AS n
  FROM products p
  WHERE p."isActive" = true
  GROUP BY p."organizationId"
`;

/** Integraciones conectadas y andando. Tampoco depende del período. */
export const INTEGRACIONES_POR_ORG = `
  SELECT c."organizationId" AS "organizationId", COUNT(*)::int AS n
  FROM connections c
  WHERE c.status = 'ACTIVE'
  GROUP BY c."organizationId"
`;

/**
 * Eventos de pixel del período, del **rollup diario**.
 *
 * Contar `pixel_events` crudo sobre 30 días son millones de filas para una org
 * tamaño Arredo, y este reporte corre sobre TODAS a la vez: sería la query que
 * lo tumba. El rollup ya tiene `total_events` por (organización, día).
 *
 * Costo: es diario, así que lo de hoy puede faltar hasta que corra el cron.
 * Para facturar por mes es irrelevante; para mirar "hoy" no sirve.
 *
 * `float8` y no `int`: `::int` es de 32 bits y revienta pasando los ~2.100
 * millones, que con `?dias=365` es alcanzable.
 */
export const EVENTOS_PIXEL_POR_ORG = `
  SELECT r."organizationId" AS "organizationId", COALESCE(SUM(r.total_events), 0)::float8 AS n
  FROM pixel_daily_aggregates r
  WHERE r.day >= $1::date
  GROUP BY r."organizationId"
`;

/** Usuarios de la organización. Foto de hoy. */
export const USUARIOS_POR_ORG = `
  SELECT u."organizationId" AS "organizationId", COUNT(*)::int AS n
  FROM users u
  GROUP BY u."organizationId"
`;

/**
 * Consumo de Aurum agregado por (organización, modo, modelo).
 *
 * Agregado y no fila por fila: `/api/admin/usage` trae las filas crudas con
 * `take: 10000`, que es un truncado silencioso esperando su turno. Agregando,
 * el problema no se reporta mejor — deja de existir.
 *
 * `$2` es el techo de grupos, por si alguien loguea variantes de `model` que no
 * esperamos. Si se toca, la respuesta lo dice.
 */
export const AURUM_AGRUPADO = `
  SELECT
    a."organizationId"            AS "organizationId",
    a.mode                        AS mode,
    a.model                       AS model,
    SUM(a."inputTokens")::float8  AS "inputTokens",
    SUM(a."outputTokens")::float8 AS "outputTokens",
    COUNT(*)::int                 AS llamadas
  FROM aurum_usage_logs a
  WHERE a."createdAt" >= $1::timestamptz
  GROUP BY a."organizationId", a.mode, a.model
  LIMIT $2
`;

// ══════════════════════════════════════════════════════════════════════════
// E-23 — las dos consultas de la cuota de Aurum
// ══════════════════════════════════════════════════════════════════════════
// Van acá y no inline en `/api/chat` por lo mismo que las de arriba: inline,
// nada las ejecuta hasta producción. Y estas corren en el camino caliente del
// chat, así que un error de SQL no se descubre en un reporte — se descubre con
// el asistente caído.
// ══════════════════════════════════════════════════════════════════════════

/**
 * Consumo de Aurum de UNA organización desde `$2`, agrupado por modo y modelo.
 *
 * Agrupado porque el precio depende del modelo: para pasar a dólares hay que
 * saber qué modelo gastó qué. Son pocas filas (3 modos × los modelos que haya).
 *
 * `$1` = organizationId · `$2` = desde cuándo (arranque del mes).
 */
export const AURUM_DEL_MES_DE_UNA_ORG = `
  SELECT
    a."organizationId"            AS "organizationId",
    a.mode                        AS mode,
    a.model                       AS model,
    SUM(a."inputTokens")::float8  AS "inputTokens",
    SUM(a."outputTokens")::float8 AS "outputTokens",
    COUNT(*)::int                 AS llamadas
  FROM aurum_usage_logs a
  WHERE a."organizationId" = $1 AND a."createdAt" >= $2::timestamptz
  GROUP BY a."organizationId", a.mode, a.model
`;

/**
 * Cuántas consultas hizo una organización en el último minuto.
 *
 * Es el freno del loop, no el control de gasto: un cliente escribiendo a mano
 * no llega a 20 por minuto; un `useEffect` mal puesto llega en dos segundos.
 *
 * `$1` = organizationId · `$2` = desde cuándo (hace un minuto).
 */
export const AURUM_ULTIMO_MINUTO_DE_UNA_ORG = `
  SELECT COUNT(*)::int AS n
  FROM aurum_usage_logs a
  WHERE a."organizationId" = $1 AND a."createdAt" >= $2::timestamptz
`;
