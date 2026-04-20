# SPRINT 3 — Escribir LANDING_PRECIOS · Changelog

> **Fecha**: 2026-04-20
> **Origen**: Sprint 3 del pase de consistencia Tier 3. Cierra el ciclo abierto por CONSISTENCIA_TIER3_v1.md.
> **Output**: LANDING_PRECIOS.md (v1, ~465 líneas) — novena landing Tier 3, cierra el corpus funcional.

---

## Decisión marco: Camino A (respetar PRECIOS.md)

Antes de escribir aparecía una contradicción entre dos instrucciones de Tomy:

- Respuesta inicial en AskUserQuestion (2026-04-20): "Lo dejaría y pondría precios representativos. Es mejor avanzar bien y después modificar un precio es simple".
- Regla en `CONOCIMIENTO_PRODUCTO/PRECIOS.md` (línea 316-319): "NUNCA decir un número de pricing (cifras USD/ARS) en ningún output (landing, email, deck, propuesta comercial) hasta que Tomy calibre los coeficientes con data de los 3 trials".

**Resolución (Tomy, 2026-04-20)**: "Hace el camino A. respetemos las reglas".

→ Landing escrita sin un solo número USD/ARS. La regla de PRECIOS.md se respeta al pie de la letra.

---

## Estructura de la landing

| Bloque | Contenido |
|---|---|
| 1. Hero | H1 "El precio se arma con vos, no contra vos" + CTA "Armá tu cotización" |
| 2. Trust Strip | Sin setup fee, mensual cancelable, money-back 30 días, sin contrato atado |
| 3. Cómo se calcula (Modelo 2D) | Scope × Scale explicado con los 6 inputs de volumen |
| 3B. Los 3 Packs | Activación, Crecimiento, Completo + à la carte como opción avanzada |
| 4. Script de 2 pasos | Discovery 15 min → cotización cerrada, sin teatro |
| 5. Qué incluye el precio | ~50 integraciones, updates, soporte, sin setup, sin overage sorpresa |
| 6. Programa Beta | Bloque propio con 4 beneficios + 3 contrapartidas explícitas |
| 7. Objeciones | 10 preguntas frecuentes ordenadas por frecuencia real de prospect |
| 8. CTA "Armá tu cotización" | Calendly 15 min + formulario alternativo |
| 9. FAQ complementarias | 8 preguntas que no entraron en objeciones |
| 10. Cierre | Honesto, sin urgencia falsa, sin countdown |

---

## Reglas respetadas (checklist v1)

- [x] Cero números USD/ARS en todo el documento.
- [x] Cero signos de exclamación.
- [x] Cero emojis en body.
- [x] Voseo consistente ("contratás", "cotizamos", "sales", "entrás", "armás").
- [x] Cero palabras prohibidas generales ("poderoso", "potente", "revolucionario").
- [x] Cero palabras prohibidas específicas de pricing ("precio imbatible", "oferta exclusiva", "ahorro garantizado", "ROI garantizado", "precio disruptivo", "último día").
- [x] Ningún countdown timer falso ni urgencia inventada.
- [x] Programa beta con contrapartidas explícitas (no solo beneficios).
- [x] Money-back + mensual cancelable + sin setup fee aparecen en Trust Strip Y en FAQ.
- [x] Los 3 packs descritos con "para quién sí" + "qué incluye" + "qué NO incluye".
- [x] Cero cross-links rotos (todos los CTAs apuntan a landings que existen en el corpus).

---

## Patrón distintivo vs. resto del Tier 3

- **Única landing del corpus sin números concretos**. Todas las Tier 2/Tier 3 tienen ejemplos numéricos (órdenes, SKUs, porcentajes, ROAS). `/precios` es la excepción explícita por regla de PRECIOS.md.
- **Primera landing con programa beta comunicado como bloque propio** (Bloque 6 con contrapartidas). El resto lo menciona en pasada.
- **Primera landing con acordeón dedicado a objeciones de pricing** (10 objeciones en Bloque 7).
- **Única landing no funcional** — no describe un panel del producto. Es landing comercial pura.

---

## Impacto en el corpus

### Cross-links rotos cerrados

Todas las landings del corpus Tier 3 tienen CTAs "ver planes" / "ver precios" que hasta este Sprint apuntaban a `/precios` sin destino. Con Sprint 3 completado, esos CTAs tienen página real.

### Corpus final post Sprint 3 (9 landings Tier 3)

1. `/rentabilidad`
2. `/productos`
3. `/finanzas`
4. `/control-gestion`
5. `/marketing-digital`
6. `/integraciones`
7. `/alertas` (v1.1 post Sprint 1)
8. `/marketplaces` (v1.1 post Sprint 1)
9. `/precios` ← Sprint 3 (nueva)

Más `/bondly` (Tier 2) bumpeado a v1.1 en Sprint 1.

---

## Lo que NO se hizo en Sprint 3 (por decisión explícita)

- **No se inventaron coeficientes del Modelo D**. La landing describe la estructura (Scope × Scale, 3 packs, 6 inputs de volumen) pero no pone valores.
- **No se prometió ROI cuantificado**. No aparece "recuperás la inversión en X meses" ni similares.
- **No se usó Creator Gradient**. Quedó reservado para `/aura` según decisión Tomy Sprint 0. El tratamiento visual del Programa Beta queda documentado como checklist pendiente en BRAND_VISION.md (posible uso acotado si tiene sentido semántico de comunidad/co-creación).

---

## Checklist cerrado — Sprint 3

- [x] Escrita LANDING_PRECIOS.md v1 (~465 líneas).
- [x] Regla PRECIOS.md respetada (cero USD/ARS).
- [x] Modelo D (Scope × Scale) descrito con los 3 packs + à la carte.
- [x] Programa beta comunicado con contrapartidas explícitas.
- [x] 10 objeciones de pricing ordenadas por frecuencia real.
- [x] 8 FAQ complementarias.
- [x] Cierre sin urgencia falsa ni countdown.
- [x] Cross-links principales a `/` (matriz) y secundarios a `/rentabilidad`.
- [x] Checklist para BRAND_VISION.md dejada escrita (diagrama 2D, tratamiento visual beta, acordeón, CTA Calendly).
- [x] Notas de implementación con todos los cross-links documentados.

---

## Próximos pasos post Sprint 3

- **Opción A**: Cierre final del pase de consistencia con `CONSISTENCIA_TIER3_v1.1_FINAL.md` — reporte consolidado de los 3 sprints.
- **Opción B**: Arranque directo de Fase 2B (`BRAND_VISION.md`) con el corpus Tier 3 ya completo.
- **Opción C**: Fase 4 — build Next.js real en `nitrosales.vercel.app` con las 9 landings como input de diseño/dev.

Decisión pendiente de Tomy.

---

_Fin del SPRINT3_CONSISTENCIA_CHANGELOG.md. Sprint 3 completado — corpus Tier 3 cerrado en 9 landings. Cero números USD/ARS en `/precios` (PRECIOS.md respetado). Lista para review y decisión de próximo paso._
