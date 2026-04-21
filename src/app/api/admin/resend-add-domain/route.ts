// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/admin/resend-add-domain
// ══════════════════════════════════════════════════════════════
// Agrega un dominio a Resend via su API. Devuelve los registros DNS
// que hay que configurar en el DNS provider (Hostinger, Cloudflare, etc).
//
// Body: { domain: "nitrosales.ai", region?: "us-east-1" }
// Solo isInternalUser.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "RESEND_API_KEY no configurada" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const domain = String(body.domain || "").trim().toLowerCase();
    const region = String(body.region || "us-east-1").trim();

    if (!domain || !/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(domain)) {
      return NextResponse.json({ error: "domain inválido" }, { status: 400 });
    }

    // 1. Crear dominio en Resend
    let createRes = await fetch("https://api.resend.com/domains", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: domain, region }),
    });

    // Si ya existe, Resend tira 400/422 — en ese caso, listamos y devolvemos los records actuales
    let alreadyExists = false;
    if (!createRes.ok) {
      const errText = await createRes.text();
      if (createRes.status === 422 || /already exists|conflict/i.test(errText)) {
        alreadyExists = true;
      } else {
        return NextResponse.json(
          { error: `Resend ${createRes.status}: ${errText}` },
          { status: 500 }
        );
      }
    }

    let domainData: any = null;

    if (!alreadyExists) {
      domainData = await createRes.json();
    } else {
      // Listar todos y buscar el que coincide
      const listRes = await fetch("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!listRes.ok) {
        const errText = await listRes.text();
        return NextResponse.json(
          { error: `Resend list ${listRes.status}: ${errText}` },
          { status: 500 }
        );
      }
      const listData = await listRes.json();
      const found = (listData?.data || []).find(
        (d: any) => d.name === domain
      );
      if (!found) {
        return NextResponse.json(
          { error: "Dominio reporta existente pero no lo encontré en la lista" },
          { status: 500 }
        );
      }
      // Get detail (incluye records)
      const getRes = await fetch(`https://api.resend.com/domains/${found.id}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      domainData = await getRes.json();
    }

    // Formatear records legibles
    const records = (domainData?.records || []).map((r: any) => ({
      type: r.type,
      name: r.name,
      value: r.value,
      ttl: r.ttl || "Auto",
      priority: r.priority || null,
      status: r.status || null,
    }));

    return NextResponse.json({
      ok: true,
      alreadyExists,
      domain: domainData?.name,
      id: domainData?.id,
      region: domainData?.region,
      status: domainData?.status,
      records,
      hint:
        "Agregá estos registros en Hostinger (DNS zone editor). Después, POST /api/admin/resend-verify-domain con el mismo dominio para verificar.",
    });
  } catch (error: any) {
    console.error("[resend-add-domain] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
