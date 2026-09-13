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

/**
 * La casilla de fallback, escrita acá a mano y a propósito.
 *
 * No se importa del módulo: si el test leyera la constante, pasaría con
 * cualquier valor y no estaría probando nada. Escrita, cambiar la dirección
 * obliga a tocar este archivo, que es exactamente el punto — quién recibe las
 * alertas operativas no debería poder cambiar de callado.
 *
 * Antes estos casos afirmaban `expect(r[0]).toContain("@")`. Con eso, el
 * fallback podía pasar a ser cualquier string con arroba —el mail de alguien
 * que ya no está, una casilla que rebota— y la suite seguía verde.
 *
 * Va partida en pedazos por el mismo motivo que abajo: hay un test que barre
 * los crons buscando el literal, y si estuviera entero acá se encontraría a
 * sí mismo.
 */
const CASILLA_ESPERADA = ["tlapidus", "@", "99media.com.ar"].join("");

describe("nunca se queda sin destinatario", () => {
  it("sin nada configurado, la casilla de siempre", () => {
    expect(destinatariosDeAlertas(env({}))).toEqual([CASILLA_ESPERADA]);
  });

  it("una variable con basura NO deja el sistema mudo", () => {
    // Es el caso peligroso: preferimos mandar a la casilla vieja antes que a
    // ninguna. Un typo en una env var no puede apagar las alertas.
    for (const basura of ["", "   ", "no-es-un-mail", ",,,", "@", "a@b"]) {
      expect(
        destinatariosDeAlertas(env({ ALERTAS_EMAILS: basura })),
        `con ALERTAS_EMAILS=${JSON.stringify(basura)}`,
      ).toEqual([CASILLA_ESPERADA]);
    }

    // Y lo mismo si la basura viene por la otra variable.
    for (const basura of ["", "   ", "no-es-un-mail"]) {
      expect(destinatariosDeAlertas(env({ ADMIN_EMAIL: basura }))).toEqual([
        CASILLA_ESPERADA,
      ]);
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
  const CASILLA = CASILLA_ESPERADA;
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
