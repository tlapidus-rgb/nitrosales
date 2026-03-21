// ══════════════════════════════════════════════
// Email templates — HTML emails for NitroSales
// ══════════════════════════════════════════════

const BRAND_ORANGE = "#FF5E1A";
const BRAND_BG = "#0A0A0F";
const CARD_BG = "#141419";
const TEXT_PRIMARY = "#FFFFFF";
const TEXT_SECONDARY = "#9CA3AF";
const GREEN = "#22C55E";
const RED = "#EF4444";
const YELLOW = "#F59E0B";

function baseLayout(title: string, content: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title></head>
<body style="margin:0;padding:0;background:${BRAND_BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
  <!-- Header -->
  <div style="text-align:center;padding:24px 0;border-bottom:1px solid #1F1F2E;">
    <span style="font-size:20px;font-weight:700;color:${TEXT_PRIMARY};letter-spacing:-0.5px;">
      NITRO<span style="color:${BRAND_ORANGE};">SALES</span>
    </span>
  </div>
  <!-- Content -->
  <div style="padding:24px 0;">
    ${content}
  </div>
  <!-- Footer -->
  <div style="text-align:center;padding:24px 0;border-top:1px solid #1F1F2E;">
    <p style="color:${TEXT_SECONDARY};font-size:12px;margin:0;">
      NitroSales — Inteligencia Comercial para Ecommerce
    </p>
    <p style="color:${TEXT_SECONDARY};font-size:11px;margin:8px 0 0;">
      <a href="https://nitrosales.vercel.app/settings" style="color:${BRAND_ORANGE};text-decoration:none;">
        Configurar alertas
      </a>
    </p>
  </div>
</div>
</body>
</html>`;
}

function priorityBadge(priority: string): string {
  const colors: Record<string, string> = {
    HIGH: RED,
    MEDIUM: YELLOW,
    LOW: GREEN,
  };
  const labels: Record<string, string> = {
    HIGH: "URGENTE",
    MEDIUM: "IMPORTANTE",
    LOW: "INFO",
  };
  const color = colors[priority] || TEXT_SECONDARY;
  return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;letter-spacing:0.5px;color:${color};background:${color}15;border:1px solid ${color}30;">${labels[priority] || priority}</span>`;
}

function changeBadge(value: number | null): string {
  if (value === null || value === undefined) return "";
  const color = value > 0 ? GREEN : value < 0 ? RED : TEXT_SECONDARY;
  const arrow = value > 0 ? "↑" : value < 0 ? "↓" : "→";
  return `<span style="color:${color};font-size:12px;font-weight:600;">${arrow} ${Math.abs(value)}%</span>`;
}

// ── Anomaly Alert Email ──────────────────────

export interface AnomalyForEmail {
  type: string;
  priority: string;
  title: string;
  description: string;
  action: string;
  metric?: string | null;
  metricValue?: number | null;
  metricDelta?: number | null;
}

export function anomalyAlertEmail(orgName: string, anomalies: AnomalyForEmail[]): { subject: string; html: string } {
  const highCount = anomalies.filter(a => a.priority === "HIGH").length;
  const subject = highCount > 0
    ? `🚨 ${highCount} alerta${highCount > 1 ? "s" : ""} urgente${highCount > 1 ? "s" : ""} en ${orgName}`
    : `📊 ${anomalies.length} insight${anomalies.length > 1 ? "s" : ""} detectado${anomalies.length > 1 ? "s" : ""} en ${orgName}`;

  const anomalyCards = anomalies.map(a => `
    <div style="background:${CARD_BG};border-radius:12px;padding:16px;margin-bottom:12px;border:1px solid #1F1F2E;">
      <div style="margin-bottom:8px;">
        ${priorityBadge(a.priority)}
        <span style="color:${TEXT_SECONDARY};font-size:11px;margin-left:8px;text-transform:uppercase;letter-spacing:0.5px;">${a.type}</span>
      </div>
      <h3 style="color:${TEXT_PRIMARY};font-size:15px;font-weight:600;margin:0 0 8px;">${a.title}</h3>
      <p style="color:${TEXT_SECONDARY};font-size:13px;line-height:1.5;margin:0 0 12px;">${a.description}</p>
      ${a.metricDelta !== undefined && a.metricDelta !== null ? `<div style="margin-bottom:8px;">${changeBadge(a.metricDelta)}</div>` : ""}
      <div style="background:#0A0A0F;border-radius:8px;padding:10px 12px;">
        <p style="color:${BRAND_ORANGE};font-size:12px;font-weight:600;margin:0;">
          → ${a.action}
        </p>
      </div>
    </div>
  `).join("");

  const content = `
    <h2 style="color:${TEXT_PRIMARY};font-size:18px;font-weight:600;margin:0 0 4px;">
      Anomalias Detectadas
    </h2>
    <p style="color:${TEXT_SECONDARY};font-size:13px;margin:0 0 20px;">
      ${orgName} — ${new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}
    </p>
    ${anomalyCards}
    <div style="text-align:center;margin-top:24px;">
      <a href="https://nitrosales.vercel.app/alertas" style="display:inline-block;padding:12px 32px;background:${BRAND_ORANGE};color:white;text-decoration:none;border-radius:10px;font-size:14px;font-weight:600;">
        Ver en NitroSales
      </a>
    </div>
  `;

  return { subject, html: baseLayout(subject, content) };
}

// ── Weekly Digest Email ──────────────────────

export interface DigestMetrics {
  revenue: number;
  revenueChange: number | null;
  orders: number;
  ordersChange: number | null;
  grossProfit: number;
  grossProfitChange: number | null;
  grossMargin: number;
  adSpend: number;
  adSpendChange: number | null;
  roas: number;
  roasChange: number | null;
  aov: number;
  topProducts: { name: string; revenue: number; units: number }[];
  topCampaigns: { name: string; platform: string; roas: number; spend: number }[];
}

export function weeklyDigestEmail(orgName: string, metrics: DigestMetrics, narrative: string): { subject: string; html: string } {
  const weekLabel = `Semana del ${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toLocaleDateString("es-AR", { day: "numeric", month: "short" })} al ${new Date().toLocaleDateString("es-AR", { day: "numeric", month: "short" })}`;
  const subject = `📈 Resumen semanal — ${orgName} — ${weekLabel}`;

  function formatARS(n: number): string {
    return "$ " + Math.round(n).toLocaleString("es-AR");
  }

  function kpiRow(label: string, value: string, change: number | null): string {
    return `
      <tr>
        <td style="padding:8px 12px;color:${TEXT_SECONDARY};font-size:13px;">${label}</td>
        <td style="padding:8px 12px;color:${TEXT_PRIMARY};font-size:14px;font-weight:600;text-align:right;">${value}</td>
        <td style="padding:8px 12px;text-align:right;">${changeBadge(change)}</td>
      </tr>
    `;
  }

  const topProductRows = metrics.topProducts.slice(0, 5).map((p, i) => `
    <tr>
      <td style="padding:6px 12px;color:${TEXT_SECONDARY};font-size:12px;">${i + 1}.</td>
      <td style="padding:6px 12px;color:${TEXT_PRIMARY};font-size:12px;">${p.name.substring(0, 40)}</td>
      <td style="padding:6px 12px;color:${TEXT_PRIMARY};font-size:12px;text-align:right;">${formatARS(p.revenue)}</td>
      <td style="padding:6px 12px;color:${TEXT_SECONDARY};font-size:12px;text-align:right;">${p.units} uds</td>
    </tr>
  `).join("");

  const topCampaignRows = metrics.topCampaigns.slice(0, 5).map((c, i) => `
    <tr>
      <td style="padding:6px 12px;color:${TEXT_SECONDARY};font-size:12px;">${i + 1}.</td>
      <td style="padding:6px 12px;color:${TEXT_PRIMARY};font-size:12px;">${c.name.substring(0, 35)}</td>
      <td style="padding:6px 12px;color:${TEXT_SECONDARY};font-size:11px;">${c.platform}</td>
      <td style="padding:6px 12px;color:${c.roas >= 2 ? GREEN : c.roas >= 1 ? YELLOW : RED};font-size:12px;font-weight:600;text-align:right;">${c.roas}x</td>
    </tr>
  `).join("");

  const content = `
    <h2 style="color:${TEXT_PRIMARY};font-size:18px;font-weight:600;margin:0 0 4px;">
      Resumen Semanal
    </h2>
    <p style="color:${TEXT_SECONDARY};font-size:13px;margin:0 0 20px;">
      ${orgName} — ${weekLabel}
    </p>

    <!-- Narrative -->
    <div style="background:${CARD_BG};border-radius:12px;padding:16px;margin-bottom:20px;border-left:3px solid ${BRAND_ORANGE};">
      <p style="color:${TEXT_PRIMARY};font-size:13px;line-height:1.6;margin:0;">${narrative}</p>
    </div>

    <!-- KPIs -->
    <div style="background:${CARD_BG};border-radius:12px;overflow:hidden;margin-bottom:20px;border:1px solid #1F1F2E;">
      <div style="padding:12px 16px;border-bottom:1px solid #1F1F2E;">
        <h3 style="color:${TEXT_PRIMARY};font-size:14px;font-weight:600;margin:0;">KPIs vs semana anterior</h3>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        ${kpiRow("Facturacion", formatARS(metrics.revenue), metrics.revenueChange)}
        ${kpiRow("Pedidos", String(metrics.orders), metrics.ordersChange)}
        ${kpiRow("Ganancia Bruta", formatARS(metrics.grossProfit), metrics.grossProfitChange)}
        ${kpiRow("Margen Bruto", metrics.grossMargin + "%", null)}
        ${kpiRow("Inversion Ads", formatARS(metrics.adSpend), metrics.adSpendChange)}
        ${kpiRow("ROAS", metrics.roas + "x", metrics.roasChange)}
        ${kpiRow("Ticket Promedio", formatARS(metrics.aov), null)}
      </table>
    </div>

    <!-- Top Products -->
    ${topProductRows ? `
    <div style="background:${CARD_BG};border-radius:12px;overflow:hidden;margin-bottom:20px;border:1px solid #1F1F2E;">
      <div style="padding:12px 16px;border-bottom:1px solid #1F1F2E;">
        <h3 style="color:${TEXT_PRIMARY};font-size:14px;font-weight:600;margin:0;">Top 5 Productos</h3>
      </div>
      <table style="width:100%;border-collapse:collapse;">${topProductRows}</table>
    </div>` : ""}

    <!-- Top Campaigns -->
    ${topCampaignRows ? `
    <div style="background:${CARD_BG};border-radius:12px;overflow:hidden;margin-bottom:20px;border:1px solid #1F1F2E;">
      <div style="padding:12px 16px;border-bottom:1px solid #1F1F2E;">
        <h3 style="color:${TEXT_PRIMARY};font-size:14px;font-weight:600;margin:0;">Top Campanas por ROAS</h3>
      </div>
      <table style="width:100%;border-collapse:collapse;">${topCampaignRows}</table>
    </div>` : ""}

    <div style="text-align:center;margin-top:24px;">
      <a href="https://nitrosales.vercel.app/dashboard" style="display:inline-block;padding:12px 32px;background:${BRAND_ORANGE};color:white;text-decoration:none;border-radius:10px;font-size:14px;font-weight:600;">
        Abrir Dashboard
      </a>
    </div>
  `;

  return { subject, html: baseLayout(subject, content) };
}
