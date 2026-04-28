"use client";

// ══════════════════════════════════════════════════════════════
// AdsAuthBanner.tsx
// ══════════════════════════════════════════════════════════════
// Cartel persistente que aparece en todo el app cuando el cliente
// tiene Meta Ads o Google Ads en estado PENDING o APPROVED (es decir:
// ya pidio autorizacion pero todavia no completo el OAuth).
//
// Estados que dispara el banner:
//   - PENDING (esperando que admin agregue como tester)
//   - APPROVED (admin lo agrego, falta hacer click en "Conectar")
//
// Si la conexion esta CONNECTED o NONE → no muestra nada.
// ══════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";

type AuthState = "NONE" | "PENDING" | "APPROVED" | "CONNECTED" | "LOADING";

export function AdsAuthBanner() {
  const [meta, setMeta] = useState<AuthState>("LOADING");
  const [google, setGoogle] = useState<AuthState>("LOADING");
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/me/meta-auth-status").then((r) => r.json()).catch(() => null),
      fetch("/api/me/google-auth-status").then((r) => r.json()).catch(() => null),
    ]).then(([m, g]) => {
      if (cancelled) return;
      setMeta(m?.state || "NONE");
      setGoogle(g?.state || "NONE");
    });
    return () => { cancelled = true; };
  }, []);

  if (dismissed) return null;

  const metaPending = meta === "PENDING" || meta === "APPROVED";
  const googlePending = google === "PENDING" || google === "APPROVED";

  if (!metaPending && !googlePending) return null;

  // Mensaje según estado de cada plataforma.
  const messages: Array<{ platform: string; state: AuthState; color: string }> = [];
  if (metaPending) {
    messages.push({ platform: "Meta Ads", state: meta, color: "#1877F2" });
  }
  if (googlePending) {
    messages.push({ platform: "Google Ads", state: google, color: "#4285F4" });
  }

  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(251,191,36,0.10), rgba(245,158,11,0.06))",
      border: "1px solid rgba(251,191,36,0.30)",
      borderRadius: 10,
      padding: "12px 16px",
      marginBottom: 12,
      display: "flex",
      alignItems: "center",
      gap: 12,
      fontSize: 13,
    }}>
      <div style={{ fontSize: 18 }}>⏳</div>
      <div style={{ flex: 1, lineHeight: 1.5 }}>
        <strong style={{ color: "#92400e" }}>Conexión publicitaria pendiente:</strong>{" "}
        {messages.map((m, i) => (
          <span key={m.platform} style={{ color: "#78350f" }}>
            {m.platform}{" "}
            <span style={{
              padding: "2px 8px",
              background: m.state === "APPROVED" ? "rgba(34,197,94,0.20)" : "rgba(251,191,36,0.25)",
              color: m.state === "APPROVED" ? "#15803d" : "#92400e",
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 700,
            }}>
              {m.state === "APPROVED" ? "✓ listo para conectar" : "esperando autorización"}
            </span>
            {i < messages.length - 1 ? " · " : ""}
          </span>
        ))}
        {messages.some((m) => m.state === "APPROVED") && (
          <>
            {" — "}
            <a href="/onboarding" style={{ color: "#1d4ed8", fontWeight: 700, textDecoration: "underline" }}>
              completá la conexión
            </a>
          </>
        )}
      </div>
      <button
        onClick={() => setDismissed(true)}
        style={{
          background: "transparent",
          border: "none",
          color: "#78350f",
          fontSize: 16,
          cursor: "pointer",
          padding: "0 4px",
          opacity: 0.6,
        }}
        aria-label="Cerrar"
      >
        ×
      </button>
    </div>
  );
}
