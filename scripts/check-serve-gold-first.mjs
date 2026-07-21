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

// ── Superficie vigilada ─────────────────────────────────────────────────────
// AMPLIADA 2026-07-21 (auditoría, hallazgo "guards"). Antes era SOLO
// `src/app/api/metrics`, y el guard imprimía "3 rutas escanean crudo" mientras
// había 19 en el read path. Eso no es un guard laxo: es un guard que mide una
// superficie más chica de la que declara, y eso da falsa confianza — el ✅ decía
// "Serve está limpio" con ~15 rutas de lectura escaneando Bronze sin supervisión.
//
// `src/lib/metrics` entra porque `pixel-funnel.ts` lo llama Serve: vivir fuera de
// `api/` no lo saca del read path.
const SERVE_DIRS = [
  "src/app/api/metrics",
  "src/app/api/bondly",
  "src/app/api/nitropixel",
  "src/app/api/control",
  "src/app/api/me",
  "src/lib/metrics",
].map((d) => join(ROOT, ...d.split("/")));

// Rutas del read path que YA escaneaban pixel_events al momento de grandfatherear.
// Sacar de acá a medida que se migran a Gold (ratchet-down).
//   · 2026-07-15: creación del guard, solo api/metrics.
//   · 2026-07-17: conversion y products salieron (leen rollups).
//   · 2026-07-21: se absorbe el diferencial de ampliar la superficie (16 rutas).
//     Ese lote es DEUDA MEDIDA, no deuda nueva: ya escaneaban crudo, solo que
//     nadie las estaba mirando.
const ALLOWLIST = new Set([
  // — api/metrics (lote original) —
  "src/app/api/metrics/pixel/funnel/route.ts", // híbrido: Gold-first + fallback crudo
  "src/app/api/metrics/pixel/route.ts", //         híbrido: Gold-first + fallback crudo
  "src/app/api/metrics/pixel/sales-by-ad/route.ts", // lookup acotado a visitantes atribuidos
  // — diferencial de la ampliación 2026-07-21 —
  "src/lib/metrics/pixel-funnel.ts", // lo llama metrics/pixel/funnel: mismo read path
  "src/app/api/bondly/behavioral-ltv/route.ts",
  "src/app/api/bondly/churn-risk/route.ts",
  "src/app/api/bondly/clientes/route.ts",
  "src/app/api/bondly/clientes/[id]/route.ts",
  "src/app/api/bondly/customer-journey/[customerId]/route.ts",
  "src/app/api/bondly/ltv-insights/route.ts",
  "src/app/api/bondly/pulse/route.ts",
  "src/app/api/bondly/senales/route.ts",
  "src/app/api/nitropixel/asset-stats/route.ts",
  "src/app/api/nitropixel/data-quality-score/route.ts",
  "src/app/api/nitropixel/install-status/route.ts",
  "src/app/api/control/client/[id]/route.ts",
  "src/app/api/control/clients-health/route.ts",
  "src/app/api/me/nitropixel-recent-events/route.ts",
  "src/app/api/me/section-status/route.ts",
]);

// Lectura de pixel_events CRUDO: la tabla en SQL o el modelo Prisma.
const PATTERN = /\bpixel_events\b|prisma\.pixelEvent\b/;

// Un comentario que MENCIONA pixel_events (ej. "antes escaneaba pixel_events")
// no es un scan. Sacamos comentarios de línea (//…) y de bloque (/* … */) antes
// de testear, para que el guard mida CÓDIGO real y no docstrings. Las plantillas
// SQL usan `FROM pixel_events` en su propia línea (nunca tras //), así que esto
// no puede esconder un scan real.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "") // bloque /* ... */
    .replace(/(^|[^:])\/\/.*$/gm, "$1"); // línea // ... (evita romper http://)
}

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
for (const dir of SERVE_DIRS) {
  for (const file of walk(dir)) {
    const rel = relative(ROOT, file).replace(/\\/g, "/");
    if (PATTERN.test(stripComments(readFileSync(file, "utf8")))) matches.push(rel);
  }
}

const newViolations = matches.filter((f) => !ALLOWLIST.has(f));
const stale = [...ALLOWLIST].filter((f) => !matches.includes(f));

// Se imprime la superficie vigilada junto al número: sin eso, "3 rutas" no se
// puede interpretar — era exactamente el problema que tenía este guard.
console.log(
  `[serve-gold-first] superficie: ${SERVE_DIRS.length} directorios del read path`
);
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
