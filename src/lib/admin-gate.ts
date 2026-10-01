// ══════════════════════════════════════════════════════════════
// src/lib/admin-gate.ts — /api/admin/* exige sesión de staff (edge-safe)
// ══════════════════════════════════════════════════════════════
// HOTFIX (2026-10-01). La key de bypass admin (`?key=`) se filtraba: el
// endpoint /api/me/vtex-affiliate-info le arma a CUALQUIER usuario logueado
// una URL con `?key=<NEXTAUTH_SECRET>`, y en producción ese valor es igual a
// ADMIN_API_KEY. Con esa key, ~100 rutas de /api/admin/** se abrían por URL
// sin sesión (algunas listan todas las orgs, otras devuelven datos de
// compradores de la org que se pida).
//
// Regla: una request a /api/admin/* pasa el middleware SÓLO si
//   (a) la sesión (JWT de NextAuth) es de staff — misma regla que
//       isInternalUser(): isStaffUser({ isStaff, email }), o
//   (b) la ruta está en ADMIN_KEY_ALLOWLIST (la llama la automatización
//       server-to-server con `?key=`, sin cookie). La ruta sigue validando
//       la key ella misma, como hoy — el middleware NO valida la key, o
//   (c) la ruta está en ADMIN_SELF_GATED_ROUTES (rutas de producto que usa
//       el CLIENTE desde la UI, no aceptan key y hacen su propio gate por
//       sesión/permiso de sección).
// Todo lo demás: 401 sin sesión, 403 con sesión que no es de staff.
//
// Lógica pura (sin DB, sin `crypto`) → corre en el edge runtime del
// middleware y se testea directo. Ver src/__tests__/admin-api-gate.test.ts.
// ══════════════════════════════════════════════════════════════

import { isStaffUser } from "@/lib/staff";

const ADMIN_PREFIX = "/api/admin";
const MAX_DECODE_PASSES = 3;

/**
 * Rutas de /api/admin que la AUTOMATIZACIÓN llama con `?key=` y sin sesión.
 * Única excepción al requisito de staff. Agregar una ruta acá = volver a
 * exponerla a quien tenga la key: sólo si hay un llamador automático real,
 * y documentarlo. Inventario hecho sobre main 39d93a20 (src/, vercel.json,
 * .github/workflows/**). vercel.json y el workflow de GitHub NO llaman a
 * /api/admin directo: llaman crons que hacen self-fetch.
 */
export const ADMIN_KEY_ALLOWLIST: ReadonlyArray<{ path: string; caller: string }> = [
  {
    path: "/api/admin/trigger-vtex-sync",
    caller:
      "src/app/api/cron/vtex-sync-recent/route.ts (cron de vercel.json */30): " +
      "fetch por org a /api/admin/trigger-vtex-sync?...&key=",
  },
  {
    path: "/api/admin/setup-pixel-rollups",
    caller:
      "src/app/api/cron/refresh-pixel-first-source/route.ts (cron de vercel.json 7,37 * * * *): " +
      "fetch a /api/admin/setup-pixel-rollups?phase=first-source&key=",
  },
  {
    path: "/api/admin/recompute-customer-aggregates",
    caller:
      "src/app/api/cron/post-backfill-finalize/route.ts (lo dispara el cron backfill-runner " +
      "y admin/onboardings/[id]/force-complete-job): callInternal(...&key=)",
  },
  {
    path: "/api/admin/backfill-orderitem-costs",
    caller:
      "src/app/api/cron/post-backfill-finalize/route.ts (idem anterior): callInternal(...&key=)",
  },
];

/**
 * Rutas bajo /api/admin que son de PRODUCTO (las usa el cliente, no el staff),
 * NO aceptan key y hacen su propio gate por sesión. Se dejan pasar para no
 * romperle la UI a los clientes; la ruta decide.
 */
export const ADMIN_SELF_GATED_ROUTES: ReadonlyArray<{ path: string; reason: string }> = [
  {
    path: "/api/admin/channel-rules",
    reason: "UI cliente /pixel/canales — requirePermission('pixel') + org de la sesión",
  },
  {
    path: "/api/admin/channels-breakdown",
    reason: "UI cliente /pixel/canales — requirePermission('pixel') + org de la sesión",
  },
];
// NOTA: /api/admin/aura-resend-onboarding NO va acá a propósito: sólo mira la
// org de la sesión (sin rol ni permiso de sección) y ninguna UI la llama, así
// que queda detrás del gate de staff como el resto.

const KEY_ALLOWED = new Set(ADMIN_KEY_ALLOWLIST.map((r) => r.path));
const SELF_GATED = new Set(ADMIN_SELF_GATED_ROUTES.map((r) => r.path));

/**
 * Normaliza el pathname para decidir: decodifica %XX (varias pasadas, por si
 * viene doble-encodeado), colapsa `//` y saca la `/` final. Cualquier forma
 * rara que NO coincida exacto con la allowlist cae del lado de "exigir staff".
 */
export function normalizeApiPath(pathname: string): string {
  let p = pathname;
  for (let i = 0; i < MAX_DECODE_PASSES; i++) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(p);
    } catch {
      break;
    }
    if (decoded === p) break;
    p = decoded;
  }
  p = p.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  if (p.length > 1) p = p.replace(/\/+$/, "");
  return p;
}

/** True si el path (cualquier variante de mayúsculas/encoding) es /api/admin o debajo. */
export function isAdminApiPath(pathname: string): boolean {
  const p = normalizeApiPath(pathname).toLowerCase();
  return p === ADMIN_PREFIX || p.startsWith(`${ADMIN_PREFIX}/`);
}

export type AdminGateDecision = "not-admin" | "allow" | "unauthenticated" | "forbidden";

export interface AdminGateToken {
  isStaff?: unknown;
  email?: unknown;
}

/**
 * ¿Esta ruta de /api/admin puede recibir `?key=`? Sólo las de la allowlist (las
 * llama la automatización). En las demás, el middleware rechaza (403) cualquier
 * pedido que traiga `?key=`: el middleware no puede consultar la base y
 * confía en el `isStaff` del JWT, que con NEXTAUTH_SECRET filtrado se puede
 * fabricar. Si la ruta además viera la clave (que el atacante también tiene),
 * aceptaría `key === ADMIN_API_KEY` sin mirar la sesión. Sin clave en la URL,
 * la ruta cae a `isInternalUser()`, que consulta la base.
 */
export function aceptaClavePorUrl(pathname: string): boolean {
  return isAdminApiPath(pathname) && KEY_ALLOWED.has(normalizeApiPath(pathname));
}

/**
 * Decide el acceso a /api/admin/*. `token` es el JWT de NextAuth (o null si
 * no hay sesión). No mira `?key=`: la key sola NUNCA alcanza fuera de la
 * allowlist.
 */
export function checkAdminApiAccess(
  pathname: string,
  token: AdminGateToken | null | undefined,
): AdminGateDecision {
  if (!isAdminApiPath(pathname)) return "not-admin";

  const p = normalizeApiPath(pathname);
  if (KEY_ALLOWED.has(p) || SELF_GATED.has(p)) return "allow";

  if (!token) return "unauthenticated";
  const isStaff = isStaffUser({
    isStaff: token.isStaff === true,
    email: typeof token.email === "string" ? token.email : null,
  });
  return isStaff ? "allow" : "forbidden";
}
