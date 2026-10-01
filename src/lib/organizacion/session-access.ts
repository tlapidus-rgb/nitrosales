// ══════════════════════════════════════════════════════════════════════════
// src/lib/organizacion/session-access.ts — el usuario del token, contra la base
// ══════════════════════════════════════════════════════════════════════════
// HOTFIX (2026-10-01). Corre en cada resolución de sesión (callback `session`
// de NextAuth), también para JWT ya emitidos.
//
// El token es un JWT firmado con NEXTAUTH_SECRET, y ese secreto no es secreto:
// `/api/me/vtex-affiliate-info` se lo muestra a cualquier usuario logueado para
// que arme la URL del webhook de VTEX. Con él se puede fabricar un token que
// diga cualquier cosa —`isStaff: true`, el email de alguien de staff, otra
// organización— y todo lo que decidía permisos mirando el token lo creía:
// `isInternalUser()` (los gates de staff de /api/admin), el "ver como" de
// cualquier organización, el rol.
//
// Ahora el usuario del token tiene que existir, y su email y su organización
// tienen que coincidir con los de la base; `isStaff` y el rol salen de la base,
// nunca del token. Fabricar una sesión pasa a requerir el id real de un usuario.
// No cierra la filtración del secreto (eso es una decisión: la clave del webhook
// de VTEX está en la configuración de cada cliente), pero le saca el alcance de
// staff y entre clientes por sesión.
//
// Si la consulta falla (un corte breve de la base), se usa lo último que se
// verificó para ese usuario en esta instancia, si tiene menos de 5 minutos. Sin
// verificación reciente, la sesión queda sin usuario: no saber no es poder entrar.
//
// Es la misma verificación que la branch del plan de expansión
// (claude/listo-para-merge), sin la parte de suspensión de organizaciones, que
// en main no existe. Al mergear esa branch, su versión reemplaza a ésta.
// ══════════════════════════════════════════════════════════════════════════

import type { Session } from "next-auth";
import { prisma } from "@/lib/db/client";
import { isStaffUser } from "@/lib/staff";

/** Cuánto sirve una verificación anterior cuando la base no responde. */
export const MEMORIA_ANTE_CORTE_MS = 5 * 60_000;
/** Tope de usuarios recordados por instancia, para que la memoria no crezca sin límite. */
const MAX_RECORDADOS = 5_000;

type Identidad = { email: string; organizationId: string; isStaff: boolean; role: string };
type Recordada = { identidad: Identidad | null; hasta: number };

const ultimaVerificada = new Map<string, Recordada>();

/** Sólo para tests: arranca cada caso sin memoria de otro. */
export function olvidarVerificaciones(): void {
  ultimaVerificada.clear();
}

function recordar(id: string, identidad: Identidad | null, ahora: number): void {
  ultimaVerificada.delete(id); // re-insertar la deja al final: el Map sirve de LRU
  ultimaVerificada.set(id, { identidad, hasta: ahora + MEMORIA_ANTE_CORTE_MS });
  if (ultimaVerificada.size > MAX_RECORDADOS) {
    const masVieja = ultimaVerificada.keys().next().value;
    if (masVieja !== undefined) ultimaVerificada.delete(masVieja);
  }
}

export type Verificacion =
  | { estado: "ok"; esStaff: boolean; role: string }
  | { estado: "invalida" }
  | { estado: "no-verificable" };

type DatosDelToken = { id?: unknown; email?: unknown; organizationId?: unknown };

/**
 * El usuario, en una ida a la base. Tabla y columnas son las reales del esquema
 * (`@@map("users")`; los campos camelCase no tienen `@map`, por eso van entre
 * comillas). `role` es el enum `UserRole`: se castea a texto en la base. El id
 * viaja como parámetro del tagged template, nunca interpolado en el texto.
 */
async function leerIdentidad(id: string): Promise<Identidad | null> {
  const filas = await prisma.$queryRaw<Array<{ email: string; isStaff: boolean; role: string; organizationId: string }>>`
    SELECT u."email", u."isStaff", u."role"::text AS "role", u."organizationId"
    FROM "users" u
    WHERE u."id" = ${id}
    LIMIT 1`;
  const u = filas[0];
  return u ? { email: u.email, organizationId: u.organizationId, isStaff: u.isStaff === true, role: String(u.role) } : null;
}

/** ¿El usuario del token existe y coincide con la base? */
export async function verificarIdentidad(token: DatosDelToken, ahora = Date.now()): Promise<Verificacion> {
  const { id, email, organizationId } = token;
  if (typeof id !== "string" || !id) return { estado: "invalida" };
  if (typeof organizationId !== "string" || !organizationId.trim()) return { estado: "invalida" };

  let identidad: Identidad | null;
  try {
    identidad = await leerIdentidad(id);
    recordar(id, identidad, ahora);
  } catch (err: any) {
    // Que quede rastro, sin datos del usuario: sólo qué tipo de error fue.
    console.error("[session-access] no se pudo verificar la sesión:", err?.code ?? err?.name ?? "error");
    const previa = ultimaVerificada.get(id);
    if (!previa || previa.hasta < ahora) return { estado: "no-verificable" };
    identidad = previa.identidad;
  }

  if (!identidad) return { estado: "invalida" };
  const delToken = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!delToken || identidad.email.trim().toLowerCase() !== delToken) return { estado: "invalida" };
  if (identidad.organizationId !== organizationId) return { estado: "invalida" };
  return {
    estado: "ok",
    esStaff: isStaffUser({ isStaff: identidad.isStaff, email: identidad.email }),
    role: identidad.role,
  };
}

/** Una sesión que no se pudo verificar: sin identidad. El layout manda al login. */
export function sesionSinUsuario(session: Session): Session {
  return { expires: session.expires } as Session;
}
