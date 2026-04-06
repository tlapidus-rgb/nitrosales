import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

// POST: Seed initial memories (only if none exist)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const orgId = await getOrganizationId();

    // Check if memories already exist
    const existing = await prisma.botMemory.count({
      where: { organizationId: orgId },
    });

    if (existing > 0) {
      return NextResponse.json({
        message: `Ya existen ${existing} memorias. Seed cancelado.`,
        seeded: false,
      });
    }

    const seedMemories = [
      {
        category: "BUSINESS_RULE" as const,
        title: "Comparaciones estacionales siempre interanuales",
        content:
          "Para analizar ventas de períodos estacionales (abril=Pascua, agosto=Día del Niño, diciembre=Navidad), SIEMPRE comparar vs el mismo período del año anterior. Nunca comparar dos semanas distintas del mismo mes entre sí — es comparar peras con manzanas.",
        priority: 10,
        source: "SYSTEM",
        createdBy: "SYSTEM",
      },
      {
        category: "BUSINESS_RULE" as const,
        title: "Calendario comercial Argentina",
        content:
          "Hot Sale (mayo), CyberMonday (noviembre), Día del Niño (agosto), Black Friday (noviembre), Navidad/Reyes (diciembre-enero). Considerar estas fechas al analizar picos o caídas de ventas.",
        priority: 9,
        source: "SYSTEM",
        createdBy: "SYSTEM",
      },
      {
        category: "CONTEXT" as const,
        title: "Industria y estacionalidad del negocio",
        content:
          "El Mundo del Juguete es un ecommerce de juguetes en Argentina. La estacionalidad es fuerte: picos principales en Día del Niño (agosto) y Navidad (diciembre). Vuelta al cole (febrero-marzo) también tiene impacto.",
        priority: 8,
        source: "SYSTEM",
        createdBy: "SYSTEM",
      },
      {
        category: "BUSINESS_RULE" as const,
        title: "Pixel NitroSales es fuente de verdad",
        content:
          "Los datos del pixel propio de NitroSales son más confiables que GA4 o las plataformas de ads (Meta/Google) para atribución de ventas. Siempre priorizar datos del pixel cuando haya discrepancias.",
        priority: 9,
        source: "SYSTEM",
        createdBy: "SYSTEM",
      },
      {
        category: "PREFERENCE" as const,
        title: "Formato de análisis de ventas",
        content:
          "Cuando presentes datos de ventas, siempre mostrar: revenue total, cantidad de órdenes, ticket promedio, y comparación interanual (vs mismo período año anterior). Incluir también el % de crecimiento.",
        priority: 7,
        source: "SYSTEM",
        createdBy: "SYSTEM",
      },
    ];

    const created = await prisma.botMemory.createMany({
      data: seedMemories.map((m) => ({
        ...m,
        organizationId: orgId,
      })),
    });

    return NextResponse.json({
      message: `${created.count} memorias iniciales creadas.`,
      seeded: true,
      count: created.count,
    });
  } catch (e: any) {
    console.error("[memory/seed]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
