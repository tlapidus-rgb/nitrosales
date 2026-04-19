// @ts-nocheck
"use client";

import React from "react";
import PlaceholderPage from "@/components/settings/PlaceholderPage";
import { KeyRound, Gauge, Code2 } from "lucide-react";

export default function ApiKeysPage() {
  return (
    <PlaceholderPage
      title="API Keys"
      subtitle="Tokens para integrar NitroSales con tu stack."
      description="Próximamente vas a poder generar tokens de API para que aplicaciones externas (Zapier, n8n, tus propios scripts) consulten data de NitroSales. Con rate limits visibles y revoke inmediato."
      accent="#64748b"
      sketches={[
        {
          icon: KeyRound,
          label: "Tokens activos",
          lines: ["0 tokens", "Crear primero", "Solo Owner/Admin"],
        },
        {
          icon: Gauge,
          label: "Rate limits",
          lines: ["1.000 req/hora", "10K req/día", "Upgrade a Pro: 10x"],
        },
        {
          icon: Code2,
          label: "Documentación",
          lines: ["Endpoints REST", "Ejemplos curl", "Próximamente"],
        },
      ]}
    />
  );
}
