---
name: landing-copy
description: Escribe copy completo para landing pages de NitroSales (home, páginas de activo, páginas de vertical, páginas de comparación). Usala cuando Tomy pida "armame la landing de X", "escribime el hero de Aura", "necesito copy para la página de /vtex", "revisá este landing", o cuando haya que producir o iterar copy que va a vivir en nitrosales.com. Entrega hero + subhero + secciones (problema, solución, prueba social, features, FAQ, CTA) en voz NitroSales, con ritmo, contraste y la promesa canónica. No inventa features ni números.
---

# landing-copy

Produce copy de landing page terminado, estructurado, listo para pasar a Cursor. No hace diseño, no hace wireframes — solo copy.

## Cuándo se dispara

- "Armame la landing de [X]."
- "Escribime el hero para [activo / vertical]."
- "Copy para la página /[algo]."
- "Revisá este landing."
- "Necesito variantes A/B del hero."

## Proceso

1. Cargá `_CANON/positioning-canon.md` y `_CANON/brand-voice.md`.
2. Cargá `CONOCIMIENTO_PRODUCTO/QUE_ES_CADA_PRODUCTO.md` si la landing es de un activo específico (NitroPixel / Aurum / Bondly / Aura).
3. Definí con Tomy (si no está claro):
   - ¿Qué tipo de landing es? (home / activo / vertical / comparación / feature)
   - ¿Quién la va a ver? (fundador frío / fundador warm / analista / C-level)
   - ¿Qué querés que haga el visitante? (agendar demo / leer caso / suscribirse)
4. Estructurá según el template (ver abajo).
5. Aplicá el filtro de `brand-voice` (palabras prohibidas, frases hechas).
6. Entregalo con anotaciones para diseño (qué imagen va dónde, qué screenshot, qué stat destacar).

## Estructura canónica de landing NitroSales

### Fold 1 — Hero (lo que se ve en 3 segundos)

- **Headline** (5-10 palabras). Una promesa concreta, no genérica.
- **Subhead** (15-25 palabras). Aclara a quién y cómo.
- **CTA primario** (2-3 palabras, verbo). "Ver la demo", "Empezar hoy".
- **Visual reference note**: qué mostrar (dashboard real, no mockup vacío).

### Fold 2 — Agitación del dolor

2-4 líneas mostrando que entendemos. No listas con tilde verde. Prosa corta.

> Ejemplo: "Vendés en VTEX y en ML. Tenés anuncios en Meta, en Google, y creators que postean. Al final del mes, mirás la planilla y no sabés si ganaste plata. Nos pasó también."

### Fold 3 — La promesa (el canon)

El one-liner + los 4 pilares en versión landing:

- Percepción
- Cognición
- Memoria viviente
- Verdad

Uno al lado del otro, cada uno con un micro-ejemplo.

### Fold 4 — Los 4 activos (NitroPixel, Aurum, Bondly, Aura)

Grid 2x2 o carrusel. Cada tarjeta:
- Nombre del activo
- 1 línea de qué hace
- 1 línea de qué resuelve
- CTA "Ver más" → página del activo

### Fold 5 — Las 5 secciones (Finanzas, Insights, Marketing, Segmentación, Marketplaces)

Lista visual. Mostrar que es un stack completo, no un feature.

### Fold 6 — Prueba social

- Testimonial de beta (si lo tenemos firmado).
- Logo bar (clientes actuales) — solo si hay mínimo 3 logos reales.
- Stat destacado ("X órdenes procesadas", "Y% de ROAS mejorado en cliente Z").

### Fold 7 — Diferenciador LATAM

Lo que no puede hacer Triple Whale. VTEX nativo, ML, AFIP, pesos, USD, BRL. Sin nombrar a Triple Whale directamente — mostrar nuestras capacidades.

### Fold 8 — FAQ (5-7 preguntas)

Preguntas reales que hacen los prospects:

1. ¿Cómo se integra?
2. ¿Cuánto tarda el setup?
3. ¿Qué plataformas soportan?
4. ¿Cuánto cuesta? (responder con honestidad, no "contactanos")
5. ¿Y mi data privada?
6. ¿Qué pasa si ya tengo Klaviyo / Tiendanube dashboard / Triple Whale?
7. ¿Atienden en español?

### Fold 9 — CTA final

Corto. Mismo CTA del hero + alternativa secundaria ("Hablar con Tomy" / "Ver una demo grabada").

## Output format

```markdown
# Landing: [nombre / path]

## Contexto
- Tipo: [home / activo / vertical / comparación]
- Audiencia principal: [...]
- Objetivo: [...]

---

## FOLD 1 — HERO

### Headline
[texto]

### Subhead
[texto]

### CTA primario
[verbo + objeto]

### Nota de diseño
[imagen / componente / screenshot]

---

## FOLD 2 — AGITACIÓN
[prosa, 2-4 líneas]

---

## FOLD 3 — PROMESA
...

[...seguir para cada fold...]

---

## Variantes a testear (A/B)
- Headline A: [...]
- Headline B: [...]

## Notas para Cursor (diseño)
- Componente hero usa fondo `gradient-nitro`.
- CTA secundario en hover muestra micro-animación tipo "pulse".
- ...
```

## Frases prohibidas en landing (además del brand-voice)

- "Revolucioná tu ecommerce."
- "La plataforma inteligente para..."
- "Todo en un solo lugar."
- "Sumate a [N] empresas..."
- "Agendá tu demo gratis sin compromiso." (redundante: demo ya implica gratis y sin compromiso).
- "Dashboard inteligente con IA."
- Cualquier cosa que diga "boost", "optimizá", "maximizá" suelta.

## Anti-patrones

- Hero sin número o sin diferenciador → genérico.
- Subhead que repite headline con otras palabras → desperdicio.
- CTAs como "Conocer más" → débiles.
- FAQ que evade preguntas sobre precio → desconfianza.
- Testimonial sin nombre / rol / empresa → inventado.

## Qué preguntar a Tomy antes de arrancar (si falta)

- Headline tiene que enfocar en qué pilar (o todos)?
- Hay número que podamos mostrar? (órdenes procesadas, ROAS, tiempo ahorrado)
- Este landing es para una vertical específica o general?
- ¿Qué CTA final? demo en vivo / demo asincrónica / chat de WhatsApp?
