// ═══════════════════════════════════════════════════════════════════
// alerts/aurum-handlers.ts — Fase 8g-2
// ═══════════════════════════════════════════════════════════════════
// Implementaciones de las 3 alert tools que usa el agente Aurum.
// Cada handler devuelve string formateado para que Claude lo lea.
// ═══════════════════════════════════════════════════════════════════

import { listPrimitives, getPrimitive } from "./primitives";
import { createAlertRuleCore, requestPrimitiveCore } from "./create-rule-core";
import type { AlertToolName } from "./aurum-tools";

export interface AlertToolContext {
  orgId: string;
  userId: string | null;
}

export async function executeAlertTool(
  name: AlertToolName,
  input: any,
  ctx: AlertToolContext
): Promise<string> {
  if (!ctx.userId) {
    return "ERROR: Usuario no autenticado o JWT viejo. Pedile al usuario que cierre sesión y vuelva a loguearse.";
  }
  switch (name) {
    case "list_alert_primitives":
      return await handleListPrimitives(input ?? {});
    case "create_alert_rule":
      return await handleCreateRule(ctx.orgId, ctx.userId, input ?? {});
    case "request_alert_primitive":
      return await handleRequestPrimitive(ctx.orgId, ctx.userId, input ?? {});
    default:
      return `ERROR: tool de alertas desconocida: ${name}`;
  }
}

// ── 1) list_alert_primitives ──
async function handleListPrimitives(input: {
  module?: string;
  type?: "condition" | "schedule" | "anomaly";
  query?: string;
}): Promise<string> {
  let list = listPrimitives({
    module: input.module,
    type: input.type,
  });

  // Filter by query (full-text simple sobre label/description/naturalExamples)
  if (input.query?.trim()) {
    const q = input.query.toLowerCase().trim();
    list = list.filter((p) => {
      const haystack = [
        p.label,
        p.description,
        p.key,
        ...(p.naturalExamples || []),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }

  if (list.length === 0) {
    return `No hay primitivas que matcheen los filtros (module=${input.module ?? "any"}, type=${input.type ?? "any"}, query=${input.query ?? "none"}).
Sugerencia: probá sin filtros, o con un module distinto. Módulos disponibles: finanzas, fiscal, orders, ml, ads, products, aura, competencia, sistema, security.
Si después de varios intentos no encontrás match, llamá request_alert_primitive con el pedido del user.`;
  }

  // Cap a 25 para no quemar tokens
  const truncated = list.length > 25;
  const shown = list.slice(0, 25);

  const rows = shown.map((p) => {
    const params = Object.entries(p.paramsSchema || {})
      .map(([k, def]) => {
        const required = def.required ? "*" : "";
        const def_ = def.default !== undefined ? `=${def.default}` : "";
        const range =
          def.min !== undefined || def.max !== undefined
            ? ` (${def.min ?? "-∞"}..${def.max ?? "∞"})`
            : "";
        return `${k}${required}${def_}: ${def.type}${range}`;
      })
      .join(", ");
    const examples = (p.naturalExamples || []).slice(0, 3).join(" | ");
    return `• key: ${p.key}
  type: ${p.type} | module: ${p.module}${p.submodule ? "/" + p.submodule : ""}
  label: ${p.label}
  desc: ${p.description}
  params: ${params || "(ninguno)"}
  defaults: severity=${p.defaultSeverity}, channels=[${p.defaultChannels.join(",")}], cooldown=${p.defaultCooldownMinutes}min
  ejemplos NL: ${examples || "(sin ejemplos)"}`;
  });

  const header = `Primitivas disponibles (${shown.length}${truncated ? ` de ${list.length}, truncado` : ""}):
`;
  const note = truncated
    ? `\n\nHAY ${list.length - 25} MÁS. Si no encontraste match, refiná con un query más específico o module más acotado.`
    : "";
  return header + rows.join("\n\n") + note;
}

// ── 2) create_alert_rule ──
async function handleCreateRule(
  orgId: string,
  userId: string,
  input: any
): Promise<string> {
  const result = await createAlertRuleCore(orgId, userId, {
    primitiveKey: input.primitiveKey,
    name: input.name,
    params: input.params ?? {},
    schedule: input.schedule,
    channels: input.channels,
    cooldownMinutes: input.cooldownMinutes,
    severity: input.severity,
    allowDuplicate: input.allowDuplicate === true,
  });

  if (result.ok) {
    const p = result.primitive;
    return `OK ✓ Regla creada con éxito.
- id: ${result.id}
- primitiva: ${p.key} (${p.label})
- type: ${p.type}
- params guardados: ${JSON.stringify(result.cleanedParams)}
- canales: [${(input.channels?.length ? input.channels : p.defaultChannels).join(", ")}]
- severity: ${input.severity ?? p.defaultSeverity}
- cooldown: ${input.cooldownMinutes ?? p.defaultCooldownMinutes} min
La regla ya está activa y va a evaluarse en el próximo ciclo del hub de alertas.
Decile al user: "Listo, regla creada ✓. Podés verla y editarla en /alertas/reglas."`;
  }

  // Caso duplicado
  if (result.duplicate) {
    const d = result.duplicate;
    return `DUPLICADO: ${result.error}
- id existente: ${d.id}
- nombre: ${d.name}
- estado: ${d.enabled ? "ACTIVA" : "deshabilitada"}
INSTRUCCIÓN: NO crees otra automáticamente. Decile al user: "Ya tenés una regla equivalente desde el ${new Date(
      d.createdAt
    ).toLocaleDateString("es-AR")}, ${
      d.enabled ? "y está activa" : "pero está deshabilitada"
    }. ¿Querés crear otra igual igual (no es habitual), modificarla desde /alertas/reglas, o cancelar?". Si confirma que quiere otra igual, volvé a llamar create_alert_rule con allowDuplicate=true.`;
  }

  // Caso error genérico
  return `ERROR al crear regla: ${result.error}
Si el error es por params inválidos, preguntale al user el dato faltante o corregilo. NO repitas la llamada con los mismos args.`;
}

// ── 3) request_alert_primitive ──
async function handleRequestPrimitive(
  orgId: string,
  userId: string,
  input: { naturalRequest?: string; reason?: string }
): Promise<string> {
  const naturalRequest = String(input.naturalRequest ?? "").trim();
  const reason = String(input.reason ?? "").trim();
  if (!naturalRequest || !reason) {
    return `ERROR: faltan campos. Necesito naturalRequest (pedido del user) y reason (por qué no matchea).`;
  }
  const result = await requestPrimitiveCore(orgId, userId, naturalRequest, reason);
  if (result.ok) {
    return `OK ✓ Pedido anotado en el backlog (id: ${result.id}).
Decile al user: "No tengo esa primitiva todavía, pero la anoté en el backlog para que el equipo la evalúe en próximas iteraciones. Razón técnica: ${reason}".`;
  }
  return `ERROR al guardar en backlog: ${result.error}. Decile al user que no pudiste registrarla y que la mencione en próximas conversaciones.`;
}
