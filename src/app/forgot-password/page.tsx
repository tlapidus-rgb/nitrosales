"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Locale = "es" | "en";

function detectLocale(): Locale {
  if (typeof navigator === "undefined") return "es";
  return navigator.language.toLowerCase().startsWith("en") ? "en" : "es";
}

const COPY: Record<Locale, {
  eyebrow: string;
  title: string;
  description: string;
  emailLabel: string;
  inputPlaceholder: string;
  submit: string;
  submitting: string;
  success: string;
  back: string;
}> = {
  es: {
    eyebrow: "Recuperación de acceso",
    title: "¿Olvidaste tu contraseña?",
    description: "Te mandamos un link seguro para crear una nueva. Si la cuenta existe, vas a recibirlo.",
    emailLabel: "Email",
    inputPlaceholder: "tu@email.com",
    submit: "Enviar link de recuperación",
    submitting: "Enviando...",
    success: "Revisá tu casilla. Si el email está registrado, ya debería haberte llegado el link para cambiar la contraseña.",
    back: "Volver al login",
  },
  en: {
    eyebrow: "Access recovery",
    title: "Forgot your password?",
    description: "We’ll send you a secure link to create a new one. If the account exists, you’ll receive it.",
    emailLabel: "Email",
    inputPlaceholder: "you@example.com",
    submit: "Send recovery link",
    submitting: "Sending...",
    success: "Check your inbox. If the email is registered, the reset link should already be there.",
    back: "Back to login",
  },
};

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [locale, setLocale] = useState<Locale>("es");

  useEffect(() => {
    setLocale(detectLocale());
  }, []);

  const copy = useMemo(() => COPY[locale], [locale]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSubmitted(false);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, locale }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "No pudimos procesar la solicitud");
        return;
      }
      setSubmitted(true);
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

        {submitted ? (
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
              <label className="mb-2 block text-sm text-gray-300">{copy.emailLabel}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={copy.inputPlaceholder}
                className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition placeholder:text-gray-500 focus:border-[#FF5E1A]/60 focus:ring-2 focus:ring-[#FF5E1A]/20"
                required
              />
            </div>

            {error && <p className="text-sm text-rose-400">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-gradient-to-r from-[#FF5E1A] via-[#ff6f32] to-[#ff8a5b] py-3 font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? copy.submitting : copy.submit}
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