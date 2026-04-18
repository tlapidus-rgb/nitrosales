// ═══════════════════════════════════════════════════════════════════
// /api/finanzas/cash-balance/override
// ═══════════════════════════════════════════════════════════════════
// CRUD del override manual del cash balance usado por el Cash Runway
// hero del Pulso. Permite a Tomy corregir el cálculo automático con
// su saldo real de banco.
//
// GET    → override vigente del mes actual (o ?month=YYYY-MM específico)
// POST   → upsert override (body: { amount, month?, note?, currency? })
// DELETE → borra override del mes (?month=YYYY-MM; default = mes actual)
//
// NO usamos modelos de Prisma — la tabla `cash_balance_overrides` se
// creó vía endpoint admin (`/api/admin/migrate-cash-balance-override`)
// y no está declarada en schema.prisma todavía. Usamos $queryRaw /
// $executeRaw contra la tabla directamente (permitido por CLAUDE.md
// §REGLA de migraciones: tabla en DB antes que schema).
//
// Ver plan linear-pondering-lemur.md § Sub-fase 1e.
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/client";
import { getOrganizationId } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

export interface CashBalanceOverrideRow {
  id: string;
  organizationId: string;
  month: string; // "YYYY-MM"
  amount: number;
  currency: string;
  note: string | null;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function currentMonthIso(): string {
  const now = new Date();
  // Buenos Aires no cambia el mes antes que UTC para la mayoría del día,
  // pero para evitar edge cases en la última hora usamos BA directamente.
  const ba = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return ba.toISOString().substring(0, 7);
}

function isValidMonth(s: string | null | undefined): s is string {
  return !!s && /^\d{4}-\d{2}$/.test(s);
}

function serialize(row: Record<string, unknown>): CashBalanceOverrideRow {
  return {
    id: String(row.id),
    organizationId: String(row.organizationId),
    month: String(row.month),
    amount: Number(row.amount),
    currency: String(row.currency ?? "ARS"),
    note: row.note == null ? null : String(row.note),
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt ?? new Date().toISOString()),
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : String(row.updatedAt ?? new Date().toISOString()),
  };
}

// ─────────────────────────────────────────────────────────────
// GET: override vigente
// ─────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  try {
    const orgId = await getOrganizationId();
    const url = new URL(req.url);
    const monthParam = url.searchParams.get("month");
    const month = isValidMonth(monthParam) ? monthParam : currentMonthIso();

    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT "id", "organizationId", "month", "amount", "currency",
             "note", "createdAt", "updatedAt"
      FROM "cash_balance_overrides"
      WHERE "organizationId" = ${orgId}
        AND "month" = ${month}
      LIMIT 1
    `;

    const override = rows.length > 0 ? serialize(rows[0]) : null;

    return NextResponse.json({
      month,
      override,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: msg, message: "Error cargando override" },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────
// POST: upsert del override del mes
// ─────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const orgId = await getOrganizationId();

    const body = (await req.json().catch(() => null)) as {
      amount?: unknown;
      month?: unknown;
      note?: unknown;
      currency?: unknown;
    } | null;

    if (!body) {
      return NextResponse.json(
        { error: "INVALID_BODY", message: "Body JSON requerido" },
        { status: 400 }
      );
    }

    const amountNum = Number(body.amount);
    if (!Number.isFinite(amountNum)) {
      return NextResponse.json(
        {
          error: "INVALID_AMOUNT",
          message: "`amount` debe ser un número finito",
        },
        { status: 400 }
      );
    }

    const month =
      typeof body.month === "string" && isValidMonth(body.month)
        ? body.month
        : currentMonthIso();

    const currency =
      typeof body.currency === "string" && body.currency.trim()
        ? body.currency.trim().toUpperCase()
        : "ARS";

    const note =
      typeof body.note === "string" && body.note.trim()
        ? body.note.trim().slice(0, 500)
        : null;

    // Upsert manual vía ON CONFLICT (unique compuesto org + month)
    // Generamos id determinístico al insertar pero el unique hace de guardia
    // para que un segundo POST del mismo mes actualice en vez de duplicar.
    const id = randomUUID();

    await prisma.$executeRaw`
      INSERT INTO "cash_balance_overrides"
        ("id", "organizationId", "month", "amount", "currency", "note",
         "createdAt", "updatedAt")
      VALUES
        (${id}, ${orgId}, ${month}, ${amountNum}::decimal, ${currency},
         ${note}, NOW(), NOW())
      ON CONFLICT ("organizationId", "month") DO UPDATE SET
        "amount" = EXCLUDED."amount",
        "currency" = EXCLUDED."currency",
        "note" = EXCLUDED."note",
        "updatedAt" = NOW()
    `;

    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT "id", "organizationId", "month", "amount", "currency",
             "note", "createdAt", "updatedAt"
      FROM "cash_balance_overrides"
      WHERE "organizationId" = ${orgId}
        AND "month" = ${month}
      LIMIT 1
    `;

    const override = rows.length > 0 ? serialize(rows[0]) : null;

    return NextResponse.json({
      ok: true,
      month,
      override,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: msg, message: "Error guardando override" },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────
// DELETE: borra el override del mes (vuelve a cálculo automático)
// ─────────────────────────────────────────────────────────────
export async function DELETE(req: Request) {
  try {
    const orgId = await getOrganizationId();
    const url = new URL(req.url);
    const monthParam = url.searchParams.get("month");
    const month = isValidMonth(monthParam) ? monthParam : currentMonthIso();

    await prisma.$executeRaw`
      DELETE FROM "cash_balance_overrides"
      WHERE "organizationId" = ${orgId}
        AND "month" = ${month}
    `;

    return NextResponse.json({
      ok: true,
      month,
      override: null,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: msg, message: "Error borrando override" },
      { status: 500 }
    );
  }
}
