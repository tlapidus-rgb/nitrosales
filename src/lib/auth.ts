import { verificarIdentidad, accesoDeLaOrganizacion, sesionBloqueada } from "@/lib/organizacion/session-access";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { createHmac } from "crypto";
import { igualSeguro } from "@/lib/comparacion-segura";
import { isStaffUser } from "@/lib/staff";
import { prisma } from "@/lib/db/client";
import { cookies } from "next/headers";
import {
  resolveEffectivePermissionsByEmail,
  allowedSectionsFrom,
  writableSectionsFrom,
} from "@/lib/permissions-resolve";

// El poder de "View as Org" (override de session.organizationId via
// cookie) lo tiene SOLO el staff interno de NitroSales. La fuente de
// verdad de "quién es staff" vive en src/lib/staff.ts (flag users.isStaff
// + allowlist de transición). Ver feat/role-based-access.
const VIEW_AS_COOKIE = "nitro-view-org";

// ─────────────────────────────────────────────────────────────
// S59: Impersonate token verification (sync con /api/admin/impersonate)
// ─────────────────────────────────────────────────────────────
function verifyImpersonateToken(token: string): { targetUserId: string; impersonatorUserId: string; impersonatorEmail: string; exp: number } | null {
  try {
    const [data, sig] = token.split(".");
    if (!data || !sig) return null;
    // Sin secreto no hay impersonación. Antes caía a "fallback-secret", un
    // literal que está en el código: cualquiera podía firmar un token válido.
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) return null;
    const hmac = createHmac("sha256", secret);
    hmac.update(data);
    const expectedSig = hmac.digest("base64url").slice(0, 32);
    if (!igualSeguro(expectedSig, sig)) return null;
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf-8"));
    if (!payload.targetUserId || !payload.impersonatorUserId || !payload.exp) return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Helper: registrar LoginEvent (best effort — nunca bloquea login)
// ─────────────────────────────────────────────────────────────
async function logLoginEvent(params: {
  userId?: string | null;
  email?: string | null;
  success: boolean;
  failureReason?: string | null;
  req?: any;
}): Promise<void> {
  try {
    // Extract IP + User-Agent del request si esta disponible.
    // En CredentialsProvider.authorize el segundo param es un Request
    // raw (no NextRequest), con .headers como plain object.
    const rawHeaders = (params.req?.headers as Record<string, any>) || {};
    const getHeader = (k: string): string | null => {
      const v = rawHeaders[k] ?? rawHeaders[k.toLowerCase()];
      if (Array.isArray(v)) return v[0] ?? null;
      return typeof v === "string" ? v : null;
    };
    const ip =
      getHeader("x-forwarded-for")?.split(",")[0]?.trim() ||
      getHeader("x-real-ip") ||
      null;
    const userAgent = getHeader("user-agent");

    await prisma.loginEvent.create({
      data: {
        userId: params.userId ?? null,
        email: params.email ?? null,
        success: params.success,
        failureReason: params.failureReason ?? null,
        ip,
        userAgent,
      },
    });
  } catch (err) {
    // Silent fail — no bloquear login si el log falla
    console.error("[logLoginEvent] error:", err);
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email y contraseña son requeridos");
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: { organization: true },
        });

        if (!user) {
          await logLoginEvent({
            email: credentials.email,
            success: false,
            failureReason: "Email no registrado",
            req,
          });
          throw new Error("No existe una cuenta con ese email");
        }

        const isValid = await compare(credentials.password, user.hashedPassword);
        if (!isValid) {
          await logLoginEvent({
            userId: user.id,
            email: user.email,
            success: false,
            failureReason: "Password incorrecto",
            req,
          });
          throw new Error("Contraseña incorrecta");
        }

        // Login exitoso
        await logLoginEvent({
          userId: user.id,
          email: user.email,
          success: true,
          req,
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          isStaff: user.isStaff,
          organizationId: user.organizationId,
          organizationName: user.organization.name,
        };
      },
    }),
    // S59: Impersonate provider — magic link de 60s firmado con HMAC.
    // Solo se usa internamente (admin → /api/admin/impersonate genera el token).
    CredentialsProvider({
      id: "impersonate",
      name: "impersonate",
      credentials: {
        token: { label: "Token", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.token) return null;
        const payload = verifyImpersonateToken(credentials.token);
        if (!payload) return null;

        const user = await prisma.user.findUnique({
          where: { id: payload.targetUserId },
          include: { organization: true },
        });
        if (!user) return null;

        // El token de impersonación se firma con NEXTAUTH_SECRET, que hoy le
        // llega a cualquier usuario logueado. Así que el token solo no prueba
        // nada: quien la inicia tiene que ser staff EN LA BASE, y el destino no
        // puede ser staff. Sin esto, con el id de alguien de staff (se veía en
        // `createdBy` de roles y API keys) un cliente abría una sesión de staff.
        const impersonador = await prisma.user.findUnique({
          where: { id: String(payload.impersonatorUserId) },
          select: { email: true, isStaff: true },
        });
        if (!impersonador || !isStaffUser({ isStaff: impersonador.isStaff, email: impersonador.email })) return null;
        if (isStaffUser({ isStaff: user.isStaff, email: user.email })) return null;
        payload.impersonatorEmail = impersonador.email; // el de la base, no el del token

        // Audit log: registramos el impersonate exitoso.
        try {
          await prisma.loginEvent.create({
            data: {
              userId: user.id,
              email: user.email,
              success: true,
              failureReason: `Impersonate session started by ${payload.impersonatorEmail}`,
            },
          });
        } catch {}

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          isStaff: user.isStaff,
          organizationId: user.organizationId,
          organizationName: user.organization.name,
          // Flags impersonate (van al JWT y de ahí a session)
          impersonatedBy: payload.impersonatorUserId,
          impersonatorEmail: payload.impersonatorEmail,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 horas
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.isStaff = (user as any).isStaff === true;
        token.organizationId = (user as any).organizationId;
        token.organizationName = (user as any).organizationName;
        // Snapshot de secciones accesibles (read+) para que el middleware
        // (edge runtime, sin acceso a DB) decida acceso por ruta. Se calcula
        // 1× al login. Cambios de rol requieren re-login para reflejarse.
        // Si falla, dejamos undefined → middleware fail-open (no bloquea;
        // no queremos lockear a un user existente por un error transitorio).
        try {
          const eff = await resolveEffectivePermissionsByEmail(
            (user as any).email
          );
          token.allowedSections = eff
            ? allowedSectionsFrom(eff.permissions)
            : undefined;
          // Complemento write+: el middleware distingue leer de escribir.
          token.writableSections = eff
            ? writableSectionsFrom(eff.permissions)
            : undefined;
        } catch {
          token.allowedSections = undefined;
          token.writableSections = undefined;
        }
        // S59: propagar flags de impersonate
        if ((user as any).impersonatedBy) {
          token.impersonatedBy = (user as any).impersonatedBy;
          token.impersonatorEmail = (user as any).impersonatorEmail;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (!session.user) return session;

      // Antes de copiar nada del token: ¿ese usuario existe y coincide con la
      // base? El token se puede fabricar con NEXTAUTH_SECRET, que hoy le llega
      // a cualquier usuario logueado (ver session-access.ts). `isStaff` sale
      // de acá, de la base — nunca del token.
      const identidad = await verificarIdentidad({
        id: token.id,
        email: token.email,
        organizationId: token.organizationId,
      });
      if (identidad.estado !== "ok") return sesionBloqueada(session, "unavailable");
      const esSoporte = identidad.esStaff && !token.impersonatedBy;

      (session.user as any).id = token.id;
      (session.user as any).role = identidad.role; // de la base, como isStaff
      // Impersonando, nunca staff: se ve lo que ve el cliente, con sus permisos.
      (session.user as any).isStaff = esSoporte;
      (session.user as any).organizationId = token.organizationId;
      (session.user as any).organizationName = token.organizationName;
      (session.user as any).allowedSections = token.allowedSections;
      (session.user as any).writableSections = token.writableSections;
      if (token.impersonatedBy) {
        (session.user as any).impersonatedBy = token.impersonatedBy;
        (session.user as any).impersonatorEmail = token.impersonatorEmail;
      }

      // S59 BIS: View as Org. Si user es staff Y hay cookie, override
      // organizationId/Name. Nunca aplica si esta impersonando (la
      // impersonate session ya hizo el switch de identidad).
      if (esSoporte) {
        try {
          const c = await cookies();
          const viewAsOrgId = c.get(VIEW_AS_COOKIE)?.value;
          if (viewAsOrgId && viewAsOrgId !== token.organizationId) {
            const org = await prisma.organization.findUnique({
              where: { id: viewAsOrgId },
              select: { id: true, name: true },
            });
            if (org) {
              (session.user as any).realOrganizationId = token.organizationId;
              (session.user as any).realOrganizationName = token.organizationName;
              (session.user as any).organizationId = org.id;
              (session.user as any).organizationName = org.name;
              // S60 EXT-2 BIS+++++++++ FIX: antes era `true` (boolean) lo que
              // rompia la comparacion `org.id === currentOrgId` en el frontend.
              // Ahora guardamos el orgId real para que el checkmark visual del
              // OrgSwitcher matchee correctamente.
              (session.user as any).viewingAsOrg = org.id;
            }
          }
        } catch {
          // silent — no romper la sesion si falla la cookie
        }
      }

      // El soporte mantiene el acceso en "ver como" aunque la organización esté
      // suspendida; la impersonación vive el bloqueo del cliente.
      if (esSoporte) return session;
      const acceso = accesoDeLaOrganizacion(identidad.settings);
      return acceso ? sesionBloqueada(session, acceso) : session;
    },
  },
  pages: {
    signIn: "/login",
  },
};
