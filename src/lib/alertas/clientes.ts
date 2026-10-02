import { prisma } from "@/lib/db/client";

const MS_DAY = 24 * 60 * 60 * 1000;

type Severity = "critical" | "warning" | "info";

export interface Alerta {
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

/** Shared read-only checks for the staff panel and the authenticated cron. */
export async function obtenerAlertasClientes() {
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

    return {
      ok: true,
      summary,
      alertas,
      computedAt: now.toISOString(),
    };
}
