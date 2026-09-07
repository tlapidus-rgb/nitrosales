import { describe, it, expect } from "vitest";
import { evaluarReadiness } from "./readiness";
import type { InsumosDeReadiness } from "./readiness";

// ══════════════════════════════════════════════════════════════════════════
// E-15 — el semáforo que faltaba
// ══════════════════════════════════════════════════════════════════════════
// No existía ningún objeto que dijera "este cliente está listo". Los insumos ya
// estaban todos escritos; faltaba el que los junta. Sin eso, habilitar a un
// cliente era "acordarse de chequear cinco cosas en cinco pantallas distintas",
// y el paso que se olvidaba no avisaba: TeVe Compras entró con 0 de 8 órdenes
// atribuidas porque nadie registró el afiliado de VTEX.
//
// Lo que se testea acá es el CRITERIO, que es la parte que hay que poder
// discutir y cambiar. La recolección de datos es aparte.
// ══════════════════════════════════════════════════════════════════════════

const todoBien: InsumosDeReadiness = {
  estadoOnboarding: "READY_FOR_REVIEW",
  conexiones: [{ plataforma: "VTEX", credencialesOk: true }],
  eventosDePixel: 12_000,
  ordenes: 4_300,
  jobs: { total: 2, completos: 2, fallados: 0, pendientes: 0 },
  webhookVtexRegistrado: true,
};

const item = (r: ReturnType<typeof evaluarReadiness>, clave: string) =>
  r.items.find((i) => i.clave === clave)!;

describe("el caso feliz", () => {
  it("un alta completa da listo", () => {
    const r = evaluarReadiness(todoBien);
    expect(r.listo).toBe(true);
    expect(r.bloqueantes).toBe(0);
    expect(r.items.every((i) => i.estado === "ok")).toBe(true);
  });

  it("todo item que no está en verde dice qué hacer", () => {
    // Un semáforo que dice "no listo" sin decir qué falta obliga a leer el
    // código, que es justo lo que esto viene a evitar.
    const r = evaluarReadiness({
      ...todoBien,
      conexiones: [{ plataforma: "VTEX", credencialesOk: false }],
      eventosDePixel: 0,
      ordenes: 0,
      jobs: { total: 1, completos: 0, fallados: 1, pendientes: 0 },
      webhookVtexRegistrado: false,
    });
    for (const i of r.items) {
      if (i.estado !== "ok" && i.estado !== "no-aplica") {
        expect(i.queHacer, `${i.clave} no dice qué hacer`).toBeTruthy();
      }
    }
  });
});

describe("lo que BLOQUEA la habilitación", () => {
  it("credenciales que no pasan el test", () => {
    const r = evaluarReadiness({
      ...todoBien,
      conexiones: [{ plataforma: "VTEX", credencialesOk: false }],
    });
    expect(r.listo).toBe(false);
    expect(item(r, "credenciales").estado).toBe("falta");
  });

  it("ningún job de backfill creado", () => {
    const r = evaluarReadiness({
      ...todoBien,
      jobs: { total: 0, completos: 0, fallados: 0, pendientes: 0 },
    });
    expect(r.listo).toBe(false);
  });

  it("un job fallado", () => {
    const r = evaluarReadiness({
      ...todoBien,
      jobs: { total: 2, completos: 1, fallados: 1, pendientes: 0 },
    });
    expect(r.listo).toBe(false);
    expect(item(r, "backfill").detalle).toContain("1 de 2");
  });

  it("cero órdenes, aunque el backfill diga completo", () => {
    // Un backfill que "completa" sin traer una sola orden es indistinguible de
    // uno exitoso si sólo se mira el estado de los jobs. Este es el chequeo que
    // los separa.
    const r = evaluarReadiness({ ...todoBien, ordenes: 0 });
    expect(r.listo).toBe(false);
    expect(item(r, "ordenes").estado).toBe("falta");
  });

  it("el cliente no cargó ninguna conexión", () => {
    const r = evaluarReadiness({ ...todoBien, conexiones: [] });
    expect(r.listo).toBe(false);
  });
});

describe("lo que NO bloquea pero tiene que verse", () => {
  it("el pixel sin eventos avisa pero no frena", () => {
    // Un cliente puede arrancar sólo con órdenes y poner el pixel después.
    // Pero tiene que estar a la vista: el checkbox "ya pegué el snippet" del
    // wizard lo descarta el backend, así que se puede completar el alta entero
    // sin haberlo instalado.
    const r = evaluarReadiness({ ...todoBien, eventosDePixel: 0 });
    expect(r.listo).toBe(true);
    expect(item(r, "pixel").estado).toBe("atencion");
    expect(item(r, "pixel").queHacer).toContain("no verifica nada");
  });

  it("conexiones sin probar avisan", () => {
    const r = evaluarReadiness({
      ...todoBien,
      conexiones: [{ plataforma: "VTEX", credencialesOk: null }],
    });
    expect(item(r, "credenciales").estado).toBe("atencion");
    expect(r.listo).toBe(true);
  });

  it("el backfill en curso avisa, no bloquea", () => {
    const r = evaluarReadiness({
      ...todoBien,
      jobs: { total: 3, completos: 1, fallados: 0, pendientes: 2 },
    });
    expect(item(r, "backfill").estado).toBe("atencion");
    expect(r.listo).toBe(true);
  });
});

describe("el webhook de VTEX — el paso que más se olvida", () => {
  it("sin registrar sale marcado, con la instrucción exacta", () => {
    // Sin esto NO LLEGA UN SOLO WEBHOOK: el cliente queda con las órdenes del
    // backfill y nada nuevo. Es API-only, no hay UI en VTEX, y es conocimiento
    // implícito — por eso la instrucción va escrita en el item.
    const r = evaluarReadiness({ ...todoBien, webhookVtexRegistrado: false });
    const w = item(r, "webhook-vtex");
    expect(w.estado).toBe("falta");
    expect(w.queHacer).toContain("/api/orders/hook/config");
    expect(w.queHacer).toContain("org=");
  });

  it("no aplica si el cliente no tiene VTEX", () => {
    const r = evaluarReadiness({
      ...todoBien,
      conexiones: [{ plataforma: "MERCADOLIBRE", credencialesOk: true }],
      webhookVtexRegistrado: null,
    });
    expect(item(r, "webhook-vtex").estado).toBe("no-aplica");
    expect(r.listo).toBe(true);
  });

  it("sin verificar avisa pero no bloquea", () => {
    const r = evaluarReadiness({ ...todoBien, webhookVtexRegistrado: null });
    expect(item(r, "webhook-vtex").estado).toBe("atencion");
    expect(r.listo).toBe(true);
  });
});

describe("cuando no se pudo consultar algo, se dice", () => {
  it("no se inventa un verde", () => {
    // Un semáforo que trata "no sé" como "está bien" es peor que no tenerlo.
    const r = evaluarReadiness({ ...todoBien, eventosDePixel: null, ordenes: null });
    expect(item(r, "pixel").estado).toBe("atencion");
    expect(item(r, "ordenes").estado).toBe("atencion");
  });
});

describe("el resultado es completo y estable", () => {
  it("siempre devuelve los cinco items", () => {
    const r = evaluarReadiness(todoBien);
    expect(r.items.map((i) => i.clave).sort()).toEqual(
      ["backfill", "credenciales", "ordenes", "pixel", "webhook-vtex"].sort(),
    );
  });

  it("bloqueantes coincide con los items que bloquean", () => {
    const r = evaluarReadiness({
      ...todoBien,
      conexiones: [{ plataforma: "VTEX", credencialesOk: false }],
      ordenes: 0,
      eventosDePixel: 0, // este NO cuenta
    });
    expect(r.bloqueantes).toBe(2);
    expect(r.listo).toBe(false);
  });
});
