"use client";

// ══════════════════════════════════════════════════════════════
// ViewAsOrgBanner
// ══════════════════════════════════════════════════════════════
// Banner azul que aparece cuando un internal user (Tomy) esta viendo
// la data de OTRA org (override via cookie nitro-view-org).
//
// Diferente del ImpersonateBanner: aca la identidad sigue siendo el
// admin (Tomy). Solo cambia que data se muestra. Audit logs intactos.
// ══════════════════════════════════════════════════════════════

import { useSession } from "next-auth/react";
import { Eye, X } from "lucide-react";
import { useState } from "react";

export function ViewAsOrgBanner() {
  const { data: session } = useSession();
  const [busy, setBusy] = useState(false);

  const viewing = (session?.user as any)?.viewingAsOrg;
  const orgName = (session?.user as any)?.organizationName;
  const realOrgName = (session?.user as any)?.realOrganizationName;

  if (!viewing) return null;

  const exit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/admin/view-as-org", { method: "DELETE" });
      window.location.href = "/";
    } catch {
      setBusy(false);
    }
  };

  return (
    <div style={{
      position: "sticky",
      top: 0,
      zIndex: 9999,
      background: "linear-gradient(90deg, #2563eb, #3b82f6)",
      color: "#fff",
      padding: "8px 16px",
      fontSize: 13,
      fontWeight: 600,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      borderBottom: "2px solid #1d4ed8",
      boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
    }}>
      <Eye size={16} />
      <span>
        Viendo data de <strong>{orgName}</strong> · Tu cuenta sigue siendo admin de <strong>{realOrgName}</strong>
      </span>
      <button
        onClick={exit}
        disabled={busy}
        style={{
          marginLeft: 12,
          padding: "4px 12px",
          background: "rgba(255,255,255,0.18)",
          border: "1px solid rgba(255,255,255,0.4)",
          borderRadius: 6,
          color: "#fff",
          fontSize: 12,
          fontWeight: 700,
          cursor: busy ? "wait" : "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <X size={12} /> {busy ? "Saliendo…" : "Salir de la vista"}
      </button>
    </div>
  );
}
