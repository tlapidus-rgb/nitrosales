// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/public/onboarding/start
// ══════════════════════════════════════════════════════════════
// Endpoint público del formulario de onboarding.
// Recibe data del prospecto, guarda en onboarding_requests con status
// PENDING, manda email de confirmación con timeline 48-72hs.
// Rate-limited por IP (1 request cada 10s, max 3 por hora).
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { randomUUID, randomBytes } from "crypto";
import { encryptCredentials } from "@/lib/crypto";
import { sendEmail } from "@/lib/email/send";
import { onboardingConfirmationEmail } from "@/lib/onboarding/emails";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

// Rate limiter in-memory (per IP, per instance — razonable para prevenir spam)
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_PER_WINDOW = 3;
const MIN_GAP_MS = 10_000; // 10s between submits
const lastSubmitByIp = new Map<string, number>();

function checkRateLimit(ip: string): { allowed: boolean; reason?: string } {
  const now = Date.now();
  // Min gap
  const lastSubmit = lastSubmitByIp.get(ip);
  if (lastSubmit && now - lastSubmit < MIN_GAP_MS) {
    return { allowed: false, reason: "Esperá unos segundos antes de reenviar." };
  }
  // Window limit
  const bucket = rateLimitMap.get(ip);
  if (bucket) {
    if (now - bucket.windowStart < WINDOW_MS) {
      if (bucket.count >= MAX_PER_WINDOW) {
        return { allowed: false, reason: "Demasiadas solicitudes desde tu IP. Volvé en una hora." };
      }
      bucket.count++;
    } else {
      rateLimitMap.set(ip, { count: 1, windowStart: now });
    }
  } else {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
  }
  lastSubmitByIp.set(ip, now);
  // Cleanup
  if (rateLimitMap.size > 10_000) {
    for (const [k, v] of rateLimitMap) {
      if (now - v.windowStart > WINDOW_MS) rateLimitMap.delete(k);
    }
  }
  return { allowed: true };
}

// Validación simple de slug (solo a-z, 0-9, hyphens)
function isValidSlug(s: string): boolean {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(s) && s.length >= 2 && s.length <= 60;
}
function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}
function isValidUrl(s: string): boolean {
  return /^https?:\/\/.+\..+/.test(s);
}

export async function POST(req: NextRequest) {
  try {
    // Rate limit por IP
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const rate = checkRateLimit(ip);
    if (!rate.allowed) {
      return NextResponse.json({ error: rate.reason }, { status: 429 });
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Body inválido" }, { status: 400 });
    }

    // Validaciones — Step 1: Empresa
    const companyName = String(body.companyName || "").trim();
    const proposedSlug = String(body.proposedSlug || "").trim().toLowerCase();
    const storeUrl = String(body.storeUrl || "").trim().replace(/\/+$/, "");
    const industry = body.industry ? String(body.industry).trim().slice(0, 80) : null;
    const cuit = body.cuit ? String(body.cuit).trim().replace(/[^0-9]/g, "").slice(0, 11) : null;

    if (!companyName || companyName.length < 2 || companyName.length > 120) {
      return NextResponse.json({ error: "companyName debe tener 2-120 caracteres" }, { status: 400 });
    }
    if (!isValidSlug(proposedSlug)) {
      return NextResponse.json({ error: "slug inválido (solo a-z, 0-9, guiones, 2-60 chars)" }, { status: 400 });
    }
    if (!isValidUrl(storeUrl)) {
      return NextResponse.json({ error: "storeUrl inválido — debe empezar con https://" }, { status: 400 });
    }

    // Step 2: Contacto
    const contactName = String(body.contactName || "").trim().slice(0, 120);
    const contactEmail = String(body.contactEmail || "").trim().toLowerCase();
    const contactPhone = body.contactPhone ? String(body.contactPhone).trim().slice(0, 40) : null;
    const contactWhatsapp = body.contactWhatsapp ? String(body.contactWhatsapp).trim().slice(0, 40) : null;

    if (!contactName || contactName.length < 2) {
      return NextResponse.json({ error: "contactName requerido" }, { status: 400 });
    }
    if (!isValidEmail(contactEmail)) {
      return NextResponse.json({ error: "contactEmail inválido" }, { status: 400 });
    }

    // Step 1 extras: operación (timezone, moneda, fiscal)
    const VALID_TZ = [
      "America/Argentina/Buenos_Aires",
      "America/Argentina/Cordoba",
      "America/Santiago",
      "America/Montevideo",
      "America/Sao_Paulo",
      "America/Mexico_City",
      "America/Lima",
      "America/Bogota",
    ];
    const timezoneRaw = body.timezone ? String(body.timezone).trim() : "";
    const timezone = VALID_TZ.includes(timezoneRaw)
      ? timezoneRaw
      : "America/Argentina/Buenos_Aires";

    const VALID_CURRENCY = ["ARS", "USD"];
    const currencyRaw = body.currency ? String(body.currency).trim().toUpperCase() : "";
    const currency = VALID_CURRENCY.includes(currencyRaw) ? currencyRaw : "ARS";

    const VALID_FISCAL = ["MONOTRIBUTO", "RESPONSABLE_INSCRIPTO", "EXENTO", "OTRO"];
    const fiscalRaw = body.fiscalCondition ? String(body.fiscalCondition).trim() : "";
    const fiscalCondition = VALID_FISCAL.includes(fiscalRaw) ? fiscalRaw : null;

    // Step 3: Platforms — opcionales, encriptar si vienen
    const vtexAccountName = body.vtexAccountName ? String(body.vtexAccountName).trim().slice(0, 60) : null;
    const vtexAppKeyRaw = body.vtexAppKey ? String(body.vtexAppKey).trim() : null;
    const vtexAppTokenRaw = body.vtexAppToken ? String(body.vtexAppToken).trim() : null;

    const vtexAppKeyEncrypted = vtexAppKeyRaw ? encryptCredentials({ key: vtexAppKeyRaw }) : null;
    const vtexAppTokenEncrypted = vtexAppTokenRaw ? encryptCredentials({ token: vtexAppTokenRaw }) : null;

    const mlUsername = body.mlUsername ? String(body.mlUsername).trim().slice(0, 60) : null;

    const metaAdAccountId = body.metaAdAccountId
      ? String(body.metaAdAccountId).trim().slice(0, 40)
      : null;
    const metaAccessTokenRaw = body.metaAccessToken ? String(body.metaAccessToken).trim() : null;
    const metaAccessTokenEncrypted = metaAccessTokenRaw
      ? encryptCredentials({ token: metaAccessTokenRaw })
      : null;

    // Meta Pixel (CAPI) — distinto de Meta Ads Business (un cliente puede tener uno sin el otro)
    const metaPixelId = body.metaPixelId ? String(body.metaPixelId).trim().slice(0, 40) : null;
    const metaPixelTokenRaw = body.metaPixelToken ? String(body.metaPixelToken).trim() : null;
    const metaPixelTokenEncrypted = metaPixelTokenRaw
      ? encryptCredentials({ token: metaPixelTokenRaw })
      : null;

    const googleAdsCustomerId = body.googleAdsCustomerId
      ? String(body.googleAdsCustomerId).trim().slice(0, 40)
      : null;

    // History range por plataforma (meses). Valores validos: 0,3,6,12,24,36,-1
    // -1 representa "todo lo disponible" (lo traducimos a 120 meses = 10 años).
    const parseHistoryMonths = (v: any, defaultMonths: number): number => {
      const n = Number(v);
      if (!Number.isFinite(n)) return defaultMonths;
      if (n === -1) return 120;
      if (n < 0) return defaultMonths;
      if (n > 120) return 120;
      return Math.round(n);
    };
    const historyVtexMonths = parseHistoryMonths(body.historyVtexMonths, 12);
    const historyMlMonths = parseHistoryMonths(body.historyMlMonths, 12);
    const historyMetaMonths = parseHistoryMonths(body.historyMetaMonths, 6);
    const historyGoogleMonths = parseHistoryMonths(body.historyGoogleMonths, 6);

    // Flags de plataformas (flow hibrido: el cliente marca cuales usa,
    // completa credenciales despues en /setup dentro del producto).
    // Back-compat: si ya vienen credenciales, asumimos que usa esa plataforma.
    const usesVtex = !!body.usesVtex || !!vtexAccountName;
    const usesMl = !!body.usesMl || !!mlUsername;
    const usesMeta = !!body.usesMeta || !!metaAdAccountId;
    const usesMetaPixel = !!body.usesMetaPixel || !!metaPixelId;
    const usesGoogle = !!body.usesGoogle || !!googleAdsCustomerId;

    // Generar IDs
    const id = randomUUID();
    const token = randomBytes(24).toString("hex"); // 48 chars

    // Insertar
    await prisma.$executeRawUnsafe(
      `INSERT INTO "onboarding_requests" (
        "id", "status", "token",
        "companyName", "proposedSlug", "cuit", "industry", "storeUrl",
        "timezone", "currency", "fiscalCondition",
        "contactName", "contactEmail", "contactPhone", "contactWhatsapp",
        "vtexAccountName", "vtexAppKeyEncrypted", "vtexAppTokenEncrypted",
        "mlUsername",
        "metaAdAccountId", "metaAccessTokenEncrypted",
        "metaPixelId", "metaPixelTokenEncrypted",
        "googleAdsCustomerId",
        "historyVtexMonths", "historyMlMonths", "historyMetaMonths", "historyGoogleMonths",
        "usesVtex", "usesMl", "usesMeta", "usesMetaPixel", "usesGoogle",
        "progressStage", "createdAt", "updatedAt"
      ) VALUES (
        $1, 'PENDING', $2,
        $3, $4, $5, $6, $7,
        $8, $9, $10,
        $11, $12, $13, $14,
        $15, $16, $17,
        $18,
        $19, $20,
        $21, $22,
        $23,
        $24, $25, $26, $27,
        $28, $29, $30, $31, $32,
        'received', NOW(), NOW()
      )`,
      id,
      token,
      companyName,
      proposedSlug,
      cuit,
      industry,
      storeUrl,
      timezone,
      currency,
      fiscalCondition,
      contactName,
      contactEmail,
      contactPhone,
      contactWhatsapp,
      vtexAccountName,
      vtexAppKeyEncrypted,
      vtexAppTokenEncrypted,
      mlUsername,
      metaAdAccountId,
      metaAccessTokenEncrypted,
      metaPixelId,
      metaPixelTokenEncrypted,
      googleAdsCustomerId,
      historyVtexMonths,
      historyMlMonths,
      historyMetaMonths,
      historyGoogleMonths,
      usesVtex,
      usesMl,
      usesMeta,
      usesMetaPixel,
      usesGoogle
    );

    // Email de confirmación (fire-and-forget)
    const { subject, html } = onboardingConfirmationEmail({
      contactName,
      companyName,
      statusToken: token,
    });
    sendEmail({ to: contactEmail, subject, html }).catch((err) => {
      console.error("[onboarding/start] email send failed:", err?.message);
    });

    return NextResponse.json({
      ok: true,
      requestId: id,
      statusToken: token,
      message: "Solicitud recibida. Revisá tu email y seguí el progreso en /onboarding/status/<token>.",
    });
  } catch (error: any) {
    console.error("[onboarding/start] error:", error);
    return NextResponse.json(
      { error: "No pudimos procesar tu solicitud. Intentá de nuevo en unos minutos." },
      { status: 500 }
    );
  }
}
