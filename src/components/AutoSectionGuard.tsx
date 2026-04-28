"use client";

// ══════════════════════════════════════════════════════════════
// <AutoSectionGuard>
// ══════════════════════════════════════════════════════════════
// Wrapper inteligente que detecta automáticamente la sección actual
// según el pathname y aplica el SectionGuard correspondiente.
//
// Si la pathname matchea con una sección registrada en SECTIONS
// (src/lib/sections/config.ts), aplica el guard usando esa key.
// Si no matchea con ninguna, renderiza children sin tocar (paths
// fuera del sistema de bloqueo, como /settings/*).
//
// Single source of truth: agregar una entry en SECTIONS y la
// página queda automáticamente protegida.
// ══════════════════════════════════════════════════════════════

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { SectionGuard } from "./SectionGuard";
import { findSectionByPath } from "@/lib/sections/config";

// Paths que NUNCA se bloquean (settings, account, etc).
// Si un cliente está bloqueado de Aura no debería estar bloqueado de poder
// llegar a /settings para reconectar integraciones.
const ALWAYS_OPEN_PREFIXES = [
  "/settings",
  "/onboarding",
  "/login",
  "/accept-invite",
];

interface Props {
  children: ReactNode;
}

export function AutoSectionGuard({ children }: Props) {
  const pathname = usePathname() || "/";

  // Si está en un path "abierto" (settings, login, etc) → no aplicar guard.
  if (ALWAYS_OPEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return <>{children}</>;
  }

  const section = findSectionByPath(pathname);
  if (!section) {
    // Path no está en el config → no protegemos (asumimos público dentro de la app).
    return <>{children}</>;
  }

  return <SectionGuard sectionKey={section.key}>{children}</SectionGuard>;
}
