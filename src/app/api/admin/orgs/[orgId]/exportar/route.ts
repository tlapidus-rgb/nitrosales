// ══════════════════════════════════════════════════════════════════════════
// GET /api/admin/orgs/{orgId}/exportar — el cliente se lleva sus datos
// ══════════════════════════════════════════════════════════════════════════
// E-27. Es la otra mitad de E-28: un contrato que dice que el cliente es dueño
// de sus datos necesita las dos cosas — poder llevárselos y poder borrarlos.
// Hasta ahora no existía ninguna de las dos.
//
// ── POR QUÉ NDJSON Y NO UN JSON GIGANTE ──────────────────────────────────
// Un `JSON.stringify` de 10.000 órdenes con sus items arma el array entero en
// memoria antes de mandar el primer byte. Con un cliente grande eso se come la
// lambda. NDJSON —una línea por fila— se transmite a medida que sale de la base
// y se lee del otro lado sin cargar todo.
//
// ── EL MANIFIESTO VA PRIMERO, NO AL FINAL ────────────────────────────────
// La primera línea dice qué trae el archivo, qué NO trae y por qué. Va al
// principio a propósito: **si la descarga se corta a la mitad, lo que quedó
// igual dice qué debería haber contenido.** Un resumen al final sólo sirve
// cuando ya salió todo bien, que es justo cuando no hace falta.
//
// La última línea es un cierre con lo que efectivamente se escribió. Si esas
// dos no coinciden, el archivo está incompleto — y lo dice, aunque la descarga
// haya terminado sin error.
//
// Auth: staff o ?key=. Lectura pura, no escribe nada.
// ══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import { isValidAdminKey } from "@/lib/admin-key";
import { armarManifiesto, estaCompleta, SE_EXPORTA } from "@/lib/organizacion/exportacion";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

/** Filas que se traen por vuelta. Acotado para no cargar una tabla entera. */
const LOTE = 500;

export async function GET(req: NextRequest, { params }: { params: { orgId: string } }) {
  const url = new URL(req.url);
  if (!isValidAdminKey(url.searchParams.get("key")) && !(await isInternalUser())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { orgId } = params;
  if (!orgId) return NextResponse.json({ error: "orgId requerido" }, { status: 400 });

  const org = await prisma.organization
    .findUnique({ where: { id: orgId }, select: { name: true } })
    .catch(() => null);
  if (!org) return NextResponse.json({ error: "Organización no encontrada" }, { status: 404 });

  // Se cuenta ANTES de empezar a mandar: el manifiesto tiene que poder prometer
  // un número, y para eso hay que saberlo antes de la primera línea.
  const conteos: Array<{ tabla: string; filas: number | null }> = [];
  for (const { tabla } of SE_EXPORTA) {
    try {
      const r = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
        `SELECT COUNT(*)::float8 AS n FROM "${tabla}" WHERE "organizationId" = $1`,
        orgId,
      );
      conteos.push({ tabla, filas: Number(r[0]?.n ?? 0) });
    } catch {
      // `null` = no se pudo contar. Hace que el total del manifiesto también
      // sea `null`: un número que parece completo y no lo es es peor que nada.
      conteos.push({ tabla, filas: null });
    }
  }

  const manifiesto = armarManifiesto({
    organizationId: orgId,
    organizacion: org.name,
    conteos,
  });

  const codificador = new TextEncoder();

  const cuerpo = new ReadableStream({
    async start(control) {
      const linea = (o: unknown) => control.enqueue(codificador.encode(JSON.stringify(o) + "\n"));

      linea({ manifiesto });

      let escritas = 0;
      const problemas: Array<{ tabla: string; error: string }> = [];

      for (const { tabla } of SE_EXPORTA) {
        let saltear = 0;
        for (;;) {
          let filas: Array<Record<string, unknown>>;
          try {
            filas = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
              // El orden por `id` hace que la paginación sea estable: sin un
              // orden fijo, dos vueltas pueden traer la misma fila o saltearla.
              `SELECT * FROM "${tabla}" WHERE "organizationId" = $1 ORDER BY id LIMIT ${LOTE} OFFSET ${saltear}`,
              orgId,
            );
          } catch (e: any) {
            // Una tabla que falla NO corta la exportación: se anota y se sigue.
            // Cortar dejaría al cliente sin las tablas siguientes, que quizás
            // andaban bien.
            problemas.push({ tabla, error: e?.message ?? String(e) });
            break;
          }

          if (filas.length === 0) break;
          for (const fila of filas) {
            linea({ tabla, fila });
            escritas++;
          }
          if (filas.length < LOTE) break;
          saltear += LOTE;
        }
      }

      // El cierre. Si `completa` viene en false, el archivo está incompleto
      // aunque la descarga haya terminado bien.
      linea({
        cierre: {
          filasEsperadas: manifiesto.filasEsperadas,
          filasEscritas: escritas,
          completa: estaCompleta(manifiesto.filasEsperadas, escritas) && problemas.length === 0,
          problemas,
          terminadoEn: new Date().toISOString(),
        },
      });

      control.close();
    },
  });

  const nombre = `nitrosales-${org.name.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}-${
    new Date().toISOString().slice(0, 10)
  }.ndjson`;

  return new NextResponse(cuerpo, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      // Nunca cachear: son datos de un cliente.
      "Cache-Control": "no-store",
    },
  });
}
