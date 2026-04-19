// @ts-nocheck
"use client";

import React from "react";
import PlaceholderPage from "@/components/settings/PlaceholderPage";
import { Lock, History, Laptop } from "lucide-react";

export default function SeguridadPage() {
  return (
    <PlaceholderPage
      title="Seguridad"
      subtitle="Protegé el acceso a tu organización."
      description="Próximamente vas a poder activar two-factor authentication, ver historial de logins desde qué dispositivos y cerrar sesiones activas remotamente."
      accent="#ef4444"
      sketches={[
        {
          icon: Lock,
          label: "Two-Factor Auth",
          lines: ["Desactivado", "Apps compatibles", "Google · 1Password"],
        },
        {
          icon: History,
          label: "Últimos logins",
          lines: ["Hoy 14:32", "Chrome · BA", "IP 181.45.xx.xx"],
        },
        {
          icon: Laptop,
          label: "Sesiones activas",
          lines: ["3 dispositivos", "Cerrar todas", "En 1 click"],
        },
      ]}
    />
  );
}
