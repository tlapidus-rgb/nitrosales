// ══════════════════════════════════════════════════════════════
// Backfill de inventario/catálogo VTEX — corre el sync en loop
// hasta que no queden SKUs pendientes.
// ══════════════════════════════════════════════════════════════
// Uso (PowerShell):
//   $env:SYNC_KEY = "<NEXTAUTH_SECRET>"
//   $env:ORG_ID   = "<id de la org, ej: EMDJ>"
//   node scripts/backfill-inventory.mjs
//
// Opcional: $env:BASE_URL (default https://app.nitrosales.ai)
//
// Contexto (2026-07-16): el cron tenía un bug de frontera (re-sincronizaba
// siempre el mismo prefijo del catálogo). Con el fix, este script completa
// el catálogo entero en una sentada en vez de esperar días de corridas.
// Cada iteración procesa ~40s de SKUs y devuelve pendingSkus.
// ══════════════════════════════════════════════════════════════

const BASE_URL = process.env.BASE_URL || "https://app.nitrosales.ai";
const SYNC_KEY = process.env.SYNC_KEY;
const ORG_ID = process.env.ORG_ID;

const MAX_ITERATIONS = 300; // corte de seguridad
const DELAY_MS = 3000; // respiro entre corridas (rate limit VTEX)

if (!SYNC_KEY || !ORG_ID) {
  console.error("Faltan variables: SYNC_KEY y ORG_ID son requeridas.");
  console.error('PowerShell: $env:SYNC_KEY = "..."; $env:ORG_ID = "..."');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  console.log(`Backfill de inventario → org ${ORG_ID} en ${BASE_URL}`);
  let totalProcessed = 0;

  for (let i = 1; i <= MAX_ITERATIONS; i++) {
    const url = `${BASE_URL}/api/sync/inventory?key=${encodeURIComponent(SYNC_KEY)}&org=${encodeURIComponent(ORG_ID)}`;
    let json;
    try {
      const res = await fetch(url);
      json = await res.json();
      if (!res.ok) {
        console.error(`[${i}] HTTP ${res.status}:`, json?.error || json);
        process.exit(1);
      }
    } catch (e) {
      console.error(`[${i}] Error de red: ${e.message} — reintento en ${DELAY_MS * 3}ms`);
      await sleep(DELAY_MS * 3);
      continue;
    }

    totalProcessed += json.processed || 0;
    const pending = json.pendingSkus ?? 0;
    console.log(
      `[${i}] procesados ${json.processed ?? 0} (total ${totalProcessed}) · pendientes ${pending} · ${json.message ?? ""}`,
    );

    if (json.isComplete || pending <= 0) {
      console.log(`✅ Catálogo completo (${totalProcessed} SKUs procesados en esta sesión).`);
      return;
    }
    await sleep(DELAY_MS);
  }

  console.warn(`⚠ Corte por MAX_ITERATIONS (${MAX_ITERATIONS}) — quedaron pendientes; volvé a correrlo.`);
}

run();
