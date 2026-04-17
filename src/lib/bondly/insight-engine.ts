// ═══════════════════════════════════════════════════════════════════
// Bondly · Insight Engine
// ═══════════════════════════════════════════════════════════════════
//
// Detecta patrones accionables en la data de LTV + pixel y los
// convierte en cards con CTA. Si no hay un patrón fuerte, devuelve
// un fallback honesto sugiriendo el próximo paso.
//
// Copy style (aprobado por Tomy):
//   - Título: directo, imperativo, en 3-6 palabras.
//   - Body: formal, con números concretos.
//   - CTA: acción clara (link o botón deshabilitado con "Próximamente").
//
// Función pura, sin side effects. Las queries viven en el endpoint.
// ═══════════════════════════════════════════════════════════════════

export type InsightTone = "critical" | "opportunity" | "caution" | "behavioral" | "whale";

export interface InsightCta {
  label: string;
  href: string | null; // null => disabled "Próximamente"
}

export interface InsightCard {
  id: string;
  tone: InsightTone;
  icon: string; // emoji code para render rápido; la UI puede mapear a icono lucide
  title: string;
  body: string;
  cta: InsightCta;
  priority: number; // 0 = más urgente. La UI muestra top 3.
}

// ─── Inputs que el endpoint le pasa ─────────────────────────────────

export interface ChannelLtvStat {
  channel: string;
  customers: number;
  avgLtv: number;
  cac: number | null; // null si no hay data de ad spend
}

export interface RepurchaseBucket {
  daysRange: [number, number];
  customers: number;
}

export interface CohortStat {
  cohortMonth: string; // "2026-02"
  m3Retention: number; // 0-1
  customers: number;
}

export interface BehavioralSummary {
  anonymousHighScore: number; // visitantes anónimos con score >= 70
  identifiedNoPurchase: number;
  totalHighScore: number;
}

export interface WhaleAtRiskStat {
  customerId: string;
  displayName: string;
  churnScore: number;
  ltv: number;
}

export interface InsightEngineInput {
  channels: ChannelLtvStat[];
  repurchaseBuckets: RepurchaseBucket[];
  cohorts: CohortStat[];
  avgCohortM3Retention: number | null; // baseline para comparar
  behavioral: BehavioralSummary | null;
  whalesAtRisk: WhaleAtRiskStat[];
}

// ─── Detectores ────────────────────────────────────────────────────

function toxicChannelInsight(channels: ChannelLtvStat[]): InsightCard | null {
  const eligible = channels.filter(
    (c) => c.customers >= 20 && c.cac != null && c.cac > 0 && c.avgLtv > 0
  );
  if (eligible.length === 0) return null;
  const withRatio = eligible.map((c) => ({
    ...c,
    ratio: c.avgLtv / (c.cac as number),
  }));
  const worst = withRatio.reduce((a, b) => (a.ratio < b.ratio ? a : b));
  if (worst.ratio >= 1.0) return null;
  const lossPerCustomer = (worst.cac as number) - worst.avgLtv;
  return {
    id: `toxic-${worst.channel}`,
    tone: "critical",
    icon: "🔴",
    title: `Canal ${worst.channel}: LTV:CAC en rojo`,
    body: `${worst.customers} clientes vinieron por ${worst.channel} con LTV:CAC ${worst.ratio.toFixed(2)}x. Estás perdiendo aproximadamente $${Math.round(lossPerCustomer).toLocaleString("es-AR")} por cada cliente adquirido.`,
    cta: {
      label: "Revisar campañas del canal",
      href: worst.channel.toLowerCase().includes("meta")
        ? "/campaigns/meta"
        : worst.channel.toLowerCase().includes("google")
        ? "/campaigns/google"
        : null,
    },
    priority: 0,
  };
}

function sweetSpotInsight(buckets: RepurchaseBucket[]): InsightCard | null {
  if (buckets.length === 0) return null;
  // Encontramos el bucket con más clientes (excluyendo los <7d que suelen ser compras impulsivas repetidas).
  const meaningful = buckets.filter((b) => b.daysRange[0] >= 7);
  if (meaningful.length === 0) return null;
  const top = meaningful.reduce((a, b) => (a.customers > b.customers ? a : b));
  if (top.customers < 30) return null;
  const [lo, hi] = top.daysRange;
  return {
    id: `sweet-spot-${lo}-${hi}`,
    tone: "opportunity",
    icon: "🟢",
    title: `Sweet spot de recompra: ${lo}-${hi} días`,
    body: `${top.customers.toLocaleString("es-AR")} clientes recompraron entre los días ${lo} y ${hi} desde su última orden. Este es el momento de mayor probabilidad de recompra para tu negocio.`,
    cta: {
      label: "Crear audiencia de reactivación",
      href: null, // Próximamente
    },
    priority: 1,
  };
}

function starCohortInsight(
  cohorts: CohortStat[],
  avgM3: number | null
): InsightCard | null {
  if (cohorts.length === 0 || avgM3 == null || avgM3 <= 0) return null;
  const recentEnough = cohorts.filter((c) => c.customers >= 20);
  if (recentEnough.length === 0) return null;
  const best = recentEnough.reduce((a, b) =>
    a.m3Retention > b.m3Retention ? a : b
  );
  const delta = best.m3Retention - avgM3;
  if (delta < 0.05) return null; // Solo destacamos si supera por 5pp+
  return {
    id: `star-cohort-${best.cohortMonth}`,
    tone: "opportunity",
    icon: "🟡",
    title: `Cohorte estrella: ${best.cohortMonth}`,
    body: `La cohorte ${best.cohortMonth} retiene ${Math.round(best.m3Retention * 100)}% de los clientes al M3, vs el promedio de ${Math.round(avgM3 * 100)}%. Vale la pena investigar qué compraron y desde qué canal vinieron.`,
    cta: {
      label: "Analizar cohorte",
      href: null, // Próximamente
    },
    priority: 2,
  };
}

function behavioralInsight(b: BehavioralSummary | null): InsightCard | null {
  if (!b) return null;
  if (b.anonymousHighScore < 30) return null;
  return {
    id: "behavioral-anonymous-high",
    tone: "behavioral",
    icon: "🟣",
    title: "Visitantes con perfil de futuro VIP",
    body: `${b.anonymousHighScore.toLocaleString("es-AR")} visitantes anónimos tienen un behavioral score superior a 70 y todavía no compraron. Son candidatos claros para retargeting pago e incentivos de primera compra.`,
    cta: {
      label: "Activar retargeting",
      href: null, // Próximamente
    },
    priority: 1,
  };
}

function whaleAtRiskInsight(whales: WhaleAtRiskStat[]): InsightCard | null {
  if (whales.length === 0) return null;
  const critical = whales.filter((w) => w.churnScore >= 70).slice(0, 10);
  if (critical.length === 0) return null;
  const totalLtv = critical.reduce((acc, w) => acc + w.ltv, 0);
  return {
    id: "whale-at-risk",
    tone: "whale",
    icon: "🔵",
    title: `${critical.length} clientes VIP en riesgo`,
    body: `Detectamos ${critical.length} clientes de alto valor con churn score crítico (≥70/100). Representan $${Math.round(totalLtv).toLocaleString("es-AR")} de revenue histórico combinado. Contactarlos directamente en los próximos días puede evitar la pérdida.`,
    cta: {
      label: "Ver lista de clientes",
      href: null, // Próximamente — la UI abre el Churn Scoreboard
    },
    priority: 0,
  };
}

// ─── Runner principal ──────────────────────────────────────────────

export function generateInsights(input: InsightEngineInput): InsightCard[] {
  const candidates: Array<InsightCard | null> = [
    toxicChannelInsight(input.channels),
    whaleAtRiskInsight(input.whalesAtRisk),
    behavioralInsight(input.behavioral),
    sweetSpotInsight(input.repurchaseBuckets),
    starCohortInsight(input.cohorts, input.avgCohortM3Retention),
  ];
  const valid = candidates.filter((c): c is InsightCard => c !== null);

  // Ordenamos por prioridad (menor primero = más urgente)
  valid.sort((a, b) => a.priority - b.priority);

  // Retornamos hasta 3
  return valid.slice(0, 3);
}

// Fallback si no hay insights detectados (la UI lo sabe manejar también)
export const INSIGHT_EMPTY_FALLBACK: InsightCard = {
  id: "empty-fallback",
  tone: "caution",
  icon: "💡",
  title: "Sin patrones fuertes en este período",
  body: "Todavía no detectamos un patrón accionable con la data del período seleccionado. Probá ampliar el rango a 90 o 180 días para dejar que el motor encuentre señales.",
  cta: {
    label: "Ajustar rango a 90 días",
    href: "?range=90d",
  },
  priority: 99,
};
