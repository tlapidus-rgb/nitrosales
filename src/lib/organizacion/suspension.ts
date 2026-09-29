// ══════════════════════════════════════════════════════════════════════════
// src/lib/organizacion/suspension.ts — cortarle el acceso a un cliente
// ══════════════════════════════════════════════════════════════════════════
// E-27. "Suspender un cliente que no paga: **no existe**." Hoy las únicas
// opciones son dejarlo entrar o borrarle la cuenta — y entre esas dos hay un
// abismo. Un cliente que se atrasó un mes no merece ninguna de las dos.
//
// ── NO HACE FALTA MIGRACIÓN, Y ES A PROPÓSITO ────────────────────────────
// El estado vive en `Organization.settings`, que ya es una columna `Json` y ya
// se usa para exactamente esto en este repo (roles custom por org, API keys,
// invitaciones pendientes). Agregar una columna `status` obligaría a correr SQL
// en Neon antes de poder usar nada — y por la regla de `CLAUDE.md`, a un deploy
// en dos etapas.
//
// El costo de la decisión, dicho: un campo dentro de un JSON no se puede
// indexar ni consultar con comodidad. Si algún día hay que listar "todas las
// suspendidas" sobre cientos de organizaciones, esto merece su columna. Con
// cuatro clientes, no.
//
// ── QUÉ CORTA Y QUÉ NO ───────────────────────────────────────────────────
// Suspender corta el **acceso del cliente a la aplicación**. NO corta la
// ingesta de datos, y eso es deliberado:
//
//   · Los webhooks de VTEX y MercadoLibre **no reintentan**. Un día sin ingerir
//     es un agujero que no se rellena nunca — ni pagando después.
//   · O sea que cortar la ingesta convierte una suspensión reversible (deja de
//     pagar, paga, vuelve) en un daño permanente a sus datos.
//
// La contracara es real y hay que decirla: **seguir ingiriendo a un cliente que
// no paga nos cuesta plata.** Es una decisión de negocio, no técnica, y por eso
// `cortarIngesta` existe como opción explícita en vez de estar decidida acá.
// ══════════════════════════════════════════════════════════════════════════

export type Suspension = {
  /** Cuándo se suspendió, ISO. */
  desde: string;
  /** Por qué. Obligatorio: una suspensión sin motivo no se puede revisar después. */
  motivo: string;
  /** Quién la aplicó, para poder preguntarle. */
  porQuien: string;
  /**
   * Si además se corta la ingesta de datos.
   *
   * Por defecto `false`. Ver el encabezado: cortar la ingesta transforma una
   * suspensión reversible en un agujero permanente, porque los webhooks no
   * reintentan.
   */
  cortarIngesta: boolean;
};

export type EstadoDeOrganizacion =
  | { activa: true; suspension: null }
  | { activa: false; suspension: Suspension };

/** Dónde vive el estado dentro de `Organization.settings`. */
export const CLAVE_EN_SETTINGS = "suspension";

/** Node session callback checks current state. Machine ingestion keeps its own authorization. */
export const EL_GATE_ESTA_CONECTADO = true;

/**
 * Lee el estado desde `settings`.
 *
 * Fail-open: cualquier cosa que no sea una suspensión bien formada se lee como
 * **activa**. Un JSON corrupto no puede dejar a un cliente afuera de su propia
 * aplicación — el modo de falla correcto acá es dejar entrar, no trabar.
 */
export function leerEstado(settings: unknown): EstadoDeOrganizacion {
  const s = (settings ?? {}) as Record<string, unknown>;
  const crudo = s[CLAVE_EN_SETTINGS];

  if (!crudo || typeof crudo !== "object" || Array.isArray(crudo)) {
    return { activa: true, suspension: null };
  }

  const v = crudo as Record<string, unknown>;
  const texto = (x: unknown) => (typeof x === "string" && x.trim() !== "" ? x : null);

  const desde = texto(v.desde);
  const motivo = texto(v.motivo);
  const porQuien = texto(v.porQuien);

  // Le falta algo esencial → no es una suspensión válida → sigue activa.
  if (!desde || !motivo || !porQuien) return { activa: true, suspension: null };

  return {
    activa: false,
    suspension: { desde, motivo, porQuien, cortarIngesta: v.cortarIngesta === true },
  };
}

/** Los `settings` con la suspensión aplicada. No muta el original. */
export function suspender(
  settings: unknown,
  datos: { motivo: string; porQuien: string; cortarIngesta?: boolean; ahora?: Date },
): Record<string, unknown> {
  const base = (settings ?? {}) as Record<string, unknown>;
  return {
    ...base,
    [CLAVE_EN_SETTINGS]: {
      desde: (datos.ahora ?? new Date()).toISOString(),
      motivo: datos.motivo,
      porQuien: datos.porQuien,
      cortarIngesta: datos.cortarIngesta === true,
    } satisfies Suspension,
  };
}

/**
 * Los `settings` sin la suspensión. No muta el original.
 *
 * Se BORRA la clave en vez de dejarla con un `activa: true`: un registro de
 * suspensiones viejas dentro de `settings` crece para siempre y nadie lo mira.
 * El historial, si hace falta, va en `email_log` o en un audit propio.
 */
export function reactivar(settings: unknown): Record<string, unknown> {
  const base = { ...((settings ?? {}) as Record<string, unknown>) };
  delete base[CLAVE_EN_SETTINGS];
  return base;
}

/**
 * Qué se le muestra al cliente suspendido.
 *
 * Se redacta acá y no en cada pantalla: un cliente que ve mensajes distintos
 * según dónde pegue no entiende si está suspendido o si el producto se rompió.
 * Y **no se le muestra el motivo interno** —puede decir "no pagó la factura de
 * agosto"— sino que hay que hablar con nosotros.
 */
export function mensajeParaElCliente(): string {
  return (
    "Tu cuenta está temporalmente suspendida. Tus datos están intactos y vuelven a estar " +
    "disponibles apenas se reactive. Escribinos para resolverlo."
  );
}

/**
 * `true` si hay que seguir ingiriendo datos de esta organización.
 *
 * Una organización activa, obviamente sí. Una suspendida, **también** — salvo
 * que alguien haya elegido explícitamente cortarla. Ver el encabezado.
 */
export function debeSeguirIngiriendo(estado: EstadoDeOrganizacion): boolean {
  return estado.activa || !estado.suspension.cortarIngesta;
}
