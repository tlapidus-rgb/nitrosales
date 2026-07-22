#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════
// Guard "@ts-nocheck no crece" — ratchet de deuda de tipos
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ EXISTE (2026-07-21):
//   `npx tsc --noEmit` da 0 errores, y eso suena a "el repo está tipado". No lo
//   está: 290 de 810 archivos `.ts/.tsx` (36%) empiezan con `@ts-nocheck`, así
//   que tsc ni los mira.
//
//   No es teórico. Ese mismo día se rompió una referencia en
//   `api/cron/warm-cache/route.ts` (se borró la variable que el JSON de respuesta
//   seguía usando) y `tsc --noEmit` pasó LIMPIO. Lo detectó `next build`, que sí
//   compila esos archivos. Un chequeo que dice OK sobre dos tercios del código y
//   se reporta como si fuera todo es peor que no tenerlo.
//
//   Y la concentración importa: 207 de los 290 están en `src/app/api` — las
//   rutas y los crons, o sea el código que corre solo, de noche, sin nadie
//   mirando. Es exactamente donde un error de tipos tarda semanas en aparecer.
//
// QUÉ HACE: falla si el número CRECE. No pide arreglar los 290 — pide que no
// haya un 291. Cuando bajen, bajar `BASELINE` (ratchet-down), igual que el
// allowlist de los otros guards.
//
// Uso: node scripts/check-ts-nocheck.mjs  (o npm run check:ts-nocheck)
// ══════════════════════════════════════════════════════════════════════════

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

// Medido el 2026-07-21. BAJARLO cuando se saquen archivos, nunca subirlo:
// subirlo es admitir deuda nueva y convierte el guard en decoración.
const BASELINE = 290;

// Sólo cuenta si está al principio de una línea: `// @ts-nocheck` es una
// directiva de compilador, mencionarla dentro de un comentario explicativo no.
const PATTERN = /^\s*\/\/\s*@ts-nocheck/m;

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const files = walk(SRC);
const offenders = files
  .filter((f) => PATTERN.test(readFileSync(f, "utf8")))
  .map((f) => relative(ROOT, f).replace(/\\/g, "/"));

const pct = ((offenders.length / files.length) * 100).toFixed(1);
console.log(
  `[ts-nocheck] ${offenders.length} de ${files.length} archivos (${pct}%) — baseline: ${BASELINE}`
);

// Dónde está concentrada la deuda: hace accionable el número.
const byArea = {};
for (const f of offenders) {
  const area = f.split("/").slice(0, 3).join("/");
  byArea[area] = (byArea[area] || 0) + 1;
}
const top = Object.entries(byArea)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5);
console.log("[ts-nocheck] concentración:");
for (const [area, n] of top) console.log(`    ${String(n).padStart(4)}  ${area}`);

if (offenders.length > BASELINE) {
  console.error(
    `\n❌ [ts-nocheck] la deuda de tipos CRECIÓ: ${offenders.length} > ${BASELINE}.`
  );
  console.error(
    `\n   Un archivo con @ts-nocheck es invisible para \`tsc --noEmit\`. Si el que\n` +
      `   agregaste es un cron o una ruta de API, es justo el peor lugar: corre\n` +
      `   solo y un error de tipos puede tardar semanas en manifestarse.\n\n` +
      `   Si es deuda heredada que MOVISTE (renombre/split), bajá y volvé a subir\n` +
      `   el BASELINE en el mismo commit explicando por qué. Si es código nuevo,\n` +
      `   tipalo: no hay razón para nacer sin tipos.`
  );
  process.exit(1);
}

if (offenders.length < BASELINE) {
  console.log(
    `\n✅ [ts-nocheck] bajó a ${offenders.length} (baseline ${BASELINE}).` +
      ` Actualizá BASELINE en este script para fijar la mejora.`
  );
  process.exit(0);
}

console.log("✅ [ts-nocheck] la deuda de tipos no creció.");
