// ══════════════════════════════════════════════════════════════
// GET /api/admin/monedas-de-ads — contestar R-V05 de una vez
// ══════════════════════════════════════════════════════════════
// "¿Las cuentas de ads facturan en pesos o en dólares?" lleva abierta desde la
// auditoría del 2026-09-02. Si alguna está en USD, el ROAS de ese canal está
// mal por un factor de ~1.000.
//
// El sistema nunca preguntó —`ad_metrics_daily` no tiene columna de moneda— y
// las dos APIs la devuelven gratis. Esto pregunta.
//
// **Sólo lee.** No convierte nada ni toca el gasto guardado: qué hacer si alguna
// está en dólares es una decisión con consecuencias (a qué tipo de cambio, desde
// cuándo, qué pasa con los históricos) y se toma con la respuesta en la mano.
//
// Auth: staff o ?key=.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import { isValidAdminKey } from "@/lib/admin-key";
import { evaluarMoneda, resumir } from "@/lib/ads/moneda";
import type { MonedaDeCuenta } from "@/lib/ads/moneda";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Meta devuelve la moneda de la cuenta en el campo `currency`. */
async function monedaDeMeta(creds: any, org: string): Promise<MonedaDeCuenta> {
  const token = creds?.accessToken || creds?.access_token || "";
  const cuenta = creds?.adAccountId || creds?.ad_account_id || null;
  if (!token || !cuenta) {
    return evaluarMoneda("META_ADS", org, cuenta, null);
  }
  try {
    const r = await fetch(
      `https://graph.facebook.com/v19.0/${cuenta}?fields=currency,name&access_token=${token}`,
      { signal: AbortSignal.timeout(12_000) },
    );
    const j: any = await r.json().catch(() => null);
    return evaluarMoneda("META_ADS", org, cuenta, j?.currency);
  } catch {
    return evaluarMoneda("META_ADS", org, cuenta, null);
  }
}

/** Google Ads la devuelve en `customer.currency_code`, vía GAQL. */
async function monedaDeGoogle(creds: any, org: string): Promise<MonedaDeCuenta> {
  const customerId = String(creds?.customerId || "").replace(/-/g, "");
  const refreshToken = creds?.refreshToken || creds?.refresh_token || "";
  if (!customerId || !refreshToken) {
    return evaluarMoneda("GOOGLE_ADS", org, customerId || null, null);
  }
  try {
    const tk = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
      signal: AbortSignal.timeout(12_000),
    });
    const tj: any = await tk.json().catch(() => null);
    if (!tj?.access_token) return evaluarMoneda("GOOGLE_ADS", org, customerId, null);

    const loginCustomerId = String(creds?.loginCustomerId || "").replace(/-/g, "");
    const r = await fetch(
      `https://googleads.googleapis.com/v20/customers/${customerId}/googleAds:searchStream`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tj.access_token}`,
          "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "",
          ...(loginCustomerId ? { "login-customer-id": loginCustomerId } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: "SELECT customer.currency_code FROM customer LIMIT 1" }),
        signal: AbortSignal.timeout(12_000),
      },
    );
    const data: any = await r.json().catch(() => null);
    const codigo = Array.isArray(data)
      ? data.find((b: any) => b?.results?.length)?.results?.[0]?.customer?.currencyCode
      : null;
    return evaluarMoneda("GOOGLE_ADS", org, customerId, codigo);
  } catch {
    return evaluarMoneda("GOOGLE_ADS", org, customerId, null);
  }
}

export async function GET(req: NextRequest) {
  const key = new URL(req.url).searchParams.get("key");
  if (!isValidAdminKey(key) && !(await isInternalUser())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const conns = await prisma.connection
    .findMany({
      where: { platform: { in: ["META_ADS", "GOOGLE_ADS"] as any }, status: "ACTIVE" as any },
      select: { platform: true, credentials: true, organization: { select: { name: true } } },
    })
    .catch(() => []);

  // Una cuenta que no contesta no puede tumbar el diagnóstico de las demás.
  const cuentas = await Promise.all(
    conns.map((c: any) => {
      const org = c.organization?.name ?? "?";
      return c.platform === "META_ADS"
        ? monedaDeMeta(c.credentials, org)
        : monedaDeGoogle(c.credentials, org);
    }),
  );

  return NextResponse.json({
    generadoEn: new Date().toISOString(),
    ...resumir(cuentas),
    cuentas,
  });
}
