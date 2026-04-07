// ══════════════════════════════════════════════════════════════
// Admin Shell — NitroSales Internal Tools
// ══════════════════════════════════════════════════════════════
// Layout server-component que:
//   1. Gatea TODO /admin/* por isInternalUser (allowlist por email)
//   2. Provee el shell visual (sidebar con nav + header)
//
// Solo Tomy y allowlist ven cualquier cosa bajo /admin.
// Cualquier otro usuario logueado o anónimo recibe notFound() (404).
//
// Ver docs/nitropixel-score-rollout.md
// ══════════════════════════════════════════════════════════════

import { notFound } from "next/navigation";
import { isInternalUser } from "@/lib/feature-flags";
import { ReactNode } from "react";
import AdminSidebar from "./_components/AdminSidebar";

export const metadata = {
  title: "NitroSales · Admin",
  description: "Internal tools for the NitroSales team",
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const allowed = await isInternalUser();
  if (!allowed) notFound();

  return (
    <div className="min-h-screen bg-[#05070d] text-white">
      <style>{`
        @keyframes adminFadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes adminPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>

      <div className="flex min-h-screen">
        <AdminSidebar />
        <main className="flex-1 ml-64">
          <div className="border-b border-white/5 bg-[#05070d]/80 backdrop-blur sticky top-0 z-10">
            <div className="max-w-7xl mx-auto px-8 py-4 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-mono tracking-[0.25em] text-cyan-400/70 uppercase">
                  NitroSales · Internal
                </div>
                <div className="text-xs text-white/40">Solo visible para el equipo</div>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-mono text-emerald-400/70">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{animation: "adminPulse 2s infinite"}} />
                <span>SESIÓN INTERNA</span>
              </div>
            </div>
          </div>

          <div className="max-w-7xl mx-auto px-8 py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
