import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ══════════════════════════════════════════════════════════════════════════
// Rotar la clave sin cortar nada
// ══════════════════════════════════════════════════════════════════════════
// La rotación de secretos lleva semanas trabada, y el motivo es real: hoy rotar
// es un CORTE DE RAÍZ. La clave viaja en la URL de los 29 crons de vercel.json
// y en la del webhook de VTEX, así que cambiar el valor en Vercel deja a todo
// eso devolviendo 403 hasta que se actualicen las URLs — y un cron que devuelve
// 403 no alerta a nadie.
//
// Con una ventana de rotación, la misma operación pasa a ser por etapas y cada
// una es reversible.
// ══════════════════════════════════════════════════════════════════════════

const ACTUAL = "clave-nueva-aaaaaaaaaaaaaaaaaaaaaaaaaaa";
const VIEJA = "clave-vieja-bbbbbbbbbbbbbbbbbbbbbbbbbbb";

const env = { ...process.env };

/** Recarga el módulo, que lee el entorno una sola vez al importarse. */
async function cargar(vars: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete (process.env as any)[k];
    else (process.env as any)[k] = v;
  }
  return await import("./admin-key");
}

beforeEach(() => {
  delete (process.env as any).ADMIN_API_KEY;
  delete (process.env as any).ADMIN_API_KEY_ANTERIOR;
});
afterEach(() => {
  process.env = { ...env };
});

describe("sin ventana de rotación — el comportamiento de siempre", () => {
  it("la clave actual entra", async () => {
    const m = await cargar({ ADMIN_API_KEY: ACTUAL });
    expect(m.isValidAdminKey(ACTUAL)).toBe(true);
  });

  it("cualquier otra no", async () => {
    const m = await cargar({ ADMIN_API_KEY: ACTUAL });
    expect(m.isValidAdminKey(VIEJA)).toBe(false);
    expect(m.isValidAdminKey("")).toBe(false);
    expect(m.isValidAdminKey(null)).toBe(false);
    expect(m.isValidAdminKey(undefined)).toBe(false);
  });

  it("y la ventana figura cerrada", async () => {
    const m = await cargar({ ADMIN_API_KEY: ACTUAL });
    expect(m.hayVentanaDeRotacionAbierta()).toBe(false);
  });

  it("sin ADMIN_API_KEY seteada, NADA entra (fail-closed)", async () => {
    // Cae a un valor aleatorio por proceso. Aceptar una key vacía sería un
    // bypass total.
    const m = await cargar({ ADMIN_API_KEY: undefined });
    expect(m.isValidAdminKey("")).toBe(false);
    expect(m.isValidAdminKey("cualquier-cosa")).toBe(false);
  });
});

describe("con la ventana abierta — el punto de todo esto", () => {
  it("LAS DOS claves entran, así nada se corta durante la rotación", async () => {
    const m = await cargar({ ADMIN_API_KEY: ACTUAL, ADMIN_API_KEY_ANTERIOR: VIEJA });
    expect(m.isValidAdminKey(ACTUAL)).toBe(true);
    expect(m.isValidAdminKey(VIEJA)).toBe(true);
  });

  it("pero una tercera sigue sin entrar", async () => {
    const m = await cargar({ ADMIN_API_KEY: ACTUAL, ADMIN_API_KEY_ANTERIOR: VIEJA });
    expect(m.isValidAdminKey("otra-cosa")).toBe(false);
  });

  it("y la ventana se puede preguntar, para no olvidarse de cerrarla", async () => {
    // Una ventana que queda abierta para siempre es una rotación que no
    // terminó: la clave vieja sigue sirviendo para entrar, y no hay ningún
    // síntoma que lo delate.
    const m = await cargar({ ADMIN_API_KEY: ACTUAL, ADMIN_API_KEY_ANTERIOR: VIEJA });
    expect(m.hayVentanaDeRotacionAbierta()).toBe(true);
  });

  it("al cerrarla, la vieja deja de servir", async () => {
    const m = await cargar({ ADMIN_API_KEY: ACTUAL, ADMIN_API_KEY_ANTERIOR: undefined });
    expect(m.isValidAdminKey(ACTUAL)).toBe(true);
    expect(m.isValidAdminKey(VIEJA)).toBe(false);
  });

  it("una ventana con valor vacío NO abre nada", async () => {
    // `ADMIN_API_KEY_ANTERIOR=""` en Vercel no puede volverse un bypass.
    const m = await cargar({ ADMIN_API_KEY: ACTUAL, ADMIN_API_KEY_ANTERIOR: "" });
    expect(m.isValidAdminKey("")).toBe(false);
    expect(m.hayVentanaDeRotacionAbierta()).toBe(false);
  });
});

describe("la comparación no filtra el secreto", () => {
  it("una clave del largo correcto pero distinta no entra", async () => {
    const m = await cargar({ ADMIN_API_KEY: ACTUAL });
    const mismoLargo = "x".repeat(ACTUAL.length);
    expect(m.isValidAdminKey(mismoLargo)).toBe(false);
  });

  it("un prefijo correcto tampoco", async () => {
    // El `===` de antes cortaba en el primer byte distinto. Para un secreto que
    // se puede probar desde internet contra 29 endpoints, eso es una diferencia
    // medible.
    const m = await cargar({ ADMIN_API_KEY: ACTUAL });
    expect(m.isValidAdminKey(ACTUAL.slice(0, -1) + "z")).toBe(false);
    expect(m.isValidAdminKey(ACTUAL.slice(0, 5))).toBe(false);
  });

  it("y una clave larguísima no rompe la comparación", async () => {
    // `timingSafeEqual` tira si los buffers difieren en largo — por eso se
    // hashean los dos lados antes de comparar.
    const m = await cargar({ ADMIN_API_KEY: ACTUAL });
    expect(m.isValidAdminKey("y".repeat(100_000))).toBe(false);
  });
});
