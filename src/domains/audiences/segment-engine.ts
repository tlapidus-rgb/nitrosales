// ══════════════════════════════════════════════════════════════
// AUDIENCE SYNC — Segment Engine
// ══════════════════════════════════════════════════════════════
// Construye queries dinámicas para seleccionar clientes según
// los criterios de segmentación de cada audiencia.
// Mismo sistema RFM que /api/metrics/customers pero optimizado
// para exportar listas completas con datos de matching.

import { prisma } from "@/lib/db/client";
import type { SegmentCriteria, SyncableCustomer, AudiencePreview } from "./types";

// ─── RFM Segment Logic (idéntica a /api/metrics/customers) ───

function getRfmSegment(lifetimeOrders: number, recencyDays: number): string {
  if (recencyDays <= 30 && lifetimeOrders >= 4) return "Champions";
  if (lifetimeOrders >= 4) return "Leales";
  if (recencyDays <= 30 && lifetimeOrders === 1) return "Nuevos";
  if (recencyDays <= 60 && lifetimeOrders >= 2) return "Potenciales";
  if (recencyDays > 90 && lifetimeOrders >= 2) return "En riesgo";
  if (recencyDays > 180) return "Perdidos";
  return "Ocasionales";
}

// ─── Build Customer List ───
// Obtiene TODOS los clientes que matchean los criterios
// y retorna sus datos listos para enviar a Meta/Google

export async function getMatchingCustomers(
  organizationId: string,
  criteria: SegmentCriteria
): Promise<SyncableCustomer[]> {
  // Step 1: Get all customers with their order stats
  // We use raw SQL for performance (can be 60K+ customers)
  const customers = await prisma.$queryRaw<Array<{
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    totalOrders: number;
    totalSpent: string; // Decimal comes as string from raw query
    lastOrderAt: Date | null;
    firstOrderAt: Date | null;
    recencyDays: number;
    ltvBucket: string | null;
    predictedLtv365d: string | null;
  }>>`
    SELECT
      c.id,
      c.email,
      c."firstName",
      c."lastName",
      c.city,
      c.state,
      c.country,
      c."totalOrders",
      c."totalSpent"::text,
      c."lastOrderAt",
      c."firstOrderAt",
      COALESCE(EXTRACT(DAY FROM NOW() - c."lastOrderAt")::int, 9999) AS "recencyDays",
      ltv."segmentBucket" AS "ltvBucket",
      ltv."predictedLtv365d"::text AS "predictedLtv365d"
    FROM customers c
    LEFT JOIN customer_ltv_predictions ltv
      ON ltv."customerId" = c.id AND ltv."organizationId" = c."organizationId"
    WHERE c."organizationId" = ${organizationId}
      AND c."totalOrders" > 0
    ORDER BY c."totalSpent" DESC
  `;

  // Step 2: Apply criteria filters in JS
  // (More flexible than building dynamic SQL, and customer count is manageable)
  let filtered = customers.map((c) => {
    const rfmSegment = getRfmSegment(c.totalOrders, c.recencyDays);
    return {
      id: c.id,
      email: c.email,
      firstName: c.firstName,
      lastName: c.lastName,
      city: c.city,
      state: c.state,
      country: c.country || "ar",
      totalOrders: c.totalOrders,
      totalSpent: Number(c.totalSpent),
      lastOrderAt: c.lastOrderAt,
      rfmSegment,
      ltvBucket: c.ltvBucket || undefined,
      predictedLtv365d: c.predictedLtv365d ? Number(c.predictedLtv365d) : undefined,
    } as SyncableCustomer;
  });

  // ALL_CUSTOMERS = no filters beyond having at least 1 order
  if (criteria.rfmSegments?.length) {
    filtered = filtered.filter((c) => criteria.rfmSegments!.includes(c.rfmSegment!));
  }

  if (criteria.excludeSegments?.length) {
    filtered = filtered.filter((c) => !criteria.excludeSegments!.includes(c.rfmSegment!));
  }

  if (criteria.ltvBuckets?.length) {
    filtered = filtered.filter((c) => c.ltvBucket && criteria.ltvBuckets!.includes(c.ltvBucket));
  }

  if (criteria.minLtv365d !== undefined) {
    filtered = filtered.filter((c) => (c.predictedLtv365d || 0) >= criteria.minLtv365d!);
  }

  if (criteria.maxLtv365d !== undefined) {
    filtered = filtered.filter((c) => (c.predictedLtv365d || 0) <= criteria.maxLtv365d!);
  }

  if (criteria.minOrders !== undefined) {
    filtered = filtered.filter((c) => c.totalOrders >= criteria.minOrders!);
  }

  if (criteria.maxOrders !== undefined) {
    filtered = filtered.filter((c) => c.totalOrders <= criteria.maxOrders!);
  }

  if (criteria.minSpent !== undefined) {
    filtered = filtered.filter((c) => c.totalSpent >= criteria.minSpent!);
  }

  if (criteria.maxSpent !== undefined) {
    filtered = filtered.filter((c) => c.totalSpent <= criteria.maxSpent!);
  }

  if (criteria.recencyDaysMax !== undefined) {
    filtered = filtered.filter((c) => {
      if (!c.lastOrderAt) return false;
      const days = Math.floor((Date.now() - c.lastOrderAt.getTime()) / (1000 * 60 * 60 * 24));
      return days <= criteria.recencyDaysMax!;
    });
  }

  if (criteria.recencyDaysMin !== undefined) {
    filtered = filtered.filter((c) => {
      if (!c.lastOrderAt) return true;
      const days = Math.floor((Date.now() - c.lastOrderAt.getTime()) / (1000 * 60 * 60 * 24));
      return days >= criteria.recencyDaysMin!;
    });
  }

  if (criteria.cities?.length) {
    const lower = criteria.cities.map((x) => x.toLowerCase());
    filtered = filtered.filter((c) => c.city && lower.includes(c.city.toLowerCase()));
  }

  if (criteria.states?.length) {
    const lower = criteria.states.map((x) => x.toLowerCase());
    filtered = filtered.filter((c) => c.state && lower.includes(c.state.toLowerCase()));
  }

  if (criteria.countries?.length) {
    const lower = criteria.countries.map((x) => x.toLowerCase());
    filtered = filtered.filter((c) => c.country && lower.includes(c.country.toLowerCase()));
  }

  // Only return customers with at least an email (otherwise can't match)
  return filtered.filter((c) => c.email);
}

// ─── Audience Preview ───
// Calcula stats sin enviar nada — para mostrar en UI antes de crear/sync

export async function previewAudience(
  organizationId: string,
  criteria: SegmentCriteria
): Promise<AudiencePreview> {
  const customers = await getMatchingCustomers(organizationId, criteria);

  const withEmail = customers.filter((c) => c.email).length;
  const withPhone = 0; // No tenemos phone en Customer model aún
  const withName = customers.filter((c) => c.firstName && c.lastName).length;
  const withCity = customers.filter((c) => c.city).length;

  // Segment breakdown
  const segmentBreakdown: Record<string, number> = {};
  for (const c of customers) {
    const seg = c.rfmSegment || "Unknown";
    segmentBreakdown[seg] = (segmentBreakdown[seg] || 0) + 1;
  }

  // Top cities
  const cityMap: Record<string, number> = {};
  for (const c of customers) {
    if (c.city) {
      const key = c.city.toLowerCase();
      cityMap[key] = (cityMap[key] || 0) + 1;
    }
  }
  const topCities = Object.entries(cityMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([city, count]) => ({ city, count }));

  // Averages
  const avgOrderValue = customers.length > 0
    ? customers.reduce((sum, c) => sum + c.totalSpent, 0) / customers.length
    : 0;
  const avgLifetimeOrders = customers.length > 0
    ? customers.reduce((sum, c) => sum + c.totalOrders, 0) / customers.length
    : 0;

  // Estimated match rates based on data completeness
  // Meta matches on email primarily (~60-80% of emails match FB accounts)
  // Google matches on email (~40-60% match rate typical)
  const emailCompleteness = customers.length > 0 ? withEmail / customers.length : 0;
  const nameCompleteness = customers.length > 0 ? withName / customers.length : 0;
  // Multi-key matching improves rates by ~15-25%
  const baseMetaRate = 0.65;
  const baseGoogleRate = 0.45;
  const multiKeyBonus = nameCompleteness * 0.15 + (withCity / Math.max(customers.length, 1)) * 0.05;

  return {
    totalCustomers: customers.length,
    withEmail,
    withPhone,
    withName,
    withCity,
    estimatedMetaMatch: Math.round((baseMetaRate + multiKeyBonus) * withEmail),
    estimatedGoogleMatch: Math.round((baseGoogleRate + multiKeyBonus * 0.7) * withEmail),
    segmentBreakdown,
    topCities,
    avgOrderValue: Math.round(avgOrderValue),
    avgLifetimeOrders: Math.round(avgLifetimeOrders * 10) / 10,
  };
}
