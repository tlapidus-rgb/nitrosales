import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ══════════════════════════════════════════════════════════════════════════
// RED DE REGRESION — el webhook de ordenes no puede volver al `!==`
// ══════════════════════════════════════════════════════════════════════════
// `src/app/api/webhooks/vtex/orders/route.ts` esta marcado como CORE PROTECTED.
// La linea de la clave se modifico el 2026-09-12 con autorizacion explicita de
// Axel, y es UNA sola linea. Este test existe porque:
//
//   · es justo el tipo de linea que alguien "simplifica" de vuelta a un `!==`
//     sin darse cuenta de que eso rompe la ventana de rotacion;
//   · y si se rompe, NO HAY SINTOMA hasta el dia que se rote — ahi VTEX empieza
//     a comerse 401 sin reintentar y las ordenes dejan de entrar en tiempo real.
//
// Tambien cuida lo que NO debia cambiar: el GET sin key que VTEX usa para
// validar el hook. Si alguien le mete auth a ese GET, VTEX no puede configurar
// el webhook y el alta de un cliente nuevo se traba sin explicacion.
// ══════════════════════════════════════════════════════════════════════════

const RUTA = join(process.cwd(), "src/app/api/webhooks/vtex/orders/route.ts");
const fuente = readFileSync(RUTA, "utf8");

/**
 * El mismo archivo sin las lineas de comentario.
 *
 * Hace falta porque el header del archivo CITA el `!== process.env.NEXTAUTH_SECRET`
 * viejo para explicar que se cambio. Buscar sobre el texto crudo daba rojo sobre
 * codigo correcto — el test estaba mal, no la ruta.
 */
const codigo = fuente
  .split("\n")
  .filter((l) => !l.trim().startsWith("//"))
  .join("\n");

describe("la clave del webhook se valida con el helper rotable", () => {
  it("importa y usa `esClaveDeWebhookValida`", () => {
    expect(fuente).toContain("esClaveDeWebhookValida");
    expect(fuente).toMatch(/from\s+"@\/lib\/webhook-key"/);
  });

  it("NO compara NEXTAUTH_SECRET a mano", () => {
    // El `!==` directo saltea la ventana de rotacion entera.
    expect(codigo).not.toMatch(/[!=]==\s*process\.env\.NEXTAUTH_SECRET/);
    expect(codigo).not.toMatch(/process\.env\.NEXTAUTH_SECRET\s*[!=]==/);
  });
});

describe("lo que la autorizacion NO cubria sigue intacto", () => {
  it("el GET de validacion de VTEX sigue sin pedir key", () => {
    expect(fuente).toContain("Allow GET without key for VTEX validation");
  });

  it("la deduplicacion por isNewOrder sigue estando", () => {
    expect(fuente).toContain("isNewOrder");
  });

  it("el bloque de atribucion sigue llamando a calculateAttribution", () => {
    expect(fuente).toContain("calculateAttribution");
  });

  it("el archivo sigue marcado como CORE PROTEGIDO y anota la excepcion", () => {
    expect(fuente).toContain("CORE PROTEGIDO");
    expect(fuente).toMatch(/EXCEPCION AUTORIZADA/);
  });
});

describe("la primitiva de comparacion no esta duplicada", () => {
  it("admin-key y webhook-key comparten `comparacion-segura`", () => {
    const admin = readFileSync(join(process.cwd(), "src/lib/admin-key.ts"), "utf8");
    const webhook = readFileSync(join(process.cwd(), "src/lib/webhook-key.ts"), "utf8");
    expect(admin).toMatch(/from\s+"\.\/comparacion-segura"/);
    expect(webhook).toMatch(/from\s+"\.\/comparacion-segura"/);
  });

  it("ninguno de los dos define su propio timingSafeEqual", () => {
    // Una primitiva de seguridad duplicada es una que en algun momento va a
    // estar arreglada en un lado y rota en el otro.
    const admin = readFileSync(join(process.cwd(), "src/lib/admin-key.ts"), "utf8");
    const webhook = readFileSync(join(process.cwd(), "src/lib/webhook-key.ts"), "utf8");
    expect(admin).not.toContain("timingSafeEqual");
    expect(webhook).not.toContain("timingSafeEqual");
  });
});
