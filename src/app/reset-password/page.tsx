"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type Locale = "es" | "en";

const COPY: Record<Locale, {
  eyebrow: string;
  title: string;
  description: string;
  newPassword: string;
  confirmPassword: string;
  minLength: string;
  saving: string;
  save: string;
  success: string;
  missingToken: string;
  mismatch: string;
  back: string;
}> = {
  es: {
    eyebrow: "Nuevo acceso",
    title: "Crear nueva contraseña",
    description: "El link es de un solo uso y expira automáticamente.",
    newPassword: "Nueva contraseña",
    confirmPassword: "Confirmar contraseña",
    minLength: "Mínimo 8 caracteres",
    saving: "Guardando...",
    save: "Guardar nueva contraseña",
    success: "Listo. Tu contraseña quedó actualizada. Ya podés volver a ingresar.",
    missingToken: "Falta el token de recuperación",
    mismatch: "Las contraseñas no coinciden",
    back: "Volver al login",
  },
  en: {
    eyebrow: "New access",
    title: "Create a new password",
    description: "This link is single-use and expires automatically.",
    newPassword: "New password",
    confirmPassword: "Confirm password",
    minLength: "At least 8 characters",
    saving: "Saving...",
    save: "Save new password",
    success: "Done. Your password has been updated. You can sign in again now.",
    missingToken: "Missing recovery token",
    mismatch: "Passwords do not match",
    back: "Back to login",
  },
};

function detectLocale(input: string | null): Locale {
  return input?.toLowerCase().startsWith("en") ? "en" : "es";
}

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const locale = detectLocale(searchParams.get("locale"));
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const copy = COPY[locale];

  useEffect(() => {
    if (!token) {
      setError(copy.missingToken);
    }
  }, [token, copy.missingToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setError(copy.missingToken);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(copy.mismatch);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "No pudimos cambiar la contraseña");
        return;
      }
      setSuccess(true);
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(255,94,26,0.15),_transparent_35%),linear-gradient(180deg,#09090f_0%,#0f111a_100%)] px-4 flex items-center justify-center">
      <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-white/5 p-8 text-white shadow-2xl shadow-black/30 backdrop-blur-md">
        <div className="mb-8 text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-[#FF5E1A]">{copy.eyebrow}</p>
          <h1 className="text-3xl font-semibold tracking-tight">{copy.title}</h1>
          <p className="mt-3 text-sm text-gray-400">{copy.description}</p>
        </div>

        {success ? (
          <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-5 text-sm text-emerald-100">
            {copy.success}
            <div className="mt-5">
              <Link href="/login" className="text-[#FF5E1A] transition hover:text-[#ff8a5b]">
                {copy.back}
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="mb-2 block text-sm text-gray-300">{copy.newPassword}</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={copy.minLength}
                className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition placeholder:text-gray-500 focus:border-[#FF5E1A]/60 focus:ring-2 focus:ring-[#FF5E1A]/20"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-gray-300">{copy.confirmPassword}</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={copy.confirmPassword}
                className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition placeholder:text-gray-500 focus:border-[#FF5E1A]/60 focus:ring-2 focus:ring-[#FF5E1A]/20"
                required
              />
            </div>

            {error && <p className="text-sm text-rose-400">{error}</p>}

            <button
              type="submit"
              disabled={loading || !token}
              className="w-full rounded-2xl bg-gradient-to-r from-[#FF5E1A] via-[#ff6f32] to-[#ff8a5b] py-3 font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? copy.saving : copy.save}
            </button>

            <p className="text-center text-xs text-gray-500">
              <Link href="/login" className="text-gray-300 transition hover:text-white">
                {copy.back}
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}