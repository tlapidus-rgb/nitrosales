// ══════════════════════════════════════════════════════════════════════════
// src/lib/organizacion/session-access.ts — quién es, y si puede entrar
// ══════════════════════════════════════════════════════════════════════════
// Corre en cada resolución de sesión (callback `session` de NextAuth), también
// para JWT ya emitidos. Hace tres cosas con una sola búsqueda por clave primaria
// (Prisma la resuelve en dos idas a la base: usuario y organización):
//
// 1. **Ata la identidad del token a la base.** El token es un JWT firmado con
//    NEXTAUTH_SECRET, y ese secreto no es secreto: `/api/me/vtex-affiliate-info`
//    se lo entrega a cualquier usuario logueado para que arme la URL del
//    webhook. Con él se puede fabricar un token que diga cualquier cosa —
//    `isStaff: true`, el email de alguien de staff, otra organización — y todo
//    lo que decide permisos mirando el token (el "ver como", los gates de staff,
//    la suspensión) lo creía. Ahora el usuario del token tiene que existir, y su
//    email y su organización tienen que coincidir con los de la base; `isStaff`
//    y el rol salen de la base, nunca del token (si no, un usuario podría
//    fabricarse su propio token con rol OWNER).
//
//    Lo que esto NO cierra, para que nadie lo lea de más: fabricar una sesión
//    pasa a requerir el id, el email y la organización reales de un usuario —
//    dentro de la propia organización eso se consigue (el equipo se lista), así
//    que un usuario puede hacerse pasar por un compañero. Y el secreto sigue
//    abriendo, sin sesión, las rutas que aceptan `?key=<secreto>`, varias con
//    cualquier `org` (a 2026-09-30, 63 archivos route.ts bajo src/app/api lo
//    referencian; ver también webhook-key.ts). Cerrar eso requiere dejar de entregar el secreto,
//    que es una decisión: la clave del webhook de VTEX está en la configuración
//    de cada cliente.
//
// 2. **Aplica la suspensión de la organización** (E-27), con los mismos
//    criterios que antes: el soporte de NitroSales mantiene el acceso en "ver
//    como"; la impersonación vive el bloqueo del cliente.
//
// 3. **Tolera un corte breve de la base.** Antes, cualquier error de la consulta
//    dejaba a TODOS los clientes afuera ("No pudimos verificar el acceso"), y
//    NextAuth repite esta consulta cada vez que el usuario vuelve a la pestaña.
//    Ahora, si la consulta falla, se usa lo último que se verificó para ese
//    usuario en esta instancia, si tiene menos de 5 minutos. Sin verificación
//    reciente, se bloquea igual que antes: no saber no es poder entrar.
//
//    El precio: durante un corte de la base, una suspensión aplicada en esos
//    5 minutos puede tardar ese tiempo en hacerse efectiva en una instancia que
//    ya tenía al usuario verificado. Con la base respondiendo, la consulta se
//    hace siempre y la memoria no se usa.
// ══════════════════════════════════════════════════════════════════════════

import type { Session } from "next-auth";
import { prisma } from "@/lib/db/client";
import { isStaffUser } from "@/lib/staff";
import { leerEstado } from "./suspension";

/** Cuánto sirve una verificación anterior cuando la base no responde. */
export const MEMORIA_ANTE_CORTE_MS = 5 * 60_000;
/** Tope de usuarios recordados por instancia, para que la memoria no crezca sin límite. */
const MAX_RECORDADOS = 5_000;

type Identidad = { email: string; organizationId: string; isStaff: boolean; role: string; settings: unknown };
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
  | { estado: "ok"; esStaff: boolean; role: string; settings: unknown }
  | { estado: "invalida" }
  | { estado: "no-verificable" };

type DatosDelToken = { id?: unknown; email?: unknown; organizationId?: unknown };

/** ¿El usuario del token existe y coincide con la base? */
export async function verificarIdentidad(token: DatosDelToken, ahora = Date.now()): Promise<Verificacion> {
  const { id, email, organizationId } = token;
  if (typeof id !== "string" || !id) return { estado: "invalida" };
  if (typeof organizationId !== "string" || !organizationId.trim()) return { estado: "invalida" };

  let identidad: Identidad | null;
  try {
    const u = await prisma.user.findUnique({
      where: { id },
      select: {
        email: true,
        isStaff: true,
        role: true,
        organizationId: true,
        organization: { select: { settings: true } },
      },
    });
    identidad = u
      ? { email: u.email, organizationId: u.organizationId, isStaff: u.isStaff === true, role: String(u.role), settings: u.organization?.settings }
      : null;
    recordar(id, identidad, ahora);
  } catch (err: any) {
    // Que quede rastro: un error que no se resuelve solo (esquema, permisos)
    // se ve igual que un corte breve, y la memoria atrasa el síntoma 5 minutos.
    // Sin datos del usuario: sólo qué tipo de error fue.
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
    settings: identidad.settings,
  };
}

/** ¿La organización está habilitada? `undefined` = sí. */
export function accesoDeLaOrganizacion(settings: unknown): "suspended" | "unavailable" | undefined {
  if (!leerEstado(settings).activa) return "suspended";
  if (!settings || typeof settings !== "object" || Array.isArray(settings)
    || ("suspension" in settings && (settings as { suspension?: unknown }).suspension != null)) return "unavailable";
  return undefined;
}

/** Una sesión bloqueada no lleva identidad ni motivo interno. */
export function sesionBloqueada(session: Session, motivo: "suspended" | "unavailable"): Session {
  return { expires: session.expires, organizationAccess: motivo } as Session;
}
