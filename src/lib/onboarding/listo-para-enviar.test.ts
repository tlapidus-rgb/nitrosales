import { describe, it, expect } from "vitest";
import { evaluarWizard } from "./listo-para-enviar";
import type { PlataformaDelWizard } from "./listo-para-enviar";

// ══════════════════════════════════════════════════════════════════════════
// E-29 — el wizard decia 100% y el backend decia 400
// ══════════════════════════════════════════════════════════════════════════
// La barra contaba cada plataforma SALTEADA como "decidida", asi que saltear
// las seis daba 100% en verde con el boton habilitado. Al apretarlo, el
// backend respondia "Tenes que conectar al menos una plataforma".
//
// La pantalla decia listo y el servidor decia no. Nada en el medio explicaba
// cual de los dos tenia razon.
// ══════════════════════════════════════════════════════════════════════════

const p = (
  clave: string,
  decision: PlataformaDelWizard["decision"],
  completa = true,
): PlataformaDelWizard => ({ clave, nombre: clave, decision, completa });

const LAS_SEIS = ["VTEX", "MERCADOLIBRE", "META_ADS", "GOOGLE_ADS", "GSC", "NITROPIXEL"];
const todasSalteadas = LAS_SEIS.map((k) => p(k, "skip"));

describe("el caso feliz", () => {
  it("con una plataforma real conectada, se puede enviar", () => {
    const r = evaluarWizard([p("VTEX", "use"), ...LAS_SEIS.slice(1).map((k) => p(k, "skip"))]);
    expect(r.listo).toBe(true);
    expect(r.motivo).toBeNull();
    expect(r.aEnviar).toEqual(["VTEX"]);
    expect(r.progreso).toBe(100);
  });
});

describe("EL BUG: saltear todo daba 100% y boton habilitado", () => {
  const r = evaluarWizard(todasSalteadas);

  it("las decisiones estan todas tomadas — eso era verdad", () => {
    expect(r.progreso).toBe(100);
    expect(r.decididas).toBe(6);
  });

  it("pero NO esta listo, porque no viaja ninguna plataforma", () => {
    expect(r.listo).toBe(false);
    expect(r.aEnviar).toEqual([]);
  });

  it("y dice que hacer, en vez de dejar que el backend tire 400", () => {
    expect(r.motivo).toMatch(/no conectaste ninguna/i);
    expect(r.motivo).toMatch(/eleg/i);
  });
});

describe("EL CASO QUE NO ES HIPOTETICO: solo NitroPixel", () => {
  // "Solo el pixel" es el paquete acotado que ya se vendio (TeVeCompras).
  // NitroPixel se filtra antes de mandar, asi que tambien termina en 400.
  const soloPixel = [
    p("NITROPIXEL", "use"),
    ...LAS_SEIS.filter((k) => k !== "NITROPIXEL").map((k) => p(k, "skip")),
  ];
  const r = evaluarWizard(soloPixel);

  it("no esta listo, aunque el usuario SI eligio algo", () => {
    expect(r.listo).toBe(false);
    expect(r.aEnviar).toEqual([]);
  });

  it("y el mensaje es DISTINTO al de no elegir nada", () => {
    // Decirle "no conectaste ninguna plataforma" a alguien que acaba de
    // elegir NitroPixel lo deja mirando la pantalla sin entender.
    expect(r.motivo).toContain("NitroPixel");
    expect(r.motivo).not.toMatch(/no conectaste ninguna/i);
    expect(r.motivo).toMatch(/ecommerce|marketplace/i);
  });

  it("el progreso igual muestra 100%: las decisiones ESTAN tomadas", () => {
    // El numero no era mentira; el problema era que la pantalla lo usaba
    // para habilitar el boton, que es otra pregunta.
    expect(r.progreso).toBe(100);
  });
});

describe("lo que ya andaba sigue andando", () => {
  it("una plataforma sin decidir corta primero, nombrandola", () => {
    const r = evaluarWizard([p("VTEX", "pending"), ...todasSalteadas.slice(1)]);
    expect(r.listo).toBe(false);
    expect(r.motivo).toContain("VTEX");
    expect(r.motivo).toMatch(/falta decidir/i);
  });

  it("una elegida pero incompleta corta, nombrandola", () => {
    const r = evaluarWizard([p("META_ADS", "use", false), ...todasSalteadas.slice(1)]);
    expect(r.listo).toBe(false);
    expect(r.motivo).toContain("META_ADS");
    expect(r.motivo).toMatch(/complet/i);
  });

  it("pendiente gana sobre incompleta: se resuelve de arriba hacia abajo", () => {
    const r = evaluarWizard([
      p("VTEX", "use", false),
      p("MERCADOLIBRE", "pending"),
      ...todasSalteadas.slice(2),
    ]);
    expect(r.motivo).toMatch(/falta decidir/i);
  });

  it("una incompleta NO cuenta como decidida", () => {
    const r = evaluarWizard([p("VTEX", "use", false), ...todasSalteadas.slice(1)]);
    expect(r.decididas).toBe(5);
    expect(r.progreso).toBeLessThan(100);
  });
});

describe("el pixel suma a las decisiones aunque no viaje", () => {
  it("elegirlo junto con VTEX no rompe nada y no aparece en aEnviar", () => {
    const r = evaluarWizard([
      p("VTEX", "use"),
      p("NITROPIXEL", "use"),
      ...LAS_SEIS.slice(1).filter((k) => k !== "NITROPIXEL").map((k) => p(k, "skip")),
    ]);
    expect(r.listo).toBe(true);
    expect(r.aEnviar).toEqual(["VTEX"]);
    expect(r.decididas).toBe(6);
  });
});

describe("bordes", () => {
  it("sin plataformas no explota ni divide por cero", () => {
    const r = evaluarWizard([]);
    expect(r.progreso).toBe(0);
    expect(r.listo).toBe(false);
    expect(r.motivo).toMatch(/no conectaste ninguna/i);
  });
});
