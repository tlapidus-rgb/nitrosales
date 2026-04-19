// ═══════════════════════════════════════════════════════════════════
// predictive-alerts.ts — Fase 6f
// ═══════════════════════════════════════════════════════════════════
// Rule engine deterministico para alertas PREDICTIVAS. Complementa
// (no reemplaza) narrative.ts:
//
//   narrative.ts       → alertas del estado actual (runway, margin)
//   predictive-alerts  → alertas de TENDENCIA (MoM deltas, cross-module)
//
// Las predictivas se disparan cuando algo cambia fuerte — un número
// no en valor absoluto sino en su movimiento.
//
// Reglas (cada una genera 0-1 alerta):
//
//   shipping_spike        shipping MoM > +30%       severity=warning
//   cogs_spike            cogs% delta > +5pp        severity=warning
//   retentions_spike      retenciones MoM > +30%    severity=info
//   cac_gt_ltv            blended CAC > LTV         severity=critical
//   payback_too_long      blended payback > 6m      severity=warning
//   fiscal_imminent       vencimiento en <= 3 dias  severity=warning
//   margin_yoy_drop       margen YoY cae > 8pp      severity=warning
//
// Todas son 100% deterministicas, sin LLM. La idea es que el founder
// vea en Pulso "qué está cambiando" sin tener que comparar mentalmente
// los números de este mes con el anterior.
// ═══════════════════════════════════════════════════════════════════

import type { FinancialAlert } from "@/types/finanzas";

export interface PredictiveInput {
  monthIso: string;                      // "YYYY-MM"
  // Current vs previous month
  shippingCurrent?: number;
  shippingPrev?: number;
  cogsPctCurrent?: number;               // 0-100
  cogsPctPrev?: number;
  retentionsCurrent?: number;
  retentionsPrev?: number;
  // Marketing financial
  blendedCac?: number | null;
  blendedLtv?: number | null;
  blendedPaybackMonths?: number | null;
  // Margin YoY
  marginPctYtd?: number | null;
  marginPctYtdPrev?: number | null;      // mismo periodo año anterior
  // Fiscal
  nextFiscalDueInDays?: number | null;   // puede ser negativo = vencido
  nextFiscalName?: string | null;
}

function fmtPct(v: number): string {
  const s = v > 0 ? "+" : "";
  return `${s}${v.toFixed(1)}%`;
}

function fmtPp(v: number): string {
  const s = v > 0 ? "+" : "";
  return `${s}${v.toFixed(1)}pp`;
}

function pctChange(curr: number | undefined, prev: number | undefined): number | null {
  if (curr == null || prev == null || !Number.isFinite(curr) || !Number.isFinite(prev)) return null;
  if (prev <= 0) return null;
  return ((curr - prev) / prev) * 100;
}

/**
 * Genera todas las alertas predictivas aplicables.
 */
export function buildPredictiveAlerts(
  input: PredictiveInput
): FinancialAlert[] {
  const alerts: FinancialAlert[] = [];
  const now = new Date().toISOString();
  const seed = input.monthIso;

  // ─── 1. Shipping spike MoM ───
  const shippingDelta = pctChange(input.shippingCurrent, input.shippingPrev);
  if (shippingDelta != null && shippingDelta > 30) {
    alerts.push({
      id: `finanzas.predictive.shipping_spike.${seed}`,
      type: "shipping",
      priority: shippingDelta > 50 ? "HIGH" : "MEDIUM",
      title: `Envíos subieron ${fmtPct(shippingDelta)} MoM`,
      body: `El costo de envíos creció fuerte vs el mes anterior. Revisá rates de carrier, ticket promedio o zona de envío.`,
      createdAt: now,
    });
  }

  // ─── 2. COGS% spike ───
  const cogsPctDelta =
    input.cogsPctCurrent != null && input.cogsPctPrev != null
      ? input.cogsPctCurrent - input.cogsPctPrev
      : null;
  if (cogsPctDelta != null && cogsPctDelta > 5) {
    alerts.push({
      id: `finanzas.predictive.cogs_spike.${seed}`,
      type: "margin",
      priority: cogsPctDelta > 10 ? "HIGH" : "MEDIUM",
      title: `COGS pesa ${fmtPp(cogsPctDelta)} más`,
      body: `El costo de los productos sobre ventas subió ${cogsPctDelta.toFixed(1)}pp. Posibles causas: aumento de proveedores, mix hacia productos de menor margen, o pricing obsoleto.`,
      createdAt: now,
    });
  }

  // ─── 3. Retenciones MELI MoM ───
  const retDelta = pctChange(input.retentionsCurrent, input.retentionsPrev);
  if (retDelta != null && retDelta > 30) {
    alerts.push({
      id: `finanzas.predictive.retentions_spike.${seed}`,
      type: "fiscal",
      priority: "LOW",
      title: `Retenciones ML ${fmtPct(retDelta)} MoM`,
      body: `MercadoLibre te retuvo más este mes. Es normal si creciste en ventas MELI. Chequeá que estés recuperando el crédito fiscal en tu DDJJ de IVA.`,
      createdAt: now,
    });
  }

  // ─── 4. CAC > LTV (sangrado por cliente) ───
  if (
    input.blendedCac != null &&
    input.blendedLtv != null &&
    input.blendedCac > 0 &&
    input.blendedLtv > 0 &&
    input.blendedCac > input.blendedLtv
  ) {
    const ratio = input.blendedLtv / input.blendedCac;
    alerts.push({
      id: `finanzas.predictive.cac_gt_ltv.${seed}`,
      type: "marketing",
      priority: "HIGH",
      title: "CAC supera LTV — cada cliente cuesta más de lo que deja",
      body: `LTV:CAC = ${ratio.toFixed(2)}x. Mientras no mejore, cada venta paid te hace perder plata. Subí margen por producto, bajá CPC o apagá las campañas menos rentables.`,
      createdAt: now,
    });
  }

  // ─── 5. Payback demasiado largo ───
  if (
    input.blendedPaybackMonths != null &&
    input.blendedPaybackMonths > 6 &&
    Number.isFinite(input.blendedPaybackMonths)
  ) {
    alerts.push({
      id: `finanzas.predictive.payback_long.${seed}`,
      type: "marketing",
      priority: input.blendedPaybackMonths > 12 ? "HIGH" : "MEDIUM",
      title: `Payback de ${input.blendedPaybackMonths.toFixed(1)} meses`,
      body: `Tardás más de 6 meses en recuperar el CAC. Para crecer sano sin financiar la bomba con capital propio necesitás que esté bajo 6m.`,
      createdAt: now,
    });
  }

  // ─── 6. Margen YoY cae ───
  const marginYoYDelta =
    input.marginPctYtd != null && input.marginPctYtdPrev != null
      ? input.marginPctYtd - input.marginPctYtdPrev
      : null;
  if (marginYoYDelta != null && marginYoYDelta < -8) {
    alerts.push({
      id: `finanzas.predictive.margin_yoy_drop.${seed}`,
      type: "margin",
      priority: marginYoYDelta < -15 ? "HIGH" : "MEDIUM",
      title: `Margen YoY cae ${fmtPp(marginYoYDelta)}`,
      body: `El margen bruto acumulado este año es ${Math.abs(marginYoYDelta).toFixed(1)}pp más bajo que el mismo período del año anterior. Tendencia sostenida.`,
      createdAt: now,
    });
  }

  // ─── 7. Vencimiento fiscal inminente ───
  if (
    input.nextFiscalDueInDays != null &&
    input.nextFiscalDueInDays >= 0 &&
    input.nextFiscalDueInDays <= 3 &&
    input.nextFiscalName
  ) {
    alerts.push({
      id: `finanzas.predictive.fiscal_imminent.${seed}.${input.nextFiscalName.replace(/\s/g, "_")}`,
      type: "fiscal",
      priority: input.nextFiscalDueInDays === 0 ? "HIGH" : "MEDIUM",
      title:
        input.nextFiscalDueInDays === 0
          ? `${input.nextFiscalName} vence hoy`
          : `${input.nextFiscalName} vence en ${input.nextFiscalDueInDays}d`,
      body: `Acordate de preparar el pago. Si no tenés la DDJJ lista, mandala hoy a tu contador.`,
      createdAt: now,
    });
  }

  // Ordenar por priority
  const priOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  alerts.sort((a, b) => priOrder[a.priority] - priOrder[b.priority]);

  return alerts;
}
