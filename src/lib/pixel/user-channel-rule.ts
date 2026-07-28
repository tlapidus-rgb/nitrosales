// ══════════════════════════════════════════════════════════════════════════
// Regla de canal creada por el USUARIO (self-service, pivot v2)
// ══════════════════════════════════════════════════════════════════════════
// El usuario conecta un origen entrante (su `codigo` crudo) con uno de SUS
// canales. Eso es una regla de la org: source EXACT = <codigo> → <canal>. Puro,
// sin DB, para poder testear la construcción del INSERT sin tocar Postgres.
// ══════════════════════════════════════════════════════════════════════════

import type { ChannelRule } from "@/lib/pixel/channel-rules";

const MAX_LEN = 120;

export interface UserRuleInput {
  organizationId: string;
  /** El origen crudo tal como viene en la dim (source_raw). Se matchea exacto. */
  source: string;
  /** El canal del usuario al que lo asigna. */
  channel: string;
}

export class UserRuleError extends Error {}

/** id estable por (org, source): re-mapear el mismo origen ACTUALIZA su canal. */
export function userRuleId(orgId: string, source: string): string {
  const slug = source
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `usr-${orgId}-${slug}`;
}

/**
 * Valida + normaliza el input del usuario en una `ChannelRule` de la org.
 * source se guarda en minúscula (así matchea `source_raw`, que ya es lower).
 * El canal se guarda tal cual lo escribió el usuario (su nombre, su decisión).
 */
export function buildUserChannelRule(input: UserRuleInput): ChannelRule {
  const source = input.source?.trim().toLowerCase() ?? "";
  const channel = input.channel?.trim() ?? "";
  if (!input.organizationId) throw new UserRuleError("organizationId requerido");
  if (!source) throw new UserRuleError("source requerido");
  if (!channel) throw new UserRuleError("channel requerido");
  if (source.length > MAX_LEN) throw new UserRuleError("source demasiado largo");
  if (channel.length > MAX_LEN) throw new UserRuleError("channel demasiado largo");

  return {
    id: userRuleId(input.organizationId, source),
    organizationId: input.organizationId,
    // Menor prioridad numérica que las globales default (10-90) para que la
    // decisión del usuario GANE sobre cualquier sugerencia nuestra. Además el
    // orden org-first del store ya prioriza las de la org.
    priority: 5,
    source: { match: "exact", pattern: source },
    channel,
  };
}
