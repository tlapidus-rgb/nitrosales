---
name: pipeline-reviewer
description: Revisa el pipeline de ventas de NitroSales — qué oportunidades están hot, qué está estancado, qué requiere acción esta semana, qué está por cerrarse, qué descartar. Usala cuando Tomy pida "revisá el pipeline", "qué tengo que hacer con [X]", "cómo venimos de oportunidades", "identificame los stuck deals", "limpieza de pipeline", o en la reunión semanal de revisión. Produce diagnóstico deal-by-deal + plan de acción + pronóstico honesto. NO infla pipeline ni cuenta deals fantasma.
---

# pipeline-reviewer

Revisa el pipeline. Cruza realidad con wishful thinking. Propone acción por deal y mata los deals que están fantasmas.

## Cuándo se dispara

- "Revisá el pipeline."
- "Qué tengo que hacer con [X prospect]."
- "¿Cómo viene [empresa]?"
- "Limpieza del pipeline."
- "Forecast honesto del mes."
- Lunes / semanal: revisión recurrente.

## Etapas canónicas del pipeline NitroSales

| Etapa | Definición | % probabilidad base |
|---|---|---|
| 1. Lead | Inbound o outbound hecho, sin confirmar fit | 5% |
| 2. Discovery | Call de discovery hecha, fit validado | 15% |
| 3. Demo | Demo hecha, hay interés claro | 30% |
| 4. Propuesta enviada | Propuesta entregada, esperando feedback | 50% |
| 5. Negociación | Hay contrapropuesta / ajustes pedidos | 70% |
| 6. Cierre | Firma comprometida, pasando contrato | 90% |
| 7. Closed-Won | Firmado | 100% |
| 8. Closed-Lost | No avanzó | 0% |

## Proceso

1. Cargá pipeline actual (spreadsheet / CRM / Notion — donde viva).
2. Por cada deal activo:
   - Verificar etapa correcta.
   - Días en etapa actual (si >30 días en misma etapa → alerta).
   - Último contacto.
   - Próximo paso comprometido.
3. Categorizar en buckets.
4. Producir reporte + plan.

## Buckets del pipeline

### 🔥 Hot (acción esta semana)
- Propuesta enviada en últimos 14 días + respuesta esperada.
- Negociación en curso.
- Cierre acordado.

### 💨 Stuck (más de 30 días sin movimiento)
- Quedaron en demo sin siguiente paso.
- Propuesta enviada hace > 21 días sin feedback.
- Negociación con silencio > 14 días.
- Cierre post-poned > 30 días.

### 🧊 Cold (baja probabilidad, no-ghost)
- Dijeron "no es ahora, volvemos en [fecha]" — calendarizado.
- Prospect cambió de prioridad pero quedó abierto.

### 👻 Ghost (candidate para cerrar-lost)
- > 60 días sin respuesta.
- No respondió al último breakup del multi-touch.
- Cambio de empresa / rol del contacto sin handoff.

### 🆕 Fresh (< 14 días en pipeline)
- Leads recién ingresados.
- Discovery recién agendada.

## Output format

```markdown
# Pipeline Review — Semana del [fecha]

## Resumen

| Bucket | # deals | Valor ponderado (USD) |
|---|---|---|
| 🔥 Hot | [N] | [X] |
| 💨 Stuck | [N] | [X] |
| 🧊 Cold | [N] | [X] |
| 👻 Ghost | [N] | [X] |
| 🆕 Fresh | [N] | [X] |
| **Total activo** | [N] | [X] |

**Closed-Won este mes**: [N] deals / USD [X] de ARR nuevo.
**Closed-Lost este mes**: [N] deals.

---

## 🔥 Deals HOT (acción esta semana)

### 1. [Empresa]
- Etapa: [Propuesta / Negociación / Cierre]
- Días en etapa: [N]
- Último contacto: [fecha]
- Próximo paso: [qué]
- **Acción esta semana**: [qué hacer concreto]
- Valor: USD [X] ARR
- Probabilidad: [X]%

### 2. ...

---

## 💨 Deals STUCK (desbloquear o matar)

### 1. [Empresa]
- Etapa: [...]
- Tiempo estancado: [N] días
- Último contacto: [fecha]
- **Diagnóstico**: [por qué creemos que está stuck]
- **Opciones**:
  - Opción A: [reengagement específico]
  - Opción B: [matar y mover a closed-lost]
- **Recomendación**: [A o B]

### 2. ...

---

## 👻 Deals a CERRAR-LOST

### 1. [Empresa]
- Última actividad: [fecha]
- Motivo de descarte: [...]
- **Acción**: mover a closed-lost + mail corto de cierre digno.

### 2. ...

---

## 🧊 Deals en NURTURE (cold calendarizado)

| Empresa | Motivo | Próxima revisita |
|---|---|---|
| [X] | Esperando cierre fiscal | [fecha] |
| [Y] | Evaluando vs competidor | [fecha] |

---

## Forecast honesto

### Este mes
- Firmas probables (>60% prob): [N] deals / USD [X] MRR.
- Firmas posibles (30-60%): [N] deals / USD [X] MRR.
- Target del mes: USD [Y].
- Gap proyectado: USD [Y - X].

### Próximo mes (visibilidad parcial)
- Deals en stages early que podrían cerrar: [N].
- Estimado conservador: USD [X].

---

## Alertas

- ⚠️ [N]% del pipeline está stuck → señal de problema sistémico, no solo individual.
- ⚠️ Win rate del último mes: [X]% (vs [Y]% histórico).
- ⚠️ Tiempo promedio de demo → firma: [N] días (vs [M] ideal).

---

## Foco de la semana

1. [Prioridad 1] — [acción]
2. [Prioridad 2] — [acción]
3. [Prioridad 3] — [acción]

---

## Nota para Tomy
- [contexto adicional, oportunidades ocultas, red flags]
```

## Principios

1. **Forecast honesto > inflado**. Un pipeline "limpio" de USD 50k real es mejor que USD 500k fantasma.
2. **Stuck > 30 días = señal**. O avanzás, o matás. No hay limbo.
3. **Cada deal tiene próximo paso concreto**. Si no, no está en pipeline.
4. **Mata deals con dignidad**. Mail corto de cierre, no silencio.
5. **Probability × valor ponderado**, no valor bruto.

## Anti-patrones

- Mantener "deals zombies" para inflar pipeline visible.
- Probabilidad optimista ("este seguro firma") sin base.
- No distinguir entre stuck y ghost → mezcla peligrosa.
- Pipeline review sin plan de acción → no sirve.

## Red flags sistémicos

Si detectás alguno, alertar a Tomy:

- **> 40% del pipeline está stuck**: hay un problema de proceso, no individual.
- **Win rate < 15%**: hay un problema de ICP o de demo.
- **Sales cycle > 60 días promedio**: hay fricción que no estamos resolviendo.
- **Avg deal size bajando**: estamos ajustando precio para cerrar.

## Protocolo de cierre-lost

Cuando un deal pasa a closed-lost:

1. Mail corto de cierre al prospect ("cerramos acá, gracias, puerta abierta").
2. Nota en pipeline: **motivo real** (no solo "no respondió" — qué pasó).
3. Categoría del motivo: [ICP no encajó / precio / competidor / timing / fit técnico / otro].
4. Aprendizaje extraíble: ¿qué cambiamos en el proceso para evitar lost similar?

## Conexión con otras skills

- **Input**: pipeline manual + outputs de `discovery-prep`, `demo-script`, `proposal-generator`.
- **Output**: alimenta `sales-dashboard` con numbers consolidados.
