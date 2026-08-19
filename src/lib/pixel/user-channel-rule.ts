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
  /**
   * Medium crudo (medium_raw) — OPCIONAL. Cuando el panel muestra el origen
   * partido por medium (mismo source, distinto medium: google/cpc vs google/organic),
   * lo manda para que la regla sea `source EXACT AND medium EXACT → canal` y agarre
   * SOLO esa variante. Sin medium, la regla es source-only (agarra todo el source).
   */
  medium?: string | null;
}

export class UserRuleError extends Error {}

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

/**
 * id estable por (org, source[, medium]): re-mapear el mismo origen ACTUALIZA su
 * canal. Con medium, el id incluye el medium para que (google,cpc) y (google,organic)
 * sean reglas DISTINTAS (si compartieran id, una pisaría a la otra). Sin medium se
 * mantiene el id histórico `usr-{org}-{source}` (compat con las reglas ya creadas).
 */
export function userRuleId(orgId: string, source: string, medium?: string | null): string {
  const src = slugify(source);
  if (medium == null) return `usr-${orgId}-${src}`; // source-only (histórico)
  // medium provisto (incluso '' = sin utm_medium): segmento propio para no colisionar.
  return `usr-${orgId}-${src}--m-${slugify(medium) || "directo"}`;
}

/**
 * Valida + normaliza el input del usuario en una `ChannelRule` de la org.
 * source se guarda en minúscula (así matchea `source_raw`, que ya es lower).
 * El canal se guarda tal cual lo escribió el usuario (su nombre, su decisión).
 */
export function buildUserChannelRule(input: UserRuleInput): ChannelRule {
  const source = input.source?.trim().toLowerCase() ?? "";
  const channel = input.channel?.trim() ?? "";
  // medium: null/undefined = NO provisto (regla source-only); string (incluso '')
  // = provisto (regla source+medium, agarra solo esa variante).
  const mediumProvided = input.medium != null;
  const medium = (input.medium ?? "").trim().toLowerCase();
  if (!input.organizationId) throw new UserRuleError("organizationId requerido");
  if (!source) throw new UserRuleError("source requerido");
  if (!channel) throw new UserRuleError("channel requerido");
  if (source.length > MAX_LEN) throw new UserRuleError("source demasiado largo");
  if (channel.length > MAX_LEN) throw new UserRuleError("channel demasiado largo");
  if (medium.length > MAX_LEN) throw new UserRuleError("medium demasiado largo");

  const rule: ChannelRule = {
    id: userRuleId(input.organizationId, source, mediumProvided ? medium : null),
    organizationId: input.organizationId,
    // Menor prioridad numérica que las globales default (10-90) para que la
    // decisión del usuario GANE sobre cualquier sugerencia nuestra. Además el
    // orden org-first del store ya prioriza las de la org.
    priority: 5,
    source: { match: "exact", pattern: source },
    channel,
  };
  // Regla más específica cuando el origen vino partido por medium (source+medium).
  if (mediumProvided) rule.medium = { match: "exact", pattern: medium };
  return rule;
}
