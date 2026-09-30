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
//
// Después se sumaron las migraciones de las que depende el código (más abajo).
// Ésas son de otra clase: no degradan en silencio, rompen.
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
  /**
   * `true` si sin este paso el código nuevo FALLA al deployar, en vez de
   * degradar en silencio como los demás.
   */
  rompeProduccion?: boolean;
};

// ══════════════════════════════════════════════════════════════════════════
// Las migraciones de las que depende el código
// ══════════════════════════════════════════════════════════════════════════
// Los otros pasos de este checklist degradan en silencio. Éstos no: el código de
// la branch escribe estas columnas y tablas, y si no existen Postgres rechaza la
// sentencia en el minuto del deploy. El checklist decía `listo: true` sin
// mirarlos, que es justo lo que existe para evitar.
//
// Las corre una persona en la consola de Neon (la base de producción no se toca
// desde el código). Son aditivas e idempotentes y el código anterior las ignora,
// así que van ANTES del merge.
// ══════════════════════════════════════════════════════════════════════════
export const MIGRACIONES_REQUERIDAS = [
  {
    clave: "mig-orders-enrichment",
    archivo: "prisma/migrations/backfill_enrichment_version.sql",
    tabla: "orders",
    columna: "backfillEnrichedVersion",
    permisos: null,
    siFalta:
      "No entra ninguna orden de MercadoLibre: el upsert de ml-order-persistence.ts escribe " +
      "esta columna y Postgres rechaza la sentencia entera, inserts incluidos. Lo usan el " +
      "webhook, ml-missed-feeds, ml-sync, ml-reconcile y el backfill. Los webhooks que fallen " +
      "no se reprocesan: ML descarta el reenvío como duplicado.",
  },
  {
    clave: "mig-backfill-lease",
    archivo: "prisma/migrations/backfill_job_lease.sql",
    tabla: "backfill_jobs",
    columna: "leaseToken",
    permisos: null,
    siFalta:
      "Ningún backfill arranca: el claim del runner escribe esta columna. Las altas nuevas " +
      "quedan trabadas en BACKFILLING. Correrla con backfills en curso es inocuo (el código " +
      "viejo ignora la columna); lo que importa es no MERGEAR con backfills corriendo, porque " +
      "los workers viejos no respetan el lease.",
  },
  {
    clave: "mig-ml-sync-progress",
    archivo: "prisma/migrations/ml_sync_progress.sql",
    tabla: "ml_sync_progress",
    columna: null,
    permisos: ["SELECT", "INSERT", "UPDATE"],
    siFalta: "El cron ml-sync falla entero en cada corrida: lee esta tabla antes del loop por organización.",
  },
  {
    clave: "mig-ml-reconcile-progress",
    archivo: "prisma/migrations/ml_reconcile_progress.sql",
    tabla: "ml_reconcile_progress",
    columna: null,
    permisos: ["SELECT", "INSERT", "UPDATE"],
    siFalta:
      "El cron ml-reconcile falla, y con él la red de seguridad que levanta las órdenes de " +
      "MercadoLibre que el webhook no guardó.",
  },
  {
    clave: "mig-creator-password-attempts",
    archivo: "prisma/migrations/creator_password_attempts.sql",
    tabla: "creator_password_attempts",
    columna: null,
    permisos: ["SELECT", "INSERT", "UPDATE", "DELETE"],
    siFalta:
      "Ningún creador entra a su panel con contraseña: la admisión responde 503 a propósito " +
      "(falla cerrada) en verify, content y metrics.",
  },
] as const;

export type ClaveDeMigracion = (typeof MIGRACIONES_REQUERIDAS)[number]["clave"];

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
   *
   * Son **dos secretos distintos**, con dos variables distintas en Vercel y dos
   * consecuencias distintas si quedan abiertas, así que se preguntan por
   * separado: `ADMIN_API_KEY_ANTERIOR` (crons y endpoints admin) y
   * `NEXTAUTH_SECRET_ANTERIOR` (el webhook de órdenes de VTEX).
   */
  ventanasDeRotacionAbiertas: { adminKey: boolean; webhook: boolean };
  /**
   * Por cada migración requerida: ¿existe su columna o tabla? `null` = no se
   * pudo consultar. Una clave ausente cuenta como `null`: no se inventa.
   */
  esquema: Record<ClaveDeMigracion, boolean | null>;
  /**
   * Por cada migración que crea una tabla nueva: ¿el rol de la app tiene los
   * permisos que usa el código (`permisos` de la migración)? `null` = no se
   * pudo saber. Las que agregan una columna a una tabla que la app ya usa no
   * se miran: la columna hereda los permisos de la tabla.
   */
  permisos: Partial<Record<ClaveDeMigracion, boolean | null>>;
};

function pasoDeMigracion(
  m: (typeof MIGRACIONES_REQUERIDAS)[number],
  existe: boolean | null,
  permisos: boolean | null,
): PasoDelMerge {
  const objeto = m.columna ? `${m.tabla}."${m.columna}"` : m.tabla;
  const base = {
    clave: m.clave,
    titulo: `Migración ${m.archivo.split("/").pop()}`,
    automatizable: false,
    rompeProduccion: true,
  };
  if (existe === null) {
    return { ...base, estado: "no-se-sabe", detalle: `No se pudo consultar si existe ${objeto}.` };
  }
  if (!existe) {
    return {
      ...base,
      estado: "falta",
      detalle: `No existe ${objeto}. ${m.siFalta}`,
      queHacer:
        `Correr ${m.archivo} en la consola de Neon ANTES del merge. Es aditiva e ` +
        "idempotente, y el código actual la ignora: correrla antes no cambia nada.",
    };
  }
  // Las tablas nuevas las crea una persona desde la consola, y el rol con el que
  // entra puede no ser el de la app. Existir no alcanza: si la app no puede
  // escribirlas, falla igual que si no existieran. Las columnas agregadas a
  // tablas que la app ya usa heredan sus permisos.
  if (m.permisos) {
    if (permisos === null) {
      return { ...base, estado: "no-se-sabe", detalle: `${objeto} existe, pero no se pudieron consultar los permisos del rol de la app.` };
    }
    if (!permisos) {
      return {
        ...base,
        estado: "mal",
        detalle: `${objeto} existe, pero el rol de la app no tiene todos los permisos que usa el código. ${m.siFalta}`,
        queHacer:
          `Dar ${m.permisos.join(", ")} sobre ${m.tabla} al rol de la app. Volver a correr ` +
          "la migración no arregla esto: la tabla ya existe.",
      };
    }
  }
  return { ...base, estado: "ok", detalle: `${objeto} existe.` };
}

/** La ventana incremental de los crons Gold de atribución, en días. */
const VENTANA_INCREMENTAL_DIAS = 4;

export function evaluarChecklist(i: InsumosDelChecklist): {
  /**
   * `true` sólo si TODOS los pasos se pudieron verificar y están bien.
   *
   * Un paso en `no-se-sabe` lo deja en `false`: no saber no es estar listo.
   */
  listo: boolean;
  /** Pasos que faltan o están mal. */
  pendientes: number;
  /** Pasos que no se pudieron verificar. Distinto de `pendientes`. */
  sinSaber: number;
  pasos: PasoDelMerge[];
} {
  // ── 0. Las migraciones de las que depende el código ─────────────────────
  // Primero, porque son las únicas que rompen. `?.` y `?? null` porque un
  // checklist que revienta no puede reportar nada: sin el insumo, no se sabe.
  const pasos: PasoDelMerge[] = MIGRACIONES_REQUERIDAS.map((m) =>
    pasoDeMigracion(m, i.esquema?.[m.clave] ?? null, i.permisos?.[m.clave] ?? null),
  );

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

  // ── 5. Las ventanas de rotación de clave ───────────────────────────────
  // Sólo se reportan cuando hay una abierta: un paso que siempre dice "ok"
  // entrena a no mirarlo.
  if (i.ventanasDeRotacionAbiertas.adminKey) {
    pasos.push({
      clave: "ventana-rotacion",
      titulo: "Ventana de rotación de la clave admin/cron",
      estado: "mal",
      detalle:
        "`ADMIN_API_KEY_ANTERIOR` sigue seteada: la clave VIEJA todavía sirve para entrar.",
      queHacer:
        "Si la rotación ya terminó —las URLs de los crons de vercel.json actualizadas y " +
        "verificadas— borrá esa variable en Vercel. Mientras siga, la rotación no cerró y " +
        "no hay ningún síntoma que lo delate: todo funciona igual.",
      automatizable: false,
    });
  }

  if (i.ventanasDeRotacionAbiertas.webhook) {
    pasos.push({
      clave: "ventana-rotacion-webhook",
      titulo: "Ventana de rotación de la clave del webhook de VTEX",
      estado: "mal",
      detalle:
        "`NEXTAUTH_SECRET_ANTERIOR` sigue seteada: la clave VIEJA todavía sirve para " +
        "postear órdenes al webhook.",
      queHacer:
        "Cerrala recién cuando el hook de CADA cuenta VTEX esté apuntando a la clave nueva " +
        "—verificalo con `/api/admin/verificar-webhook-vtex` org por org—. Si la cerrás " +
        "antes, ese cliente empieza a devolver 401 y VTEX NO reintenta: sus órdenes dejan " +
        "de entrar en tiempo real hasta el cron de las 3am.",
      automatizable: false,
    });
  }

  // "no-se-sabe" NO cuenta como pendiente ni como listo: es lo que hay que ir a
  // mirar a mano. Contarlo como pendiente daría rojo permanente en un entorno
  // donde la consulta no se puede hacer; contarlo como ok sería inventar.
  const pendientes = pasos.filter((p) => p.estado === "falta" || p.estado === "mal").length;

  // ⚠️ …y el código decía justo lo contrario del comentario de arriba (R-17).
  //
  // `listo: pendientes === 0` cuenta el "no sé" **como listo**, porque
  // `pendientes` sólo suma `falta` y `mal`. En el escenario donde la base no
  // responde —que es cuando más importa— el checklist contestaba
  // `listo: true` sin haber podido verificar un solo paso.
  //
  // Ahora hay tres estados y ninguno se disfraza de otro: `listo` sólo es
  // `true` si TODO se pudo verificar y está bien.
  const sinSaber = pasos.filter((p) => p.estado === "no-se-sabe").length;
  return {
    listo: pendientes === 0 && sinSaber === 0,
    pendientes,
    sinSaber,
    pasos,
  };
}
