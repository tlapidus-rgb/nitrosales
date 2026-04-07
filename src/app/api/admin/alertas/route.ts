// ══════════════════════════════════════════════════════════════
// Admin · Alertas Internas
// ──────────────────────────────────────────────────────────────
// GET /api/admin/alertas
// Devuelve clientes con problemas detectables que requieren
// intervención humana. Categorías:
//
//   1. CRITICAL — pixel sin eventos en >24h pero tuvo antes
//      (= probable ruptura del pixel)
//   2. SETUP    — pixel sin eventos NUNCA (cliente no instaló)
//   3. LOW_IDENTITY — orgs activas con <10% de visitors identificados
//      en los últimos 7 días (mala captura de email)
//   4. NO_PURCHASES — orgs con tráfico pero 0 PURCHASE en 7d
//      (probable ruptura del webhook o falta de tracking)
//
// Gateado por isInternalUser.
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MS_DAY = 24 * 60 * 60 * 1000;

type Severity = "critical" | "warning" | "info";

interface Alerta {
  id: string;
  severity: Severity;
  category: "CRITICAL" | "SETUP" | "LOW_IDENTITY" | "NO_PURCHASES";
  title: string;
  description: string;
  orgId: string;
  orgName: string;
  orgSlug: string;
  detectedAt: string;
  metric: string | null;
}

export async function GET() {
  try {
    const allowed = await isInternalUser();
    if (!allowed) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const now = new Date();
    const since24h = new Date(now.getTime() - MS_DAY);
    const since7d = new Date(now.getTime() - 7 * MS_DAY);

    // Pull all orgs once
    const orgs = await prisma.organization.findMany({
      select: { id: true, name: true, slug: true },
      orderBy: { createdAt: "desc" },
    });

    const alertas: Alerta[] = [];

    for (const org of orgs) {
      const [lastEvent, events24h, totalVisitors7d, identified7d, purchases7d] = await Promise.all([
        prisma.pixelEvent.findFirst({
          where: { organizationId: org.id },
          orderBy: { receivedAt: "desc" },
          select: { receivedAt: true },
        }),
        prisma.pixelEvent.count({
          where: {
            organizationId: org.id,
            receivedAt: { gte: since24h },
          },
        }),
        prisma.pixelVisitor.count({
          where: {
            organizationId: org.id,
            firstSeenAt: { gte: since7d },
          },
        }),
        prisma.pixelVisitor.count({
          where: {
            organizationId: org.id,
            firstSeenAt: { gte: since7d },
            email: { not: null },
          },
        }),
        prisma.pixelEvent.count({
          where: {
            organizationId: org.id,
            type: "PURCHASE",
            receivedAt: { gte: since7d },
          },
        }),
      ]);

      // 1. SETUP — sin eventos nunca
      if (!lastEvent) {
        alertas.push({
          id: `${org.id}-setup`,
          severity: "info",
          category: "SETUP",
          title: "Pixel sin instalar",
          description: "Esta organización nunca recibió eventos del NitroPixel.",
          orgId: org.id,
          orgName: org.name,
          orgSlug: org.slug,
          detectedAt: now.toISOString(),
          metric: null,
        });
        continue; // si no hay eventos, no chequees el resto
      }

      // 2. CRITICAL — sin eventos en 24h pero tuvo antes
      if (events24h === 0) {
        const ageHours = Math.round((now.getTime() - lastEvent.receivedAt.getTime()) / 3_600_000);
        alertas.push({
          id: `${org.id}-critical`,
          severity: "critical",
          category: "CRITICAL",
          title: "Pixel caído",
          description: `Sin eventos hace ${ageHours} horas. Probable ruptura del NitroPixel o del webhook.`,
          orgId: org.id,
          orgName: org.name,
          orgSlug: org.slug,
          detectedAt: now.toISOString(),
          metric: `${ageHours}h sin eventos`,
        });
      }

      // 3. LOW_IDENTITY — org activa con <10% identificados (mín 20 visitors)
      if (totalVisitors7d >= 20) {
        const ratio = identified7d / totalVisitors7d;
        if (ratio < 0.1) {
          alertas.push({
            id: `${org.id}-low-identity`,
            severity: "warning",
            category: "LOW_IDENTITY",
            title: "Captura de identidad baja",
            description: `Solo ${Math.round(ratio * 100)}% de visitors identificados (${identified7d}/${totalVisitors7d}). Revisar formularios y checkout.`,
            orgId: org.id,
            orgName: org.name,
            orgSlug: org.slug,
            detectedAt: now.toISOString(),
            metric: `${Math.round(ratio * 100)}%`,
          });
        }
      }

      // 4. NO_PURCHASES — eventos sí, compras 0 en 7d (con tráfico mínimo)
      if (events24h > 0 && totalVisitors7d >= 50 && purchases7d === 0) {
        alertas.push({
          id: `${org.id}-no-purchases`,
          severity: "warning",
          category: "NO_PURCHASES",
          title: "Sin compras tracked en 7 días",
          description: `Hay ${totalVisitors7d} visitors pero 0 PURCHASE events. Probable ruptura del webhook de órdenes.`,
          orgId: org.id,
          orgName: org.name,
          orgSlug: org.slug,
          detectedAt: now.toISOString(),
          metric: `0 / ${totalVisitors7d}`,
        });
      }
    }

    // Sort: critical → warning → info
    const severityOrder: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
    alertas.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    const summary = {
      total: alertas.length,
      critical: alertas.filter((a) => a.severity === "critical").length,
      warning: alertas.filter((a) => a.severity === "warning").length,
      info: alertas.filter((a) => a.severity === "info").length,
    };

    return NextResponse.json({
      ok: true,
      summary,
      alertas,
      computedAt: now.toISOString(),
    });
  } catch (e) {
    console.error("[/api/admin/alertas]", e);
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 }
    );
  }
}
