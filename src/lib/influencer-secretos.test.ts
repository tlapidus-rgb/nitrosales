import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { sinSecretosDeCreador, sinSecretosDeCreadores } from "./influencer-secretos";

// ══════════════════════════════════════════════════════════════════════════
// R-C06 — la contraseña en claro de los creadores salía por la API
// ══════════════════════════════════════════════════════════════════════════
// `influencers` guarda `dashboardPasswordPlain` (texto plano) además del hash
// SHA-256 sin salt. Los cuatro handlers de /api/influencers devolvían la fila
// entera (`...influencer`, y un `findMany` sin `select`), así que en cada listado
// viajaban al navegador las contraseñas en claro de TODOS los creadores de la
// org. Ninguna pantalla las usa: `manage/page.tsx` sólo las manda al crear/editar.
//
// Esto cierra la salida y deja de escribir la copia en claro. NO arregla lo ya
// guardado (pasos 4-5, borrar la columna) ni el hash sin salt (paso 3, migrar a
// bcrypt, que invalida las contraseñas existentes y hay que coordinar con Tomy).
// ══════════════════════════════════════════════════════════════════════════

const creador = {
  id: "inf_1",
  name: "Juana",
  code: "juana4f2x",
  commissionPercent: 10,
  dashboardPassword: "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8",
  dashboardPasswordPlain: "hunter2",
};

describe("sinSecretosDeCreador", () => {
  it("saca la contraseña en claro y el hash", () => {
    const limpio = sinSecretosDeCreador(creador);
    expect(limpio).not.toHaveProperty("dashboardPasswordPlain");
    expect(limpio).not.toHaveProperty("dashboardPassword");
    // Que no quede en NINGÚN valor serializado, no sólo fuera de esas dos claves.
    expect(JSON.stringify(limpio)).not.toContain("hunter2");
    expect(JSON.stringify(limpio)).not.toContain(creador.dashboardPassword);
  });

  it("deja intacto todo el resto", () => {
    const limpio = sinSecretosDeCreador(creador);
    expect(limpio).toMatchObject({
      id: "inf_1",
      name: "Juana",
      code: "juana4f2x",
      commissionPercent: 10,
    });
  });

  it("no muta el objeto original", () => {
    const copia = { ...creador };
    sinSecretosDeCreador(creador);
    expect(creador).toEqual(copia);
  });

  it("expone si hay contraseña puesta, que es lo único que la UI necesitaba", () => {
    expect(sinSecretosDeCreador(creador).tieneDashboardPassword).toBe(true);
    expect(
      sinSecretosDeCreador({ ...creador, dashboardPassword: null }).tieneDashboardPassword,
    ).toBe(false);
  });

  it("aguanta una fila sin esos campos", () => {
    const limpio = sinSecretosDeCreador({ id: "inf_2", name: "Sin credenciales" });
    expect(limpio.tieneDashboardPassword).toBe(false);
    expect(limpio.name).toBe("Sin credenciales");
  });

  it("la versión de lista limpia todos los elementos", () => {
    const lista = sinSecretosDeCreadores([creador, { ...creador, id: "inf_2", dashboardPasswordPlain: "otra" }]);
    expect(JSON.stringify(lista)).not.toContain("hunter2");
    expect(JSON.stringify(lista)).not.toContain("otra");
    expect(lista).toHaveLength(2);
  });
});

// ── Guardia de regresión ──────────────────────────────────────────────────
// Esto sí mira el código fuente a propósito: lo que hay que impedir es que
// alguien vuelva a agregar la escritura. No reemplaza a los casos de arriba.
describe("R-C06 — ninguna ruta vuelve a escribir la copia en texto plano", () => {
  const rutas = [
    "src/app/api/influencers/route.ts",
    "src/app/api/influencers/[id]/route.ts",
  ];

  /** El archivo sin comentarios: un comentario que menciona la columna no cuenta. */
  function sinComentarios(p: string): string {
    return readFileSync(join(process.cwd(), p), "utf8")
      .replace(/^\s*\/\*[\s\S]*?\*\//gm, "")
      .replace(/^\s*\/\/.*$/gm, "");
  }

  it.each(rutas)("%s no asigna dashboardPasswordPlain", (p) => {
    expect(sinComentarios(p)).not.toContain("dashboardPasswordPlain");
  });

  it.each(rutas)("%s pasa todas sus respuestas por el sanitizador", (p) => {
    const src = sinComentarios(p);
    // Cada `NextResponse.json` que devuelve un influencer tiene que ir limpio.
    const devuelveCreador = src.match(/influencer[s]?:\s*[^,\n]+/g) ?? [];
    for (const linea of devuelveCreador) {
      expect(linea).toContain("sinSecretosDeCreador");
    }
    expect(devuelveCreador.length).toBeGreaterThan(0);
  });
});
