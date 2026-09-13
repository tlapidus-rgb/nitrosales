// ══════════════════════════════════════════════════════════════════════════
// GET /api/admin/techo-de-orgs — cuántos clientes aguanta esto, MEDIDO
// ══════════════════════════════════════════════════════════════════════════
// Corre el rollup de UN día y UNA tabla para todas las organizaciones, mide lo
// que tarda cada una, y con eso calcula el techo.
//
// Existe porque la pregunta "¿cuántos clientes aguantamos?" se venía
// contestando con tres números distintos, ninguno medido:
//
//   · **8-10** — del estudio de escalabilidad. Mal calculado (tomó un
//     auto-límite de 250s como pared dura cuando `maxDuration` es 800s).
//     Corregido el mismo día.
//   · **50-77** — la corrección. Aritmética, no medición.
//   · **~10 chicas o 2 grandes** — la tabla del mismo estudio, y el más
//     pesimista. Venía de que la unidad de trabajo era indivisible, que es lo
//     que E-01 arregló.
//
// Y el parámetro del que colgaba todo —el costo de una org chica— está marcado
// `ESTIMADO` en el estudio: asumió 1/20 del volumen de Arredo. Esto lo mide.
//
// ── QUÉ HACE Y QUÉ CUESTA ────────────────────────────────────────────────
// **Escribe en las tablas de rollup**, igual que el cron que ya corre 144 veces
// por día. No es una operación nueva ni riesgosa: es exactamente el trabajo que
// el sistema hace solo, disparado a mano y con cronómetro. Es idempotente (el
// rollup es un UPSERT por organización y día).
//
// Por defecto mide con la tabla `funnel`, que es la más cara de las ocho, así
// que el techo que devuelve es el conservador.
//
// ── LO QUE ESTE NÚMERO **NO** DICE ───────────────────────────────────────
// Mide el pipeline de rollups y nada más. El otro techo —la cache de Neon—
// aprieta ANTES y esto no lo ve: working set medido de ~28 GB contra 16 GB de
// cache, y con 5 orgs grandes son >100 GB. Ese no se arregla con más CU; se
// arregla con E-09 (retención), que está pendiente.
//
// Auth: staff o ?key=.
// ══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import { isValidAdminKey } from "@/lib/admin-key";
import { backfillDay, ROLLUP_TABLES, type RollupTable } from "@/lib/pixel/rollup-backfill";
import { calcularTecho, dispersion } from "@/lib/pixel/techo-de-orgs";
import vercel from "../../../../../vercel.json";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

/** El presupuesto real, leído de la configuración, no escrito a mano. */
function presupuestoReal() {
  const crons = (vercel as { crons?: Array<{ path: string; schedule: string }> }).crons ?? [];
  const elDeRollups = crons.find((c) => c.path.includes("refresh-pixel-rollups"));

  // "11,41 * * * *" → 2 por hora. Se cuenta la lista de minutos del primer campo.
  const porHoraVercel = elDeRollups ? elDeRollups.schedule.split(" ")[0].split(",").length : 0;

  // El workflow de GitHub Actions corre cada 15 min = 4 por hora. Va aparte
  // porque NO se puede leer desde acá, y porque GitHub deshabilita los workflows
  // programados tras 60 días sin actividad en el repo (N-01 en el backlog): el
  // día que eso pase, el presupuesto diario se corta a un tercio y este número
  // sube a mentira sin que nada avise.
  const porHoraGithub = 4;

  return {
    invocacionesPorDia: (porHoraVercel + porHoraGithub) * 24,
    presupuestoPorInvocacionMs: 250_000,
    tablas: ROLLUP_TABLES.length,
    detalle: {
      vercelPorHora: porHoraVercel,
      githubPorHora: porHoraGithub,
      scheduleDeVercel: elDeRollups?.schedule ?? null,
    },
  };
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (!isValidAdminKey(url.searchParams.get("key")) && !(await isInternalUser())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tablaPedida = url.searchParams.get("tabla");
  const tabla: RollupTable =
    tablaPedida && (ROLLUP_TABLES as readonly string[]).includes(tablaPedida)
      ? (tablaPedida as RollupTable)
      : "funnel";

  // Ayer, no hoy: un día cerrado tiene el volumen completo. Medir contra el día
  // en curso daría un costo artificialmente bajo según la hora.
  const ayer = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const dia = url.searchParams.get("dia") ?? ayer;

  const orgs = await prisma.organization.findMany({ select: { id: true, name: true } });
  if (orgs.length === 0) {
    return NextResponse.json({ error: "No hay organizaciones que medir" }, { status: 400 });
  }

  const arrancoEn = Date.now();
  const resultado = await backfillDay(
    dia,
    orgs.map((o) => o.id),
    tabla,
  );
  const totalMs = Date.now() - arrancoEn;

  const nombres = new Map(orgs.map((o) => [o.id, o.name]));
  const medidas = resultado.perOrgMs.map((m) => ({
    org: nombres.get(m.org) ?? m.org,
    ms: m.ms,
    segundos: Math.round(m.ms / 100) / 10,
    filasEscritas: m.touched,
    ok: m.ok,
  }));

  const p = presupuestoReal();
  const techo = calcularTecho(
    resultado.perOrgMs.map((m) => ({ org: m.org, ms: m.ms })),
    p,
  );
  const disp = dispersion(resultado.perOrgMs.map((m) => ({ org: m.org, ms: m.ms })));

  return NextResponse.json({
    medidoEn: new Date().toISOString(),
    dia,
    tabla,
    tablaMasCara: tabla === "funnel",
    totalMs,

    // Lo medido, org por org. Es el dato crudo: cualquiera puede rehacer la
    // cuenta con esto.
    medidas: medidas.sort((a, b) => b.ms - a.ms),

    presupuesto: {
      ...p,
      presupuestoDiarioHoras: Math.round((techo.presupuestoDiarioMs / 3_600_000) * 10) / 10,
    },

    techo: {
      ...techo,
      ocupacionPct: Math.round(techo.ocupacion * 1000) / 10,
      // Si la org más cara sale mucho más que la más barata, el promedio no
      // describe a nadie y el único techo honesto es el de "todas grandes".
      dispersion: Math.round(disp * 10) / 10,
      cualMirar:
        disp > 5
          ? "techoSiTodasFueranGrandes — las orgs son muy distintas entre sí, el promedio no describe a ninguna"
          : "techoDeOrgs — las orgs se parecen lo suficiente como para que el promedio valga",
    },

    // Sin esto el número se lee como si fuera EL techo, y no lo es.
    loQueEsteNumeroNoDice: [
      "Mide el pipeline de rollups, nada más. El techo de la cache de Neon aprieta ANTES: " +
        "working set medido de ~28 GB contra 16 GB de cache, y con 5 orgs grandes son >100 GB. " +
        "Eso no se arregla con más CU — se arregla con E-09 (retención), que está pendiente.",
      "Asume que las organizaciones nuevas se parecen a las medidas. Un cliente tamaño Arredo " +
        "cuenta como " +
        (techo.masBarataMs > 0 ? Math.round(techo.masCaraMs / techo.masBarataMs) : "?") +
        " clientes chicos.",
      "Asume que el workflow de GitHub Actions sigue habilitado. GitHub deshabilita los " +
        "workflows programados tras 60 días sin actividad en el repo (N-01): si eso pasa, el " +
        "presupuesto diario cae a un tercio y este número queda alto.",
    ],

    fallos: resultado.failures,
  });
}
