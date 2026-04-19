import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/db/client";

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
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
        (session.user as any).organizationId = token.organizationId;
        (session.user as any).organizationName = token.organizationName;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};
