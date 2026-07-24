import { PrismaClient, Prisma } from "@prisma/client";

// Patrón singleton para Prisma.
// Evita crear múltiples instancias en desarrollo (hot reload de Next.js)
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Recursively converts Prisma.Decimal objects to plain numbers.
 * This ensures API responses serialize correctly (number, not string)
 * and existing arithmetic code continues working after Float→Decimal migration.
 */
function convertDecimalsToNumbers(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Prisma.Decimal) return obj.toNumber();
  if (obj instanceof Date) return obj;
  if (Array.isArray(obj)) return obj.map(convertDecimalsToNumbers);
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = convertDecimalsToNumbers(value);
    }
    return result;
  }
  return obj;
}

function createPrismaClient(): PrismaClient {
  // connection_limit=24: /api/metrics/orders corre 14 queries en paralelo y
  // /api/metrics/pixel hace varias oleadas; 24 evita que se saturen entre sí.
  // (El "8" histórico de REGLA #3b es previo al diseño de queries en paralelo y
  // causaba pool timeouts; ver evolución 8→12 commit 608646a → 24.) El endpoint
  // de Neon es el -pooler, así que 24 conexiones lógicas son seguras.
  // pool_timeout=30 da margen antes de que Prisma tire "timed out".
  // statement_timeout=25000 mata una query colgada → safeQuery usa su fallback.
  const rawUrl = process.env.DATABASE_URL || "";
  const sep = rawUrl.includes("?") ? "&" : "?";
  // ⚠️ pgbouncer=true cuando el endpoint es el -pooler de Neon (2026-07-24).
  //   El pooler de Neon es PgBouncer en modo TRANSACCIÓN: las conexiones se
  //   reusan entre transacciones. Sin este flag, Prisma usa prepared statements
  //   atados a UNA conexión; la query siguiente cae en OTRA del pool donde ese
  //   statement no existe → `PrismaClientKnownRequestError: Invalid invocation`,
  //   intermitente. Pegaba sobre todo en el background refresh de
  //   /api/metrics/pixel (hace ~29 queries seguidas → más chances de cruzar
  //   conexiones), que fallaba y dejaba el cache del dashboard sin actualizar.
  //   `pgbouncer=true` hace que Prisma NO use prepared statements → seguro con
  //   el pooler. Sólo se agrega si la URL ES el pooler (conexión directa no lo
  //   necesita y no debe llevarlo).
  const isPooler = /-pooler\./.test(rawUrl);
  const pgbouncer = isPooler && !/[?&]pgbouncer=/.test(rawUrl) ? "&pgbouncer=true" : "";
  const dsUrl = `${rawUrl}${sep}connection_limit=24&pool_timeout=30&statement_timeout=25000${pgbouncer}`;

  const client = new PrismaClient({
    datasourceUrl: dsUrl,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

  // Middleware: auto-convert Decimal → number on all query results
  client.$use(async (params, next) => {
    const result = await next(params);
    return convertDecimalsToNumbers(result);
  });

  return client;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
