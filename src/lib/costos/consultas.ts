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
