// ══════════════════════════════════════════════════════════════════════════
// Diccionario nombre de ficha → productId (dim pixel_product_name)
// ══════════════════════════════════════════════════════════════════════════
// El 46% de los eventos VIEW_PRODUCT no traen `productId` pero sí `productName`.
// El diccionario lo construye el propio pixel: el 54% restante trae los dos.
//
// REGLA DE ORO: solo nombres UNÍVOCOS. Si un nombre aparece con dos productIds
// distintos se descarta — atribuir por un nombre ambiguo nos devolvería al bug
// de asignar visitas al producto equivocado, que es justo lo que arreglamos.
//
// Medido en Arredo (30 días): 819 de 850 nombres unívocos (96,4%), que
// recuperan 513.066 de 770.538 eventos huérfanos (66,6%).
// ══════════════════════════════════════════════════════════════════════════

/** Ventana de historia que se mira para armar el diccionario. */
export const NAME_DICT_LOOKBACK_DAYS = 180;

/**
 * SQL que reconstruye `pixel_product_name` para UNA org.
 * Params: $1 = organizationId.
 *
 * Idempotente. Los nombres que se volvieron ambiguos se limpian antes de
 * insertar, para que un nombre reutilizado en otro producto deje de resolver
 * en vez de seguir resolviendo al viejo.
 */
export function buildProductNameDictUpsert(): string {
  return `
WITH candidatos AS (
  SELECT
    props->>'productName' AS product_name,
    COUNT(DISTINCT props->>'productId') AS ids_distintos,
    MIN(props->>'productId') AS product_id
  FROM pixel_events
  WHERE "organizationId" = $1
    AND type = 'VIEW_PRODUCT'
    AND props->>'productId' IS NOT NULL
    AND props->>'productName' IS NOT NULL
    AND timestamp >= now() - interval '${NAME_DICT_LOOKBACK_DAYS} days'
  GROUP BY 1
),
univocos AS (
  SELECT product_name, product_id FROM candidatos WHERE ids_distintos = 1
),
-- Un nombre que pasó a ser ambiguo deja de resolver: se borra de la dim.
borrados AS (
  DELETE FROM pixel_product_name d
  WHERE d."organizationId" = $1
    AND EXISTS (
      SELECT 1 FROM candidatos c
      WHERE c.product_name = d.product_name AND c.ids_distintos > 1
    )
  RETURNING 1
)
INSERT INTO pixel_product_name ("organizationId", product_name, product_id, refreshed_at)
SELECT $1, product_name, product_id, now() FROM univocos
ON CONFLICT ("organizationId", product_name) DO UPDATE SET
  product_id = EXCLUDED.product_id,
  refreshed_at = now();`.trim();
}
