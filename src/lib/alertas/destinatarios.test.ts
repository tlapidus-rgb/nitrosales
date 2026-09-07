import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { destinatariosDeAlertas } from "./destinatarios";

// ══════════════════════════════════════════════════════════════════════════
// E-19.3 — todas las alertas iban a una sola casilla
// ══════════════════════════════════════════════════════════════════════════
// El literal estaba escrito a mano en seis archivos. El problema obvio es que
// cambiarlo son seis ediciones; el que importa es otro: **si esa casilla manda
// los mails a spam, el sistema pierde su único sentido de la vista**. Hay
// problemas de entregabilidad documentados, y el modo de falla no es "llegan
// tarde" sino "no llega ninguna y nadie sabe que dejaron de llegar".
//
// La propiedad que estos casos protegen es la que hace que el cambio sea
// seguro: **nunca devolver una lista vacía**. Una variable con un typo no puede
// dejar al sistema sin avisarle a nadie.
// ══════════════════════════════════════════════════════════════════════════

const env = (v: Record<string, string>) => v as unknown as NodeJS.ProcessEnv;

describe("nunca se queda sin destinatario", () => {
  it("sin nada configurado, la casilla de siempre", () => {
    const r = destinatariosDeAlertas(env({}));
    expect(r).toHaveLength(1);
    expect(r[0]).toContain("@");
  });

  it("una variable con basura NO deja el sistema mudo", () => {
    // Es el caso peligroso: preferimos mandar a la casilla vieja antes que a
    // ninguna. Un typo en una env var no puede apagar las alertas.
    for (const basura of ["", "   ", "no-es-un-mail", ",,,", "@", "a@b"]) {
      const r = destinatariosDeAlertas(env({ ALERTAS_EMAILS: basura }));
      expect(r.length).toBeGreaterThan(0);
      expect(r[0]).toContain("@");
    }
  });
});

describe("varios destinatarios", () => {
  it("acepta una lista separada por comas", () => {
    expect(
      destinatariosDeAlertas(env({ ALERTAS_EMAILS: "a@x.com,b@y.com" })),
    ).toEqual(["a@x.com", "b@y.com"]);
  });

  it("tolera espacios y entradas vacías", () => {
    expect(
      destinatariosDeAlertas(env({ ALERTAS_EMAILS: " a@x.com , , b@y.com ,, " })),
    ).toEqual(["a@x.com", "b@y.com"]);
  });

  it("descarta las que no son mails pero conserva las buenas", () => {
    expect(
      destinatariosDeAlertas(env({ ALERTAS_EMAILS: "a@x.com,roto,b@y.com" })),
    ).toEqual(["a@x.com", "b@y.com"]);
  });

  it("no repite", () => {
    expect(
      destinatariosDeAlertas(env({ ALERTAS_EMAILS: "a@x.com,a@x.com" })),
    ).toEqual(["a@x.com"]);
  });

  it("ALERTAS_EMAILS gana sobre ADMIN_EMAIL", () => {
    expect(
      destinatariosDeAlertas(env({ ALERTAS_EMAILS: "a@x.com", ADMIN_EMAIL: "b@y.com" })),
    ).toEqual(["a@x.com"]);
  });

  it("con sólo ADMIN_EMAIL, esa", () => {
    expect(destinatariosDeAlertas(env({ ADMIN_EMAIL: "b@y.com" }))).toEqual(["b@y.com"]);
  });
});

describe("ya no queda la casilla escrita a mano en los crons", () => {
  const CASILLA = ["tlapidus", "@", "99media.com.ar"].join("");
  const RUTAS = [
    "src/app/api/cron/control-alerts/route.ts",
    "src/app/api/cron/refresh-pixel-rollups/route.ts",
    "src/app/api/cron/warm-cache/route.ts",
    "src/app/api/me/onboarding/submit-wizard/route.ts",
  ];

  it.each(RUTAS)("%s resuelve el destinatario por el módulo", (p) => {
    const src = readFileSync(join(process.cwd(), p), "utf8");
    expect(src).toContain("destinatariosDeAlertas");
    expect(src).not.toContain(CASILLA);
  });
});
