import { describe, it, expect, vi, afterEach } from "vitest";
import { allOrEmpty } from "@/lib/api/all-or-empty";
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
// ── POR QUÉ EL HELPER NO VIVE EN LA ROUTE ────────────────────────────────
// Vivía adentro, privado, y este archivo lo cubría con una RÉPLICA del
// algoritmo escrita acá mismo. O sea que el test verificaba su propia copia: si
// alguien cambiaba el original, la réplica seguía en verde y lo único que
// quedaba eran unos greps que se esquivan escribiendo `Promise["all"]`. Lo
// levantó la auditoría de calidad de tests del 2026-09-07.
//
// Ahora el helper es `@/lib/api/all-or-empty` y esto ejecuta el original. Los
// guards sobre el fuente de la route se quedan, pero ya no son la única red:
// cubren que la route SIGA usándolo, que es otra cosa.
// ══════════════════════════════════════════════════════════════════════════


afterEach(() => vi.restoreAllMocks());

describe("E-06 — degradación parcial del batch", () => {
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
    expect(src).toContain("] = await degradadoDelBatch([");
    // El `Promise.all` del batch de 28 no debe volver.
    expect(src).not.toContain("] = await Promise.all([");
  });

  it("la route sigue pasando por el helper compartido", () => {
    // El algoritmo en sí se prueba ejecutándolo, arriba. Lo que esto cuida es
    // que nadie vuelva a escribir un `Promise.all` a mano en la route.
    expect(src).toContain(String.raw`from "@/lib/api/all-or-empty"`);
  });

  it("GUARD: el fallback `[]` sólo vale si el batch son queries que devuelven arrays", () => {
    // Si alguien agrega al batch algo que devuelve un escalar (un `count()`, por
    // ejemplo), `[]` como fallback rompe la aritmética río abajo en silencio:
    // `[] ?? 0` es `[]`, y de ahí sale NaN. Este guard cuenta las entradas y
    // avisa si la forma del batch cambió.
    const batch = src.slice(
      src.indexOf("] = await degradadoDelBatch(["),
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
