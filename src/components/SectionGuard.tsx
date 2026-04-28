"use client";

// ══════════════════════════════════════════════════════════════
// <SectionGuard sectionKey="campaigns_meta"> ... </SectionGuard>
// ══════════════════════════════════════════════════════════════
// Wrapper que muestra el contenido si la sección está ACTIVE,
// o un cartel de "bloqueado" si está LOCKED_INTEGRATION o MAINTENANCE.
//
// Uso:
//   <SectionGuard sectionKey="campaigns_meta">
//     <MyCampaignsPage />
//   </SectionGuard>
// ══════════════════════════════════════════════════════════════

import { ReactNode } from "react";
import Link from "next/link";
import { useSectionStatus } from "@/hooks/useSectionStatus";
import { Lock, AlertCircle, Wrench, Loader2 } from "lucide-react";

const INTEGRATION_LABEL: Record<string, string> = {
  VTEX: "VTEX",
  MERCADOLIBRE: "MercadoLibre",
  META_ADS: "Meta Ads",
  GOOGLE_ADS: "Google Ads",
  GOOGLE_SEARCH_CONSOLE: "Google Search Console",
  NITROPIXEL: "NitroPixel",
};

const INTEGRATION_PATH: Record<string, string> = {
  VTEX: "/settings/integraciones/vtex",
  MERCADOLIBRE: "/settings/integraciones/mercadolibre",
  META_ADS: "/settings/integraciones/meta",
  GOOGLE_ADS: "/settings/integraciones/google-ads",
  GOOGLE_SEARCH_CONSOLE: "/settings/integraciones/google-search-console",
  NITROPIXEL: "/settings/integraciones/nitropixel",
};

interface Props {
  sectionKey: string;
  children: ReactNode;
}

export function SectionGuard({ sectionKey, children }: Props) {
  const { status, missing, loading } = useSectionStatus(sectionKey);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Cargando…
      </div>
    );
  }

  if (status === "ACTIVE") {
    return <>{children}</>;
  }

  if (status === "MAINTENANCE") {
    return (
      <div className="max-w-xl mx-auto py-16 px-6">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
          <div className="mx-auto mb-4 inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-100">
            <Wrench className="h-7 w-7 text-amber-600" />
          </div>
          <h2 className="text-[18px] font-bold text-amber-900 mb-2">Sección en mantenimiento</h2>
          <p className="text-[13px] text-amber-800 leading-relaxed">
            Te avisamos cuando esté lista.
          </p>
        </div>
      </div>
    );
  }

  if (status === "LOCKED_INTEGRATION") {
    const primaryMissing = missing[0];
    const integrationLabel = primaryMissing ? INTEGRATION_LABEL[primaryMissing] || primaryMissing : "una plataforma";
    const integrationPath = primaryMissing ? INTEGRATION_PATH[primaryMissing] : "/settings/integraciones";

    return (
      <div className="max-w-xl mx-auto py-16 px-6">
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-8 text-center">
          <div className="mx-auto mb-4 inline-flex items-center justify-center w-14 h-14 rounded-full bg-blue-100">
            <Lock className="h-7 w-7 text-blue-600" />
          </div>
          <h2 className="text-[18px] font-bold text-blue-900 mb-2">Conectá {integrationLabel} para ver esta sección</h2>
          <p className="text-[13px] text-blue-800 leading-relaxed mb-5">
            Esta sección muestra datos de {integrationLabel}. Una vez conectada, vuelve acá y la vas a ver activa.
          </p>
          <Link
            href={integrationPath}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 px-5 py-2.5 text-white font-semibold text-[13px]"
          >
            Conectar {integrationLabel}
          </Link>
          {missing.length > 1 && (
            <div className="mt-4 text-[11px] text-blue-700">
              También podés conectar: {missing.slice(1).map((m) => INTEGRATION_LABEL[m] || m).join(", ")}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Fallback (shouldn't happen)
  return (
    <div className="flex items-center justify-center py-20 text-slate-500">
      <AlertCircle className="h-5 w-5 mr-2" />
      Estado desconocido.
    </div>
  );
}
