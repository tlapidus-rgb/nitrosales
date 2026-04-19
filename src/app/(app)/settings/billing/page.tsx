// @ts-nocheck
"use client";

import React from "react";
import PlaceholderPage from "@/components/settings/PlaceholderPage";
import { CreditCard, Receipt, Repeat } from "lucide-react";

export default function BillingPage() {
  return (
    <PlaceholderPage
      title="Billing"
      subtitle="Tu plan con NitroSales y facturación mensual."
      description="Próximamente vas a poder ver tu plan actual, gestionar tu método de pago, descargar facturas y cambiar entre planes. Mientras tanto la facturación se maneja fuera de la app."
      accent="#f59e0b"
      sketches={[
        {
          icon: CreditCard,
          label: "Plan actual",
          lines: ["Starter", "$29 USD/mes", "Próximo cobro: 15 May"],
        },
        {
          icon: Repeat,
          label: "Método de pago",
          lines: ["Tarjeta ••4242", "Mercado Pago", "Actualizar"],
        },
        {
          icon: Receipt,
          label: "Historial de facturas",
          lines: ["6 facturas", "Último: abril 2026", "Descargar todas"],
        },
      ]}
    />
  );
}
