// ══════════════════════════════════════════════════════════════════════════
// src/lib/onboarding/readiness.ts — ¿este cliente está listo?
// ══════════════════════════════════════════════════════════════════════════
// E-15. No existía ningún objeto que dijera "este cliente está listo para que
// le abramos el producto". Los insumos SÍ existen y están todos escritos:
//
//   · `testCredentialsByPlatform` / `testNitroPixel` (credential-tests.ts, 1.072
//     líneas que cubren 6 plataformas);
//   · `/api/nitropixel/install-status`;
//   · el conteo de órdenes y el estado de los `backfill_jobs`.
//
// Lo que faltaba es el que los junta. Sin eso, la decisión de habilitar a un
// cliente es "Tomy se acuerda de chequear cinco cosas en cinco pantallas
// distintas", y el paso que se olvida no avisa: ya pasó con TeVe Compras, que
// entró con 0 de 8 órdenes atribuidas porque nadie registró el afiliado de VTEX.
//
// ── POR QUÉ NO SIRVE EL NITROSCORE PARA ESTO ─────────────────────────────
// Es tentador reusarlo y sería un error: mide CALIDAD del pixel, no COMPLETITUD
// del onboarding, y en el día 1 devuelve `null` por diseño. Un cliente recién
// entrado siempre daría "no listo" sin decir por qué.
//
// Esta función es pura a propósito: la parte que hay que poder testear es el
// criterio, no la recolección de datos.
// ══════════════════════════════════════════════════════════════════════════

export type EstadoItem = "ok" | "falta" | "atencion" | "no-aplica";

export type ItemDeReadiness = {
  clave: string;
  titulo: string;
  estado: EstadoItem;
  detalle: string;
  /** Qué hacer si no está en verde. Vacío cuando está OK. */
  queHacer?: string;
};

export type InsumosDeReadiness = {
  /** Estado del onboarding: PENDING, BACKFILLING, READY_FOR_REVIEW, ACTIVE… */
  estadoOnboarding: string;
  /** Conexiones cargadas por el cliente y si su test de credenciales pasó. */
  conexiones: Array<{ plataforma: string; credencialesOk: boolean | null; detalle?: string }>;
  /** Eventos de pixel en las últimas 48 h. `null` = no se pudo consultar. */
  eventosDePixel: number | null;
  /** Órdenes cargadas para la organización. `null` = no se pudo consultar. */
  ordenes: number | null;
  /** Jobs de backfill del alta, por estado. */
  jobs: { total: number; completos: number; fallados: number; pendientes: number };
  /** Si el webhook de órdenes de VTEX está registrado. `null` = no verificado. */
  webhookVtexRegistrado: boolean | null;
};

export type Readiness = {
  listo: boolean;
  /** Cuántos items hay que resolver antes de habilitar. */
  bloqueantes: number;
  items: ItemDeReadiness[];
};

/** Un item que bloquea la habilitación (vs. uno que sólo merece mirarse). */
const BLOQUEANTES = new Set(["credenciales", "backfill", "ordenes"]);

export function evaluarReadiness(i: InsumosDeReadiness): Readiness {
  const items: ItemDeReadiness[] = [];

  // ── Credenciales ────────────────────────────────────────────────────────
  if (i.conexiones.length === 0) {
    items.push({
      clave: "credenciales",
      titulo: "Conexiones",
      estado: "falta",
      detalle: "El cliente no cargó ninguna conexión.",
      queHacer: "El wizard todavía no se completó, o se completó sin plataformas.",
    });
  } else {
    const fallando = i.conexiones.filter((c) => c.credencialesOk === false);
    const sinProbar = i.conexiones.filter((c) => c.credencialesOk === null);
    if (fallando.length > 0) {
      items.push({
        clave: "credenciales",
        titulo: "Conexiones",
        estado: "falta",
        detalle: `${fallando.map((c) => c.plataforma).join(", ")} no pasa${fallando.length > 1 ? "n" : ""} el test.`,
        queHacer: "Pedirle al cliente las credenciales de nuevo antes de aprobar el backfill.",
      });
    } else if (sinProbar.length > 0) {
      items.push({
        clave: "credenciales",
        titulo: "Conexiones",
        estado: "atencion",
        detalle: `${sinProbar.length} conexión(es) sin probar.`,
        queHacer: "Correr el test de credenciales desde el panel de la solicitud.",
      });
    } else {
      items.push({
        clave: "credenciales",
        titulo: "Conexiones",
        estado: "ok",
        detalle: `${i.conexiones.length} conexión(es), todas verificadas.`,
      });
    }
  }

  // ── Pixel ───────────────────────────────────────────────────────────────
  // NO bloquea: un cliente puede arrancar sólo con órdenes y poner el pixel
  // después. Pero tiene que estar a la vista, porque el wizard tiene un
  // checkbox "ya pegué el snippet" que el backend descarta — o sea que el
  // cliente puede completar el alta entero sin haberlo instalado.
  if (i.eventosDePixel === null) {
    items.push({
      clave: "pixel",
      titulo: "NitroPixel",
      estado: "atencion",
      detalle: "No se pudo consultar el estado del pixel.",
      queHacer: "Reintentar; si persiste, revisar la conexión a la base.",
    });
  } else if (i.eventosDePixel === 0) {
    items.push({
      clave: "pixel",
      titulo: "NitroPixel",
      estado: "atencion",
      detalle: "Sin eventos en las últimas 48 h.",
      queHacer:
        "El snippet no está instalado o no está en el <head>. El checkbox del wizard no verifica nada.",
    });
  } else {
    items.push({
      clave: "pixel",
      titulo: "NitroPixel",
      estado: "ok",
      detalle: `${i.eventosDePixel.toLocaleString("es-AR")} eventos en 48 h.`,
    });
  }

  // ── Webhook de órdenes de VTEX ──────────────────────────────────────────
  // ⚠️ ESTE ES EL PASO QUE MÁS SE OLVIDA Y EL QUE MÁS DUELE. Registrar el
  // afiliado de VTEX es conocimiento implícito y sin eso NO LLEGA UN SOLO
  // WEBHOOK: el cliente queda con las órdenes históricas del backfill y nada
  // nuevo. Ya rompió a TeVe Compras entero (0 de 8 órdenes atribuidas).
  const tieneVtex = i.conexiones.some((c) => c.plataforma === "VTEX");
  if (!tieneVtex) {
    items.push({
      clave: "webhook-vtex",
      titulo: "Webhook de órdenes VTEX",
      estado: "no-aplica",
      detalle: "El cliente no tiene VTEX.",
    });
  } else if (i.webhookVtexRegistrado === null) {
    items.push({
      clave: "webhook-vtex",
      titulo: "Webhook de órdenes VTEX",
      estado: "atencion",
      detalle: "Sin verificar.",
      queHacer:
        "Confirmar el Orders Broadcaster con ?org=<orgId>. Sin esto no llega ninguna orden nueva.",
    });
  } else if (!i.webhookVtexRegistrado) {
    items.push({
      clave: "webhook-vtex",
      titulo: "Webhook de órdenes VTEX",
      estado: "falta",
      detalle: "No está registrado.",
      queHacer:
        "POST /api/orders/hook/config con ?org=<orgId> en la URL. Es API-only, no hay UI en VTEX.",
    });
  } else {
    items.push({
      clave: "webhook-vtex",
      titulo: "Webhook de órdenes VTEX",
      estado: "ok",
      detalle: "Registrado.",
    });
  }

  // ── Backfill ────────────────────────────────────────────────────────────
  if (i.jobs.total === 0) {
    items.push({
      clave: "backfill",
      titulo: "Backfill",
      estado: "falta",
      detalle: "No hay ningún job creado.",
      queHacer: "Aprobar el backfill, o revisar por qué no se creó ninguno.",
    });
  } else if (i.jobs.fallados > 0) {
    items.push({
      clave: "backfill",
      titulo: "Backfill",
      estado: "falta",
      detalle: `${i.jobs.fallados} de ${i.jobs.total} job(s) fallaron.`,
      queHacer: "Mirar `lastError` del job. Si son credenciales, corregir y volver a encolar.",
    });
  } else if (i.jobs.pendientes > 0) {
    items.push({
      clave: "backfill",
      titulo: "Backfill",
      estado: "atencion",
      detalle: `${i.jobs.completos} de ${i.jobs.total} completos.`,
      queHacer: "Todavía está corriendo. Si no avanza hace horas, revisar el control de admisión.",
    });
  } else {
    items.push({
      clave: "backfill",
      titulo: "Backfill",
      estado: "ok",
      detalle: `${i.jobs.total} job(s) completos.`,
    });
  }

  // ── Órdenes ─────────────────────────────────────────────────────────────
  // Es la comprobación de que el backfill sirvió para algo: un backfill que
  // "completa" sin traer una sola orden es indistinguible de uno exitoso si
  // sólo se mira el estado de los jobs.
  if (i.ordenes === null) {
    items.push({
      clave: "ordenes",
      titulo: "Órdenes",
      estado: "atencion",
      detalle: "No se pudo consultar.",
    });
  } else if (i.ordenes === 0) {
    items.push({
      clave: "ordenes",
      titulo: "Órdenes",
      estado: "falta",
      detalle: "El cliente no tiene ni una orden.",
      queHacer:
        "El backfill no trajo nada. Revisar credenciales, el rango de fechas y que la cuenta tenga ventas en ese período.",
    });
  } else {
    items.push({
      clave: "ordenes",
      titulo: "Órdenes",
      estado: "ok",
      detalle: `${i.ordenes.toLocaleString("es-AR")} órdenes.`,
    });
  }

  const bloqueantes = items.filter(
    (it) => it.estado === "falta" && BLOQUEANTES.has(it.clave),
  ).length;

  return { listo: bloqueantes === 0, bloqueantes, items };
}
