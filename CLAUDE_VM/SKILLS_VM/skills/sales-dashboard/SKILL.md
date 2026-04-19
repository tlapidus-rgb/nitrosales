---
name: sales-dashboard
description: Mantiene el dashboard ejecutivo de ventas y marketing de NitroSales — pipeline activo, MRR, ARR, CAC, LTV, NRR, % win, velocity, health portfolio, growth content. Usala cuando Tomy pida "dame el dashboard de esta semana", "cómo venimos", "estado del pipeline", "numbers del mes", "reporte ejecutivo", o cuando hay revisión semanal/mensual. Consolida data dispersa (pipeline manual, stripe / facturación, producto, analítica web, newsletter) en un reporte claro con alertas accionables. Actualiza el `CLAUDE_STATE_VM.md` con snapshots.
---

# sales-dashboard

Produce el reporte ejecutivo de ventas + marketing. Cadencia semanal / mensual. El objetivo: Tomy mira 5 minutos y sabe cómo viene el negocio.

## Cuándo se dispara

- "Dame el dashboard de esta semana."
- "Cómo venimos."
- "Numbers del mes."
- "Estado del pipeline."
- "Reporte ejecutivo."
- Lunes / primer día hábil del mes (recurring si se programa).

## Dimensiones canónicas a trackear

### 1. Pipeline comercial

| Métrica | Definición |
|---|---|
| Leads nuevos | Inbounds + outbounds tocados esta semana |
| Discoveries | # calls discovery realizadas |
| Demos | # demos realizadas |
| Propuestas enviadas | # proposals abiertas |
| Firmas del período | # clientes firmados |
| Pipeline valor ($) | Suma de oportunidades open × probabilidad ponderada |

### 2. Financieros

| Métrica | Definición |
|---|---|
| MRR | Monthly Recurring Revenue |
| ARR | Annual Recurring Revenue (MRR × 12) |
| Nuevo MRR del mes | MRR agregado por firmas nuevas |
| Churn MRR del mes | MRR perdido por cancelaciones |
| Expansion MRR | MRR agregado por expansion de clientes existentes |
| Net new MRR | (Nuevo + Expansion - Churn) |

### 3. Unit economics

| Métrica | Definición |
|---|---|
| CAC | Costo de adquisición de cliente (gastos S&M / clientes firmados) |
| LTV | Valor de vida del cliente (MRR × 1/churn rate) |
| LTV:CAC ratio | Target > 3x |
| Payback period | Meses para recuperar CAC |
| NRR | Net Revenue Retention del cohort anterior |

### 4. Velocity

| Métrica | Definición |
|---|---|
| Sales cycle length | Días promedio de primer contacto a firma |
| Win rate % | Firmas / propuestas enviadas |
| Avg deal size | ARR promedio por firma |

### 5. Portfolio salud

| Métrica | Definición |
|---|---|
| Clientes activos | Total firmados - churned |
| # verde / amarillo / rojo | Del `health-score` |
| NRR del trimestre | % retención de revenue |

### 6. Marketing / growth

| Métrica | Definición |
|---|---|
| Visitas únicas mes | Tráfico a nitrosales.com |
| Suscriptores newsletter | Total activos |
| Newsletter open rate | % del envío más reciente |
| LinkedIn followers (Tomy) | Seguidores founder brand |
| Inbound leads/mes | Leads vía formulario |
| Cost per lead inbound | S&M spend / inbound leads |

## Proceso

1. Recolectar data de fuentes:
   - Pipeline manual (spreadsheet o CRM).
   - Facturación (Stripe / banco / Xepelin / etc.).
   - `health-score` portfolio.
   - GA4 / analytics del sitio.
   - ESP (suscriptores + open rate).
   - LinkedIn (stats de Tomy).
2. Calcular métricas.
3. Comparar con período anterior (WoW, MoM).
4. Identificar alertas.
5. Producir reporte.

## Output format (reporte semanal)

```markdown
# Sales + Marketing Dashboard
## Semana del [fecha]

## TL;DR

[3-5 bullets de lo más importante]

---

## Pipeline comercial

| Métrica | Esta semana | Semana anterior | Δ |
|---|---|---|---|
| Leads nuevos | [N] | [N] | [+/-] |
| Discoveries | [N] | [N] | [+/-] |
| Demos | [N] | [N] | [+/-] |
| Propuestas enviadas | [N] | [N] | [+/-] |
| Firmas | [N] | [N] | [+/-] |
| Pipeline ponderado ($) | USD [X] | USD [Y] | [+/-%] |

### Oportunidades hot (top 5)

| Empresa | Etapa | Valor | Próximo paso | ETA firma |
|---|---|---|---|---|
| [A] | Propuesta | USD [X] | [...] | [fecha] |
| ... | ... | ... | ... | ... |

---

## Financieros

| Métrica | Actual | Target |
|---|---|---|
| MRR | USD [X] | USD [Y] |
| ARR | USD [X] | USD [Y] |
| Net new MRR del mes | USD [X] | USD [Y] |

---

## Unit economics

| Métrica | Actual | Target |
|---|---|---|
| CAC | USD [X] | < USD [Y] |
| LTV | USD [X] | — |
| LTV:CAC | [X]:1 | > 3:1 |
| Payback period | [X] meses | < [Y] meses |

---

## Portfolio salud

| Estado | # clientes | % |
|---|---|---|
| 🟢 Verde | [N] | [%] |
| 🟡 Amarillo | [N] | [%] |
| 🔴 Rojo | [N] | [%] |
| **Total activos** | [N] | 100% |

**NRR trailing 90d**: [X]%

### Acciones priorizadas (de clientes amarillo/rojo)
1. [Cliente] — [acción]
2. [Cliente] — [acción]

---

## Marketing / growth

| Métrica | Esta semana | WoW |
|---|---|---|
| Visitas sitio | [N] | [+/-] |
| Suscriptores newsletter | [N] | [+] |
| Newsletter open rate último envío | [X]% | — |
| Inbound leads | [N] | [+/-] |
| LinkedIn followers Tomy | [N] | [+] |

---

## 🚨 Alertas

- [alert 1 con severidad + acción]
- [alert 2]

## 🎯 Foco de la semana que viene

1. [...]
2. [...]
3. [...]

---

## Nota para Tomy
- [contexto adicional]
```

## Output format (reporte mensual)

Mismo formato pero con:
- Ventana de 1 mes (no semana).
- Comparación MoM (vs mes anterior).
- Comparación YoY si ya hay historial.
- Sección "highlights del mes" + "bajas del mes".
- Proyección a fin de trimestre / año.

## Principios

1. **Brevedad > exhaustividad**. Tomy lee 5 min.
2. **Números con contexto**. No "MRR = X" — "MRR = X, vs target Y, Δ Z%".
3. **Alertas accionables**. No "X bajó" — "X bajó por [causa], acción [Y]".
4. **Consistencia de definiciones**. Los numbers deben calcularse igual semana a semana.

## Anti-patrones

- Reporte de 15 páginas sin resumen.
- Numbers sin comparativa.
- Alertas vagas ("hay que revisar el pipeline").
- Mezclar data de ventas con data de producto indiscriminadamente.
- No actualizar definitions cuando la métrica cambia.

## Cadencia sugerida

- **Lunes 9am**: dashboard semanal.
- **1er día hábil del mes**: dashboard mensual.
- **Fin de trimestre**: dashboard trimestral (con proyección de Q siguiente).

## Fuentes de data (hoy, abril 2026)

- **Pipeline**: spreadsheet manual o Notion (Tomy mantiene).
- **MRR/ARR**: facturación directa (stripe o banco) + lista manual.
- **Health score**: skill `health-score` portfolio.
- **Web analytics**: GA4 de nitrosales.com.
- **Newsletter**: ESP (Klaviyo / Beehiiv / MailerLite — definir).
- **LinkedIn**: stats manuales o via API si conectamos.

## Conexión con otras skills

- **Input**: `health-score`, `pipeline-reviewer` (feeds del pipeline).
- **Output**: alimenta `HISTORIAL_SESIONES_VENTAS_MARKETING.md` con snapshots mensuales.
