// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════
// alerts/create-rule-core.ts — Fase 8g-2
// ═══════════════════════════════════════════════════════════════════
// Lógica reusable de creación de reglas extraída de /api/alerts/rules.
// Consumida desde:
//   - El POST handler del endpoint HTTP (Fase 8g-1)
//   - Los tools de Aurum (Fase 8g-2)
//
// Centraliza:
//   - Validación contra paramsSchema de la primitiva
//   - Detección de reglas duplicadas (mismo primitiveKey + mismos params)
//   - INSERT en alert_rules
//   - INSERT en alert_rule_requests (cuando NL no matchea ninguna primitiva)
// ═══════════════════════════════════════════════════════════════════

import { prisma } from "@/lib/db/client";
import { randomUUID } from "crypto";
import { getPrimitive } from "./primitives";
import { computeNextFireAt } from "./engine";
import type { PrimitiveDefinition } from "./primitives/types";

// ── Validación contra paramsSchema ──
// Devuelve { ok: true, params: cleaned } o { ok: false, error: string }
export function validateAndDefaultParams(
  primitive: PrimitiveDefinition,
  raw: Record<string, any>
): { ok: true; params: Record<string, any> } | { ok: false; error: string } {
  const out: Record<string, any> = {};
  for (const [key, def] of Object.entries(primitive.paramsSchema || {})) {
    let value = raw?.[key];

    if (value === undefined || value === null || value === "") {
      if (def.default !== undefined) {
        value = def.default;
      } else if (def.required) {
        return { ok: false, error: `Falta el parámetro requerido "${key}" (${def.label})` };
      } else {
        continue;
      }
    }

    // Type coercion + range check
    if (def.type === "number") {
      const n = Number(value);
      if (Number.isNaN(n)) {
        return { ok: false, error: `"${key}" debe ser número` };
      }
      if (def.min !== undefined && n < def.min) {
        return { ok: false, error: `"${key}" debe ser >= ${def.min}` };
      }
      if (def.max !== undefined && n > def.max) {
        return { ok: false, error: `"${key}" debe ser <= ${def.max}` };
      }
      value = n;
    } else if (def.type === "string") {
      value = String(value);
      if (def.options && def.options.length) {
        const allowed = def.options.map((o) => o.value);
        if (!allowed.includes(value)) {
          return { ok: false, error: `"${key}" debe ser uno de: ${allowed.join(", ")}` };
        }
      }
    } else if (def.type === "boolean") {
      value = Boolean(value);
    } else if (def.type === "array") {
      if (!Array.isArray(value)) {
        return { ok: false, error: `"${key}" debe ser array` };
      }
    }

    out[key] = value;
  }
  return { ok: true, params: out };
}

// ── Búsqueda de duplicado exacto ──
// Considera duplicado: mismo userId + organizationId + primitiveKey + mismo JSON de params.
// Devuelve la fila si existe, null si no.
export async function findDuplicateRule(
  orgId: string,
  userId: string,
  primitiveKey: string,
  params: Record<string, any>
): Promise<{ id: string; name: string; createdAt: Date; enabled: boolean } | null> {
  try {
    // Comparamos como JSON normalizado (claves ordenadas) para evitar falsos negativos
    const sortedParams = sortKeysDeep(params ?? {});
    const json = JSON.stringify(sortedParams);
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT "id", "name", "createdAt", "enabled"
         FROM "alert_rules"
        WHERE "organizationId" = $1
          AND "userId" = $2
          AND "primitiveKey" = $3
        ORDER BY "createdAt" DESC`,
      orgId,
      userId,
      primitiveKey
    );
    for (const row of rows) {
      const rowParams = row.params ?? {};
      // row.params ya viene como objeto JS (Postgres jsonb)
      const rowJson = JSON.stringify(sortKeysDeep(rowParams));
      if (rowJson === json) {
        return { id: row.id, name: row.name, createdAt: row.createdAt, enabled: row.enabled };
      }
    }
    return null;
  } catch {
    return null;
  }
}

function sortKeysDeep(obj: any): any {
  if (Array.isArray(obj)) return obj.map(sortKeysDeep);
  if (obj && typeof obj === "object") {
    const out: Record<string, any> = {};
    for (const k of Object.keys(obj).sort()) out[k] = sortKeysDeep(obj[k]);
    return out;
  }
  return obj;
}

// ── Creación core ──
export interface CreateRuleInput {
  primitiveKey: string;
  name?: string;
  params?: Record<string, any>;
  operator?: any;
  schedule?: any;
  channels?: string[];
  cooldownMinutes?: number;
  severity?: string;
  // Si true, ignora duplicados y crea igual. Default false.
  allowDuplicate?: boolean;
}

export type CreateRuleResult =
  | { ok: true; id: string; primitive: PrimitiveDefinition; cleanedParams: Record<string, any> }
  | { ok: false; error: string; duplicate?: { id: string; name: string; createdAt: Date; enabled: boolean } };

export async function createAlertRuleCore(
  orgId: string,
  userId: string,
  input: CreateRuleInput
): Promise<CreateRuleResult> {
  const primitiveKey = String(input.primitiveKey ?? "").trim();
  if (!primitiveKey) {
    return { ok: false, error: "primitiveKey requerido" };
  }
  const primitive = getPrimitive(primitiveKey);
  if (!primitive) {
    return { ok: false, error: `Primitiva desconocida: ${primitiveKey}` };
  }

  // Validar params contra schema
  const v = validateAndDefaultParams(primitive, input.params ?? {});
  if (!v.ok) return { ok: false, error: v.error };
  const cleanedParams = v.params;

  // Detectar duplicado (a menos que allowDuplicate)
  if (!input.allowDuplicate) {
    const dup = await findDuplicateRule(orgId, userId, primitiveKey, cleanedParams);
    if (dup) {
      return {
        ok: false,
        error: `Ya existe una regla equivalente (id: ${dup.id}, creada el ${new Date(
          dup.createdAt
        ).toLocaleString("es-AR")}, ${dup.enabled ? "activa" : "deshabilitada"})`,
        duplicate: dup,
      };
    }
  }

  // Defaults desde la primitiva
  const id = randomUUID();
  const name = String(input.name ?? primitive.label);
  const type = primitive.type;
  const operator = input.operator ?? null;
  const schedule = input.schedule ?? null;
  const channels = Array.isArray(input.channels) && input.channels.length
    ? input.channels
    : primitive.defaultChannels;
  const cooldown = Number(input.cooldownMinutes ?? primitive.defaultCooldownMinutes);
  const severity = String(input.severity ?? primitive.defaultSeverity);
  const nextFireAt = type === "schedule" ? computeNextFireAt(schedule) : null;

  await prisma.$executeRawUnsafe(
    `INSERT INTO "alert_rules"
        ("id", "organizationId", "userId", "name", "type", "primitiveKey",
         "params", "operator", "schedule", "channels", "cooldownMinutes",
         "severity", "enabled", "nextFireAt", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb,
             $10, $11, $12, TRUE, $13, NOW(), NOW())`,
    id,
    orgId,
    userId,
    name,
    type,
    primitiveKey,
    JSON.stringify(cleanedParams),
    operator ? JSON.stringify(operator) : null,
    schedule ? JSON.stringify(schedule) : null,
    channels,
    cooldown,
    severity,
    nextFireAt
  );

  return { ok: true, id, primitive, cleanedParams };
}

// ── Backlog: NL sin primitiva matcheable ──
export async function requestPrimitiveCore(
  orgId: string,
  userId: string,
  naturalRequest: string,
  reason: string
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!naturalRequest?.trim()) {
    return { ok: false, error: "naturalRequest vacío" };
  }
  try {
    const id = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO "alert_rule_requests"
        ("id", "organizationId", "userId", "naturalRequest", "reason", "status", "createdAt")
       VALUES ($1, $2, $3, $4, $5, 'pending', NOW())`,
      id,
      orgId,
      userId,
      naturalRequest.trim().slice(0, 2000),
      (reason ?? "").slice(0, 2000)
    );
    return { ok: true, id };
  } catch (error: any) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}
