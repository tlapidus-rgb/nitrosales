// ══════════════════════════════════════════════════════════════
// src/lib/influencer-secretos.ts — sacar las credenciales de creador
// de todo lo que sale por la API (R-C06, auditoría 2026-09)
// ══════════════════════════════════════════════════════════════
// La tabla `influencers` guarda dos columnas de credencial:
//
//   · `dashboardPassword`      → hash SHA-256 SIN salt de la contraseña del
//     dashboard público del creador. Se rompe con una rainbow table.
//   · `dashboardPasswordPlain` → la MISMA contraseña, en texto plano.
//
// Los cuatro handlers de `/api/influencers` devolvían la fila entera
// (`...influencer`, o `findMany` sin `select`), así que **la contraseña en claro
// de todos los creadores viajaba al navegador** en cada listado. No la lee
// ninguna pantalla: era pura fuga.
//
// Los creadores son personas que reusan contraseñas. Esa fuga no es sólo de este
// dashboard.
//
// ⚠️ ESTO NO ARREGLA EL ALMACENAMIENTO. Los valores en claro que ya están
// guardados siguen en la base hasta que se corra el borrado de la columna
// (R-C06 pasos 4-5, que necesitan el orden de migraciones de CLAUDE.md), y el
// hash sigue siendo SHA-256 sin salt hasta el paso 3 (migrar a bcrypt, que
// invalida las contraseñas existentes y hay que coordinar con Tomy).
// Esto cierra el camino de salida, que es lo que se puede hacer sin romperle
// el acceso a nadie.

/** Columnas que NUNCA pueden salir en una respuesta de la API. */
const CAMPOS_SECRETOS = ["dashboardPassword", "dashboardPasswordPlain"] as const;

/**
 * Devuelve una copia de `row` sin las credenciales. No muta el original.
 *
 * Se agrega un booleano `tieneDashboardPassword` porque la UI necesita saber si
 * hay contraseña puesta (para mostrar "configurada" vs "sin configurar") — que
 * es lo único que necesitaba de esos campos.
 */
export function sinSecretosDeCreador<T extends Record<string, unknown>>(
  row: T,
): Omit<T, (typeof CAMPOS_SECRETOS)[number]> & { tieneDashboardPassword: boolean } {
  const limpio = { ...row } as Record<string, unknown>;
  const tenia = Boolean(row.dashboardPassword);
  for (const campo of CAMPOS_SECRETOS) delete limpio[campo];
  limpio.tieneDashboardPassword = tenia;
  return limpio as Omit<T, (typeof CAMPOS_SECRETOS)[number]> & {
    tieneDashboardPassword: boolean;
  };
}

/** `sinSecretosDeCreador` sobre una lista. */
export function sinSecretosDeCreadores<T extends Record<string, unknown>>(rows: T[]) {
  return rows.map(sinSecretosDeCreador);
}
