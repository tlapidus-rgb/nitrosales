#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════
// Guard "Serve = Gold-first" — Fase 1 del PLAN_ARQUITECTURA_MODULAR_MONOLITO.md
// ══════════════════════════════════════════════════════════════════════════
// Regla Medallion: las rutas de Serve (src/app/api/metrics/**) NO deben escanear
// `pixel_events` CRUDO (Bronze). Deben leer los rollups Gold (pixel_daily_*).
// Escanear Bronze en rangos largos = timeouts = dashboard en blanco (el dolor #1
// de prod). Ver §5.3 "Serve (read path) — Gold-first" y §13 "Qué NO hacer".
//
// Regression-guard con allowlist: las rutas que HOY todavía tocan pixel_events
// quedan grandfathered (deuda a migrar a Silver/Gold en Fases 1-2); falla ante
// CUALQUIER ruta NUEVA de Serve que escanee crudo → el gap no crece.
// A medida que cada ruta se migra a Gold, se SACA del allowlist (ratchet down).
//
// Uso: node scripts/check-serve-gold-first.mjs  (o npm run check:serve-gold-first)
// ══════════════════════════════════════════════════════════════════════════

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SERVE = join(ROOT, "src", "app", "api", "metrics"); // superficie de Serve

// Rutas de Serve que YA escaneaban pixel_events al crear el guard (2026-07-15).
// Grandfathered. Sacar de acá a medida que se migran a Gold (Fases 1-2).
const ALLOWLIST = new Set([
  "src/app/api/metrics/conversion/route.ts",
  "src/app/api/metrics/pixel/funnel/route.ts", // híbrido: Gold-first + fallback crudo
  "src/app/api/metrics/pixel/route.ts", //         híbrido: Gold-first + fallback crudo
  "src/app/api/metrics/pixel/sales-by-ad/route.ts",
  "src/app/api/metrics/products/route.ts", //      híbrido: Gold-first + fallback crudo
]);

// Lectura de pixel_events CRUDO: la tabla en SQL o el modelo Prisma.
const PATTERN = /\bpixel_events\b|prisma\.pixelEvent\b/;

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // dir no existe (ej. si se reorganiza a modules/serve)
  }
  for (const name of entries) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const matches = [];
for (const file of walk(SERVE)) {
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  if (PATTERN.test(readFileSync(file, "utf8"))) matches.push(rel);
}

const newViolations = matches.filter((f) => !ALLOWLIST.has(f));
const stale = [...ALLOWLIST].filter((f) => !matches.includes(f));

console.log(`[serve-gold-first] rutas de Serve que escanean pixel_events crudo: ${matches.length} (allowlist: ${ALLOWLIST.size})`);
if (stale.length) {
  console.log(`[serve-gold-first] ✅ ${stale.length} ruta(s) del allowlist ya NO escanean crudo (migradas a Gold) — sacar del allowlist:`);
  for (const f of stale) console.log(`    - ${f}`);
}

if (newViolations.length) {
  console.error(`\n❌ [serve-gold-first] ${newViolations.length} ruta(s) NUEVA(s) de Serve escanean pixel_events crudo:`);
  for (const f of newViolations) console.error(`    - ${f}`);
  console.error(
    `\n   Serve debe ser Gold-first: leé los rollups (pixel_daily_*), no la tabla cruda.\n` +
    `   Escanear pixel_events en rangos largos timeoutea el dashboard. Si falta un\n` +
    `   rollup para tu caso, eso es un GAP de pipeline (crear el dataset Gold), no un\n` +
    `   permiso para escanear Bronze. Ver §6.3 Gold + §13 del plan.`
  );
  process.exit(1);
}

console.log("✅ [serve-gold-first] sin escaneos crudos nuevos en Serve.");
