---
name: multi-touch-sequence
description: Diseña secuencias de outbound multi-touch (3-7 toques) a través de distintos canales — email + LinkedIn + WhatsApp combinados con lógica y espaciado. Usala cuando Tomy pida "armame una secuencia de outreach para [vertical]", "cadena de 5 touches para prospects que no responden", "playbook de follow-up", o cuando haya que orquestar el ritmo completo de un outbound. Define qué mensaje va, por qué canal, con qué espaciado, con qué trigger de breakup. No es spam — es insistencia estratégica respetuosa.
---

# multi-touch-sequence

Diseña la cadencia completa de un outbound — primer touch + follow-ups + breakup — distribuida en múltiples canales. Convierte mensajes individuales (`personalized-outreach`) en una coreografía coherente.

## Cuándo se dispara

- "Armame una secuencia de outbound para [segmento]."
- "Cadena de 5 touches para prospects fríos."
- "Playbook de follow-up después del primer mensaje."
- "¿Cuándo mando el próximo?"
- "Protocolo de breakup."

## Proceso

1. Cargá canon + voice.
2. Definí con Tomy:
   - Segmento objetivo (vertical / ICP).
   - Tono (cold hard, warm intro, re-engage).
   - Canales disponibles.
   - Cantidad de touches.
3. Aplicá el framework (abajo).
4. Entregá secuencia con touches numerados, contenido base + reglas de salida.

## Framework canónico de secuencia

### Reglas generales

1. **Máximo 5-7 touches** total. Más = spam.
2. **Mínimo 2 canales distintos** para no depender de 1 sola bandeja.
3. **Espaciado crece con el tiempo**: primeros touches cada 2-3 días, últimos cada 5-7.
4. **Última vez significa última vez**. Si decimos "último mensaje", no volvemos a insistir 2 semanas después.
5. **Cada touch tiene un ángulo distinto**. Nada de "¿viste mi email?" como mensaje.
6. **Breakup = cierre digno**. Dejás la puerta abierta, no golpeás.

### Tipos de secuencia

### A. Cold standard (sin referido, sin interacción previa)

| # | Día | Canal | Tipo | Ángulo |
|---|---|---|---|---|
| 1 | D+0 | Email | First touch | Hook referencial + pitch corto + CTA |
| 2 | D+3 | LinkedIn DM | Connect + note | Referencia al email, tono suave |
| 3 | D+7 | Email | Valor sin pedir | Mandar recurso útil (caso, insight) — no pedir nada |
| 4 | D+12 | LinkedIn DM | Pregunta | Una pregunta específica sobre su operación |
| 5 | D+20 | Email | Breakup | "¿Sigo por acá?" honesto, con opt-out digno |

### B. Warm por referido

| # | Día | Canal | Tipo | Ángulo |
|---|---|---|---|---|
| 1 | D+0 | WhatsApp | Intro con referido | Menciona al referente, pitch corto |
| 2 | D+3 | Email | Formal + material | Si no respondió WA, mismo mensaje + info |
| 3 | D+8 | WhatsApp | Nudge | "Todo bien? Nada urgente" |
| 4 | D+15 | Email | Breakup | Honesto, con puerta abierta |

### C. Re-engagement (prospect frío 30+ días sin contacto)

| # | Día | Canal | Tipo | Ángulo |
|---|---|---|---|---|
| 1 | D+0 | Email | "Vuelvo" | Excusa honesta (feature nueva, caso, cambio) |
| 2 | D+5 | LinkedIn | Soft touch | Comentario genuino en un post reciente de ellos |
| 3 | D+10 | Email | Breakup clean | Cierra el ciclo |

### D. Post-demo sin cierre

| # | Día | Canal | Tipo | Ángulo |
|---|---|---|---|---|
| 1 | D+0 | Email | Resumen post-demo | Lo hablado + material + siguiente paso |
| 2 | D+3 | WhatsApp | Nudge | Si no hay respuesta, "¿todo bien?" |
| 3 | D+7 | Email | Valor + revival | Aporte nuevo (caso, dato, insight del producto) |
| 4 | D+12 | WhatsApp | Pregunta directa | "¿Qué te falta para decidir?" |
| 5 | D+20 | Email | Breakup | "Cerrás conmigo o retomamos en 3 meses?" |

### E. Evento-driven (post-evento o post-conexión fugaz)

| # | Día | Canal | Tipo | Ángulo |
|---|---|---|---|---|
| 1 | D+0 | LinkedIn DM | Connect post-evento | "Nos cruzamos en [evento]" |
| 2 | D+3 | Email | Formalizar | Pitch corto con gancho del evento |
| 3 | D+8 | LinkedIn | Valor | Recurso relacionado al evento |
| 4 | D+15 | Email | Breakup | Quedamos conectados |

## Output format

```markdown
# Secuencia: [nombre / segmento]

## Metadata
- Segmento objetivo: [...]
- Canales: [email / LinkedIn / WhatsApp]
- Touches: [N]
- Duración total: [D días]

---

## Overview (tabla)

| # | Día | Canal | Tipo | Ángulo | Acción si responde | Acción si ignora |
|---|---|---|---|---|---|---|
| 1 | D+0 | [...] | [...] | [...] | Pasa a "conversación" | Sigue al touch 2 |
| ... | ... | ... | ... | ... | ... | ... |

---

## Touch 1 — D+0 ([canal])

**Objetivo**: [qué queremos que haga]
**Ángulo**: [referencial / dolor / curiosidad]

**Plantilla**:

[Contenido del mensaje — con placeholders [Nombre], [empresa] claramente marcados]

**Variantes**: [si hay]

**Qué NO hacer en este touch**: [...]

---

## Touch 2 — D+3 ([canal])

[...]

---

## Reglas de salida

- Si responde en touch 1-3 → detener secuencia, pasar a `discovery-prep`.
- Si dice "no es el momento" → detener + agendar recordatorio en 3 meses.
- Si dice "sacame" → breakup inmediato + nunca volver a contactar.
- Si bounce de email → marcar lead como inválido + buscar otro contacto.

## KPI sugeridos por segmento

- % open rate por touch (benchmark: email 40%+, LinkedIn 60%+).
- % reply rate total de la secuencia (benchmark: 8-15% en cold, 25%+ en warm).
- Costo por reply (tiempo de Tomy × touches).

## Nota de ejecución

- No mandar touches los domingos.
- Lunes 9-11am + jueves 14-17h suelen ser ventanas fuertes.
- Evitar el día después de un feriado largo.

---

## Nota para Tomy
[alerta de qué chequear / qué ajustar con data real después del primer ciclo]
```

## Anti-patrones

- Secuencia con 10+ touches → spam + daña marca.
- Todos los touches por el mismo canal → depende de una sola bandeja.
- Touches idénticos en fondo ("¿viste mi email anterior?") → aburre.
- No tener breakup → deja al prospect en limbo, mala señal.
- Ignorar reglas de salida → seguir escribiendo después de "sacame" es faltarle el respeto.

## Principios éticos

- **Opt-out fácil siempre**. Incluso en WhatsApp: "Avisá si querés que no te escriba más".
- **No repetir el mismo punto 5 veces**. Cada touch debe agregar valor o ángulo.
- **La persistencia es hasta donde el respeto deja**.

## Conexión con otras skills

- **Inputs**: `prospect-list-builder`, `account-research`, `personalized-outreach`.
- **Output**: si el prospect entra en conversación, pasa a `discovery-prep` y `lead-qualifier`.
