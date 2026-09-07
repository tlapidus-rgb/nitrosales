// ══════════════════════════════════════════════════════════════
// Gate de /backfill-runner
// ══════════════════════════════════════════════════════════════
// Esta página no tenía guard de ninguna clase: no estaba en el `matcher` del
// middleware (que lista /dashboard, /aura, /orders… nunca /backfill-runner) y
// su layout padre es el root, que no valida sesión. Su propio encabezado lo
// decía sin disimulo: "public page, but backfill API is key-protected".
//
// El problema es que esa "key protection" era la constante
// una constante hardcodeada en un client component: viajaba en el
// bundle estático que Next sirve sin autenticación. Cualquiera que abriera la
// página —o que pidiera el chunk directo— se llevaba la clave que autenticaba
// /api/backfill/vtex y /api/fix-brands, dos endpoints que borran órdenes y
// reescriben catálogos de clientes reales.
//
// Ahora: la página es staff-only y ya no lleva la clave; los dos endpoints
// exigen sesión de staff. Encontrado el 2026-09-06 por la revisión de R-C02.
//
// `notFound()` y no `redirect()`, igual que en `src/app/admin/layout.tsx`: no
// confirmarle a un extraño que la ruta existe.
// ══════════════════════════════════════════════════════════════

import { notFound } from "next/navigation";
import { isInternalUser } from "@/lib/feature-flags";
import { ReactNode } from "react";

export default async function BackfillRunnerLayout({ children }: { children: ReactNode }) {
  const allowed = await isInternalUser();
  if (!allowed) notFound();
  return <>{children}</>;
}
