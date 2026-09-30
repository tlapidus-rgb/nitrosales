import { describe, it, expect } from "vitest";
import { evaluarChecklist, MIGRACIONES_REQUERIDAS } from "./checklist";
import type { InsumosDelChecklist } from "./checklist";

const esquemaCompleto = Object.fromEntries(
  MIGRACIONES_REQUERIDAS.map((m) => [m.clave, true]),
) as InsumosDelChecklist["esquema"];
const permisosCompletos = Object.fromEntries(
  MIGRACIONES_REQUERIDAS.filter((m) => m.permisos).map((m) => [m.clave, true]),
) as InsumosDelChecklist["permisos"];

// ══════════════════════════════════════════════════════════════════════════
// E-33 — las cuatro acciones manuales del merge
// ══════════════════════════════════════════════════════════════════════════
// Eran una tabla en un documento: cuatro oportunidades de olvido y ninguna
// forma de saber después si se hicieron. Las cuatro dejan features apagadas
// **en silencio** — ninguna rompe nada, que es justamente el problema.
// ══════════════════════════════════════════════════════════════════════════

const todoHecho: InsumosDelChecklist = {
  tablaDeCursores: true,
  alertas: { destinatarios: 3, esElFallback: false },
  ventana: { estado: "ok" },
  historiaGold: { source: 400, channel: 400 },
  ventanasDeRotacionAbiertas: { adminKey: false, webhook: false },
  esquema: esquemaCompleto,
  permisos: permisosCompletos,
};

const paso = (r: ReturnType<typeof evaluarChecklist>, clave: string) =>
  r.pasos.find((p) => p.clave === clave)!;

describe("el caso feliz", () => {
  it("con todo hecho, listo", () => {
    const r = evaluarChecklist(todoHecho);
    expect(r.listo).toBe(true);
    expect(r.pendientes).toBe(0);
    expect(r.pasos.every((p) => p.estado === "ok")).toBe(true);
  });

  it("todo paso que no está en verde dice qué hacer", () => {
    const r = evaluarChecklist({
      tablaDeCursores: false,
      alertas: { destinatarios: 1, esElFallback: true },
      ventana: { estado: "sin-configurar" },
      historiaGold: { source: 2, channel: 1 },
      ventanasDeRotacionAbiertas: { adminKey: false, webhook: false },
      esquema: esquemaCompleto,
      permisos: permisosCompletos,
    });
    for (const p of r.pasos) {
      if (p.estado !== "ok" && p.estado !== "no-se-sabe") {
        expect(p.queHacer, `${p.clave} no dice qué hacer`).toBeTruthy();
      }
    }
  });
});

describe("la tabla de cursores", () => {
  it("sin migrar, sale marcada con el endpoint exacto", () => {
    const r = evaluarChecklist({ ...todoHecho, tablaDeCursores: false });
    const p = paso(r, "cron-cursors");
    expect(p.estado).toBe("falta");
    expect(p.queHacer).toContain("/api/admin/migrate-cron-cursors");
  });

  it("y aclara que no rompe nada, para que nadie entre en pánico", () => {
    // Degrada sin romper: sin la tabla los crons arrancan de cero, que es el
    // comportamiento anterior a E-11. Es silencioso, no urgente.
    const r = evaluarChecklist({ ...todoHecho, tablaDeCursores: false });
    expect(paso(r, "cron-cursors").queHacer).toMatch(/no rompe nada|comportamiento anterior/i);
  });
});

describe("los destinatarios de alertas", () => {
  it("EL PROBLEMA: sin configurar 'funciona' igual, porque cae al fallback", () => {
    // `destinatariosDeAlertas` nunca devuelve vacío. O sea que nada falla y
    // todas las alertas van a una sola casilla — hay que preguntarlo
    // explícitamente para enterarse.
    const r = evaluarChecklist({
      ...todoHecho,
      alertas: { destinatarios: 1, esElFallback: true },
    });
    expect(paso(r, "alertas-emails").estado).toBe("falta");
  });

  it("configurados, en verde con el conteo", () => {
    const r = evaluarChecklist({
      ...todoHecho,
      alertas: { destinatarios: 3, esElFallback: false },
    });
    const p = paso(r, "alertas-emails");
    expect(p.estado).toBe("ok");
    expect(p.detalle).toContain("3");
  });

  it("es de Vercel: el checklist no puede setearla", () => {
    expect(paso(evaluarChecklist(todoHecho), "alertas-emails").automatizable).toBe(false);
  });
});

describe("la ventana del backfill — tres estados, no dos", () => {
  it("sin configurar es una decisión válida: la ventana es opt-in", () => {
    const r = evaluarChecklist({ ...todoHecho, ventana: { estado: "sin-configurar" } });
    const p = paso(r, "backfill-ventana");
    expect(p.estado).toBe("falta");
    expect(p.queHacer).toContain("opcional");
  });

  it("EL CASO QUE IMPORTA: mal escrita es alguien que cree que la configuró", () => {
    // Para el backfill "sin configurar" y "mal escrita" son lo mismo: corre a
    // cualquier hora. Para quien revisa el sistema son opuestas.
    const r = evaluarChecklist({
      ...todoHecho,
      ventana: { estado: "mal-escrita", valor: "01:00-07:00", motivo: "no tiene el formato esperado" },
    });
    const p = paso(r, "backfill-ventana");
    expect(p.estado).toBe("mal");
    expect(p.detalle).toContain("01:00-07:00");
    expect(p.detalle).toContain("CUALQUIER HORA");
    expect(p.queHacer).toContain("`1-7`");
  });

  it("bien escrita, en verde", () => {
    expect(paso(evaluarChecklist(todoHecho), "backfill-ventana").estado).toBe("ok");
  });
});

describe("la historia de las tablas Gold", () => {
  it("sin historia más allá de la ventana incremental, el ?full=1 no corrió", () => {
    const r = evaluarChecklist({ ...todoHecho, historiaGold: { source: 3, channel: 2 } });
    const p = paso(r, "gold-full");
    expect(p.estado).toBe("falta");
    expect(p.detalle).toContain("gold_attribution_source");
    expect(p.detalle).toContain("gold_attribution_channel");
    expect(p.queHacer).toContain("full=1");
  });

  it("con una sola sin historia, nombra a esa", () => {
    const r = evaluarChecklist({ ...todoHecho, historiaGold: { source: 400, channel: 1 } });
    const p = paso(r, "gold-full");
    expect(p.estado).toBe("falta");
    expect(p.detalle).toContain("gold_attribution_channel");
    expect(p.detalle).not.toContain("gold_attribution_source");
  });

  it("justo en el borde de la ventana todavía cuenta como sin correr", () => {
    // 4 días es exactamente la ventana incremental: eso lo llena el cron solo.
    const r = evaluarChecklist({ ...todoHecho, historiaGold: { source: 4, channel: 4 } });
    expect(paso(r, "gold-full").estado).toBe("falta");
  });

  it("con historia larga, en verde", () => {
    expect(paso(evaluarChecklist(todoHecho), "gold-full").estado).toBe("ok");
  });
});

describe("lo que no se pudo consultar no se inventa", () => {
  it("no cuenta como pendiente ni como hecho", () => {
    // Contarlo como pendiente daría rojo permanente donde la consulta no se
    // puede hacer; contarlo como ok sería mentir.
    const r = evaluarChecklist({
      ...todoHecho,
      tablaDeCursores: null,
      historiaGold: { source: null, channel: null },
    });
    expect(paso(r, "cron-cursors").estado).toBe("no-se-sabe");
    expect(paso(r, "gold-full").estado).toBe("no-se-sabe");
    expect(r.pendientes).toBe(0);
  });

  it("pero una tabla Gold consultable y vacía de historia sí cuenta", () => {
    const r = evaluarChecklist({ ...todoHecho, historiaGold: { source: null, channel: 1 } });
    expect(paso(r, "gold-full").estado).toBe("falta");
  });
});

describe("el resultado es completo y estable", () => {
  it("con la rotación cerrada, la ventana no aparece como paso", () => {
    // Sólo se reporta cuando hay algo que hacer: un paso que siempre dice "ok"
    // entrena a no mirarlo.
    expect(evaluarChecklist(todoHecho).pasos.map((p) => p.clave)).not.toContain("ventana-rotacion");
  });

  it("EL PASO QUE NO TIENE SINTOMA: la ventana de rotación abierta", () => {
    // Una ventana abierta para siempre es una rotación que no terminó: la clave
    // vieja sigue sirviendo y TODO FUNCIONA IGUAL, así que nada la delata.
    const r = evaluarChecklist({ ...todoHecho, ventanasDeRotacionAbiertas: { adminKey: true, webhook: false } });
    const p = r.pasos.find((x) => x.clave === "ventana-rotacion")!;
    expect(p.estado).toBe("mal");
    expect(p.detalle).toContain("todavía sirve");
    expect(r.pendientes).toBe(1);
  });

  it("siempre devuelve los cuatro pasos y una línea por migración", () => {
    const r = evaluarChecklist(todoHecho);
    expect(r.pasos.map((p) => p.clave).sort()).toEqual(
      [
        "alertas-emails",
        "backfill-ventana",
        "cron-cursors",
        "gold-full",
        ...MIGRACIONES_REQUERIDAS.map((m) => m.clave),
      ].sort(),
    );
  });

  it("dice cuáles se pueden correr desde acá y cuáles van a mano en Vercel", () => {
    // Las dos variables de entorno no se pueden automatizar: el código que
    // corre adentro de Vercel no puede escribirlas.
    const r = evaluarChecklist(todoHecho);
    expect(paso(r, "alertas-emails").automatizable).toBe(false);
    expect(paso(r, "backfill-ventana").automatizable).toBe(false);
    expect(paso(r, "cron-cursors").automatizable).toBe(true);
    expect(paso(r, "gold-full").automatizable).toBe(true);
  });

  it("pendientes coincide con los pasos que faltan o están mal", () => {
    const r = evaluarChecklist({
      tablaDeCursores: false,
      alertas: { destinatarios: 1, esElFallback: true },
      ventana: { estado: "mal-escrita", valor: "x", motivo: "y" },
      historiaGold: { source: 400, channel: 400 },
      ventanasDeRotacionAbiertas: { adminKey: false, webhook: false },
      esquema: esquemaCompleto,
      permisos: permisosCompletos,
    });
    expect(r.pendientes).toBe(3);
    expect(r.listo).toBe(false);
  });
});

describe("las DOS ventanas de rotación — son secretos distintos", () => {
  const conVentanas = (adminKey: boolean, webhook: boolean) =>
    evaluarChecklist({ ...todoHecho, ventanasDeRotacionAbiertas: { adminKey, webhook } });

  it("la del webhook aparece sola, sin arrastrar la de admin", () => {
    const claves = conVentanas(false, true).pasos.map((p) => p.clave);
    expect(claves).toContain("ventana-rotacion-webhook");
    expect(claves).not.toContain("ventana-rotacion");
  });

  it("y la de admin aparece sola, sin arrastrar la del webhook", () => {
    const claves = conVentanas(true, false).pasos.map((p) => p.clave);
    expect(claves).toContain("ventana-rotacion");
    expect(claves).not.toContain("ventana-rotacion-webhook");
  });

  it("con las dos abiertas, cuentan como DOS pendientes", () => {
    const r = conVentanas(true, true);
    expect(r.pendientes).toBe(2);
    expect(r.listo).toBe(false);
  });

  it("con las dos cerradas, ninguna aparece", () => {
    const claves = conVentanas(false, false).pasos.map((p) => p.clave);
    expect(claves).not.toContain("ventana-rotacion");
    expect(claves).not.toContain("ventana-rotacion-webhook");
  });

  it("EL RIESGO PROPIO DEL WEBHOOK: avisa que cerrarla antes de tiempo cuesta órdenes", () => {
    // La de admin se cierra y, si te apuraste, un cron devuelve 403 y reintenta.
    // La del webhook se cierra y VTEX se come un 401 SIN reintentar: esa orden
    // no entra en tiempo real. Por eso el "qué hacer" no puede ser el mismo.
    const p = conVentanas(false, true).pasos.find((x) => x.clave === "ventana-rotacion-webhook")!;
    expect(p.queHacer).toMatch(/no reintenta/i);
    expect(p.queHacer).toContain("verificar-webhook-vtex");
    expect(p.automatizable).toBe(false);
  });
});

describe("R-17 — no saber no es estar listo", () => {
  // El comentario del módulo decía, textualmente, que `no-se-sabe` no cuenta
  // *ni como pendiente ni como listo*. El código hacía `listo: pendientes === 0`
  // y `pendientes` sólo suma `falta` y `mal` — o sea que el "no sé" contaba
  // **como listo**.
  //
  // El escenario que importa es justo ése: la base no responde, no se puede
  // verificar nada, y el checklist contesta que se puede mergear.
  it("con la tabla de cursores sin consultar, NO dice listo", () => {
    const r = evaluarChecklist({
      tablaDeCursores: null, // null = no se pudo consultar
      alertas: { destinatarios: 2, esElFallback: false },
      ventana: { estado: "ok", valor: "02-08" },
      historiaGold: { source: 400, channel: 400 },
      ventanasDeRotacionAbiertas: { adminKey: false, webhook: false },
    } as any);

    expect(r.sinSaber, "el paso quedó sin verificar").toBeGreaterThan(0);
    expect(r.listo, "no saber no es estar listo").toBe(false);
  });

  it("`pendientes` y `sinSaber` son cosas distintas", () => {
    // No saber NO infla el contador de pendientes: eso daría rojo permanente
    // en un entorno donde la consulta no se puede hacer, que es justo lo que
    // el módulo quería evitar. Son dos números separados a propósito.
    const r = evaluarChecklist({
      tablaDeCursores: null,
      alertas: { destinatarios: 2, esElFallback: false },
      ventana: { estado: "ok", valor: "02-08" },
      historiaGold: { source: 400, channel: 400 },
      ventanasDeRotacionAbiertas: { adminKey: false, webhook: false },
    } as any);

    expect(r.pendientes).toBe(0);
    expect(r.sinSaber).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Las migraciones de las que depende el código
// ══════════════════════════════════════════════════════════════════════════
// Los otros pasos degradan en silencio. Éstos no: sin ellos el código nuevo
// falla en el minuto del deploy (sin órdenes de MercadoLibre, sin backfills,
// sin panel de creadores). El checklist decía `listo: true` sin mirarlos.
// ══════════════════════════════════════════════════════════════════════════
describe("las migraciones de las que depende el código", () => {
  const sinUna = (clave: string) => ({
    ...todoHecho,
    esquema: { ...esquemaCompleto, [clave]: false },
  });

  it("son las cinco que agregó la branch, con su archivo", () => {
    expect(MIGRACIONES_REQUERIDAS.map((m) => m.archivo).sort()).toEqual(
      [
        "prisma/migrations/backfill_enrichment_version.sql",
        "prisma/migrations/backfill_job_lease.sql",
        "prisma/migrations/creator_password_attempts.sql",
        "prisma/migrations/ml_reconcile_progress.sql",
        "prisma/migrations/ml_sync_progress.sql",
      ].sort(),
    );
  });

  it.each(MIGRACIONES_REQUERIDAS.map((m) => m.clave))(
    "EL BUG: con %s sin correr, NO dice listo",
    (clave) => {
      const r = evaluarChecklist(sinUna(clave));
      expect(r.listo).toBe(false);
      expect(r.pendientes).toBe(1);
      expect(paso(r, clave).estado).toBe("falta");
    },
  );

  it("cada una dice qué archivo correr y qué se rompe si no", () => {
    for (const m of MIGRACIONES_REQUERIDAS) {
      const p = paso(evaluarChecklist(sinUna(m.clave)), m.clave);
      expect(p.queHacer, m.clave).toContain(m.archivo);
      expect(p.queHacer, m.clave).toMatch(/antes del merge/i);
      expect(p.detalle.length, m.clave).toBeGreaterThan(40);
    }
  });

  it("la de órdenes nombra a MercadoLibre, que es lo que se corta", () => {
    const p = paso(evaluarChecklist(sinUna("mig-orders-enrichment")), "mig-orders-enrichment");
    expect(p.detalle).toMatch(/MercadoLibre/);
  });

  it("se distinguen de los pasos silenciosos: rompen producción", () => {
    const r = evaluarChecklist(todoHecho);
    for (const m of MIGRACIONES_REQUERIDAS) expect(paso(r, m.clave).rompeProduccion).toBe(true);
    expect(paso(r, "cron-cursors").rompeProduccion).toBeFalsy();
  });

  it("van primero: son lo que hay que mirar antes que nada", () => {
    const r = evaluarChecklist(todoHecho);
    const claves = MIGRACIONES_REQUERIDAS.map((m) => m.clave as string);
    expect(r.pasos.slice(0, claves.length).map((p) => p.clave)).toEqual(claves);
  });

  it("las corre una persona en Neon, no el código", () => {
    const r = evaluarChecklist(todoHecho);
    for (const m of MIGRACIONES_REQUERIDAS) expect(paso(r, m.clave).automatizable).toBe(false);
  });

  it("no poder consultarla no es estar listo", () => {
    const r = evaluarChecklist({
      ...todoHecho,
      esquema: { ...esquemaCompleto, "mig-backfill-lease": null },
    });
    expect(paso(r, "mig-backfill-lease").estado).toBe("no-se-sabe");
    expect(r.listo).toBe(false);
    expect(r.pendientes).toBe(0);
  });

  it("si al insumo le falta una clave, tampoco se inventa que está", () => {
    const { ["mig-ml-sync-progress"]: _omitida, ...incompleto } = esquemaCompleto;
    const r = evaluarChecklist({ ...todoHecho, esquema: incompleto as any });
    expect(paso(r, "mig-ml-sync-progress").estado).toBe("no-se-sabe");
    expect(r.listo).toBe(false);
  });

  it("sin el insumo entero, no revienta: todo queda sin saber", () => {
    const { esquema: _e, permisos: _p, ...viejo } = todoHecho;
    const r = evaluarChecklist(viejo as any);
    expect(r.listo).toBe(false);
    for (const m of MIGRACIONES_REQUERIDAS) expect(paso(r, m.clave).estado).toBe("no-se-sabe");
  });
});

describe("los permisos sobre las tablas nuevas", () => {
  // Las tres tablas nuevas las crea una persona desde la consola, con un rol que
  // puede no ser el de la app. Existir no alcanza: si la app no las puede
  // escribir, falla igual. Y volver a correr la migración no lo arregla.
  const conPermiso = (clave: string, valor: boolean | null) => ({
    ...todoHecho,
    permisos: { ...permisosCompletos, [clave]: valor },
  });

  it("se miran en las tres tablas nuevas, no sólo en una", () => {
    expect(MIGRACIONES_REQUERIDAS.filter((m) => m.permisos).map((m) => m.tabla).sort()).toEqual(
      ["creator_password_attempts", "ml_reconcile_progress", "ml_sync_progress"],
    );
  });

  it.each(["mig-ml-sync-progress", "mig-ml-reconcile-progress", "mig-creator-password-attempts"])(
    "%s creada pero sin permisos: está mal, no ok, y no manda a re-correr la migración",
    (clave) => {
      const r = evaluarChecklist(conPermiso(clave, false));
      const p = paso(r, clave);
      expect(p.estado).toBe("mal");
      expect(p.queHacer).toMatch(/^Dar SELECT, INSERT, UPDATE/);
      expect(p.queHacer).toMatch(/no arregla/);
      expect(r.listo).toBe(false);
    },
  );

  it("la de creadores pide también DELETE: la limpieza borra", () => {
    const p = paso(evaluarChecklist(conPermiso("mig-creator-password-attempts", false)), "mig-creator-password-attempts");
    expect(p.queHacer).toContain("DELETE");
  });

  it("sin poder consultar los permisos, no se sabe", () => {
    const r = evaluarChecklist(conPermiso("mig-ml-reconcile-progress", null));
    expect(paso(r, "mig-ml-reconcile-progress").estado).toBe("no-se-sabe");
    expect(r.listo).toBe(false);
  });

  it("las columnas sobre tablas que la app ya usa no dependen de permisos", () => {
    // Heredan los de la tabla: no hay nada que mirar, y un `null` ahí no puede
    // dejar el paso en "no se sabe".
    const r = evaluarChecklist({ ...todoHecho, permisos: {} });
    expect(paso(r, "mig-orders-enrichment").estado).toBe("ok");
    expect(paso(r, "mig-backfill-lease").estado).toBe("ok");
    expect(paso(r, "mig-ml-sync-progress").estado).toBe("no-se-sabe");
  });

  it("si la tabla no existe, manda correr la migración (lo de los permisos viene después)", () => {
    const r = evaluarChecklist({
      ...todoHecho,
      esquema: { ...esquemaCompleto, "mig-creator-password-attempts": false },
      permisos: { ...permisosCompletos, "mig-creator-password-attempts": null },
    });
    expect(paso(r, "mig-creator-password-attempts").estado).toBe("falta");
  });
});
