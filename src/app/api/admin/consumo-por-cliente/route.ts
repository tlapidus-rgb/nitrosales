// ══════════════════════════════════════════════════════════════════════════
// GET /api/admin/consumo-por-cliente — las seis dimensiones que se facturan
// ══════════════════════════════════════════════════════════════════════════
// E-21. El modelo de precios es Scope × Scale, y Scale se factura por seis
// cosas: órdenes/mes, SKUs, integraciones, eventos de pixel, usuarios y uso de
// IA. **Ninguna tenía un reporte por organización.** Si el precio es por
// consumo, medir el consumo es parte del producto.
//
// ── DOS REGLAS QUE ESTE ENDPOINT NO NEGOCIA ──────────────────────────────
// 1. **`null` ≠ 0.** Cada consulta va con su propio catch y lo que falla sale
//    como `null`, no como cero. Un cero real es un cliente que no usa el módulo
//    (no se factura); un `null` es una consulta que falló (hay que ir a mirar).
//    Un reporte de facturación que las confunde factura mal, y en la dirección
//    que el cliente no reclama.
// 2. **Lo que no se sabe, se dice arriba.** `avisos` va en la raíz de la
//    respuesta, no escondido por cliente.
//
// Órdenes: usa `ordersValidSql` de @/domains/orders. El contrato de "venta
// válida" vive en un solo lugar y hay un guard de build que lo enforcea.
//
// Aurum: se agrega en SQL por (org, modo, modelo). El endpoint viejo
// `/api/admin/usage` trae filas crudas con `take: 10000` — un truncado
// silencioso esperando su turno. Agregando, el problema deja de existir.
//
// CLAUDE.md §REGLA #3b: sin JOIN a tablas grandes, máximo 3 queries en paralelo
// por batch, pool acotado.
//
// Auth: staff o ?key=. Lectura pura, no escribe nada.
// ══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import { isValidAdminKey } from "@/lib/admin-key";
import {
  ORDENES_POR_ORG,
  SKUS_POR_ORG,
  INTEGRACIONES_POR_ORG,
  EVENTOS_PIXEL_POR_ORG,
  USUARIOS_POR_ORG,
  AURUM_AGRUPADO,
} from "@/lib/costos/consultas";
import {
  costoDeAurum,
  armarConsumo,
  avisosDelReporte,
  type LlamadaDeAurum,
} from "@/lib/costos/consumo-por-cliente";
import {
  PRECIOS_VERIFICADOS_EL,
  convieneRevisarLosPrecios,
} from "@/lib/costos/precios-de-modelos";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Techo de grupos (org × modo × modelo) del consumo de Aurum.
 *
 * Con 6 orgs × 3 modos × 4 modelos son 72 combinaciones, así que en la práctica
 * nunca se toca. Está por si alguien loguea un `model` con variantes que no
 * esperamos — y si se toca, se DICE (ver `filasDeAurumTruncadas`).
 */
const TECHO_DE_GRUPOS = 2000;

// Los SUM() van a `float8` y no a `int`: `::int` es de 32 bits y tira
// "integer out of range" pasando los ~2.100 millones. Con `?dias=365` sobre un
// cliente pesado eso es alcanzable, y el error lo comería el catch de abajo —
// o sea que el costo de IA se volvería `null` por un cast, no por un problema
// real. float8 tiene 53 bits de precisión entera: de sobra para tokens.

type Conteo = { organizationId: string; n: number };

/** Convierte filas `{organizationId, n}` en un mapa. `null` si la consulta falló. */
async function contarPorOrg(q: Promise<Conteo[]>): Promise<Map<string, number> | null> {
  try {
    const filas = await q;
    return new Map(filas.map((f) => [f.organizationId, Number(f.n)]));
  } catch {
    // No se pudo medir. NO es cero — el que lee tiene que poder distinguirlo.
    return null;
  }
}

/** `null` si no se pudo medir; si se midió y la org no aparece, es un cero real. */
function leer(mapa: Map<string, number> | null, orgId: string): number | null {
  if (mapa === null) return null;
  return mapa.get(orgId) ?? 0;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (!isValidAdminKey(url.searchParams.get("key")) && !(await isInternalUser())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const dias = Math.min(365, Math.max(1, parseInt(url.searchParams.get("dias") || "30", 10) || 30));
  const desde = new Date(Date.now() - dias * 86_400_000);

  const orgs = await prisma.organization.findMany({
    select: { id: true, name: true, plan: true },
    orderBy: { createdAt: "asc" },
  });
  if (orgs.length === 0) {
    return NextResponse.json({ generadoEn: new Date().toISOString(), periodoDias: dias, clientes: [], avisos: [] });
  }

  // ── Batch 1: órdenes · SKUs · integraciones ──
  // El SQL vive en @/lib/costos/consultas y un test lo ejecuta contra Postgres
  // real. Inline, nada lo correría hasta producción.
  const [ordenes, skus, integraciones] = await Promise.all([
    contarPorOrg(prisma.$queryRawUnsafe<Conteo[]>(ORDENES_POR_ORG, desde)),
    contarPorOrg(prisma.$queryRawUnsafe<Conteo[]>(SKUS_POR_ORG)),
    contarPorOrg(prisma.$queryRawUnsafe<Conteo[]>(INTEGRACIONES_POR_ORG)),
  ]);

  // ── Batch 2: eventos de pixel · usuarios · Aurum agregado ──
  const [eventos, usuarios, gruposDeAurum] = await Promise.all([
    contarPorOrg(prisma.$queryRawUnsafe<Conteo[]>(EVENTOS_PIXEL_POR_ORG, desde)),
    contarPorOrg(prisma.$queryRawUnsafe<Conteo[]>(USUARIOS_POR_ORG)),
    prisma
      .$queryRawUnsafe<Array<LlamadaDeAurum & { llamadas: number }>>(
        AURUM_AGRUPADO,
        desde,
        TECHO_DE_GRUPOS,
      )
      .catch(() => null),
  ]);

  const aurumPorOrg = new Map<string, LlamadaDeAurum[]>();
  for (const g of gruposDeAurum ?? []) {
    const lista = aurumPorOrg.get(g.organizationId) ?? [];
    lista.push(g);
    aurumPorOrg.set(g.organizationId, lista);
  }

  const clientes = orgs.map((o) =>
    armarConsumo({
      organizationId: o.id,
      nombre: o.name,
      plan: (o.plan as string | null) ?? null,
      ordenesDelPeriodo: leer(ordenes, o.id),
      skusActivos: leer(skus, o.id),
      integracionesActivas: leer(integraciones, o.id),
      eventosPixelDelPeriodo: leer(eventos, o.id),
      usuarios: leer(usuarios, o.id),
      aurum: costoDeAurum(aurumPorOrg.get(o.id) ?? []),
    }),
  );

  const { avisos, completo } = avisosDelReporte({
    clientes,
    preciosVerificadosEl: PRECIOS_VERIFICADOS_EL,
    convieneRevisarPrecios: convieneRevisarLosPrecios(),
    filasDeAurumTruncadas: (gruposDeAurum?.length ?? 0) >= TECHO_DE_GRUPOS,
  });

  return NextResponse.json({
    generadoEn: new Date().toISOString(),
    periodoDias: dias,
    preciosVerificadosEl: PRECIOS_VERIFICADOS_EL,
    // De dónde sale cada dimensión, para que nadie tenga que abrir el código
    // para saber si un número es crudo o de rollup.
    fuentes: {
      ordenesDelPeriodo: "orders (contrato de venta válida)",
      skusActivos: "products (isActive)",
      integracionesActivas: "connections (ACTIVE)",
      eventosPixelDelPeriodo: "pixel_daily_aggregates — rollup DIARIO, puede faltar lo de hoy",
      usuarios: "users",
      aurum: "aurum_usage_logs agregado por (org, modo, modelo)",
    },
    // `false` no quiere decir "está roto": quiere decir "no factures sin leer
    // los avisos". Va arriba para que no haya que buscarlo.
    completo,
    avisos,
    // El costo de IA NO se pudo consultar en absoluto, que es distinto de cero.
    costoDeIaDisponible: gruposDeAurum !== null,
    clientes,
  });
}
