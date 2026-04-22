// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// POST /api/admin/leads — crear lead manual
// GET  /api/admin/leads — listar
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const companyName = (body?.companyName || "").trim();
    if (!companyName) {
      return NextResponse.json({ error: "companyName requerido" }, { status: 400 });
    }

    const id = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO "leads"
       ("id", "companyName", "contactName", "contactEmail", "contactPhone",
        "industry", "estimatedMonthlyOrders", "source", "notes", "status", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'LEAD', NOW(), NOW())`,
      id,
      companyName,
      (body?.contactName || "").trim() || null,
      (body?.contactEmail || "").trim().toLowerCase() || null,
      (body?.contactPhone || "").trim() || null,
      (body?.industry || "").trim() || null,
      body?.estimatedMonthlyOrders ? Number(body.estimatedMonthlyOrders) : null,
      (body?.source || "").trim() || null,
      (body?.notes || "").trim() || null
    );

    return NextResponse.json({ ok: true, id });
  } catch (error: any) {
    console.error("[admin/leads POST] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const allowed = await isInternalUser();
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const rows = await prisma.$queryRawUnsafe<Array<any>>(
      `SELECT * FROM "leads" ORDER BY "createdAt" DESC`
    );
    return NextResponse.json({ ok: true, leads: rows });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
