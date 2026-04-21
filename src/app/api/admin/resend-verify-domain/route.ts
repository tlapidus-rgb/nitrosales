// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/admin/resend-verify-domain
// ══════════════════════════════════════════════════════════════
// Dispara la verificación de un dominio en Resend. Usar despues de
// agregar los registros DNS en el provider (Hostinger).
// Body: { domain: "nitrosales.ai" }
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "RESEND_API_KEY no configurada" }, { status: 500 });

    const body = await req.json().catch(() => ({}));
    const domain = String(body.domain || "").trim().toLowerCase();
    if (!domain) return NextResponse.json({ error: "Falta domain" }, { status: 400 });

    // Buscar el id
    const listRes = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const listData = await listRes.json();
    const found = (listData?.data || []).find((d: any) => d.name === domain);
    if (!found) return NextResponse.json({ error: `No encontre dominio ${domain} en Resend` }, { status: 404 });

    // Dispara verify
    const verifyRes = await fetch(`https://api.resend.com/domains/${found.id}/verify`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const verifyData = await verifyRes.json();

    // Get status actual
    const getRes = await fetch(`https://api.resend.com/domains/${found.id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const detail = await getRes.json();

    return NextResponse.json({
      ok: verifyRes.ok,
      domain,
      id: found.id,
      status: detail?.status,
      records: (detail?.records || []).map((r: any) => ({
        type: r.type,
        name: r.name,
        status: r.status,
      })),
      verifyResponse: verifyData,
      hint:
        detail?.status === "verified"
          ? "✅ Dominio verificado — ya podés enviar emails desde @" + domain
          : "⏳ Todavía no está verificado. Esperá 5-15 min para propagación DNS y volvé a correr este endpoint.",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
