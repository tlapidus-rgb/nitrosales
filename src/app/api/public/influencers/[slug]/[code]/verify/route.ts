export const dynamic = "force-dynamic";

// ══════════════════════════════════════════════════════════════════════════
// POST /api/public/influencers/{slug}/{code}/verify — la clave del creador
// ══════════════════════════════════════════════════════════════════════════
// Verifica la contraseña del dashboard público de un creador. Devuelve
// `{ valid: true | false }`.
//
// ── ESTO ERA UN ORÁCULO DE FUERZA BRUTA (R-04, 2026-09-15) ───────────────
// Endpoint público, sin sesión, **sin ningún límite de intentos**, que contesta
// si una contraseña es correcta. El archivo de al lado (`[code]/route.ts`) sí
// tiene un limitador; éste no tenía nada.
//
// Y lo que protege no es poco: con esa clave se ve la facturación, las
// comisiones y las órdenes atribuidas a ese creador. El `slug` y el `code` son
// públicos —el link del dashboard es `/i/<orgSlug>/<code>`—, la clave la elige
// el creador, y el hash es SHA-256 **sin sal**, así que una clave recuperada
// sirve también para cualquier otro creador que use la misma.
//
// El límite cuenta por **(IP + código)**, no sólo por IP: rotar IPs es gratis, y
// sin el código en la identidad el límite no protege a nadie en particular. Ver
// `src/lib/rate-limit.ts` para el criterio y para lo que este límite NO es (es
// memoria por instancia de lambda, no un límite global).
//
// ── LO QUE SIGUE ABIERTO Y NO SE ARREGLA ACÁ ─────────────────────────────
// · El hash es SHA-256 sin sal. Migrarlo a bcrypt/argon2 obliga a revalidar
//   todas las claves existentes: es una decisión de producto, no un arreglo.
// · `dashboardPasswordPlain` guarda la contraseña **sin hashear** en la base.
// · La comparación es `===` y no de tiempo constante. Medir timing sobre un
//   hash a través de la red no es practicable, así que no se tocó — pero si
//   algún día se toca, `igualSeguro` de `comparacion-segura.ts` ya existe.
// ══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { createHash } from "crypto";
import { limiteDeClaveDeCreador } from "@/lib/rate-limit";

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string; code: string } }
) {
  try {
    const { slug, code } = params;

    // La identidad lleva el código del creador, no sólo la IP. Ver el header.
    const ip =
      req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "desconocida";
    const identidad = `${ip}|${slug}|${code}`;

    if (limiteDeClaveDeCreador.superado(identidad)) {
      // 429 y no 401: el que tipeó mal su clave tiene que poder distinguir
      // "te equivocaste" de "esperá un minuto".
      return NextResponse.json(
        {
          valid: false,
          error: "Demasiados intentos. Esperá un minuto y probá de nuevo.",
        },
        { status: 429 },
      );
    }

    const body = await req.json();
    const { password } = body;

    if (!password) {
      return NextResponse.json({ valid: false }, { status: 400 });
    }

    const org = await prisma.organization.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!org) {
      return NextResponse.json({ valid: false }, { status: 404 });
    }

    const influencer = await prisma.influencer.findUnique({
      where: { organizationId_code: { organizationId: org.id, code } },
      select: { dashboardPassword: true },
    });
    if (!influencer || !influencer.dashboardPassword) {
      return NextResponse.json({ valid: false }, { status: 404 });
    }

    const valid = influencer.dashboardPassword === hashPassword(password);

    // Acertar limpia el presupuesto: tipear mal tres veces y acertar a la cuarta
    // no tiene por qué dejar al creador a un intento del bloqueo.
    if (valid) limiteDeClaveDeCreador.olvidar(identidad);

    return NextResponse.json({ valid });
  } catch (error: any) {
    console.error("[Verify Password]", error);
    return NextResponse.json({ valid: false }, { status: 500 });
  }
}
