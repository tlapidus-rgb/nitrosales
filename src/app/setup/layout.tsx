// ══════════════════════════════════════════════════════════════
// /setup — Wizard de conexión de plataformas (post-activación)
// ══════════════════════════════════════════════════════════════
// Layout propio full-screen dark. Sin sidebar del producto porque
// el cliente aún no configuró nada y queremos enfocarlo en la tarea.
// Gated: requiere sesión autenticada.
// ══════════════════════════════════════════════════════════════

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SetupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect("/login?next=/setup");
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0A0A0F",
        color: "#E4E4E7",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Aura background */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 20% 30%, rgba(255,94,26,0.08) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(168,85,247,0.05) 0%, transparent 50%)",
          pointerEvents: "none",
        }}
      />
      <main style={{ position: "relative", zIndex: 1 }}>{children}</main>
    </div>
  );
}
