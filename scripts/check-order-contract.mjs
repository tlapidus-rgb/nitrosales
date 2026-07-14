#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════
// Guard del CONTRATO DE ÓRDENES — Fase 1.5 (domainización, boundary lint)
// ══════════════════════════════════════════════════════════════════════════
// Enforce la regla que ya estaba escrita pero no se enforceaba: "qué es una venta
// válida" se define en UN solo lugar (src/lib/metrics/orders.ts). Prohibido
// re-implementar el filtro de status de orden con SQL a mano en otro lado.
//
// Por qué existe: la review de domainización destapó que ~5 endpoints admin/debug
// re-implementaban el filtro OMITIENDO 'RETURNED' (contaban ventas devueltas como
// válidas; `replay-attribution` hasta ESCRIBÍA atribuciones así). Es la clase de bug
// "12 vs 14 vs 16" que el contrato existe para matar. Ver docs/MIGRATION_PLAN.md
// §"Auditoría de readiness del código".
//
// Cómo funciona (regression-guard con allowlist):
//   - Escanea src/ por SQL que filtra status de orden ('CANCELLED'/'APPROVED'/...).
//   - Los archivos que YA lo hacían quedan en ALLOWLIST (grandfathered — se migran
//     al contrato de a poco en la Fase 1.5, no de un saque).
//   - Falla (exit 1) ante CUALQUIER archivo NUEVO que lo haga → no crece la deuda
//     ni se repite el drift. Código nuevo importa de @/lib/metrics/orders.
//
// Uso: node scripts/check-order-contract.mjs   (o `npm run check:order-contract`)
// ══════════════════════════════════════════════════════════════════════════

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

// El contrato mismo + su validador: son los ÚNICOS lugares donde vive la definición.
const CONTRACT_FILES = new Set([
  "src/domains/orders/index.ts", // el contrato "venta válida" (S2: reubicado desde lib/metrics/orders.ts)
  "src/lib/order-validation.ts",
]);

// Archivos que YA re-implementaban el filtro al momento de crear el guard
// (2026-07-13). Grandfathered: no rompen CI, pero son deuda a migrar al contrato
// en la Fase 1.5 (y a ir sacando de esta lista a medida que se migran).
const ALLOWLIST = new Set([
  "src/app/api/admin/debug-channel-sources/route.ts",
  "src/app/api/admin/debug-cr-by-device/route.ts",
  "src/app/api/admin/debug-ml-backfill/route.ts",
  "src/app/api/admin/debug-orders-attribution-detail/route.ts",
  "src/app/api/admin/debug-touchpoint-campaigns/route.ts",
  "src/app/api/admin/ensure-coherence-indexes/route.ts",
  "src/app/api/admin/migrate-aura-dedup-indexes/route.ts",
  "src/app/api/admin/ml-diff-detail/route.ts",
  "src/app/api/admin/replay-attribution/route.ts",
  "src/app/api/admin/validate-orders-count/route.ts",
  "src/app/api/finance/auto-costs/route.ts",
  "src/app/api/mercadolibre/dashboard/route.ts",
  "src/app/api/metrics/orders/route.ts",
  "src/lib/alerts/primitives/orders.ts",
  "src/lib/control/checks.ts",
]);

// SQL que filtra por status de orden con literales de "venta válida".
const PATTERN =
  /["'`]?\bstatus\b["']?\s*(NOT\s+)?IN\s*\(\s*["'](CANCELLED|APPROVED|INVOICED|SHIPPED|DELIVERED|RETURNED|PENDING)/i;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      out.push(...walk(p));
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

const matches = [];
for (const file of walk(SRC)) {
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  if (CONTRACT_FILES.has(rel)) continue;
  const src = readFileSync(file, "utf8");
  if (PATTERN.test(src)) matches.push(rel);
}

const newViolations = matches.filter((f) => !ALLOWLIST.has(f));
const stale = [...ALLOWLIST].filter((f) => !matches.includes(f));

console.log(`[order-contract] archivos con filtro de status de orden fuera del contrato: ${matches.length} (allowlist: ${ALLOWLIST.size})`);
if (stale.length) {
  console.log(`[order-contract] ℹ️  ${stale.length} archivo(s) del allowlist ya NO re-implementan (migrados o borrados) — se pueden sacar del allowlist:`);
  for (const f of stale) console.log(`    - ${f}`);
}

if (newViolations.length) {
  console.error(`\n❌ [order-contract] ${newViolations.length} archivo(s) NUEVO(s) re-implementan "venta válida" con SQL a mano:`);
  for (const f of newViolations) console.error(`    - ${f}`);
  console.error(
    `\n   La definición de "venta válida" vive SOLO en src/domains/orders/index.ts (@/domains/orders).\n` +
    `   Importá y usá sus helpers (ordersValidWhere / ordersValidSql / ordersValidWebSql)\n` +
    `   en vez de escribir 'status IN (...)' a mano — así no se repite el drift de RETURNED.\n` +
    `   (Si es un caso legítimo que no cuenta ventas, agregalo al ALLOWLIST con un comentario.)`
  );
  process.exit(1);
}

console.log("✅ [order-contract] sin re-implementaciones nuevas del filtro de venta.");
