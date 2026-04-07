// ══════════════════════════════════════════════════════════════
// Gate de feature flag — Setup Checklist (Fase 1: solo internos)
// ══════════════════════════════════════════════════════════════
// Ver docs/nitropixel-score-rollout.md
// ══════════════════════════════════════════════════════════════

import { notFound } from "next/navigation";
import { canSeeNitroScore } from "@/lib/feature-flags";
import { ReactNode } from "react";

export default async function SetupLayout({ children }: { children: ReactNode }) {
  const allowed = await canSeeNitroScore();
  if (!allowed) notFound();
  return <>{children}</>;
}
