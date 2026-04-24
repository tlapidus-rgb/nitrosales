// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/admin/onboardings/[id]/test-credentials
// ══════════════════════════════════════════════════════════════
// F1.3 — Test de credenciales del lado admin antes de aprobar el
// backfill. Lee las Connections de la org del onboarding (las que
// el cliente cargo en el wizard), las desencripta, y prueba cada
// una con la API real.
//
// Por que del lado admin y no del cliente: el cliente no debe ver
// fallas tecnicas ni mensajes de "credencial invalida" — eso genera
// dudas sobre el producto. El admin (Tomy) lo valida silenciosamente
// antes de aprobar el backfill. Si algo falla, le pide al cliente que
// corrija sin que sienta nada raro.
//
// Output:
// {
//   ok: true,
//   results: [
//     { platform: "VTEX", status: "ACTIVE", ok: true, detail: "12.450 ordenes", hint: "..." },
//     { platform: "META_ADS", status: "ACTIVE", ok: false, detail: "Token expirado", hint: "..." },
//     { platform: "MERCADOLIBRE", status: "ACTIVE", ok: true, detail: "OAuth valido (no aplica test manual)" },
//   ],
//   summary: { total: 3, passed: 2, failed: 1 },
// }
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import { decryptCredentials, isEncrypted } from "@/lib/crypto";
import { testCredentialsByPlatform, testNitroPixel } from "@/lib/onboarding/credential-tests";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const vtexTestSku = searchParams.get("sku")?.trim() || undefined;

    // Buscar el onboarding y su org
    const obRows = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT "id", "createdOrgId", "companyName" FROM "onboarding_requests" WHERE "id" = $1 LIMIT 1`,
      id
    );
    const ob = obRows[0];
    if (!ob) {
      return NextResponse.json({ error: "Onboarding no encontrado" }, { status: 404 });
    }
    if (!ob.createdOrgId) {
      return NextResponse.json(
        { error: "Este onboarding no tiene cuenta creada todavia (PENDING). Aprobá la cuenta primero." },
        { status: 400 }
      );
    }

    // Levantar Connections de la org
    const connections = await prisma.connection.findMany({
      where: { organizationId: ob.createdOrgId },
      select: { id: true, platform: true, status: true, credentials: true, lastSyncError: true },
    });

    if (connections.length === 0) {
      return NextResponse.json({
        ok: true,
        results: [],
        summary: { total: 0, passed: 0, failed: 0 },
        note: "El cliente todavía no completó el wizard (no hay connections en la DB).",
      });
    }

    const results: Array<any> = [];

    // Test cada Connection con su API real
    for (const conn of connections) {
      // Desencriptar credentials
      let creds: any = null;
      try {
        const raw = conn.credentials as any;
        if (typeof raw === "string" && isEncrypted(raw)) {
          creds = decryptCredentials(raw);
        } else if (typeof raw === "object" && raw !== null) {
          creds = raw;
        } else {
          creds = JSON.parse(raw);
        }
      } catch (e: any) {
        results.push({
          platform: conn.platform,
          connectionStatus: conn.status,
          ok: false,
          detail: "No se pudieron leer las credenciales (decrypt falló)",
          hint: e?.message,
        });
        continue;
      }

      const r = await testCredentialsByPlatform(conn.platform, creds, { vtexTestSku });
      results.push({
        platform: conn.platform,
        connectionStatus: conn.status,
        ok: r.ok,
        detail: r.detail,
        hint: r.hint,
        areas: (r as any).areas || undefined,
        lastSyncError: conn.lastSyncError || null,
      });
    }

    // Adicional: NitroPixel — chequea eventos en DB (no hay Connection)
    try {
      const pixelResult = await testNitroPixel(ob.createdOrgId, prisma);
      results.push({
        platform: "NITROPIXEL",
        connectionStatus: pixelResult.ok ? "ACTIVE" : "PENDING",
        ok: pixelResult.ok,
        detail: pixelResult.detail,
        hint: pixelResult.hint,
      });
    } catch (e: any) {
      results.push({
        platform: "NITROPIXEL",
        connectionStatus: "PENDING",
        ok: false,
        detail: "Error chequeando pixel: " + (e?.message || "?"),
      });
    }

    const passed = results.filter((r) => r.ok).length;
    const failed = results.length - passed;

    return NextResponse.json({
      ok: true,
      orgId: ob.createdOrgId,
      companyName: ob.companyName,
      results,
      summary: { total: results.length, passed, failed },
    });
  } catch (error: any) {
    console.error("[admin/onboardings/test-credentials] error:", error);
    return NextResponse.json({ error: error?.message || "Error interno" }, { status: 500 });
  }
}
