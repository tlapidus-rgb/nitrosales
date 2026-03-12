import { NextResponse } from "next/server";

// ══════════════════════════════════════════════════════════
// Google Ads OAuth Flow — Step 2: Exchange code for tokens
// Google redirects here after user consent
// ══════════════════════════════════════════════════════════

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    return new NextResponse(generateHTML("Error de Autorización", `
      <div class="error-box">
        <h2>Error: ${error}</h2>
        <p>${url.searchParams.get("error_description") || "El usuario canceló la autorización o hubo un error."}</p>
        <a href="/api/auth/google-ads" class="btn">Intentar de nuevo</a>
      </div>
    `), { headers: { "Content-Type": "text/html" } });
  }

  if (!code) {
    return new NextResponse(generateHTML("Error", `
      <div class="error-box">
        <h2>No se recibió el código de autorización</h2>
        <a href="/api/auth/google-ads" class="btn">Intentar de nuevo</a>
      </div>
    `), { headers: { "Content-Type": "text/html" } });
  }

  try {
    const baseUrl = `${url.protocol}//${url.host}`;
    const redirectUri = `${baseUrl}/api/auth/google-ads/callback`;

    // Exchange authorization code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_ADS_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET || "",
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      return new NextResponse(generateHTML("Error al obtener token", `
        <div class="error-box">
          <h2>Error: ${tokenData.error}</h2>
          <p>${tokenData.error_description || ""}</p>
          <p class="hint">Esto puede pasar si el código ya fue usado o expiró. Intentá de nuevo.</p>
          <a href="/api/auth/google-ads" class="btn">Intentar de nuevo</a>
        </div>
      `), { headers: { "Content-Type": "text/html" } });
    }

    const refreshToken = tokenData.refresh_token;
    const accessToken = tokenData.access_token;
    const expiresIn = tokenData.expires_in;

    // Test the token by making a simple Google Ads API call
    let testResult = "";
    if (accessToken) {
      try {
        const customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID || "").replace(/-/g, "");
        const testRes = await fetch(
          `https://googleads.googleapis.com/v16/customers/${customerId}/googleAds:searchStream`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ query: "SELECT customer.id FROM customer LIMIT 1" }),
          }
        );
        if (testRes.ok) {
          testResult = '<div class="success-badge">Conexión verificada con Google Ads API</div>';
        } else {
          const errData = await testRes.text();
          testResult = `<div class="warning-badge">Token obtenido pero la API respondió: ${testRes.status}</div>`;
        }
      } catch (e: any) {
        testResult = `<div class="warning-badge">Token obtenido pero no se pudo verificar: ${e.message}</div>`;
      }
    }

    // Calculate expiry info
    const now = new Date();
    const tokenMode = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ? "Explorer/Test" : "Unknown";
    const expiryNote = tokenMode.includes("Test")
      ? "En modo Test, el refresh token expira en ~7 días. Renovar antes del " +
        new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString("es-AR")
      : "En modo Basic/Standard, el refresh token no expira.";

    return new NextResponse(generateHTML("Token Renovado", `
      <div class="success-box">
        <h2>Refresh Token obtenido exitosamente</h2>
        ${testResult}

        <div class="token-section">
          <h3>Refresh Token</h3>
          <div class="token-display">
            <code id="refreshToken">${refreshToken || "No se recibió refresh_token"}</code>
            <button onclick="navigator.clipboard.writeText(document.getElementById('refreshToken').textContent).then(() => this.textContent = 'Copiado!')" class="copy-btn">
              Copiar
            </button>
          </div>
        </div>

        <div class="token-section">
          <h3>Access Token (temporal, ${expiresIn}s)</h3>
          <div class="token-display">
            <code id="accessToken">${accessToken || ""}</code>
            <button onclick="navigator.clipboard.writeText(document.getElementById('accessToken').textContent).then(() => this.textContent = 'Copiado!')" class="copy-btn">
              Copiar
            </button>
          </div>
        </div>

        <div class="info-box">
          <h3>Próximos pasos</h3>
          <ol>
            <li>Copiá el <strong>Refresh Token</strong> de arriba</li>
            <li>Andá a <a href="https://vercel.com/tlapidus-rgb/nitrosales/settings/environment-variables" target="_blank">Vercel → Environment Variables</a></li>
            <li>Actualizá la variable <code>GOOGLE_ADS_REFRESH_TOKEN</code> con el nuevo valor</li>
            <li>Hacé un redeploy desde <a href="https://vercel.com/tlapidus-rgb/nitrosales/deployments" target="_blank">Vercel Deployments</a></li>
          </ol>
          <p class="expiry-note">${expiryNote}</p>
        </div>
      </div>
    `), { headers: { "Content-Type": "text/html" } });

  } catch (e: any) {
    return new NextResponse(generateHTML("Error", `
      <div class="error-box">
        <h2>Error inesperado</h2>
        <p>${e.message}</p>
        <a href="/api/auth/google-ads" class="btn">Intentar de nuevo</a>
      </div>
    `), { headers: { "Content-Type": "text/html" } });
  }
}

function generateHTML(title: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NitroSales - ${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .container { max-width: 700px; width: 100%; }
    h1 { font-size: 28px; margin-bottom: 24px; color: #38bdf8; text-align: center; }
    h2 { font-size: 20px; margin-bottom: 16px; color: #f1f5f9; }
    h3 { font-size: 16px; margin-bottom: 8px; color: #94a3b8; }
    .success-box { background: #1e293b; border: 1px solid #22c55e; border-radius: 12px; padding: 24px; }
    .error-box { background: #1e293b; border: 1px solid #ef4444; border-radius: 12px; padding: 24px; text-align: center; }
    .info-box { background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 16px; margin-top: 20px; }
    .token-section { margin: 16px 0; }
    .token-display { display: flex; gap: 8px; align-items: stretch; }
    .token-display code { flex: 1; background: #0f172a; border: 1px solid #334155; border-radius: 6px; padding: 10px; font-size: 11px; word-break: break-all; color: #22c55e; max-height: 80px; overflow-y: auto; }
    .copy-btn { background: #3b82f6; color: white; border: none; border-radius: 6px; padding: 10px 16px; cursor: pointer; font-size: 13px; white-space: nowrap; }
    .copy-btn:hover { background: #2563eb; }
    .btn { display: inline-block; background: #3b82f6; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; margin-top: 16px; }
    .btn:hover { background: #2563eb; }
    .success-badge { background: #14532d; color: #4ade80; padding: 8px 16px; border-radius: 6px; margin-bottom: 16px; font-size: 14px; }
    .warning-badge { background: #713f12; color: #fbbf24; padding: 8px 16px; border-radius: 6px; margin-bottom: 16px; font-size: 14px; }
    ol { padding-left: 20px; line-height: 2; }
    a { color: #38bdf8; }
    .hint { color: #94a3b8; font-size: 14px; margin-top: 8px; }
    .expiry-note { background: #451a03; color: #fb923c; padding: 8px 12px; border-radius: 6px; margin-top: 12px; font-size: 13px; }
    p { line-height: 1.6; }
  </style>
</head>
<body>
  <div class="container">
    <h1>NitroSales</h1>
    ${content}
  </div>
</body>
</html>`;
}
