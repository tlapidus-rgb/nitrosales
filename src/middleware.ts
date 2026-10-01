// ══════════════════════════════════════════════════════════════
// middleware.ts (Next.js root)
// ══════════════════════════════════════════════════════════════
// 1. NextAuth gate sobre /dashboard/*
// 2. S59: Read-only enforcement durante impersonate.
//    Si la sesión tiene `impersonatedBy` y la request es write
//    (POST/PUT/DELETE/PATCH), bloqueamos con 403. Excepciones:
//    /api/auth/* (para signOut), endpoints OAuth callbacks.
// 3. BP-ROLES-001: gating por sección (RBAC). Si el user logueado NO
//    es staff y NO tiene acceso read a la sección de la ruta, se bloquea:
//      - API (/api/*) → 403 JSON.
//      - Página       → redirect a /unauthorized.
//    El acceso se lee del snapshot `allowedSections` que auth.ts guarda
//    en el JWT al login (edge runtime no puede tocar la DB). Cambios de
//    rol requieren re-login para reflejarse. Bypass total para staff.
// 0. HOTFIX 2026-10-01: /api/admin/* exige sesión de staff. La `?key=`
//    sola ya NO alcanza, salvo en las rutas que llama la automatización
//    (allowlist documentada en src/lib/admin-gate.ts). Fail-closed: si la
//    lectura del token falla, /api/admin responde 401.
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { isPathAllowed } from "@/lib/section-access";
import { aceptaClavePorUrl, checkAdminApiAccess, isAdminApiPath } from "@/lib/admin-gate";

function adminDenied(status: 401 | 403): NextResponse {
  return new NextResponse(
    JSON.stringify({
      error: status === 401 ? "No autenticado" : "Sin permisos",
      message: "Este endpoint requiere una sesión de staff de NitroSales.",
    }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

const READ_ONLY_EXCEPTIONS = [
  "/api/auth/", // NextAuth internal (signOut, session, csrf)
];

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const method = req.method.toUpperCase();

  // NextAuth /api/auth/* nunca se toca (signOut, session, csrf).
  if (READ_ONLY_EXCEPTIONS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const isApi = pathname.startsWith("/api/");
  let token: any = null;
  try {
    token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  } catch {
    // /api/admin falla CERRADO: sin token legible no hay forma de saber si
    // es staff, y la key sola ya no alcanza.
    if (isAdminApiPath(pathname)) return adminDenied(401);
    // Resto: si falla la lectura del token, dejamos pasar (no bloquear por
    // bug del check; el endpoint/página valida su propia auth).
    return NextResponse.next();
  }

  // ── 0. /api/admin/*: sólo staff (salvo allowlist de automatización) ──
  const adminAccess = checkAdminApiAccess(pathname, token);
  if (adminAccess === "unauthenticated") return adminDenied(401);
  if (adminAccess === "forbidden") return adminDenied(403);
  // Fuera de la allowlist, un pedido con `?key=` se RECHAZA (ver
  // aceptaClavePorUrl). Una primera versión reescribía la URL sin la clave, pero
  // ~105 rutas leen `new URL(req.url)` y no está garantizado que un rewrite del
  // middleware cambie `req.url` en la ruta: la clave podía seguir llegando.
  // Rechazar no depende de eso. `searchParams.has` ya decodifica (`%6Bey`) y
  // cubre la clave repetida. Staff usa estas rutas con su sesión, sin clave.
  if (isAdminApiPath(pathname) && !aceptaClavePorUrl(pathname) && req.nextUrl.searchParams.has("key")) {
    return new NextResponse(
      JSON.stringify({
        error: "La clave por URL no se acepta en esta ruta",
        message: "Usá tu sesión de staff, sin ?key=.",
      }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }

  // ── 1. Read-only durante impersonate (writes de API) ──
  const isWrite =
    method === "POST" || method === "PUT" || method === "DELETE" || method === "PATCH";
  if (isApi && isWrite && token && token.impersonatedBy) {
    return new NextResponse(
      JSON.stringify({
        error: "Read-only durante impersonate",
        message:
          "Estás viendo esta cuenta como admin. No podés modificar datos del cliente.",
        impersonatedBy: token.impersonatedBy,
      }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }

  // ── 2. Gating por sección (RBAC) ──
  // Sólo aplica a users logueados (con token). Sin token, el endpoint/
  // página manejan su propia auth (data endpoints devuelven 401 por
  // getServerSession; las páginas redirigen a /login en el layout).
  if (token) {
    const allowed = isPathAllowed({
      pathname,
      method,
      isApi,
      isStaff: token.isStaff === true,
      allowedSections: token.allowedSections as string[] | undefined,
      writableSections: token.writableSections as string[] | undefined,
    });
    if (!allowed) {
      if (isApi) {
        return new NextResponse(
          JSON.stringify({
            error: "Sin permisos para acceder a este recurso",
            message: "Tu rol no tiene acceso a esta sección.",
          }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        );
      }
      const url = req.nextUrl.clone();
      url.pathname = "/unauthorized";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  // APIs + páginas de secciones restringibles. Las páginas permitidas
  // (dashboard, products, rentabilidad, pixel, nitropixel, settings) no
  // necesitan estar acá: el gating sólo bloquea lo restringido.
  matcher: [
    "/api/:path*",
    "/dashboard/:path*",
    "/bondly/:path*",
    "/aura/:path*",
    "/finanzas/:path*",
    "/mercadolibre/:path*",
    "/competitors/:path*",
    "/seo/:path*",
    "/campaigns/:path*",
    "/alertas/:path*",
    "/orders/:path*",
    "/chat/:path*",
    "/sinapsis/:path*",
    "/boveda/:path*",
    "/memory/:path*",
    "/settings/:path*",
  ],
};
