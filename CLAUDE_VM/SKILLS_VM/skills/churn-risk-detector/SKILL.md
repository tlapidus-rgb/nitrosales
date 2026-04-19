---
name: churn-risk-detector
description: Detecta señales tempranas de churn en clientes de NitroSales y produce el plan de intervención. Usala cuando un cliente pase a 🔴 rojo en `health-score`, cuando Tomy diga "se está por ir [cliente]", "veo a [X] flojo", "armame el plan de retención de [Y]", o preventivamente cada vez que haya señales tibias. Entrega diagnóstico (por qué se va), intervención concreta y criterio de cierre del caso (recuperado / perdido con aprendizaje). El objetivo no es retener a cualquier costo — es entender.
---

# churn-risk-detector

Detecta churn antes de que pase y diseña la intervención. Si va a pasar igual, al menos aprendemos.

## Cuándo se dispara

- Cliente pasó a 🔴 en `health-score`.
- Tomy detectó algo tibio en conversación.
- Cliente preguntó "cómo cancelo" o "qué opciones tengo".
- Cliente no respondió el último mensaje hace > 14 días.
- Se venció contrato y no confirmó renovación.
- Antes de un QBR con cliente que viene flojo.

## Señales de churn (watchlist)

### Señales tempranas (leves → amarillo)

- Reducción de login frequency (de diario a semanal).
- Menor tiempo de sesión.
- No abrió el último reporte que mandamos.
- Canceló la última call sin reagendar.
- Tono seco en WhatsApp (respuestas de 1 palabra).
- Cambio de champion (la persona que defendía NitroSales internamente se fue).

### Señales medias (amarillo → rojo)

- Bugs abiertos sin resolver > 30 días.
- Falta de engagement con features nuevas anunciadas.
- Mencionó que está evaluando alternativas.
- Stakeholders secundarios dejaron de ingresar.
- No asistió al último QBR.
- El founder delegó toda la interacción a alguien júnior sin empoderamiento.

### Señales tardías (rojo → churn casi seguro)

- Escribió "necesito hablar".
- Pregunta sobre cancelación, termination clauses.
- Pidió export de data.
- No pagó la última factura.
- Dejó de contestar WhatsApp por > 30 días.
- Notificó formalmente que "no renueva".

## Proceso de intervención

### Fase 1 — Diagnóstico (primeras 48h)

Objetivo: entender POR QUÉ el cliente está rojo. No asumir.

**Preguntas que el Claude VM investiga primero** (sin contactar al cliente todavía):

- Health score breakdown: ¿qué dimensión está baja?
- ¿Hubo bug / incidente reciente?
- ¿Hubo feature request ignorado?
- ¿Hubo cambio en su equipo (nuevo CMO, nuevo CFO)?
- ¿Su negocio va mal (unrelated a nosotros)?
- ¿Competidor agresivo los contactó?
- Review transcripts de calls recientes si existen.

### Fase 2 — Contact (próximas 72h)

Acción: **Tomy los llama directamente**. No email. No WhatsApp template.

**Apertura honesta**:
> "Hola [nombre]. Noté que algo cambió en los últimos [tiempo] y quería hablar directo. No te vengo a vender — vengo a entender. ¿Tenés 20 min esta semana?"

**En la call**:
- Escuchar mucho, hablar poco.
- Preguntas: "¿qué cambió?", "¿qué no está funcionando?", "¿qué esperabas que nosotros hicieramos?".
- No defensiva: si tienen razón, reconocerlo.

### Fase 3 — Plan de acción

Según lo que salga del diagnóstico + call, posibles caminos:

**Caso A — Issue resoluble**
- Problema técnico / feature faltante / bug.
- Acción: compromiso concreto con fecha + follow-up.

**Caso B — Issue de fit**
- Su negocio cambió y NitroSales ya no es el fit.
- Acción: ser honesto. Si hay otro producto que les conviene, mencionarlo. Si tiene sentido seguir con fit reducido, proponer plan más chico.

**Caso C — Issue de expectativas**
- Prometimos X, entregamos Y.
- Acción: reconocer gap. Proponer camino de recuperación concreto.

**Caso D — Issue de precio**
- Percepción de poco valor por el precio.
- Acción: revisar health score. Si usan poco → ajustar plan. Si usan mucho → mostrar ROI concreto.

**Caso E — Issue de champion**
- Se fue la persona que nos defendía.
- Acción: conseguir nuevo champion. QBR con stakeholder nuevo.

**Caso F — Issue de timing / contexto externo**
- Mercado, ronda fallida, reestructura interna.
- Acción: ver si hay flexibilidad contractual (pause, downgrade temporal).

### Fase 4 — Seguimiento

- Plan con fechas y owners.
- Check-in a los 7 y 14 días.
- Nuevo health score al mes.

### Fase 5 — Cierre del caso

**Si se recupera** (health score vuelve a amarillo/verde):
- Documentar qué lo recuperó.
- Case post-mortem positivo para replicar.

**Si se va igualmente**:
- Honrar la decisión.
- Exit interview: qué aprendemos.
- Export de data limpio.
- Mantener relación: "puerta abierta, buen cierre".

## Output format

```markdown
# Churn Risk Case — [Cliente]

## Metadata
- Fecha de apertura del caso: [...]
- Health score al momento: [X/100]
- Tipo de señal disparadora: [...]
- Riesgo estimado: [alto / medio / bajo]

---

## Diagnóstico preliminar

### Signals detectadas
- ⚠️ [signal 1]
- ⚠️ [signal 2]
- ⚠️ [signal 3]

### Hipótesis del motivo
1. [hipótesis más probable]
2. [hipótesis secundaria]

### Historial reciente (últimos 60 días)
- [eventos relevantes: bugs, calls, features, etc.]

---

## Plan de intervención

### Fase 1 — Investigación (ya hecha)
- [findings]

### Fase 2 — Contact
- [ ] Call agendada con [persona] para [fecha]
- [ ] Apertura + preguntas preparadas (ver arriba)

### Fase 3 — Acción según outcome de la call

**Si sale Caso [A/B/C/D/E/F]**:
- [acción concreta 1]
- [acción concreta 2]
- [compromiso con fecha]

---

## Seguimiento

- Check-in #1: [fecha + 7 días] — chequear avance
- Check-in #2: [fecha + 14 días] — nuevo health score
- Check-in #3: [fecha + 30 días] — cierre del caso

---

## Criterios de cierre

### Éxito
- Health score subió a [X].
- Cliente tomó acción esperada.
- Bug / issue resuelto.

### Fracaso (churn inevitable)
- Cliente confirma cancelación.
- No asiste / no responde después de [N] intentos.
- Plan de salida: export data + relación mantenida.

---

## Lecciones esperadas
[qué vamos a aprender de este caso independientemente del outcome]

## Nota para Tomy
- [alerta emocional: este cliente es personal, hay refer en juego, etc.]
- [riesgos de comunicación específicos]
```

## Principios

1. **El diagnóstico antes de la oferta**. No salir a bajar precio sin saber por qué se va.
2. **La honestidad retiene más que las promesas**.
3. **No retener a todo costo**. Si no somos el fit, acompañar la salida digna es mejor para la marca.
4. **Aprender siempre**. Cada churn tiene información — usarla.

## Anti-patrones

- Ofrecer descuento antes de diagnosticar → señal de debilidad.
- Asumir que el problema es feature → muchas veces es emocional / champion.
- Intervenir con template masivo (emails de "te extrañamos") → insulta al cliente.
- No cerrar el caso formalmente → queda en limbo.
- Negar la salida: "pero si te estás perdiendo X, Y, Z" → falta de respeto.

## Conexión con otras skills

- **Upstream**: `health-score` dispara cuando baja.
- **Downstream**:
  - Si hay issue técnico → coordinar con Claude de Producto.
  - Si hay issue de precio → `pricing-modeler`.
  - Si hay expansion posible post-recovery → `expansion-opportunity`.
  - Si churn se confirma → documentar en `HISTORIAL_CUSTOMERS` (para aprendizajes).

## Regla de oro

El cliente que se va igualmente, si lo tratás bien en la salida, te refiere a otro. El que se va mal, nunca vuelve y habla mal.
