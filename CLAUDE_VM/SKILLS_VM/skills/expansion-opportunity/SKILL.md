---
name: expansion-opportunity
description: Identifica oportunidades de expandir la cuenta de un cliente existente — sumar activos no contratados, escalar a más usuarios, ampliar a otra entidad del mismo grupo, o subir de plan. Usala cuando Tomy pida "qué más le puedo vender a [cliente]", "expansion plan para [empresa]", "el cliente está saludable, dónde escalo", o cuando un cliente pase a verde sostenido. Genera análisis del cliente + oportunidades concretas + ángulo de propuesta + estimación de upsell. NO es venta agresiva — es valor adicional para clientes que ya creen en NitroSales.
---

# expansion-opportunity

Identifica expansion. La regla básica: a un cliente saludable se le puede ofrecer más valor; a uno tibio, no se le ofrece más, se le resuelve el actual.

## Cuándo se dispara

- "Qué más le puedo vender a [cliente]."
- "Expansion plan para [empresa]."
- "[Cliente] está verde sostenido, dónde escalamos."
- Antes de un QBR para preparar oportunidades.
- Cuando el cliente dice "tengo otro problema..." en una call.

## Pre-condiciones (no expandir si...)

❌ Health score < 75.
❌ Cliente con bug abierto > 30 días.
❌ Cliente que no completó onboarding.
❌ Cliente en proceso de cambio de equipo / champion.
❌ Cliente que se queja por precio actual.

✅ Si todas estas pasan, se puede explorar expansion.

## Tipos de expansion

### 1. Activos adicionales

Cliente tiene NitroPixel + Aurum, no tiene Bondly o Aura.

**Cómo detectar oportunidad**:
- ¿Su negocio tiene componente fuerte de retención? → Bondly.
- ¿Trabaja con creators? → Aura.
- ¿Vende mucho por catálogo / promos? → módulo Marketing.
- ¿Es multi-tienda / multi-marca? → escalar plan.

### 2. Escalado de usuarios / seats

Si el plan tiene límite de usuarios y agregaron equipo.

### 3. Expansion a otra entidad del grupo

Cliente es parte de un grupo (varias marcas). Solo NitroSales una.

**Detectar**:
- ¿En sus calls mencionan "nuestra otra marca / canal / región"?
- ¿Tienen razón social distinta para otra operación?

### 4. Upgrade de plan

Cliente está en plan básico → sube a plan medio o alto.

### 5. Servicios profesionales (si aplica)

Onboarding deep, custom integrations, consultoría — solo si tenemos esa unidad de negocio.

## Proceso

1. Cargá `health-score` del cliente. Si < 75, parar y atender salud primero.
2. Cargá QBRs anteriores + notas de calls.
3. Cargá su perfil ICP + activos contratados vs activos disponibles.
4. Identificá los gaps.
5. Cruzá con sus aha moments (lo que les funcionó).
6. Producí el análisis + propuesta.

## Output format

```markdown
# Expansion Opportunity — [Cliente]

## Metadata
- Cliente: [nombre]
- Tiempo como cliente: [meses]
- Plan actual: [activos contratados]
- Health score: [X/100] — debe ser ≥ 75
- Last QBR: [fecha]

---

## Análisis del cliente

### Activos contratados hoy
- ✅ NitroPixel
- ✅ Aurum
- ❌ Bondly (no contratado)
- ❌ Aura (no contratado)
- ❌ Marketing module (no contratado)

### Adopción de los activos contratados
- NitroPixel: [alta / media / baja]
- Aurum: [alta / media / baja]

### Aha moments confirmados
- [insight 1 que les resonó]
- [insight 2]

### Contexto del negocio
- [datos relevantes: vertical, GMV, ad spend, equipo]

---

## Oportunidades detectadas

### Top 1 — [tipo de expansion] — [activo o plan sugerido]

**Por qué encaja**:
- [razón concreta basada en su negocio]
- [data específica que sustenta el caso]

**Cómo lo presentaríamos**:
> "[1-2 líneas de cómo lo abrimos en conversación]"

**Setup esperado**:
- Tiempo de implementación: [N días]
- Esfuerzo del cliente: [low / medium / high]
- Esfuerzo nuestro: [low / medium / high]

**Pricing estimado**:
- Adicional mensual: [ARS / USD X]
- Setup: [si aplica]

**Riesgo**:
- [qué puede ir mal en la conversación]

---

### Top 2 — [tipo] — [...]

[Misma estructura]

---

### Top 3 — [tipo] — [...]

[Misma estructura]

---

## Recomendación

**Empezar por Top [N]** — razón:
- [explicación de por qué este primero]
- [timing sugerido: en QBR / en próximo touch / esperar X meses]

## Cómo NO presentarlo

- ❌ "Te conviene sumar [X] porque vas a vender más" — débil.
- ❌ Mandar propuesta sin charla previa.
- ❌ En el mismo email donde aparece un bug abierto.
- ❌ Presentación tipo "upsell" — debe sentirse como aporte, no upsell.

## Cómo SÍ presentarlo

- ✅ "Mirando tu caso, hay algo que nos viene rondando. Te lo cuento en 15 min y vos decidís".
- ✅ Anclarlo en algo que ELLOS dijeron en una call previa.
- ✅ En contexto de QBR o post-aha moment positivo.
- ✅ Con cálculo de ROI específico para su data.

---

## Plan de ejecución

1. **Discovery interno** ([fecha]): confirmar señales con Tomy.
2. **Apertura del tema** ([fecha]): primer mensaje / call.
3. **Demo / propuesta** ([fecha]): formal.
4. **Cierre** ([fecha estimada]): firma del activo adicional.

---

## Métricas a trackear

- Time-to-value del nuevo activo: días hasta primer dato útil.
- Adoption rate (logins / queries) en primer mes.
- Impacto en health score (debería subir).
- Ratio de NRR (Net Revenue Retention) del cliente.

---

## Nota para Tomy
- [contexto sensible: relación, sensibilidades históricas, oportunidades que el cliente ya pidió]
```

## Principios

1. **Salud primero, expansion después**. Nunca expandir sobre un cliente tibio.
2. **Anclar en lo que YA les funcionó**. Expansion es continuación, no apuesta.
3. **Honestidad: si no les sirve, no proponer**. Mejor cliente saludable en plan chico que cliente forzado en plan grande.
4. **El timing es la mitad del éxito**. Un buen expansion en mal momento se siente upsell.

## Anti-patrones

- Proponer 3 cosas a la vez → confunde, parece desesperación.
- Expandir cuando recién resolviste un bug → suena oportunista.
- Bajar el activo contratado para "compensar" expansion → señal débil.
- Forzar al champion a "venderle al CFO" → mejor pedir directamente con el CFO.

## Conexión con otras skills

- **Input**: `health-score`, `qbr-generator`, notas de calls.
- **Output**: si avanza → `proposal-generator` para el activo adicional.

## NRR target

NitroSales tiene como NRR target 115-125% en el primer año de cohorte. Esto significa que un cliente promedio expande ~20% sobre lo que firmó originalmente, neto de churn parcial. Un portfolio sin expansion es un portfolio que se achica con el tiempo (por churn natural).
