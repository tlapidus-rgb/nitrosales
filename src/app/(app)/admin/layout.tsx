// ══════════════════════════════════════════════════════════════
// Gate de /admin/* dentro del grupo de rutas (app)
// ══════════════════════════════════════════════════════════════
// `src/app/admin/layout.tsx` gatea por `isInternalUser()` todo lo que cuelga de
// `src/app/admin/*` (page, alertas, clientes, usage). Pero `/admin/onboardings`
// NO vive ahí: vive en `src/app/(app)/admin/onboardings/`, que es otro grupo de
// rutas y por lo tanto **otra cadena de layouts**. El layout de `(app)` no tiene
// guard de staff, así que esa pantalla — cuyo propio comentario dice "Solo
// visible para isInternalUser (Tomy)" — la podía abrir cualquier usuario
// logueado de cualquier organización.
//
// Encontrado el 2026-09-06 haciendo R-C05. No estaba en la auditoría: los dos
// `/admin` se ven como uno solo desde la URL, y el guard existía, sólo que en la
// rama equivocada del árbol.
//
// La página es `"use client"`, así que el guard tiene que vivir en un layout
// server como este. Mismo criterio que `src/app/admin/layout.tsx`: `notFound()`
// y no `redirect()`, para no confirmarle a un extraño que la ruta existe.
// ══════════════════════════════════════════════════════════════

import { notFound } from "next/navigation";
import { isInternalUser } from "@/lib/feature-flags";
import { ReactNode } from "react";

export default async function AdminEnAppLayout({ children }: { children: ReactNode }) {
  const allowed = await isInternalUser();
  if (!allowed) notFound();
  return <>{children}</>;
}
