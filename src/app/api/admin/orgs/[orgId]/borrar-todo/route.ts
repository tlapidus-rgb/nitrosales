// ══════════════════════════════════════════════════════════════════════════
// POST /api/admin/orgs/{orgId}/borrar-todo — borrado completo, E-28
// ══════════════════════════════════════════════════════════════════════════
// ⚠️ ESTO DESTRUYE DATOS DE FORMA IRREVERSIBLE. No hay papelera, no hay undo.
//
// Reemplaza a `wipe-account`, que borra de **9 tablas** mientras su propio
// header afirma que borra 20. Acá las tablas salen de `information_schema` —
// todas las que tienen columna `organizationId`— así que no se puede quedar
// corto por olvido.
//
// ── LAS CUATRO TRABAS, Y POR QUÉ CADA UNA ────────────────────────────────
// 1. **Simulacro por defecto.** Sin `?ejecutar=1` no borra: cuenta y muestra el
//    plan. Un endpoint destructivo cuyo default es destruir se dispara solo
//    algún día, con un link mal copiado.
// 2. **Token de confirmación con el orgId adentro.** `{ confirm: "BORRAR-<id>" }`.
//    Que lleve el id impide el accidente más probable: tener el comando de un
//    cliente y correrlo sobre otro.
// 3. **Todo en una transacción.** O se borra entero o no se borra nada. El
//    estado que hay que evitar a toda costa es el **parcialmente borrado**:
//    un cliente al que le sacamos las órdenes pero le dejamos el historial de
//    navegación no está ni borrado ni intacto, y nadie sabría en qué quedó.
// 4. **Auditoría antes y después.** La respuesta trae las dos, así que "se
//    borró todo" deja de ser una afirmación y pasa a ser un número.
//
// ⚠️ Para una organización muy grande (Arredo: ~6,7 M de eventos de pixel en 30
// días) la transacción puede pasarse del `maxDuration`. Si eso ocurre, Postgres
// **revierte todo** — que es el fracaso correcto: se vuelve a intentar, no se
// queda a medias. Lo que NO hay que hacer es partirlo en transacciones chicas
// "para que entre": eso reintroduce el estado parcial.
//
// ── AUTH: DISTINTA SEGÚN LO QUE HACE ─────────────────────────────────────
// · **Simulacro** (el default): staff o `?key=`. No destruye nada — cuenta y
//   muestra el plan. Misma puerta que `que-queda`.
// · **Ejecución** (`?ejecutar=1`): **sólo sesión de staff**. La clave de admin
//   está en `vercel.json`, que está versionado: un borrado irreversible no
//   puede quedar detrás de un secreto que puede leer cualquiera que clone el
//   repo.
//
// No es la misma puerta con dos nombres: son dos permisos distintos porque son
// dos acciones distintas. Mirar qué hay y destruirlo no valen lo mismo.
// ══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import { isValidAdminKey } from "@/lib/admin-key";
import {
  auditar,
  planConIndirectas,
  citarIdentificador,
  SQL_DEPENDENCIAS,
  consultasConflictos,
  loQueSePuedeAfirmar,
  tablasIndirectas,
  whereIndirecto,
  type TablaIndirecta,
  type TablaConOrg,
  type Dependencia,
} from "@/lib/organizacion/borrado";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

const TABLAS_CON_ORG = `
  SELECT table_name AS tabla
  FROM information_schema.columns
  WHERE table_schema = 'public' AND column_name = 'organizationId'
  ORDER BY table_name
`;



async function contar(tablas: string[], orgId: string): Promise<TablaConOrg[]> {
  const out: TablaConOrg[] = [];
  for (const tabla of tablas) {
    try {
      const r = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
        `SELECT COUNT(*)::float8 AS n FROM ${citarIdentificador(tabla)} WHERE "organizationId" = $1`,
        orgId,
      );
      out.push({ tabla, filas: Number(r[0]?.n ?? 0) });
    } catch {
      // `null` = no se pudo contar. NO es cero.
      out.push({ tabla, filas: null });
    }
  }
  return out;
}

/** Cuenta las tablas que pertenecen a la organizacion a traves de otra. */
async function contarIndirectas(ts: TablaIndirecta[], orgId: string): Promise<TablaConOrg[]> {
  const out: TablaConOrg[] = [];
  for (const t of ts) {
    try {
      const r = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
        `SELECT COUNT(*)::float8 AS n FROM ${citarIdentificador(t.tabla)} WHERE ${whereIndirecto(t)}`,
        orgId,
      );
      out.push({ tabla: t.tabla, filas: Number(r[0]?.n ?? 0) });
    } catch {
      out.push({ tabla: t.tabla, filas: null });
    }
  }
  return out;
}

export async function POST(req: NextRequest, { params }: { params: { orgId: string } }) {
  const url = new URL(req.url);
  const ejecutar = url.searchParams.get("ejecutar") === "1";

  const esStaff = await isInternalUser();
  const conClave = isValidAdminKey(url.searchParams.get("key"));

  // Ver la nota de auth arriba: mirar y destruir no valen lo mismo.
  if (!esStaff && !(conClave && !ejecutar)) {
    return NextResponse.json(
      {
        error: ejecutar
          ? "El borrado sólo se ejecuta con sesión de staff. La clave de admin no alcanza: " +
            "está en vercel.json, que está versionado."
          : "Forbidden",
      },
      { status: 403 },
    );
  }

  const { orgId } = params;
  if (!orgId) return NextResponse.json({ error: "orgId requerido" }, { status: 400 });
  const body = await req.json().catch(() => ({}) as Record<string, unknown>);

  let org: { name: string } | null;
  let tablas: string[];
  let dependencias: Dependencia[];
  try {
    org = await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } });
    if (!org) return NextResponse.json({ error: "Organización no encontrada" }, { status: 404 });
    tablas = (await prisma.$queryRawUnsafe<Array<{ tabla: string }>>(TABLAS_CON_ORG)).map(r => r.tabla);
    dependencias = await prisma.$queryRawUnsafe<Dependencia[]>(SQL_DEPENDENCIAS);
    // Missing catalog visibility must never turn into an empty successful wipe.
    if (tablas.length === 0) throw new Error("No se pudo determinar el alcance del borrado");
  } catch {
    return NextResponse.json({ ok: false, completo: false,
      error: "No se pudo verificar la organización o sus dependencias. No se inició el borrado." }, { status: 503 });
  }

  // Las que NO tienen `organizationId` pero cuelgan de una que sí.
  //
  // Sin esto el borrado **fallaba**: `order_items.orderId` no tiene
  // `ON DELETE CASCADE`, así que borrar `orders` choca contra la FK. Fallaba del
  // lado seguro —la transacción revierte— pero no borraba nada. Y el
  // `wipe-account` viejo, el que borra 9 tablas, sí las contemplaba: en esto era
  // más completo que su reemplazo.
  let indirectas: TablaIndirecta[];
  try { indirectas = tablasIndirectas(tablas, dependencias); }
  catch { return NextResponse.json({ ok: false, completo: false, error: "No se pudo resolver el alcance de las dependencias." }, { status: 503 }); }
  const compuestas = dependencias.filter(d => (d.columnas ?? 1) > 1);

  const plan = planConIndirectas(tablas, indirectas, dependencias);
  const antes = auditar([
    ...(await contar(tablas, orgId)),
    ...(await contarIndirectas(indirectas, orgId)),
  ]);

  // Un ciclo de foreign keys no tiene orden posible. Borrar "probando" sería
  // chocar contra una FK a mitad de camino.
  if (plan.ciclos.length > 0) {
    return NextResponse.json(
      {
        error: "Hay un ciclo de foreign keys: no existe un orden de borrado seguro.",
        ciclos: plan.ciclos,
        queHacer: "Resolver esas tablas a mano antes de correr esto.",
      },
      { status: 409 },
    );
  }

  const comun = {
    alcance: "Tablas con organizationId y dependencias transitivas simples descubiertas",
    dependenciasCompuestasSinResolver: compuestas,
    borradoTotalVerificado: false,
    organizationId: orgId,
    nombre: org?.name ?? null,
    existe: org !== null,
    antes: {
      filas: antes.filasQueQuedan,
      tablasConDatos: antes.conDatos.length,
      detalle: antes.conDatos,
      sinPoderContar: antes.sinPoderContar,
    },
    plan: { orden: plan.orden, seConservan: plan.seConservan },
  };

  // ── Simulacro (el default) ───────────────────────────────────────────────
  if (!ejecutar) {
    return NextResponse.json({
      simulacro: true,
      completo: antes.sinPoderContar.length === 0 && compuestas.length === 0,
      ...comun,
      loQueSePuedeAfirmar: loQueSePuedeAfirmar(antes),
      paraEjecutarDeVerdad:
        `POST ...?ejecutar=1 con body {"confirm":"BORRAR-${orgId}"}. ` +
        `ESTO ES IRREVERSIBLE.`,
    });
  }

  // ── Ejecución ────────────────────────────────────────────────────────────
  if (antes.sinPoderContar.length > 0) {
    return NextResponse.json({ ...comun, ok: false, completo: false,
      error: "No se pudo completar la auditoría previa. No se inició el borrado." }, { status: 503 });
  }
  if (compuestas.length) {
    return NextResponse.json({ ...comun, ok: false, completo: false,
      error: "Hay claves compuestas sin resolver. Se requiere revisar su propiedad antes de borrar." }, { status: 409 });
  }
  const esperado = `BORRAR-${orgId}`;
  if (body?.confirm !== esperado) {
    return NextResponse.json(
      {
        error: "Confirmación incorrecta.",
        // Se dice qué se espera, no se acepta cualquier cosa: el objetivo es
        // que nadie lo dispare sin leer, no que sea difícil de adivinar.
        esperado,
        recibido: typeof body?.confirm === "string" ? body.confirm : null,
      },
      { status: 400 },
    );
  }

  const arrancoEn = Date.now();
  const borradas: Array<{ tabla: string; filas: number }> = [];

  try {
    await prisma.$transaction(
      async (tx) => {
        for (const check of consultasConflictos(tablas, indirectas, dependencias)) {
          const rows = await tx.$queryRawUnsafe<Array<{ n: number }>>(check.sql, orgId);
          if (!rows[0] || Number(rows[0].n) > 0) throw new Error("Referencia a datos ajenos o retenidos: " + check.tabla);
        }
        // Verificar propietarios compartidos antes de la primera escritura.
        for (const t of indirectas) {
          const shared = await tx.$queryRawUnsafe<Array<{ n: number }>>(
            `SELECT COUNT(*)::float8 AS n FROM ${citarIdentificador(t.tabla)} WHERE (${whereIndirecto(t)}) AND (${whereIndirecto(t, true)})`, orgId);
          if (!shared[0] || Number(shared[0].n) > 0) throw new Error("Propiedad compartida o no verificable: " + t.tabla);
        }
        const byName = new Map(indirectas.map(t => [t.tabla, t]));
        for (const tabla of plan.orden) {
          const indirecta = byName.get(tabla);
          const n = await tx.$executeRawUnsafe(
            `DELETE FROM ${citarIdentificador(tabla)} WHERE ${indirecta ? whereIndirecto(indirecta) : '"organizationId" = $1'}`,
            orgId,
          );
          if (n > 0) borradas.push({ tabla, filas: n });
        }
      },
      { timeout: 780_000, maxWait: 20_000, isolationLevel: "Serializable" },
    );
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "El borrado falló y se revirtió ENTERO. No quedó nada a medias.",
        detalle: e?.message ?? String(e),
        ...comun,
      },
      { status: 500 },
    );
  }

  const despues = auditar([
    ...(await contar(tablas, orgId)),
    ...(await contarIndirectas(indirectas, orgId)),
  ]);

  return NextResponse.json({
    ok: despues.limpio,
    completo: despues.limpio,
    simulacro: false,
    ...comun,
    duracionMs: Date.now() - arrancoEn,
    borradas: borradas.sort((a, b) => b.filas - a.filas),
    totalFilasBorradas: borradas.reduce((a, b) => a + b.filas, 0),
    despues: {
      filas: despues.filasQueQuedan,
      tablasConDatos: despues.conDatos.length,
      detalle: despues.conDatos,
      sinPoderContar: despues.sinPoderContar,
    },
    // La afirmación, medida después del hecho. Si esto no dice "no queda
    // ningún dato", NO se borró todo — por más que la transacción haya salido bien.
    loQueSePuedeAfirmar: loQueSePuedeAfirmar(despues),
  });
}
