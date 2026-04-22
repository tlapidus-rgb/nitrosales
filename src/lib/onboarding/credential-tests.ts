// ══════════════════════════════════════════════════════════════
// credential-tests.ts — funciones puras de test de credenciales
// ══════════════════════════════════════════════════════════════
// Reusables desde el endpoint del cliente (no expuesto en UI hoy)
// y desde el panel admin (F1.3 — botones de test antes de aprobar).
// ══════════════════════════════════════════════════════════════

export type TestResult = {
  ok: boolean;
  detail: string;
  hint?: string;
};

export async function testVtex(creds: any): Promise<TestResult> {
  const accountName = (creds?.accountName || "").trim();
  const appKey = (creds?.appKey || "").trim();
  const appToken = (creds?.appToken || "").trim();

  if (!accountName || !appKey || !appToken) {
    return { ok: false, detail: "Faltan campos obligatorios", hint: "Account Name, App Key y App Token son requeridos." };
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(accountName)) {
    return { ok: false, detail: "Account Name inválido", hint: "Solo letras, números y guiones. Sin https:// ni .myvtex.com" };
  }

  const url = `https://${accountName}.vtexcommercestable.com.br/api/oms/pvt/orders?per_page=1`;

  try {
    const resp = await fetch(url, {
      method: "GET",
      headers: {
        "X-VTEX-API-AppKey": appKey,
        "X-VTEX-API-AppToken": appToken,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (resp.status === 401 || resp.status === 403) {
      return {
        ok: false,
        detail: `Credenciales inválidas (HTTP ${resp.status})`,
        hint: "Revisar que App Token corresponda al App Key. Verificar permisos sobre OMS.",
      };
    }
    if (resp.status === 404) {
      return {
        ok: false,
        detail: "Cuenta no encontrada",
        hint: `VTEX no reconoce la cuenta "${accountName}".`,
      };
    }
    if (!resp.ok) {
      return { ok: false, detail: `Error HTTP ${resp.status}` };
    }

    const data = await resp.json();
    const totalOrders = data?.paging?.total;
    if (typeof totalOrders === "number") {
      return { ok: true, detail: `${totalOrders.toLocaleString("es-AR")} órdenes detectadas` };
    }
    return { ok: true, detail: "Conexión OK" };
  } catch (err: any) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      return { ok: false, detail: "Timeout (10s)", hint: "VTEX no respondió. Reintentar." };
    }
    return { ok: false, detail: err?.message || "Error de red" };
  }
}

export async function testMetaAds(creds: any): Promise<TestResult> {
  const accessToken = (creds?.accessToken || creds?.token || "").trim();
  const adAccountId = (creds?.adAccountId || creds?.accountId || "").trim();

  if (!accessToken) {
    return { ok: false, detail: "Falta Access Token" };
  }

  const url = `https://graph.facebook.com/v21.0/me/adaccounts?fields=id,name,account_status&limit=50&access_token=${encodeURIComponent(accessToken)}`;

  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const data = await resp.json();

    if (data?.error) {
      const code = data.error.code;
      const msg = data.error.message || "Error Meta API";
      if (code === 190) {
        return { ok: false, detail: "Access Token inválido o expirado", hint: "Permisos requeridos: ads_read + ads_management + business_management." };
      }
      return { ok: false, detail: msg };
    }

    const accounts = Array.isArray(data?.data) ? data.data : [];
    if (accounts.length === 0) {
      return { ok: false, detail: "Sin cuentas publicitarias accesibles" };
    }

    if (adAccountId) {
      const normalized = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
      const found = accounts.find((a: any) => a.id === normalized);
      if (!found) {
        return {
          ok: false,
          detail: `Ad Account ${adAccountId} no accesible`,
          hint: `Token tiene acceso a ${accounts.length} cuentas distintas.`,
        };
      }
      return { ok: true, detail: `Conectado a ${found.name || found.id}` };
    }

    return { ok: true, detail: `${accounts.length} cuenta${accounts.length === 1 ? "" : "s"} accesible${accounts.length === 1 ? "" : "s"}` };
  } catch (err: any) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      return { ok: false, detail: "Timeout (10s)" };
    }
    return { ok: false, detail: err?.message || "Error de red" };
  }
}

export async function testMetaPixel(creds: any): Promise<TestResult> {
  const pixelId = (creds?.pixelId || "").trim();
  const accessToken = (creds?.accessToken || creds?.token || "").trim();

  if (!pixelId) {
    return { ok: false, detail: "Falta Pixel ID" };
  }
  if (!/^\d+$/.test(pixelId)) {
    return { ok: false, detail: "Pixel ID inválido (debe ser numérico)" };
  }

  if (!accessToken) {
    return { ok: true, detail: "Pixel ID con formato válido (sin access token para validación full)" };
  }

  const url = `https://graph.facebook.com/v21.0/${pixelId}?fields=id,name,last_fired_time&access_token=${encodeURIComponent(accessToken)}`;

  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const data = await resp.json();

    if (data?.error) {
      const code = data.error.code;
      if (code === 190) return { ok: false, detail: "Access Token inválido para este pixel" };
      if (code === 100 || data.error?.type === "GraphMethodException") {
        return { ok: false, detail: "Pixel ID no encontrado o sin acceso" };
      }
      return { ok: false, detail: data.error.message || "Error Meta API" };
    }

    const name = data?.name || pixelId;
    const lastFired = data?.last_fired_time;
    return {
      ok: true,
      detail: lastFired
        ? `Pixel "${name}" OK (último evento: ${new Date(lastFired).toLocaleDateString("es-AR")})`
        : `Pixel "${name}" OK (sin eventos recientes)`,
    };
  } catch (err: any) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      return { ok: false, detail: "Timeout (10s)" };
    }
    return { ok: false, detail: err?.message || "Error de red" };
  }
}

// ── MERCADOLIBRE ─────────────────────────────────────
// Test: refresh token si esta expirado + GET /users/me para validar auth
// Reusa el patron de getSellerToken pero sin persistir cambios.
export async function testMercadoLibre(creds: any): Promise<TestResult> {
  const accessToken = (creds?.accessToken || "").trim();
  const refreshToken = (creds?.refreshToken || "").trim();
  const appId = (creds?.appId || "").trim();
  const secretKey = (creds?.secretKey || "").trim();
  const expiresAt = creds?.tokenExpiresAt;

  if (!accessToken && !refreshToken) {
    return { ok: false, detail: "Sin tokens de OAuth", hint: "El cliente debe re-autorizar MercadoLibre desde el wizard." };
  }

  // Si esta expirado y hay refresh, intentar refresh primero
  let tokenToUse = accessToken;
  const expiredOrSoon = !expiresAt || Date.now() > (Number(expiresAt) - 60000);

  if (expiredOrSoon) {
    if (!refreshToken || !appId || !secretKey) {
      return { ok: false, detail: "Token expirado y sin refresh_token", hint: "El cliente debe re-autorizar MercadoLibre." };
    }
    try {
      const refreshRes = await fetch("https://api.mercadolibre.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", accept: "application/json" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: appId,
          client_secret: secretKey,
          refresh_token: refreshToken,
        }).toString(),
        signal: AbortSignal.timeout(10000),
      });
      if (!refreshRes.ok) {
        return { ok: false, detail: `Refresh fallo (HTTP ${refreshRes.status})`, hint: "El cliente debe re-autorizar MercadoLibre." };
      }
      const refreshData = await refreshRes.json();
      tokenToUse = refreshData.access_token;
    } catch (err: any) {
      return { ok: false, detail: "Error al refrescar token: " + (err?.message || "?") };
    }
  }

  // Test: GET /users/me
  try {
    const resp = await fetch("https://api.mercadolibre.com/users/me", {
      headers: { Authorization: `Bearer ${tokenToUse}` },
      signal: AbortSignal.timeout(10000),
    });
    if (resp.status === 401 || resp.status === 403) {
      return { ok: false, detail: `Token rechazado (HTTP ${resp.status})`, hint: "Re-autorizar MercadoLibre." };
    }
    if (!resp.ok) {
      return { ok: false, detail: `Error HTTP ${resp.status}` };
    }
    const data = await resp.json();
    const nickname = data?.nickname || "?";
    const userId = data?.id;
    return { ok: true, detail: `Conectado como "${nickname}" (ID ${userId})` };
  } catch (err: any) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      return { ok: false, detail: "Timeout (10s)" };
    }
    return { ok: false, detail: err?.message || "Error de red" };
  }
}

// ── GOOGLE ADS ──────────────────────────────────────
// Test: refresh OAuth + listAccessibleCustomers
export async function testGoogleAds(creds: any): Promise<TestResult> {
  const clientId = (creds?.clientId || "").trim();
  const clientSecret = (creds?.clientSecret || "").trim();
  const refreshToken = (creds?.refreshToken || "").trim();
  const developerToken = (creds?.developerToken || "").trim();
  const customerId = (creds?.customerId || "").replace(/-/g, "").trim();

  if (!clientId || !clientSecret || !refreshToken) {
    return { ok: false, detail: "Faltan credenciales OAuth (clientId/clientSecret/refreshToken)" };
  }
  if (!developerToken) {
    return { ok: false, detail: "Falta developer_token", hint: "Se pide en https://ads.google.com/aw/apicenter" };
  }

  // Refresh token
  let accessToken = "";
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }).toString(),
      signal: AbortSignal.timeout(10000),
    });
    if (!tokenRes.ok) {
      return { ok: false, detail: `OAuth refresh falló (${tokenRes.status})`, hint: "Re-autorizar Google Ads." };
    }
    const tokenData = await tokenRes.json();
    accessToken = tokenData.access_token;
  } catch (err: any) {
    return { ok: false, detail: "Error en OAuth refresh: " + (err?.message || "?") };
  }

  // Test: listAccessibleCustomers
  try {
    const resp = await fetch("https://googleads.googleapis.com/v16/customers:listAccessibleCustomers", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": developerToken,
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      const msg = err?.error?.message || `HTTP ${resp.status}`;
      if (resp.status === 401) {
        return { ok: false, detail: "Token rechazado por Google Ads API", hint: "Re-autorizar." };
      }
      if (resp.status === 403) {
        return { ok: false, detail: "Developer token sin permisos", hint: msg };
      }
      return { ok: false, detail: msg };
    }
    const data = await resp.json();
    const resources: string[] = data?.resourceNames || [];
    if (resources.length === 0) {
      return { ok: false, detail: "Sin cuentas de Google Ads accesibles" };
    }
    if (customerId) {
      const found = resources.some((r) => r.includes(customerId));
      if (!found) {
        return { ok: false, detail: `Customer ${customerId} no está en cuentas accesibles`, hint: `${resources.length} cuentas disponibles.` };
      }
      return { ok: true, detail: `Customer ${customerId} accesible (de ${resources.length} cuentas total)` };
    }
    return { ok: true, detail: `${resources.length} cuenta${resources.length === 1 ? "" : "s"} accesible${resources.length === 1 ? "" : "s"}` };
  } catch (err: any) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      return { ok: false, detail: "Timeout (10s)" };
    }
    return { ok: false, detail: err?.message || "Error de red" };
  }
}

// ── GOOGLE SEARCH CONSOLE ───────────────────────────
// Test: JWT con service account + sites.list
// Acepta tanto service account (legacy) como OAuth refresh_token (nuevo)
export async function testGSC(creds: any): Promise<TestResult> {
  // Variante 1: Service Account (JWT)
  if (creds?.client_email && creds?.private_key) {
    try {
      const crypto = await import("crypto");
      const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
      const now = Math.floor(Date.now() / 1000);
      const claim = Buffer.from(JSON.stringify({
        iss: creds.client_email,
        scope: "https://www.googleapis.com/auth/webmasters.readonly",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      })).toString("base64url");
      const signInput = header + "." + claim;
      const sign = crypto.createSign("RSA-SHA256");
      sign.update(signInput);
      const signature = sign.sign(creds.private_key, "base64url");
      const jwt = signInput + "." + signature;

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=" + jwt,
        signal: AbortSignal.timeout(10000),
      });
      const tokenData = await tokenRes.json();
      if (!tokenData.access_token) {
        return { ok: false, detail: "JWT auth falló", hint: tokenData?.error_description || "Verificar client_email y private_key." };
      }

      const sitesRes = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!sitesRes.ok) return { ok: false, detail: `sites.list falló (HTTP ${sitesRes.status})` };
      const sitesData = await sitesRes.json();
      const sites = sitesData?.siteEntry || [];
      if (sites.length === 0) {
        return { ok: false, detail: "Sin sites accesibles", hint: "Compartir el site con la service account en GSC." };
      }
      return { ok: true, detail: `${sites.length} site${sites.length === 1 ? "" : "s"} accesible${sites.length === 1 ? "" : "s"} (service account)` };
    } catch (err: any) {
      return { ok: false, detail: err?.message || "Error en JWT auth" };
    }
  }

  // Variante 2: OAuth user (refresh_token)
  const clientId = (creds?.clientId || "").trim();
  const clientSecret = (creds?.clientSecret || "").trim();
  const refreshToken = (creds?.refreshToken || "").trim();
  if (!clientId || !clientSecret || !refreshToken) {
    return { ok: false, detail: "Faltan credenciales (service account O OAuth)" };
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }).toString(),
      signal: AbortSignal.timeout(10000),
    });
    if (!tokenRes.ok) {
      return { ok: false, detail: `OAuth refresh falló (${tokenRes.status})` };
    }
    const tokenData = await tokenRes.json();

    const sitesRes = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!sitesRes.ok) return { ok: false, detail: `sites.list falló (HTTP ${sitesRes.status})` };
    const sitesData = await sitesRes.json();
    const sites = sitesData?.siteEntry || [];
    return { ok: true, detail: `${sites.length} site${sites.length === 1 ? "" : "s"} accesible${sites.length === 1 ? "" : "s"} (OAuth)` };
  } catch (err: any) {
    return { ok: false, detail: err?.message || "Error de red" };
  }
}

// ── NITROPIXEL ──────────────────────────────────────
// No es API externa — chequea la DB para ver si el pixel disparo
// eventos en las ultimas 48hs. Recibe orgId (no credentials).
export async function testNitroPixel(orgId: string, prismaClient: any): Promise<TestResult> {
  if (!orgId) return { ok: false, detail: "Falta orgId" };
  try {
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const rows = await prismaClient.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS c FROM "pixel_events" WHERE "organizationId" = $1 AND "eventTime" >= $2`,
      orgId,
      since
    );
    const count = Number(rows?.[0]?.c || 0);
    if (count === 0) {
      return {
        ok: false,
        detail: "Sin eventos en las últimas 48hs",
        hint: "Verificar que el snippet esté instalado en el <head> del sitio.",
      };
    }
    return { ok: true, detail: `${count.toLocaleString("es-AR")} eventos detectados últimas 48hs` };
  } catch (err: any) {
    return { ok: false, detail: err?.message || "Error consultando DB" };
  }
}

export async function testCredentialsByPlatform(platform: string, credentials: any): Promise<TestResult> {
  switch (platform.toUpperCase()) {
    case "VTEX":
      return testVtex(credentials);
    case "META_ADS":
      return testMetaAds(credentials);
    case "META_PIXEL":
      return testMetaPixel(credentials);
    case "MERCADOLIBRE":
      return testMercadoLibre(credentials);
    case "GOOGLE_ADS":
      return testGoogleAds(credentials);
    case "GOOGLE_SEARCH_CONSOLE":
    case "GSC":
      return testGSC(credentials);
    default:
      return { ok: false, detail: `Plataforma "${platform}" desconocida` };
  }
}
