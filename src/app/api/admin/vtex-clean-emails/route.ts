// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// GET /api/admin/vtex-clean-emails?orgId=X&key=Y
// ══════════════════════════════════════════════════════════════
// One-shot reparativo: recorre customers existentes de una org y
// aplica extractRealEmail() a los que tienen email enmascarado /
// hash anonimo de VTEX.
//
// Casos:
//   "real@email.com-12345b.ct.vtex.com.br" → "real@email.com"
//   "abc123def456@ct.vtex.com.br" → null (era anonimo)
//   "user@gmail.com" → no toca (ya esta limpio)
//
// Idempotente: si el email ya esta limpio, NO hace UPDATE.
// Side effect util: despues de limpiar, linkVisitorToCustomer puede
// matchear visitors con customers que antes quedaban huerfanos por
// el email enmascarado.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import { extractRealEmail } from "@/lib/connectors/vtex-email";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const KEY = "nitrosales-secret-key-2024-production";

export async function GET(req: NextRequest) {
  const startTime = Date.now();
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    const orgId = url.searchParams.get("orgId");
    const dryRun = url.searchParams.get("dryRun") === "1";

    const allowed = key === KEY ? true : await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!orgId) return NextResponse.json({ error: "orgId requerido" }, { status: 400 });

    // Buscar customers con emails sospechosos (formato VTEX masked o anon).
    // El patron .ct.vtex.com.br aparece en ambos casos enmascarados.
    const candidates: Array<{ id: string; email: string }> = await prisma.$queryRawUnsafe(
      `SELECT "id", "email" FROM "customers"
       WHERE "organizationId" = $1
         AND "email" IS NOT NULL
         AND "email" LIKE '%.ct.vtex.com.br'`,
      orgId,
    );

    let cleaned = 0;       // emails que se limpiaron a un email real
    let nulled = 0;        // emails que eran anon hash (se setearon a null)
    let skipped = 0;       // ya estaban limpios o no cambiaron
    const sampleCleaned: any[] = [];
    const sampleNulled: any[] = [];

    for (const c of candidates) {
      const cleanEmail = extractRealEmail(c.email);

      if (!cleanEmail) {
        // Era hash anonimo → email a null
        if (!dryRun) {
          await prisma.customer.update({
            where: { id: c.id },
            data: { email: null },
          });
        }
        nulled++;
        if (sampleNulled.length < 3) sampleNulled.push({ id: c.id, was: c.email });
      } else if (cleanEmail !== c.email) {
        // Email enmascarado → email real recuperado
        if (!dryRun) {
          await prisma.customer.update({
            where: { id: c.id },
            data: { email: cleanEmail },
          });
        }
        cleaned++;
        if (sampleCleaned.length < 3) {
          sampleCleaned.push({ id: c.id, was: c.email, now: cleanEmail });
        }
      } else {
        skipped++;
      }
    }

    return NextResponse.json({
      ok: true,
      orgId,
      dryRun,
      candidatesFound: candidates.length,
      cleaned,
      nulled,
      skipped,
      sampleCleaned,
      sampleNulled,
      elapsedMs: Date.now() - startTime,
      note: dryRun
        ? "Modo dry-run: no se modifico nada. Repeti sin ?dryRun=1 para aplicar."
        : "Customers limpiados. Considerar correr linkVisitorToCustomer para re-atribuir pixel_visitors.",
    });
  } catch (err: any) {
    console.error("[vtex-clean-emails] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
