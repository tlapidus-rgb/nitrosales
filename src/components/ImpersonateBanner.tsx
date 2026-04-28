"use client";

// ══════════════════════════════════════════════════════════════
// ImpersonateBanner
// ══════════════════════════════════════════════════════════════
// Banner amarillo arriba de toda la app cuando la sesión actual es
// un impersonate (admin entró como otro user para QA). Dejá claro:
//   - Estás viendo como [user]
//   - Modo READ-ONLY (los botones de save/modify están deshabilitados)
//   - Botón para salir y volver al login admin
// ══════════════════════════════════════════════════════════════

import { useSession, signOut } from "next-auth/react";
import { Eye, X } from "lucide-react";

export function ImpersonateBanner() {
  const { data: session } = useSession();
  const impersonatedBy = (session?.user as any)?.impersonatedBy;
  const impersonatorEmail = (session?.user as any)?.impersonatorEmail;

  if (!impersonatedBy) return null;

  return (
    <div style={{
      position: "sticky",
      top: 0,
      zIndex: 9999,
      background: "linear-gradient(90deg, #f59e0b, #fbbf24)",
      color: "#451a03",
      padding: "8px 16px",
      fontSize: 13,
      fontWeight: 600,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      borderBottom: "2px solid #b45309",
      boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
    }}>
      <Eye size={16} />
      <span>
        Estás viendo como <strong>{session?.user?.email}</strong> ({session?.user?.name})
        — Modo <strong>solo lectura</strong> · Admin: {impersonatorEmail}
      </span>
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        style={{
          marginLeft: 12,
          padding: "4px 12px",
          background: "rgba(69,26,3,0.15)",
          border: "1px solid rgba(69,26,3,0.4)",
          borderRadius: 6,
          color: "#451a03",
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <X size={12} /> Salir
      </button>
    </div>
  );
}
