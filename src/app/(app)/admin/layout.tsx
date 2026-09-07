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

// ⚠️ OJO CON EL STATUS: esta ruta devuelve **200, no 404**, aunque el guard corte.
// Verificado en el preview el 2026-09-06: el body es la pantalla 404 de Next y la
// respuesta trae `{"digest":"NEXT_NOT_FOUND"}`, o sea que el render se aborta y no
// sale un solo dato. El status queda en 200 porque el layout de `(app)` es grande
// y ya empezó a streamear cuando este layout anidado tira `notFound()`; ahí Next
// ya no puede cambiar el código de estado.
//
// `/admin` y `/admin/clientes` sí dan 404 porque su guard (`src/app/admin/layout.tsx`)
// está más arriba en el árbol, antes de que se comprometa el status.
//
// No lo leas como "el guard no anda". Si algún día hace falta el 404 de verdad,
// hay que envolver la página en un server component que chequee antes de renderizar
// (hoy es `"use client"`), o moverla bajo `src/app/admin/`.
