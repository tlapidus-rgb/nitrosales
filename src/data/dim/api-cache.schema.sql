-- ══════════════════════════════════════════════════════════════════════════
-- api_cache — caché de respuestas COMPARTIDO entre instancias
-- ══════════════════════════════════════════════════════════════════════════
-- POR QUÉ EXISTE (2026-07-18):
--   `src/lib/api-cache.ts` guarda en memoria del proceso, o sea POR INSTANCIA de
--   lambda. Cuando refrescás la página caés en la misma instancia caliente y
--   carga al instante; la primera visita del día, o cualquier request que Vercel
--   rutee a una instancia nueva, paga los ~25s completos.
--
--   El cron `warm-cache` intenta compensarlo con un self-fetch, pero calienta la
--   instancia que atienda ESE request, no la que te toque a vos. Es lotería. El
--   propio archivo lo dice: "Solución multi-instancia completa = cache compartido".
--
-- CÓMO SE USA: la memoria sigue siendo el primer nivel (lookup gratis); esta
-- tabla es el segundo. Un hit acá se copia a memoria, así que la instancia
-- responde gratis las siguientes veces.
--
-- El payload es JSONB. Las respuestas pesadas rondan cientos de KB, muy dentro
-- de lo que Postgres maneja sin problema.
--
-- ⚠️ CORRER MANUALMENTE EN NEON. Idempotente.
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS api_cache (
  cache_key   text        PRIMARY KEY,
  payload     jsonb       NOT NULL,
  fresh_until timestamptz NOT NULL,   -- dentro de esto: se sirve tal cual
  stale_until timestamptz NOT NULL,   -- entre fresh y stale: se sirve + refresca en background
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Para la limpieza de entradas vencidas.
CREATE INDEX IF NOT EXISTS idx_api_cache_stale_until
  ON api_cache (stale_until);
