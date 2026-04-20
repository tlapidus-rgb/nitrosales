# BACKLOG VM (Ventas & Marketing) — Pendientes priorizados

> Tracker de pendientes del dominio **Ventas & Marketing**. Lo usa Claude VM para mantener visibles ítems que Tomy decidió no abordar ahora pero no hay que perder de vista. Cubre: estrategia comercial, packaging de productos, posicionamiento, copy, naming, landings, canales, pricing.
>
> **Diferencia con `BACKLOG_PENDIENTES.md`** (raíz del repo, dominio Producto): aquel cubre código, features, infraestructura, bugs del app, y es territorio exclusivo de Claude Producto. Este archivo vive en `CLAUDE_VM/` y es territorio exclusivo de Claude VM.
>
> **Convenciones**:
> - Cada ítem se enlista con ID `VM-BP-XXX` (correlativo, nunca se reutiliza).
> - Se anota: título, fecha de entrada, estado, trigger, concepto, opciones/caminos si aplica, criterios de decisión, próximo paso cuando se active.
> - Cuando un ítem se resuelve, se marca como `✅ resuelto` con la sesión y commit(s), y se archiva en la sección "Resueltos".
> - Cuando un ítem se descarta, se marca como `🗑 descartado` con la razón.
> - Si un ítem cruza dominio con Producto, se referencia explícitamente (ej: "BP-005 de `BACKLOG_PENDIENTES.md`").
>
> **Última actualización**: 2026-04-20 — creación del archivo. Primer ítem: VM-BP-001 (arquitectura del disparador de comunicación como producto standalone vs. función interna de Bondly). Migrado desde `BACKLOG_PENDIENTES.md` donde había sido escrito incorrectamente (cruce de dominio histórico, Sesión VM Fase 1B-2).

---

### VM-BP-001 — Decisión de arquitectura: disparador de comunicación como producto standalone vs. función interna de Bondly

**Entró al backlog**: 2026-04-19 (Sesión VM Fase 1B-2 — mientras se escribía LANDING_BONDLY.md). Migrado a este archivo el 2026-04-20 por decisión de Tomy (separación limpia de dominios: VM tiene su propio backlog).

**Estado**: 📝 pendiente (decisión estratégica abierta, no se baja a implementación hasta resolver)

**Trigger**: al escribir el copy de LANDING_BONDLY.md, Tomy planteó: *"no entiendo que tiene que ver lo que vamos a explicar sobre NitroPixel y Aurum con nuestros clientes activos"* y después: *"todavía no definas si va a ser el disparador internamente desde bondly, porque creo que quiero armar una herramienta nueva, que sea la que dispare toda la comunicación que bondly le dé de input"*.

**Concepto**:
Bondly identifica a quién contactar, cuándo y con qué (inteligencia). El disparador ejecuta la comunicación (push / email / WhatsApp / SMS / audiencia a Meta) basándose en ese input. Hoy el supuesto implícito en el copy de la landing Bondly es que la ejecución "vive dentro de NitroSales" sin comprometer dónde exactamente. La pregunta abierta es **cómo se arquitecta este ejecutor a nivel producto**.

**Dos opciones sobre la mesa**:

#### Opción A — Función interna de Bondly
- El disparador vive adentro de Bondly como módulo más (`/bondly/comunicacion` o similar).
- Un solo producto al nombre: Bondly = inteligencia + disparo.
- Ventajas: simplicidad de marca, un solo precio, un solo pitch ("Bondly decide y dispara").
- Desventajas: dilución del positioning de Bondly (que hoy es "customer intelligence + LTV predictivo"). Agregar un módulo de execution le puede quitar foco al mensaje de inteligencia.

#### Opción B — Producto standalone Tier 2 con identidad propia (la opción que Tomy está considerando)
- El disparador es un producto nuevo con nombre propio, landing propia, precio propio.
- Bondly decide → [Producto X] ejecuta.
- Ventajas:
  - Cada producto mantiene positioning limpio: Bondly = inteligencia. [Producto X] = execution.
  - Se puede vender standalone a clientes que ya tienen su inteligencia de clientes resuelta y solo quieren el motor de ejecución.
  - Paralelo narrativo con /aura (creator economy como producto separado) y /bondly: cada vertical tiene su producto.
  - Escala mejor: se pueden agregar features de execution (nuevos canales, A/B testing, deliverability, templates) sin ensanchar el scope de Bondly.
- Desventajas:
  - Más productos para mantener (landing, docs, pricing, pitch, roadmap).
  - Bondly sin el disparador pierde algo de brillo: "decidir" sin "ejecutar" puede sentirse incompleto si el cliente no compra el producto hermano.
  - Naming pending (ver sección abajo).

**Cruce con BP-005 del backlog de Producto (`BACKLOG_PENDIENTES.md`)**:
BP-005 describe la **capacidad técnica** (motor de mensajería multi-canal hiperpersonalizada con triggers sobre NitroPixel, multi-canal push/email/WhatsApp, rules engine, consent management, frecuencia capping, attribution). Es la misma cosa que VM-BP-001 pero visto desde la ingeniería. VM-BP-001 es la **decisión de packaging/marca** que se toma antes de implementar BP-005:
- Si Opción A → BP-005 se implementa como módulo dentro de Bondly.
- Si Opción B → BP-005 se implementa como producto separado con su propia identidad (nombre, landing, pricing).

Las decisiones son secuenciales: primero VM-BP-001 (estrategia), después BP-005 (ejecución técnica).

**Criterios para decidir (propuestos, a validar con Tomy)**:
1. **Pitch limpio**: ¿se vende mejor "Bondly decide y dispara" (un producto) o "Bondly decide + [X] dispara" (dos productos complementarios)?
2. **Venta modular**: ¿hay segmentos de cliente que querrían solo Bondly sin execution (porque ya usan Klaviyo/Braze)? ¿Hay segmentos que querrían solo el motor de execution con su propia inteligencia?
3. **Escalabilidad de features**: ¿la roadmap del motor de execution se merece su propio ciclo de releases y marketing?
4. **Paralelismo con el resto del portfolio**: hoy el Tier 2 tiene Bondly y Aura. Agregar un tercer producto Tier 2 (el disparador) calza con la arquitectura de "un módulo vertical = un producto".
5. **Naming disponible**: si Opción B, hay que encontrar un nombre que funcione en el mismo registro que Bondly/Aura/NitroPixel/Aurum (evocativo, corto, pronunciable en castellano e inglés).

**Candidatos de naming preliminares (si Opción B, a iterar)**:
- **Pulso** (Pulse en inglés) — evoca ritmo, corazón, señal viva. Cross-ref con el "Pulse Banner" de Bondly; podría confundir.
- **Trigger** / **Trigger.ai** — descriptivo pero genérico.
- **Voz** / **Voice** — el canal por el que NitroSales le habla al cliente.
- **Radar** — evoca detección + alcance. Usado ya como "Content Radar" en Aura; podría confundir.
- **Spark** — corto, evocativo, "chispa de comunicación". En inglés tiene connotación de start / ignite.
- **Alcance** — español directo, pero genérico.
- Otros a generar: evaluar con Tomy lista más amplia cuando se active el tema.

**Impacto en el copy de LANDING_BONDLY.md mientras esté abierta esta decisión**:
- El copy es intencionalmente ambiguo: siempre dice "la acción se dispara dentro de NitroSales" o "desde cada vista disparás la acción", sin nombrar ejecutor específico.
- NO se menciona Klaviyo como ejecutor default. NO se afirma que Bondly "envía emails".
- Cuando VM-BP-001 se cierre, hay que actualizar LANDING_BONDLY.md con el lenguaje correcto (y, si Opción B, crear LANDING_[nombre del producto].md nueva).

**Esfuerzo de decisión**: 1-2 sesiones de charla estratégica + validación con los 3 trials actuales (preguntarles qué les resuena más).

**Por qué no ahora**:
- Tomy está en Fase 1B de la planificación (MENSAJES) y quiere avanzar con las landings del portfolio actual antes de abrir un producto nuevo.
- La decisión no es urgente — no bloquea las landings de los 4 productos actuales (NitroPixel, Aurum, Bondly, Aura).
- Pero sí hay que cerrarla antes de construir BP-005 (el motor técnico), porque el packaging define la arquitectura de datos, el pricing, y el go-to-market.

**Próximo paso cuando se active**:
1. Sentarse con Tomy a decidir Opción A vs. B.
2. Si B: brainstorm de naming + arquitectura de producto (landing, pricing, roadmap).
3. Si B: actualizar `POSICIONAMIENTO_Y_VOZ.md` agregando el nuevo producto al Tier 2 (hoy solo Bondly + Aura).
4. En cualquier caso: abrir BP-005 a implementación con la decisión ya tomada.

---

## Resueltos

_(vacío — ningún ítem VM resuelto aún)_

---

## Descartados

_(vacío — ningún ítem VM descartado aún)_
