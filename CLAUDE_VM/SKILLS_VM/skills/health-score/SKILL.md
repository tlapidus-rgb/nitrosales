---
name: health-score
description: Calcula el health score de un cliente activo de NitroSales — una métrica compuesta que mezcla uso del producto, engagement comercial, data quality y signals de satisfacción. Usala cuando Tomy pida "dame el health score de [cliente]", "cómo están los clientes esta semana", "health check de [X]", o como parte de la revisión semanal de pipeline. Produce un score (0-100) + clasificación (verde/amarillo/rojo) + drivers explicativos + recomendación de acción. No es machine-graded — se basa en signals claros y lógica transparente.
---

# health-score

Calcula un score de salud del cliente — verde, amarillo, rojo. Sirve para saber dónde enfocar esta semana. Se ejecuta por cliente o para el portfolio completo.

## Cuándo se dispara

- "Health score de [cliente]."
- "Dashboard de salud del portfolio."
- "Qué clientes están en amarillo / rojo."
- "Health check semanal."

## Framework de scoring (100 puntos max)

El health score se compone de **4 dimensiones**:

| Dimensión | Peso | Qué mide |
|---|---|---|
| Uso del producto | 30 | Frecuencia + profundidad de uso |
| Engagement comercial | 20 | Tono + responsiveness en WhatsApp/mail |
| Data quality | 20 | Integraciones estables + data fluyendo |
| Business outcomes | 30 | Su negocio va bien (correlaciona con NitroSales) |

### 1. Uso del producto (30 puntos)

| Señal | Puntos |
|---|---|
| Cliente ingresó > 15 días de los últimos 30 | 10 |
| Cliente usa ≥ 2 activos (NitroPixel + 1 más) | 10 |
| Cliente ha corrido ≥ 3 queries en Aurum este mes | 5 |
| Stakeholders secundarios activos (no solo founder) | 5 |

### 2. Engagement comercial (20 puntos)

| Señal | Puntos |
|---|---|
| Respondió al último mensaje en < 48h | 8 |
| Último contacto con Tomy ≤ 14 días | 6 |
| Participó del último QBR | 6 |

### 3. Data quality (20 puntos)

| Señal | Puntos |
|---|---|
| Todos los webhooks activos y sync estable | 8 |
| Sin discrepancias > 10% reportadas | 6 |
| Pixel firing en todas las páginas críticas | 6 |

### 4. Business outcomes (30 puntos)

| Señal | Puntos |
|---|---|
| Su revenue trending estable o up (últimas 4 semanas) | 10 |
| ROAS no se cayó > 20% | 5 |
| Retention (recompra) estable o up | 5 |
| Al menos 1 insight de NitroSales generó decisión accionada | 10 |

## Clasificación

| Score | Color | Significado |
|---|---|---|
| 80-100 | 🟢 Verde | Cliente saludable. Candidato para expansion. |
| 50-79 | 🟡 Amarillo | Atención. Hay señales mixtas. |
| 0-49 | 🔴 Rojo | Churn risk alto. Intervenir. |

## Proceso

1. Recolectá los signals de las 4 dimensiones (data del producto + logs comerciales).
2. Calculá score por dimensión.
3. Sumá → score total.
4. Asigná color.
5. Identificá los 2-3 drivers principales (qué baja / qué sube el score).
6. Proponé acción.

## Output format (por cliente)

```markdown
# Health Score — [Cliente]

## Metadata
- Cliente: [nombre]
- Plan contratado: [activos]
- Kickoff: [fecha]
- Tiempo como cliente: [meses]
- QBR más reciente: [fecha]

---

## Score total: **[X]/100** — [🟢 / 🟡 / 🔴]

## Breakdown por dimensión

| Dimensión | Score | / Max |
|---|---|---|
| Uso del producto | [X] | 30 |
| Engagement comercial | [X] | 20 |
| Data quality | [X] | 20 |
| Business outcomes | [X] | 30 |

---

## Drivers principales

### Lo que sube el score
- ✅ [signal positivo 1]
- ✅ [signal positivo 2]

### Lo que baja el score
- ⚠️ [signal negativo 1]
- ⚠️ [signal negativo 2]

---

## Trend (últimos 3 meses)

- Hace 3 meses: [score]
- Hace 2 meses: [score]
- Hace 1 mes: [score]
- Hoy: [score]

Direction: [mejorando / estable / empeorando]

---

## Recomendación de acción

### Si VERDE
- ✅ Mantener cadencia actual.
- 🎯 Explorar expansion: `expansion-opportunity` skill.
- 🌟 Candidato para case study: `case-study-builder`.

### Si AMARILLO
- 👀 Micro-check esta semana (1 WhatsApp abierto).
- 🛠️ Resolver el driver principal negativo.
- 📅 Agendar call 30 min si persiste 2 semanas.

### Si ROJO
- 🚨 Alerta: disparar `churn-risk-detector`.
- 📞 Call 30 min en próximas 72h.
- 📝 Plan de recuperación documentado.

---

## Nota para Tomy
- [contexto adicional: lo que sabés del cliente, interacciones recientes, ocurrencias]
```

## Output format (portfolio)

```markdown
# Health Score — Portfolio NitroSales
## Semana del [fecha]

## Resumen

| Estado | Clientes |
|---|---|
| 🟢 Verde | [N] |
| 🟡 Amarillo | [N] |
| 🔴 Rojo | [N] |

Total activos: [N]

---

## Detalle

### 🟢 Verde ([N])

| Cliente | Score | Trend | Nota |
|---|---|---|---|
| [A] | 92 | ↑ | candidato expansion |
| [B] | 87 | → | sólido |

### 🟡 Amarillo ([N])

| Cliente | Score | Trend | Driver principal | Acción |
|---|---|---|---|---|
| [C] | 68 | ↓ | Sin login 10 días | WhatsApp nudge |

### 🔴 Rojo ([N])

| Cliente | Score | Trend | Motivo | Acción urgente |
|---|---|---|---|---|
| [D] | 42 | ↓↓ | 3 bugs abiertos + silencio | Call 72h |

---

## Acciones priorizadas de la semana

1. [Cliente rojo 1] — [acción]
2. [Cliente rojo 2] — [acción]
3. [Cliente amarillo 1] — [acción]

## Oportunidades de expansion

- [Cliente verde 1] — [qué activo adicional le puede servir]
- [Cliente verde 2] — [...]
```

## Principios

1. **Score transparente**. Cliente puede ver el score y entender por qué.
2. **Trend importa más que punto**. Un cliente de 90 bajando es peor que uno de 65 subiendo.
3. **No automatizar ciegamente**. El score es dirección — el juicio de Tomy prevalece.
4. **Revisar semanalmente el portfolio**.

## Anti-patrones

- Clasificar todos como "verde" por incomodidad → no tiene valor.
- Confundir uso alto con salud (un cliente puede usar mucho y estar insatisfecho).
- Ignorar trends (solo mirar el puntual).
- Subir el score cuando hay "buenos números" aunque haya señales rojas comerciales.

## Conexión con otras skills

- **Input**: data del producto + logs comerciales.
- **Output**:
  - Si ROJO → `churn-risk-detector`.
  - Si VERDE → `expansion-opportunity` + `case-study-builder`.
  - Feeds `qbr-generator`.

## Cadencia sugerida

- **Por cliente**: calcular al menos mensual (antes del pulse semanal).
- **Portfolio**: lunes de cada semana, antes del pipeline review.
- **Antes de QBR**: recalcular para tener score fresco.
