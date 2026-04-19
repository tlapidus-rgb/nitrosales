---
name: blog-writer
description: Escribe posts de blog para nitrosales.com/blog — guías tácticas, tesis de opinión, casos de clientes, comparativas, aprendizajes. Usala cuando Tomy pida "armame el blog post de X", "escribime una guía de atribución en VTEX", "tesis sobre ROAS", "dump de aprendizaje sobre Y", o cuando haya que producir contenido largo (800-2000 palabras) con voz NitroSales. Entrega posts terminados con titular, intro, cuerpo estructurado, cierre y meta-descripción para SEO. No publica — solo produce.
---

# blog-writer

Escribe posts completos del blog NitroSales. Voz propia, ritmo, tesis clara, útil al lector.

## Cuándo se dispara

- "Blog post sobre [tema]."
- "Guía táctica de [X]."
- "Tesis sobre [topic]."
- "Caso anonimizado de [cliente]."
- "Dump de aprendizaje de [proyecto interno]."

## Proceso

1. Cargá `_CANON/positioning-canon.md` + `_CANON/brand-voice.md`.
2. Cargá docs del producto relevantes si el post es técnico (QUE_ES_CADA_PRODUCTO, SECCIONES_DEL_PRODUCTO, INTEGRACIONES).
3. Definí con Tomy:
   - Ángulo: ¿qué tesis o promesa tiene este post?
   - Audiencia primaria (fundador técnico / fundador no técnico / operador de marketing / analista)
   - Keyword objetivo (si hay SEO explícito) — sino, escribir para lector, no para Google.
4. Definí la estructura (ver "Tipos de post").
5. Escribí borrador.
6. Editá con el filtro de brand-voice + ritmo (ningún párrafo de más de 4 líneas).
7. Generá meta-descripción + slug.

## Tipos de post

### A. Guía táctica ("cómo hacer X")

**Objetivo**: el lector aprende algo específico que puede aplicar.

**Estructura**:
1. **Intro** (1-2 párrafos): el problema concreto que resolvemos. No filler.
2. **Contexto rápido** (1 párrafo): por qué esto importa ahora.
3. **Paso 1, 2, 3... (3-7 pasos)**: cada uno con subtítulo + explicación + ejemplo concreto.
4. **Errores comunes** (3-5 bullets): qué ver / qué evitar.
5. **Cierre**: qué esperar después de aplicar esto.
6. **CTA sutil**: link a producto / demo / recurso, pero el post debe servir aunque no cliqueen.

**Longitud**: 1200-2000 palabras.

### B. Tesis / opinión

**Objetivo**: plantar una postura. Defender una idea. Mover una conversación.

**Estructura**:
1. **Claim fuerte al inicio** (1 párrafo).
2. **Por qué la creencia común falla** (2-3 párrafos).
3. **El enfoque que proponemos** (2-3 párrafos).
4. **Implicancias** (1-2 párrafos): qué cambia si aceptás esto.
5. **Cierre**: pregunta al lector o llamado a iterar.

**Longitud**: 800-1200 palabras.

### C. Caso de cliente (anonimizado o con permiso)

**Objetivo**: mostrar un outcome específico + cómo se logró.

**Estructura**:
1. **Situación inicial** (1-2 párrafos): contexto del cliente, dolor antes.
2. **Lo que probamos** (2-3 párrafos): qué hicimos, qué activos aplicamos.
3. **Resultados** (2 párrafos con números): con lo más honesto que tengamos.
4. **Aprendizajes** (1-2 párrafos): qué se llevó el cliente + qué nos llevamos nosotros.
5. **Cierre**: qué tipo de marca tendría un outcome similar.

**Longitud**: 1000-1500 palabras.

### D. Comparativa / enfoque

**Objetivo**: ayudar al lector a elegir entre alternativas (sin ataque directo a competidores).

**Estructura**:
1. **El debate** (2 párrafos): dos o tres enfoques posibles.
2. **Ventajas y limitaciones de cada uno** (1 sección por enfoque).
3. **Cuándo conviene cada uno** (1 sección).
4. **Cierre**: recomendación según contexto del lector.

### E. Dump de aprendizaje (learning in public)

**Objetivo**: contar algo que hicimos internamente, qué aprendimos, qué rompimos.

**Estructura**:
1. **Qué intentamos** (1 párrafo).
2. **Por qué nos importó** (1 párrafo).
3. **Cómo lo construimos** (2-4 párrafos).
4. **Qué falló** (2 párrafos) — honestidad crítica.
5. **Qué funcionó** (2 párrafos).
6. **Qué cambia ahora** (1 párrafo).

**Longitud**: 1500-2500 palabras.

## Output format

```markdown
# [Título del post]

> Meta descripción (155 chars max): [...]
> Slug: /[slug-con-guiones]
> Tipo: [guía táctica / tesis / caso / comparativa / dump]
> Keyword objetivo (si aplica): [...]
> Palabras estimadas: [...]

---

## Intro

[párrafo 1]

[párrafo 2, si aplica]

---

## [Sección 1 según tipo]

[contenido]

## [Sección 2]

[contenido]

...

## Cierre

[párrafo final]

---

**Nota editorial** (no se publica):
- [qué NO se mencionó y por qué]
- [qué se puede medir / amplificar con este post]
- [ideas derivadas para social / newsletter]
```

## Reglas de estilo (sobre brand-voice)

1. **Títulos concretos, no clickbait**. "Cómo medimos atribución con 3 canales y 2 monedas" > "Este truco va a cambiar tu ecommerce".
2. **Párrafos cortos**. 3-5 líneas máximo. Blancos generosos.
3. **Subtítulos con alma**. No "Introducción" / "Conclusión" — usar frases ("Lo que aprendimos de 60k órdenes").
4. **1 idea por párrafo**. Si hay dos, partilo.
5. **Un caso o dato cada 300 palabras**. Nada de abstracción pura.
6. **Cierre sin "En conclusión"**. Cerrá con una pregunta, una afirmación contundente, o un link a acción.

## Anti-patrones

- Intro de "En los últimos años, el ecommerce ha crecido..." → delete. Empezá por el dolor.
- Listas de 10 tips superficiales → prefiero 3 profundos.
- "Somos la plataforma líder de..." en el medio de un blog → destroza la autoridad.
- Insertar el producto cada 2 párrafos. 1-2 menciones en todo el post, máximo.
- Cliché de imagen con stock photo de "persona mirando pantalla".

## SEO mínimo (sin venderse al algoritmo)

- Keyword principal en título + H1 + 1 subtítulo + 1 primera línea.
- Alt text de imágenes con keyword secundaria.
- Meta-descripción única y legible.
- Link interno a 2-3 otros posts del blog.
- Link externo a 1-2 fuentes creíbles.

## Regla de oro

Un post de NitroSales debería poder leerse en voz alta en una charla técnica a founders LATAM y no sentirse fuera de lugar.
