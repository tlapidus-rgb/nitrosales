import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/db/client";
import { getOrganization } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

// Industry-specific seasonality and calendar rules
const INDUSTRY_RULES: Record<string, { seasonality: string; calendar: string; tips: string }> = {
  juguetes: {
    seasonality: "Picos principales en Día del Niño (agosto) y Navidad (diciembre). Vuelta al cole (febrero-marzo) tiene impacto menor. Pascua genera ventas moderadas.",
    calendar: "Día del Niño (agosto), Navidad (diciembre), Reyes (enero), Pascua (variable), Vuelta al cole (febrero-marzo).",
    tips: "Los padres compran con anticipación para Navidad (noviembre). Día del Niño tiene pico 2 semanas antes del evento. Liquidación post-navidad en enero.",
  },
  moda: {
    seasonality: "Cambio de temporada es clave: primavera-verano (septiembre-octubre) y otoño-invierno (marzo-abril). Liquidaciones al final de cada temporada.",
    calendar: "Cambio temporada PV (septiembre), cambio temporada OI (marzo), Black Friday (noviembre), Hot Sale (mayo), Día de la Madre, San Valentín.",
    tips: "Las colecciones nuevas tienen mayor margen. Liquidación agresiva al final de temporada para liberar capital. Fast fashion requiere rotación rápida de inventario.",
  },
  electronica: {
    seasonality: "CyberMonday y Black Friday son los picos más fuertes. Navidad importante para regalos tech. Hot Sale genera buen volumen.",
    calendar: "Hot Sale (mayo), CyberMonday (noviembre), Black Friday (noviembre), Navidad (diciembre), Vuelta al cole (febrero - laptops/tablets).",
    tips: "Los productos tech tienen obsolescencia rápida. Lanzamientos de nuevas versiones (iPhone, Samsung) generan picos. El margen es bajo, el volumen es clave.",
  },
  alimentos: {
    seasonality: "Negocio más estable con menos estacionalidad. Picos en fiestas (Navidad, Pascua) y eventos sociales. Verano impulsa bebidas y helados.",
    calendar: "Pascua (canastas), Navidad/Año Nuevo (canastas gourmet), Día del Amigo (julio), fechas deportivas (snacks).",
    tips: "La frecuencia de compra es alta pero el ticket promedio es bajo. Foco en retención y suscripciones. Logística de cadena de frío si aplica.",
  },
  belleza: {
    seasonality: "Día de la Madre y San Valentín son picos. Navidad para sets de regalo. Cambio de estación afecta skincare.",
    calendar: "San Valentín (febrero), Día de la Madre (mayo/octubre), Hot Sale (mayo), CyberMonday (noviembre), Navidad.",
    tips: "Los kits y sets de regalo tienen mejor margen. El cross-selling es alto (compran base + complementos). Los tutoriales y UGC impulsan ventas.",
  },
  deportes: {
    seasonality: "Verano e inicio de año (propósitos) son picos. Eventos deportivos grandes (Mundial, Juegos Olímpicos) generan demanda.",
    calendar: "Enero (propósitos año nuevo), primavera (running/outdoor), eventos deportivos masivos, Black Friday.",
    tips: "El equipamiento tiene ciclos de reemplazo. La ropa deportiva se comporta como moda. Influencers fitness tienen alto impacto en conversión.",
  },
  hogar: {
    seasonality: "Mudanzas (marzo, julio) y renovación del hogar. Hot Sale y CyberMonday generan compras grandes de muebles/electrodomésticos.",
    calendar: "Marzo y julio (mudanzas), Hot Sale (mayo), CyberMonday (noviembre), Navidad (deco navideña).",
    tips: "El ticket promedio es alto pero la frecuencia baja. El costo de envío es relevante por el tamaño. Fotos de ambientación venden más que producto aislado.",
  },
  otro: {
    seasonality: "Depende del tipo de producto. Analizar datos históricos para identificar patrones estacionales propios.",
    calendar: "Hot Sale (mayo), CyberMonday (noviembre), Black Friday (noviembre), Navidad (diciembre) aplican a casi todos los rubros en Argentina.",
    tips: "Identificar los 3-4 momentos clave del año para tu rubro específico y planificar stock y publicidad con 4-6 semanas de anticipación.",
  },
};

const COUNTRY_CALENDARS: Record<string, string> = {
  argentina:
    "Enero: Reyes Magos (6/1), liquidaciones. Febrero: Vuelta al cole, San Valentín. Marzo: Inicio clases. Abril: Pascua. Mayo: Hot Sale, Día de la Madre (3er domingo). Junio: Día del Padre (3er domingo). Julio: Vacaciones invierno. Agosto: Día del Niño (2do/3er domingo). Septiembre: Primavera. Octubre: Halloween. Noviembre: CyberMonday + Black Friday. Diciembre: Navidad. Moneda: ARS.",
  mexico:
    "Febrero: San Valentín, Día de la Bandera. Marzo: Hot Sale MX. Mayo: Día de la Madre (10/5), Buen Fin (noviembre). Noviembre: Buen Fin + Black Friday. Diciembre: Navidad, Guadalupe-Reyes. Moneda: MXN.",
  colombia:
    "Marzo: Día de la Mujer. Mayo: Día de la Madre. Junio: Día del Padre, HotSale CO. Octubre: Halloween, Día de los Niños. Noviembre: CyberLunes + Black Friday. Diciembre: Navidad. Moneda: COP.",
  chile:
    "Mayo: Día de la Madre. Junio: Día del Padre. Septiembre: Fiestas Patrias. Octubre: CyberDay, CyberMonday. Noviembre: Black Friday. Diciembre: Navidad. Moneda: CLP.",
  otro:
    "Hot Sale, CyberMonday, Black Friday, y Navidad son eventos comerciales globales. Identificar las fechas clave de tu país específico.",
};

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const org = await getOrganization();
    const settings = (org as any).settings || {};
    const businessContext = settings.businessContext || null;

    return NextResponse.json({ businessContext, orgName: org.name });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const org = await getOrganization();
    const body = await req.json();
    const { industry, businessType, country, salesChannels, adChannels, businessStage } = body;

    if (!industry || !businessType || !country) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
    }

    const businessContext = {
      industry,
      businessType,
      country,
      salesChannels: salesChannels || [],
      adChannels: adChannels || [],
      businessStage: businessStage || "growth",
      completedAt: new Date().toISOString(),
    };

    // Save to Organization.settings (CRITICAL — this must succeed)
    const currentSettings = (org as any).settings || {};
    await prisma.organization.update({
      where: { id: org.id },
      data: {
        settings: { ...currentSettings, businessContext },
      },
    });

    // Auto-generate memories (non-blocking — if this fails, onboarding still succeeds)
    let memoriesCreated = 0;
    try {
      // Delete old SYSTEM seed memories
      await prisma.botMemory.deleteMany({
        where: { organizationId: org.id, source: "SYSTEM" },
      });

      // Auto-generate memories based on answers
      const industryKey = industry.toLowerCase();
      const countryKey = country.toLowerCase();
      const rules = INDUSTRY_RULES[industryKey] || INDUSTRY_RULES["otro"];
      const calendar = COUNTRY_CALENDARS[countryKey] || COUNTRY_CALENDARS["otro"];

      const memories = [
        {
          category: "CONTEXT" as const,
          title: "Perfil del negocio",
          content: `${org.name} es un ${businessType} de ${industry} en ${country}. Etapa: ${businessStage}. Canales de venta: ${(salesChannels || []).join(", ") || "no especificados"}. Canales de publicidad: ${(adChannels || []).join(", ") || "no especificados"}.`,
          priority: 10,
        },
        {
          category: "BUSINESS_RULE" as const,
          title: `Estacionalidad del rubro ${industry}`,
          content: rules.seasonality,
          priority: 9,
        },
        {
          category: "BUSINESS_RULE" as const,
          title: `Calendario comercial ${country}`,
          content: calendar,
          priority: 9,
        },
        {
          category: "BUSINESS_RULE" as const,
          title: "Comparaciones estacionales siempre interanuales",
          content:
            "Para analizar ventas de períodos estacionales, SIEMPRE comparar vs el mismo período del año anterior. Nunca comparar dos semanas distintas del mismo mes entre sí — es comparar peras con manzanas.",
          priority: 10,
        },
        {
          category: "CONTEXT" as const,
          title: `Tips del rubro ${industry}`,
          content: rules.tips,
          priority: 7,
        },
      ];

      // Add channel-specific memory if they use ads
      if (adChannels && adChannels.length > 0) {
        memories.push({
          category: "BUSINESS_RULE" as const,
          title: "Pixel NitroSales es fuente de verdad",
          content:
            "Los datos del pixel propio de NitroSales son más confiables que GA4 o las plataformas de ads para atribución de ventas. Siempre priorizar datos del pixel cuando haya discrepancias.",
          priority: 9,
        });
      }

      const created = await prisma.botMemory.createMany({
        data: memories.map((m) => ({
          ...m,
          organizationId: org.id,
          source: "SYSTEM",
          createdBy: "ONBOARDING",
          updatedAt: new Date(),
        })),
      });
      memoriesCreated = created.count;
    } catch (memErr: any) {
      console.error("[onboarding/POST] Memory generation failed (non-fatal):", memErr.message);
      // Continue — businessContext was saved successfully
    }

    return NextResponse.json({
      success: true,
      businessContext,
      memoriesCreated,
    });
  } catch (e: any) {
    console.error("[onboarding/POST]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

