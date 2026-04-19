---
name: aha-moment-tracker
description: Diseña y captura el "aha moment" de un cliente nuevo de NitroSales — ese insight específico de SU cuenta que no sabía antes y que cambia cómo mira su negocio. Usala cuando Tomy diga "encontrale el aha moment a [cliente]", "buscá el insight diferencial de [empresa]", "armame el wow para mostrarle a [X]", o durante la ventana día 10-20 del onboarding. Cruza la data del cliente, encuentra una verdad accionable y la entrega como un mini-reporte que el cliente nunca olvida. Es la skill que separa onboarding técnico de onboarding memorable.
---

# aha-moment-tracker

Encontrá el insight diferencial de un cliente. No es un dashboard genérico — es una verdad puntual sobre SU negocio que cambia cómo lo mira.

## Cuándo se dispara

- "Encontrale el aha moment a [cliente]."
- "Buscá un insight para mostrarle a [empresa]."
- "Armame el wow para [X] (onboarding semana 2)."
- "Está tibio el cliente, necesitamos un hit."

## Qué es un aha moment NitroSales

Un aha moment cumple los 4 criterios:

1. **Específico a su cuenta**, no genérico ("tu data muestra X").
2. **No-obvio para el cliente** — no es algo que ya sabía.
3. **Accionable** — implica una decisión o cambio concreto.
4. **Visible en NitroSales** y costoso de descubrir en otra herramienta.

## Ejemplos de aha moments reales (categorizados)

### De atribución (NitroPixel)

- "El 30% de tus 'ventas direct' en realidad son asistidas por creators (UGC tracked vs Meta tracked)."
- "Meta te atribuye 20% más conversiones de las reales — tu CAC efectivo es X, no Y."
- "Tu mejor canal por ROAS no es Meta — es email. Pero gastás 15x más en Meta."

### De P&L (Finanzas)

- "Tu producto top en volumen tiene margen de 8%. Tu producto #5 tiene margen de 35%. Estás apalancando lo equivocado."
- "Tu costo de ML fees + envío representa el 22% del ticket promedio — el doble del benchmark de tu vertical."
- "Cuando descontás IVA, tu margen real cae de 28% (que ves en tu plataforma) a 19%."

### De retención (Bondly)

- "El 40% de tus clientes ML no volvieron a comprar en 6 meses, cuando el benchmark es 55%. Eso son [N] clientes recuperables."
- "Tus mejores 100 clientes generaron el 38% de tu revenue pero recibieron 0 comunicación post-compra."
- "Tu ciclo de recompra promedio es de 47 días. Estás mandando emails recién a los 90."

### De marketplaces

- "ML te da el 35% del revenue pero el 60% de las disputas y devoluciones."
- "Tu listing top en ML tiene 4 veces más visitas que tu PDP en VTEX, pero menor conversión."

### De creators (Aura)

- "Tu top creator no es @[famoso], es @[micro] que generó 4x más conversión por dollar invertido."
- "El 60% de tus ventas atribuidas a creators vienen de 3 personas. El otro 40% se reparte entre 25."

## Proceso

1. Cargá toda la data del cliente que NitroSales ya capturó (post-validation del día 5-10).
2. Cargá benchmarks de su vertical (si los tenemos).
3. Corré 3-5 análisis "fishing" (buscando outliers, inconsistencias, contrastes).
4. Identificá el insight más fuerte (más impactante, más accionable, más memorable).
5. Producí el reporte de entrega.

## Búsquedas típicas (fishing)

### En atribución
- ¿Qué porcentaje de "direct" en realidad es asistido?
- ¿Cuál es el delta entre lo que dice Meta y lo que dice NitroPixel?
- ¿Hay canales sub-medidos? (email, organic, creators)

### En margen
- ¿Cuál es el margen real (con costos cargados) vs el visible?
- ¿Cuáles son los productos top en margen vs top en volumen?
- ¿Cómo cambia el margen por canal? (un mismo producto en VTEX vs ML)

### En retención
- ¿Qué % de clientes son one-time vs repeat?
- ¿Cuál es el LTV real?
- ¿Hay segmentos olvidados (alto valor + sin contacto)?

### En timing
- ¿Cuál es el día / hora de mayor conversión?
- ¿Cuándo abandonan más?

### En outliers
- ¿Hay productos / clientes / SKUs que se desvían >2σ del comportamiento promedio?

## Output format (reporte de aha moment)

```markdown
# Tu primer insight con NitroSales — [Cliente]

## TL;DR (1 línea)
[Insight punzante en 1 línea, ej: "Tu producto top en margen no es tu producto top en volumen."]

---

## El insight con números

[3-5 líneas de prosa. Numbers concretos. Sin jerga.]

**Visual sugerido**: [screenshot de qué pantalla / dashboard mostrar].

---

## Por qué importa

[2-3 líneas. ¿Qué cambia esto en cómo deberías mirar tu negocio?]

---

## La acción posible (3 opciones)

1. **Quick win (esta semana)**: [acción concreta]
2. **Test corto (2-4 semanas)**: [hipótesis a validar]
3. **Cambio estructural (1-3 meses)**: [decisión grande]

---

## Cómo seguir analizándolo

- En NitroSales podés profundizar acá: [link a la sección].
- Si querés ayuda con alguna acción, escribime.

---

## Bonus

Mientras armaba este reporte, encontré 2 cosas más que vale la pena revisar:

- [insight secundario 1, 1 línea]
- [insight secundario 2, 1 línea]

Te las dejo abiertas para charlar cuando quieras.

---

— Tomy
NitroSales
```

## Cómo entregar el aha moment

1. **Mail directo de Tomy al founder** (no automático — debe sentirse personal).
2. **Subject que enganche**: "Algo que encontré mirando tu cuenta esta semana".
3. **Body con el reporte completo** (formato arriba).
4. **Invitación a 15 min para comentarlo** (si ven valor → cierre del aha emocional).

## Principios

1. **Un aha moment, no diez**. Mejor un insight memorable que 5 datos sueltos.
2. **Específico siempre**. "Tu vertical anda mal" → no es aha. "Tu SKU [X] tiene 4 vueltas/año cuando los demás tienen 2" → sí.
3. **Honesto sobre incertidumbre**. Si el dato es "estimado", decirlo. No vender certeza falsa.
4. **Memorable > exhaustivo**. El cliente debería contarle a otros este insight.

## Anti-patrones

- "Tus ventas crecieron 12%". No es insight, es resumen.
- 5 insights apilados → ninguno memorable.
- Insights que requieren MBA para entender.
- Acciones genéricas ("optimizá tu funnel").
- Mandar el aha moment automatizado por sistema (debe ser manual).

## Cuándo NO entregar aha moment todavía

- Datos del cliente todavía no validaron (esperar Bloque 2 del onboarding).
- Cliente todavía no entendió el dashboard básico (esperar familiarización).
- Insights detectados son negativos en exceso → enviar después de algo positivo primero.

## Conexión con otras skills

- **Upstream**: `implementation-playbook` lo dispara en día 10-20.
- **Downstream**: `case-study-builder` puede usar el aha moment como base de un caso anonimizado.
