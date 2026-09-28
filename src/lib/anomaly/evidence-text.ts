// Provider prose is not evidence. Keep the selected metric and priority, but
// render measured comparisons and review steps without generated causal claims.
const METRICS = {
  revenue: { label: "Facturación", unit: "money", review: "Revisar pedidos, descuentos y devoluciones de ambos períodos." },
  orders: { label: "Pedidos", unit: "count", review: "Revisar estados de pedidos y cobertura de la integración en ambos períodos." },
  adSpend: { label: "Inversión publicitaria", unit: "money", review: "Comparar inversión y conversiones por campaña en ambos períodos." },
  metaSpend: { label: "Inversión en Meta", unit: "money", review: "Comparar inversión y conversiones de las campañas de Meta en ambos períodos." },
  googleSpend: { label: "Inversión en Google", unit: "money", review: "Comparar inversión y conversiones de las campañas de Google en ambos períodos." },
  roas: { label: "ROAS", unit: "ratio", review: "Revisar ingresos atribuidos, inversión y ventanas de atribución antes de cambiar presupuestos." },
  cpa: { label: "CPA", unit: "money", review: "Revisar inversión, conversiones y ventanas de atribución en ambos períodos." },
  aov: { label: "Ticket promedio", unit: "money", review: "Comparar importes, descuentos y composición de los pedidos en ambos períodos." },
  grossMargin: { label: "Margen bruto", unit: "percent", review: "Revisar costos, descuentos y composición de las ventas en ambos períodos." },
  grossProfit: { label: "Ganancia bruta", unit: "money", review: "Revisar ingresos y costos de las ventas en ambos períodos." },
} as const;

export type EvidenceMetric = keyof typeof METRICS;

export function measuredAnomalyText(metric: EvidenceMetric, current: number, previous: number, delta: number | null) {
  const definition = METRICS[metric];
  const number = (value: number) => value.toLocaleString("es-AR", { maximumFractionDigits: 2 });
  const format = (value: number) => {
    const text = number(value);
    switch (definition.unit) {
      case "money": return `$${text}`;
      case "ratio": return `${text}x`;
      case "percent": return `${text}%`;
      default: return text;
    }
  };
  const comparison = delta === null
    ? "Variación porcentual no comparable con estos valores."
    : `Variación: ${delta > 0 ? "+" : ""}${number(delta)}${metric === "grossMargin" ? " puntos porcentuales" : "%"}.`;
  return {
    title: `${definition.label}: comparación de períodos`,
    description: `${definition.label}: ${format(previous)} en el período anterior y ${format(current)} en el actual. ${comparison} Esta comparación no determina la causa del cambio.`,
    action: definition.review,
  };
}
