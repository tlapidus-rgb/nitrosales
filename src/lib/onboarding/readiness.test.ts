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
  costos: { productos: 1200, conCosto: 1150 },
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

  it("cuando se verificó, dice CUÁL de los cuatro problemas es", () => {
    // E-33: `false` tiene cuatro causas que se arreglan distinto — no hay hook,
    // le falta el `?org=`, lleva el org de OTRO cliente, o apunta a otro lado.
    // Un "no está registrado" a secas manda a la persona a adivinar.
    const r = evaluarReadiness({
      ...todoBien,
      webhookVtexRegistrado: false,
      webhookVtexDetalle: "El hook está mandando las órdenes a la organización orgX, que NO es la suya.",
    });
    const w = item(r, "webhook-vtex");
    expect(w.estado).toBe("falta");
    expect(w.detalle).toContain("orgX");
    expect(w.queHacer).toContain("orgX");
  });

  it("y sin detalle cae a la instrucción genérica de siempre", () => {
    const r = evaluarReadiness({ ...todoBien, webhookVtexRegistrado: false });
    expect(item(r, "webhook-vtex").queHacer).toContain("/api/orders/hook/config");
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

describe("los precios de costo — E-33", () => {
  // La cadena existe y está enchufada: post-backfill-finalize corre
  // catalog-refresh, que pide los costos a la Pricing API de VTEX, y después
  // backfill-orderitem-costs los copia a las órdenes. Pero nadie miraba si
  // trajo algo — `catalog-refresh` devuelve un `withCost` que no lee nadie.
  //
  // Desde E-25 el margen se esconde cuando no hay costos, así que el admin ve
  // "Sin datos" y necesita saber por qué.

  it("ningún producto con costo: sale marcado", () => {
    const r = evaluarReadiness({ ...todoBien, costos: { productos: 800, conCosto: 0 } });
    const c = item(r, "costos");
    expect(c.estado).toBe("falta");
    expect(c.detalle).toContain("800");
  });

  it("y nombra la causa que NO se adivina: el permiso de Pricing en VTEX", () => {
    // Es un rol aparte del de Catalog. Sin él, el costo no viaja y el resto del
    // catálogo sí — o sea que parece que anduvo.
    const r = evaluarReadiness({ ...todoBien, costos: { productos: 800, conCosto: 0 } });
    expect(item(r, "costos").queHacer).toMatch(/pricing/i);
    expect(item(r, "costos").queHacer).toContain("catalog-refresh");
  });

  it("NO bloquea: un cliente puede cargar los costos después", () => {
    const r = evaluarReadiness({ ...todoBien, costos: { productos: 800, conCosto: 0 } });
    expect(r.listo).toBe(true);
  });

  it("cobertura parcial avisa que el margen es mejor que el real", () => {
    const r = evaluarReadiness({ ...todoBien, costos: { productos: 1000, conCosto: 300 } });
    const c = item(r, "costos");
    expect(c.estado).toBe("atencion");
    expect(c.detalle).toContain("30%");
    expect(c.queHacer).toContain("mejor que el real");
  });

  it("sin productos no aplica: no hay nada que costear", () => {
    const r = evaluarReadiness({ ...todoBien, costos: { productos: 0, conCosto: 0 } });
    expect(item(r, "costos").estado).toBe("no-aplica");
  });

  it("no se pudo consultar no es un verde", () => {
    const r = evaluarReadiness({ ...todoBien, costos: null });
    expect(item(r, "costos").estado).toBe("atencion");
  });

  it("con la mayoría cargada está en verde", () => {
    const r = evaluarReadiness({ ...todoBien, costos: { productos: 1000, conCosto: 900 } });
    expect(item(r, "costos").estado).toBe("ok");
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
  it("siempre devuelve los seis items", () => {
    const r = evaluarReadiness(todoBien);
    expect(r.items.map((i) => i.clave).sort()).toEqual(
      ["backfill", "costos", "credenciales", "ordenes", "pixel", "webhook-vtex"].sort(),
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
