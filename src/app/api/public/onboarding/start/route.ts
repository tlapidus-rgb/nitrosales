// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/public/onboarding/start
// ══════════════════════════════════════════════════════════════
// Endpoint del form de POSTULACION publica. Recibe datos minimos del
// prospecto, guarda en onboarding_requests con status PENDING, manda
// email de confirmacion (sin prometer plazo).
//
// Form simple — solo: empresa, contacto (nombre+email), telefono opcional,
// referralSource (de donde nos conocio), notes (opcional).
//
// Todo lo tecnico (URL, industria, plataformas, credenciales, rango
// historico, etc.) se completa adentro del producto via OnboardingOverlay
// despues de que el admin apruebe la cuenta.
//
// Rate-limited por IP.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { randomUUID, randomBytes } from "crypto";
import { sendEmail } from "@/lib/email/send";
import { onboardingConfirmationEmailActive } from "@/lib/onboarding/emails";
import { waitUntil } from "@vercel/functions";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

// ─── Rate limiter (in-memory) ────────────────────────────────
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const lastSubmitByIp = new Map<string, number>();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 3;
const MIN_GAP_MS = 10_000;

function checkRateLimit(ip: string): { allowed: boolean; reason?: string } {
  const now = Date.now();
  const lastSubmit = lastSubmitByIp.get(ip);
  if (lastSubmit && now - lastSubmit < MIN_GAP_MS) {
    return { allowed: false, reason: "Esperá unos segundos antes de reenviar." };
  }
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
  if (rateLimitMap.size > 10_000) {
    for (const [k, v] of rateLimitMap) {
      if (now - v.windowStart > WINDOW_MS) rateLimitMap.delete(k);
    }
  }
  return { allowed: true };
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

// Auto-genera slug desde el nombre de empresa
function autoSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "cliente";
}

const VALID_REFERRAL = [
  "linkedin",
  "instagram",
  "google",
  "referido",
  "evento",
  "podcast",
  "otro",
];

export async function POST(req: NextRequest) {
  try {
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

    // ─── Validacion de campos minimos ─────────────────────────
    const companyName = String(body.companyName || "").trim();
    if (!companyName || companyName.length < 2 || companyName.length > 120) {
      return NextResponse.json({ error: "El nombre de la empresa es requerido" }, { status: 400 });
    }

    const contactName = String(body.contactName || "").trim().slice(0, 120);
    if (!contactName || contactName.length < 2) {
      return NextResponse.json({ error: "Tu nombre es requerido" }, { status: 400 });
    }

    const contactEmail = String(body.contactEmail || "").trim().toLowerCase();
    if (!isValidEmail(contactEmail)) {
      return NextResponse.json({ error: "Email inválido" }, { status: 400 });
    }

    // ─── Campos opcionales ────────────────────────────────────
    const contactPhone = body.contactPhone ? String(body.contactPhone).trim().slice(0, 40) : null;

    const referralRaw = body.referralSource ? String(body.referralSource).trim().toLowerCase() : "";
    const referralSource = VALID_REFERRAL.includes(referralRaw) ? referralRaw : null;

    const notes = body.notes ? String(body.notes).trim().slice(0, 1000) : null;

    // ─── Auto-slug del nombre ─────────────────────────────────
    const proposedSlug = autoSlug(companyName);

    // ─── Insert ──────────────────────────────────────────────
    const id = randomUUID();
    const token = randomBytes(24).toString("hex");

    await prisma.$executeRawUnsafe(
      `INSERT INTO "onboarding_requests" (
        "id", "status", "token",
        "companyName", "proposedSlug",
        "contactName", "contactEmail", "contactPhone",
        "referralSource", "notes",
        "progressStage", "createdAt", "updatedAt"
      ) VALUES (
        $1, 'PENDING', $2,
        $3, $4,
        $5, $6, $7,
        $8, $9,
        'received', NOW(), NOW()
      )`,
      id,
      token,
      companyName,
      proposedSlug,
      contactName,
      contactEmail,
      contactPhone,
      referralSource,
      notes
    );

    // ─── Email de confirmacion ───────────────────────────────
    const { subject, html } = await onboardingConfirmationEmailActive({
      contactName,
      companyName,
      statusToken: token,
    });
    // waitUntil: garantizar que Resend reciba el email antes de que Vercel mate el proceso
    waitUntil(
      sendEmail({ to: contactEmail, subject, html, context: "onboarding.confirmation" }).catch((err) => {
        console.error("[onboarding/start] email send failed:", err?.message);
      })
    );

    return NextResponse.json({
      ok: true,
      message: "Postulación recibida. Te contactamos pronto.",
      statusToken: token,
    });
  } catch (error: any) {
    console.error("[onboarding/start] error:", error);
    return NextResponse.json(
      { error: error.message || "Error" },
      { status: 500 }
    );
  }
}
