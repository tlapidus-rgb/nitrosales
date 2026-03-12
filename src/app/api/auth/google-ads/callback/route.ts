import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    return new NextResponse(
      `<html><body><h1>OAuth Error</h1><p>${error}</p></body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  if (!code) {
    return new NextResponse(
      `<html><body><h1>Error</h1><p>No authorization code received</p></body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  const baseUrl = `${url.protocol}//${url.host}`;
  const redirectUri = `${baseUrl}/api/auth/google-ads/callback`;

  try {
    // Exchange code for tokens
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

    if (!tokenRes.ok) {
      return new NextResponse(
        `<html><body style="font-family:sans-serif;max-width:600px;margin:40px auto;padding:20px;">
          <h1 style="color:#e74c3c;">Token Exchange Failed</h1>
          <p>Status: ${tokenRes.status}</p>
          <pre style="background:#f5f5f5;padding:15px;border-radius:8px;overflow-x:auto;">${JSON.stringify(tokenData, null, 2)}</pre>
          <a href="/api/auth/google-ads">Try Again</a>
        </body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    const refreshToken = tokenData.refresh_token || "No refresh token received";
    const accessToken = tokenData.access_token || "";

    // Test the token
    let testResult = "Not tested";
    if (accessToken) {
      try {
        const customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID || "").replace(/-/g, "");
        const testRes = await fetch(
          `https://googleads.googleapis.com/v20/customers/${customerId}/googleAds:searchStream`,
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
        testResult = testRes.ok ? "OK - Token works!" : `Failed (${testRes.status})`;
      } catch (e: any) {
        testResult = `Error: ${e.message}`;
      }
    }

    return new NextResponse(
      `<html>
      <head><title>NitroSales - Google Ads Token</title></head>
      <body style="font-family:sans-serif;max-width:700px;margin:40px auto;padding:20px;background:#fafafa;">
        <div style="background:white;padding:30px;border-radius:12px;box-shadow:0 2px 10px rgba(0,0,0,0.1);">
          <h1 style="color:#2ecc71;margin-top:0;">Google Ads Token Generated</h1>
          <p style="color:#666;">API Test: <strong style="color:${testResult.includes('OK') ? '#2ecc71' : '#e74c3c'}">${testResult}</strong></p>
          
          <h3>New Refresh Token:</h3>
          <div style="position:relative;">
            <pre id="token" style="background:#f5f5f5;padding:15px;border-radius:8px;word-break:break-all;white-space:pre-wrap;font-size:13px;">${refreshToken}</pre>
            <button onclick="navigator.clipboard.writeText(document.getElementById('token').textContent);this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',2000)" 
              style="position:absolute;top:8px;right:8px;background:#3498db;color:white;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:14px;">
              Copy
            </button>
          </div>
          
          <h3>Next Steps:</h3>
          <ol style="line-height:2;">
            <li>Copy the refresh token above</li>
            <li>Go to <a href="https://vercel.com/tlapidus-rgb/nitrosales/settings/environment-variables" target="_blank">Vercel Environment Variables</a></li>
            <li>Update <code>GOOGLE_ADS_REFRESH_TOKEN</code> with the new value</li>
            <li>Trigger a <a href="https://vercel.com/tlapidus-rgb/nitrosales/deployments" target="_blank">Redeploy</a></li>
          </ol>
          
          <p style="color:#e67e22;font-size:14px;margin-top:20px;padding:10px;background:#fff8e1;border-radius:6px;">
            ⚠️ In test mode ("Acceso al Explorador"), this token expires in ~7 days. Bookmark this page: <a href="/api/auth/google-ads">/api/auth/google-ads</a>
          </p>
        </div>
      </body>
      </html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  } catch (error: any) {
    return new NextResponse(
      `<html><body style="font-family:sans-serif;max-width:600px;margin:40px auto;padding:20px;">
        <h1 style="color:#e74c3c;">Error</h1>
        <pre style="background:#f5f5f5;padding:15px;border-radius:8px;">${error.message}</pre>
        <a href="/api/auth/google-ads">Try Again</a>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }
}
