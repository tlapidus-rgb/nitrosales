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

export async function testCredentialsByPlatform(platform: string, credentials: any): Promise<TestResult> {
  switch (platform.toUpperCase()) {
    case "VTEX":
      return testVtex(credentials);
    case "META_ADS":
      return testMetaAds(credentials);
    case "META_PIXEL":
      return testMetaPixel(credentials);
    default:
      return { ok: false, detail: `Plataforma "${platform}" no soporta test manual (probable OAuth)` };
  }
}
