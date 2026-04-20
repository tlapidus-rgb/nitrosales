# LANDING_PRECIOS.md — Copy completo de la landing `/precios` (Tier 3 — Pricing)

> **Qué es este archivo**: el texto (copy) completo y canónico de la landing `/precios`. Tier 3 — Landing de pricing pública. Novena landing Tier 3 (se suma post pase de consistencia 2026-04-20 como cierre del ciclo de landings funcionales).
>
> **Alcance**: SOLO texto. No incluye diseño, colores, tipografías, imágenes ni layout. Eso corresponde a `BRAND_VISION.md`.
>
> **Regla maestra respetada**: `CONOCIMIENTO_PRODUCTO/PRECIOS.md` establece que NO se comunican cifras USD/ARS en landings, emails, decks ni propuestas comerciales hasta que los coeficientes del Modelo D estén calibrados con data real de los 3 trials en curso. Esta landing cumple la regla: describe el modelo, los packs, los inputs de volumen, el programa beta y las condiciones — pero no incluye números de precio. El cierre lleva a "armá tu cotización" (cotización personalizada en descubrimiento comercial).
>
> **Audiencia**: marcas ecommerce argentinas (y LATAM) medianas a grandes en facturación, que ya vienen evaluando la plataforma en otras landings del corpus y llegan a `/precios` con intención comercial. Algunas leyeron antes la matriz (`/`), otras rebotan de landings Tier 2 (`/nitropixel`, `/aurum`, `/bondly`, `/aura`) o Tier 3 (`/rentabilidad`, `/finanzas`, `/marketplaces`, etc).
>
> **Tono**: honesto-comercial. Sin apurar. Sin prometer. Sin meter ansiedad por cerrar. La landing reconoce que el lector viene con preguntas de presupuesto, explica cómo se arma el número, y lo invita a pedir cotización real sin teatro. Voseo consistente, sin exclamaciones, sin emojis en body.
>
> **Palabras prohibidas** (además de las generales): "poderoso", "potente", "revolucionario", "el mejor precio del mercado", "precio imbatible", "ahorro garantizado", "ROI garantizado", "inversión inteligente", "precio promocional limitado", "oferta exclusiva", "último día", "precio disruptivo". La honestidad se defiende con el modelo (Scope × Scale) y con la narrativa de por qué no hay un número público.
>
> **Cross-link principal**: `/` (matriz — para entender qué es NitroSales antes de discutir precio).
> **Cross-link secundario**: `/rentabilidad` (si el prospect viene preguntando por ROI, el mejor lugar para llevarlo es donde el producto muestra margen neto real).
>
> **Última actualización**: 2026-04-20 — v1 Sesión 3 VM (pase de consistencia Tier 3, novena landing, cierra el ciclo como Sprint 3). Respeta la regla de PRECIOS.md: cero números USD/ARS. Modelo D descrito en detalle con script de 2 pasos (Scope + Scale). Programa beta comunicado con condiciones (descuentos, money-back, mensual cancelable). Cierra con "pedí tu cotización".

---

## BLOQUE 1 — HERO

**Eyebrow**
Pricing NitroSales

**H1**
El precio se arma con vos, no contra vos.

**Subhead**
No cobramos por tu facturación. Cobramos por lo que la plataforma hace por tu negocio. Dos variables definen el número: qué módulos contratás y cuánto volumen procesa tu operación. Un discovery de 15 minutos y tenés cotización cerrada.

**CTA primario**
Armá tu cotización → abre formulario / calendly

**CTA secundario**
Cómo se calcula → scroll a Bloque 3

**[VISUAL: split 60/40. Izquierda headline + subhead + CTAs sobre fondo oscuro con gradiente NitroSales sutil. Derecha: animación que muestra dos dimensiones cruzándose — un eje vertical con 3 packs etiquetados (Activación, Crecimiento, Completo) y un eje horizontal con barra de volumen que se mueve. Punto de intersección = precio representado por círculo que pulsa sin mostrar valor.]**

---

## BLOQUE 2 — TRUST STRIP

**Línea principal**
Sin setup fee. Mensual cancelable. Money-back 30 días si no lo usás. Sin contrato atado. Sin sorpresas en la factura.

**Segunda línea**
Los inputs que definen tu precio los declarás vos en el onboarding. Cuando cambian significativamente, avisamos antes de recalibrar. La factura de este mes es siempre la factura acordada este mes.

**Tercera línea (programa beta)**
Las marcas que entran en este momento tienen condiciones de programa de adopción temprana: descuento sobre el plan normal durante los primeros 6-12 meses, acceso directo al equipo de producto, y prioridad en roadmap. La contrapartida es que nos ayudan a pulir la plataforma con uso real.

**[VISUAL: 4 chips en fila: "Sin setup fee · Mensual cancelable · Money-back 30 días · Sin contrato atado". Debajo, chip diferenciado color Creator Gradient para el programa beta.]**

---

## BLOQUE 3 — CÓMO SE CALCULA EL PRECIO (MODELO 2D)

**Título de la sección**
Dos dimensiones, un número al final.

**Intro**
Trabajamos con un modelo de pricing de dos dimensiones independientes. No es SaaS por tier fijo (no castigamos al cliente chico ni subsidiamos al grande). No es porcentaje sobre GMV (no cobramos más porque te vaya mejor en ventas). Es Scope × Scale: qué módulos usás, y cuánto procesa tu operación.

### Dimensión 1 — Scope (qué módulos contratás)

La primera parte del precio depende de qué módulos de NitroSales activás en tu cuenta. No pagás por lo que no usás.

Tenés dos maneras de definir scope:

- **Packs predefinidos** (recomendado para arrancar). Tres packs cubren 90% de los casos: Activación, Crecimiento, Completo. Cada pack combina un conjunto de módulos pensados para el momento del negocio.
- **À la carte** (para casos específicos). Armás tu plan módulo por módulo. Útil para enterprise que negocia puntualmente, agencias que revenden solo un módulo (típico: solo NitroPixel) a sus clientes, o marcas avanzadas que ya resuelven algunos módulos con otras herramientas y solo necesitan partes.

### Dimensión 2 — Scale (cuánto volumen procesa tu operación)

La segunda parte depende del volumen real de data que la plataforma ingesta y procesa por tu cuenta. Los inputs que declarás en onboarding son:

- **Órdenes procesadas por mes** (sumadas entre todos los canales conectados: VTEX, MELI, Shopify, Tiendanube, etc).
- **SKUs activos en catálogo** (productos que realmente rotan, no el catálogo histórico).
- **Integraciones conectadas** (cada integración viva tiene costo real de infra: webhooks, syncs, rate limits, reconciliación diaria).
- **Volumen de eventos pixel por mes** (solo aplica si tenés NitroPixel activo — escala con el tráfico de tu tienda online).
- **Usuarios con acceso al dashboard** (storage de sesiones, permisos granulares, cómputo de vistas personalizadas).
- **Uso de IA Aurum** (solo aplica si tenés Aurum activo — queries por mes × modo usado; Flash es rápido y barato, Deep es razonamiento profundo y pesa mucho más).

### Por qué este modelo y no otro

- **Honesto**: cada input del Scale corresponde a un costo real que tenemos en infraestructura, storage, IA, integraciones. No hay margen inflado por vanidad.
- **Predecible para vos**: los inputs los conocés antes de firmar. No hay sorpresa en el invoice porque creciste un poco o usaste más.
- **No castiga el éxito**: si vendés más por mejor marketing pero tu cantidad de órdenes/mes no se dispara (mejor ticket promedio, mejor recurrencia), tu precio no sube. Solo sube si efectivamente crece el volumen que procesamos.
- **Upsell natural**: podés arrancar con un pack chico y sumar módulos cuando tu operación los necesita, sin renegociar todo.

**[VISUAL: diagrama de dos ejes. Eje vertical = Scope (3 niveles de pack + ramita "à la carte"). Eje horizontal = Scale (inputs de volumen). Punto de intersección visible con etiqueta "Tu precio cerrado". Sin números.]**

---

## BLOQUE 3B — LOS 3 PACKS

**Título de la sección**
Tres formas de empezar, pensadas para tres momentos del negocio.

### Pack Activación

**Para quién**
Retailer que arranca, sin stack armado, que quiere el panel mínimo viable para dejar de depender de Excel y capturar el ROI básico sin pagar por módulos que todavía no usa.

**Qué incluye**
- Control de Gestión personalizable (panel base con cross-data).
- Finanzas básico (P&L multi-moneda + conciliación de órdenes).
- 1 módulo a elegir: NitroPixel (si tu prioridad es medir ads real) **o** Bondly (si tu prioridad es LTV y CRM).
- Onboarding guiado incluido.
- Soporte por chat + email.

**Qué NO incluye**
Aurum (IA asistente), Aura (creator economy), Marketplaces (MELI deep), Marketing Digital completo, Rentabilidad por SKU.

### Pack Crecimiento

**Para quién**
Retailer en expansión con ad spend activo, múltiples SKUs rotando, y necesidad de medir marketing en serio. Ya dejó la fase "prueba y error" y empieza a optimizar.

**Qué incluye**
- Todo lo del Pack Activación.
- Marketing Digital (campañas unificadas Meta + Google + TikTok + LinkedIn).
- NitroPixel (first-party, atribución multicanal, Truth Score).
- Productos (catálogo unificado multicanal + inventario + rotación).
- Rentabilidad (P&L por SKU, márgenes, detector de SKUs tóxicos).
- Soporte prioritario con SLA.

**Qué NO incluye**
Aurum (IA asistente), Aura (creator economy), Marketplaces (MELI deep), integraciones ilimitadas (hay cupo razonable).

### Pack Completo

**Para quién**
Retailer consolidado multicanal que quiere la plataforma entera como sistema operativo del negocio, incluyendo IA conversacional, programa de creators y cobertura MELI deep. También es el pack default para agencias que gestionan múltiples marcas.

**Qué incluye**
- Todos los módulos de la plataforma.
- Aurum (IA con memoria — 12 herramientas + Flash/Core/Deep).
- Bondly (LTV predictivo + audiencias).
- Aura (creator economy + atribución first-party + deals + dashboards públicos).
- Marketplaces (MELI deep — publicaciones, órdenes, preguntas, reputación, data Mercado Ads).
- Integraciones ilimitadas.
- Account manager asignado.
- Roadmap influencing (tu voz pesa en priorización de features).

### À la carte (opción avanzada)

**Para quién**
- Enterprise que negocia puntualmente y no quiere pagar lo que no usa.
- Agencias que revenden solo NitroPixel (o solo Bondly, o solo Aura) a sus clientes.
- Marcas que ya tienen herramientas específicas (ej: ya usan Klaviyo para CRM) y solo quieren módulos puntuales.

**Cómo funciona**
Cliente compone su plan módulo por módulo. Cada módulo tiene su fórmula de Scope base + su multiplicador de Scale específico. Disponible en discovery comercial.

**[VISUAL: 3 tarjetas horizontales lado a lado con los 3 packs. Colores suaves. Cada tarjeta: nombre del pack + chip "Para quién" + lista de qué incluye + lista de qué NO incluye. Abajo, tarjeta horizontal full-width para À la carte con estilo diferenciado (outline en lugar de solid).]**

---

## BLOQUE 4 — CÓMO TE COTIZAMOS (EL SCRIPT DE 2 PASOS)

**Título de la sección**
En 15 minutos tenés el número cerrado.

**Intro**
No pedimos que te comprometas con nada antes de ver si el producto te sirve. El discovery de pricing es simple y corto.

### Paso 1 — Definir scope (qué módulos)

Te preguntamos qué parte del negocio querés resolver primero. Con eso ubicamos el pack que mejor encaja (Activación, Crecimiento, Completo) o armamos à la carte si es tu caso.

Preguntas típicas de este paso:
- ¿Cuál es tu mayor dolor hoy: medir ads, controlar inventario, entender tu P&L real, gestionar MELI, manejar creators, o todo a la vez?
- ¿Qué herramientas ya usás y querés mantener?
- ¿Quién va a usar la plataforma dentro del equipo?

### Paso 2 — Definir scale (cuánto volumen)

Te pedimos 4 inputs para calibrar el multiplicador de volumen. Con eso te damos el número cerrado del mes, sin sorpresas.

Preguntas típicas de este paso:
- ¿Cuántas órdenes procesás por mes entre todos los canales?
- ¿Cuántos SKUs activos tenés hoy?
- ¿Cuántas integraciones vas a conectar (VTEX, MELI, Meta Ads, Google Ads, etc)?
- ¿Cuánto pensás usar el asistente IA (Aurum)?

### Resultado

Sales del discovery con:
- Cotización mensual cerrada (para el mes base).
- Trigger de recalibración (si cruzás cierto volumen, avisamos antes de recalcular).
- Condiciones de beta si aplican (descuento porcentual + duración).

**[VISUAL: timeline horizontal con 3 pasos: "Paso 1 Scope (5 min)" → "Paso 2 Scale (5 min)" → "Cotización cerrada (5 min)". Al final, chip verde "Sin compromiso de contratar".]**

---

## BLOQUE 5 — QUÉ INCLUYE EL PRECIO

**Título de la sección**
Lo que ves es lo que pagás.

### Incluido en todos los packs

- **Onboarding guiado**. El equipo te acompaña los primeros 15 días. Configuración de integraciones, mapeo de data, pase al modo normal. Sin setup fee separado.
- **Soporte técnico**. Chat + email en todos los packs. SLA y account manager en Crecimiento y Completo respectivamente.
- **Actualizaciones del producto**. Cualquier feature nueva que entre en el pack que contrataste, entra sin cobro adicional.
- **Migraciones de data**. Si venís de otra herramienta (Triple Whale, Klaviyo, paneles nativos), el equipo te ayuda a traer la data histórica sin costo adicional.
- **Acceso a documentación + training**. Biblioteca interna de cómo sacar partido de cada módulo, actualizada continuamente.

### NO incluido (y por qué)

- **Desarrollo custom**. Si necesitás un módulo completamente nuevo, no es parte del precio del pack — lo cotizamos aparte como proyecto.
- **Consultoría estratégica fuera de plataforma**. Armar estrategia de marketing, pricing de tus productos, plan de expansión multi-canal — no lo hacemos. Podemos recomendar partners.
- **Integraciones con herramientas fuera del catálogo**. NitroSales se integra con ~50 herramientas del ecosistema ecommerce (ver `/integraciones`). Si tu stack incluye algo fuera de eso (ej: un ERP custom), evaluamos caso por caso si entra como integración estándar o como proyecto aparte.

**[VISUAL: dos columnas. Izquierda (verde/cyan sutil) "Incluido" con 5 ítems. Derecha (gris) "No incluido (y por qué)" con 3 ítems. Transparencia total.]**

---

## BLOQUE 6 — PROGRAMA BETA (ADOPCIÓN TEMPRANA)

**Título de la sección**
Las marcas que entran ahora entran como socias del producto.

**Intro**
NitroSales está en etapa beta activa. Las marcas que contratan en este momento tienen condiciones especiales que reconocen que su uso real nos ayuda a calibrar el producto.

### Qué obtenés como marca beta

- **Descuento significativo sobre el precio estándar** durante los primeros 6-12 meses (porcentaje exacto se define en discovery según tamaño y complejidad de la marca).
- **Acceso directo al equipo de producto**. No pasa por tickets de soporte. Tenés línea directa con quien construye la plataforma.
- **Prioridad en roadmap**. Los features que vos pedís entran en backlog con peso extra. El 30-40% de lo que construimos cada sprint viene pedido por marcas beta.
- **Condiciones flexibles de salida**. Si en los primeros 30 días no estás usando la plataforma, devolvemos el dinero. Sin preguntas.

### Qué pedimos a cambio

- **Uso real**. Que realmente operes con la plataforma (no que compres y la dejes en el cajón).
- **Feedback concreto**. Al menos una llamada mensual de 30 minutos con el equipo para contarnos qué funciona, qué no, qué falta.
- **Referencias honestas**. Cuando hayas recorrido 3-6 meses con la plataforma, si la experiencia te convenció, te pedimos que nos ayudes a contar tu caso (quote, caso de uso, logo en la landing — vos elegís el nivel de exposición).

### Cuándo cierra el programa beta

No hay fecha fija pública. El programa cierra cuando cumplimos nuestras metas internas de calibración (aproximadamente al completar los primeros 15-20 clientes pagos). En ese momento el pricing pasa a su modo estándar (sin descuento beta). Las marcas que ya entraron como beta mantienen su condición original durante el período acordado.

**[VISUAL: tarjeta destacada (ancho completo) con Creator Gradient sutil. Lista de beneficios (4 items) + lista de contrapartidas (3 items). Chip "Cupo limitado — cierre al completar 15-20 clientes pagos". Sin fecha concreta.]**

---

## BLOQUE 7 — OBJECIONES Y PREGUNTAS FRECUENTES

### "¿Por qué no hay precio público en la landing?"

Porque el modelo es de dos dimensiones (Scope × Scale) y la combinación da un número distinto para cada marca. Publicar un rango genérico sería engañoso: la marca chica vería el número grande y se iría; la marca grande vería el número chico y esperaría pagar eso. En 15 minutos de discovery te damos el número exacto para tu caso. Es más rápido para vos y más honesto de nuestro lado.

### "¿Me pueden dar al menos un rango para saber si estoy en zona?"

En discovery, sí — con los inputs que nos das, te ubicamos el rango antes de cerrar el número. Si estamos lejos de lo que tenés presupuestado, lo decimos en el mismo discovery para no hacerte perder tiempo. Sin acting comercial.

### "¿Puedo empezar con un pack chico y crecer?"

Sí — es exactamente para eso que existen los packs escalonados. Un flujo típico es arrancar con Activación durante 3-6 meses, sumar Crecimiento cuando el ad spend empieza a requerirlo, y migrar a Completo cuando el equipo crece y la IA conversacional pesa más. El cambio entre packs es administrativo, no técnico (nada se pierde, nada se rompe).

### "¿Hay contrato anual con descuento?"

Hoy no. El producto evoluciona rápido y no queremos atarte a algo que va a crecer. Contrato mensual cancelable es la opción por default. Cuando haya 6+ meses de producto estable y features consolidadas, vamos a abrir anuales con descuento — pero no ahora.

### "¿Qué pasa si mis inputs cambian durante el mes?"

Cambios chicos (±10-15% del volumen declarado) no disparan nada — absorbemos la variación. Cambios significativos (ej: duplicás órdenes por una campaña exitosa, o sumás una integración nueva que multiplica eventos) disparan una conversación proactiva: te avisamos antes del próximo ciclo de facturación y recalibramos juntos. Nunca hay un invoice sorpresa.

### "¿Trial gratuito?"

No. Pero sí hay money-back de 30 días: arrancás pagando, y si en los primeros 30 días no estás usando la plataforma en serio (no configuraste integraciones, no abriste el dashboard, etc), devolvemos el dinero. Preferimos esto al trial gratis porque filtra la evaluación seria de la evaluación por curiosidad.

### "¿Pueden hacer algo si ya soy cliente de Triple Whale / Klaviyo / Nubimetrics?"

Sí. En discovery cruzamos tu stack actual con lo que NitroSales cubre. Si hay solapamiento real (ej: NitroPixel reemplaza a Triple Whale), diseñamos el switchover para que no pagues doble durante la migración. En algunos casos ofrecemos crédito del pack NitroSales por el mes de solapamiento.

### "¿Trabajan con agencias que revenden la plataforma?"

Sí — el modo À la carte está pensado para eso. Una agencia puede contratar NitroPixel puro (sin el resto del pack) y revenderlo a sus clientes bajo su marca. Margen de agencia se acuerda en partnership. Ya hay 2 agencias activas en este modelo.

### "¿Qué pasa si quiero cancelar?"

Aviso con 30 días del ciclo anterior y se cancela. Sin penalidad. Exportás toda tu data histórica en un click (formato CSV + PDF). Después de la cancelación la data queda disponible por 90 días para descarga en caso de que necesites algo — después se borra por política de retención.

### "¿El precio se publica alguna vez?"

Cuando los 15-20 clientes beta terminen su ciclo y tengamos data de consumo real para calibrar los coeficientes del modelo, sí — va a haber una tabla pública por packs y una calculadora de volumen. Eso va a pasar en los próximos 3-6 meses. Hasta entonces, el discovery de 15 minutos es el camino.

**[VISUAL: acordeón de preguntas. Cada una colapsa/expande con click. Primera abierta por default ("¿Por qué no hay precio público?").]**

---

## BLOQUE 8 — ARMÁ TU COTIZACIÓN

**Título de la sección**
El siguiente paso es concreto: un discovery de 15 minutos.

**Intro**
Si llegaste hasta acá, probablemente ya tenés claro qué parte de NitroSales te interesa. El discovery termina con tres cosas sobre la mesa:
- El pack (o composición à la carte) que mejor encaja con tu operación.
- El número mensual cerrado según tu volumen actual.
- Las condiciones beta si aplican a tu caso.

**Formato del discovery**
15 minutos por video, con quien lleva producto y ventas. Sin presentación corporativa larga. Vos contás tu caso, nosotros te mostramos el pricing específico, y salís con un correo-resumen con todo lo conversado.

**CTA primario**
Armá tu cotización → abre calendly (15 min)

**CTA secundario**
Tengo una pregunta primero → abre formulario de contacto

**[VISUAL: sección centrada, fondo oscuro con gradiente NitroSales. Botón primario grande. Debajo, formulario compacto de 4 campos (nombre, email, empresa, "qué querés resolver") como alternativa al calendly directo.]**

---

## BLOQUE 9 — FAQ COMPLEMENTARIAS

### ¿Qué pasa con la moneda de facturación?

Facturamos en pesos argentinos para marcas con actividad en Argentina. Para marcas LATAM con operaciones en múltiples países, facturamos en USD con tipo de cambio spot del día. Las variaciones de tipo de cambio se absorben durante el ciclo mensual.

### ¿Hay costo por usuario adicional?

Usuarios están incluidos dentro del multiplicador de Scale. Los packs traen cupos razonables (Activación: hasta 5 usuarios, Crecimiento: hasta 15, Completo: ilimitado dentro de razones operativas). Si necesitás algo fuera de eso, se conversa.

### ¿Los datos son míos? ¿Los puedo sacar?

Sí — la data es tuya desde el minuto uno. Export completo en un click, formato CSV + PDF. No hay data hostage. Si cancelás, tenés 90 días post-cancelación para descargar lo que necesites antes del borrado por retención.

### ¿Cómo me facturan?

Factura electrónica mensual (día 1 de cada mes). Medios de pago: transferencia bancaria, tarjeta de crédito corporativa, pago automático por domiciliación. USD se factura por transferencia internacional.

### ¿Qué pasa si me atraso con un pago?

La plataforma sigue funcionando durante 15 días (gracia). Al día 16 se restringe el acceso al dashboard principal manteniendo la data intacta. Al día 30 se pausa la cuenta sin pérdida de datos. Después de 60 días, se aplica la política de retención (data disponible para descarga por 90 días más). Preferimos llamarte antes que llegar a eso — la conversación siempre está abierta.

### ¿Puedo ver casos de uso y testimonios?

Sí — en `/` (matriz) y en las landings de producto específicas están los casos publicados. También podemos conectarte en discovery con 1-2 marcas beta del rubro similar al tuyo para que te cuenten la experiencia sin intermediación nuestra.

### ¿Con qué compiten en la decisión?

El competidor más común no es otra plataforma — es el combo "Excel + 5 herramientas sueltas + un desarrollador freelance que arma integraciones". La comparación contra ese combo está en `/control-gestion`. El resto (Triple Whale, Klaviyo, Nubimetrics, etc) se compara producto por producto en las landings respectivas.

### ¿Qué pasa si Anthropic/OpenAI cambia sus precios y afecta Aurum?

Los costos de IA están internalizados en el multiplicador de Scale del módulo Aurum. Si los proveedores de modelos cambian sus precios significativamente, absorbemos el movimiento durante el ciclo contratado y recalibramos en el próximo ciclo con aviso proactivo. Hasta ahora no hubo casos donde esto afectara materialmente a clientes.

**[VISUAL: dos columnas con preguntas agrupadas. Columna 1: facturación + pagos. Columna 2: data + casos + competencia. Acordeón colapsable.]**

---

## BLOQUE 10 — CIERRE

**Título de la sección**
El pricing es parte del producto. Transparente desde el primer minuto.

**Cierre narrativo**
No te vamos a vender urgencia falsa. No hay "precio especial hasta el viernes". No hay countdown timer. No hay contrato que te encierra. Si NitroSales resuelve lo que tu negocio necesita, el número cierra — y si no, cualquier precio es caro. El discovery de 15 minutos existe justamente para que esa evaluación la hagas con información real, no con marketing.

**CTA primario final**
Pedí tu cotización → abre calendly

**CTA secundario final**
Volver a la matriz → `/`

**[VISUAL: sección de cierre con espacio respirable. Una sola línea de texto principal, CTAs debajo. Fondo oscuro con partículas sutiles del gradiente NitroSales.]**

---

## Notas de implementación (Fase posterior — visual + dev)

### Cross-links obligatorios

- Al inicio (header): linkea a `/` (matriz) — imprescindible para que el lector que aterriza directo en `/precios` pueda contextualizar qué es NitroSales.
- En Bloque 3B (packs): cada módulo mencionado linkea a su landing Tier 2 o Tier 3 correspondiente (`/nitropixel`, `/aurum`, `/bondly`, `/aura`, `/marketplaces`, `/rentabilidad`, `/finanzas`, `/control-gestion`, `/marketing-digital`, `/productos`, `/alertas`, `/integraciones`).
- En Bloque 5 (incluido): linkea a `/integraciones` cuando menciona "~50 herramientas".
- En Bloque 7 (objeciones): linkea a `/control-gestion` cuando menciona la comparación vs. "Excel + 5 herramientas sueltas".
- En Bloque 9 (FAQ): linkea a `/` y a landings específicas cuando menciona casos de uso.
- En Bloque 10 (cierre): CTA secundario a `/` (matriz).

### Cross-links que NO van a /precios (evitar círculos)

- Ninguna otra landing debe tener CTA que grite precio antes de que el lector entienda el producto. Los CTAs a `/precios` viven en el Bloque 8 (Precio incluido en…) de cada landing Tier 2/Tier 3, y en la matriz.

### Reglas de voz (checklist antes de publicar)

- [ ] Cero signos de exclamación.
- [ ] Cero emojis en body.
- [ ] Voseo consistente ("contratás", "cotizamos", "sales", "entrás", "armás").
- [ ] Cero uso de "poderoso", "potente", "revolucionario", "el mejor precio del mercado", "precio imbatible", "oferta exclusiva", "último día", "precio disruptivo".
- [ ] Cero números USD/ARS en todo el documento (regla PRECIOS.md respetada).
- [ ] Cero promesas de ROI cuantificado ("recuperás la inversión en X meses" — NO aparece).
- [ ] Ningún countdown timer falso ni urgencia inventada.
- [ ] Programa beta descrito honestamente (con contrapartidas explícitas, no solo beneficios).
- [ ] Money-back + mensual cancelable + sin setup fee aparecen en Trust Strip Y en FAQ.
- [ ] Los 3 packs descritos con "para quién sí" + "qué incluye" + "qué NO incluye" (transparencia completa).

### Flujo narrativo

Hero (el precio se arma con vos) → Trust Strip (sin setup, sin contrato, money-back + programa beta) → Bloque 3 (modelo 2D Scope × Scale explicado) → Bloque 3B (los 3 packs + à la carte) → Bloque 4 (script de 2 pasos en 15 min) → Bloque 5 (qué incluye y qué no) → Bloque 6 (programa beta en detalle) → Bloque 7 (objeciones — 10 preguntas) → Bloque 8 (CTA armá tu cotización) → Bloque 9 (FAQ complementaria — 8 preguntas) → Bloque 10 (cierre honesto, sin urgencia falsa).

### Patrón distintivo vs. resto del Tier 3

- **Única landing del corpus sin números**. Todas las Tier 2/Tier 3 tienen ejemplos numéricos concretos (órdenes, SKUs, porcentajes, ROAS). `/precios` es explícitamente la excepción por regla de PRECIOS.md.
- **Primera landing con programa beta comunicado como bloque propio**. El resto menciona "beta" en pasada; acá es Bloque 6 con contrapartidas.
- **Primera landing con acordeón dedicado de objeciones de pricing**. Los 10 Bloque 7 están pensados en el orden en que un prospect real las hace.
- **Única landing que NO es funcional** (no describe un panel de producto). Es landing comercial pura. Tono diferente: menos descriptivo, más conversacional.

### Paralelismo con el resto del Tier 3

- **Mismo esqueleto** (Hero → Trust → Bloque 3 explicación del modelo → Bloque 3B los packs → Proceso → Qué incluye → Programa → Objeciones → CTA → FAQ → Cierre).
- **Mismo tono general** (honesto, sin exclamaciones, voseo, cero palabras prohibidas), pero con mayor componente conversacional — el lector que entra a `/precios` viene con ansiedad comercial y la landing tiene que bajar esa ansiedad, no sumarle.
- **Cross-links principales a `/` (matriz)** porque `/precios` no vende un módulo — vende el modelo de cobro. El que quiere saber qué le estamos cobrando primero necesita saber qué es NitroSales.

### Decisiones tomadas (2026-04-20) documentadas acá

- **Camino A elegido**: landing sin números USD/ARS. Respeta PRECIOS.md regla "nunca inventar precios hasta calibrar con data de los 3 trials".
- **Programa beta comunicado**: sí, en Bloque 6 propio, con contrapartidas explícitas. No oculto.
- **Money-back 30 días** mencionado en Trust Strip + FAQ.
- **Mensual cancelable** mencionado en Trust Strip + Objeciones.
- **Sin setup fee** mencionado en Trust Strip + Qué incluye.
- **No trial gratuito**: explicado honestamente en Objeciones (el money-back reemplaza al trial).
- **À la carte**: documentado en Bloque 3B como opción avanzada, no como default.

### Checklist para BRAND_VISION.md (Fase posterior)

- [ ] Diagrama 2D de Scope × Scale — cómo representarlo sin mostrar números.
- [ ] Tratamiento visual del Programa Beta (Creator Gradient como acento — único uso del gradient fuera de `/aura`, justificado porque el programa beta es de comunidad/co-creación).
- [ ] Acordeón de objeciones con jerarquía visual clara (primera abierta por default).
- [ ] CTA Calendly embebido o modal — decidir en dev.
- [ ] Formulario de contacto alternativo — integración con HubSpot / Notion / propio.
- [ ] Botón "Volver a matriz" estilo suave (no compete con CTA principal de discovery).

---

## Apertura del Sprint 3 (cierre del corpus de copy)

Con `/precios` completada, el corpus de landings Tier 3 llega a 9 landings:
- `/rentabilidad`
- `/productos`
- `/finanzas`
- `/control-gestion`
- `/marketing-digital`
- `/integraciones`
- `/alertas`
- `/marketplaces`
- `/precios` ← Sprint 3

Todas las referencias de CTA "ver planes" / "ver precios" que viven en las otras landings ahora tienen destino real (`/precios`). Cross-links rotos del corpus: cero.

Próximo paso post Sprint 3: cierre final del pase de consistencia con CONSISTENCIA_TIER3_v1.1_FINAL.md (si Tomy lo pide), o arranque directo de Fase 2B (BRAND_VISION.md) + Fase 4 (build Next.js real).

---

_Versión 1 de la landing `/precios`. Escrita como Sprint 3 del pase de consistencia Tier 3 (2026-04-20). Respeta estrictamente la regla de PRECIOS.md — cero cifras USD/ARS en el documento. Modelo D (Scope × Scale) descrito con los 3 packs + à la carte. Programa beta con contrapartidas. Lista para review de Tomy y para pasar a BRAND_VISION.md para diseño visual. Cierre del corpus Tier 3 Funcional — novena landing Tier 3._

_Última actualización: 2026-04-20 — v1 Sesión 3 VM (Sprint 3 pase de consistencia · cierre del ciclo de landings Tier 3). v1 respeta PRECIOS.md (cero números USD/ARS), comunica programa beta como bloque propio, y cierra con "armá tu cotización" en calendly de 15 min. Cross-link principal a `/` (matriz) y secundario a `/rentabilidad` (para ROI real). Próxima iteración post feedback de Tomy o post calibración de coeficientes con data de los 3 trials (lo que pase primero)._
