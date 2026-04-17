// @ts-nocheck

/**
 * /finanzas → redirige a /finanzas/pulso
 *
 * Pulso es la portada del módulo (decisión D1, sesión 41 con Tomy).
 * El founder lo abre y entiende el negocio en 10 segundos.
 *
 * Ver PROPUESTA_PNL_REORG.md, sección 3.
 */

import { redirect } from "next/navigation";

export default function FinanzasIndex() {
  redirect("/finanzas/pulso");
}
