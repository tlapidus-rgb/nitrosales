import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { createHmac } from "crypto";
import { prisma } from "@/lib/db/client";
import { cookies } from "next/headers";

// S59 BIS: lista de emails con poder de "View as Org" (override de
// session.organizationId via cookie). Los demas users no pueden
// usar esa cookie aunque la setean.
const INTERNAL_VIEW_AS_EMAILS = new Set([
  "tlapidus@99media.com.ar",
]);
const VIEW_AS_COOKIE = "nitro-view-org";

// ─────────────────────────────────────────────────────────────
// S59: Impersonate token verification (sync con /api/admin/impersonate)
// ─────────────────────────────────────────────────────────────
function verifyImpersonateToken(token: string): { targetUserId: string; impersonatorUserId: string; impersonatorEmail: string; exp: number } | null {
  try {
    const [data, sig] = token.split(".");
    if (!data || !sig) return null;
    const secret = process.env.NEXTAUTH_SECRET || "fallback-secret";
    const hmac = createHmac("sha256", secret);
    hmac.update(data);
    const expectedSig = hmac.digest("base64url").slice(0, 32);
    if (expectedSig !== sig) return null;
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
        token.organizationId = (user as any).organizationId;
        token.organizationName = (user as any).organizationName;
        // S59: propagar flags de impersonate
        if ((user as any).impersonatedBy) {
          token.impersonatedBy = (user as any).impersonatedBy;
          token.impersonatorEmail = (user as any).impersonatorEmail;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
        (session.user as any).organizationId = token.organizationId;
        (session.user as any).organizationName = token.organizationName;
        if (token.impersonatedBy) {
          (session.user as any).impersonatedBy = token.impersonatedBy;
          (session.user as any).impersonatorEmail = token.impersonatorEmail;
        }

        // S59 BIS: View as Org. Si user es internal Y hay cookie, override
        // organizationId/Name. Nunca aplica si esta impersonando (la
        // impersonate session ya hizo el switch de identidad).
        const email = (session.user.email || "").toLowerCase();
        const isInternal = INTERNAL_VIEW_AS_EMAILS.has(email);
        if (isInternal && !token.impersonatedBy) {
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
                (session.user as any).viewingAsOrg = true;
              }
            }
          } catch {
            // silent — no romper la sesion si falla la cookie
          }
        }
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};
