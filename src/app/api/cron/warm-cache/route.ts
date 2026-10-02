// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/cron/warm-cache
// ══════════════════════════════════════════════════════════════
// Pre-calienta el cache SWR de los endpoints visibles de Analytics
// (/api/metrics/pixel y /api/metrics/pixel/rate-summary) y products para
// todas las orgs activas con los rangos
// más usados. Asi cuando el cliente abre el dashboard, siempre
// encuentra cache fresh — nunca paga el costo completo de las queries.
//
// Trigger: Vercel Cron (configurado en vercel.json) cada 5 min para
// mantener el cache dentro del fresh window de api-cache (5 min).
// Tambien se puede ejecutar manualmente:
//   curl https://nitrosales.vercel.app/api/cron/warm-cache?key=...
//
// ⚠️ ANTI-THUNDERING-HERD (2026-06-12): warmea SECUENCIALMENTE (1 fetch a la
// vez). El SWR fue revertido una vez porque el warm-cron viejo hacia
// `Promise.all(orgs.map(...))` = N orgs en paralelo × queries pesadas →
// saturaba la DB (pool 24). Ahora es estrictamente secuencial: org → rango →
// endpoint, uno por uno, con presupuesto de tiempo. Toca cada key; el SWR se
// encarga de refrescar las stale en background.
//
// ⚠️ LIMITACIÓN SERVERLESS: el cache de api-cache es in-memory POR INSTANCIA.
// El self-fetch calienta la instancia que atienda el request (no siempre la del
// cron). Para tráfico bajo Vercel reusa pocas instancias calientes, así que en
// la práctica ayuda. Solución multi-instancia completa = cache compartido (KV).
// ══════════════════════════════════════════════════════════════

import { registrarLatido } from "@/lib/cron/latido";
import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/db/client";
import { planDeWarm } from "@/lib/cache/warm-plan";
import { purgeExpiredSharedCache } from "@/lib/api-cache-shared";
import { purgeCreatorPasswordAttempts } from "@/lib/creator-password-cleanup";
import { credencialInterna, HEADER_CREDENCIAL_INTERNA } from "@/lib/credencial-interna";
import { sendEmail } from "@/lib/email/send";
import {
  checkPipelineFreshness,
  formatStaleSummary,
  type FreshnessRow,
  PIPELINE_FRESHNESS_TARGETS,
} from "@/lib/pipeline/freshness";
import { destinatariosDeAlertas } from "@/lib/alertas/destinatarios";
import { ADMIN_API_KEY, isValidAdminKey } from "@/lib/admin-key";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — warm de N orgs puede tardar

const WARM_CACHE_KEY = ADMIN_API_KEY;

// ── BP-ROLLUP-CRON (2026-06-21): alerta de rollup stale ──────────────────────
// El cron `refresh-pixel-rollups` (cada 2h) puede dejar de dispararse en Vercel
// sin aviso (pasó del 16 al 21-jun: 5 días con los gráficos del pixel en 0 y
// nadie se enteró hasta que se quejó el cliente). warm-cache corre cada 5 min →
// es buen lugar para detectarlo. Si el último refresh del rollup tiene más de
// los umbrales por tabla, log + email (con cooldown para no spamear cada 5 min).
// Los umbrales viven en src/lib/pipeline/freshness.ts, uno por tabla.
const ALERT_COOLDOWN_H = 6;
// E-19.3: la casilla se resuelve en un solo lugar y acepta varias.
// Sin ALERTAS_EMAILS ni ADMIN_EMAIL seteadas, es exactamente la de antes.

// Cooldown en memoria (módulo). No depende de ninguna tabla. En serverless,
// Vercel reusa instancias calientes para crons frecuentes, así que en la
// práctica evita el spam cada 5 min. Si rotan instancias podría mandar algún
// mail extra dentro de la ventana — aceptable para una alerta de respaldo rara.
let lastRollupAlertSent = 0;
let rollupAlertInFlight = false;

/**
 * Alerta de tablas del pipeline sin refrescar.
 *
 * Antes miraba UNA tabla (`pixel_daily_aggregates`), y se construyó después de
 * que ese rollup estuviera caído 5 días en junio. La lección no se había
 * transferido a las 6 tablas Silver/Gold que hoy respaldan el header de revenue
 * (auditoría 2026-07-21, A2): no tenían ningún monitoreo.
 *
 * El caso que esto tiene que atrapar no es "el cron explota" —eso queda en los
 * logs— sino "el cron deja de existir". `refresh-pixel-first-source` estuvo
 * CINCO SEMANAS fuera de vercel.json y la brecha creció todos los días sin que
 * nada avisara.
 */
async function maybeAlertPipelineStale(stale: FreshnessRow[]) {
  if (stale.length === 0) return "sin-alertas";
  if (rollupAlertInFlight) return "pendiente";
  if (lastRollupAlertSent > 0 && Date.now() - lastRollupAlertSent < ALERT_COOLDOWN_H * 3600_000) return "cooldown";

  const lines = stale
    .map((r) => {
      // E-19: desde que el chequeo agrupa por organización, se puede decir QUÉ
      // CLIENTE está congelado. Antes el mail decía "la tabla X está atrasada",
      // que con un solo cliente roto entre veinte no alcanzaba para actuar: había
      // que ir a buscar cuál a mano. Ahora los nombra, ordenados por atraso.
      const orgs = r.orgsStale ?? [];
      const detalleOrgs =
        orgs.length > 0
          ? `<br><span style="opacity:.75">Organizaciones: ${orgs
              .slice()
              .sort((a, b) => b.hours - a.hours)
              .map((o) => `<code>${o.org}</code> (${o.hours}h)`)
              .join(", ")}</span>`
          : r.porOrg === false
            ? `<br><span style="opacity:.6">(medida global: no se encontró la columna de organización)</span>`
            : "";
      return `<li><code>${r.table}</code>: la peor organización lleva <b>${r.hoursStale}h</b> sin refrescar (último: ${
        r.lastRefresh || "?"
      }) — lo refresca <code>${r.refreshedBy}</code>${detalleOrgs}</li>`;
    })
    .join("");
  const crons = Array.from(new Set(stale.map((r) => r.refreshedBy)));
  rollupAlertInFlight = true;
  try {
    const result = await sendEmail({
      to: destinatariosDeAlertas(),
      subject: `⚠️ NitroSales: ${stale.length} tabla(s) del pipeline sin refrescar`,
      html: `<p>Estas tablas dejaron de actualizarse:</p><ul>${lines}</ul>
<p>Causa más probable: uno de estos crons dejó de dispararse en Vercel — ${crons
        .map((c) => `<code>${c}</code>`)
        .join(", ")}. Ojo que un cron REMOVIDO de <code>vercel.json</code> no falla ni deja logs: simplemente no pasa nada, y los números se quedan viejos en silencio.</p>
<p>Acción: revisar <b>Vercel → Cron Jobs</b> y confirmar que sigan agendados. Los rollups son idempotentes: en cuanto vuelvan a correr, tapan el hueco solos.</p>`,
      context: "pipeline-stale-alert",
    });
    if (!result.ok) return "fallo";
    lastRollupAlertSent = Date.now();
    return "enviada";
  } catch (e: any) {
    console.error("[warm-cache] alert pipeline stale falló:", e?.message);
    return "fallo";
  } finally {
    rollupAlertInFlight = false;
  }
}

// ── WATCHDOG self-healing de rollups (2026-08-19, BP-ROLLUP-STUCK) ───────────
// Defensa DIRECTA contra que Vercel saltee el cron `refresh-pixel-rollups` (se
// observó un gap de ~2.3h sin firing, que combinado con un bug de cursor dejó
// tablas stale >5h y mandó mails al cliente). El umbral de alerta ahora es 8h,
// pero no queremos ESPERAR a las 8h: si una tabla del pixel se atrasa más que un
// ciclo normal de rotación (~1.75h) pero antes del umbral, disparamos el cron de
// rollups nosotros mismos. warm-cache corre cada 5 min → la recuperación deja de
// depender de que Vercel dispare el cron de 15 min a horario. El cron procesa la
// tabla MÁS atrasada por corrida y es idempotente, así que re-disparar es seguro:
// corridas sucesivas de warm-cache van tapando una tabla por vez.
const ROLLUP_SELF_HEAL_TRIGGER_H = 2.5; // > ciclo normal (~1.75h), < alerta (8h)
const ROLLUP_TRIGGER_COOLDOWN_MS = 4 * 60_000; // no re-disparar sobre una corrida en curso (~192s)
let lastRollupTriggerAt = 0;

function maybeSelfHealRollups(freshness: FreshnessRow[], baseUrl: string) {
  const behind = freshness.filter(
    (r) =>
      r.refreshedBy === "refresh-pixel-rollups" &&
      (r.hoursStale ?? 0) >= ROLLUP_SELF_HEAL_TRIGGER_H
  );
  if (behind.length === 0) return;
  if (Date.now() - lastRollupTriggerAt < ROLLUP_TRIGGER_COOLDOWN_MS) return; // ya disparé hace poco
  lastRollupTriggerAt = Date.now(); // marcar ANTES del fetch (evita doble disparo en carrera)
  const worst = Math.max(...behind.map((r) => r.hoursStale ?? 0));
  console.log(
    `[warm-cache] self-heal: ${behind.length} rollup(s) atrasado(s) (peor ${worst}h ≥ ${ROLLUP_SELF_HEAL_TRIGGER_H}h) → disparo refresh-pixel-rollups`
  );
  const target = `${baseUrl}/api/cron/refresh-pixel-rollups?key=${WARM_CACHE_KEY}`;
  // Fire-and-forget: NO esperamos los ~192s del rollup dentro de warm-cache.
  // waitUntil mantiene viva la request saliente después de responder (el rollup
  // corre como una invocación separada). Mismo bypass de Deployment Protection
  // que los self-fetch de warm (si no hay secret en local, no se manda header).
  waitUntil(
    fetch(target, {
      method: "GET",
      cache: "no-store",
      headers: process.env.VERCEL_AUTOMATION_BYPASS_SECRET
        ? { "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET }
        : undefined,
    })
      .then((r) => console.log(`[warm-cache] self-heal rollups: HTTP ${r.status}`))
      .catch((e) => console.error(`[warm-cache] self-heal rollups falló: ${e?.message}`))
  );
}

// Rangos comunes que precalentamos para cada org.
// Formato: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }
function getRanges() {
  const now = new Date();
  // Argentina TZ -3
  const arNow = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const today = new Date(arNow);
  today.setUTCHours(0, 0, 0, 0);

  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  return [
    // Hoy
    { label: "today", from: fmt(today), to: fmt(today) },
    // Ayer
    { label: "yesterday", from: fmt(yesterday), to: fmt(yesterday) },
    // Ultimos 7 dias
    { label: "7d", from: fmt(sevenDaysAgo), to: fmt(today) },
    // Ultimos 14 dias — es un rango visible en Analytics y debe compartir
    // la misma entrada precalentada que la pantalla.
    { label: "14d", from: fmt(fourteenDaysAgo), to: fmt(today) },
    // Ultimos 30 dias
    { label: "30d", from: fmt(thirtyDaysAgo), to: fmt(today) },
  ];
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    // Auth: SÓLO por key. El bypass por `user-agent: vercel-cron` (spoofeable) se
    // quitó (auditoría 2026-07-22): Vercel Cron manda la key en vercel.json.
    if (!isValidAdminKey(key)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const baseUrl = `${url.protocol}//${url.host}`;
    const ranges = getRanges();

    // Presupuesto de tiempo desde EL PRINCIPIO de la función (incluye la query de
    // activeOrgs). BUG PREVIO: startedAt se seteaba DESPUÉS de esa query; si tardaba
    // (scan de pixel_events), ese tiempo NO contaba y budget(250s) + query se pasaban
    // del maxDuration=300 → 504. Ahora todo el trabajo entra en el presupuesto.
    const startedAt = Date.now();

    // Listar orgs ACTIVAS — con al menos 1 evento pixel en los últimos 30 días.
    // EXISTS (no JOIN+DISTINCT): corta en la 1ra fila por org → mucho más barato
    // sobre pixel_events (evita el scan/dedup que arrastraba la función hacia el wall).
    // Analytics omite `model` y el endpoint resuelve el modelo por defecto desde
    // settings de la organización. El warm debe usar la misma forma de URL para
    // escribir la clave `orgdefault`; enviar `model=NITRO` dejaba una entrada que
    // la pantalla nunca podía reutilizar cuando la org tenía otro modelo.
    const activeOrgs = await prisma.$queryRawUnsafe<
      Array<{ id: string; name: string }>
    >(`
      SELECT o.id, o.name
      FROM organizations o
      WHERE EXISTS (
        SELECT 1 FROM pixel_events pe
        WHERE pe."organizationId" = o.id
          AND pe.timestamp > NOW() - INTERVAL '30 days'
      )
      ORDER BY o.id
    `);

    const results: Array<{
      orgId: string;
      orgName: string;
      endpoint: string;
      range: string;
      ms: number;
      ok: boolean;
      error?: string;
    }> = [];

    // Endpoints con SWR a precalentar. rate-summary se apoya en rollups/Silver,
    // pero en una función/DB fría todavía puede sumar 4-7s al cambio de rango.
    // Va antes de products para priorizar los dos bloques visibles de Analytics.
    // No se incluyen funnel/lag: sus fallbacks pueden consumir varios segundos
    // por org y multiplicar innecesariamente la carga secuencial del cron.
    const endpoints = [
      "/api/metrics/pixel",
      "/api/metrics/pixel/rate-summary",
      "/api/nitropixel/asset-stats",
      "/api/metrics/products",
    ];

    // SECUENCIAL: org → rango → endpoint, un fetch a la vez (anti-herd).
    // Timeout POR fetch: un self-fetch colgado NO puede bloquear la función entera.
    // El chequeo de presupuesto es ENTRE fetches, no puede cortar uno en vuelo → por
    // eso cada fetch tiene su propio AbortSignal. 20s ≤ el GLOBAL_TIMEOUT del pixel.
    const PER_FETCH_TIMEOUT_MS = 20_000;
    // 220s (desde el inicio de la función) + 20s del último fetch = 240s < 300
    // (maxDuration), con margen de sobra para la query de activeOrgs y el cierre.
    const TIME_BUDGET_MS = 220_000;
    let budgetHit = false;

    // E-12 — EL ORDEN IMPORTA MAS QUE LA VELOCIDAD ACA.
    // Antes el recorrido era organizacion -> rango -> endpoint: 8 fetches por
    // organizacion (4 rangos x 2 endpoints) con presupuesto para ~11 en total.
    // Con 4 clientes eso significaba que la primera se llevaba sus 8, la segunda
    // alcanzaba 3, y la tercera y la cuarta NO SE CALENTABAN NUNCA. Y sin
    // ORDER BY el orden lo elegia Postgres, en la practica estable: siempre las
    // mismas afuera. Con 20 clientes se calentaria el 7%.
    //
    // Ahora manda el RANGO: "hoy" para todas las organizaciones, despues "ayer"
    // para todas, y asi. Si el presupuesto corta, corta en un rango menos mirado
    // para todos, en vez de dejar clientes enteros sin nada. Y la organizacion
    // ROTA entre corridas (el cron corre cada 5 min), asi lo que igual queda
    // truncado no le toca siempre al mismo. La rotacion sale del reloj: no hay
    // cursor que persistir. Ver src/lib/cache/warm-plan.ts.
    const plan = planDeWarm({ orgs: activeOrgs, ranges, endpoints, ahoraMs: startedAt });

    outer: {
      for (const { org, range, endpoint } of plan) {
          if (Date.now() - startedAt > TIME_BUDGET_MS) { budgetHit = true; break outer; }
          const start = Date.now();
          // La clave pública ya no abre estas rutas: van con la credencial interna en
          // un header. metrics/pixel es CORE PROTEGIDO y sigue con la clave hasta que
          // se autorice el cambio (ver src/lib/credencial-interna.ts).
          const conClave = endpoint === "/api/metrics/pixel";
          const target = `${baseUrl}${endpoint}?orgId=${encodeURIComponent(
            org.id
          )}${conClave ? `&key=${WARM_CACHE_KEY}` : ""}&from=${range.from}&to=${range.to}`;
          const credencial = conClave ? null : credencialInterna("warm-cache");
          try {
            const r = await fetch(target, {
              method: "GET",
              cache: "no-store",
              // Corta el fetch si un endpoint se cuelga (ver PER_FETCH_TIMEOUT_MS).
              // El AbortError cae al catch de abajo → se registra como fail y sigue.
              signal: AbortSignal.timeout(PER_FETCH_TIMEOUT_MS),
              // Bypass de Vercel Deployment Protection (BP-ROLLUP-CRON / Fix 2b):
              // sin esto, cuando Vercel cron dispara warm-cache el self-fetch va a
              // la URL del deployment (protegida) y da 401. El secret lo provee
              // Vercel como System env var al activar "Protection Bypass for
              // Automation". En local (sin la env) no se manda header (no aplica).
              headers: {
                ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET
                  ? { "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET }
                  : {}),
                ...(credencial ? { [HEADER_CREDENCIAL_INTERNA]: credencial } : {}),
              },
            });
            results.push({
              orgId: org.id,
              orgName: org.name,
              endpoint,
              range: range.label,
              ms: Date.now() - start,
              ok: r.ok,
              error: r.ok ? undefined : `status ${r.status}`,
            });
          } catch (e: any) {
            results.push({
              orgId: org.id,
              orgName: org.name,
              endpoint,
              range: range.label,
              ms: Date.now() - start,
              ok: false,
              error: e.message?.slice(0, 100),
            });
          }
      }
    }

    for (const r of results) {
      if (!r.ok) console.warn(`[warm-cache] ${r.orgId} ${r.endpoint} ${r.range}: ${r.error}`);
    }
    const totalOk = results.filter((r) => r.ok).length;
    const totalFail = results.filter((r) => !r.ok).length;
    const totalMs = results.reduce((s, r) => s + r.ms, 0);
    const avgMs = results.length > 0 ? Math.round(totalMs / results.length) : 0;

    // ── Frescura de TODO el pipeline (Silver + Gold + rollups del pixel) ──
    // Antes sólo se miraba pixel_daily_aggregates. Ver src/lib/pipeline/freshness.ts.
    let freshness: FreshnessRow[] = [];
    let staleTables: FreshnessRow[] = [];
    let freshnessStatus: "completo" | "pendiente" | "fallo" = "pendiente";
    let alertaStatus = "sin-alertas";
    try {
      // El warm ya se comió hasta 220 s de los 300 de `maxDuration`. Lo que
      // sobra tiene que alcanzar para la frescura, el mail y la purga — y el
      // chequeo se volvió más caro (15 queries agrupadas por org + 4 de las
      // fuentes, contra 15 `MAX()` simples de antes).
      //
      // Si esto se pasa, Vercel mata la función y warm-cache no devuelve nada.
      // Y ahí abajo vive `maybeSelfHealRollups`: un chequeo de frescura
      // demasiado caro tumbaría al cron que recupera los rollups atrasados.
      const restanMs = 280_000 - (Date.now() - startedAt);
      freshness = await checkPipelineFreshness(undefined, {
        presupuestoMs: Math.max(5_000, restanMs - 20_000), // 20 s para el mail
      });
      const medidas = new Set(freshness.map(r => r.table));
      freshnessStatus = freshness.some(r => r.error) ? "fallo"
        : freshness.some(r => r.missing) || PIPELINE_FRESHNESS_TARGETS.some(t => !medidas.has(t.table))
          ? "pendiente" : "completo";
      staleTables = freshness.filter((r) => r.stale);
      // Watchdog: recuperación PROACTIVA de rollups atrasados ANTES de que crucen
      // el umbral de alerta (8h) — desacopla la recuperación del schedule de Vercel.
      maybeSelfHealRollups(freshness, baseUrl);
      if (staleTables.length > 0) {
        console.error(
          `[warm-cache] ⚠️ PIPELINE STALE:\n${formatStaleSummary(freshness)}`
        );
        // Solo intentar el mail si queda margen: sendEmail no tiene timeout y no
        // puede empujar la función sobre el maxDuration. Si no hay tiempo, se saltea
        // (el próximo run cada 5 min lo reintenta).
        if (Date.now() - startedAt < 260_000) {
          alertaStatus = await maybeAlertPipelineStale(staleTables);
        } else {
          alertaStatus = "pendiente";
        }
      }
    } catch (e: any) {
      freshnessStatus = "fallo";
      console.error("[warm-cache] check rollup stale falló:", e?.message);
    }

    // ── Purga de api_cache (E-04, 2026-09-05) ──────────────────────────────
    // `purgeExpiredSharedCache()` existía desde siempre, su docstring decía "lo
    // llama el cron de warm-cache"… y NO tenía ningún caller (verificado por grep
    // en el estudio de expansión). Resultado: `api_cache` sólo crecía. El espacio
    // de claves incluye el rango de fechas, así que se ensancha todos los días y
    // nunca se reusa — basura pura dentro de la misma DB cuyo working set ya no
    // entra en RAM. Es barato y va al final: si falla, no afecta al warm.
    // El chequeo de presupuesto es el mismo que usa el bloque de al lado para el
    // mail: si no queda tiempo, se saltea y la próxima corrida (5 min) lo hace.
    // La purga es acotada (ver PURGE_BATCH) pero igual no vale la pena arriesgar
    // el retorno de la función por limpiar caché.
    let cachePurged: number | null = null;
    if (Date.now() - startedAt < 260_000) {
      // `purgeExpiredSharedCache` no tira nunca: es fail-soft a propósito,
      // porque limpiar caché no puede tumbar al cron. Así que este `try` era
      // código muerto — y el `0` que devolvía al fallar era indistinguible de
      // "no había nada que borrar" (R-34).
      //
      // Ahora devuelve `-1` cuando falla, y eso sí se reporta: `api_cache`
      // creciendo en silencio es el bug que E-04 vino a arreglar.
      cachePurged = await purgeExpiredSharedCache();
      if (cachePurged > 0) {
        console.log(`[warm-cache] api_cache: ${cachePurged} entradas vencidas borradas`);
      } else if (cachePurged < 0) {
        console.error("[warm-cache] la purga de api_cache FALLÓ — la tabla sigue creciendo");
      }
    }

    const creatorAttemptsPurged = Date.now() - startedAt < 260_000
      ? await purgeCreatorPasswordAttempts() : null;

    const fallos = [
      ...(creatorAttemptsPurged !== null && creatorAttemptsPurged < 0 ? ["Falló la limpieza de contadores de creadores"] : []),
      ...(totalFail > 0 ? [`${totalFail} requests de warm fallidos`] : []),
      ...(freshnessStatus === "fallo" ? ["Falló el chequeo de frescura"] : []),
      ...(alertaStatus === "fallo" ? ["Falló el correo de frescura"] : []),
      ...(cachePurged !== null && cachePurged < 0 ? ["Falló la purga de caché"] : []),
    ];
    const ok = fallos.length === 0;
    const completo = ok && !budgetHit && freshnessStatus === "completo"
      && alertaStatus !== "pendiente" && cachePurged !== null && creatorAttemptsPurged !== null;
    await registrarLatido("warm-cache", ok, ok ? undefined : fallos.join("; "));
    return NextResponse.json({
      ok,
      completo,
      estado: !ok ? "fallo-parcial" : completo ? "completo" : "pendiente",
      fallos,
      freshnessStatus,
      alertaStatus,
      cachePurged,
      creatorAttemptsPurged,
      // Frescura de TODO el pipeline. `stale` lista sólo las atrasadas para que
      // se lea de un vistazo; `freshness` trae la foto completa (incluidas las
      // que todavía no existen, marcadas `missing`).
      stale: staleTables.map((r) => ({
        table: r.table,
        hoursStale: r.hoursStale,
        refreshedBy: r.refreshedBy,
      })),
      // El chequeo de expansión incluye ids por org. La respuesta del cron
      // conserva el resumen operativo; el detalle queda en logs y correo interno.
      freshness: freshness.map(({ orgsStale, orgsSinNingunDato, error, ...row }) => ({
        ...row,
        ...(orgsStale ? { orgsStaleCount: orgsStale.length } : {}),
        ...(orgsSinNingunDato ? { orgsSinNingunDatoCount: orgsSinNingunDato.length } : {}),
        ...(error ? { error: "No se pudo verificar esta tabla" } : {}),
      })),
      orgsPlanned: activeOrgs.length,
      orgsWarmed: new Set(results.filter(r => r.ok).map(r => r.orgId)).size,
      orgsFullyWarmed: activeOrgs.filter(org =>
        results.filter(r => r.orgId === org.id && r.ok).length === ranges.length * endpoints.length).length,
      rangesWarmed: ranges.length,
      endpointsWarmed: endpoints.length,
      totalRequests: results.length,
      ok_count: totalOk,
      fail_count: totalFail,
      avgMs,
      budgetHit,
      totalMs: Date.now() - startedAt,
      // Sin el id ni el nombre de la org: esta respuesta la recibe quien llama
      // con la clave (que está filtrada), y la lista de organizaciones activas es
      // justo lo que hace falta para pedir sus métricas. El detalle por org queda
      // en los logs (abajo), que no son públicos.
      results: results.map(({ orgId, orgName, error, ...r }) => ({ ...r, ...(error ? { error: "No se pudo calentar este endpoint" } : {}) })),
    });
  } catch (err: any) {
    // Decia `error`, que no existe en ningun scope de este archivo. El
    // `catch` lo tiene como `err`. Tirando un ReferenceError aca se comia
    // TODO lo que sigue: el console.error con el mensaje real y el 500. Y
    // encima no quedaba latido, asi que `checkCronesCaidos` iba a reportar
    // "nunca latio" en vez de "fallo". `@ts-nocheck` en la linea 1 es lo
    // que hizo que tsc no lo viera.
    await registrarLatido("warm-cache", false, String(err?.message ?? "error"));
    console.error("[warm-cache] error:", err);
    return NextResponse.json(
      { error: "No se pudo completar el calentamiento de caché" },
      { status: 500 }
    );
  }
}
