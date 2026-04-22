// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/onboarding/test-credentials
// ══════════════════════════════════════════════════════════════
// Fase 1.1 del onboarding roadmap — test de credenciales en vivo.
//
// Input:  { platform: "VTEX" | "META_ADS" | "META_PIXEL", credentials: {...} }
// Output: { ok: true, detail: "12.450 ordenes detectadas" }
//         { ok: false, detail: "App Token invalido", hint: "..." }
//
// Plataformas OAuth (MercadoLibre, Google Ads, GSC) NO usan este endpoint:
// su validez se confirma cuando el flow de OAuth termina exitoso.
//
// NitroPixel: no se testea por API (es un snippet client-side). Se confirma
// con el checkbox "ya lo pegue" + verificacion on-page en el futuro.
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

type TestResult = {
  ok: boolean;
  detail: string;
  hint?: string;
};

// ── VTEX ──────────────────────────────────────────────
// Test: 1 GET a /api/oms/pvt/orders con limit=1 (mas liviano).
// Si 200 → credenciales OK, leemos el total de ordenes del header.
async function testVtex(creds: any): Promise<TestResult> {
  const accountName = (creds?.accountName || "").trim();
  const appKey = (creds?.appKey || "").trim();
  const appToken = (creds?.appToken || "").trim();

  if (!accountName || !appKey || !appToken) {
    return { ok: false, detail: "Faltan campos obligatorios", hint: "Completa Account Name, App Key y App Token." };
  }

  // Sanitizacion basica del accountName
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(accountName)) {
    return { ok: false, detail: "Account Name invalido", hint: "Solo letras, numeros y guiones. Sin https:// ni .myvtex.com" };
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
      // Timeout via AbortSignal para no colgar la UI
      signal: AbortSignal.timeout(10000),
    });

    if (resp.status === 401 || resp.status === 403) {
      return {
        ok: false,
        detail: "Credenciales invalidas (HTTP " + resp.status + ")",
        hint: "Revisa que el App Token corresponda al App Key. Verifica que el App Key tenga rol Owner o un rol con permisos sobre OMS.",
      };
    }

    if (resp.status === 404) {
      return {
        ok: false,
        detail: "Cuenta no encontrada",
        hint: `VTEX no reconoce la cuenta "${accountName}". Confirma el subdomain exacto (sin .myvtex.com).`,
      };
    }

    if (!resp.ok) {
      return {
        ok: false,
        detail: `Error HTTP ${resp.status}`,
        hint: "Probá de nuevo en unos segundos. Si persiste, revisa que tu cuenta VTEX este activa.",
      };
    }

    const data = await resp.json();
    const totalOrders = data?.paging?.total;
    if (typeof totalOrders === "number") {
      return {
        ok: true,
        detail: `${totalOrders.toLocaleString("es-AR")} ordenes detectadas`,
      };
    }
    return {
      ok: true,
      detail: "Conexion OK",
    };
  } catch (err: any) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      return { ok: false, detail: "Timeout (10s)", hint: "VTEX no respondio. Reintentá." };
    }
    return {
      ok: false,
      detail: err?.message || "Error de red",
      hint: "No pudimos conectar con VTEX. Revisa el Account Name.",
    };
  }
}

// ── META ADS ──────────────────────────────────────────
// Test: GET /me/adaccounts?fields=id,name con el token.
async function testMetaAds(creds: any): Promise<TestResult> {
  const accessToken = (creds?.accessToken || creds?.token || "").trim();
  const adAccountId = (creds?.adAccountId || creds?.accountId || "").trim();

  if (!accessToken) {
    return { ok: false, detail: "Falta Access Token", hint: "Generá uno en https://developers.facebook.com/tools/explorer" };
  }

  const url = `https://graph.facebook.com/v21.0/me/adaccounts?fields=id,name,account_status&limit=50&access_token=${encodeURIComponent(accessToken)}`;

  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const data = await resp.json();

    if (data?.error) {
      const code = data.error.code;
      const msg = data.error.message || "Error Meta API";
      if (code === 190) {
        return { ok: false, detail: "Access Token invalido o expirado", hint: "Generá un token nuevo con permisos ads_read + ads_management + business_management." };
      }
      return { ok: false, detail: msg };
    }

    const accounts = Array.isArray(data?.data) ? data.data : [];
    if (accounts.length === 0) {
      return { ok: false, detail: "No se detectaron cuentas publicitarias", hint: "Confirma que el token tenga permiso ads_read sobre al menos 1 Ad Account." };
    }

    if (adAccountId) {
      const normalized = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
      const found = accounts.find((a: any) => a.id === normalized);
      if (!found) {
        return {
          ok: false,
          detail: `Ad Account ${adAccountId} no encontrado`,
          hint: `El token tiene acceso a ${accounts.length} cuentas pero no a esa. Disponibles: ${accounts.slice(0, 3).map((a: any) => a.id).join(", ")}${accounts.length > 3 ? "..." : ""}`,
        };
      }
      return { ok: true, detail: `Conectado a ${found.name || found.id}` };
    }

    return { ok: true, detail: `${accounts.length} cuenta${accounts.length === 1 ? "" : "s"} publicitaria${accounts.length === 1 ? "" : "s"} detectada${accounts.length === 1 ? "" : "s"}` };
  } catch (err: any) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      return { ok: false, detail: "Timeout (10s)", hint: "Meta Graph no respondio. Reintentá." };
    }
    return { ok: false, detail: err?.message || "Error de red" };
  }
}

// ── META PIXEL ───────────────────────────────────────
// Test: GET /{pixel_id}?access_token=XXX&fields=id,name
// Reusa el token de Meta Ads si viene.
async function testMetaPixel(creds: any): Promise<TestResult> {
  const pixelId = (creds?.pixelId || "").trim();
  const accessToken = (creds?.accessToken || creds?.token || "").trim();

  if (!pixelId) {
    return { ok: false, detail: "Falta Pixel ID", hint: "Lo conseguis en business.facebook.com/events_manager → tu pixel → Settings." };
  }
  if (!/^\d+$/.test(pixelId)) {
    return { ok: false, detail: "Pixel ID invalido", hint: "Debe ser un numero largo (ej: 1234567890123456)." };
  }

  if (!accessToken) {
    return { ok: true, detail: "Pixel ID con formato valido (no validamos contra Meta sin access token)" };
  }

  const url = `https://graph.facebook.com/v21.0/${pixelId}?fields=id,name,last_fired_time&access_token=${encodeURIComponent(accessToken)}`;

  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const data = await resp.json();

    if (data?.error) {
      const code = data.error.code;
      if (code === 190) {
        return { ok: false, detail: "Access Token invalido", hint: "El token no tiene permisos para leer este pixel." };
      }
      if (code === 100 || data.error?.type === "GraphMethodException") {
        return { ok: false, detail: "Pixel ID no encontrado", hint: "Verifica que el ID corresponda a un pixel al que tu token tenga acceso." };
      }
      return { ok: false, detail: data.error.message || "Error Meta API" };
    }

    const name = data?.name || pixelId;
    const lastFired = data?.last_fired_time;
    const detail = lastFired
      ? `Pixel "${name}" OK (ultimo evento: ${new Date(lastFired).toLocaleDateString("es-AR")})`
      : `Pixel "${name}" OK (sin eventos recientes)`;
    return { ok: true, detail };
  } catch (err: any) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      return { ok: false, detail: "Timeout (10s)" };
    }
    return { ok: false, detail: err?.message || "Error de red" };
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ ok: false, detail: "No autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const platform = (body?.platform || "").toUpperCase();
    const credentials = body?.credentials || {};

    let result: TestResult;

    if (platform === "VTEX") {
      result = await testVtex(credentials);
    } else if (platform === "META_ADS") {
      result = await testMetaAds(credentials);
    } else if (platform === "META_PIXEL") {
      result = await testMetaPixel(credentials);
    } else {
      return NextResponse.json(
        { ok: false, detail: `Plataforma "${platform}" no soporta test manual (usa OAuth)` },
        { status: 400 }
      );
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[onboarding/test-credentials] error:", error);
    return NextResponse.json({ ok: false, detail: error?.message || "Error interno" }, { status: 500 });
  }
}
