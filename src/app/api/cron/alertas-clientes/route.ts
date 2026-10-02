// Runs the shared client checks directly; staff API authentication stays independent.
import { registrarLatido } from "@/lib/cron/latido";
import { isValidAdminKey } from "@/lib/admin-key";
import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email/send";
import { obtenerAlertasClientes, type Alerta } from "@/lib/alertas/clientes";
import { destinatariosDeAlertas } from "@/lib/alertas/destinatarios";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
    const json = await obtenerAlertasClientes();

    const todas: Alerta[] = json.alertas ?? [];
    const accionables = todas.filter((a) => SEVERIDADES_QUE_AVISAN.has(a.severity));

    if (accionables.length > 0) {
      try {
        const enviado = await sendEmail({
          to: destinatariosDeAlertas(),
          subject: `${json.summary.critical > 0 ? "🚨" : "⚠️"} NitroSales: ${accionables.length} cliente(s) con problemas`,
          html: html(accionables),
          context: "alertas-clientes",
        });
        if (!enviado.ok) throw new Error("El proveedor no aceptó el correo de alertas");
      } catch (e: any) {
        // Preserve the check summary without claiming delivery succeeded.
        console.error("[alertas-clientes] no se pudo mandar el mail:", e?.message);
        await registrarLatido("alertas-clientes", false, "Falló el envío del correo de alertas");
        return NextResponse.json({ ok: false, sent: false, avisadas: 0,
          pendientesDeAvisar: accionables.length, summary: json.summary,
          error: "Falló el envío del correo de alertas" }, { status: 502 });
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
