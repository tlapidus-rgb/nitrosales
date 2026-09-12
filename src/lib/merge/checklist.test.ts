import { describe, it, expect } from "vitest";
import { evaluarChecklist } from "./checklist";
import type { InsumosDelChecklist } from "./checklist";

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
  ventanaDeRotacionAbierta: false,
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
      ventanaDeRotacionAbierta: false,
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
    const r = evaluarChecklist({ ...todoHecho, ventanaDeRotacionAbierta: true });
    const p = r.pasos.find((x) => x.clave === "ventana-rotacion")!;
    expect(p.estado).toBe("mal");
    expect(p.detalle).toContain("todavía sirve");
    expect(r.pendientes).toBe(1);
  });

  it("siempre devuelve los cuatro pasos", () => {
    const r = evaluarChecklist(todoHecho);
    expect(r.pasos.map((p) => p.clave).sort()).toEqual(
      ["alertas-emails", "backfill-ventana", "cron-cursors", "gold-full"].sort(),
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
      ventanaDeRotacionAbierta: false,
    });
    expect(r.pendientes).toBe(3);
    expect(r.listo).toBe(false);
  });
});
