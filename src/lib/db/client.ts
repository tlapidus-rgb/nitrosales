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
  // Railway PostgreSQL allows many more connections than we were using.
  // S60 EXT-3 (2026-05-15): subido de 8 a 12 porque /api/metrics/pixel
  // lanza 32 queries en Promise.all y con pool=8 auto-bloqueaba (24
  // esperando 30s timeout → 500). Con 12 + chunking del endpoint, fluye.
  // pool_timeout=30 gives headroom before Prisma throws "timed out".
  const rawUrl = process.env.DATABASE_URL || "";
  const sep = rawUrl.includes("?") ? "&" : "?";
  const dsUrl = `${rawUrl}${sep}connection_limit=12&pool_timeout=30&statement_timeout=25000`;

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
