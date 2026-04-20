// ═══════════════════════════════════════════════════════════════════
// alerts/aurum-tools.ts — Fase 8g-2
// ═══════════════════════════════════════════════════════════════════
// Tool definitions que se montan dentro del agente Aurum (chat) para
// permitir crear reglas de alertas desde lenguaje natural.
//
// 3 tools:
//   1. list_alert_primitives  — discovery (Aurum descubre qué primitivas hay)
//   2. create_alert_rule      — la creación real (con check de duplicado)
//   3. request_alert_primitive — backlog cuando no matchea ninguna
// ═══════════════════════════════════════════════════════════════════

import type Anthropic from "@anthropic-ai/sdk";

export type ToolDefinition = Anthropic.Tool;

export const ALERT_TOOL_NAMES = [
  "list_alert_primitives",
  "create_alert_rule",
  "request_alert_primitive",
] as const;

export type AlertToolName = (typeof ALERT_TOOL_NAMES)[number];

export function isAlertToolName(name: string): name is AlertToolName {
  return (ALERT_TOOL_NAMES as readonly string[]).includes(name);
}

export const ALERT_TOOLS: ToolDefinition[] = [
  {
    name: "list_alert_primitives",
    description:
      "Lista las primitivas (alertas pre-armadas) disponibles para crear reglas. Devuelve cada una con: key, type (condition|schedule|anomaly), module, label, description, paramsSchema, naturalExamples, defaults. USAR ANTES de proponer una regla — para descubrir qué primitivas existen y elegir la que mejor matchea con el pedido del usuario. Filtrá por module o type cuando puedas para reducir ruido.",
    input_schema: {
      type: "object" as const,
      properties: {
        module: {
          type: "string",
          description:
            "Filtra por módulo: finanzas, fiscal, orders, ml, ads, products, aura, competencia, sistema, security",
        },
        type: {
          type: "string",
          enum: ["condition", "schedule", "anomaly"],
          description:
            "Filtra por tipo. condition = se dispara cuando se cumple algo. schedule = report recurrente programado. anomaly = detección de outliers.",
        },
        query: {
          type: "string",
          description:
            "Búsqueda full-text dentro de label, description y naturalExamples. Útil cuando no sabés el module exacto.",
        },
      },
      required: [],
    },
  },
  {
    name: "create_alert_rule",
    description:
      "Crea una nueva regla de alerta para el usuario. Llamala SOLO después de haber confirmado el pedido con el usuario en el chat (mostrale la propuesta con primitiveKey + params + canales y esperá su 'sí'). Si ya existe una regla idéntica (mismo primitiveKey + mismos params), devuelve un error con la regla duplicada — surfaceá esa info al user y preguntale si querés crear otra igual (en cuyo caso pasá allowDuplicate=true) o cancelar.",
    input_schema: {
      type: "object" as const,
      properties: {
        primitiveKey: {
          type: "string",
          description:
            "La key exacta de la primitiva (ej: 'finanzas.runway.below_months'). Tiene que existir en el catálogo (usá list_alert_primitives primero).",
        },
        params: {
          type: "object",
          description:
            "Parámetros de la primitiva, deben matchear su paramsSchema. Ej: {months: 3} para finanzas.runway.below_months.",
        },
        name: {
          type: "string",
          description:
            "Nombre humano de la regla (ej: 'Runway crítico'). Si no se manda, se usa el label de la primitiva.",
        },
        channels: {
          type: "array",
          items: { type: "string" },
          description:
            "Canales de notificación. Default: in_app. Opciones: in_app, email (email NO está implementado todavía, viene en Fase 8g-3 — si el user pide email, avisale que lo configurás pero solo va a llegar in_app por ahora).",
        },
        schedule: {
          type: "object",
          description:
            "Para primitivas type='schedule': configuración de cuándo dispara. Shape: {frequency:'daily'|'weekly'|'monthly', time:'HH:MM', dayOfWeek?:0-6 (0=domingo), dayOfMonth?:1-31}.",
        },
        cooldownMinutes: {
          type: "number",
          description:
            "Minutos mínimos entre dos disparos de esta regla (anti-spam). Si no se manda, se usa el default de la primitiva.",
        },
        severity: {
          type: "string",
          enum: ["critical", "warning", "info"],
          description:
            "Nivel. Si no se manda, se usa el default de la primitiva.",
        },
        allowDuplicate: {
          type: "boolean",
          description:
            "Si true, ignora el check de duplicado y crea otra regla igual. Default false. Solo poner true si el user confirmó explícitamente que quiere otra igual.",
        },
      },
      required: ["primitiveKey"],
    },
  },
  {
    name: "request_alert_primitive",
    description:
      "Registra un pedido de alerta que NO se puede mapear a ninguna primitiva existente del catálogo. Lo guarda en backlog (alert_rule_requests) para que el equipo lo evalúe. USAR cuando: (1) el dato no existe en NitroSales (ej: clima), (2) la lógica es muy específica y no hay primitiva equivalente, (3) cross-section complejo no soportado todavía. Antes de llamar esta tool, intentá con list_alert_primitives + query libre. Si igual no matchea, llamá esta y respondele al user algo como 'No tengo esa todavía, lo anoté en el backlog'.",
    input_schema: {
      type: "object" as const,
      properties: {
        naturalRequest: {
          type: "string",
          description:
            "El pedido textual del usuario (lo más fiel posible al original).",
        },
        reason: {
          type: "string",
          description:
            "Tu razonamiento de por qué no matchea ninguna primitiva. Ej: 'El usuario pide alerta basada en clima, pero NitroSales no integra fuente meteorológica' o 'Pide cruce de ML + Meta no cubierto en Tier 1'.",
        },
      },
      required: ["naturalRequest", "reason"],
    },
  },
];

// ═══════════════════════════════════════════════════════════════════
// SYSTEM PROMPT EXTENSION — instrucciones a Aurum
// ═══════════════════════════════════════════════════════════════════
// Se concatena al BASE_SYSTEM_PROMPT_TAIL en /api/chat/route.ts.
export const ALERT_TOOLS_PROMPT = `

=== CREACIÓN DE ALERTAS (NUEVO) ===
Aparte de tus tools de análisis, tenés 3 tools especiales para crear reglas de alertas que el usuario quiere que NitroSales monitoree por él.

CUÁNDO ACTIVAR ESTE FLUJO: cuando el usuario use frases como:
- "avisame si...", "alertame cuando...", "mandame una alerta..."
- "todos los lunes 9am mandame...", "cada día...", "semanalmente..."
- "quiero que me notifiques...", "creá una regla para..."
- "monitoreá...", "vigilá si..."

FLUJO CONVERSACIONAL OBLIGATORIO (4 pasos):

0. **Calibración por preguntas (CRÍTICO)**: ANTES de llamar list_alert_primitives, detectá si el pedido tiene ambigüedades importantes que cambian la interpretación. Si las hay, **preguntale al user PRIMERO en lenguaje claro** (en un solo mensaje, ofreciéndole opciones binarias o múltiples cuando sea posible). NO inventes el criterio. Las ambigüedades más comunes son:
   - **Período de "resumen / reporte"**: si pide "mandame el resumen de ventas a las 9am", preguntá: "¿Querés el cierre del día anterior completo (24hs) o un resumen del día actual al momento del envío?". Misma lógica para semanal/mensual.
   - **Umbrales sin número**: si dice "avisame si bajan las ventas" o "alertame si sube el costo", preguntá cuál es el umbral concreto: "¿A partir de qué % de caída/suba querés que te avise? Ej: 20%, 30%, 50%".
   - **Comparativa implícita**: si dice "avisame si las cancelaciones están altas", preguntá contra qué comparar: vs el promedio de la última semana, vs el mismo día de la semana pasada, vs un % fijo absoluto.
   - **Scope del dato**: si dice "ventas" sin más, preguntá si incluye solo VTEX, solo MercadoLibre, o ambos canales sumados.
   - **Granularidad temporal**: si dice "todos los días" sin hora, preguntá la hora. Si dice "cada semana" sin día, preguntá qué día.
   - **Dirección del cambio**: si dice "avisame si el ROAS se mueve mucho", preguntá si es solo cuando baja, solo cuando sube, o cuando cambia en cualquier dirección.

   IMPORTANTE: NO preguntes cosas obvias del contexto (canal cuando ya está claro, hora cuando vino en el pedido). El objetivo es: cero sorpresas en lo que se va a crear. Mejor 1 pregunta extra que un reporte indebido durante semanas.

1. **Discovery**: una vez calibrado el pedido, llamá list_alert_primitives con el module más probable (ej: si pide "runway" → module="finanzas"). Mirá los naturalExamples + paramsSchema de cada primitiva candidata.
2. **Propuesta**: en tu respuesta de texto, mostrá al usuario la regla propuesta en formato claro:
   "Te voy a crear esta regla:
    • Qué: <descripción humana>
    • Parámetros: <key=value, key=value>
    • Canal: in-app (default)
    • Cooldown: <X minutos>
    ¿Confirmás?"
   Y esperá la confirmación del usuario en el siguiente turn (no llames create_alert_rule todavía).
3. **Creación**: cuando el user dice "sí" / "creala" / "dale", llamá create_alert_rule con los args que ya propusiste.

REGLAS IMPORTANTES:
- Default de canal: solo "in_app". El email se activa en Fase 8g-3, así que si el user pide email, decile "lo dejo configurado pero por ahora solo va a llegar en-app".
- Si faltan parámetros (ej: "avisame si baja el runway" sin número), preguntale ANTES de proponer. No inventes valores.
- Si create_alert_rule devuelve error de duplicado, surfaceá la info al user: "Ya tenés una regla así desde <fecha>. ¿Querés crear otra igual igual (raro), modificarla desde /alertas/reglas, o cancelar?". Si dice "creala igual", volvé a llamar con allowDuplicate=true.
- Si después de buscar con varios queries/modules no encontrás primitiva matcheable, llamá request_alert_primitive con el pedido del user + tu razonamiento. Y respondele "No tengo esa todavía, lo anoté en el backlog para que el equipo la evalúe".
- NUNCA inventes primitiveKeys que no salieron de list_alert_primitives.
- Si type='schedule', exigí time HH:MM válido. Para weekly también dayOfWeek (0-6, 0=domingo). Para monthly también dayOfMonth (1-31).
- Cuando termine la creación con éxito, terminá tu mensaje con un check verde y un recordatorio breve: "✓ Regla creada. Podés verla y editarla en /alertas/reglas."`;
