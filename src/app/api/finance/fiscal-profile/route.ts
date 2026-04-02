import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

// ── Province IIBB rates for retail ecommerce (2025-2026) ──
// Source: Leyes impositivas provinciales, ARBA, AGIP, etc.
// These are base rates for venta minorista / comercio electrónico.
// Users can override them after generation.
const IIBB_RATES: Record<string, { name: string; rate: number; notes: string }> = {
  CABA:             { name: "Ciudad de Buenos Aires", rate: 3.0,  notes: "3% hasta $2.004M anuales, 5% arriba (Ley Tarifaria 2026)" },
  BUENOS_AIRES:     { name: "Buenos Aires (Provincia)", rate: 2.5, notes: "2.5% base, puede ser 4-5% según ingresos (Ley 15479)" },
  CORDOBA:          { name: "Córdoba", rate: 4.75, notes: "Alícuota general alta; verificar con contador" },
  SANTA_FE:         { name: "Santa Fe", rate: 3.6, notes: "3.6% comercio minorista general" },
  MENDOZA:          { name: "Mendoza", rate: 2.5, notes: "2.5% comercio minorista" },
  TUCUMAN:          { name: "Tucumán", rate: 3.5, notes: "3.5% comercio general" },
  ENTRE_RIOS:       { name: "Entre Ríos", rate: 3.0, notes: "3% comercio minorista" },
  SALTA:            { name: "Salta", rate: 3.0, notes: "3% comercio general" },
  MISIONES:         { name: "Misiones", rate: 3.0, notes: "3% comercio general" },
  CORRIENTES:       { name: "Corrientes", rate: 2.0, notes: "Presión fiscal más baja" },
  CHACO:            { name: "Chaco", rate: 3.5, notes: "3.5% comercio minorista" },
  SAN_JUAN:         { name: "San Juan", rate: 2.5, notes: "2.5% comercio minorista" },
  SAN_LUIS:          { name: "San Luis", rate: 2.5, notes: "2.5% comercio general" },
  SANTIAGO_DEL_ESTERO: { name: "Santiago del Estero", rate: 3.0, notes: "3% alícuota general (Ley provincial)" },
  JUJUY:            { name: "Jujuy", rate: 4.0, notes: "Alícuota alta; verificar vigencia" },
  RIO_NEGRO:        { name: "Río Negro", rate: 2.0, notes: "Presión fiscal más baja" },
  NEUQUEN:          { name: "Neuquén", rate: 3.0, notes: "3% comercio general" },
  FORMOSA:          { name: "Formosa", rate: 1.0, notes: "1% - una de las más bajas del país" },
  CHUBUT:           { name: "Chubut", rate: 3.0, notes: "3% comercio general" },
  LA_PAMPA:         { name: "La Pampa", rate: 2.5, notes: "2.5% comercio minorista" },
  CATAMARCA:        { name: "Catamarca", rate: 3.0, notes: "3% comercio general" },
  LA_RIOJA:         { name: "La Rioja", rate: 2.5, notes: "2.5% comercio general" },
  SANTA_CRUZ:       { name: "Santa Cruz", rate: 2.0, notes: "Presión fiscal más baja" },
  TIERRA_DEL_FUEGO: { name: "Tierra del Fuego", rate: 1.5, notes: "Beneficios fiscales especiales" },
};

// Monotributo monthly amounts by category (2026 approx.)
const MONOTRIBUTO_CATEGORIES: Record<string, { maxRevenue: string; monthlyAmount: number }> = {
  A: { maxRevenue: "$2.108.288", monthlyAmount: 14415 },
  B: { maxRevenue: "$3.133.941", monthlyAmount: 16344 },
  C: { maxRevenue: "$4.387.518", monthlyAmount: 18799 },
  D: { maxRevenue: "$5.449.094", monthlyAmount: 23646 },
  E: { maxRevenue: "$6.416.528", monthlyAmount: 31557 },
  F: { maxRevenue: "$8.020.660", monthlyAmount: 38276 },
  G: { maxRevenue: "$9.624.792", monthlyAmount: 45454 },
  H: { maxRevenue: "$11.916.410", monthlyAmount: 78042 },
  I: { maxRevenue: "$13.337.213", monthlyAmount: 105765 },
  J: { maxRevenue: "$15.285.088", monthlyAmount: 121818 },
  K: { maxRevenue: "$16.957.968", monthlyAmount: 138233 },
};

interface FiscalProfile {
  taxRegime: "MONOTRIBUTO" | "RESPONSABLE_INSCRIPTO";
  monotributoCategory?: string;
  province: string;
  hasConvenioMultilateral: boolean;
  additionalProvinces?: string[];
  sellsOnMarketplace: boolean;
  completedAt?: string;
}

interface GeneratedTax {
  name: string;
  category: string;
  rateType: "FIXED_MONTHLY" | "PERCENTAGE";
  rateBase?: string;
  amount: number;
  notes: string;
  source: "auto";
}

/**
 * GET /api/finance/fiscal-profile
 * Returns the fiscal profile and provinces list
 */
export async function GET() {
  const orgId = await getOrganizationId();

  try {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { settings: true },
    });

    const settings = (org?.settings as Record<string, unknown>) || {};
    const fiscalProfile = (settings.fiscalProfile as FiscalProfile) || null;

    return NextResponse.json({
      fiscalProfile,
      provinces: Object.entries(IIBB_RATES).map(([code, info]) => ({
        code,
        name: info.name,
        rate: info.rate,
        notes: info.notes,
      })),
      monotributoCategories: Object.entries(MONOTRIBUTO_CATEGORIES).map(([cat, info]) => ({
        category: cat,
        maxRevenue: info.maxRevenue,
        monthlyAmount: info.monthlyAmount,
      })),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/finance/fiscal-profile
 * Saves the fiscal profile and generates tax costs
 */
export async function POST(req: NextRequest) {
  const orgId = await getOrganizationId();

  try {
    const body = (await req.json()) as FiscalProfile;

    // Validate required fields
    if (!body.taxRegime || !body.province) {
      return NextResponse.json(
        { error: "Régimen y provincia son requeridos" },
        { status: 400 }
      );
    }

    // Save fiscal profile to organization settings
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { settings: true },
    });
    const currentSettings = (org?.settings as Record<string, unknown>) || {};

    await prisma.organization.update({
      where: { id: orgId },
      data: {
        settings: {
          ...currentSettings,
          fiscalProfile: {
            ...body,
            completedAt: new Date().toISOString(),
          },
        },
      },
    });

    // Generate tax costs based on profile
    const taxes = generateTaxes(body);

    return NextResponse.json({
      saved: true,
      generatedTaxes: taxes,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * PUT /api/finance/fiscal-profile
 * Applies the generated taxes to manual-costs in the FISCAL category
 */
export async function PUT(req: NextRequest) {
  const orgId = await getOrganizationId();

  try {
    const { taxes, month } = (await req.json()) as {
      taxes: GeneratedTax[];
      month: string;
    };

    if (!taxes || !month) {
      return NextResponse.json(
        { error: "taxes y month son requeridos" },
        { status: 400 }
      );
    }

    // Delete existing auto-generated fiscal costs for this month
    await prisma.$executeRaw`
      DELETE FROM manual_costs
      WHERE "organizationId" = ${orgId}
        AND category = 'FISCAL'
        AND month = ${month}
        AND notes LIKE '%[auto-fiscal]%'
    `;

    // Insert new auto-generated costs
    let created = 0;
    for (const tax of taxes) {
      await prisma.$executeRaw`
        INSERT INTO manual_costs ("id", "organizationId", "category", "name", "amount", "rateType", "rateBase", "type", "month", "notes", "createdAt", "updatedAt")
        VALUES (
          ${generateCuid()},
          ${orgId},
          'FISCAL',
          ${tax.name},
          ${tax.amount},
          ${tax.rateType},
          ${tax.rateBase || null},
          'FIXED',
          ${month},
          ${tax.notes + " [auto-fiscal]"},
          NOW(),
          NOW()
        )
      `;
      created++;
    }

    return NextResponse.json({ created, month });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ── Tax Generation Logic ──

function generateTaxes(profile: FiscalProfile): GeneratedTax[] {
  const taxes: GeneratedTax[] = [];

  if (profile.taxRegime === "MONOTRIBUTO") {
    // Monotributista: single fixed payment
    const cat = profile.monotributoCategory || "A";
    const catInfo = MONOTRIBUTO_CATEGORIES[cat];
    taxes.push({
      name: `Monotributo Cat. ${cat}`,
      category: "FISCAL",
      rateType: "FIXED_MONTHLY",
      amount: catInfo?.monthlyAmount || 14415,
      notes: `Cuota mensual Monotributo categoría ${cat} (incluye IVA, IIBB, Ganancias, obra social)`,
      source: "auto",
    });
  } else {
    // Responsable Inscripto

    // 1. IIBB provincial (primary province)
    const provInfo = IIBB_RATES[profile.province];
    if (provInfo) {
      taxes.push({
        name: `IIBB ${provInfo.name}`,
        category: "FISCAL",
        rateType: "PERCENTAGE",
        rateBase: "GROSS_REVENUE",
        amount: provInfo.rate,
        notes: `Ingresos Brutos ${provInfo.name}: ${provInfo.rate}%. ${provInfo.notes}`,
        source: "auto",
      });
    }

    // 2. Additional provinces if Convenio Multilateral
    if (profile.hasConvenioMultilateral && profile.additionalProvinces) {
      for (const prov of profile.additionalProvinces) {
        const addProvInfo = IIBB_RATES[prov];
        if (addProvInfo && prov !== profile.province) {
          taxes.push({
            name: `IIBB ${addProvInfo.name} (CM)`,
            category: "FISCAL",
            rateType: "PERCENTAGE",
            rateBase: "GROSS_REVENUE",
            amount: addProvInfo.rate,
            notes: `Convenio Multilateral - ${addProvInfo.name}: ${addProvInfo.rate}%. Ajustar coeficiente según distribución de ventas.`,
            source: "auto",
          });
        }
      }
    }

    // 3. ML-specific withholdings if sells on marketplace
    if (profile.sellsOnMarketplace) {
      taxes.push({
        name: "Percepciones IIBB MercadoLibre",
        category: "FISCAL",
        rateType: "PERCENTAGE",
        rateBase: "MELI_REVENUE",
        amount: 2.0,
        notes: "MercadoLibre retiene 2% sobre ventas brutas como percepción de IIBB",
        source: "auto",
      });

      taxes.push({
        name: "Percepción IVA MercadoLibre",
        category: "FISCAL",
        rateType: "PERCENTAGE",
        rateBase: "MELI_REVENUE",
        amount: 1.0,
        notes: "Percepción general IVA 3% sobre comisiones ML (~1% sobre ventas). Ajustable si cumplidor.",
        source: "auto",
      });

      taxes.push({
        name: "Retención Ganancias MercadoLibre",
        category: "FISCAL",
        rateType: "PERCENTAGE",
        rateBase: "MELI_REVENUE",
        amount: 0.5,
        notes: "Retención Ganancias: 0.5% otros medios, 1% tarjeta. Promedio 0.5%. Ajustar según mix.",
        source: "auto",
      });
    }
  }

  return taxes;
}

// Simple CUID-like ID generator
function generateCuid(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 12);
  return `c${timestamp}${random}`;
}
