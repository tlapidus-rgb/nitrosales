// @ts-nocheck
"use client";

// ══════════════════════════════════════════════════════════════
// OnboardingGate — wrapper que decide si mostrar producto o wizard
// ══════════════════════════════════════════════════════════════
// Antes el OnboardingOverlay se inyectaba ENCIMA del producto. Problema:
// el producto se renderizaba igual atras (sidebar, FloatingAurum, pages),
// consume recursos, se "pestanea" antes de cargar el overlay, y en algunos
// casos crasheaba el cliente.
//
// Ahora el layout usa este Gate para decidir en un solo lugar:
//   - loading  → pantalla aurora + loader minimal
//   - locked   → SOLO el OnboardingOverlay (no renderea el producto)
//   - unlocked → renderea children normal
//
// Esto evita que el producto se cargue cuando el cliente todavia no
// completo el onboarding. Performance + UX mejor.
// ══════════════════════════════════════════════════════════════

import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import OnboardingOverlay from "./OnboardingOverlay";

export default function OnboardingGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchState = async () => {
      try {
        const res = await fetch("/api/me/onboarding/state", { cache: "no-store" });
        if (cancelled) return;
        if (!res.ok) {
          setState(null);
          return;
        }
        const json = await res.json();
        setState(json);
      } catch {
        if (!cancelled) setState(null);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };

    fetchState();
    const interval = setInterval(fetchState, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Loading inicial: aurora + spinner minimal (sin producto atras)
  if (!loaded) {
    return <AuroraLoader />;
  }

  // Si no hay state (error de red / user no loguea) → dejamos pasar children
  // (si tira 401 el producto redirige al login normal)
  if (!state) {
    return <>{children}</>;
  }

  // Locked: solo mostramos el overlay. NO renderemos el producto atras.
  if (state.locked) {
    return <OnboardingOverlay />;
  }

  // Unlocked: producto normal
  return <>{children}</>;
}

function AuroraLoader() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#0A0A0F",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {/* Aurora blobs animados */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        <div style={{
          position: "absolute", top: "30%", left: "25%",
          width: "45vw", height: "45vw", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,94,26,0.25) 0%, transparent 60%)",
          filter: "blur(100px)",
          animation: "gateBlob1 12s ease-in-out infinite",
        }} />
        <div style={{
          position: "absolute", top: "35%", right: "20%",
          width: "50vw", height: "50vw", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(168,85,247,0.20) 0%, transparent 60%)",
          filter: "blur(110px)",
          animation: "gateBlob2 14s ease-in-out infinite",
        }} />
      </div>

      <div style={{ position: "relative", textAlign: "center", zIndex: 2 }}>
        <div style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 60, height: 60,
          borderRadius: "50%",
          background: "rgba(255,94,26,0.1)",
          border: "1px solid rgba(255,94,26,0.3)",
          marginBottom: 16,
        }}>
          <Loader2
            size={28}
            color="#FF5E1A"
            style={{ animation: "spin 1s linear infinite" }}
          />
        </div>
        <div style={{ fontSize: 13, color: "#9CA3AF", fontWeight: 500 }}>
          Cargando NitroSales…
        </div>
      </div>

      <style jsx global>{`
        @keyframes gateBlob1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(15vw, 10vh) scale(1.2); }
        }
        @keyframes gateBlob2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-20vw, -10vh) scale(1.1); }
        }
      `}</style>
    </div>
  );
}
