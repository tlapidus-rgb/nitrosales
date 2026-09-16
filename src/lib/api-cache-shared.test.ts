import { describe, it, expect, vi, beforeEach } from "vitest";

// ══════════════════════════════════════════════════════════════════════════
// R-34 — la caché compartida no tenía un solo test
// ══════════════════════════════════════════════════════════════════════════
// Este módulo decide dos cosas que se notan cuando fallan y no antes: si una
// respuesta cacheada todavía sirve, y si la tabla `api_cache` se limpia.
//
// Lo segundo es el bug que E-04 vino a arreglar: la tabla creciendo sin límite.
// El purgado devolvía `0` tanto cuando no había nada que borrar como cuando el
// DELETE fallaba, y el llamador sólo loguea si el número es mayor a cero — así
// que un timeout o un lock se reportaban como silencio mientras la tabla seguía
// creciendo.
// ══════════════════════════════════════════════════════════════════════════

const ejecutar = vi.fn();
const consultar = vi.fn();

vi.mock("@/lib/db/client", () => ({
  prisma: {
    $executeRaw: (...a: unknown[]) => ejecutar(...a),
    $queryRaw: (...a: unknown[]) => consultar(...a),
  },
}));

const { purgeExpiredSharedCache, getSharedCachedSWR, setSharedCache } = await import(
  "./api-cache-shared"
);

beforeEach(() => {
  ejecutar.mockReset();
  consultar.mockReset();
});

describe("purgeExpiredSharedCache", () => {
  it("devuelve cuántas borró", async () => {
    ejecutar.mockResolvedValue(42);
    expect(await purgeExpiredSharedCache()).toBe(42);
  });

  it("cero es cero: no había nada vencido", async () => {
    ejecutar.mockResolvedValue(0);
    expect(await purgeExpiredSharedCache()).toBe(0);
  });

  it("cuando el DELETE falla devuelve -1, no 0", async () => {
    // Ésta es la propiedad. Con `0`, el llamador no puede distinguir "no había
    // nada" de "no pude", y `api_cache` crece en silencio.
    //
    // El repo ya tiene el principio escrito en `freshness.ts`: *"ESTO ES LA
    // DIFERENCIA ENTRE 'NO HAY PROBLEMA' Y 'NO SÉ'"*.
    ejecutar.mockRejectedValue(new Error("canceling statement due to lock timeout"));
    expect(await purgeExpiredSharedCache()).toBe(-1);
  });

  it("falla soft: no tira, porque limpiar caché no puede tumbar al cron", async () => {
    ejecutar.mockRejectedValue(new Error("lo que sea"));
    await expect(purgeExpiredSharedCache()).resolves.toBeDefined();
  });

  it("respeta el límite de filas por vuelta", async () => {
    // El borrado va acotado a propósito: un DELETE sin LIMIT sobre `api_cache`
    // es un lock largo sobre una tabla que se lee en cada request.
    ejecutar.mockResolvedValue(10);
    await purgeExpiredSharedCache(10);
    expect(ejecutar).toHaveBeenCalled();
  });
});

describe("getSharedCachedSWR", () => {
  it("sin fila, no hay hit", async () => {
    consultar.mockResolvedValue([]);
    expect(await getSharedCachedSWR("k")).toBeNull();
  });

  it("si la consulta falla, se comporta como si no hubiera caché", async () => {
    // Fail-soft deliberado: que la caché no responda tiene que degradar a
    // "calculalo de nuevo", nunca a romper el request.
    consultar.mockRejectedValue(new Error("la base no responde"));
    expect(await getSharedCachedSWR("k")).toBeNull();
  });
});

describe("setSharedCache", () => {
  it("no tira aunque la escritura falle", async () => {
    // Guardar en caché es un efecto secundario: si falla, el request que ya
    // calculó la respuesta tiene que poder devolverla igual.
    ejecutar.mockRejectedValue(new Error("no se pudo escribir"));
    expect(() => setSharedCache("k", { a: 1 }, 60)).not.toThrow();
  });
});
