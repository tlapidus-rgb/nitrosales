import { prisma } from "@/lib/db/client";
import { evaluarReadiness, type InsumosDeReadiness } from "./readiness";
import { testCredentialsByPlatform, testNitroPixel } from "./credential-tests";
import { verificarOrdersBroadcaster, verificarAfiliadoVtex } from "@/lib/vtex/hooks";

/** Shared live checks for staff inspection and activation; never accepts client-supplied readiness. */
export async function collectReadiness(ob: { id: string; companyName: string; status: string; createdOrgId: string }, verifyWebhook = false) {
  const id = ob.id;
  const orgId = ob.createdOrgId;
  // ── Recolección. Cada una aislada: que una falle no puede tumbar el resto.
  const conns = await prisma.connection
    .findMany({
      where: { organizationId: orgId },
      select: { platform: true, credentials: true },
    })
    .catch(() => null);

  const [conexiones, eventosDePixel, ordenes, jobs] = await Promise.all([
    Promise.all(
      (conns ?? []).map(async (c) => {
        try {
          const r = await testCredentialsByPlatform(c.platform as string, c.credentials);
          return { plataforma: c.platform as string, credencialesOk: !!r.ok, detalle: r.detail };
        } catch {
          return { plataforma: c.platform as string, credencialesOk: null, detalle: "error al probar" };
        }
      }),
    ),
    testNitroPixel(orgId, prisma)
      .then((r) => {
        // `testNitroPixel` devuelve el conteo dentro del texto; lo que importa
        // acá es sí/no, así que se traduce a 0 o a un positivo.
        if (!r.ok) return 0;
        const m = /([\d.]+) eventos/.exec(r.detail ?? "");
        return m ? Number(m[1].replace(/\./g, "")) : 1;
      })
      .catch(() => null),
    prisma.order.count({ where: { organizationId: orgId } }).catch(() => null),
    prisma
      .$queryRawUnsafe<Array<any>>(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE "status" = 'COMPLETED')::int AS completos,
           COUNT(*) FILTER (WHERE "status" = 'FAILED')::int AS fallados,
           COUNT(*) FILTER (WHERE "status" IN ('QUEUED','RUNNING'))::int AS pendientes
         FROM "backfill_jobs" WHERE "onboardingRequestId" = $1`,
        id,
      )
      .then((r) => ({
        total: Number(r[0]?.total || 0),
        completos: Number(r[0]?.completos || 0),
        fallados: Number(r[0]?.fallados || 0),
        pendientes: Number(r[0]?.pendientes || 0),
      }))
      .catch(() => null),
  ]);

  // E-33: cuántos productos tienen precio de costo. Es una sola query agregada
  // sobre `products` filtrada por org, así que es barata — a diferencia de la
  // del webhook, esta no sale a internet y va siempre.
  //
  // `null` si falla: un semáforo que trata "no sé" como "está bien" es peor que
  // no tener semáforo.
  const costos = await prisma
    .$queryRawUnsafe<Array<any>>(
      `SELECT COUNT(*)::int AS productos,
              COUNT("costPrice")::int AS "conCosto"
         FROM products WHERE "organizationId" = $1`,
      orgId,
    )
    .then((r) => ({
      productos: Number(r[0]?.productos || 0),
      conCosto: Number(r[0]?.conCosto || 0),
    }))
    .catch(() => null);

  // E-33: la verificación del webhook, sólo si la piden. Nunca tira: si VTEX no
  // contesta, queda en "no sé", que es distinto de "está mal" y de "está bien".
  // Los dos mecanismos se verifican juntos: son complementarios y tener uno solo
  // ya pasó (TeVe Compras, cobertura al 41 %). Van en paralelo porque son dos
  // llamadas independientes a la misma cuenta de VTEX.
  const sinVerificar = { registrado: null as boolean | null, detalle: undefined as string | undefined };
  const [webhook, afiliado] =
    verifyWebhook
      ? await Promise.all([verificarOrdersBroadcaster(orgId), verificarAfiliadoVtex(orgId)])
      : [sinVerificar, sinVerificar];

  const insumos: InsumosDeReadiness = {
    estadoOnboarding: ob.status,
    conexiones,
    conexionesDisponibles: conns !== null,
    eventosDePixel,
    ordenes,
    jobs,
    // ⚠️ SIN `?verificarWebhook=1` SIGUE SIENDO "no sé" (E-33, 2026-09-12).
    //
    // Confirmar el Orders Broadcaster obliga a llamar a la API de VTEX con las
    // credenciales del cliente, y eso es lento y puede colgarse. Este endpoint
    // es de lectura y lo abre un humano esperando una respuesta, así que la
    // verificación es **opt-in**: quien está por habilitar a un cliente la pide,
    // y quien sólo mira el estado no la paga.
    //
    // Lo que NO se hace es tratar "no verificado" como "está bien". Sin el
    // parámetro el semáforo lo reporta en amarillo con la instrucción al lado,
    // que es lo que ya hacía.
    webhookVtexRegistrado: webhook.registrado,
    webhookVtexDetalle: webhook.detalle,
    costos,
    afiliadoVtexRegistrado: afiliado.registrado,
    afiliadoVtexDetalle: afiliado.detalle,
  };

  return {
    onboardingId: id,
    companyName: ob.companyName,
    estado: ob.status,
    orgId,
    readiness: evaluarReadiness(insumos),
  };
}
