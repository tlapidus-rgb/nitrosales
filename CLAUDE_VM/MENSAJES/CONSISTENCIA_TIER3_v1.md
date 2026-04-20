# CONSISTENCIA TIER 3 — v1

> **Qué es este archivo**: reporte del pase de consistencia cruzado sobre las **8 landings Tier 3 + LANDING_MATRIZ.md + 4 landings Tier 1/2 (NitroPixel, Aurum, Bondly, Aura)** escritas en Fase 1B → Fase 3 (Sesión 3 VM). Cubre 13 archivos, ~6.600 líneas de copy.
>
> **Propósito**: detectar contradicciones, rutas rotas, términos no alineados, roadmap inconsistente y elementos de voz que rompen la coherencia del corpus antes de pasar a Fase 2B (BRAND_VISION.md) o Fase 4 (build Next.js).
>
> **Entregable**: este reporte, con hallazgos por eje, correcciones puntuales propuestas archivo/línea, y riesgos que requieren decisión de Tomy.
>
> **Alcance**: NO edita las landings. Propone. Tomy aprueba o ajusta, después aplicamos los fixes en una segunda pasada.
>
> **Fecha**: 2026-04-19 — Sesión 3 VM (post cierre de corpus Tier 3).

---

## RESUMEN EJECUTIVO

El corpus Tier 3 quedó sólido en los ejes estructurales — todas las landings respetan las palabras prohibidas generales, la regla "NO segmentar por facturación", la estructura de 10 bloques, la honestidad obligatoria y el mismo frame de placeholders para prueba social. Los tonos diferenciados por audiencia (ejecutivo-financiero en `/finanzas`, operativo en `/marketplaces`, shock-value en `/marketing-digital`, etc.) están bien calibrados y no chocan entre sí.

Detecté **8 ejes con hallazgos** que conviene resolver antes de pasar a diseño o build. Ninguno es estructural — son principalmente rutas que cambiaron entre landings, contradicciones de roadmap entre archivos escritos en momentos distintos, y términos que Tomy ya había marcado como dudosos (el clásico "cockpit"/"cabina de control").

Prioridad de resolución: **alta** en cross-links rotos y contradicción de MELI Ads entre `/marketing-digital` y `/marketplaces`; **media** en "próximamente" desactualizados de `/bondly`; **baja** en uniformación de numeración de fases.

---

## EJE A — CROSS-LINKS QUE APUNTAN A RUTAS INCORRECTAS O NO EXISTENTES

### A.1 — `/mercadolibre` debería ser `/marketplaces`

**Archivos afectados**: `LANDING_ALERTAS.md`
**Líneas**: 119, 451, 481

**Hallazgo**: `/alertas` usa la ruta `/mercadolibre` en 3 lugares (ejemplo de pedido a Aurum, notas de implementación, cross-links secundarios). Pero en el footer de `LANDING_MATRIZ.md` la sección se llama "Marketplaces" y en `LANDING_MARKETPLACES.md` la ruta canónica es `/marketplaces` (coincide con el nombre del archivo).

**Corrección propuesta**:
- Línea 119: "Estás en `/mercadolibre` viendo tus publicaciones" → "Estás en `/marketplaces` viendo tus publicaciones de MercadoLibre"
- Línea 451: "cada ejemplo concreto linkea a la sección del producto correspondiente (/campaigns, /mercadolibre, /finanzas/pulso...)" → "...(/campaigns, /marketplaces, /finanzas/pulso...)"
- Línea 481: "secundarios a `/integraciones` (BLoque 3B), `/finanzas/pulso` (Bloque 3 área 3), `/mercadolibre` (Bloque 3 área 2)..." → "...`/marketplaces` (Bloque 3 área 2)..."

**Además en línea 481 corregir typo**: "BLoque" → "Bloque".

### A.2 — `/customers` y `/customers/vip` — definir status

**Archivos afectados**: `LANDING_ALERTAS.md`
**Líneas**: 173, 451, 481

**Hallazgo**: `/alertas` menciona `/customers/vip` como sección donde el usuario le habla a Aurum, y `/customers` como cross-link secundario. Pero `/customers` NO aparece en las 8 Tier 3 del footer de MATRIZ (Control de Gestión · Marketing Digital · Rentabilidad · Productos · Marketplaces · Finanzas · Integraciones · Alertas). En `SECCIONES_DEL_PRODUCTO.md §3` la sección Comercial incluye Bondly + Rentabilidad + Customers, lo que sugiere que `/customers` es **una ruta interna del producto (panel de clientes), no una landing pública**.

**Decisión pendiente para Tomy**:
- **Opción 1**: `/customers` es ruta interna del producto, no landing pública → las menciones en `/alertas` son correctas como "sección del producto", pero NO se lista como cross-link a otra landing en las notas de implementación. Corrección: en la línea 481, sacar `/customers` de "cross-links a landings" y moverlo a "referencias a pantallas internas del producto".
- **Opción 2**: `/customers` debería tener landing pública (Tier 3 novena o sub-landing de Bondly) → abrir backlog de escritura. Impacto: el corpus deja de estar cerrado.
- **Opción 3**: renombrar `/customers` como `/clientes` para uso interno del producto (consistente con el resto de rutas que están en castellano: `/finanzas`, `/rentabilidad`, `/marketplaces`) → corrección cosmética, sin landing nueva.

**Recomendación**: Opción 3 + Opción 1 combinadas — `/clientes` como pantalla interna del producto, sin landing pública por ahora.

### A.3 — `/finanzas/pulso` y `/alertas/reglas` — subrutas internas

**Archivos afectados**: `LANDING_ALERTAS.md`
**Líneas**: 36, 323, 326, 350, 355, 379, 394, 397, 447, 451, 481

**Hallazgo**: `/alertas` menciona `/finanzas/pulso` y `/alertas/reglas` como destinos de cross-links. Ambas son subrutas internas del producto, no landings públicas. El tratamiento en `/alertas` es correcto (se presentan como pantallas del producto), pero conviene clarificar en las notas de implementación que **cross-links a subrutas del producto funcionan como links internos, no como landings separadas**.

**Corrección propuesta**: agregar una línea en las notas de implementación de `/alertas` al final (cerca de la línea 481):

```
> **Aclaración sobre links**: las rutas que arrancan con `/finanzas/pulso`,
> `/alertas/reglas`, `/bondly/audiencias` y similares son subrutas internas
> del panel del producto — no son landings públicas. Cuando se referencian
> desde una landing, el link lleva al login y al panel interno, no a una
> landing pública independiente.
```

### A.4 — `/precios` aparece en CTAs pero no existe landing

**Archivos afectados**: todas las Tier 3 (8 landings)
**Líneas**: múltiples — CTA "Ver planes completos → abre /precios"

**Hallazgo**: las 8 landings Tier 3 tienen un CTA secundario "Ver planes completos → abre /precios" pero `/precios` no es parte del corpus escrito ni está planificado como landing Tier 3.

**Decisión pendiente para Tomy**:
- **Opción 1**: `/precios` se escribe como landing nueva después del pase de consistencia (agregamos al backlog post-Tier 3 como "Tier 3b" o "Tier 1B-4"). Queda prometido como página pero no existe hoy.
- **Opción 2**: reemplazar "Ver planes completos → abre /precios" por "Hablá con el equipo → abre Calendly" en todas las Tier 3 hasta que `/precios` exista. Quitamos la promesa de ver precios públicos (consistente con el framing actual de "el pricing se arma en la demo con 2 preguntas", que ya aparece en `LANDING_MATRIZ.md` Bloque 7).
- **Opción 3**: `/precios` es un placeholder intencional con una página tipo "Escribinos por demo y te armamos tu precio" — minimal, 1 pantalla.

**Recomendación**: Opción 3 (placeholder minimalista) para no dejar rutas rotas cuando la landing salga viva, con trabajo real en backlog post-Fase 4.

---

## EJE B — CONTRADICCIONES DE ROADMAP ENTRE LANDINGS

### B.1 — MELI Ads: `/marketing-digital` v1.1 vs `/marketplaces` v1

**Archivos afectados**: `LANDING_MARKETING_DIGITAL.md` y `LANDING_MARKETPLACES.md`

**Contradicción**:
- `LANDING_MARKETING_DIGITAL.md` v1.1 (tesis inicial, líneas 11 y 39) dice: *"Para MELI Ads, NitroSales ofrece análisis informativo y reporting: pulling de la data de la API de MELI Ads, cruce con las órdenes reales de la cuenta MELI, y visibilidad consolidada junto a los otros canales"*. Implica que MELI Ads SÍ se importa y se cruza hoy, como análisis informativo.
- `LANDING_MARKETPLACES.md` v1 (líneas 40, 248, 302) dice: *"Mercado Ads en roadmap Fase 4, no en v1. Hoy `/marketplaces` muestra publicaciones orgánicas + órdenes + preguntas + reputación"*. Implica que MELI Ads NO está disponible hoy.

**Las dos afirmaciones son incompatibles**. O está disponible como análisis informativo (entonces `/marketplaces` tiene que decir lo mismo), o no está disponible (entonces `/marketing-digital` no puede prometerlo).

**Corrección propuesta**: alinear `/marketplaces` con `/marketing-digital`. Concretamente:

En `LANDING_MARKETPLACES.md` línea 40 (honestidad obligatoria):
- **Antes**: "**Mercado Ads en roadmap, no en v1**. Hoy `/marketplaces` muestra publicaciones orgánicas + órdenes + preguntas + reputación. La data de Mercado Ads (campañas pagas dentro de ML) entra en Fase 4 — se indica claramente cuando alguien pregunta por spend ML."
- **Después (propuesto)**: "**Mercado Ads: hoy como análisis informativo vía API, deep dive completo en Fase 4**. La data de Mercado Ads se importa desde la API oficial de MELI y se cruza con las órdenes reales de tu cuenta — ves spend, ves qué campañas generaron qué órdenes, en consolidado con Meta y Google. Lo que entra en Fase 4 es la capa de gestión deep (optimizar campañas desde NitroSales, creación, modificación, presupuesto inteligente)."

En `LANDING_MARKETPLACES.md` línea 248 (Bloque 5 "Para quién NO"):
- **Antes**: "**Operación que necesita configuración profunda de Mercado Ads**: Mercado Ads todavía no está en v1 de `/marketplaces`. Si tu mayor dolor es optimizar campañas pagas dentro de MELI, todavía el panel oficial te da más (por ahora). En roadmap Fase 4 — avisamos cuando entre."
- **Después (propuesto)**: "**Operación que necesita configuración y optimización deep de Mercado Ads**: hoy mostramos Mercado Ads como análisis informativo (spend, órdenes atribuidas, cruce con Meta/Google), pero la capa de gestión deep (crear campañas, modificar, optimizar budgets desde NitroSales) entra en Fase 4. Si tu mayor dolor es operar Mercado Ads como canal principal de adquisición, hoy seguís dependiendo del panel oficial para la parte de gestión. Avisamos cuando entre."

En `LANDING_MARKETPLACES.md` línea 302 (Objeción "¿Tienen Mercado Ads?"):
- **Antes**: "Hoy no — en roadmap Fase 4."
- **Después (propuesto)**: "Hoy sí, como análisis informativo — vemos spend, órdenes atribuidas, cruce con Meta y Google. La capa de gestión deep (crear, modificar, optimizar desde NitroSales) entra en Fase 4."

### B.2 — `/alertas` "próximamente" en `/bondly` desactualizado

**Archivos afectados**: `LANDING_BONDLY.md`
**Líneas**: 167

**Hallazgo**: `/bondly` (escrita en Fase 2-1, antes que `/alertas`) dice: *"Los insights se refrescan diario y los nuevos te avisan vía `/alertas` (próximamente) o en el Aurum de la pantalla"*. El disclaimer "(próximamente)" estaba bien cuando `/alertas` no existía. Ahora `/alertas` v1 existe como landing + el hub central `/alertas` está vivo en la app (Fase 8 y 8e de implementación). El "(próximamente)" es información desactualizada.

**Corrección propuesta**: en `LANDING_BONDLY.md` línea 167:
- **Antes**: "Los insights se refrescan diario y los nuevos te avisan vía `/alertas` (próximamente) o en el Aurum de la pantalla."
- **Después**: "Los insights se refrescan diario y los nuevos te avisan vía `/alertas` (el hub central de vigilancia) o en el Aurum de la pantalla."

**Observación adicional**: las fuentes de alertas de Bondly específicas (churn risk, VIP visitors, at-risk whales) aparecen en `LANDING_ALERTAS.md` como "Próximamente" en el sidebar (según lo explicitado en el frontmatter de `/alertas` línea 35). Esto está bien porque `/alertas` v1 admite honestamente que Bondly aún no aporta alertas al hub; pero `/bondly` no debería dar a entender que `/alertas` en sí todavía no existe. Ajuste sutil pero importante para coherencia de roadmap.

### B.3 — Numeración de fases: `Fase 3-X` (copy) vs `Fase 8X` (build) vs `Fase 4/5` (feature)

**Archivos afectados**: todas las Tier 3 + `/alertas` + `/marketplaces`

**Hallazgo**: el corpus usa al menos tres numeraciones de "fase" distintas:
1. **Copy / landings**: "Fase 3-1", "Fase 3-2", ..., "Fase 3-8" (para rastrear el orden de escritura de las landings Tier 3).
2. **Build de la app**: "Fase 8", "Fase 8a/b/c/d/e", "Fase 8f" (para rastrear el desarrollo técnico del hub de alertas).
3. **Roadmap de features**: "Fase 4" (Mercado Ads deep), "Fase 5" (multi-cuenta MELI, marketplace de creators cross-tenant).

Dentro de cada numeración son coherentes. El problema es que **cuando estas numeraciones aparecen en el texto que ve el visitante** puede confundir ("Fase 4" significa cosas distintas según dónde aparezca).

**Corrección propuesta**:
- **Dentro del texto visible de la landing** (lo que lee el prospect): usar solo términos genéricos como "en roadmap", "en roadmap cercano", "en próximas iteraciones", sin números.
- **En las notas de implementación internas** (bloques al final del archivo, no visibles al prospect): sí se pueden mantener los números de fase para trazabilidad interna.

**Archivos donde aplica el fix**:
- `LANDING_MARKETPLACES.md` líneas 248, 302, 314 → reemplazar "Fase 4" por "en roadmap cercano" en copy visible; mantener "Fase 4" en notas de implementación.
- `LANDING_MARKETPLACES.md` línea 240 → "multi-account en roadmap Fase 5" → "multi-account en roadmap".
- `LANDING_ALERTAS.md` línea 332, 379 → "Fase 8f y siguientes" solo en notas internas (ya está OK en el texto visible).

---

## EJE C — "CABINA DE CONTROL" EN `/marketplaces`

**Archivos afectados**: `LANDING_MARKETPLACES.md`
**Líneas**: 34 (tesis del frontmatter), múltiples en bloques visibles

**Hallazgo**: Tomy prohibió explícitamente "cockpit" como término de voz NitroSales (fuente: conversación previa en esta sesión + palabras prohibidas en varias Tier 3). En `/marketplaces` v1 usé "cabina de control" **una vez** en el frontmatter y **varias veces** en el body (Bloque 3B "panel nativo MELI... Son rieles de sincronización, no cabinas de control", cierre "La cabina de control operativa de tu cuenta MELI").

"Cabina de control" es un préstamo semántico de cockpit — está cerca de la línea roja. Dejo la decisión a Tomy.

**Decisión pendiente**:
- **Opción 1**: mantener "cabina de control" como término válido del vocabulario NitroSales (es ligeramente distinto de "cockpit" y suena más operativo / menos técnico).
- **Opción 2**: reemplazar por "panel consolidado" / "panel de gestión" / "panel unificado" en todos los usos, que es consistente con el vocabulario del resto de las Tier 3.
- **Opción 3**: hybrid — mantenerlo como uso excepcional en `/marketplaces` (es la landing más "operativa del día a día", encaja con el tono) pero declarar explícitamente que **no es término transversal** del vocabulario NitroSales.

**Recomendación**: Opción 2 — es la más segura para consistencia de corpus. "Panel consolidado" transmite lo mismo sin activar la regla prohibida.

**Lugares a corregir si Opción 2**:
- Línea 34 frontmatter: "`/marketplaces` es la cabina de control operativa de tu cuenta MELI" → "`/marketplaces` es el panel de gestión consolidado de tu cuenta MELI"
- Línea 220 (Bloque 3B, vs Tiendanube): "Son rieles de sincronización, no cabinas de control." → "Son rieles de sincronización, no paneles de gestión."
- Línea 399 (cierre Bloque 10): "`/marketplaces` es la cabina de control operativa de tu cuenta MELI" → "`/marketplaces` es el panel de gestión operativo de tu cuenta MELI"
- Línea 485 (notas de implementación) — dejar la nota original como trazabilidad del cambio.

---

## EJE D — PALABRAS PROHIBIDAS TRANSVERSALES — REVISIÓN

**Palabras prohibidas generales (aparecen en palabras prohibidas de cada Tier 3)**: "poderoso", "potente", "revolucionario".

**Verificación cruzada**: busqué esas 3 palabras + derivados en las 13 landings + reporte. Resultado: **cero apariciones en cuerpo de texto visible**. Las únicas menciones están en las secciones "Palabras prohibidas (...)" de cada landing, que son declaraciones de voz, no uso real.

**Estado**: ✓ consistente.

**Palabras prohibidas específicas que aparecen repetidas**:
- "cockpit" — declarada prohibida en `/integraciones`, `/alertas`, `/marketplaces`. Verificación: no aparece en cuerpo de texto de ninguna landing Tier 3. ✓
- "enlatado" — declarada prohibida en `/integraciones` y `/marketplaces`. Verificación: aparece solo en notas de implementación como trazabilidad del cambio ("Tomy rechazó la palabra 'enlatado'"). ✓
- "all-in-one" / "todo-en-uno" — prohibidas en `/integraciones`. Verificación: ✓ cero apariciones.
- "inteligencia artificial de última generación" / "IA predictiva" — prohibidas en `/alertas` y `/finanzas`. Verificación: ✓ cero apariciones.
- "domina MercadoLibre" / "scraping" / "bot de MELI" — prohibidas en `/marketplaces`. Verificación: ✓ cero apariciones.

**Estado**: ✓ las palabras prohibidas declaradas en cada landing están efectivamente ausentes del body.

---

## EJE E — VERSIONADO Y FECHAS EN FRONTMATTER

**Hallazgo**: las 8 Tier 3 + 4 landings Tier 1/2 tienen versionado explícito en frontmatter (v1, v1.1, v1.2, v2). `LANDING_MATRIZ.md` NO tiene versión explícita en frontmatter, pero el footer menciona "Copy v3".

**Inconsistencia menor**: `LANDING_MATRIZ.md` frontmatter dice solo "Sesión 3 VM (Fase 1B-1)" sin versión. Uniformar.

**Corrección propuesta**: en `LANDING_MATRIZ.md` línea 9:
- **Antes**: "**Última actualización**: 2026-04-19 — Sesión 3 VM (Fase 1B-1)."
- **Después**: "**Última actualización**: 2026-04-19 — v3 Sesión 3 VM (Fase 1B-1)."

Versiones declaradas en el corpus (estado actual):
| Archivo | Versión |
|---|---|
| LANDING_MATRIZ.md | (implícita v3 en footer) → proponer v3 explícita |
| LANDING_NITROPIXEL.md | v1 |
| LANDING_AURUM.md | v1 |
| LANDING_BONDLY.md | v1 |
| LANDING_AURA.md | v1 |
| LANDING_RENTABILIDAD.md | v1 |
| LANDING_PRODUCTOS.md | v2 |
| LANDING_FINANZAS.md | v1.1 |
| LANDING_CONTROL_GESTION.md | v1 |
| LANDING_MARKETING_DIGITAL.md | v1.1 |
| LANDING_INTEGRACIONES.md | v1.2 |
| LANDING_ALERTAS.md | v1 |
| LANDING_MARKETPLACES.md | v1 |

---

## EJE F — TONOS DIFERENCIADOS POR AUDIENCIA — VALIDACIÓN

**Hallazgo**: cada Tier 3 declara su tono en el frontmatter. La intención es que los tonos sean diferenciados (no uniformes) porque cada landing habla a una audiencia y un dolor distintos.

Tonos declarados:
| Landing | Tono declarado |
|---|---|
| /rentabilidad | Ejecutivo de negocio |
| /productos | Ejecutivo de negocio |
| /finanzas | Ejecutivo-financiero |
| /control-gestion | Conversacional, universal |
| /marketing-digital | Contundente, técnico-profesional, shock-value |
| /integraciones | Imponente, confiado, institucional |
| /alertas | Directo, aliviador, conversacional |
| /marketplaces | Operativo, práctico, directo |

**Validación**: los tonos son coherentes con la audiencia declarada de cada landing y no se contradicen entre sí. La palabra "potente"/"poderoso"/"revolucionario" aparecería como violación cross-tono en TODAS — y no aparece. ✓

**Observación**: `/marketing-digital` tiene el tono más divergente del corpus ("shock-value", "contundente") por instrucción explícita de Tomy (*"tiene que quedar impactante, shockeante, porque acá hacemos la diferencia"*). Esto funciona dentro de la landing, pero conviene que el **cross-link desde `/marketing-digital` al resto** no importe ese tono shock en fragmentos de otras landings (no lo importa hoy; aviso preventivo).

**Estado**: ✓ consistente.

---

## EJE G — HONESTIDAD OBLIGATORIA — ALINEACIÓN CRUZADA

**Hallazgo**: las 8 Tier 3 declaran honestidad obligatoria en frontmatter. Principales promesas limitadas (cosas que explícitamente NO hacemos):

| Promesa limitada | Landing(s) donde aparece |
|---|---|
| Prueba social con placeholder hasta trials medidos | Todas (8/8) ✓ |
| No somos sistema contable (no reemplaza AFIP, libros) | /finanzas, /integraciones ✓ |
| No hacemos integración en vivo con ERPs/sistemas contables | /finanzas v1.1, /integraciones v1.2 ✓ |
| No hacemos competitive intel tipo Nubimetrics | /marketplaces ✓ |
| No respondemos preguntas MELI automáticamente | /marketplaces ✓ |
| NitroPixel no mide MELI Ads (vive dentro de MELI) | /marketing-digital v1.1 ✓ |
| Amazon/Noventa9 en roadmap, no en v1 | /marketplaces ✓ |
| CAC payback/LTV requieren 3-6 meses de data | /finanzas, /marketing-digital ✓ |
| Rules engine no expuesta al usuario final | /alertas ✓ |
| No somos integrador genérico tipo Zapier | /integraciones ✓ |
| Audiencias custom (Bondly) en "Próximamente" | /bondly (observado en frontmatter) |
| Aura marketplace cross-tenant en "Próximamente" | /aura ✓ |

**Estado**: ✓ todas las promesas limitadas están alineadas entre landings. No detecté casos de "A promete algo que B contradice" salvo el caso MELI Ads ya listado en Eje B.1.

---

## EJE H — VISUALES / METÁFORAS CENTRALES POR LANDING

**Hallazgo**: cada landing introduce una metáfora visual distintiva. Registro para no duplicar ni contradecir en la fase visual (Fase 2B).

| Landing | Metáfora central |
|---|---|
| MATRIZ | "tu primer activo digital" (propiedad, no alquiler) |
| /nitropixel | pixel first-party como "infraestructura tuya" |
| /aurum | analista senior con 5 años en tu empresa |
| /bondly | scoreboard + semáforo de churn |
| /aura | creator economy con gradiente marcado (#ff0080 → #a855f7 → #00d4ff) |
| /rentabilidad | P&L por producto + "por dónde se te va la plata" |
| /productos | dos columnas "qué comprar / qué empujar" |
| /finanzas | "simple arriba, exacta abajo" (dos capas) |
| /control-gestion | playground interactivo + plantillas por rol |
| /marketing-digital | shock value sobre "ROAS modelado vs real" |
| /integraciones | infraestructura imponente del ecosistema ecommerce |
| /alertas | "el ojo que mira tu ecosistema + oído que entiende castellano" |
| /marketplaces | 8 tabs → 1 panel consolidado |

**Validación**: las metáforas son complementarias, no duplicadas. Funcionan como lenguaje visual diferenciado que Fase 2B tiene que respetar sin homogeneizar.

**Única observación**: el **Creator Gradient de Aura** (#ff0080 → #a855f7 → #00d4ff) está declarado en `POSICIONAMIENTO_Y_VOZ.md` y en el frontmatter de `/aura`. Fase 2B tiene que definir si los otros productos (Aurum, Bondly, NitroPixel) tienen gradientes propios o si el Creator Gradient es exclusivo de Aura. Es una decisión de brand vision, no de consistencia de copy — pero queda registrada acá como item para la fase siguiente.

---

## EJE I — CROSS-LINKS PRINCIPALES Y SECUNDARIOS — MAPA CRUZADO

Cross-links principales declarados en el cierre de cada landing (Bloque 10 o equivalente):

| Landing | Cross-link principal | Cross-links secundarios mencionados |
|---|---|---|
| MATRIZ | Calendly (no otra landing) | /nitropixel, /aurum, /bondly, /aura, /finanzas (linkeados en 4 pilares) |
| /nitropixel | — | /integraciones, /rentabilidad, /productos, /aurum |
| /aurum | NitroPixel | — |
| /bondly | NitroPixel | — |
| /aura | Bondly | — |
| /rentabilidad | Aurum | — |
| /productos | Rentabilidad | — |
| /finanzas | Rentabilidad | — |
| /control-gestion | Playground interno + Calendly | — |
| /marketing-digital | NitroPixel | /marketplaces (para MELI Ads), /rentabilidad, /productos |
| /integraciones | (no declarado explícitamente) | — |
| /alertas | Aurum | /integraciones, /finanzas/pulso, /mercadolibre (→ /marketplaces), /productos, /customers |
| /marketplaces | Rentabilidad | /alertas, /finanzas, /integraciones, /control-gestion |

**Observaciones**:
- **MATRIZ** no linkea a `/control-gestion` en los 4 pilares (puede ser intencional, los pilares son product-forward) — sí lo linkea en el footer como sección. ✓
- **/integraciones** no tiene cross-link principal declarado en el cierre que leí. Sería útil confirmar que el Bloque 10 de `/integraciones` cierra con un link específico a alguna Tier 3 (probablemente `/control-gestion` como "el lugar donde ver todo lo que conectaste"). **Item para chequeo adicional** si Tomy aprueba este reporte.
- **El cross-link `/marketing-digital` → `/marketplaces`** por el tema MELI Ads es correcto y necesario — refuerza el Eje B.1.
- **Grafo de cross-links**: forma una red coherente, no hay landings "huérfanas" excepto MATRIZ (que es la raíz, no apunta hacia abajo deliberadamente, solo en el footer).

---

## PROPUESTA DE ORDEN DE FIXES

Si Tomy aprueba este reporte, orden recomendado para aplicar las correcciones:

**Sprint 1 — correcciones críticas (impacto directo en el lector)**:
1. Eje A.1 — `/mercadolibre` → `/marketplaces` en `/alertas` (3 líneas).
2. Eje B.1 — alinear MELI Ads entre `/marketing-digital` y `/marketplaces` (3 ediciones en `/marketplaces`).
3. Eje B.2 — sacar "(próximamente)" de `/alertas` en `/bondly` (1 línea).

**Sprint 2 — correcciones de uniformidad (impacto en percepción de coherencia del corpus)**:
4. Eje C — resolver "cabina de control" en `/marketplaces` (decisión de Tomy + 3 ediciones si va Opción 2).
5. Eje E — versionado explícito en `LANDING_MATRIZ.md` (1 línea).
6. Eje B.3 — sacar "Fase 4/5" de copy visible en `/marketplaces`, dejar solo en notas internas (4 líneas).

**Sprint 3 — correcciones de housekeeping (bajo impacto pero mejoran robustez)**:
7. Eje A.2 — resolver status de `/customers` (decisión de Tomy).
8. Eje A.3 — aclaración sobre subrutas internas en notas de `/alertas` (1 bloque nuevo).
9. Eje A.4 — decidir qué hacer con `/precios` (decisión de Tomy).
10. Eje I — verificar cierre de `/integraciones` (chequeo manual + posible fix).

---

## DECISIONES PENDIENTES QUE REQUIEREN INPUT DE TOMY

1. **`/customers`** — ¿ruta interna del producto o futura landing pública? (Eje A.2)
2. **`/precios`** — ¿placeholder minimalista ya / landing full post-Tier 3 / reemplazar CTAs por "hablá con el equipo"? (Eje A.4)
3. **"Cabina de control"** — ¿se mantiene como excepción en `/marketplaces` / se reemplaza por "panel consolidado" / se agrega al vocabulario NitroSales válido? (Eje C)
4. **Fases visibles al lector** — ¿sacamos los números "Fase 4", "Fase 5" del copy y dejamos solo "en roadmap"? (Eje B.3)
5. **Creator Gradient de Aura** — ¿los otros productos (Aurum, Bondly, NitroPixel) tienen gradientes propios o el Creator Gradient es exclusivo de Aura? (Eje H — pre-Fase 2B)

---

## RESUMEN CUANTITATIVO

- **Landings revisadas**: 13 (MATRIZ + NitroPixel + Aurum + Bondly + Aura + 8 Tier 3)
- **Líneas de copy totales revisadas**: ~6.600
- **Hallazgos totales**: 8 ejes, ~15 correcciones puntuales proponiendo cambios en archivos específicos
- **Decisiones pendientes para Tomy**: 5
- **Contradicciones duras entre landings**: 2 (MELI Ads en B.1, `/alertas` "próximamente" en B.2)
- **Rutas rotas**: 1 crítica (`/mercadolibre` → `/marketplaces`), 3 menores (`/customers`, `/precios`, subrutas internas)
- **Tono / voz**: sin violaciones de palabras prohibidas en body
- **Versionado**: 1 inconsistencia menor (MATRIZ sin versión explícita)

---

## PRÓXIMOS PASOS

1. **Tomy revisa este reporte** — aprueba los fixes del Sprint 1 (correcciones críticas) y toma decisiones sobre los 5 puntos pendientes.
2. **Aplicación de los fixes aprobados** en una segunda pasada por cada archivo afectado, con trazabilidad en cada frontmatter (`v1 → v1.1`, etc.).
3. **Escritura de este reporte como v2** con el estado "cerrado" y changelog de qué se aplicó.
4. **Luz verde para Fase 2B** (BRAND_VISION.md) o Fase 4 (build Next.js) — el que Tomy elija.

---

_CONSISTENCIA_TIER3_v1.md — Fin del reporte._
_Última actualización: 2026-04-19 — Sesión 3 VM (pase de consistencia post cierre de corpus Tier 3). Siguiente iteración después de feedback de Tomy._
