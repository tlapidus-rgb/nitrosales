-- ═══════════════════════════════════════════════════════════════
-- AurumUsageLog — Telemetría interna del motor de razonamiento
-- ═══════════════════════════════════════════════════════════════
-- Aplicar con: npm run db:push  (o ejecutar manualmente en Neon)
-- Idempotente: usa IF NOT EXISTS en todo.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "aurum_usage_logs" (
  "id"              TEXT        PRIMARY KEY,
  "organizationId"  TEXT        NOT NULL,
  "userId"          TEXT,
  "mode"            TEXT        NOT NULL,
  "model"           TEXT        NOT NULL,
  "inputTokens"     INTEGER     NOT NULL DEFAULT 0,
  "outputTokens"    INTEGER     NOT NULL DEFAULT 0,
  "totalTokens"     INTEGER     NOT NULL DEFAULT 0,
  "latencyMs"       INTEGER     NOT NULL,
  "toolRounds"      INTEGER     NOT NULL DEFAULT 0,
  "toolsUsed"       TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
  "stopReason"      TEXT,
  "success"         BOOLEAN     NOT NULL DEFAULT TRUE,
  "errorMessage"    TEXT,
  "createdAt"       TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "aurum_usage_logs_orgId_createdAt_idx"
  ON "aurum_usage_logs" ("organizationId", "createdAt");

CREATE INDEX IF NOT EXISTS "aurum_usage_logs_mode_createdAt_idx"
  ON "aurum_usage_logs" ("mode", "createdAt");

CREATE INDEX IF NOT EXISTS "aurum_usage_logs_createdAt_idx"
  ON "aurum_usage_logs" ("createdAt");
