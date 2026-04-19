---
name: prospect-list-builder
description: Construye listas de prospects para outbound de NitroSales — ICPs filtrados por vertical, plataforma, geografía, tamaño. Usala cuando Tomy pida "armame una lista de 50 marcas VTEX en Argentina de indumentaria", "buscá fundadores en LATAM con ML y creators", "lista de prospects para esta semana", o cuando haya que producir un target list accionable. Genera rows con empresa, URL, decisor probable, rationale de por qué entra, y ángulo de primer contacto. No inventa empresas ni contactos — si no existe info, lo marca como "pendiente de confirmar".
---

# prospect-list-builder

Produce listas de prospects accionables. No scrapea — trabaja sobre lo que Tomy puede aportar o lo que es públicamente observable.

## Cuándo se dispara

- "Armame una lista de [N] prospects [vertical / geo / plataforma]."
- "Lista para outbound de esta semana."
- "Target list para [evento / campaña]."
- "Buscá [criterios específicos]."

## Proceso

1. Cargá `icp-profiler` (la lista tiene que matchear ICP).
2. Cargá `positioning-canon` (para saber qué ángulo de contacto aplica).
3. Definí con Tomy:
   - ¿Cuántos prospects? (30 buenos > 200 mediocres)
   - ¿Qué criterios duros? (plataforma, vertical, geo, tamaño)
   - ¿Qué criterios blandos? (signal específico — ej: "levantaron ronda últimos 6 meses")
   - ¿Fuente principal de data? (manual de Tomy, LinkedIn, Meta Ad Library, lista conocida)
4. Generá lista con el formato abajo.
5. Marcá criterios faltantes como "pendiente".

## Criterios canónicos (heredar de ICP)

| Criterio | Default | Ajustable |
|---|---|---|
| Plataforma | VTEX + ML | Sí (Tiendanube, Shopify con caveat) |
| GMV estimado | USD 50k-1M/mes | Sí |
| Geo | Argentina + LATAM prioritario | Sí |
| Vertical | Juguetería, indumentaria, home, belleza, suplementos, electro | Sí |
| Tamaño equipo | 3-25 | Sí |
| Ad spend estimado | >USD 5k/mes | Sí |

## Fuentes públicas para construir

(Sin scrapeo con cuentas falsas ni violar TOS)

1. **Meta Ad Library**: ver quién está corriendo ads activos.
2. **BuiltWith / Wappalyzer**: detectar stack tech.
3. **LinkedIn Sales Navigator** (si Tomy tiene acceso): búsquedas avanzadas.
4. **Tiendas públicas de marketplaces**: ML tiene sellers públicos con tamaño.
5. **Directorios VTEX / Tiendanube**: partners list.
6. **Listas de eventos ecommerce**: sponsors, speakers, exhibitors.
7. **Similarweb**: tráfico web por dominio.
8. **Google Shopping**: quién está corriendo PMAX activo.
9. **TikTok Shop / Instagram Shop**: catálogos activos.
10. **Lists de rondas recientes**: Contxto, LAVCA news (LATAM).

## Output format (lista estándar)

```markdown
# Prospect list — [criterio principal]

## Metadata
- Fecha de armado: [fecha]
- Criterios duros: [plataforma, geo, vertical]
- Criterios blandos: [signals]
- Tamaño objetivo: [N]
- Fuente principal: [...]

---

| # | Empresa | URL | País | Plataforma | Vertical | Decisor probable | Dolor hipótesis | Ángulo de entrada | Fuente | Prioridad |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | [nombre] | [url] | AR | VTEX+ML | Indumentaria | [Nombre / LinkedIn] | atribución multi-canal | NitroPixel | MAL | A |
| 2 | ... | ... | ... | ... | ... | ... | ... | ... | ... | ... |

**Leyenda**
- Prioridad: A = calza perfecto, B = calza con ajustes, C = ICP borderline, vale tirar.
- Fuente: MAL (Meta Ad Library), BW (BuiltWith), LI (LinkedIn), MAN (manual de Tomy), OTR.
- Ángulo de entrada: qué pilar/activo tira primero en el primer contacto.

---

## Prospects destacados (top 5)

### 1. [Empresa]
- Por qué entra: [3 razones]
- Trigger detectado: [signal puntual]
- Primer mensaje sugerido: "[hook en 1 línea]"
- Decisor: [Nombre] — [LinkedIn URL] — [nota]

### 2. ...

---

## Prospects dudosos (pre-descartar o preguntar a Tomy)

| # | Empresa | Duda | Recomendación |
|---|---|---|---|
| X | [...] | No pude confirmar plataforma | Preguntar a Tomy si sabe |
| Y | [...] | Parece grande (50+) | Revisar si tienen stack propio |

---

## Gaps de información

- [ ] No pude confirmar GMV de [N] empresas — necesitaríamos Similarweb o data propia.
- [ ] [N] empresas no tienen decisor visible en LinkedIn — requiere research adicional.

---

## Nota para Tomy
- [alertas, rarezas, oportunidades descubiertas]
```

## Principios

1. **Cantidad ≠ calidad**. 30 bien filtrados > 300 genéricos.
2. **Decisor identificado o ir al founder**. En empresas chicas LATAM (3-20 personas), el founder casi siempre decide.
3. **Rationale explícito**. Cada row debe tener "por qué entra" — si no lo tiene, no va en la lista.
4. **Transparencia de gaps**. Marcar lo desconocido como desconocido.

## Anti-patrones

- "Lista de 500 prospects" extraída de algún database random → basura.
- Empresas duplicadas en el pipeline (verificar con Tomy si ya están en conversación).
- Contactos de LinkedIn con rol irrelevante (contratar "Community Manager" como decisor de platform compra).
- Ángulo de entrada genérico ("solución para ecommerce").
- Listar competidores de NitroSales como prospects.

## Conexión con otras skills

- Input: `icp-profiler` define quién entra.
- Output: alimenta `personalized-outreach` (cada row se convierte en un outreach personalizado).

## Qué preguntar a Tomy

- ¿Querés que incluya marcas que ya están en tu pipeline (para priorizar)?
- ¿Hay algún competidor que no quieras listar (conflict of interest)?
- ¿Cuánto tiempo tenés para research de cada prospect antes de contactarlos?
