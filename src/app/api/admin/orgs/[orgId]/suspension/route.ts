// ══════════════════════════════════════════════════════════════════════════
// /api/admin/orgs/{orgId}/suspension — suspender y reactivar un cliente
// ══════════════════════════════════════════════════════════════════════════
// E-27. Hasta acá las únicas opciones eran dejarlo entrar o borrarle la cuenta.
// Entre esas dos hay un abismo, y un cliente que se atrasó un mes no merece
// ninguna de las dos.
//
// GET  → estado actual
// POST → suspender    { motivo, cortarIngesta? }
// DELETE → reactivar
//
// ── NO NECESITA MIGRACIÓN ────────────────────────────────────────────────
// El estado vive en `Organization.settings`, que ya es `Json` y ya se usa para
// esto mismo (roles custom, API keys, invitaciones). Ver el módulo para el
// costo de esa decisión.
//
// ── SUSPENDER NO CORTA LA INGESTA ────────────────────────────────────────
// Por defecto se sigue ingiriendo, porque los webhooks de VTEX y MELI **no
// reintentan**: un día sin ingerir es un agujero que no se rellena nunca, ni
// pagando después. Cortar la ingesta convierte una suspensión reversible en un
// daño permanente. `cortarIngesta: true` existe para el caso en que el costo de
// seguir ingiriendo pese más — es una decisión de negocio, y por eso es
// explícita.
//
// Auth: **sólo staff**. Suspender le corta el acceso a un cliente que paga: no
// puede quedar detrás de la clave que está en `vercel.json` versionado.
//
// ⚠️⚠️ ESTO TODAVÍA NO CORTA NADA ⚠️⚠️
// ══════════════════════════════════════════════════════════════════════════
// Suspender **deja anotado** el estado en `Organization.settings`, y nada
// más. Hoy no hay un solo lugar que lo lea: ni el middleware, ni el login, ni
// los endpoints de datos. Un cliente suspendido sigue entrando y usando el
// producto exactamente igual que antes.
//
// Se deja así y no a medias a propósito: el gate que falta va en el camino de
// auth de TODOS los requests, y eso se cambia solo, con su propia
// verificación, no colgado del final de una branch grande. Lo que no se puede
// dejar es que el endpoint conteste `ok: true` como si hubiera pasado algo
// — por eso la respuesta trae `seAplica: false` y lo dice en castellano.
//
// Un `ok: true` que no hace nada es peor que un endpoint que no existe: quien
// lo usa se queda tranquilo, y el cliente sigue adentro.
//
// Para que empiece a aplicar hacen falta dos cosas, y ninguna vive acá:
//   1. que `middleware.ts` lea el estado y devuelva 403 / redirija;
//   2. decidir qué pasa con las sesiones YA abiertas (el JWT no se entera).
// ══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isInternalUser } from "@/lib/feature-flags";
import { getSessionUserId } from "@/lib/alerts/get-user-id";
import {
  leerEstado,
  suspender,

  mensajeParaElCliente,
  EL_GATE_ESTA_CONECTADO,
} from "@/lib/organizacion/suspension";

export const dynamic = "force-dynamic";

async function traerOrg(orgId: string) {
  return prisma.organization
    .findUnique({ where: { id: orgId }, select: { id: true, name: true, settings: true } });
}

// `EL_GATE_ESTA_CONECTADO` vive en el módulo y no acá: Next.js sólo deja
// exportar los handlers y su config desde un `route.ts`, y cualquier otro
// export rompe el chequeo de tipos del build (no el de `tsc`, que no mira
// los tipos generados — otra vez la misma diferencia).
function respuesta(org: { name: string; settings: unknown }) {
  const estado = leerEstado(org.settings);
  return {
    organizacion: org.name,
    activa: estado.activa,
    suspension: estado.suspension,
    seSigueIngiriendo: true,
    corteDeIngestaSeAplica: false,
    corteDeIngestaSolicitado: !estado.activa && estado.suspension.cortarIngesta,
    // El texto que ve el cliente. Nunca incluye el motivo interno.
    mensajeQueVeElCliente: EL_GATE_ESTA_CONECTADO && !estado.activa ? mensajeParaElCliente() : null,

    // Lo que realmente pasa. Ver el encabezado.
    seAplica: EL_GATE_ESTA_CONECTADO,
    advertencia: EL_GATE_ESTA_CONECTADO
      ? null
      : "La suspensión queda ANOTADA pero todavía no se aplica: nadie lee este " +
        "estado, así que el cliente sigue entrando igual. Falta conectar el gate " +
        "en middleware.ts.",
  };
}

export async function GET(_req: NextRequest, { params }: { params: { orgId: string } }) {
  if (!(await isInternalUser())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const org = await traerOrg(params.orgId);
  if (!org) return NextResponse.json({ error: "Organización no encontrada" }, { status: 404 });
  return NextResponse.json(respuesta(org));
}

export async function POST(req: NextRequest, { params }: { params: { orgId: string } }) {
  if (!(await isInternalUser())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const org = await traerOrg(params.orgId);
  if (!org) return NextResponse.json({ error: "Organización no encontrada" }, { status: 404 });

  const parsed: unknown = await req.json().catch(() => null);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return NextResponse.json({ error: "Se requiere un objeto JSON." }, { status: 400 });
  }
  const body = parsed as Record<string, unknown>;
  if (body.cortarIngesta !== undefined && typeof body.cortarIngesta !== "boolean") {
    return NextResponse.json({ error: "cortarIngesta debe ser booleano." }, { status: 400 });
  }
  if (body.cortarIngesta === true) {
    return NextResponse.json({ error: "El corte de ingesta todavía no está implementado. No se guardó el cambio.", seAplica: false }, { status: 409 });
  }
  const motivo = typeof body.motivo === "string" ? body.motivo.trim() : "";

  // El motivo es obligatorio: una suspensión sin motivo no se puede revisar
  // después, y el que la levante no va a saber si ya se resolvió.
  if (motivo.length < 5 || motivo.length > 2000) {
    return NextResponse.json(
      { error: "Hace falta un motivo — quien la levante después tiene que poder entenderla." },
      { status: 400 },
    );
  }

  const quien = (await getSessionUserId().catch(() => null)) ?? "staff";

  const nuevos = suspender(org.settings, {
    motivo,
    porQuien: quien,
    cortarIngesta: false,
  });

  // Actualizar sólo esta clave sobre el valor actual, sin sobrescribir otras configuraciones.
  const rows = await prisma.$queryRawUnsafe<Array<{ name: string; settings: unknown }>>(
    `UPDATE organizations SET settings = jsonb_set(settings, '{suspension}', $2::jsonb, true), "updatedAt" = NOW()
     WHERE id = $1 AND jsonb_typeof(settings) = 'object' RETURNING name, settings`,
    org.id, JSON.stringify(nuevos.suspension));
  if (!rows[0]) return NextResponse.json({ error: "La organización cambió o su configuración no es un objeto válido." }, { status: 409 });

  return NextResponse.json({
    // `ok` describe que se GUARDÓ, no que se haya cortado el acceso. La
    // diferencia está en `seAplica`.
    ok: true,
    ...respuesta(rows[0]),
    // Que quede dicho en la respuesta, no sólo en la documentación.
    nota: "Se guardó el estado solicitado. La ingesta sigue habilitada; el bloqueo de acceso todavía no se aplica.",
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: { orgId: string } }) {
  if (!(await isInternalUser())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const org = await traerOrg(params.orgId);
  if (!org) return NextResponse.json({ error: "Organización no encontrada" }, { status: 404 });

  const rows = await prisma.$queryRawUnsafe<Array<{ name: string; settings: unknown }>>(
    `UPDATE organizations SET settings = settings - 'suspension', "updatedAt" = NOW()
     WHERE id = $1 AND jsonb_typeof(settings) = 'object' RETURNING name, settings`, org.id);
  if (!rows[0]) return NextResponse.json({ error: "La organización cambió o su configuración no es un objeto válido." }, { status: 409 });
  return NextResponse.json({ ok: true, ...respuesta(rows[0]) });
}
