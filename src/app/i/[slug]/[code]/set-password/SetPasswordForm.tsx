"use client";

// Form de set-password del afiliado. POST a /api/public/influencers/[slug]/[code]/set-password.
// La clave NUNCA viaja en texto plano a la empresa: se manda para hashear y listo.

import { useState } from "react";
import { useRouter } from "next/navigation";

const MIN_LEN = 6;

export function SetPasswordForm({ slug, code, token }: { slug: string; code: string; token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const tooShort = password.length > 0 && password.length < MIN_LEN;
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit =
    !!token && password.length >= MIN_LEN && confirm === password && !saving;

  async function submit() {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/public/influencers/${slug}/${code}/set-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "No se pudo definir la contraseña");
      setDone(true);
      setTimeout(() => router.push(`/i/${slug}/${code}`), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0a0a14",
        color: "#f5f5f7",
        fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        padding: "24px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 20,
          padding: 28,
        }}
      >
        {!token ? (
          <p style={{ fontSize: 14, color: "#f87171" }}>
            Falta el link de acceso. Abrí el link que te llegó por mail, o pedí uno nuevo.
          </p>
        ) : done ? (
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>¡Listo! 🎉</h1>
            <p style={{ fontSize: 14, color: "rgba(245,245,247,0.62)" }}>
              Tu contraseña quedó definida. Te llevamos a tu dashboard…
            </p>
          </div>
        ) : (
          <>
            <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 6 }}>Definí tu contraseña</h1>
            <p style={{ fontSize: 13, color: "rgba(245,245,247,0.62)", marginBottom: 20 }}>
              Elegí una contraseña para entrar a tu dashboard. Es tuya — nosotros no la vemos.
            </p>

            <label style={{ display: "block", fontSize: 12, color: "rgba(245,245,247,0.62)", marginBottom: 6 }}>
              Contraseña (mín. {MIN_LEN})
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
            />
            {tooShort && <span style={hintErr}>Mínimo {MIN_LEN} caracteres.</span>}

            <label style={{ display: "block", fontSize: 12, color: "rgba(245,245,247,0.62)", margin: "14px 0 6px" }}>
              Repetir contraseña
            </label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              style={inputStyle}
            />
            {mismatch && <span style={hintErr}>No coinciden.</span>}

            {error && (
              <p style={{ fontSize: 13, color: "#f87171", marginTop: 14 }}>{error}</p>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              style={{
                marginTop: 20,
                width: "100%",
                padding: "12px",
                borderRadius: 12,
                border: "none",
                cursor: canSubmit ? "pointer" : "not-allowed",
                opacity: canSubmit ? 1 : 0.5,
                color: "#fff",
                fontWeight: 600,
                fontSize: 14,
                background: "linear-gradient(135deg, #ff0080 0%, #7928ca 50%, #00d4ff 100%)",
              }}
            >
              {saving ? "Guardando…" : "Definir contraseña"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  outline: "none",
  fontSize: 14,
  background: "rgba(255,255,255,0.02)",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#f5f5f7",
};

const hintErr: React.CSSProperties = { fontSize: 11, color: "#f87171", marginTop: 4, display: "block" };
