import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  touchpointSourceCase,
  touchpointSourceSql,
} from "@/lib/pixel/touchpoint-source-sql";

// ══════════════════════════════════════════════════════════════════════════
// RED DE REGRESIÓN DEL P1 (canales, 2026-07-26)
// ══════════════════════════════════════════════════════════════════════════
// El serve `metrics/pixel/route.ts` tenía ~8 copias inline del CASE de
// clasificación de source SIN alias (`LOWER(COALESCE(tp->>'source','direct'))`),
// mientras el rollup Gold ya aliaseaba (F1). Resultado: `adwords`/`fb` como
// canales propios (los $406M de TeVe) en las queries siempre-Bronze del serve →
// divergencia dentro de la misma página con PIXEL_USE_GOLD=true.
//
// Fix (P1): las 8 copias adoptan `touchpointSourceSql` (el helper con alias).
// Este test es la red para que NO vuelvan a aparecer copias inline.
// ══════════════════════════════════════════════════════════════════════════

const SERVE = join(
  process.cwd(),
  "src/app/api/metrics/pixel/route.ts"
);

describe("touchpointSourceSql — wrapper Prisma.raw del CASE", () => {
  it("envuelve exactamente el mismo SQL que touchpointSourceCase (no driftea)", () => {
    // Prisma.raw(str).sql === str: el wrapper no altera el texto.
    expect(touchpointSourceSql("tp").sql).toBe(touchpointSourceCase("tp"));
  });

  it("el output aliasea (contiene los alias google/meta), no es LOWER pelado", () => {
    const sql = touchpointSourceSql("tp").sql;
    expect(sql).toContain("'google'");
    expect(sql).toContain("'meta'");
  });
});

describe("el serve NO tiene copias inline del CASE de source (P1)", () => {
  const src = readFileSync(SERVE, "utf8");

  it("cero copias inline del CASE viejo sin alias", () => {
    // El patrón exacto que regresó: clasificar el source pelado con LOWER, sin
    // pasar por el helper. Si reaparece, es la divergencia de vuelta.
    const inlineCopies = (
      src.match(/LOWER\(COALESCE\(tp->>'source','direct'\)\)/g) ?? []
    ).length;
    expect(inlineCopies).toBe(0);
  });

  it("clasifica el source vía el helper compartido", () => {
    expect(src).toContain('touchpointSourceSql("tp")');
    expect(src).toContain(
      'import { touchpointSourceSql } from "@/lib/pixel/touchpoint-source-sql"'
    );
  });
});
