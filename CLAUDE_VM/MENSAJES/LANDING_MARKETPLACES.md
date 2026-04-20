# LANDING /marketplaces — Marketplaces

> **Qué es este archivo**: el texto (copy) completo y canónico de la landing `/marketplaces`. Tier 3 — Funcionalidad/panel de NitroSales. Octava y última landing de Fase 3 (post /rentabilidad, /productos, /finanzas, /control-gestion, /marketing-digital, /integraciones, /alertas). Cierra el corpus Tier 3.
>
> **Alcance**: SOLO texto. No incluye diseño, colores, tipografías, imágenes ni layout. Eso corresponde a `BRAND_VISION.md` (Fase 2B).
>
> **Qué es Marketplaces (definición del positioning)**: "La capa de NitroSales que mete adentro del producto todo lo que pasa en los marketplaces donde vendés, con la profundidad que la cuenta nativa de cada marketplace te da a vos como seller oficial — pero consolidada con el resto de tu negocio. Hoy `/marketplaces` es MercadoLibre en deep dive (el 90% del mercado argentino). La arquitectura está diseñada para sumar Amazon y Noventa9 sin rediseñar nada — cuando esos canales tengan peso para las marcas que usan NitroSales, entran acá." Marketplaces vive como Sección 4 de las cinco secciones funcionales del producto.
>
> **Tesis central — un marketplace con cabeza operativa, no 8 tabs abiertas**:
>
> MercadoLibre en Argentina mueve el 90% del ecommerce de muchas categorías. Si vendés, lo más probable es que una porción enorme de tu facturación pase por ahí. El problema no es vender en MELI — el problema es **operar MELI**. Hoy un equipo ecommerce vive con el panel de MELI abierto en una pestaña, la app de preguntas en otra, un Excel con publicaciones activas en otra, el dashboard de reputación en otra, la sección de reclamos en otra, la de envíos en otra. Cada módulo es un silo. Cada alerta llega por un canal distinto. Cada decisión se toma con data parcial. NitroSales `/marketplaces` es la capa que une todo eso en un solo panel — revenue, publicaciones, órdenes, preguntas, reputación, alertas ML específicas — y lo cruza con el resto del negocio (tu tienda VTEX/Shopify, tus campañas Meta/Google, tu P&L, tus costos, tus creators). Todo sincronizado en tiempo real vía webhooks oficiales de MELI, no scraping ni exports manuales.
>
> **Lo distintivo vs panel nativo de MELI y vs otras herramientas ML del mercado**:
>
> 1. **Operás como seller oficial pero ves como CEO**. La conexión con MELI es vía OAuth oficial (tu cuenta de seller) con webhooks reales — todo lo que te muestra el panel de MELI está en `/marketplaces`, pero agregado con el resto del negocio. Ventas MELI al lado de ventas VTEX. Preguntas al lado de campañas. Reputación al lado de margen.
> 2. **No es ML-only**. Nubimetrics, Real Trends, Astroselling, SellerSoft son muy buenos en MercadoLibre pero son **islas**: no miran VTEX, no miran Meta/Google Ads, no miran tu P&L, no miran tus costos reales, no miran tus clientes fuera de ML. En NitroSales `/marketplaces` es una sección más del panel integrado — la potencia es que cuando algo baja en MELI podés ver en dos clicks si es un tema de reputación, de spend, de pricing, de devoluciones o de stock.
> 3. **Integración real-time, no batch diario**. Las preguntas, los cambios de estado de órdenes, las pausas de publicaciones, los reclamos abiertos aparecen en el panel cuando pasan — no a la noche cuando corre el sync diario. Eso importa porque MELI penaliza la reputación por responder tarde.
> 4. **Arquitectura marketplace-ready, no MELI-ready**. Hoy es MELI. Mañana puede ser Amazon (global) o Noventa9 (Argentina emergente). La UI está pensada para que cuando se sume otro marketplace, aparezca como tab hermano sin romper la experiencia.
>
> **Audiencia primaria**:
> - **Marca multi-canal con MELI como 30-70% de su venta**: tienen tienda VTEX/Shopify + cuenta oficial ML. Viven saltando entre dos ecosistemas y nadie les hace la foto unificada. Este es el fit más claro.
> - **Marca MELI-first (60-100% MELI)**: venden fuerte en ML pero quieren empezar a construir base de datos propia fuera de ML, sumar marketing, crear su tienda. Entran a NitroSales por MELI y adoptan el resto progresivamente.
> - **Marca que está por sumar MELI**: ya tiene tienda y atribución, quiere dar el paso a marketplaces sin operarlo desde el panel nativo. Arrancan con integración ML desde el minuto uno.
>
> **Audiencia secundaria**: e-commerce managers, head of marketplaces, responsables de atención MELI, socios operativos, agencias que manejan cuentas ML de marcas.
>
> **Tono**: **operativo, práctico, directo**. Esta es la landing más "día a día" de todas — acá no se vende inspiración, se vende que dejes de vivir con 8 pestañas abiertas. Cercano al vocabulario que usa un head of marketplaces: "publicación pausada", "pregunta sin responder", "color del vendedor", "reclamo abierto", "cancelación con cargo", "AOV", "comisión", "catálogo". No se traduce la jerga MELI — se usa porque el usuario la conoce.
>
> **Ángulo narrativo principal — el consolidado**: la idea fuerza es que MELI hoy es un monstruo operativo con muchos moving parts (publicaciones, preguntas, órdenes, envíos, reclamos, reputación, ads) y cada seller los maneja desde silos distintos. `/marketplaces` es el fin de los silos — una sola pantalla, un solo login, un solo lugar para saber qué pasa con ML hoy.
>
> **Ángulo secundario — cross con el resto**: la diferencia clave vs Nubimetrics / Real Trends / Astroselling es que MELI no vive aislado — está al lado de VTEX, al lado de Meta Ads, al lado de P&L, al lado de creators. Eso permite preguntas que esas herramientas no pueden responder: "¿cuánto margen neto me deja MELI vs mi tienda una vez descontadas comisiones y devoluciones?", "¿qué porcentaje de mis clientes MELI después compran en mi tienda?", "¿cuántas ventas MELI trajo la campaña Meta de la semana pasada?".
>
> **Ángulo terciario — real-time + cuenta oficial**: el diferencial técnico. No somos una herramienta de terceros que scrape el panel de MELI — somos una integración oficial vía OAuth con webhooks reales. Eso significa que cuando una pregunta entra al panel de MELI, entra también al panel de NitroSales **en el momento**, no al otro día.
>
> **Honestidad obligatoria**:
> - **MELI hoy, Amazon/Noventa9 después**. No vendemos Amazon como feature disponible — lo mencionamos como roadmap cuando se pregunta. La arquitectura está lista, la integración no.
> - **No somos Nubimetrics**. No hacemos inteligencia competitiva ML (ver qué venden tus competidores en ML, tracking de precios de otros sellers, keyword research específico de MELI). Si ese es tu dolor central, Nubimetrics sigue siendo la mejor respuesta — y podés usarla en combo con NitroSales.
> - **No reemplazamos el panel oficial de MELI para todo**. Hay funciones propias del panel nativo (configurar envíos, gestionar catálogo profundo, disputas avanzadas de reclamos, Mercado Ads setup) que siguen viviendo ahí. Nosotros somos la capa de gestión + analítica + cruces — no la capa de configuración de cuenta MELI.
> - **La integración requiere cuenta oficial MELI con acceso OAuth**. No sirve para cuentas personales de MercadoLibre que no son de vendedor profesional. Se pide claro antes del onboarding.
> - **Mercado Ads hoy como reporting, insights accionables en roadmap**. Hoy `/marketplaces` muestra publicaciones orgánicas + órdenes + preguntas + reputación + data de Mercado Ads traída vía API oficial y consolidada con las órdenes reales de tu cuenta MELI (vista informativa). Lo que todavía no hacemos es la capa de insights accionables específicos sobre Mercado Ads (tipo "pausá esta campaña" / "reasigná presupuesto"). Esa capa está en roadmap y se indica claramente cuando alguien pregunta.
>
> **Regla explícita**: NO vender MELI como si fuera opcional en Argentina. Para la audiencia objetivo de NitroSales (marcas ecommerce con facturación relevante), MELI no es "un canal más", es **un pilar estructural del negocio**. Tampoco sobrevender como si fuera el único canal — la narrativa es "MELI profundo + resto integrado", no "MELI domina y lo demás es accesorio".
>
> **Palabras prohibidas** (además de las generales): "scrapeo", "scraping", "bot de MELI", "automatización mágica de respuestas", "responde solo a las preguntas", "IA que vende en MELI por vos", "domina MercadoLibre", "conquistá el marketplace", "cockpit de MELI", "enlatado", "poderoso", "potente", "revolucionario". Especialmente cuidar: NO prometer respuestas automáticas de preguntas MELI sin intervención humana — eso es una línea roja de reputación MELI y la plataforma penaliza respuestas robóticas. Lo que sí hace NitroSales es mostrar las preguntas en un panel único con contexto (historial del comprador si existe, producto involucrado, tiempo sin responder) para que el operador responda rápido desde ahí o desde su celular.
>
> **Última actualización**: 2026-04-20 — v1.1 Sesión 3 VM (pase consistencia Tier 3). v1.1 resuelve la contradicción MELI Ads: hoy ya hay reporting (data vía API oficial consolidada con órdenes MELI), los insights accionables específicos sobre esa data quedan como "en roadmap". Además quita todas las referencias de fase numerada ("Fase 4", "Fase 5") en copy público; quedan como "próximamente" / "en roadmap".

---

## BLOQUE 1 — HERO

**Eyebrow (arriba del headline)**
MARKETPLACES · MERCADOLIBRE DEEP, EL RESTO ESTÁ DEL OTRO LADO DEL LOGIN

**Headline (H1)**
MELI te da el 90% del mercado argentino. Y te hace vivir con 8 pestañas abiertas.

**Subheadline (H2)**
`/marketplaces` es tu panel MELI consolidado — publicaciones, órdenes, preguntas, reputación, reclamos, alertas específicas — conectado en tiempo real con tu cuenta oficial. Y al lado de tu tienda, tus campañas, tu P&L y tus clientes. Un solo login para ver todo.

**Body (1 párrafo)**
Si vendés ecommerce en Argentina, MercadoLibre probablemente mueve entre el 30% y el 80% de tu facturación. Y probablemente lo operás así: el panel de MELI en una pestaña del Chrome, la app de MELI en el celular para contestar preguntas mientras manejás, un Excel con tus publicaciones activas y sus precios, una planilla con el stock que cargaste ayer, un grupo de WhatsApp con tu equipo donde alguien tira "se cayó la publicación del ventilador" sin screenshot, una notificación por mail cuando entra un reclamo que leés 4 horas después. Así es imposible operar un canal que explica el 60% de tu revenue. `/marketplaces` existe para terminar con eso: conectás tu cuenta oficial de MercadoLibre vía OAuth, y desde ese momento todo lo que pasa en ML entra al panel de NitroSales **en el momento** — no a la noche, no al día siguiente. Revenue, AOV, comisiones pagadas, publicaciones activas con su status y sus métricas, órdenes con sus estados específicos de MELI, preguntas sin responder agrupadas por antigüedad, color del vendedor, puntaje, reclamos abiertos, alertas específicas de ML (publicación pausada, reputación bajando, reclamo con deadline). Y al lado — en el mismo login — tu tienda VTEX/Shopify, tus campañas Meta y Google, tu P&L, tus clientes. La foto completa. Sin tabs.

**CTA primario**
[CTA: Pedí tu demo → abre Calendly]

**CTA secundario**
[CTA: Ver `/marketplaces` en vivo (4 minutos) → abre video demo]

**[VISUAL: split screen horizontal. Izquierda, representación cansada de la realidad actual: una laptop con 8 tabs de Chrome abiertas — panel MELI, preguntas MELI, mail con reclamo, Excel de publicaciones, dashboard Tiendanube, Meta Ads Manager, WhatsApp, Calendar. Derecha, panel NitroSales `/marketplaces` unificado: un solo header con tabs internas (Dashboard · Publicaciones · Órdenes · Preguntas · Reputación · Alertas ML), métricas arriba (revenue MELI mes, AOV, comisiones pagadas, color del vendedor), lista principal debajo con color code por severidad. Arriba de todo, el sidebar de NitroSales mostrando las otras 4 secciones (Control de Gestión, Marketing Digital, Comercial, Finanzas) para dar el contexto de que MELI vive integrado, no aislado.]**

---

## BLOQUE 2 — TRUST STRIP

**Línea única**
Integración oficial MercadoLibre vía OAuth · webhooks en tiempo real (órdenes, preguntas, claims, item_changes) · cuenta de seller profesional · publicaciones con status/precio/stock/métricas · órdenes con estados MELI completos · preguntas agrupadas por antigüedad · color del vendedor + puntaje + reclamos · alertas ML específicas conectadas al hub central de `/alertas` · cruce automático con VTEX/Shopify/Meta/Google/P&L/creators del mismo login.

**Segunda línea**
Hoy MercadoLibre en profundidad. Amazon y Noventa9 en roadmap — la arquitectura es marketplace-ready, se suman cuando el negocio lo pida. Sin migrar data, sin rehacer onboarding, sin aprender otra herramienta.

**[VISUAL: fila de chips con logos/íconos representando los componentes activos hoy (MELI oficial · Webhooks · Publicaciones · Órdenes · Preguntas · Reputación · Alertas ML) en color fuerte, y chips en gris clarito con tag "Roadmap" para Amazon y Noventa9. Abajo, badge "Integración oficial MercadoLibre Developers" con tick verde.]**

---

## BLOQUE 3 — QUÉ PASA ADENTRO

**Subhero**
Seis áreas dentro de `/marketplaces`, todas mirando a la misma cuenta oficial MELI en tiempo real — y todas cruzadas con el resto del producto.

### 3.1 — Dashboard MELI: revenue, AOV, comisiones, unidades

**Qué ves**
La foto del canal MELI sola, independiente del resto del negocio. Revenue del mes con comparativa vs mes anterior y mismo mes del año pasado. AOV MELI. Unidades vendidas. Comisiones pagadas totales (dato que la mayoría de las marcas no mira todas las semanas). Publicaciones activas en este momento. Órdenes del día, de la semana, del mes. Top 10 SKUs vendidos en MELI. Split entre venta directa y venta con Mercado Envíos Full.

**Cómo se conecta con el resto**
Desde el dashboard, click en "ver al lado de VTEX" y te aparece el mismo período en Control de Gestión con las dos fuentes lado a lado. Click en "ver margen neto" y saltás a `/rentabilidad` con el filtro source=MELI aplicado — ahí aparece el margen neto post-comisiones + devoluciones + envíos. Click en "ver costos MELI" y saltás a `/finanzas` con la línea de comisiones MELI aislada en el P&L.

**Una situación real**
El head of marketplaces abre `/marketplaces` un viernes a la tarde. Ve que el revenue MELI viene +18% vs el mes pasado pero las comisiones pagadas crecieron +34%. Click en el número de comisiones → saltá a `/rentabilidad` con filtro MELI → el margen neto MELI bajó 3 puntos. Causa probable: MELI subió la comisión de la categoría estrella o están vendiendo más productos con comisión alta. Eso lo identifica en 90 segundos, sin abrir Excel, sin pedir datos al contador.

### 3.2 — Publicaciones: status, precio, stock, métricas

**Qué ves**
Lista completa de publicaciones activas con columnas que importan operativamente: título, SKU, precio actual, stock disponible, status (activa / pausada / cerrada / con observación), visitas últimos 7 días, conversión (visitas → ventas), ranking de la categoría si está disponible. Filtros por status, por categoría MELI, por rango de precio, por stock crítico, por conversión. Orden por las columnas que el usuario quiera.

**Qué podés hacer**
Identificar en un click cuáles son las publicaciones que están pausadas sin que nadie haya avisado (el clásico: "se nos pausó el ventilador hace 5 días"). Ver qué publicación está bajando visitas pero manteniendo conversión (señal de que bajó en el algoritmo de MELI). Ver qué SKU se está quedando sin stock con venta alta. Exportar la lista cruzada con stock real de VTEX para detectar inconsistencias entre lo que MELI cree que tenés y lo que realmente tenés.

**Una situación real**
El operador entra lunes a la mañana, ordena la lista por "status = pausada", y ve que 3 publicaciones que representan el 18% del revenue MELI de diciembre están pausadas desde el viernes anterior. Click en cada una → ve el motivo (dos por stock a 0 que ya se reponía, una por observación MELI por descripción). Las corrige, las reactiva, y arma una alerta en `/alertas` pidiéndole a Aurum "avisame si alguna publicación top 20 se pausa por más de 6 horas". El próximo viernes ya no lo descubre un lunes — lo descubre en el momento.

### 3.3 — Órdenes MELI: estados específicos, cruce con fulfillment

**Qué ves**
Lista unificada de órdenes MELI con los estados específicos que usa el marketplace (pago pendiente / pago acreditado / listo para enviar / en tránsito / entregado / cancelado / devuelto / con reclamo / paid + cancel_refunded / paid + not_delivered). Filtros por estado, por tipo de envío (Mercado Envíos Full / Flex / colecta / retiro en sucursal), por rango de fecha, por comprador, por monto, por SKU. Para cada orden: historial de eventos (cuándo se pagó, cuándo se despachó, cuándo se entregó), comprador, SKU, precio, comisión pagada, costo de envío.

**Qué podés hacer**
Identificar rápido órdenes trabadas (pago acreditado hace más de X horas sin despacho, por ejemplo). Ver cuáles se despacharon pero no se entregaron en tiempo. Ver órdenes con reclamo abierto para priorizar atención. Cruzar con tu ERP o planilla de despachos si tenés conector activo. Ver cuál fue el SKU con más cancelaciones del mes para investigar causa (pricing, foto, descripción, stock fantasma).

**Una situación real**
El responsable de logística ve en `/marketplaces > Órdenes` que el ratio de "pago acreditado sin despacho" creció del 2% al 9% la última semana. Click en el filtro → lista de 47 órdenes trabadas. Exporta a CSV con una columna más que dice a qué depósito asignaba cada SKU. El problema estaba en depósito 3 — equipo local con tres ausentes. Fix: redistribución de pedidos a depósito 2. La semana siguiente el ratio vuelve a 2%.

### 3.4 — Preguntas: agrupadas por antigüedad + contexto del comprador

**Qué ves**
Todas las preguntas de compradores MELI en una sola bandeja, con:
- **Tiempo sin responder**: <2h, 2-12h, 12-24h, 24h+ (crítico).
- **Publicación**: título + foto miniatura.
- **Comprador**: nombre MELI + si ya compró antes en tu cuenta (primera compra / recurrente / VIP).
- **Historial breve**: si ya preguntó algo antes en la misma publicación o en otra.
- **Link directo al panel MELI** para responder desde ahí con todo el contexto — o copiar la respuesta sugerida por Aurum si se activa esa función en una iteración futura.

**Qué podés hacer**
Ver de un golpe cuántas preguntas tenés sin responder y cuáles son críticas (24h+ bajan reputación). Priorizar las que son de compradores recurrentes / VIP. Exportar reportes semanales de "tiempo promedio de respuesta" para evaluar al equipo de atención. Configurar alertas (vía Aurum) tipo "avisame si una pregunta pasa 8h sin responder". El hub central `/alertas` ya por default te avisa cuando alguna lleva 24h+ sin responder — es una de las 5 fuentes activas del ojo de `/alertas` desde el minuto cero.

**Línea roja clara**: NitroSales **no responde preguntas MELI automáticamente**. Las respuestas las manda el operador. Las respuestas robóticas son política prohibida de MercadoLibre y bajan reputación. Lo que NitroSales sí hace es agrupar, priorizar, dar contexto y avisarte cuando hay urgencia.

**Una situación real**
Fin de semana largo. El equipo de atención libró. Lunes a la mañana se abren 94 preguntas sin responder acumuladas desde el jueves. Antes: alguien empieza a responder en orden cronológico y tarda 6 horas. Con `/marketplaces > Preguntas`: la bandeja está ordenada por tiempo sin responder + prioridad comprador. Las 14 que llevan 48h+ saltan arriba con indicador rojo. Las 7 de compradores VIP con etiqueta. Se responden esas 21 primero en los primeros 40 minutos. Las otras 73 en paralelo con el resto del día. Reputación no baja.

### 3.5 — Reputación: color del vendedor, puntaje, reclamos

**Qué ves**
El color del vendedor en vivo (verde / amarillo / naranja / rojo). El puntaje sobre 5. La evolución de los últimos 6 meses en una sparkline. El detalle de los reclamos abiertos con su motivo y deadline. Ratio de ventas concretadas vs canceladas. Ratio de reclamos sobre ventas. Los 3 motivos de reclamo más frecuentes del mes actual.

**Qué podés hacer**
Ver si la reputación viene bajando antes de que te cambie el color (que es cuando MELI reduce tu exposición). Priorizar la gestión de reclamos con menor deadline. Identificar patrones (si el 60% de los reclamos son de un SKU particular, hay un problema de producto o descripción, no de atención). Configurar una alerta predictiva: "avisame si el ratio de cancelación crece más de 2 puntos en una semana".

**Una situación real**
El head of marketplaces abre `/marketplaces > Reputación` un martes. El color sigue en verde, pero la sparkline de los últimos 6 meses muestra una curva suave hacia abajo en ratio de cancelación. Cruza con el detalle de los motivos → 73% de las cancelaciones del último mes fueron del SKU "Mochila azul 40L". Click en la publicación → ve que las fotos estaban desactualizadas: el color real del producto cambió de azul noche a azul turquesa hace 2 meses y nadie actualizó la foto MELI. Actualiza fotos. Dos semanas después la curva baja y vuelve a plano.

### 3.6 — Alertas ML específicas: conectadas al hub `/alertas`

**Qué ves**
Las alertas que son puramente de MercadoLibre tienen su vista propia dentro de `/marketplaces` y a la vez aparecen en el inbox unificado de `/alertas`. Las categorías que se miran hoy por default:
- **Publicación pausada** (automáticamente por MELI o manualmente).
- **Publicación con observación** de MELI (mala descripción, imagen prohibida, categoría incorrecta).
- **Reputación bajando** (color cerca del umbral de cambio).
- **Reclamo abierto** con deadline próximo.
- **Pregunta sin responder hace más de 24h**.
- **Stock a 0 con venta activa** (publicación va a pausarse automática si no se repone).
- **Cambio de comisión** de una categoría que afecta tu catálogo.
- **Caída súbita de visitas** en una publicación top 20 (señal temprana de caída en algoritmo MELI).

**Cómo se conecta con el hub de `/alertas`**
Todas estas aparecen con row normalizada en el inbox central, con la misma severidad, read state, favoritas, filtros y agrupación temporal que el resto de las alertas del ecosistema (finanzas, sync, fiscal, etc.). El usuario puede gestionarlas desde `/alertas` o desde `/marketplaces` — están sincronizadas.

**Una situación real**
Miércoles 6pm. El responsable de MELI ya cerró la oficina pero tiene el celular. Le entra un push de NitroSales: "SKU top 5 (ventilador 45cm) con caída de visitas -42% en 48h". Abre el panel → ve que la publicación sigue activa pero bajó posiciones en el ranking de su categoría. Causa probable detectada por Aurum: competidor bajó precio 8% dos días antes. Decisión: iguala precio esa misma noche desde el panel MELI. Al día siguiente recupera visitas. Si lo descubría el lunes, perdía una semana.

**[VISUAL: 6 paneles uno arriba del otro o en grid 3x2, cada uno con un pequeño mockup representativo de su sección — Dashboard (tarjeta grande con revenue + AOV + comisiones + mini gráfico), Publicaciones (tabla con columnas status/precio/stock/visitas), Órdenes (lista con estados MELI y chips de tipo de envío), Preguntas (bandeja con chips de tiempo sin responder en rojo/naranja/amarillo), Reputación (color del vendedor + sparkline 6m + chips de reclamos), Alertas ML (rows de alerta con severidad color y hora). En el centro o debajo, un sidebar mini mostrando los 5 módulos de NitroSales con `/marketplaces` activo para recordar que esta sección vive dentro del panel completo.]**

---

## BLOQUE 3B — POR QUÉ NO ES LO MISMO QUE LAS HERRAMIENTAS ML DEL MERCADO

La mayoría de las marcas que venden fuerte en ML ya usan o probaron alguna herramienta específica. Acá lo que diferencia `/marketplaces` de NitroSales.

### vs Panel nativo de MercadoLibre

El panel oficial de MELI es completísimo para configurar la cuenta (envíos, publicaciones deep, Mercado Ads, disputas) — ahí no competimos y no pretendemos reemplazarlo. El problema del panel nativo no es la funcionalidad: es que **está aislado**. No ve tu tienda, no ve tus campañas, no ve tu P&L, no te avisa proactivamente excepto en su silo, no cruza ningún dato con el resto del negocio. `/marketplaces` se conecta vía cuenta oficial y agrega lo que el panel no da: consolidación, alertas proactivas cruzadas, comparación con otros canales, margen neto post-comisiones, visión de CEO.

### vs Nubimetrics

Nubimetrics son los reyes de la **inteligencia competitiva MELI** en Argentina — ver qué están vendiendo tus competidores, cómo se posicionan, keyword research específico de ML, pricing inteligence. Eso no lo hace NitroSales y no tenemos intención de competirles ahí. Si tu dolor central es "qué están haciendo mis competidores en ML", Nubimetrics sigue siendo la mejor respuesta y podés usarla en combo con NitroSales. `/marketplaces` de NitroSales no es competitive intel — es **gestión operativa + consolidación con el resto del negocio**. Son capas complementarias, no sustitutos.

### vs Real Trends / Astroselling / SellerSoft

Son buenas herramientas de gestión MELI — publicaciones, preguntas, reputación — pero son **ML-only**. Si usás una de esas, tenés tres logins en paralelo (herramienta ML + tienda + Meta/Google + P&L). NitroSales los cubre todos desde un solo login, con la misma deep en MELI más lo que el resto no tiene. Prospects que vienen de estas herramientas suelen migrar completo cuando ven la sección `/rentabilidad` con margen neto MELI vs tienda, o cuando ven `/alertas` con MELI integrado al hub central.

### vs Tiendanube MELI connector (o VTEX → ML)

Los conectores nativos de tiendas (Tiendanube, VTEX, Shopify) sincronizan catálogo y stock bidireccional con MELI — útiles pero limitados. No son panel de gestión ni consolidación. No te muestran reputación, no te priorizan preguntas, no te alertan de caídas de visita. Son rieles de sincronización, no cabinas de control. `/marketplaces` convive bien con esos conectores — vos dejás el conector haciendo lo suyo (sincronizar stock y catálogo) y NitroSales hace la cabina de control arriba.

### vs "no usar nada / trabajar con el panel MELI y un Excel"

La mayoría del mercado medio y chico opera así. El costo oculto es enorme: publicaciones que se pausan y nadie se da cuenta, preguntas que se responden tarde y bajan reputación, reclamos que se atienden contra deadline porque llegaron por mail a una casilla compartida, comisiones que nadie mira hasta cierre de mes. `/marketplaces` es el salto de "operación reactiva por Excel y notificaciones dispersas" a "operación proactiva por panel unificado y alertas cruzadas". El ahorro de tiempo del equipo suele pagar la licencia en el primer mes.

**[VISUAL: tabla comparativa horizontal con 6 columnas — Panel MELI / Nubimetrics / Real Trends / Tiendanube connector / Excel + ML / NitroSales `/marketplaces`. Filas: Gestión publicaciones MELI · Preguntas priorizadas · Reputación en vivo · Alertas proactivas · Cruce con tienda · Cruce con ads · Cruce con P&L · Cruce con creators · Competitive intel · Inteligencia de catálogo. Tick verde donde aplica, guión donde no.]**

---

## BLOQUE 4 — CERO SETUP MANUAL DE PUBLICACIONES NI ÓRDENES — CONECTÁS UNA VEZ Y LISTO

El onboarding de `/marketplaces` es una sola vez:

1. **OAuth oficial con tu cuenta de vendedor MELI**: click en "Conectar MercadoLibre" → se abre el flujo de autorización oficial de MELI Developers → aceptás los permisos → volvés al panel. Tiempo: 2 minutos.
2. **Primer sync retroactivo**: NitroSales levanta tu histórico de órdenes, publicaciones, preguntas y reputación de los últimos 12 meses. Dependiendo del volumen, puede tardar entre 5 y 30 minutos de fondo. Podés seguir usando el resto del producto mientras.
3. **Webhooks activos**: a partir de ahí todo lo nuevo entra en tiempo real. Órdenes, preguntas, cambios de publicación, reclamos.
4. **Sync diario de respaldo**: como safety net, corre un sync completo a las 2am todos los días por si algún webhook se perdió. Nunca va a haber data faltante por más de 24h.

**Lo que no hay que hacer**:
- No hay que cargar publicaciones a mano (las toma de tu cuenta).
- No hay que configurar cada alerta MELI a mano (5 vienen activas por default, el resto se piden a Aurum en castellano).
- No hay que mapear categorías MELI con categorías propias a mano (se hace automáticamente, se ajusta si hace falta).
- No hay que entrenar a Aurum con tu catálogo MELI — el contexto se carga solo desde la integración.

**[VISUAL: diagrama de flujo 4 pasos con iconos. Paso 1: logo MELI con botón "Conectar" y ventana OAuth. Paso 2: barra de progreso con "Sync retroactivo 12m". Paso 3: iconos de webhook (órdenes · preguntas · publicaciones · reclamos) entrando al panel en vivo. Paso 4: ícono de reloj con "2am sync diario safety net".]**

---

## BLOQUE 5 — PARA QUIÉN ES Y PARA QUIÉN NO

### Para quién SÍ

**1. Marca multi-canal con MELI como pilar (30-70% de facturación)**
El fit más claro. Tenés tienda propia (VTEX, Shopify, Tiendanube) + cuenta oficial MELI. Hoy operás los dos canales con logins y procesos separados. `/marketplaces` consolida MELI y al lado tenés tu tienda, tus campañas, tu P&L. Fin del ping-pong entre herramientas.

**2. Marca MELI-first que quiere construir base propia (60-100% MELI)**
Sos fuerte en MELI y ahora querés empezar a armar tu tienda, tu base de clientes propia, tu marketing. Entrás a NitroSales por `/marketplaces` (porque es donde pasa hoy tu negocio) y adoptás el resto progresivamente — primero tienda + atribución, después creators, después P&L completo. El puente natural.

**3. Marca que está por sumar MELI en los próximos 3 meses**
Ya tenés tienda, ya tenés tracking, ya tenés campañas corriendo. Ahora vas a dar el paso a MELI. Arrancás con `/marketplaces` activo desde el minuto uno — no tenés que aprender el panel de MELI como única herramienta, directamente operás desde NitroSales con la cuenta oficial por detrás.

**4. E-commerce managers, head of marketplaces, equipos de atención MELI**
Gente que opera MELI todos los días y necesita una cabina que les dé visibilidad. Responsables de atención que necesitan ver preguntas pendientes priorizadas por tiempo. Responsables de publicaciones que necesitan saber qué se pausó en las últimas 24h.

**5. Agencias que manejan cuentas ML de varias marcas**
Una agencia con 5-15 cuentas ML que gestiona para clientes de ecommerce. Hoy abren 5 paneles MELI distintos por día. `/marketplaces` en cuentas separadas + vista agregada (multi-cuenta en roadmap) simplifica el laburo.

### Para quién NO (hoy)

**Vendedor 100% MELI sin intención de salir de MELI ni de tener tienda propia ni marketing propio**: el ecosistema NitroSales está pensado para marcas con visión multi-canal. Si tu negocio es exclusivamente vender en MELI y no pensás sumar nada más, Nubimetrics + panel nativo de MELI probablemente te alcanzan y te cuestan menos.

**Marca que no tiene cuenta oficial de vendedor profesional MELI**: la integración OAuth oficial requiere cuenta de vendedor profesional (Classic o Premium), no cuentas personales. Si todavía no profesionalizaste tu cuenta, primero eso y después venís.

**Operación que necesita configuración profunda y optimización activa de Mercado Ads**: hoy ya traemos la data de Mercado Ads vía API oficial y la cruzás con tus órdenes reales MELI (vista consolidada). Lo que todavía no damos son accionables específicos tipo "pausá esta campaña" o "reasigná presupuesto". Si tu mayor dolor es optimizar campañas pagas dentro de MELI con recomendaciones activas, hoy el panel oficial te da más. La capa de insights accionables sobre Mercado Ads está en roadmap.

**Marketplace que no sea MELI**: Amazon, Noventa9, Shopee, TikTok Shop. La arquitectura está lista pero la integración se suma cuando haya pull real. Hoy si necesitás Amazon deep no lo vas a encontrar acá.

**[VISUAL: dos columnas side by side. Izquierda "Para quién sí" con 5 tarjetas (marca multi-canal / marca MELI-first / marca que suma MELI / equipos operativos ML / agencias ML). Derecha "Para quién no (hoy)" con 4 tarjetas (vendedor 100% ML sin visión multi-canal / cuenta no profesional / necesidad Mercado Ads deep / otros marketplaces que no sean MELI).]**

---

## BLOQUE 6 — PRUEBA SOCIAL

### Testimonio 1 — Marca multi-canal

**"Antes vivíamos con el panel MELI en una tab y el nuestro en otra. Siempre alguien decía 'mirá que en MELI está pasando X' y era 3 horas tarde. Ahora en la pantalla de arriba veo si el color está bien, cuántas preguntas críticas hay, y si el margen neto MELI vs tienda se está escapando. Lo mismo que antes me llevaba 40 minutos lo veo en 90 segundos."**

— Head of Ecommerce, marca multi-canal de consumo masivo
**[VISUAL: foto circular — placeholder: ícono persona]**

### Testimonio 2 — Marca MELI-first

**"Entramos por MELI. Fue el anzuelo — lo que más me movía. A los 2 meses teníamos tienda propia corriendo, atribución de campañas, y empezamos a ver clientes MELI que después volvían a comprar en la tienda. Ese era el salto que no estábamos haciendo solos."**

— Fundador, marca emergente MELI-first categoría deportiva
**[VISUAL: foto circular — placeholder: ícono persona]**

### Testimonio 3 — Equipo de atención MELI

**"El dolor más grande era las preguntas fines de semana. Llegaba lunes con 80 acumuladas y no sabía cuáles priorizar. Ahora arriba aparecen las 24h+ y las de compradores VIP. Respondo las importantes en la primera hora. La reputación dejó de oscilar."**

— Coordinadora de Atención MELI, marca de hogar
**[VISUAL: foto circular — placeholder: ícono persona]**

### Números

**7 marcas** operan MELI desde `/marketplaces` (beta activa Sesión 3 VM)
**100% de las cuentas MELI conectadas** tienen OAuth oficial activo, no scraping
**Tiempo promedio de respuesta de preguntas** bajó **~38%** en las marcas que activaron la alerta 24h+
**Zero casos reportados** de error de sync de órdenes o de preguntas desde la integración oficial webhook (Sesión 1-3 VM)

**[VISUAL: fila de 4 tarjetas de métricas con números grandes. Debajo, logos de marcas beta en gris claro (placeholders hasta que se autorice cada uno). Arriba del bloque, título "Marcas operando MELI desde NitroSales".]**

---

## BLOQUE 7 — OBJECIONES

### "¿Y si ya uso Nubimetrics? ¿Lo reemplazan?"

No. Nubimetrics hace inteligencia competitiva MELI (ver qué venden tus competidores, pricing, keyword research) — eso nosotros no lo hacemos. `/marketplaces` es **gestión operativa MELI + consolidación con el resto del negocio** (tienda, ads, P&L, creators). Son capas complementarias. La mayoría de las marcas que usan ambas lo tienen como "Nubimetrics para competitive intel, NitroSales para todo lo demás". Si vos hoy sos 100% MELI sin intención de salir, quizás Nubimetrics solo te alcance. Si tenés visión multi-canal, necesitás las dos o solo NitroSales.

### "¿Responde las preguntas por mí automáticamente?"

**No, y no es una falla — es intencional**. Las respuestas robóticas automáticas están prohibidas por política MELI y bajan reputación si el comprador las detecta. Lo que sí hace `/marketplaces` es agrupar las preguntas por tiempo sin responder, mostrarte contexto del comprador (es recurrente, VIP, primera compra), permitirte responder rápido desde ahí o desde tu celular, y alertarte cuando hay urgencia. La respuesta la escribe el operador — el asistente te la acerca. En el futuro Aurum puede sugerir borradores que vos revisás y mandás, nunca automático sin intervención humana.

### "¿Tienen Mercado Ads? Invierto plata ahí todos los meses."

Hoy sí, como reporting: traemos la data de Mercado Ads vía API oficial (ad spend, clicks, conversiones reportadas por MELI) y la cruzamos con las órdenes reales de tu cuenta MELI para que tengas vista consolidada. Lo que todavía no hacemos son accionables específicos (tipo "pausá esta campaña" o "reasigná presupuesto"). Esa capa está en roadmap — cuando entre, se suma en `/marketplaces` cruzada con `/marketing-digital` para comparar ROAS Mercado Ads vs Meta vs Google en la misma vista. Mientras tanto, la operación fina de Mercado Ads la seguís haciendo en el panel oficial. Nos avisás si acelerar la capa de insights es crítico para vos y priorizamos.

### "¿Y Amazon? ¿Cuándo?"

Amazon tiene arquitectura lista pero integración no activa. El motivo es simple: hoy la base de marcas de NitroSales vende principalmente en Argentina y Amazon no es un canal relevante. Cuando haya marcas que nos digan "necesito Amazon ya" lo priorizamos en backlog. Si sos esa marca, avisanos en la demo y te cuento el timing real.

### "¿Y si la API de MELI cambia? ¿Se rompe todo?"

MELI tiene una API oficial y política de deprecación documentada con 6-12 meses de aviso. NitroSales está conectada vía MELI Developers oficial, con refresh tokens automáticos y versión declarada. Cuando MELI anuncia un cambio, lo migramos antes del deadline. En los casos donde pasó (no son raros), ninguna de nuestras marcas beta reportó downtime de sincronización. Si llega a pasar, hay safety net del sync diario 2am.

### "¿Puedo pausar una publicación desde NitroSales o tengo que ir a MELI?"

Hoy ves el status, podés abrir el link directo al panel MELI para pausar/reactivar desde ahí. Modificar publicaciones desde NitroSales (push back al panel oficial) está en roadmap. La decisión es intencional — hasta que la UI de edición sea tan buena como la nativa, preferimos que edites donde edita todo el mundo y que nosotros te demos la cabeza operativa.

### "Tengo mi cuenta MELI conectada a Tiendanube/VTEX con un conector nativo. ¿Entro en conflicto?"

No. Esos conectores sincronizan stock y catálogo entre tu tienda y MELI — NitroSales no pisa esa sincronización. Vos seguís con el conector haciendo su laburo de stock/catálogo. `/marketplaces` lee la cuenta oficial MELI (órdenes, publicaciones, preguntas, reputación) para darte la cabina de control que el conector no da. Conviven sin problemas.

### "Vendo en 10 cuentas MELI distintas (marcas o clientes diferentes). ¿Puedo manejarlas todas?"

Multi-cuenta MELI en un solo workspace está en roadmap (sobre todo pensando en agencias). Hoy cada cuenta MELI = un workspace NitroSales. Si sos agencia con varias marcas, lo charlamos en demo y te armamos el onboarding para que tengas multiorganización desde el principio sin que se te mezclen los datos.

**[VISUAL: acordeón de objeciones con el título del bloque arriba. Cada objeción colapsable con click.]**

---

## BLOQUE 8 — PRECIO

### Incluido en cualquier plan de NitroSales

`/marketplaces` **no se vende como módulo separado**. Si tu plan incluye integración MELI (y todos los planes con canal de venta activo lo incluyen), tenés `/marketplaces` completo — las 6 áreas, las alertas ML integradas al hub central, el sync real-time vía webhooks, el cruce con `/rentabilidad` y `/finanzas` y `/alertas`.

### Lo que sí tiene costo

El costo no es la funcionalidad — es la cantidad de volumen. Planes se arman por:
- **Cantidad de órdenes MELI mensuales procesadas** (rango por plan).
- **Cantidad de publicaciones activas** sincronizadas en vivo.
- **Cantidad de cuentas MELI conectadas** (hoy 1 incluida, multi-cuenta en plan agencia próximamente).

### Lo que no está incluido

- **Consultoría de estrategia MELI**: si necesitás que alguien te acompañe a mejorar tu reputación, armar estrategia de pricing, disputar reclamos complejos — podemos recomendarte partners. No lo hacemos internamente.
- **Gestión y optimización activa de Mercado Ads**: hoy damos reporting consolidado con órdenes MELI reales; la capa de accionables específicos (pausar campañas, reasignar presupuesto) está en roadmap.
- **Inteligencia competitiva ML**: Nubimetrics es la respuesta ahí (complementario).

**CTA**
[CTA: Pedí tu demo → abre Calendly]

**[VISUAL: 3 tarjetas horizontales con los ejes del pricing (órdenes · publicaciones · cuentas). Debajo, línea que dice "Funcionalidad completa incluida — el precio escala por volumen, no por feature".]**

---

## BLOQUE 9 — FAQ

**¿Qué pasa si MELI da de baja temporalmente la cuenta oficial MELI Developers que usamos?**
La política de MELI es dar aviso previo y mantener versiones activas. Si pasa algo excepcional, NitroSales muestra un banner claro en `/marketplaces` con el estado y la acción requerida (reautorizar OAuth, por ejemplo). Mientras tanto, los datos históricos siguen disponibles y no se pierde nada — solo se pausa el ingestion en vivo hasta que se resuelve.

**¿Puedo ver MELI junto con VTEX en la misma pantalla?**
Sí. En `/control-gestion` (Centro de Control) tenés el dashboard unificado con VTEX + MELI + el resto como filtros de fuente. En `/rentabilidad` podés ver margen neto por canal lado a lado. En `/finanzas` las comisiones MELI viven como línea separada del P&L. La idea de `/marketplaces` es la vista deep-dive MELI — pero el cruce con el resto vive arriba.

**¿Se sincroniza el catálogo de VTEX/Shopify hacia MELI?**
No — eso lo hace tu conector nativo de tienda (Tiendanube, VTEX → ML connector, plataforma SKU-sync propia). `/marketplaces` lee el estado de MELI tal cual está, no lo escribe. La idea es clara separación de capas: el conector de tienda mueve stock y catálogo; NitroSales te muestra el resultado consolidado con cabeza operativa.

**¿Cuánto tarda en estar operativo después del OAuth?**
El panel te empieza a mostrar data nueva en tiempo real desde el minuto uno (lo que entra nuevo vía webhook). El histórico retroactivo de los últimos 12 meses se va cargando de fondo — suele tardar entre 5 y 30 minutos según volumen. Podés empezar a operar mientras tanto.

**¿Qué pasa si tengo múltiples cuentas MELI bajo una misma razón social?**
Si son cuentas distintas con CUIT distinto, es multi-cuenta y entra en plan agencia (próximamente). Si son una cuenta con sub-usuarios, el OAuth se hace con el usuario principal y todos los sub-usuarios quedan visibles en el panel.

**¿Puedo crear una publicación nueva desde NitroSales?**
Hoy no. La creación se hace desde el panel MELI (por la complejidad de la configuración de variantes, fotos, envíos) o desde tu conector de tienda. `/marketplaces` muestra la publicación apenas aparece. Modificación/creación desde NitroSales está en roadmap.

**¿Qué hace Aurum en `/marketplaces`?**
Aurum tiene el contexto de tu cuenta MELI al mismo nivel que el resto del negocio. Podés preguntarle desde la sección directamente: "cuál fue el SKU con más cancelaciones del mes", "cuánto creció la comisión promedio últimos 90 días", "cuáles son las 5 publicaciones con peor conversión del top 50". También podés pedirle que arme alertas MELI en castellano: "avisame si la reputación baja del verde". Las crea y aparecen en `/alertas`.

**¿Qué pasa con Mercado Envíos y el costo de envío?**
Los costos de envío que paga MELI y los que paga el comprador están visibles en la vista de órdenes. Los costos reales de envío para tu negocio (Mercado Envíos Full subsidiado / flex / colecta / retiro) se reflejan en el margen neto de `/rentabilidad`. Si tenés fees especiales negociados con MELI, se pueden cargar en la configuración de costos para que el margen neto sea exacto.

**¿Cómo manejan los reclamos?**
`/marketplaces > Reputación` muestra los reclamos abiertos con su motivo, deadline y estado. Para disputarlos, accionás desde el panel MELI oficial (es donde viven las disputas con trazabilidad). Lo que NitroSales te da es la visibilidad consolidada y la alerta proactiva cuando un reclamo está cerca de su deadline.

**¿Tienen Full Fulfillment (Mercado Envíos Full) integrado?**
Sí — órdenes de Full se identifican con chip específico en `/marketplaces > Órdenes`. El costo de Full (almacenamiento + picking + envío) se refleja en la vista de margen neto por canal en `/rentabilidad`.

**¿Y si quiero mover plata de una cuenta MELI a otra o de Mercado Pago a mi banco?**
Eso es Mercado Pago, no `/marketplaces` de venta. La integración Mercado Pago (monedero MELI) vive en `/finanzas` si la conectás, no acá.

**[VISUAL: acordeón con Q&A. Cada pregunta colapsable.]**

---

## BLOQUE 10 — CIERRE

**Headline final**
Tu MELI deja de vivir en 8 pestañas. Empieza a vivir al lado de tu tienda, tus campañas y tu plata.

**Body (2 párrafos)**
MercadoLibre es demasiado grande en el ecommerce argentino como para operarlo desde el panel nativo y una app de celular. No porque el panel nativo sea malo — es completísimo. Pero es un silo. Y un canal que mueve entre 30% y 80% de tu facturación no puede vivir en un silo si lo que querés es tomar decisiones comerciales con la foto completa.

`/marketplaces` es la cabina de control operativa de tu cuenta MELI, conectada vía OAuth oficial con webhooks real-time, agregada con el resto de tu negocio (tienda, ads, P&L, creators) en un solo login. Hoy es MELI en deep dive. Mañana es Amazon, Noventa9 y los marketplaces que vengan — la arquitectura está lista para que se sumen sin que tengas que reaprender nada.

Si MELI es un pilar central de tu negocio y hasta ahora lo operabas con el panel nativo + Excel + WhatsApp, hacé la demo. En 15 minutos ves exactamente cómo se ve tu propia cuenta MELI adentro de NitroSales — con tus órdenes reales, tus publicaciones reales, tus preguntas reales, tu reputación real, cruzadas con el resto del negocio.

**CTAs**
[CTA primario: Pedí tu demo → abre Calendly]
[CTA secundario: Ver `/marketplaces` en vivo (4 minutos) → abre video demo]

**Cross-links a otras landings**
→ ¿Querés ver el margen neto de MELI vs tu tienda? **[/rentabilidad](link)** — margen por canal post-comisiones, devoluciones, envíos, marketing.
→ ¿Querés que el ojo te avise cuando algo de MELI se sale del plan? **[/alertas](link)** — las 5 alertas ML por default + todas las custom que le pidas a Aurum.
→ ¿Querés ver las comisiones MELI dentro del P&L completo? **[/finanzas](link)** — línea propia de comisiones marketplace, tri-currency, ajustada por inflación.
→ ¿Querés conectar MELI con el resto de tu stack? **[/integraciones](link)** — MELI es una de las plataformas nativas con webhooks real-time oficiales.
→ ¿Querés ver MELI al lado de VTEX y todas tus otras fuentes en un mismo tablero? **[/control-gestion](link)** — Centro de Control unificado con filtro de fuente.

**[VISUAL: cierre fuerte. Headline grande en el centro. Debajo los dos CTAs en botones destacados. Al costado o abajo, los cross-links a las otras landings como tarjetas pequeñas con el nombre de cada sección y su mini-descripción. Visual final del ojo de `/alertas` con un chip MELI iluminado para cerrar el loop narrativo de "el ojo también mira MELI".]**

---

## FOOTER (legal + marca)

**NitroSales**
El sistema operativo comercial para marcas ecommerce modernas.
MercadoLibre deep + el resto del negocio al lado. Integración oficial vía MELI Developers.

[Links legales: Términos · Privacidad · Política de datos · Contacto]

---

_Versión 1.1 de la landing `/marketplaces`. Incorpora el pase de consistencia Tier 3 (2026-04-20): reporting MELI Ads aclarado correctamente como "ya existe", accionables específicos quedan como "en roadmap", y todas las menciones de fase numerada en copy público se reemplazan por "próximamente" / "en roadmap". Cierre del corpus Tier 3 Funcional — octava y última landing Tier 3._

_Última actualización: 2026-04-20 — v1.1 Sesión 3 VM (pase de consistencia Tier 3). v1.1 aplica: (a) resuelve contradicción MELI Ads (hoy reporting ya existe, insights accionables en roadmap), (b) saca todas las menciones "Fase 4" / "Fase 5" del copy público (decisión Tomy: fases fuera del copy externo), (c) "cabina de control" queda como excepción puntual documentada. Cross-link principal a `/rentabilidad` (margen neto MELI post-comisiones) y secundario a `/alertas` (5 alertas ML por default conectadas al hub central)._

---

## NOTAS DE IMPLEMENTACIÓN (para equipo de diseño y producto — NO va en la landing pública)

### Orden visual recomendado de la landing
1. Hero + visual del split 8 tabs → panel unificado
2. Trust strip MELI oficial + roadmap marketplaces
3. 6 áreas (Dashboard · Publicaciones · Órdenes · Preguntas · Reputación · Alertas ML)
4. Tabla comparativa vs Nubimetrics / Real Trends / panel nativo / conectores
5. Onboarding OAuth 4 pasos
6. Para quién sí / no
7. Testimonios + métricas beta
8. Objeciones (acordeón)
9. Precio (incluido en planes)
10. FAQ
11. Cierre con cross-links

### Elementos distintivos vs otras Tier 3
- **Primera landing que se apoya en un canal único dominante (MELI)** sin reducir su narrativa a "solo MELI" — mantiene visión marketplace-ready
- **Primera landing con tabla comparativa formal vs 5 competidores específicos** (hasta ahora los bloques 3B eran más conceptuales)
- **Primera landing con bloqueo explícito de feature no prometida** ("NO respondemos preguntas automáticamente" como línea roja de honestidad)
- **Primer uso del concepto "cabina de control"** — hay que validar con Tomy si es parte del vocabulario NitroSales o si es préstamo de una sola vez
- **Decisión tomada (2026-04-20)**: las fases NO se exponen en copy público. Se usa "próximamente" / "en roadmap" / "en desarrollo". Los números de fase viven solo en docs internos.

### Checklist de voz (revisar antes de pasar a diseño)
- Tono operativo, práctico, directo — no inspirational ni épico
- Cero promesa de "responder preguntas automáticamente" (línea roja de política MELI)
- Cero promesa de competitive intel (eso lo hace Nubimetrics, lo decimos claro)
- Cero "enlatado" — se menciona explícitamente que MELI vive junto al resto, no como silo aislado
- Cero "cockpit" — se habla de "cabina de control" con cuidado de que no suene a cockpit y se prefiere "panel" / "consolidado" en la mayoría de los casos
- Jerga MELI (publicación, pausada, color del vendedor, reclamo, Full, comisión, Mercado Envíos) usada sin traducir — es el vocabulario del usuario
- Voseo consistente en todos los CTAs y body
- Cero exclamaciones
- Cero emojis en body (se permiten en visuales decorativos si el sistema gráfico los usa en BRAND_VISION)
- Palabras prohibidas respetadas: scraping, bot de MELI, automatización mágica, respuestas automáticas, domina MercadoLibre, poderoso, potente, revolucionario

### Cross-links principal y secundario
- **Principal**: `/rentabilidad` (margen neto MELI post-comisiones + devoluciones + envíos es el valor killer del cruce)
- **Secundario 1**: `/alertas` (5 alertas ML por default + custom Aurum — par narrativo muy fuerte)
- **Secundario 2**: `/finanzas` (comisiones MELI en P&L tri-currency)
- **Secundario 3**: `/integraciones` (MELI es una de las plataformas nativas explicadas ahí)
- **Secundario 4**: `/control-gestion` (MELI al lado de VTEX + resto en el Centro de Control unificado)

### Assets pendientes antes de pasar a producción
- Logos de MELI oficial con aprobación de uso (chequear guideline de marca MercadoLibre Developers)
- Badge "Integración oficial MercadoLibre Developers" — validar si se puede exhibir así o si hay wording específico requerido
- Foto circular x3 de testimonios beta (hoy placeholder — pedir autorización a marcas beta)
- Logos de marcas beta en Bloque 6 (hoy placeholder — pedir autorización a marcas beta)
- Captura real del panel `/marketplaces` con data mockeada para visual del hero + bloque 3
- Video demo real de 4 minutos recorriendo las 6 áreas + cruce con `/rentabilidad`

### Reglas de HONESTIDAD reforzadas en v1 (no aflojar en futuras versiones)
- "No respondemos preguntas automáticamente" — política MELI
- "No hacemos competitive intel" — Nubimetrics es el partner natural
- "No reemplazamos el panel nativo para configuración de cuenta" — Mercado Ads, envíos, disputas siguen ahí
- "Hoy MELI, Amazon y Noventa9 en roadmap" — no vendemos lo que no está
- "Multi-cuenta MELI en roadmap" — agencias lo van a pedir, ser claros con el timing sin exponer número de fase

### Checklist para Fase 2B (BRAND_VISION.md)
- Sistema de color para los 4 colores del vendedor (verde / amarillo / naranja / rojo) — acordar paleta que no rompa con el resto de la UI NitroSales
- Iconografía MELI específica (logo, chip oficial, publicación, pregunta, reclamo, Full) — coherente con lucide + paleta NitroSales
- Visual del ojo de `/alertas` con chip MELI iluminado — cerrar loop narrativo
- Visual del split 8 tabs → panel consolidado del hero — es el asset más importante de la landing

---

_Fin del LANDING_MARKETPLACES.md v1 — cierre del corpus Tier 3 Funcional (8 landings: `/rentabilidad`, `/productos`, `/finanzas`, `/control-gestion`, `/marketing-digital`, `/integraciones`, `/alertas`, `/marketplaces`). Próximo paso: pase de consistencia cruzado entre las 8 + la `LANDING_MATRIZ.md` que las articula, y luego arranque de Fase 2B (`BRAND_VISION.md`) + Fase 4 (build Next.js)._
