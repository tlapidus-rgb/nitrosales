// ══════════════════════════════════════════════════════════════
// GET /api/cron/alertas-clientes — que las alertas EMPUJEN
// ══════════════════════════════════════════════════════════════
// E-19.2. Los cuatro checks de `/api/admin/alertas` son de los mejores del
// repo — pixel caído habiendo tenido eventos, pixel nunca instalado, baja
// captura de identidad, y tráfico con cero compras (que en la práctica
// significa webhook de órdenes roto).
//
// Estaban escritos, funcionaban, y **no estaban en ningún cron**: eran una
// página que había que acordarse de abrir. Con cuatro clientes que Tomy conoce
// de memoria eso se sostiene; con veinte, un cliente con el pixel caído se
// entera él antes que nosotros.
//
// Esto los corre una vez por día y manda mail si hay algo. Nada más: la lógica
// de detección no se toca, se le pone el empujón que le faltaba.
//
// ── POR QUÉ SELF-FETCH Y NO IMPORTAR LA LÓGICA ───────────────────────────
// Los checks viven adentro del handler de `/api/admin/alertas`, en ~130 líneas
// de queries. Extraerlos a un módulo sería más prolijo, pero es un refactor con
// riesgo de cambiar sutilmente una detección que hoy anda — y el problema a
// resolver acá no es la forma del código, es que nadie los corre. El self-fetch
// es el mismo patrón que ya usan `warm-cache` y `refresh-pixel-first-source`.
//
// Si algún día hay que tocar los checks, ahí conviene extraerlos.
// ══════════════════════════════════════════════════════════════

import { registrarLatido } from "@/lib/cron/latido";
import { isValidAdminKey, ADMIN_API_KEY } from "@/lib/admin-key";
import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email/send";
import { selfFetchBaseUrl } from "@/lib/self-fetch";
import { destinatariosDeAlertas } from "@/lib/alertas/destinatarios";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Alerta = {
  severity: "critical" | "warning" | "info";
  category: string;
  title: string;
  description: string;
  orgName: string;
  orgSlug: string;
  metric: string | null;
};

/** Sólo se avisa por lo accionable. `info` es "el cliente todavía no instaló el
 * pixel", que en un alta reciente es lo normal y no amerita un mail diario. */
const SEVERIDADES_QUE_AVISAN = new Set(["critical", "warning"]);

function html(alertas: Alerta[]): string {
  const porSeveridad = (s: string) => alertas.filter((a) => a.severity === s);
  const bloque = (titulo: string, color: string, lista: Alerta[]) =>
    lista.length === 0
      ? ""
      : `<h3 style="color:${color};margin:18px 0 6px">${titulo}</h3><ul>${lista
          .map(
            (a) =>
              `<li><b>${a.orgName}</b> — ${a.title}<br><span style="opacity:.75">${a.description}</span></li>`,
          )
          .join("")}</ul>`;

  return `<p>Los chequeos por cliente encontraron esto:</p>
${bloque("🚨 Crítico", "#EF4444", porSeveridad("critical"))}
${bloque("⚠️ Atención", "#F59E0B", porSeveridad("warning"))}
<p style="opacity:.7;font-size:12px">Estos chequeos corren una vez por día. "Pixel caído" y "sin compras
en 7 días" casi siempre significan que se rompió el pixel o el webhook de órdenes de ese cliente.</p>`;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (!isValidAdminKey(url.searchParams.get("key"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const startedAt = Date.now();
  try {
    const target = `${selfFetchBaseUrl(url.origin)}/api/admin/alertas?key=${encodeURIComponent(ADMIN_API_KEY)}`;
    const r = await fetch(target, {
      cache: "no-store",
      // Bypass de Vercel Deployment Protection: sin esto el self-fetch a la URL
      // del deployment da 401. Mismo fix que en warm-cache.
      headers: process.env.VERCEL_AUTOMATION_BYPASS_SECRET
        ? { "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET }
        : undefined,
    });

    // Si la fase se pasa del maxDuration, Vercel devuelve HTML y `.json()`
    // explota con un mensaje que no dice nada. Se lee como texto primero.
    const crudo = await r.text();
    let json: any;
    try {
      json = JSON.parse(crudo);
    } catch {
      return NextResponse.json(
        { ok: false, error: `respuesta no-JSON de /api/admin/alertas (HTTP ${r.status})` },
        { status: 502 },
      );
    }
    if (!json?.ok) {
      return NextResponse.json(
        { ok: false, error: json?.error || `HTTP ${r.status}` },
        { status: 502 },
      );
    }

    const todas: Alerta[] = json.alertas ?? [];
    const accionables = todas.filter((a) => SEVERIDADES_QUE_AVISAN.has(a.severity));

    if (accionables.length > 0) {
      try {
        await sendEmail({
          to: destinatariosDeAlertas(),
          subject: `${json.summary.critical > 0 ? "🚨" : "⚠️"} NitroSales: ${accionables.length} cliente(s) con problemas`,
          html: html(accionables),
          context: "alertas-clientes",
        });
      } catch (e: any) {
        // Que falle el mail no puede tumbar el cron: el resultado igual queda
        // en la respuesta y en los logs.
        console.error("[alertas-clientes] no se pudo mandar el mail:", e?.message);
      }
    }

    await registrarLatido("alertas-clientes", true);
    return NextResponse.json({
      ok: true,
      summary: json.summary,
      avisadas: accionables.length,
      // Las `info` no generan mail pero sí se reportan acá.
      total: todas.length,
      durationMs: Date.now() - startedAt,
    });
  } catch (e: any) {
    await registrarLatido("alertas-clientes", false, String(e?.message ?? "error"));
    return NextResponse.json(
      { ok: false, error: String(e?.message).slice(0, 300), durationMs: Date.now() - startedAt },
      { status: 500 },
    );
  }
}
