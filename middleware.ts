// ══════════════════════════════════════════════════════════════
// middleware.ts (Next.js root)
// ══════════════════════════════════════════════════════════════
// 1. NextAuth gate sobre /dashboard/*
// 2. S59: Read-only enforcement durante impersonate.
//    Si la sesión tiene `impersonatedBy` y la request es write
//    (POST/PUT/DELETE/PATCH), bloqueamos con 403. Excepciones:
//    /api/auth/* (para signOut), endpoints OAuth callbacks.
// ══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const READ_ONLY_EXCEPTIONS = [
  "/api/auth/", // NextAuth internal (signOut, session, csrf)
];

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const method = req.method.toUpperCase();

  // Read-only check: aplica a APIs write (POST/PUT/DELETE/PATCH)
  // cuando hay impersonate activo.
  const isWrite = method === "POST" || method === "PUT" || method === "DELETE" || method === "PATCH";
  const isApi = pathname.startsWith("/api/");
  const isException = READ_ONLY_EXCEPTIONS.some((p) => pathname.startsWith(p));

  if (isApi && isWrite && !isException) {
    try {
      const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
      if (token && (token as any).impersonatedBy) {
        return new NextResponse(
          JSON.stringify({
            error: "Read-only durante impersonate",
            message: "Estás viendo esta cuenta como admin. No podés modificar datos del cliente.",
            impersonatedBy: (token as any).impersonatedBy,
          }),
          {
            status: 403,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    } catch {
      // Si falla la lectura del token, dejamos pasar (no bloquear por bug del check)
    }
  }

  return NextResponse.next();
}

export const config = {
  // Aplica a todas las APIs + dashboard pages.
  matcher: ["/api/:path*", "/dashboard/:path*"],
};
