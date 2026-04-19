---
name: pricing-modeler
description: Calcula, simula y explica el pricing de NitroSales para un prospect o cliente. Usala cuando Tomy pida "calculame pricing para [empresa]", "armame el ejercicio de ROI", "qué le cobro a [X]", "explicá el pricing", "compara tiers", o cuando haya que transformar el input del cliente (GMV, equipo, activos) en una propuesta económica. Genera opciones con ROI, payback, comparativas entre tiers. NO inventa pricing — se apoya en `CONOCIMIENTO_PRODUCTO/PRECIOS.md` canónico. Si el pricing no está cerrado todavía, lo advierte y escala a Tomy.
---

# pricing-modeler

Modela pricing y ROI. Esta skill **depende de `PRECIOS.md`** que vive en el PKB de CONOCIMIENTO_PRODUCTO. Si el pricing no está cerrado por Tomy, **esta skill advierte y no inventa**.

## Cuándo se dispara

- "Calculame pricing para [empresa]."
- "Armame el ROI para [prospect]."
- "¿Qué le cobro a [X]?"
- "Comparame los tiers para este caso."
- "Explicá el pricing a un decisor."

## Pre-condición crítica

Esta skill **requiere** que `CONOCIMIENTO_PRODUCTO/PRECIOS.md` tenga pricing cerrado. Hoy, 2026-04, está en proceso de definición por Tomy.

**Comportamiento si pricing no está cerrado**:

```markdown
No puedo calcular pricing concreto porque PRECIOS.md aún no está cerrado.

Lo que sí puedo hacer:
1. Armar el modelo de ROI (qué ahorran + qué ganan con NitroSales) — eso es independiente del precio.
2. Preparar el contexto para cuando definas pricing.
3. Si me das un número tentativo, simulo el escenario.

¿Querés que avance con eso?
```

## Componentes del pricing (placeholder hasta confirmación)

Cuando pricing esté cerrado, la estructura canónica sería:

### Tiers (hipótesis, pending Tomy)

- **Starter** — activo base (NitroPixel + Insights).
- **Growth** — agrega 1-2 activos adicionales.
- **Scale** — stack completo (los 4 activos + todas las secciones).

### Variables que influyen el pricing

1. **GMV mensual del cliente**: el precio escala con volumen de transacciones procesadas.
2. **Cantidad de activos contratados**: más activos → upgrade de tier.
3. **Cantidad de usuarios / seats**: límite por tier.
4. **Cantidad de tiendas / marcas** (si aplica).
5. **Moneda**: ARS (doméstico AR) / USD (LATAM exUS) / BRL (Brasil).

### Setup fee

One-time, cubre onboarding + migración + configuración inicial.

### Ajustes posibles

- Descuentos pilot (primeros clientes): -20 a -50%.
- Anual prepaid: 2 meses bonus.
- Multi-entidad: -15% por entidad adicional.

## Modelo de ROI (independiente del pricing)

Este sí puede calcularse sin el pricing cerrado.

### Inputs del cliente

- GMV mensual (USD).
- Ad spend mensual (USD).
- ROAS actual declarado.
- Tamaño del equipo de marketing / data.
- Horas/mes que el equipo dedica a armar reportes.

### Ahorros potenciales (estimados)

1. **Tiempo en reportes**: 15-30h/mes de horas ahorradas × costo hora del equipo.
2. **Mejora de ROAS por mejor atribución**: +10-20% en ROAS real (conservador).
3. **Detección de margen erróneo**: ajustes de mix de productos (variable).
4. **Recuperación de customers (Bondly)**: +X% retention × LTV.

### Outputs del modelo

- Ahorro estimado mensual: USD [X].
- Payback del plan NitroSales: [N] meses.
- ROI en 12 meses: [X]%.

## Output format

```markdown
# Pricing + ROI — [Cliente]

## Metadata
- Cliente: [nombre]
- Estado del pricing: [CERRADO / HIPÓTESIS / PENDIENTE DE TOMY]
- Fecha: [...]

---

## Inputs del cliente

- GMV mensual: [USD X]
- Ad spend mensual: [USD X]
- ROAS actual: [X]
- Tamaño equipo marketing/data: [N personas]
- Horas/mes dedicadas a reportes: [N]

---

## Pricing propuesto

### Opción A — Tier [X]
- Precio mensual: [ARS/USD Y]
- Setup fee: [Z]
- Incluye: [...]
- No incluye: [...]

### Opción B — Tier [X']
[...]

---

## Modelo de ROI

### Ahorros estimados (conservadores)

| Ítem | Cálculo | Mensual (USD) |
|---|---|---|
| Horas/mes ahorradas en reportes | [Nh] × USD [X]/h | [X] |
| Mejora ROAS (+10%) | Ad spend × 10% | [X] |
| Detección de margen | Mix ajustado × impacto | [X] |
| Recuperación customer (Bondly) | [X] customers × LTV | [X] |
| **Total ahorro mensual** | | **[Y]** |

### Payback del plan

- Inversión mensual NitroSales: USD [Z]
- Ahorro mensual estimado: USD [Y]
- Payback: [Y/Z] meses

### ROI en 12 meses

- Ganancia proyectada anual: USD [12×Y - 12×Z]
- ROI: [(12Y - 12Z) / (12Z)] × 100%

---

## Cómo presentarlo al cliente

### Si es call 1-a-1
> "Mirá, te calculé el escenario con tus numbers. Te muestro 2 opciones y el payback de cada una. Si te hace sentido, vamos adelante."

### Si es email formal
Mandar tabla + resumen + invitar a 20 min para profundizar.

### Si es propuesta formal
Pasar a `proposal-generator` con estos inputs.

---

## Dudas frecuentes + respuestas

**"¿Por qué cuesta eso?"**
> "El precio refleja lo que se ahorra + lo que se gana. El payback del plan [X] suele ser [Y] meses. Después de eso, NitroSales es ganancia neta."

**"¿Y si mi GMV baja?"**
> "Tenés flexibilidad: podés downgradar de tier sin fee de salida con aviso de 30 días. No te encerramos."

**"¿Puedo probar antes de comprometerme?"**
> "Tenemos setup rápido (5-10 días) con primer piloto de 30 días. Si a los 30 días no te hace sentido, cancelás sin carga."

---

## Nota para Tomy
- [estado del pricing: ¿está cerrado? ¿pedimos confirmación?]
- [ajustes especiales que correspondan para este caso]
- [qué pide confirmar antes de mandar propuesta]
```

## Principios

1. **Nunca inventar pricing**. Siempre pedir confirmación a Tomy si hay ambigüedad.
2. **ROI honesto**. Los numbers de ahorro estimado son rangos conservadores.
3. **Payback < 6 meses** es el target. Si el payback es > 12 meses, algo está mal en el tier propuesto.
4. **Moneda correcta** según región.

## Anti-patrones

- ROI inflado con supuestos irreales ("con NitroSales tu ROAS sube 300%").
- Esconder setup fee.
- Mostrar precio sin contexto de valor.
- Cambiar pricing improvisado en call sin confirmar con Tomy.

## Conexión con otras skills

- **Input**: `PRECIOS.md` canónico del PKB.
- **Output**: alimenta `proposal-generator`, `objection-handler` (cuando hay objeción de precio).

## Estado actual (abril 2026)

Pricing está en construcción. Esta skill está **preparada pero en stand-by hasta que Tomy cierre `PRECIOS.md`**. Cuando eso pase, esta skill puede ejecutarse completa.

Mientras tanto, solo opera en el módulo de **ROI modeling** (que no depende del pricing absoluto).
