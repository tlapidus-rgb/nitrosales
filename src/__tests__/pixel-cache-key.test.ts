import { describe, it, expect } from "vitest";
import {
  buildPixelCacheKey,
  PIXEL_CACHE_KEY_VERSION,
} from "@/lib/pixel/cache-key";

// ══════════════════════════════════════════════════════════════════════════
// REGRESIÓN — auditoría 2026-07-21
// ══════════════════════════════════════════════════════════════════════════
// La cache key de /api/metrics/pixel era [org, from, to, "v12"] y omitía
// `model`, `page` y `pageSize`. Consecuencia: el selector de modelo de
// atribución no hacía nada mientras la entrada siguiera viva, y con api_cache
// compartida en Postgres el modelo del primero que pegaba se servía a TODA la
// org. Estos tests fallan si alguien vuelve a sacar un param de la key.
// ══════════════════════════════════════════════════════════════════════════

const base = { orgId: "org_1", from: "2026-07-01", to: "2026-07-21", page: 1, pageSize: 20 };
type Overrides = {
  orgId?: string;
  from?: string | null;
  to?: string | null;
  model?: string | null;
  page?: number;
  pageSize?: number;
};
const k = (o: Overrides = {}) => buildPixelCacheKey({ ...base, ...o }).join("|");

describe("buildPixelCacheKey", () => {
  it("distingue modelos de atribución — el bug que motivó el fix", () => {
    expect(k({ model: "LAST_CLICK" })).not.toBe(k({ model: "FIRST_CLICK" }));
    expect(k({ model: "NITRO" })).not.toBe(k({ model: "LINEAR" }));
  });

  it("el default de la org es su propio bucket, distinto de un modelo explícito", () => {
    // Sin `model` la respuesta la decide `organizations.settings`; no se puede
    // asumir que equivale a ninguno de los 4 modelos explícitos.
    expect(k({ model: null })).toContain("orgdefault");
    expect(k({ model: null })).not.toBe(k({ model: "NITRO" }));
  });

  it("distingue páginas y tamaños de página (recentEvents)", () => {
    expect(k({ page: 1 })).not.toBe(k({ page: 2 }));
    expect(k({ pageSize: 20 })).not.toBe(k({ pageSize: 50 }));
  });

  it("sigue distinguiendo org y rango de fechas", () => {
    expect(k({ orgId: "org_1" })).not.toBe(k({ orgId: "org_2" }));
    expect(k({ from: "2026-07-01" })).not.toBe(k({ from: "2026-06-01" }));
    expect(k({ to: "2026-07-21" })).not.toBe(k({ to: "2026-07-20" }));
  });

  it("es estable: mismos params ⇒ misma key", () => {
    expect(k({ model: "NITRO", page: 2 })).toBe(k({ model: "NITRO", page: 2 }));
  });

  it("normaliza el modelo a mayúsculas (el query string puede venir en minúscula)", () => {
    expect(k({ model: "last_click" })).toBe(k({ model: "LAST_CLICK" }));
  });

  it("trata from/to vacíos igual que ausentes", () => {
    expect(k({ from: "" })).toBe(k({ from: null }));
  });

  it("lleva la versión, para poder invalidar por cambio de forma del payload", () => {
    expect(buildPixelCacheKey({ ...base, model: null })).toContain(
      PIXEL_CACHE_KEY_VERSION
    );
  });

  it("todo param que cambia la respuesta produce una key distinta", () => {
    // Guard de conjunto: si mañana alguien agrega un param al endpoint y no lo
    // suma a la key, este test no lo va a atrapar solo — pero deja escrita la
    // regla para el que lo lea.
    const keys = new Set([
      k({ model: "NITRO" }),
      k({ model: "LINEAR" }),
      k({ model: "LAST_CLICK" }),
      k({ model: "FIRST_CLICK" }),
      k({ model: null }),
      k({ page: 2 }),
      k({ pageSize: 50 }),
      k({ orgId: "otra" }),
    ]);
    expect(keys.size).toBe(8);
  });
});
