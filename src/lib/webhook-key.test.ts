import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { esClaveDeWebhookValida, hayVentanaDeRotacionDeWebhookAbierta } from "./webhook-key";

// ══════════════════════════════════════════════════════════════════════════
// Rotar la clave del webhook de VTEX sin perder ordenes
// ══════════════════════════════════════════════════════════════════════════
// Este es el secreto MAS caro de rotar de los dos. La URL con la clave adentro
// no vive en nuestro repo: vive del lado de VTEX, en la config del Orders
// Broadcaster de cada cliente, y se actualiza cuenta por cuenta con las
// credenciales de cada uno.
//
// Y a diferencia de un cron, **VTEX no reintenta**: cada 401 es una orden que
// no entra en tiempo real. El cron diario la levanta al otro dia, asi que no se
// pierde plata — pero el producto deja de ser tiempo real y nadie se entera.
// ══════════════════════════════════════════════════════════════════════════

const ACTUAL = "secreto-nuevo-aaaaaaaaaaaaaaaaaaaaaaaaaaa";
const VIEJA = "secreto-viejo-bbbbbbbbbbbbbbbbbbbbbbbbbbb";

const env = { ...process.env };

function setear(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete (process.env as any)[k];
    else (process.env as any)[k] = v;
  }
}

beforeEach(() => {
  delete (process.env as any).NEXTAUTH_SECRET;
  delete (process.env as any).NEXTAUTH_SECRET_ANTERIOR;
});
afterEach(() => {
  process.env = { ...env };
});

describe("sin ventana de rotacion — el comportamiento de siempre", () => {
  it("la clave actual entra", () => {
    setear({ NEXTAUTH_SECRET: ACTUAL });
    expect(esClaveDeWebhookValida(ACTUAL)).toBe(true);
  });

  it("cualquier otra no", () => {
    setear({ NEXTAUTH_SECRET: ACTUAL });
    expect(esClaveDeWebhookValida(VIEJA)).toBe(false);
    expect(esClaveDeWebhookValida("")).toBe(false);
    expect(esClaveDeWebhookValida(null)).toBe(false);
    expect(esClaveDeWebhookValida(undefined)).toBe(false);
  });

  it("y la ventana figura cerrada", () => {
    setear({ NEXTAUTH_SECRET: ACTUAL });
    expect(hayVentanaDeRotacionDeWebhookAbierta()).toBe(false);
  });
});

describe("con la ventana abierta — el punto de todo esto", () => {
  it("LAS DOS claves entran, asi no se cae ninguna orden durante la rotacion", () => {
    setear({ NEXTAUTH_SECRET: ACTUAL, NEXTAUTH_SECRET_ANTERIOR: VIEJA });
    expect(esClaveDeWebhookValida(ACTUAL)).toBe(true);
    expect(esClaveDeWebhookValida(VIEJA)).toBe(true);
  });

  it("pero una tercera sigue sin entrar", () => {
    setear({ NEXTAUTH_SECRET: ACTUAL, NEXTAUTH_SECRET_ANTERIOR: VIEJA });
    expect(esClaveDeWebhookValida("otra-cosa")).toBe(false);
  });

  it("se puede preguntar, para no olvidarse de cerrarla", () => {
    setear({ NEXTAUTH_SECRET: ACTUAL, NEXTAUTH_SECRET_ANTERIOR: VIEJA });
    expect(hayVentanaDeRotacionDeWebhookAbierta()).toBe(true);
  });

  it("al cerrarla, la vieja deja de servir", () => {
    setear({ NEXTAUTH_SECRET: ACTUAL, NEXTAUTH_SECRET_ANTERIOR: undefined });
    expect(esClaveDeWebhookValida(ACTUAL)).toBe(true);
    expect(esClaveDeWebhookValida(VIEJA)).toBe(false);
  });

  it("una ventana con valor vacio NO abre nada", () => {
    // `NEXTAUTH_SECRET_ANTERIOR=""` en Vercel no puede volverse un bypass.
    setear({ NEXTAUTH_SECRET: ACTUAL, NEXTAUTH_SECRET_ANTERIOR: "" });
    expect(esClaveDeWebhookValida("")).toBe(false);
    expect(hayVentanaDeRotacionDeWebhookAbierta()).toBe(false);
  });
});

describe("fail-closed", () => {
  it("sin NEXTAUTH_SECRET seteada, NADA entra", () => {
    // Aceptar una key vacia contra una env vacia seria un bypass total del
    // webhook: cualquiera podria inyectar ordenes.
    setear({ NEXTAUTH_SECRET: undefined });
    expect(esClaveDeWebhookValida("")).toBe(false);
    expect(esClaveDeWebhookValida("cualquier-cosa")).toBe(false);
    expect(esClaveDeWebhookValida(null)).toBe(false);
  });

  it("y con la env vacia tampoco, ni siquiera pasando la misma cadena vacia", () => {
    setear({ NEXTAUTH_SECRET: "" });
    expect(esClaveDeWebhookValida("")).toBe(false);
  });

  it("EL CASO PELIGROSO: la ventana abierta sin clave actual no abre la puerta", () => {
    // Si alguien borra `NEXTAUTH_SECRET` y deja la anterior, la vieja sigue
    // sirviendo — esta bien, es la ventana — pero nada mas debe pasar.
    setear({ NEXTAUTH_SECRET: undefined, NEXTAUTH_SECRET_ANTERIOR: VIEJA });
    expect(esClaveDeWebhookValida(VIEJA)).toBe(true);
    expect(esClaveDeWebhookValida("")).toBe(false);
    expect(esClaveDeWebhookValida("otra")).toBe(false);
  });
});

describe("lee el entorno en cada llamada, no al importarse", () => {
  it("un cambio de env se ve sin reimportar el modulo", () => {
    // Esta ruta puede quedar viva entre deploys. Una env leida al importar se
    // congelaria con el valor de ese momento, y la ventana no serviria de nada.
    setear({ NEXTAUTH_SECRET: ACTUAL });
    expect(esClaveDeWebhookValida(VIEJA)).toBe(false);
    setear({ NEXTAUTH_SECRET_ANTERIOR: VIEJA });
    expect(esClaveDeWebhookValida(VIEJA)).toBe(true);
  });
});

describe("la comparacion no filtra el secreto", () => {
  it("una clave del largo correcto pero distinta no entra", () => {
    setear({ NEXTAUTH_SECRET: ACTUAL });
    expect(esClaveDeWebhookValida("x".repeat(ACTUAL.length))).toBe(false);
  });

  it("un prefijo correcto tampoco", () => {
    setear({ NEXTAUTH_SECRET: ACTUAL });
    expect(esClaveDeWebhookValida(ACTUAL.slice(0, -1) + "z")).toBe(false);
    expect(esClaveDeWebhookValida(ACTUAL.slice(0, 5))).toBe(false);
  });

  it("y una clave larguisima no rompe la comparacion", () => {
    // `timingSafeEqual` tira si los buffers difieren en largo — por eso se
    // hashean los dos lados antes de comparar.
    setear({ NEXTAUTH_SECRET: ACTUAL });
    expect(esClaveDeWebhookValida("y".repeat(100_000))).toBe(false);
  });
});
