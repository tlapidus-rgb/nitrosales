---
name: ad-copy
description: Escribe copy para anuncios pagos de NitroSales — Meta (feed, reel, carrousel), Google (search + YouTube), LinkedIn. Usala cuando Tomy pida "armame copy para un anuncio", "dame 5 variantes de ad en Meta", "hook para un reel", "google search ad para 'atribución ecommerce'", o cuando haya que producir copy de performance. Entrega hooks, headlines, primary text, descriptions y CTAs en voz NitroSales, ajustados al canal, con variantes para A/B. No inventa métricas.
---

# ad-copy

Produce copy publicitario listo para cargar en Meta Ads Manager, Google Ads o LinkedIn Campaign Manager. Optimiza para captura de atención en los primeros segundos / caracteres.

## Cuándo se dispara

- "Copy para anuncios en [canal]."
- "Dame variantes de ad."
- "Hook para un reel."
- "Google search ad para [keyword]."
- "LinkedIn sponsored para [vertical]."

## Proceso

1. Cargá `_CANON/positioning-canon.md` + `_CANON/brand-voice.md`.
2. Identificá canal y formato.
3. Definí con Tomy:
   - ¿A qué audiencia? (fundadores VTEX, fundadores ML-only, analistas, etc.)
   - ¿Qué objetivo? (awareness, demo, instalación de pixel, descarga de recurso)
   - ¿A qué landing lleva?
4. Aplicá las reglas por canal (abajo).
5. Entregá **mínimo 5 variantes** por elemento (headlines, primary text, hooks).
6. Marcá una recomendada.

## Reglas por canal

### Meta (Facebook + Instagram)

**Feed estático**:
- Primary text: 125 caracteres visibles antes del "ver más". Lo crítico en los primeros 80.
- Headline: 40 caracteres. Una promesa.
- Description: 30 caracteres.
- Imagen con texto < 20% del área.

**Reel / video vertical**:
- Hook en el primer segundo (audio + visual).
- 3-7 segundos es el rango óptimo para retención.
- Problema → solución → CTA. En 15-30 segundos.
- El hook NO es una pregunta genérica. Es una afirmación concreta o un conflicto.

**Carrousel**:
- 3-5 slides.
- Slide 1 = hook (gancho).
- Slide 2-4 = desarrollo (un pilar por slide).
- Slide 5 = CTA.

### Google Search

**Responsive search ads**:
- 15 headlines (30 caracteres cada uno).
- 4 descriptions (90 caracteres).
- Incluir keyword en al menos 3 headlines.
- Diferenciar variantes: 1 con número, 1 con pregunta, 1 con CTA, 1 con proof, 1 con objection kill.

### YouTube (TrueView / bumper)

**Bumper 6s**: 1 mensaje, 1 CTA visual.
**TrueView 15-30s**: hook en primeros 5s, valor en 15s, CTA en últimos 5s.

### LinkedIn

**Sponsored content**:
- Tono más sobrio que Meta.
- Audiencia: fundadores/operadores con criterio.
- Abrí con un insight o dato, no con una pregunta.
- CTA bajo ("Leer caso", "Descargar benchmark", "Solicitar demo").

## Principios de hook (primer segundo / primera línea)

Un hook fuerte hace una de estas tres cosas:

1. **Nombra al lector con precisión** ("Si tenés VTEX + MercadoLibre y no usás atribución propia, esto es para vos").
2. **Rompe una creencia común** ("El ROAS de Meta miente, y no es culpa de Meta").
3. **Muestra un outcome concreto** ("Esta marca bajó su CAC un 30% sin cambiar de agencia").

Un hook débil hace esto:
- Pregunta genérica ("¿Querés crecer tu ecommerce?").
- Saludo ("Hola marcas de Argentina").
- "Descubrí cómo..." / "Aprendé a..." → aburrido.

## Output format

```markdown
# Ad copy: [canal] — [contexto]

## Metadata
- Canal: [Meta feed / reel / carousel / Google search / YouTube / LinkedIn]
- Audiencia: [...]
- Objetivo: [...]
- Landing: [URL]

---

## VARIANTES

### V1 — Ángulo "[nombre del ángulo, ej: dolor de planilla]"

**Hook / headline / primary text**: [...]
**Secondary**: [...]
**CTA**: [...]

### V2 — Ángulo "[otro]"
...

### V5 — Ángulo "[otro]"
...

---

## Recomendación
**Arrancar con V[N]** — razón en 1 línea.

## Qué testear
- Hook V1 vs V3 (diferente ángulo emocional).
- CTA "Ver la demo" vs "Hablemos 15 min".

## Nota para creativo
- Imagen sugerida: [...]
- Duración de reel: [...]
```

## Ejemplos de ángulos probados (para Meta)

### Ángulo 1 — Dolor específico de atribución

> "Meta te dice 10 ventas. Tu tienda registra 7. Tu Shopify dice 6. ¿Cuál es real? NitroPixel: una sola verdad, medida por vos."
> CTA: Ver NitroPixel

### Ángulo 2 — Fundador sobrepasado

> "Pasás los domingos armando planillas para entender qué pasó la semana. NitroSales arma el cerebro por vos."
> CTA: Probarlo hoy

### Ángulo 3 — LATAM-specific

> "Atribución que entiende pesos, dólares, IVA y MercadoLibre. No es Triple Whale. Es mejor para acá."
> CTA: Ver la demo

### Ángulo 4 — Creator economy

> "Tus creators venden más de lo que te dicen los cupones. Aura te muestra lo que pasa de verdad."
> CTA: Ver Aura

### Ángulo 5 — P&L real-time

> "Tu ROAS está lindo. Tu P&L está feo. Los dos son reales. NitroSales te muestra por qué."
> CTA: Ver Finanzas

## Anti-patrones

- Hook con "Revolucioná tu ecommerce" → instant scroll.
- Hook genérico de pregunta ("¿Querés vender más?") → débil.
- Copy que no encaja con el tono visual del creative.
- Promesas sin numbers específicos.
- Headlines con "Pro" / "Plus" / "AI" → jerga.
- CTAs largos ("Hacé clic aquí para agendar tu demo gratuita y sin compromiso") — usar el verbo solo.

## Qué no hacer en Meta

- No mencionar competidores por nombre en el ad (política de Meta + pelea de marca).
- No prometer resultados garantizados con números precisos ("te hacemos crecer 200%").
- No usar antes/después con data inventada.
- No apuntar a audiencias protegidas con claim sensibles.
