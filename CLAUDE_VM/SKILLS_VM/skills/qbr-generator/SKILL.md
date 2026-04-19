---
name: qbr-generator
description: Genera el QBR (Quarterly Business Review) de un cliente de NitroSales — reporte trimestral que revisa logros, insights descubiertos, problemas abiertos, KPIs del producto de ellos y próximos objetivos. Usala cuando Tomy pida "armame el QBR de [cliente]", "review trimestral", "review de 90 días", "reporte para el board del cliente", o en el calendario recurrente del cliente. Entrega documento completo listo para presentar en call + share con el cliente. Honesto: muestra lo bueno y lo que tenemos pendiente.
---

# qbr-generator

Genera QBRs. Es el ritual clave de customer success — el momento donde cliente + NitroSales se alinean cada 90 días.

## Cuándo se dispara

- "Armame el QBR de [cliente]."
- "Review trimestral de [empresa]."
- "Documento para el QBR de mañana."
- "Review de 90 días de [cliente]."
- En calendar recurrente trimestral por cada cliente.

## Qué es un QBR en NitroSales

- Se hace **trimestralmente** (cada 90 días desde kickoff).
- Es una **call de 60 min** con founder + stakeholders relevantes.
- Se acompaña de un **doc escrito** (15-20 páginas o slides).
- Cubre: **logros, data insights, issues abiertos, roadmap**, próximos 90 días.
- Es la oportunidad de **expandir** (nuevos activos) o **intervenir** si hay risk de churn.

## Estructura canónica del doc QBR

### 1. Portada
- Nombre cliente + período ([Q] [Año]) + fecha de emisión.
- Asistentes previstos de la call.

### 2. Resumen ejecutivo (1 slide / 1 página)
- 3-5 bullets de lo más importante del trimestre.
- "Estás en [verde / amarillo / rojo]".

### 3. Lo que logramos (this quarter)
- KPIs del cliente: revenue, ventas, ROAS, retention, etc. — trended trimestre vs anterior.
- Insights descubiertos en NitroSales que generaron acción.
- Features del producto adoptados.

### 4. Los números (data hard)
- Tabla o gráfico de los 5-7 KPIs principales.
- Período: Q actual vs Q anterior + variación YoY si hay.

### 5. Insights + casos concretos del trimestre
- "Encontramos X, decidiste Y, pasó Z."
- 3-5 ejemplos puntuales.

### 6. Issues abiertos
- Qué no terminamos de resolver.
- Bugs reportados + estado.
- Feature requests pending.

### 7. Roadmap NitroSales — qué viene
- Features que impactan a este cliente en los próximos 90 días.
- Nuevos activos que pueden sumar.

### 8. Próximos 90 días — plan conjunto
- Objetivos del cliente con NitroSales.
- Qué hacen ellos, qué hacemos nosotros.
- Fechas clave.

### 9. Preguntas abiertas para la call
- 3-5 preguntas para trabajar en conversación (no responder en el doc).

### 10. Apéndice
- Links a dashboards relevantes.
- Contactos.

## Proceso

1. Cargá toda la data del cliente del trimestre.
2. Cargá el QBR anterior si hay.
3. Cargá `health-score` + `expansion-opportunity` + notas de conversaciones recientes.
4. Identificá los 3-5 highlights del trimestre.
5. Identificá los 2-3 issues reales.
6. Armá el doc.
7. Preparate para la call (ver sección "La call").

## Output format (doc escrito)

```markdown
# QBR NitroSales × [Cliente] — [Q] [Año]

## Portada
- Cliente: [Nombre]
- Período cubierto: [fecha inicio] a [fecha fin]
- Fecha de emisión: [fecha]
- Próxima call: [fecha + hora]
- Asistentes esperados: [nombres + roles]

---

## Resumen ejecutivo

**Estado general**: 🟢 [verde] / 🟡 [amarillo] / 🔴 [rojo]

**5 puntos clave del trimestre**:

1. [Logro 1]
2. [Logro 2]
3. [Insight más impactante]
4. [Issue más relevante pendiente]
5. [Dirección para el próximo trimestre]

---

## Lo que logramos

### KPIs del cliente en NitroSales

| KPI | Q anterior | Q actual | Δ | Nota |
|---|---|---|---|---|
| Revenue total | ARS X | ARS Y | +Z% | [comentario] |
| ROAS promedio | X | Y | +Z% | ... |
| Ticket promedio | X | Y | +/- | ... |
| Órdenes unidades | X | Y | +/- | ... |
| Retention 30d | X% | Y% | +/- | ... |

### Insights descubiertos

**Insight 1**: [descripción]
- Cuándo: [semana]
- Qué hicieron: [acción tomada]
- Resultado: [outcome si hay]

**Insight 2**: ...

### Features del producto adoptados

- [Activo / feature]: nivel de uso.
- [Activo / feature]: nivel de uso.

---

## Los números (data hard)

[Gráficos o tablas de: revenue trend, ROAS trend, retention trend, breakdown por canal]

**Notas importantes**:
- [alertas de outliers]
- [eventos específicos que afectaron los números: Black Friday, cambio de precio, etc.]

---

## Issues abiertos

### Bugs / problemas técnicos

| ID | Issue | Reportado | Estado | ETA |
|---|---|---|---|---|
| BG-01 | [descripción] | [fecha] | [abierto/en proceso/resuelto] | [fecha] |

### Feature requests

| ID | Request | Prioridad | Roadmap |
|---|---|---|---|
| FR-01 | [descripción] | [A/B/C] | [Q+1 / Q+2 / backlog] |

---

## Roadmap NitroSales (próximos 90 días — relevante para vos)

1. **[Feature 1]** — [impacto para ellos]
2. **[Feature 2]** — [impacto]
3. **[Feature 3]** — [impacto]

---

## Próximos 90 días — plan conjunto

### Del lado de [cliente]
- [ ] [objetivo 1]
- [ ] [objetivo 2]
- [ ] [objetivo 3]

### Del lado de NitroSales
- [ ] [compromiso 1]
- [ ] [compromiso 2]

### Milestones / fechas clave
- [ ] [fecha] — [hito]
- [ ] [fecha] — [hito]

---

## Preguntas abiertas (para trabajar en la call)

1. [pregunta abierta 1]
2. [pregunta abierta 2]
3. [pregunta abierta 3]

---

## Apéndice

- Dashboard principal: [link]
- Contacto directo: Tomy — [WhatsApp / email]
- Link al QBR anterior: [link]
```

## La call de QBR (60 min)

### Agenda

| Min | Bloque |
|---|---|
| 0-5 | Saludo + encuadre |
| 5-15 | Recorrido de logros + números |
| 15-30 | Conversación sobre insights + issues |
| 30-45 | Próximos 90 días (plan conjunto) |
| 45-55 | Preguntas abiertas (Tomy listens) |
| 55-60 | Next steps concretos + compromisos |

### Tono

- **Colaborativo, no reporteril**. El doc es el soporte; la call es conversación.
- **Honesto sobre lo que falta**. Si había feature prometida y no salió, decir.
- **Escucha activa**. Traen 60% del valor ellos, 40% nosotros.

## Principios

1. **El QBR es un producto tangible**. Doc + call. No es solo "charla".
2. **Honestidad > pitching**. Si el trimestre fue flojo, decirlo. Evita churn silencioso.
3. **Data real, no proyecciones infladas**.
4. **Incluir al cliente en el plan**. No llegar con plan cerrado.

## Anti-patrones

- QBR que solo tiene nuestros avances, no los de ellos.
- Prometer features en roadmap que no están confirmados.
- Hacer QBR solo por compromiso sin conversación real.
- Copiar el QBR del trimestre anterior sin refresh de numbers.

## Conexión con otras skills

- **Upstream**: `health-score` + `expansion-opportunity` + `churn-risk-detector` dan la lectura inicial.
- **Downstream**: genera feature requests que van al backlog de producto. Genera commits para el próximo trimestre.
