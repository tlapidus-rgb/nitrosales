-- ══════════════════════════════════════════════════════════════════════════
-- Migraciones que el código de la branch necesita ANTES del merge
-- ══════════════════════════════════════════════════════════════════════════
-- Para la consola SQL de Neon (producción). Lo corre una persona: el código
-- nunca se conecta a la base de producción.
--
-- Por qué antes: el build de Vercel no migra. Si el código llega primero, en
-- el minuto del deploy deja de entrar toda orden de MercadoLibre, ningún
-- backfill arranca y ningún creador entra a su panel.
--
-- Por qué es seguro: las cinco son aditivas e idempotentes (IF NOT EXISTS) y
-- el código que hoy está en producción las ignora. Se pueden correr dos veces,
-- y se pueden correr con backfills en curso.
--
-- CÓMO: **un paso por vez** (seleccionar el bloque y ejecutar sólo eso). Si se
-- corre el archivo entero de un saque, el editor puede meterlo en una sola
-- transacción, y el lock de `orders` quedaría tomado mientras se esperan los de
-- las otras tablas: segundos con las órdenes frenadas, webhooks incluidos.
--
-- Antes de empezar: crear un punto de restauración en Neon (Branches → Create
-- branch).
--
-- Los pasos 1 a 3 son una copia textual de prisma/migrations/*.sql. El test
-- src/__tests__/migraciones-neon-runbook.test.ts se pone rojo si se desfasan,
-- y además corre este archivo contra Postgres.
-- ══════════════════════════════════════════════════════════════════════════


-- ── PASO 1 — las tablas nuevas ─────────────────────────────────────────────
-- Toman un lock breve sobre `organizations` (por la clave foránea). El
-- lock_timeout hace que, si en 3 segundos no lo consiguen, se cancelen sin
-- tocar nada: esperar un minuto y volver a correr el paso.
SET lock_timeout = '3s';

-- ml_sync_progress.sql
CREATE TABLE IF NOT EXISTS ml_sync_progress (
  "organizationId" text PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  "fromDate" timestamptz NOT NULL,
  "toDate" timestamptz NOT NULL,
  cursor jsonb,
  "completedThrough" timestamptz,
  "lastAttemptAt" timestamptz NOT NULL DEFAULT now(),
  "leaseToken" text,
  "leaseUntil" timestamptz,
  "lastError" text
);

-- ml_reconcile_progress.sql
CREATE TABLE IF NOT EXISTS ml_reconcile_progress (
  "organizationId" text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  layer text NOT NULL CHECK (layer IN ('incremental', 'deep')),
  "toDate" timestamptz NOT NULL,
  cursor jsonb,
  "leaseToken" text,
  "leaseUntil" timestamptz,
  "lastAttemptAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("organizationId", layer)
);

-- creator_password_attempts.sql
CREATE TABLE IF NOT EXISTS creator_password_attempts (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL CHECK (attempts >= 0),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS creator_password_attempts_expiry_idx
  ON creator_password_attempts (expires_at);


-- ── PASO 2 — la columna de leases en backfill_jobs ─────────────────────────
SET lock_timeout = '3s';

-- backfill_job_lease.sql
ALTER TABLE "backfill_jobs" ADD COLUMN IF NOT EXISTS "leaseToken" TEXT;


-- ── PASO 3 — la columna en orders (sola, a propósito) ──────────────────────
-- `orders` es la tabla más usada. El ALTER es sólo de metadata (no reescribe la
-- tabla) pero toma un lock exclusivo: si hay una consulta larga corriendo, el
-- ALTER la espera y bloquea a todas las que vengan detrás. Con lock_timeout se
-- cancela a los 3 segundos sin tocar nada. Si pasa, esperar un minuto y volver.
SET lock_timeout = '3s';

-- backfill_enrichment_version.sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "backfillEnrichedVersion" TIMESTAMPTZ;


-- ── PASO 4 — sólo lectura: verificación. Las nueve filas tienen que decir true
-- Los permisos se miran para el rol de la primera línea. `current_user` es el
-- rol con el que entraste a la consola; si la app se conecta con OTRO rol,
-- cambiar `current_user` por el nombre de ese rol entre comillas simples (por
-- ejemplo 'neondb_owner'). Es el único lugar a editar.
--
-- La existencia se mira en el catálogo (to_regclass, pg_attribute) y no en
-- information_schema, que esconde las tablas que el rol no puede ver.
-- Un permiso por llamada: con varios separados por coma, has_table_privilege da
-- true si hay CUALQUIERA. Y CASE en vez de AND: Postgres no garantiza el orden
-- de un AND, y has_table_privilege sobre una tabla que no existe tira error.
WITH rol AS (SELECT current_user::text AS nombre),
permisos(tabla, permiso) AS (VALUES
  ('ml_sync_progress', 'SELECT'), ('ml_sync_progress', 'INSERT'), ('ml_sync_progress', 'UPDATE'),
  ('ml_reconcile_progress', 'SELECT'), ('ml_reconcile_progress', 'INSERT'), ('ml_reconcile_progress', 'UPDATE'),
  ('creator_password_attempts', 'SELECT'), ('creator_password_attempts', 'INSERT'),
  ('creator_password_attempts', 'UPDATE'), ('creator_password_attempts', 'DELETE')
)
SELECT 'orders."backfillEnrichedVersion"' AS objeto,
       EXISTS (SELECT 1 FROM pg_attribute
                WHERE attrelid = to_regclass('public.orders') AND attname = 'backfillEnrichedVersion'
                  AND attnum > 0 AND NOT attisdropped) AS ok
UNION ALL
SELECT 'backfill_jobs."leaseToken"',
       EXISTS (SELECT 1 FROM pg_attribute
                WHERE attrelid = to_regclass('public.backfill_jobs') AND attname = 'leaseToken'
                  AND attnum > 0 AND NOT attisdropped)
UNION ALL
SELECT 'tabla ' || t, to_regclass('public.' || t) IS NOT NULL
  FROM unnest(ARRAY['ml_sync_progress', 'ml_reconcile_progress', 'creator_password_attempts']) AS t
UNION ALL
SELECT 'índice creator_password_attempts_expiry_idx',
       to_regclass('public.creator_password_attempts_expiry_idx') IS NOT NULL
UNION ALL
SELECT 'permisos de ' || (SELECT nombre FROM rol) || ' sobre ' || p.tabla,
       bool_and(CASE WHEN to_regclass('public.' || p.tabla) IS NULL THEN false
                     ELSE has_table_privilege((SELECT nombre FROM rol), to_regclass('public.' || p.tabla), p.permiso)
                END)
  FROM permisos p
 GROUP BY p.tabla;


-- ── AL MOMENTO DEL MERGE (no de la migración) — sólo lectura. Tiene que dar 0
-- Los workers del código viejo no respetan el lease. Mergear con un backfill
-- corriendo puede procesar el mismo job dos veces. Si da más de 0, esperar a
-- que termine antes de mergear.
SELECT count(*) AS backfills_en_curso FROM backfill_jobs WHERE status = 'RUNNING';
