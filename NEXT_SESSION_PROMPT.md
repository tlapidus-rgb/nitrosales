# NEXT_SESSION_PROMPT.md — Fase 8g-2: Integración Aurum con Rules Engine

> **Cómo usar este archivo**: copiás el contenido de la sección "Prompt para pegar" y lo mandás como primer mensaje en la próxima sesión. Claude va a leer automáticamente CLAUDE.md + CLAUDE_STATE.md + ERRORES_CLAUDE_NO_REPETIR.md + BACKLOG_PENDIENTES.md + MEMORY.md al arrancar (via ritual #2), así que no hace falta que le mandes esos archivos — solo el prompt específico de la fase que sigue.

---

## Prompt para pegar

```
Hola Claude. Sesión nueva.

Venimos de cerrar Sesión 50 donde implementamos Fase 8g-1 del sistema
de alertas personalizables. El motor de reglas (rules engine) está
vivo con 48 primitivas Tier 1 productivas + API CRUD en
/api/alerts/rules. La migración alert_rules + alert_rule_requests ya
fue ejecutada en prod (confirmada con ok:true).

Leé primero CLAUDE_STATE.md sección "Sesion 50" para tener el
contexto completo. También el PRIMITIVES_CATALOG.md en root del repo
(fuente de verdad del diseño).

**Tarea de esta sesión: Fase 8g-2 — Integración Aurum**

Objetivo: que yo pueda escribir en el chat de Aurum cosas como
"avisame si el runway baja de 3 meses" o "cada día a las 9am
mandame el resumen de ventas" y Aurum automáticamente:

1. Detecta intención de crear alerta
2. Matchea mi pedido con una de las 48 primitivas existentes usando
   el campo `naturalExamples` de cada primitiva + semantic matching
3. Extrae los parámetros que le di (ej: months=3, time=09:00)
4. Me confirma antes de crear la regla ("Voy a crear esta alerta:
   [resumen]. ¿Confirmás?")
5. POST a /api/alerts/rules con la primitiva + params
6. Si mi pedido no matchea con ninguna primitiva, guarda el pedido
   en alert_rule_requests con razonamiento y me dice "no puedo
   todavía hacer esa alerta exactamente, la dejé anotada en el
   backlog"

Arquitectura sugerida (alineamos antes de codear):
- Nueva "tool" en el sistema de Aurum: create_alert_rule(natural_text)
- La tool recibe texto libre, carga el catálogo (getPrimitives),
  hace matching (o bien por reglas deterministas sobre palabras
  clave + paramsSchema, o usando el modelo mismo en un sub-prompt
  que devuelve JSON con {primitiveKey, params, channels, schedule?})
- Retorna al chat un bloque "Propuesta de regla" visible para user
- User confirma → POST /api/alerts/rules
- User rechaza o corrige → Aurum ajusta y vuelve a proponer

Antes de codear, revisemos:
- La arquitectura actual de Aurum chat (dónde viven las tools, cómo
  se registran, cómo devuelven respuesta al stream)
- Si conviene mapping determinista (regex + heurísticas) o delegado
  al LLM mismo (más caro pero más flexible)
- Cómo mostramos la "Propuesta de regla" en UI del chat (card
  interactiva con botones Confirmar/Ajustar/Cancelar)

Si tenés dudas de scope antes de arrancar, preguntame multiple choice.
Si está claro, arrancá explorando el chat de Aurum y proponeme un
plan concreto con commits antes de codear.

Recordá: regla de autonomía. Avanzás solo en decisiones técnicas,
me preguntás solo cosas de producto/UX con trade-offs reales.
```

---

## Contexto técnico adicional (referencia para vos mientras codeás Fase 8g-2)

### Estado del rules engine (qué ya está hecho)

**Tablas DB activas:**
- `alert_rules`: id, organizationId, userId, name, type, primitiveKey, params JSONB, operator JSONB, schedule JSONB, channels[], cooldownMinutes, severity, enabled, lastFiredAt, nextFireAt
- `alert_rule_requests`: id, organizationId, userId, naturalRequest, reason, status ('pending'|'resolved'|'rejected')

**Primitivas Tier 1 disponibles (48 total):**
- Finanzas (8): runway, cash, burn, revenue, reportes diario/semanal
- Fiscal (4): vencimientos AFIP, Monotributo tope
- Orders (8): count, AOV, cancelaciones, pendientes pago/envío, reportes
- MercadoLibre (6): preguntas, reputation, claims, cancellation rate
- Ads (7): Meta + Google ROAS/CPA/spend + reportes
- Ops (15): Products stock, Aura payouts, Competencia precios, Sistema conexiones, Security logins + API keys

**Código existente que podés importar:**
```ts
import { listPrimitives, getPrimitive } from "@/lib/alerts/primitives";
import { getSessionUserId } from "@/lib/alerts/get-user-id";
import { getOrganizationId } from "@/lib/auth-guard";

// Catálogo completo
const all = listPrimitives();
// Por módulo
const finanzas = listPrimitives({ module: "finanzas" });
// Por tipo
const schedules = listPrimitives({ type: "schedule" });
// Buscar una específica
const runway = getPrimitive("finanzas.runway.below_months");
// runway.naturalExamples → array de strings para matching
// runway.paramsSchema → schema para validar params que Aurum extraiga
```

### Estado del chat de Aurum (qué tenés que explorar)

No conozco la arquitectura exacta del chat. Cosas que vas a tener que descubrir:

1. Dónde viven las rutas del chat (probable `/src/app/api/aurum/*` o `/src/app/api/chat/*`)
2. Cómo funciona el sistema de "tools" actual (si existe). Si no existe, vas a tener que diseñarlo.
3. Cómo se renderiza la respuesta del assistant en el frontend (streaming? bloques? markdown?)
4. Qué modelo se usa (Claude via Anthropic API probablemente)
5. Cómo se inyecta system prompt + tools

Archivos probables a leer para entender:
- `/src/app/(app)/chat/*` (UI del chat si /chat es la ruta)
- `/src/app/api/aurum/*` o `/src/app/api/chat/*` (endpoint del chat)
- `/src/lib/ai/*` o `/src/lib/aurum/*` si hay abstracciones
- Buscar `bot_chats` + `bot_messages` tables (sabemos que existen)
- Buscar `aurum_usage_logs` (existe per schema)

### Matching NL → primitiva: 2 approaches

**Approach A (determinista)**: regex + heurísticas sobre naturalExamples
- Pro: 0 costo extra, predecible, testeable
- Contra: frágil para variaciones no contempladas

**Approach B (LLM mapper)**: sub-prompt a Claude con catálogo + pedido → devuelve JSON
- Pro: flexible, escala bien con más primitivas, entiende sinónimos
- Contra: costo por cada creación de regla (~1 call de Sonnet)

**Approach híbrido recomendado**: primero A (si matchea con alta confianza → directo), fallback a B (si A no matchea → pedir al LLM). Mejor ratio costo/flexibilidad.

### Decisiones de producto que quizás te pregunte

1. ¿La "Propuesta de regla" es una UI interactiva dentro del mensaje (card con botones) o solo texto + "responde 'sí' para confirmar"?
2. ¿Aurum pide clarificación cuando faltan params, o asume defaults? (ej: user dice "avisame si baja el runway" sin número — ¿pregunta "¿cuántos meses?" o asume default=3?)
3. ¿Qué hacer con reglas duplicadas? (user ya tiene una rule de runway y crea otra igual — sobreescribir, crear duplicada, o warning?)
4. ¿Canal default cuando user no especifica? (in_app o in_app+email?)
5. ¿Aurum puede EDITAR o BORRAR reglas existentes desde el chat, o solo crear?

### Commits esperados Fase 8g-2 (3-4)

1. Exploración del chat de Aurum + diseño de la arquitectura de tools (si no existe)
2. Implementación del mapper NL → primitiva (approach híbrido)
3. Integración al chat con UI de "Propuesta de regla"
4. Manejo del backlog `alert_rule_requests` (cuando no mapea)

### Criterio de aceptación Fase 8g-2

Al terminar, yo debería poder escribir en el chat de Aurum:
- "avisame si el runway baja de 2 meses" → propone rule finanzas.runway.below_months params=2 → confirmo → creada
- "todos los lunes 9am mandame el resumen de ventas" → propone orders.report.weekly_summary schedule=weekly mon 09:00 → confirmo → creada
- "avisame cuando llueva en Buenos Aires" → responde "no puedo, lo anoté en backlog" → creada entrada en alert_rule_requests

---

## Migraciones pendientes para Fase 8g-2

Ninguna. Las tablas alert_rules + alert_rule_requests ya están creadas y el endpoint API está funcionando. Solo código + integración chat.

---

**Versión**: 1.0 (final Sesión 50)
**Fecha**: 2026-04-19
