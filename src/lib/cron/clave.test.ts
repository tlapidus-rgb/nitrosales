import { afterEach, describe, expect, it, vi } from "vitest";

// `ADMIN_API_KEY` se lee del entorno al importar el módulo, así que cada caso
// arma su entorno y recién ahí importa.
async function conEntorno(env: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import("./clave");
}
afterEach(() => vi.unstubAllEnvs());

describe("esClaveDeCron", () => {
  it("hoy (las dos claves valen lo mismo) acepta esa clave y nada más", async () => {
    const { esClaveDeCron } = await conEntorno({ ADMIN_API_KEY: "mismo", NEXTAUTH_SECRET: "mismo" });
    expect(esClaveDeCron("mismo")).toBe(true);
    expect(esClaveDeCron("otra")).toBe(false);
  });

  it("EL CASO: separadas, acepta las dos — los crons no se cortan", async () => {
    // vercel.json manda ADMIN_API_KEY; algunas rutas se llaman entre sí con
    // NEXTAUTH_SECRET. Separarlas no puede dejar a ninguna afuera.
    const { esClaveDeCron } = await conEntorno({ ADMIN_API_KEY: "admin", NEXTAUTH_SECRET: "sesion" });
    expect(esClaveDeCron("admin")).toBe(true);
    expect(esClaveDeCron("sesion")).toBe(true);
    expect(esClaveDeCron("otra")).toBe(false);
  });

  it("respeta la ventana de rotación de la clave de admin", async () => {
    const { esClaveDeCron } = await conEntorno({
      ADMIN_API_KEY: "admin-nueva", ADMIN_API_KEY_ANTERIOR: "admin-vieja",
      NEXTAUTH_SECRET: "sesion-nueva", NEXTAUTH_SECRET_ANTERIOR: "sesion-vieja",
    });
    for (const k of ["admin-nueva", "admin-vieja", "sesion-nueva"]) expect(esClaveDeCron(k), k).toBe(true);
  });

  it("EL CASO: la NEXTAUTH_SECRET anterior NO abre los crons durante la rotación", async () => {
    // Esa ventana existe para el webhook de VTEX (la URL vive en el VTEX de cada
    // cliente). Si los crons la aceptaran, el valor filtrado —el motivo para
    // rotar— seguiría abriendo /api/sync* durante días.
    const { esClaveDeCron } = await conEntorno({
      ADMIN_API_KEY: "admin", NEXTAUTH_SECRET: "sesion-nueva", NEXTAUTH_SECRET_ANTERIOR: "sesion-vieja",
    });
    expect(esClaveDeCron("sesion-vieja")).toBe(false);
  });

  it.each([null, undefined, ""])("una clave ausente o vacía no entra: %j", async (k) => {
    const { esClaveDeCron } = await conEntorno({ ADMIN_API_KEY: "admin", NEXTAUTH_SECRET: "sesion" });
    expect(esClaveDeCron(k as any)).toBe(false);
  });
});

describe("esClavePropia", () => {
  it("sin la variable configurada, no habilita nada (el fail-open de R-01)", async () => {
    const { esClavePropia } = await conEntorno({});
    for (const k of [null, undefined, "", "undefined"]) expect(esClavePropia(k as any, undefined), String(k)).toBe(false);
  });

  it("con la variable, acepta exactamente ese valor", async () => {
    const { esClavePropia } = await conEntorno({});
    expect(esClavePropia("propia", "propia")).toBe(true);
    expect(esClavePropia("otra", "propia")).toBe(false);
    expect(esClavePropia("", "")).toBe(false);
  });
});
