// @ts-nocheck
"use client";

/**
 * /unauthorized — Fase 7 QA enforcement
 * ─────────────────────────────────────────────────────────────
 * Pagina publica a la que se redirige cuando un user logueado intenta
 * acceder a una seccion que su rol no permite.
 */

import Link from "next/link";
import { ShieldAlert, ArrowLeft } from "lucide-react";

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-amber-200 bg-white p-8 shadow-sm">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 80% 0%, rgba(245,158,11,0.08) 0%, transparent 60%)",
          }}
        />
        <div className="relative">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl"
            style={{
              background: "rgba(245,158,11,0.10)",
              color: "#d97706",
              border: "1px solid rgba(245,158,11,0.25)",
            }}
          >
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h1 className="mt-5 text-xl font-semibold tracking-tight text-slate-900">
            Acceso denegado
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Tu rol no tiene permisos para ver esta sección. Si creés que es un
            error, hablá con un Owner o Admin de tu organización para que te
            actualice los permisos.
          </p>
          <div className="mt-6 flex items-center gap-2">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Volver al inicio
            </Link>
            <Link
              href="/settings/team"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Ver mi rol actual
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
