// @ts-nocheck
"use client";

// ══════════════════════════════════════════════════════════════
// /auth/impersonate?token=...
// ══════════════════════════════════════════════════════════════
// Pagina client-only que recibe el token del endpoint admin y hace
// signIn() con el provider "impersonate" de NextAuth. Después
// redirige a /dashboard como ese user.
//
// Uso: Tomy entra a /control/clientes/[id] → click "Entrar como
// cliente" → endpoint admin/impersonate genera URL → abre en pestaña
// nueva → llega acá → signIn → ve la app como el user target.
// ══════════════════════════════════════════════════════════════

import { useEffect, useState, Suspense } from "react";
import { signIn, signOut } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";

function ImpersonateContent() {
  const params = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      setError("Falta token en la URL");
      return;
    }
    (async () => {
      try {
        // CRITICO: cerrar la sesion admin actual primero. Sin esto, NextAuth
        // mantiene la JWT del admin (EMDJ) y no la reemplaza con la del
        // target user (TVC). Resultado: el admin termina viendo su propia
        // org en vez de la del cliente.
        await signOut({ redirect: false });
        const result = await signIn("impersonate", {
          token,
          redirect: false,
        });
        if (result?.error) {
          setError(result.error);
          return;
        }
        // Login OK → forzar full reload para que el JWT nuevo se aplique
        // a TODA la app (server components incluidos).
        window.location.href = "/";
      } catch (e: any) {
        setError(e?.message || "Error desconocido");
      }
    })();
  }, [params, router]);

  if (error) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#0a0a0a", color: "#fff", padding: 20 }}>
        <div style={{ maxWidth: 480, textAlign: "center" }}>
          <div style={{ display: "inline-flex", marginBottom: 16 }}>
            <AlertCircle size={48} color="#ef4444" />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>No se pudo iniciar impersonate</h1>
          <p style={{ color: "#94a3b8", lineHeight: 1.6, marginBottom: 20 }}>{error}</p>
          <a href="/control/clientes" style={{ color: "#60a5fa", textDecoration: "underline" }}>
            Volver al panel admin
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#0a0a0a", color: "#fff" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ display: "inline-flex", marginBottom: 16 }}>
          <Loader2 size={36} color="#60a5fa" style={{ animation: "spin 1.5s linear infinite" }} />
        </div>
        <p style={{ fontSize: 14, color: "#94a3b8" }}>Iniciando sesión como cliente…</p>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function ImpersonatePage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "#0a0a0a" }} />}>
      <ImpersonateContent />
    </Suspense>
  );
}
