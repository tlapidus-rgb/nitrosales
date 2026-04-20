// ══════════════════════════════════════════════════════════════
// Email template — alertas del Centro de Control (aurora dark)
// ══════════════════════════════════════════════════════════════

import type {
  ConnectionIssue,
  StuckOnboarding,
  InactiveClient,
} from "./checks";

interface BuildAlertEmailArgs {
  connectionIssues: ConnectionIssue[];
  stuckOnboardings: StuckOnboarding[];
  inactiveClients: InactiveClient[];
  appUrl: string;
}

export function buildAlertEmailHtml(args: BuildAlertEmailArgs): {
  subject: string;
  html: string;
} {
  const { connectionIssues, stuckOnboardings, inactiveClients, appUrl } = args;

  const errorCount = connectionIssues.filter((i) => i.level === "error").length;
  const warnCount = connectionIssues.filter((i) => i.level === "warn").length;
  const stuckCount = stuckOnboardings.length;
  const inactiveCount = inactiveClients.length;
  const totalIssues = errorCount + warnCount + stuckCount + inactiveCount;

  const headlineTone = errorCount > 0 ? "#EF4444" : warnCount > 0 ? "#F59E0B" : "#22C55E";
  const headlineLabel =
    errorCount > 0
      ? `${errorCount} problema${errorCount > 1 ? "s" : ""} crítico${errorCount > 1 ? "s" : ""}`
      : totalIssues > 0
      ? `${totalIssues} punto${totalIssues > 1 ? "s" : ""} de atención`
      : "Todo OK";

  const subject =
    errorCount > 0
      ? `🚨 NitroSales Control — ${errorCount} alerta${errorCount > 1 ? "s" : ""} crítica${errorCount > 1 ? "s" : ""}`
      : totalIssues > 0
      ? `⚠️ NitroSales Control — ${totalIssues} alerta${totalIssues > 1 ? "s" : ""}`
      : "✅ NitroSales Control — Todo OK";

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0; padding:0; background:#0A0A0B; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; color:#E4E4E7;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0A0A0B; padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; width:100%;">

  <!-- Header with gradient -->
  <tr><td style="padding:28px 32px; background:linear-gradient(135deg, #FF5E1A 0%, #FF8C4A 100%); border-radius:14px 14px 0 0;">
    <div style="display:inline-block; width:36px; height:36px; border-radius:9px; background:rgba(255,255,255,0.2); color:#fff; font-weight:800; font-size:18px; text-align:center; line-height:36px; margin-bottom:12px;">N</div>
    <div style="color:#fff; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.12em; opacity:0.85;">NitroSales · Centro de Control</div>
    <h1 style="margin:6px 0 0; color:#fff; font-size:22px; font-weight:700; letter-spacing:-0.02em;">Reporte de salud operativa</h1>
    <p style="margin:6px 0 0; color:rgba(255,255,255,0.85); font-size:13px;">${new Date().toLocaleString("es-AR", { dateStyle: "full", timeStyle: "short" })}</p>
  </td></tr>

  <!-- Summary badge -->
  <tr><td style="padding:24px 32px; background:#0F0F11; border-left:1px solid #1F1F23; border-right:1px solid #1F1F23;">
    <div style="display:inline-flex; align-items:center; gap:8px; padding:8px 14px; background:${headlineTone}1A; border:1px solid ${headlineTone}44; border-radius:99px; color:${headlineTone}; font-size:13px; font-weight:700;">
      <span style="width:8px; height:8px; border-radius:50%; background:${headlineTone}; display:inline-block;"></span>
      ${headlineLabel}
    </div>
  </td></tr>

  ${totalIssues === 0
    ? `<tr><td style="padding:40px 32px; background:#0F0F11; border-left:1px solid #1F1F23; border-right:1px solid #1F1F23; text-align:center;">
      <div style="font-size:48px; margin-bottom:12px;">✅</div>
      <div style="color:#fff; font-size:16px; font-weight:600; margin-bottom:4px;">Todos los clientes OK</div>
      <div style="color:#A1A1AA; font-size:13px;">Sin conexiones caídas, sin onboardings vencidos, sin inactividad crítica.</div>
    </td></tr>`
    : ""}

  ${errorCount > 0 ? renderSection("🚨 Conexiones con problemas críticos", "#EF4444", connectionIssues.filter(i => i.level === "error").map(i => `
    <tr><td style="padding:12px 14px; border-bottom:1px solid #1F1F23;">
      <div style="color:#fff; font-size:13px; font-weight:600;">${escapeHtml(i.orgName)}</div>
      <div style="color:#A1A1AA; font-size:11px; margin-top:3px;">
        <strong style="color:#F87171;">${escapeHtml(i.platform)}</strong> — ${escapeHtml(i.reason)}
      </div>
      ${i.lastError ? `<div style="margin-top:6px; padding:8px 10px; background:rgba(239,68,68,0.08); border-radius:6px; font-family:'SF Mono',Menlo,monospace; font-size:10px; color:#FCA5A5;">${escapeHtml(i.lastError.slice(0, 200))}</div>` : ""}
    </td></tr>`).join("")) : ""}

  ${warnCount > 0 ? renderSection("⚠️ Conexiones con advertencias", "#F59E0B", connectionIssues.filter(i => i.level === "warn").map(i => `
    <tr><td style="padding:12px 14px; border-bottom:1px solid #1F1F23;">
      <div style="color:#fff; font-size:13px; font-weight:600;">${escapeHtml(i.orgName)}</div>
      <div style="color:#A1A1AA; font-size:11px; margin-top:3px;">
        <strong style="color:#FBBF24;">${escapeHtml(i.platform)}</strong> — ${escapeHtml(i.reason)}
      </div>
    </td></tr>`).join("")) : ""}

  ${stuckCount > 0 ? renderSection("⏰ Onboardings atrasados (>72hs)", "#F59E0B", stuckOnboardings.map(o => `
    <tr><td style="padding:12px 14px; border-bottom:1px solid #1F1F23;">
      <div style="color:#fff; font-size:13px; font-weight:600;">${escapeHtml(o.companyName)}</div>
      <div style="color:#A1A1AA; font-size:11px; margin-top:3px;">
        ${escapeHtml(o.contactEmail)} — <strong style="color:#FBBF24;">${escapeHtml(o.status)}</strong> hace ${o.hoursOld}h
      </div>
    </td></tr>`).join("")) : ""}

  ${inactiveCount > 0 ? renderSection("💤 Clientes inactivos (>14d)", "#71717A", inactiveClients.map(c => `
    <tr><td style="padding:12px 14px; border-bottom:1px solid #1F1F23;">
      <div style="color:#fff; font-size:13px; font-weight:600;">${escapeHtml(c.orgName)}</div>
      <div style="color:#A1A1AA; font-size:11px; margin-top:3px;">
        ${c.daysSinceLogin !== null ? `Último login hace ${c.daysSinceLogin}d` : "Nunca logueó"} ·
        ${c.daysSinceOrder !== null ? `última order hace ${c.daysSinceOrder}d` : "sin orders"}
      </div>
    </td></tr>`).join("")) : ""}

  <!-- CTA -->
  <tr><td style="padding:28px 32px; background:#0F0F11; border-left:1px solid #1F1F23; border-right:1px solid #1F1F23; border-bottom:1px solid #1F1F23; border-radius:0 0 14px 14px; text-align:center;">
    <a href="${appUrl}/control" style="display:inline-block; padding:12px 24px; background:linear-gradient(135deg, #FF5E1A 0%, #FF8C4A 100%); color:#fff; text-decoration:none; border-radius:8px; font-size:13px; font-weight:600; box-shadow:0 4px 12px rgba(255,94,26,0.25);">
      Abrir Centro de Control →
    </a>
    <p style="margin:14px 0 0; color:#52525B; font-size:11px;">
      Enviado automáticamente por NitroSales Control · revisión ${new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

  return { subject, html };
}

function renderSection(title: string, color: string, itemsHtml: string): string {
  if (!itemsHtml) return "";
  return `
  <tr><td style="padding:20px 32px 8px; background:#0F0F11; border-left:1px solid #1F1F23; border-right:1px solid #1F1F23;">
    <div style="font-size:11px; font-weight:700; color:${color}; text-transform:uppercase; letter-spacing:0.1em; margin-bottom:8px;">${title}</div>
  </td></tr>
  <tr><td style="padding:0 32px 4px; background:#0F0F11; border-left:1px solid #1F1F23; border-right:1px solid #1F1F23;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#18181B; border:1px solid #27272A; border-radius:8px; overflow:hidden;">
      ${itemsHtml}
    </table>
  </td></tr>`;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
