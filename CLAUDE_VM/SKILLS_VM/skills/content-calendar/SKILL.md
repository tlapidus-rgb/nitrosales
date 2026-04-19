---
name: content-calendar
description: Planifica el calendario editorial de NitroSales — ritmo mensual/trimestral de publicaciones en blog, newsletter (Nitroletter), LinkedIn de Tomy, Instagram/TikTok de marca y YouTube. Usala cuando Tomy pida "armame el calendario del mes", "qué publicamos esta semana", "necesito pipeline de contenido para Q2", "planificá los temas de la newsletter", o cuando haya que decidir qué escribir, cuándo y dónde. Produce un plan ordenado con temas, formatos, canales, fechas y responsable de ejecución (normalmente Claude VM), ligado a los 4 pilares del canon.
---

# content-calendar

Produce un calendario editorial estructurado. No escribe el contenido — eso es trabajo de `blog-writer`, `newsletter-writer`, `social-content`. Define el QUÉ, CUÁNDO y DÓNDE.

## Cuándo se dispara

- "Armame el calendario del mes."
- "Qué publicamos esta semana."
- "Planificá el contenido de Q[X]."
- "Distribuí estos 10 temas en un calendario."
- "Me quedé sin ideas, dame el plan de los próximos 30 días."

## Proceso

1. Cargá `_CANON/positioning-canon.md` (los 4 pilares son la base temática).
2. Cargá `CONOCIMIENTO_PRODUCTO/` para identificar features / actualizaciones que merecen contenido.
3. Definí con Tomy:
   - ¿Horizonte? (semana / mes / trimestre)
   - ¿Canales activos? (blog, newsletter, LinkedIn Tomy, Instagram, TikTok, YouTube)
   - ¿Tiene algún tema prioritario para esta ventana? (lanzamiento, caso, feature nueva)
   - ¿Capacidad de producción por semana? (cuántos activos de cuánto esfuerzo)
4. Armá el plan siguiendo la distribución canónica.
5. Entregalo en formato tabla + notas.

## Distribución canónica por pilar

Cada mes el calendario debe cubrir los 4 pilares, con énfasis variable. Default:

| Pilar | % del contenido |
|---|---|
| Percepción (atribución, data) | 30% |
| Cognición (insights, BI) | 20% |
| Memoria viviente (clientes, retención) | 25% |
| Verdad (P&L, honestidad, operación) | 25% |

## Ritmo base (marca chica, ejecución sostenible)

| Canal | Ritmo | Formato típico |
|---|---|---|
| Blog (nitrosales.com/blog) | 2 posts/mes | 800-1500 palabras |
| Newsletter (Nitroletter) | 1/semana | 300-600 palabras |
| LinkedIn Tomy | 3-4/semana | post corto (150-300 palabras) |
| Instagram feed | 2-3/semana | carousel o imagen |
| Instagram reel | 1-2/semana | 15-45 segundos |
| TikTok | 1-2/semana | 15-45 segundos (reaprovechar reel) |
| YouTube | 1-2/mes | tutorial (3-7 min) o demo (15-30 min) |

## Tipos de contenido (recurrentes)

### Blog
- Guías tácticas ("Cómo medir atribución first-party en VTEX").
- Opinión / tesis ("Por qué el ROAS está muerto, y qué lo reemplaza").
- Casos de clientes (anonimizados o con permiso).
- Comparativas serias (no-vs-competidor-directo, sino "enfoques").
- Dumps de aprendizaje ("Qué aprendimos construyendo NitroPixel").

### Newsletter
- Ver skill `newsletter-writer`. 4 formatos base: insight + historia + 3-links + pregunta.

### LinkedIn Tomy
- Historia de fundador (qué construí, qué me pasó).
- Thread de aprendizajes (5-7 puntos).
- Opinión filosa (no polémica vacía, tesis real).
- Pregunta al ecosistema.
- Celebración / milestone.

### Instagram
- Carousel "frame por frame" de un insight.
- Reel "así se ve NitroSales en acción".
- Reel "este es el problema que resolvemos en 30 segundos".
- Post "detrás de escena" (humaniza el equipo).

### TikTok
- Duet / reacción a contenido del ecosistema ecommerce.
- Explainer rápido ("¿Qué es atribución first-party?").

### YouTube
- Tutorial técnico.
- Long-form demo.
- Entrevista con founder cliente.

## Output format

```markdown
# Calendario editorial NitroSales — [horizonte]

## Contexto
- Horizonte: [semana / mes / Q]
- Fecha desde → hasta: [...]
- Capacidad estimada: [N piezas/semana]
- Focos especiales: [lanzamientos, campañas, eventos]

## Distribución por pilar (check)
- Percepción: [N%]
- Cognición: [N%]
- Memoria viviente: [N%]
- Verdad: [N%]

---

## Plan detallado

### Semana 1 ([fechas])

| Día | Canal | Formato | Tema / titular | Pilar | Esfuerzo | Estado |
|---|---|---|---|---|---|---|
| Lun | LinkedIn Tomy | post | "Por qué medimos ROAS mal" | Percepción | bajo | pending |
| Mar | Instagram feed | carousel | "4 señales de que tu atribución está rota" | Percepción | medio | pending |
| ... | ... | ... | ... | ... | ... | ... |

### Semana 2 (...)
...

---

## Piezas pendientes de producción (backlog)

- [ ] Blog: "Guía completa de NitroPixel en VTEX" — Claude VM
- [ ] Caso: anonimizado de [beta actual] — pendiente permiso
- [ ] Reel: "Un día con Aurum" — requiere grabación

## Ideas frescas (para próximas vueltas)

- Dump "Qué no hace NitroSales y por qué" (honestidad).
- Entrevista con un CFO que sufrió planillas.
- "De Triple Whale a NitroSales: 3 marcas que migraron".

---

## Nota para Tomy
- [alertas de capacidad / riesgos / decisiones pendientes]
```

## Principios

1. **Sostenibilidad > ambición**. Mejor 2 piezas buenas/semana que 10 mediocres.
2. **Los 4 pilares SIEMPRE rotan**. No se hace 1 mes entero de solo Percepción.
3. **El calendario es un contrato, no un deseo**. Si no se va a publicar, no se pone en el calendar.
4. **Reaprovechamiento**. Un blog largo = 1 newsletter + 3 posts LinkedIn + 2 reels.

## Anti-patrones

- Plan de "1 post diario en 5 canales" → insostenible, calidad baja.
- Temas genéricos ("tendencias ecommerce 2026") → no aporta voz.
- Ignorar el pilar Verdad. Es el más incómodo de escribir pero el que más diferencia a NitroSales.
- Calendarios sin responsable asignado → no se ejecutan.
- Copiar calendarios de competidores USA.

## Qué preguntar a Tomy

- ¿Hay algún lanzamiento / milestone en la ventana que amerite tentpole?
- ¿Querés priorizar awareness (top-of-funnel) o conversion (bottom-of-funnel) este ciclo?
- ¿Qué pieza quedó inconclusa del ciclo anterior?
- ¿Hay algo del producto que deba comunicarse con urgencia?
