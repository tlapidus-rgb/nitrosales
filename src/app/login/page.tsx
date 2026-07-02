"use client";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    if (res?.error) {
      setError("Email o password incorrectos");
      setLoading(false);
    } else {
      router.push("/nitropixel");
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(255,94,26,0.16),_transparent_40%),linear-gradient(180deg,#09090f_0%,#0f111a_100%)] px-4 flex items-center justify-center">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-gray-300 backdrop-blur-sm">
            <span className="h-2 w-2 rounded-full bg-[#FF5E1A]" />
            NitroSales access
          </div>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-white">
            Ingresá a tu centro de control
          </h1>
          <p className="mt-3 text-sm text-gray-400">La primera pantalla después de entrar es NitroPixel.</p>
        </div>
        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl shadow-black/30 backdrop-blur-md"
        >
          <div>
            <label className="mb-2 block text-sm text-gray-300">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition placeholder:text-gray-500 focus:border-[#FF5E1A]/60 focus:ring-2 focus:ring-[#FF5E1A]/20"
              placeholder="tu@email.com"
              required
            />
          </div>
          <div>
            <label className="mb-2 block text-sm text-gray-300">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition placeholder:text-gray-500 focus:border-[#FF5E1A]/60 focus:ring-2 focus:ring-[#FF5E1A]/20"
              placeholder="Tu password"
              required
            />
          </div>
          <div className="flex items-center justify-between gap-3 text-xs text-gray-400">
            <span>{error ? <span className="text-rose-400">{error}</span> : ""}</span>
            <Link href="/forgot-password" className="font-medium text-[#FF5E1A] transition hover:text-[#ff7d46]">
              Olvidé mi contraseña
            </Link>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-gradient-to-r from-[#FF5E1A] via-[#ff6f32] to-[#ff8a5b] py-3 font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Ingresando..." : "Ingresar"}
          </button>
        </form>
        <p className="mt-6 text-center text-xs text-gray-500">NitroSales v0.1.0</p>
      </div>
    </div>
  );
}
