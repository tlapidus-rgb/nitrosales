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
// ── AUTH: SÓLO SESIÓN DE STAFF ───────────────────────────────────────────
// Antes aceptaba `?key=`. Una revisión de seguridad lo marcó como el hallazgo
// más grave de la branch, y con razón: esa clave está en `vercel.json`
// versionado, y lo que sale por acá es el padrón completo de compradores de un
// cliente —emails, nombres, ciudad— más los pagos a creadores.
//
// Exfiltrar no se deshace. Es tan irreversible como borrar, sólo que en la otra
// dirección, así que merece la misma puerta que el borrado.
// ══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import {
  armarManifiesto,
  estaCompleta,
  limpiarFila,
  SE_EXPORTA,
} from "@/lib/organizacion/exportacion";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

// `order_items` NO tiene columna `organizationId`: cuelga de `orders`. Sin
// esta excepción su COUNT y su SELECT fallaban, y la exportación salía **sin
// los items de ningún pedido** — la mitad del valor de exportar los pedidos.
//
// Es la única de las exportables en ese caso. El descubrimiento genérico de
// tablas indirectas vive en `@/lib/organizacion/borrado` y lo usan los
// endpoints de auditoría y de borrado.
const FILTRO_POR_TABLA: Record<string, string> = {
  order_items: `"orderId" IN (SELECT "id" FROM "orders" WHERE "organizationId" = $1)`,
};

const filtroDe = (tabla: string) => FILTRO_POR_TABLA[tabla] ?? `"organizationId" = $1`;

/** Filas que se traen por vuelta. Acotado para no cargar una tabla entera. */
const LOTE = 500;

export async function GET(req: NextRequest, { params }: { params: { orgId: string } }) {
  if (!(await isInternalUser())) {
    return NextResponse.json(
      {
        error:
          "La exportación sólo corre con sesión de staff. La clave de admin no alcanza: " +
          "está en vercel.json, que está versionado, y esto entrega datos personales " +
          "de los compradores del cliente.",
      },
      { status: 403 },
    );
  }

  const { orgId } = params;
  if (!orgId) return NextResponse.json({ error: "orgId requerido" }, { status: 400 });

  const org = await prisma.organization
    .findUnique({ where: { id: orgId }, select: { name: true } })
    .catch(() => null);
  if (!org) return NextResponse.json({ error: "Organización no encontrada" }, { status: 404 });

  const encoder = new TextEncoder();
  let cancelled = false;
  let resume: (() => void) | undefined;
  const cuerpo = new ReadableStream<Uint8Array>({
    start(control) {
      void (async () => {
      let written = 0;
      let expected: number | null = null;
      const removed = new Set<string>();
      const emit = async (value: unknown) => {
        if (cancelled) throw new Error("Export cancelled");
        control.enqueue(encoder.encode(JSON.stringify(value) + "\n"));
        if ((control.desiredSize ?? 0) <= 0) await new Promise<void>(resolve => { resume = resolve; });
        if (cancelled) throw new Error("Export cancelled");
      };
      try {
        // Counts and all pages share one snapshot. Keyset pagination avoids
        // repeatedly scanning growing OFFSETs. No row writes are allowed.
        await prisma.$transaction(async tx => {
          await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
          const counts: Array<{ tabla: string; filas: number }> = [];
          for (const { tabla } of SE_EXPORTA) {
            const rows = await tx.$queryRawUnsafe<Array<{ n: number }>>(
              `SELECT COUNT(*)::float8 AS n FROM "${tabla}" WHERE ${filtroDe(tabla)}`, orgId);
            const n = Number(rows[0]?.n);
            if (!Number.isFinite(n) || n < 0) throw new Error("Invalid export count");
            counts.push({ tabla, filas: n });
          }
          const manifiesto = armarManifiesto({ organizationId: orgId, organizacion: org.name, conteos: counts });
          expected = manifiesto.filasEsperadas;
          await emit({ manifiesto, consistencia: "snapshot-repeatable-read" });
          for (const { tabla } of SE_EXPORTA) {
            let cursor: string | null = null;
            for (;;) {
              if (cancelled) throw new Error("Export cancelled");
              const rows: Array<Record<string, unknown>> = await tx.$queryRawUnsafe(
                `SELECT * FROM "${tabla}" WHERE ${filtroDe(tabla)} ${cursor === null ? "" : 'AND "id" > $2'} ORDER BY "id" LIMIT ${LOTE}`,
                ...cursor === null ? [orgId] : [orgId, cursor],
              );
              if (rows.length === 0) break;
              for (const row of rows) {
                const { limpia, quitadas } = limpiarFila(row);
                for (const column of quitadas) removed.add(`${tabla}.${column}`);
                await emit({ tabla, fila: limpia });
                written++;
              }
              const next = rows[rows.length - 1].id;
              if (typeof next !== "string" || next === cursor) throw new Error("Invalid export cursor");
              cursor = next;
              if (rows.length < LOTE) break;
            }
          }
        }, { isolationLevel: "RepeatableRead", timeout: 780_000, maxWait: 5000 });
        // Emit a successful footer only after the transaction completed.
        await emit({ cierre: { filasEsperadas: expected, filasEscritas: written,
          completa: estaCompleta(expected, written), consistencia: "snapshot-repeatable-read",
          problemas: [], columnasQuitadasPorSeguridad: [...removed].sort(), terminadoEn: new Date().toISOString() } });
      } catch {
        if (!cancelled) await emit({ cierre: { filasEsperadas: expected, filasEscritas: written, completa: false,
          problemas: [{ error: "No se pudo completar la lectura consistente. Volvé a descargar el archivo." }],
          columnasQuitadasPorSeguridad: [...removed].sort(), terminadoEn: new Date().toISOString() } });
      } finally {
        if (!cancelled) control.close();
      }
      })().catch(() => { if (!cancelled) control.error(new Error("Export unavailable")); });
    },
    pull() { const notify = resume; resume = undefined; notify?.(); },
    cancel() { cancelled = true; const notify = resume; resume = undefined; notify?.(); },
  });
  const nombre = `nitrosales-${org.name.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.ndjson`;
  return new NextResponse(cuerpo, { headers: {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Content-Disposition": `attachment; filename="${nombre}"`,
    "Cache-Control": "no-store",
  } });
}