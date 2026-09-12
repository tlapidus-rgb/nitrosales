// ══════════════════════════════════════════════════════════════════════════
// src/lib/merge/checklist.ts — las acciones manuales del merge, verificadas
// ══════════════════════════════════════════════════════════════════════════
// E-33. Al mergear la branch del plan hay cuatro cosas que hay que hacer a mano
// y que, si no se hacen, **dejan features apagadas en silencio**. Hoy son una
// tabla en un documento, o sea cuatro oportunidades de olvido y ninguna forma
// de saber después si se hicieron.
//
// ── POR QUÉ ESTO VERIFICA Y NO EJECUTA ───────────────────────────────────
// La ficha del plan decía "un endpoint que las corra y las verifique". Correrlas
// no se puede, y no por una limitación técnica: **dos de las cuatro son
// variables de entorno de Vercel**, y el código que corre adentro de Vercel no
// puede escribirlas. Sólo puede mirar si están.
//
// Las otras dos sí se podrían ejecutar —una migración y dos backfills Gold— y
// deliberadamente no se ejecutan desde acá. `CLAUDE.md` tiene una regla entera
// sobre cambios en producción que pide dry-run, backup y rollback preparado;
// un botón que corre una migración y dos escaneos pesados de un saque es
// exactamente lo que esa regla existe para evitar.
//
// Lo que sí resuelve el problema: **no se puede olvidar lo que una pantalla te
// dice.** Cuatro líneas en verde o en rojo se revisan en cinco segundos, y
// después del merge siguen contestando si alguien se olvidó de algo.
// ══════════════════════════════════════════════════════════════════════════

export type EstadoDelPaso = "ok" | "falta" | "mal" | "no-se-sabe";

export type PasoDelMerge = {
  clave: string;
  titulo: string;
  estado: EstadoDelPaso;
  detalle: string;
  /** Qué hacer. Vacío cuando está OK. */
  queHacer?: string;
  /** `true` si se puede correr desde acá; `false` si es de Vercel y va a mano. */
  automatizable: boolean;
};

export type InsumosDelChecklist = {
  /** ¿Existe la tabla `cron_cursors`? `null` = no se pudo consultar. */
  tablaDeCursores: boolean | null;
  /** Destinatarios de alertas configurados, y si son el fallback histórico. */
  alertas: { destinatarios: number; esElFallback: boolean };
  /** Estado de `BACKFILL_VENTANA`. */
  ventana: { estado: "sin-configurar" | "ok" | "mal-escrita"; valor?: string; motivo?: string };
  /**
   * Días de historia que tienen las dos tablas Gold de atribución.
   * `null` = no se pudo consultar. La ventana incremental es de 4 días, así que
   * si la historia no pasa de ahí, el `?full=1` no se corrió.
   */
  historiaGold: { source: number | null; channel: number | null };
  /**
   * Si quedó abierta una ventana de rotación de clave
   * (`ADMIN_API_KEY_ANTERIOR` seteada).
   *
   * Una ventana que queda abierta para siempre es una rotación que no
   * terminó: la clave vieja sigue sirviendo para entrar y **no hay ningún
   * síntoma** — todo funciona. Es el paso que más fácil se olvida.
   */
  ventanaDeRotacionAbierta: boolean;
};

/** La ventana incremental de los crons Gold de atribución, en días. */
const VENTANA_INCREMENTAL_DIAS = 4;

export function evaluarChecklist(i: InsumosDelChecklist): {
  listo: boolean;
  pendientes: number;
  pasos: PasoDelMerge[];
} {
  const pasos: PasoDelMerge[] = [];

  // ── 1. La tabla de cursores ─────────────────────────────────────────────
  // Va ANTES del merge del código que la usa, como manda el orden de
  // migraciones de CLAUDE.md. Degrada sin romper: sin la tabla, el store
  // devuelve null y los crons arrancan de cero, que es el comportamiento de
  // hoy. Por eso no es urgente, pero sí es silencioso.
  if (i.tablaDeCursores === null) {
    pasos.push({
      clave: "cron-cursors",
      titulo: "Tabla de cursores de crons",
      estado: "no-se-sabe",
      detalle: "No se pudo consultar el esquema.",
      automatizable: true,
    });
  } else if (!i.tablaDeCursores) {
    pasos.push({
      clave: "cron-cursors",
      titulo: "Tabla de cursores de crons",
      estado: "falta",
      detalle: "La tabla `cron_cursors` no existe.",
      queHacer:
        "POST /api/admin/migrate-cron-cursors. Sin ella los crons vuelven a arrancar " +
        "de cero cada vez y a algunos clientes no les corre nunca. No rompe nada: " +
        "es exactamente el comportamiento anterior a E-11.",
      automatizable: true,
    });
  } else {
    pasos.push({
      clave: "cron-cursors",
      titulo: "Tabla de cursores de crons",
      estado: "ok",
      detalle: "La tabla existe.",
      automatizable: true,
    });
  }

  // ── 2. Destinatarios de alertas ─────────────────────────────────────────
  // `destinatariosDeAlertas` nunca devuelve vacío: cae a la casilla histórica.
  // O sea que "funciona" igual sin configurar, y por eso hay que preguntarlo
  // explícitamente — el modo de falla es que las alertas sigan yendo a una sola
  // casilla y nadie se entere hasta que esa casilla las mande a spam.
  if (i.alertas.esElFallback) {
    pasos.push({
      clave: "alertas-emails",
      titulo: "Destinatarios de alertas",
      estado: "falta",
      detalle: "Sin configurar: todas las alertas van a la casilla histórica, una sola.",
      queHacer:
        "Poner ALERTAS_EMAILS en Vercel, separadas por coma. Si esa única casilla " +
        "manda los mails a spam, el sistema pierde su único sentido de la vista, y " +
        "el modo de falla no es 'llegan tarde' sino 'no llega ninguna y nadie sabe " +
        "que dejaron de llegar'.",
      automatizable: false,
    });
  } else {
    pasos.push({
      clave: "alertas-emails",
      titulo: "Destinatarios de alertas",
      estado: "ok",
      detalle: `${i.alertas.destinatarios} destinatario(s) configurado(s).`,
      automatizable: false,
    });
  }

  // ── 3. Ventana del backfill ─────────────────────────────────────────────
  // Tres estados, no dos, y la diferencia importa: "sin configurar" es una
  // decisión válida (la ventana es opt-in), "mal escrita" es alguien que cree
  // que la configuró y no la configuró.
  if (i.ventana.estado === "mal-escrita") {
    pasos.push({
      clave: "backfill-ventana",
      titulo: "Ventana horaria del backfill",
      estado: "mal",
      detalle: `BACKFILL_VENTANA="${i.ventana.valor}" ${i.ventana.motivo}. Se ignora y el backfill corre A CUALQUIER HORA.`,
      queHacer:
        "El formato son horas enteras 0-23: `1-7`, NO `01:00-07:00`. Alguien la " +
        "configuró creyendo que quedaba activa y no quedó.",
      automatizable: false,
    });
  } else if (i.ventana.estado === "sin-configurar") {
    pasos.push({
      clave: "backfill-ventana",
      titulo: "Ventana horaria del backfill",
      estado: "falta",
      detalle: "Sin configurar: el backfill puede arrancar a cualquier hora.",
      queHacer:
        "Poner BACKFILL_VENTANA=1-7 en Vercel si se quiere que los backfills pesados " +
        "corran de madrugada. Es opcional: los otros dos frenos (concurrencia y " +
        "latencia) están activos solos.",
      automatizable: false,
    });
  } else {
    pasos.push({
      clave: "backfill-ventana",
      titulo: "Ventana horaria del backfill",
      estado: "ok",
      detalle: "Configurada y bien escrita.",
      automatizable: false,
    });
  }

  // ── 4. Backfill histórico de las tablas Gold ────────────────────────────
  // Se detecta por la historia: si la tabla no tiene datos más viejos que la
  // ventana incremental, el `?full=1` nunca corrió.
  const gold = [
    { clave: "gold-source", nombre: "gold_attribution_source", dias: i.historiaGold.source },
    { clave: "gold-channel", nombre: "gold_attribution_channel", dias: i.historiaGold.channel },
  ];
  const sinHistoria = gold.filter((g) => g.dias !== null && g.dias <= VENTANA_INCREMENTAL_DIAS);
  const desconocidas = gold.filter((g) => g.dias === null);

  if (desconocidas.length === gold.length) {
    pasos.push({
      clave: "gold-full",
      titulo: "Historia de las tablas Gold",
      estado: "no-se-sabe",
      detalle: "No se pudieron consultar.",
      automatizable: true,
    });
  } else if (sinHistoria.length > 0) {
    pasos.push({
      clave: "gold-full",
      titulo: "Historia de las tablas Gold",
      estado: "falta",
      detalle: `${sinHistoria.map((g) => g.nombre).join(" y ")} no tiene${sinHistoria.length > 1 ? "n" : ""} datos más viejos que la ventana incremental de ${VENTANA_INCREMENTAL_DIAS} días.`,
      queHacer:
        "Correr una vez `?full=1&key=<ADMIN_API_KEY>` en /api/cron/refresh-gold-attribution " +
        "y en /api/cron/refresh-gold-attribution-channel. Sin eso las tablas arrancan " +
        "sólo con la ventana reciente y el panel muestra menos historia de la que hay.",
      automatizable: true,
    });
  } else {
    pasos.push({
      clave: "gold-full",
      titulo: "Historia de las tablas Gold",
      estado: "ok",
      detalle: `Las dos tienen historia más allá de la ventana incremental.`,
      automatizable: true,
    });
  }

  // ── 5. La ventana de rotación de clave ─────────────────────────────────
  if (i.ventanaDeRotacionAbierta) {
    pasos.push({
      clave: "ventana-rotacion",
      titulo: "Ventana de rotación de clave",
      estado: "mal",
      detalle:
        "`ADMIN_API_KEY_ANTERIOR` sigue seteada: la clave VIEJA todavía sirve para entrar.",
      queHacer:
        "Si la rotación ya terminó —URLs de vercel.json y del webhook de VTEX actualizadas " +
        "y verificadas— borrá esa variable en Vercel. Mientras siga, la rotación no cerró y " +
        "no hay ningún síntoma que lo delate: todo funciona igual.",
      automatizable: false,
    });
  }

  // "no-se-sabe" NO cuenta como pendiente ni como listo: es lo que hay que ir a
  // mirar a mano. Contarlo como pendiente daría rojo permanente en un entorno
  // donde la consulta no se puede hacer; contarlo como ok sería inventar.
  const pendientes = pasos.filter((p) => p.estado === "falta" || p.estado === "mal").length;
  return { listo: pendientes === 0, pendientes, pasos };
}
