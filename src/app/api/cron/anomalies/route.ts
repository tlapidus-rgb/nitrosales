import { anomalyPeriods } from "@/lib/anomaly/periods";
import { registrarLatido } from "@/lib/cron/latido";
import { NextRequest, NextResponse } from "next/server";
import { ultimoProcesado, arranqueDeLaVuelta, guardarCorte } from "@/lib/cron/cursor-store";
import { prisma } from "@/lib/db/client";
import { ordersValidWhere } from "@/domains/orders";
import { detectRuleBasedAnomalies, detectClaudeAnomalies, MetricSnapshot } from "@/lib/anomaly/detector";
import { sendEmail } from "@/lib/email/send";
import { anomalyAlertEmail, AnomalyForEmail } from "@/lib/email/templates";
import { isValidAdminKey } from "@/lib/admin-key";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Anomaly Detection Cron
 *
 * Runs daily (via Vercel cron or manual trigger).
 * 1. Fetches metrics for current vs previous 7-day period
 * 2. Runs rule-based detection (fast, no API cost)
 * 3. Runs Claude-based detection (contextual analysis)
 * 4. Stores anomalies as Insights in DB
 * 5. Sends email alert if HIGH priority anomalies found
 *
 * Auth: syncKey query param or Authorization header
 */
// E-02/E-11 (agregado el 2026-09-08). Mismo caso que `digest`: `maxDuration = 60`
// y un `for` sobre TODAS las orgs sin reloj, sin orden y sin cursor. E-05 le puso
// el aislamiento, que era la mitad. Con 20 clientes, a los de atras **no se les
// evaluan anomalias nunca** — y el sintoma es invisible, porque "0 anomalias" se
// lee igual que "todo bien".
const PRESUPUESTO_MS = 45_000; // de 60 s de maxDuration
const CRON = "anomalies";

export async function GET(req: NextRequest) {
  const arrancoEn = Date.now();
  // Auth check
  const { searchParams } = req.nextUrl;
  const syncKey = searchParams.get("key") || req.headers.get("authorization")?.replace("Bearer ", "");
  // ⚠️ FAIL-CLOSED (R-01, 2026-09-15). Antes era `syncKey !== process.env.SYNC_KEY`
  // a secas: si la env NO estaba seteada, las dos puntas valian `undefined` y
  // `undefined !== undefined` es **false**, asi que un GET sin `?key=` y sin
  // header ENTRABA. Con una clave incorrecta devolvia 401, o sea que solo se
  // abria mandando *nada* — ningun escaner que pruebe claves lo encontraba.
  //
  // Y no alcanza con agregar el guard de vacio: `vercel.json` manda
  // `?key=<ADMIN_API_KEY>` a estos cinco, NO `SYNC_KEY`. Cerrar solo la de
  // SYNC_KEY los dejaria a los cinco en 401, y un cron que devuelve 401 no
  // alerta a nadie (es el modo de falla de E-20).
  //
  // Por eso entran por cualquiera de las dos, y las dos son fail-closed:
  // `isValidAdminKey` cae a una clave aleatoria por proceso si la env falta, y
  // la de SYNC_KEY exige que exista ANTES de comparar.
  const porSyncKey =
    typeof process.env.SYNC_KEY === "string" &&
    process.env.SYNC_KEY.length > 0 &&
    syncKey === process.env.SYNC_KEY;
  if (!porSyncKey && !isValidAdminKey(syncKey)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get all active organizations
    const orgs = await prisma.organization.findMany({
      // Orden estable: sin esto el cursor no significa nada y "quien queda
      // afuera" lo elige Postgres.
      orderBy: { id: "asc" },
      select: { id: true, name: true, users: { select: { email: true }, where: { role: { in: ["OWNER", "ADMIN"] } } } },
    });

    const results: { orgId: string; orgName: string; anomalies: number; emailed: boolean }[] = [];
    const failures: { orgId: string; orgName: string; error: string }[] = [];

    const ids = orgs.map((o) => o.id);
    // `persiste` NO se descarta: dice si esta corrida tiene derecho a mover
    // el cursor del incremental. Una corrida manual con `?orgCursor=` no lo
    // tiene — si lo moviera, las orgs de atrás perderían su vuelta.
    const { desde, persiste: persisteCursor } = arranqueDeLaVuelta({
      ids,
      cursorGuardado: await ultimoProcesado(CRON),
      cursorExplicito: searchParams.get("orgCursor"),
      full: false,
    });
    let i = desde;
    let cortoPorReloj = false;

    for (; i < orgs.length; i++) {
      const org = orgs[i];
      if (Date.now() - arrancoEn > PRESUPUESTO_MS) {
        cortoPorReloj = true;
        break;
      }
      const ORG_ID = org.id;

      // E-05: aislamiento por organización. El `try` de arriba envuelve TODO el
      // loop, así que una org que explota cancelaba la detección de anomalías de
      // todas las que venían después — siempre las mismas, porque el orden es
      // estable. Y el síntoma es invisible: "0 anomalías" se lee como "todo bien".
      try {

      // ── Build metric snapshots ──
      const { fromCurrent, toCurrent, fromPrev, toPrev,
        currentDateFrom, currentDateTo, previousDateFrom, previousDateTo } = anomalyPeriods(new Date(arrancoEn));

      // Both periods must have known costs before comparing profitability.
      const coverage = async (from: Date, to: Date) => {
      const cogsCoverageResult = await prisma.$queryRaw<[{ total: string; with_cost: string }]>`
        SELECT
          COUNT(*)::text as total,
          COUNT(CASE WHEN oi.quantity > 0 AND COALESCE(oi."costPrice", p."costPrice") >= 0 THEN 1 END)::text as with_cost
        FROM orders o
        LEFT JOIN order_items oi ON oi."orderId" = o.id
        LEFT JOIN products p ON oi."productId" = p.id
        WHERE o."organizationId" = ${ORG_ID}
          AND ${ordersValidWhere("o")}
          AND o."orderDate" >= ${from}
          AND o."orderDate" < ${to}
      `;
      const totalItems = parseInt(cogsCoverageResult[0].total) || 0;
      const itemsWithCost = parseInt(cogsCoverageResult[0].with_cost) || 0;
      return totalItems > 0 && itemsWithCost >= 0 && itemsWithCost <= totalItems
        ? (itemsWithCost / totalItems) * 100 : 0;
      };
      const [cogsCoverage, previousCogsCoverage] = await Promise.all([
        coverage(fromCurrent, toCurrent), coverage(fromPrev, toPrev),
      ]);

      // Current period
      const [curRevResult, curCogsResult, curAdResult] = await Promise.all([
        prisma.$queryRaw<[{ revenue: string; orders: string }]>`
          SELECT
            COALESCE(SUM(o."totalValue"), 0)::text as revenue,
            COUNT(*)::text as orders
          FROM orders o
          WHERE o."organizationId" = ${ORG_ID}
            AND ${ordersValidWhere("o")}
            AND o."orderDate" >= ${fromCurrent}
            AND o."orderDate" < ${toCurrent}
        `,
        prisma.$queryRaw<[{ cogs: string }]>`
          SELECT COALESCE(SUM(
            oi.quantity * COALESCE(oi."costPrice", p."costPrice", 0)
          ), 0)::text as cogs
          FROM order_items oi
          INNER JOIN orders o ON oi."orderId" = o.id
          LEFT JOIN products p ON oi."productId" = p.id
          WHERE o."organizationId" = ${ORG_ID}
            AND ${ordersValidWhere("o")}
            AND o."orderDate" >= ${fromCurrent}
            AND o."orderDate" < ${toCurrent}
        `,
        prisma.$queryRaw<[{ spend: string; meta_spend: string; google_spend: string; conversions: string; conversion_value: string }]>`
          SELECT
            COALESCE(SUM(m.spend), 0)::text as spend,
            COALESCE(SUM(CASE WHEN m.platform = 'META' THEN m.spend ELSE 0 END), 0)::text as meta_spend,
            COALESCE(SUM(CASE WHEN m.platform = 'GOOGLE' THEN m.spend ELSE 0 END), 0)::text as google_spend,
            COALESCE(SUM(m.conversions), 0)::text as conversions,
            COALESCE(SUM(m."conversionValue"), 0)::text as conversion_value
          FROM ad_metrics_daily m
          WHERE m."organizationId" = ${ORG_ID}
            AND m.date >= ${currentDateFrom}::date
            AND m.date < ${currentDateTo}::date
        `,
      ]);

      // Previous period
      const [prevRevResult, prevCogsResult, prevAdResult] = await Promise.all([
        prisma.$queryRaw<[{ revenue: string; orders: string }]>`
          SELECT
            COALESCE(SUM(o."totalValue"), 0)::text as revenue,
            COUNT(*)::text as orders
          FROM orders o
          WHERE o."organizationId" = ${ORG_ID}
            AND ${ordersValidWhere("o")}
            AND o."orderDate" >= ${fromPrev}
            AND o."orderDate" < ${toPrev}
        `,
        prisma.$queryRaw<[{ cogs: string }]>`
          SELECT COALESCE(SUM(
            oi.quantity * COALESCE(oi."costPrice", p."costPrice", 0)
          ), 0)::text as cogs
          FROM order_items oi
          INNER JOIN orders o ON oi."orderId" = o.id
          LEFT JOIN products p ON oi."productId" = p.id
          WHERE o."organizationId" = ${ORG_ID}
            AND ${ordersValidWhere("o")}
            AND o."orderDate" >= ${fromPrev}
            AND o."orderDate" < ${toPrev}
        `,
        prisma.$queryRaw<[{ spend: string; meta_spend: string; google_spend: string; conversions: string; conversion_value: string }]>`
          SELECT
            COALESCE(SUM(m.spend), 0)::text as spend,
            COALESCE(SUM(CASE WHEN m.platform = 'META' THEN m.spend ELSE 0 END), 0)::text as meta_spend,
            COALESCE(SUM(CASE WHEN m.platform = 'GOOGLE' THEN m.spend ELSE 0 END), 0)::text as google_spend,
            COALESCE(SUM(m.conversions), 0)::text as conversions,
            COALESCE(SUM(m."conversionValue"), 0)::text as conversion_value
          FROM ad_metrics_daily m
          WHERE m."organizationId" = ${ORG_ID}
            AND m.date >= ${previousDateFrom}::date
            AND m.date < ${previousDateTo}::date
        `,
      ]);

      // Parse current
      const curRevenue = parseFloat(curRevResult[0].revenue);
      const curOrders = parseInt(curRevResult[0].orders);
      const curCogs = parseFloat(curCogsResult[0].cogs);
      const curAdSpend = parseFloat(curAdResult[0].spend);
      const curConversions = parseFloat(curAdResult[0].conversions);
      const curConvValue = parseFloat(curAdResult[0].conversion_value);

      const current: MetricSnapshot = {
        revenue: curRevenue,
        orders: curOrders,
        grossProfit: curRevenue - curCogs,
        grossMargin: curRevenue > 0 ? Math.round(((curRevenue - curCogs) / curRevenue) * 1000) / 10 : 0,
        adSpend: curAdSpend,
        metaSpend: parseFloat(curAdResult[0].meta_spend),
        googleSpend: parseFloat(curAdResult[0].google_spend),
        roas: curAdSpend > 0 ? Math.round((curConvValue / curAdSpend) * 100) / 100 : 0,
        cpa: curConversions > 0 ? Math.round((curAdSpend / curConversions) * 100) / 100 : 0,
        aov: curOrders > 0 ? Math.round(curRevenue / curOrders) : 0,
        cogsCoverage,
        adConversions: curConversions,
      };

      // Parse previous
      const prevRevenue = parseFloat(prevRevResult[0].revenue);
      const prevOrders = parseInt(prevRevResult[0].orders);
      const prevCogs = parseFloat(prevCogsResult[0].cogs);
      const prevAdSpend = parseFloat(prevAdResult[0].spend);
      const prevConversions = parseFloat(prevAdResult[0].conversions);
      const prevConvValue = parseFloat(prevAdResult[0].conversion_value);

      const previous: MetricSnapshot = {
        revenue: prevRevenue,
        orders: prevOrders,
        grossProfit: prevRevenue - prevCogs,
        grossMargin: prevRevenue > 0 ? Math.round(((prevRevenue - prevCogs) / prevRevenue) * 1000) / 10 : 0,
        adSpend: prevAdSpend,
        metaSpend: parseFloat(prevAdResult[0].meta_spend),
        googleSpend: parseFloat(prevAdResult[0].google_spend),
        roas: prevAdSpend > 0 ? Math.round((prevConvValue / prevAdSpend) * 100) / 100 : 0,
        cpa: prevConversions > 0 ? Math.round((prevAdSpend / prevConversions) * 100) / 100 : 0,
        aov: prevOrders > 0 ? Math.round(prevRevenue / prevOrders) : 0,
        cogsCoverage: previousCogsCoverage,
        adConversions: prevConversions,
      };

      // ── Detect anomalies ──
      const ruleAnomalies = detectRuleBasedAnomalies(current, previous);
      const claudeAnomalies = await detectClaudeAnomalies(current, previous, org.name);

      // Merge and deduplicate (prefer rule-based for same metric)
      const allAnomalies = [...ruleAnomalies];
      const ruleMetrics = new Set(ruleAnomalies.map(a => a.metric));
      for (const ca of claudeAnomalies) {
        if (!ruleMetrics.has(ca.metric)) {
          allAnomalies.push(ca);
        }
      }

      if (allAnomalies.length === 0) {
        results.push({ orgId: ORG_ID, orgName: org.name, anomalies: 0, emailed: false });
        continue;
      }

      // ── Store in DB as Insights ──
      const insightTypeMap: Record<string, "ALERT" | "OPPORTUNITY" | "TREND" | "RECOMMENDATION"> = {
        ALERT: "ALERT",
        OPPORTUNITY: "OPPORTUNITY",
        TREND: "TREND",
        RECOMMENDATION: "RECOMMENDATION",
      };
      const insightPriorityMap: Record<string, "HIGH" | "MEDIUM" | "LOW"> = {
        HIGH: "HIGH",
        MEDIUM: "MEDIUM",
        LOW: "LOW",
      };

      for (const anomaly of allAnomalies) {
        await prisma.insight.create({
          data: {
            organizationId: ORG_ID,
            type: insightTypeMap[anomaly.type] || "TREND",
            priority: insightPriorityMap[anomaly.priority] || "MEDIUM",
            title: anomaly.title,
            description: anomaly.description,
            action: anomaly.action,
            metric: anomaly.metric,
            metricValue: anomaly.metricValue,
            metricDelta: anomaly.metricDelta,
          },
        });
      }

      // ── Send email if HIGH priority anomalies ──
      const highPriority = allAnomalies.filter(a => a.priority === "HIGH");
      let emailed = false;
      if (highPriority.length > 0 && org.users.length > 0) {
        const emailAnomalies = allAnomalies.map(a => ({
          type: a.type,
          priority: a.priority,
          title: a.title,
          description: a.description,
          action: a.action,
          metric: a.metric,
          metricValue: a.metricValue,
          metricDelta: a.metricDelta,
        }));

        const { subject, html } = anomalyAlertEmail(org.name, emailAnomalies);
        const recipients = org.users.map(u => u.email);
        const result = await sendEmail({ to: recipients, subject, html });
        if (!result.ok) throw new Error("No se pudo entregar la alerta de anomalías");
        emailed = true;
      }

      results.push({
        orgId: ORG_ID,
        orgName: org.name,
        anomalies: allAnomalies.length,
        emailed,
      });
      } catch (e: any) {
        console.error(`[cron/anomalies] org ${org.name} (${ORG_ID}) falló:`, e?.message);
        failures.push({ orgId: ORG_ID, orgName: org.name, error: e?.message ?? String(e) });
      }
    }

    // E-05: ver digest. Ninguna org procesada + fallos = no es un exito.
    const todasFallaron = results.length === 0 && failures.length > 0;
    // Sólo el modo automático mueve el cursor. Ver `arranqueDeLaVuelta`.
    if (persisteCursor) {
      await guardarCorte(CRON, i, ids);
    }
    await registrarLatido("anomalies", failures.length === 0,
      failures.length ? `${failures.length} organizaciones con fallos` : undefined);
    return NextResponse.json({
      ok: !todasFallaron,
      completo: failures.length === 0 && !cortoPorReloj,
      estado: failures.length ? "fallo-parcial" : cortoPorReloj ? "pendiente" : "completo",
      timestamp: new Date().toISOString(),
      organizations: results,
      totalAnomalies: results.reduce((s, r) => s + r.anomalies, 0),
      // Con datos = a esos clientes NO se les evaluaron anomalías, aunque ok sea true.
      failures,
      arrancoEn: desde,
      cortoEn: i >= orgs.length ? 0 : i,
      cortoPorReloj,
    });
  } catch (error: any) {
    await registrarLatido("anomalies", false, String((error as any)?.message ?? "error"));
    console.error("[cron/anomalies] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
