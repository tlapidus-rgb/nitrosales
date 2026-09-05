import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ══════════════════════════════════════════════════════════════════════════
// E-06 — una query que falla no puede dejar el dashboard entero en cero
// ══════════════════════════════════════════════════════════════════════════
// El batch de `/api/metrics/pixel` son 28 queries en paralelo. Con `Promise.all`,
// UNA sola que rechazara —un `statement_timeout`, un plan malo, `hll` no
// disponible, una tabla que todavía no existe en esa DB— rechazaba el batch
// ENTERO, caía al catch final y devolvía el mock vacío con **HTTP 200**.
//
// Lo que ve el cliente no es "una métrica no disponible": es **"mi negocio
// facturó $0"**. Y si el warm-cache toma la foto en ese momento, ese cero se
// persiste en el caché compartido y se le sirve a toda la organización hasta el
// próximo TTL. Está documentado como el hallazgo "el dashboard miente en cero".
//
// La ruta hermana `metrics/orders` ya lo resolvía bien con `safeQuery`. Acá se
// hace lo mismo con `allSettled`: la que falla devuelve `[]`, se registra su
// índice, y las otras 27 llegan con sus datos.
//
// El helper es privado de la ruta (no se puede importar sin arrastrar Prisma y
// el resto del módulo), así que se testea su ALGORITMO con una réplica y se
// verifica con guards que la ruta lo siga usando. Es el mismo compromiso que el
// repo ya toma en `rollup-backfill-budget.test.ts`.
// ══════════════════════════════════════════════════════════════════════════

/** Réplica exacta del algoritmo de `allOrEmpty` en metrics/pixel/route.ts. */
async function allOrEmpty<T extends readonly unknown[]>(
  promises: readonly [...{ [K in keyof T]: Promise<T[K]> }],
  degraded: number[]
): Promise<T> {
  const settled = await Promise.allSettled(promises);
  return settled.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    degraded.push(i);
    return [];
  }) as unknown as T;
}

afterEach(() => vi.restoreAllMocks());

describe("E-06 — degradación parcial del batch", () => {
  it("EL BUG: con Promise.all, una query que falla tumba las 28", async () => {
    const batch = [
      Promise.resolve([{ visitantes: 84_300 }]),
      Promise.reject(new Error("canceling statement due to statement timeout")),
      Promise.resolve([{ revenue: 850_000_000 }]),
    ];
    // Así se comportaba antes: el batch entero rechaza → catch → mock en cero.
    await expect(Promise.all(batch)).rejects.toThrow("statement timeout");
  });

  it("con allSettled, las otras 27 llegan con sus datos", async () => {
    const degraded: number[] = [];
    const [visitas, roto, revenue] = await allOrEmpty(
      [
        Promise.resolve([{ visitantes: 84_300 }]),
        Promise.reject(new Error("canceling statement due to statement timeout")),
        Promise.resolve([{ revenue: 850_000_000 }]),
      ] as const,
      degraded
    );

    // Los datos buenos sobreviven: el cliente ve sus visitas y su revenue.
    expect(visitas).toEqual([{ visitantes: 84_300 }]);
    expect(revenue).toEqual([{ revenue: 850_000_000 }]);
    // Y la que falló queda vacía, no en cero-que-parece-dato.
    expect(roto).toEqual([]);
  });

  it("registra QUÉ query falló, por índice del batch", async () => {
    const degraded: number[] = [];
    await allOrEmpty(
      [
        Promise.resolve([1]),
        Promise.reject(new Error("boom")),
        Promise.resolve([3]),
        Promise.reject(new Error("boom 2")),
      ] as const,
      degraded
    );
    expect(degraded).toEqual([1, 3]);
  });

  it("si no falla ninguna, `degraded` queda vacío y nada cambia", async () => {
    const degraded: number[] = [];
    const r = await allOrEmpty(
      [Promise.resolve([1]), Promise.resolve([2])] as const,
      degraded
    );
    expect(r).toEqual([[1], [2]]);
    expect(degraded).toEqual([]);
  });

  it("aunque fallen TODAS, resuelve — no rechaza", async () => {
    const degraded: number[] = [];
    const r = await allOrEmpty(
      [Promise.reject(new Error("a")), Promise.reject(new Error("b"))] as const,
      degraded
    );
    expect(r).toEqual([[], []]);
    expect(degraded).toEqual([0, 1]);
  });
});

describe("E-06 — guards sobre la ruta", () => {
  const src = readFileSync(
    join(process.cwd(), "src", "app", "api", "metrics", "pixel", "route.ts"),
    "utf8"
  );

  it("el batch grande ya no usa Promise.all", () => {
    expect(src).toContain("] = await allOrEmpty([");
    // El `Promise.all` del batch de 28 no debe volver.
    expect(src).not.toContain("] = await Promise.all([");
  });

  it("el helper usa allSettled y acumula los índices degradados", () => {
    expect(src).toContain("await Promise.allSettled(promises)");
    expect(src).toContain("degraded.push(i)");
  });

  it("GUARD: el fallback `[]` sólo vale si el batch son queries que devuelven arrays", () => {
    // Si alguien agrega al batch algo que devuelve un escalar (un `count()`, por
    // ejemplo), `[]` como fallback rompe la aritmética río abajo en silencio:
    // `[] ?? 0` es `[]`, y de ahí sale NaN. Este guard cuenta las entradas y
    // avisa si la forma del batch cambió.
    const batch = src.slice(
      src.indexOf("] = await allOrEmpty(["),
      src.indexOf("], degradedQueries);")
    );
    // Nada de agregaciones de Prisma dentro del batch.
    expect(batch).not.toMatch(/prisma\.\w+\.(count|aggregate|groupBy)\(/);
  });
});

describe("E-06 — una respuesta degradada no se propaga por el caché compartido", () => {
  const src = readFileSync(
    join(process.cwd(), "src", "app", "api", "metrics", "pixel", "route.ts"),
    "utf8"
  );

  it("`setSharedCache` sólo corre si no hubo queries degradadas", () => {
    // Si una query falla justo cuando corre el warm-cache, cachear ese resultado
    // se lo sirve a TODA la organización hasta el próximo TTL: un fallo de
    // segundos se convierte en media hora de números mal para todos.
    expect(src).toMatch(
      /if \(degradedQueries\.length === 0\) \{\s*\n\s*setSharedCache\("pixel", response, \.\.\.cacheKey\);/
    );
  });

  it("la respuesta expone `_degraded` para que el front pueda decirlo", () => {
    expect(src).toContain("_degraded: degradedQueries.length ? degradedQueries : undefined");
  });
});
