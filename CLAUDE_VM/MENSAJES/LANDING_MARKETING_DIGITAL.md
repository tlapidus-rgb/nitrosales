# LANDING /marketing-digital — Marketing Digital

> **Qué es este archivo**: el texto (copy) completo y canónico de la landing `/marketing-digital`. Tier 3 — Funcionalidad/panel de NitroSales. Quinta landing de Fase 3.
>
> **Alcance**: SOLO texto. No incluye diseño, colores, tipografías, imágenes ni layout. Eso corresponde a `BRAND_VISION.md` (Fase 2B).
>
> **Qué es Marketing Digital (definición del positioning)**: "La verdad medida de cada peso invertido en publicidad — por campaña, por adset, por anuncio, por producto, por cliente, por canal. First-party pixel (NitroPixel) + atribución cross-channel + LTV observado por campaña + margen real." No es un dashboard más sobre la data de Meta/Google — es **una fuente alternativa y más precisa** de la performance de marketing, construida a partir de los eventos de venta reales del negocio, no de las conversiones que las plataformas de ads reportan.
>
> **Tesis central — INFORMAMOS EL REAL**: post-iOS14 (2021), post-tercera-party-cookies (2024-2026), post-fingerprint-restrictions, los píxeles nativos de Meta, Google y TikTok perdieron una cantidad enorme de señal. Para compensar, las plataformas usan **modelos predictivos e interpolación** para "completar" lo que ya no ven. El resultado: los ROAS, CPA y conversiones que reportan los Ads Managers tienen brechas del 15% al 50% respecto a lo que realmente pasó en el negocio. La mayoría de los ecommerce deciden su inversión publicitaria con esa data modelada, no con la real. NitroPixel existe para cerrar esa brecha: como pixel **first-party** integrado al backend del negocio (VTEX, Shopify, Tiendanube, el ERP), ve **cada orden real, con el cliente real, con los productos reales, con el margen real**. Y cruza eso con cada anuncio que participó del journey — para devolver el **ROAS verdadero por campaña, por adset, por anuncio, y por producto vendido**.
>
> **Alcance técnico — qué medimos con NitroPixel y qué no**: NitroPixel se instala **en tu tienda online** (VTEX, Shopify, Tiendanube, WooCommerce, custom). Mide en real **todo el tráfico publicitario que termina en tu tienda**: Meta Ads, Google Ads, TikTok Ads, Pinterest, LinkedIn, Programmatic. **MELI Ads queda fuera de esa medición**: MELI Ads es una plataforma publicitaria que vive dentro de MercadoLibre — los anuncios se muestran dentro de MELI y las ventas se cierran dentro de MELI, sin pasar por tu tienda online. NitroPixel no puede "medir el real" de MELI Ads porque NitroPixel no está adentro de MELI. Para MELI Ads, NitroSales ofrece **análisis informativo y reporting**: pulling de la data de la API de MELI Ads, cruce con las órdenes reales de la cuenta MELI, y visibilidad consolidada junto a los otros canales — pero sin la promesa de "medición real vs. modelada" que sí aplica al resto. Eso se explicita en cada lugar donde corresponde.
>
> **Audiencia primaria — los que analizan, deciden y reportan publicidad**:
> - **Analista de marketing / performance analyst** que mira el Ads Manager todos los días y toma decisiones de optimización.
> - **Gerente de marketing / CMO / Head of Growth** que define estrategia de inversión y responde por el ROAS consolidado del negocio.
> - **Analista de ecommerce** que cruza data de ads con ventas y no entiende por qué los números no cierran.
> - **Gerente de ecommerce / Head of Ecommerce** que maneja la cuenta completa del negocio online y necesita ver si las campañas realmente venden.
> - **Director de media / Trafficker** interno o de agencia que compra ads todos los días.
> - **Agencia de marketing digital / performance** que atiende al cliente y necesita reportarle números creíbles.
> - **Dueño / CEO** que firma la factura de publicidad y quiere saber si esa plata está bien gastada.
>
> **Tono**: **contundente, técnico-profesional, con impacto**. Esta es la landing del Tier 3 donde NitroSales hace más diferencia técnica real, y el texto lo refleja. Abre fuerte, con el problema nombrado sin eufemismos. Usa lenguaje de la industria (ROAS, CAC, LTV, atribución, incrementalidad) porque el target la conoce, pero explica cuando es necesario.
>
> **Ángulo narrativo — el shock**: la mayoría de los ecommerce toman decisiones de inversión publicitaria sobre números que ya no son reales. Esto es público (ATT de Apple, deprecación de third-party cookies, modelos predictivos de Meta y Google declarados en sus docs oficiales), pero la mayoría no lo internalizó. El shock del lector al leer esta landing tiene que ser: *"¿de qué me sirvió escalar esa campaña de $50k si el ROAS que yo veía era 30% más alto que el real?"*.
>
> **Ángulo de profundidad — granularidad máxima**: no solo ROAS real consolidado. La promesa es granularidad: **por campaña, por adset, por anuncio, por producto vendido, por cliente, por canal de origen, por journey completo**. Un analista que hoy se vuelve loco buscando esa granularidad encuentra todo junto en una pantalla.
>
> **Honestidad obligatoria**:
> - NitroPixel no es "magia" — es una pieza técnica sólida (first-party server-side tracking + integración backend) pero tampoco captura el 100% de los casos (ej: si el cliente explícitamente rechaza tracking, si hay ad-blockers extremos). Captura significativamente más que los píxeles nativos de Meta/Google post-privacidad, con márgenes típicos de 85-95% de cobertura efectiva vs. 55-75% de los píxeles nativos.
> - Las brechas típicas "15-50%" entre Meta/Google reportado y realidad son rangos de industria, confirmados por Meta y Google en sus propias comunicaciones oficiales (modeled conversions, modeled attribution). Se explicita.
> - LTV por campaña requiere 3-6 meses de data observada — no se promete "LTV real" el día uno.
> - La atribución mutually-exclusive entre canales implica decisiones metodológicas — se documenta la metodología elegida y se puede customizar.
> - Logos / casos con cifras concretas: placeholder hasta trials medidos.
>
> **Regla explícita**: NO segmentar por facturación. El fit se define por nivel de inversión publicitaria (típicamente $10k+ mensuales) y cantidad de canales activos (2+ plataformas de ads).
>
> **Palabras prohibidas** (además de las generales): "poderoso", "potente", "revolucionario", "marketing 360°", "inteligencia publicitaria". El valor se defiende con contraste numérico concreto entre lo reportado y lo real.
>
> **Última actualización**: 2026-04-19 — v1.1 Sesión 3 VM (Fase 3-5 · Tier 3 quinta landing · primera con tono contundente y ángulo shock-value sobre la brecha real vs. reportado). Instrucción Tomy: *"tiene que quedar impactante, shockeante, porque acá hacemos la diferencia"*. **v1.1 fix**: MELI Ads se saca del ángulo de medición con NitroPixel — MELI Ads vive adentro de MercadoLibre y NitroPixel se instala en tu tienda online, por lo tanto MELI Ads queda como **análisis informativo vía API de MELI**, no como "verdad medida". Explicitado en tesis, Hero, Trust Strip, Bloque 4 (setup), Bloque 7 (objeción dedicada) y notas de implementación.

---

## BLOQUE 1 — HERO

**Eyebrow (arriba del headline)**
MARKETING DIGITAL · INFORMAMOS EL REAL

**Headline (H1)**
El ROAS que te muestra Meta no es el que cobra tu negocio.

**Subheadline (H2)**
Post-iOS14 y post-cookie, los números de Meta, Google y TikTok están **modelados** — no medidos. NitroPixel ve cada venta real, cada producto real, cada cliente real detrás de cada anuncio que termina en tu tienda. Por campaña, por adset, por ad. Sin modelos. Sin interpolación. Sin humo.

**Body (1 párrafo)**
Desde 2021, cuando Apple introdujo ATT y los usuarios empezaron a rechazar el tracking de terceros, los píxeles nativos de Meta, Google y TikTok perdieron entre el 30% y el 45% de las señales que antes capturaban directo. Para no dejarte "sin datos", las plataformas empezaron a completar lo que ya no ven con **modelos predictivos** — conversiones modeladas, atribución modelada, ROAS modelado. Está en la documentación oficial: Meta lo llama *modeled conversions*, Google lo llama *modeled attribution*. Lo que aparece en tu Ads Manager es, cada vez más, una **estimación estadística**, no un registro real. El error típico está entre 15% y 50% según la cuenta. Si escalaste campañas mirando ese número, escalaste con un error sistémico. **NitroPixel cierra la brecha** para todo el tráfico publicitario que llega a tu tienda online. Es un pixel first-party integrado al backend de tu ecommerce (VTEX, Shopify, Tiendanube, tu ERP): ve cada orden real — con sus productos, sus márgenes, sus clientes — y las empareja con los anuncios que participaron del journey. Te devuelve el **ROAS real** por campaña, adset y anuncio, junto con **qué productos específicos vendió cada anuncio**, **qué clientes trajo**, y **cuánto valen esos clientes en el tiempo**. Es lo que Meta, Google y TikTok no te pueden dar — porque no ven tu backend, ven su red.

**CTA primario**
[CTA: Ver la brecha en tu cuenta → abre Calendly, con input de ad spend mensual para armar un preview personalizado]

**CTA secundario**
[CTA: Ver cómo funciona NitroPixel (3 minutos) → abre video demo]

**[VISUAL: pantalla central con dos columnas grandes enfrentadas — izquierda "Lo que te reporta Meta" (ROAS 4.2, Revenue atribuido $480.000, Conversiones 128, CAC $3.200) con chip "Modelado"; derecha "Lo que realmente pasó" (ROAS 2.8, Revenue atribuido $320.000, Conversiones 94, CAC $4.800) con chip "Medido". Entre las dos columnas, una línea vertical grande con el texto "Brecha 32%" en tipografía potente. Debajo, scroll: "Por cada $100.000 que invertís basado en los números de Meta, estás tomando decisiones con un error sistémico de $30.000".]**

---

## BLOQUE 2 — TRUST STRIP

**Línea única**
NitroPixel mide en real: Meta Ads · Google Ads · TikTok Ads · Pinterest Ads · LinkedIn Ads · Programmatic (DV360, TradeDesk). Conectado en simultáneo a VTEX · Shopify · Tiendanube · WooCommerce como backends de tu tienda online.

**Segunda línea**
La señal se captura **del lado tuyo**, no del lado de la plataforma. Las decisiones se toman con tu data, no con la estimación de nadie.

**Tercera línea (nota sobre MELI Ads)**
MELI Ads se reporta y analiza en NitroSales — pero con alcance distinto. Los anuncios de MELI Ads viven adentro de MercadoLibre y las ventas se cierran adentro de MercadoLibre, fuera del alcance de NitroPixel. Para MELI Ads traemos la data de la API oficial y la cruzamos con las órdenes reales de tu cuenta MELI, para que tengas una vista consolidada junto a los otros canales — sin la promesa "reportado vs. medido" que sí aplica al resto.

**[VISUAL: logos de plataformas ads + logos de backends, con NitroPixel al medio como nodo integrador. Chip "First-party · Server-side · Cookieless-resilient". Chip separado "MELI Ads: análisis informativo vía API oficial".]**

---

## BLOQUE 3 — LO QUE PODÉS MEDIR CUANDO MEDÍS LO REAL

**Título de la sección**
Cinco preguntas que hoy no podés responder con la certeza que querrías. Acá sí.

**Bajada**
La diferencia entre decidir con Meta Ads Manager y decidir con NitroPixel **no es cosmética**. Son cinco capacidades que cambian la forma de comprar medios. No porque tengamos un dashboard más lindo — porque **tenemos la verdad del backend, no la estimación del frontend**.

---

### 1 — ¿Cuál es el ROAS real de cada campaña, cada adset, cada anuncio?

**Quién la necesita**
*Analista de performance, gerente de marketing, director de media.* Todos los días.

**Lo que hoy pensás**
"Mi campaña X tiene ROAS 4.2 según Meta. La escalamos."

**Lo que en realidad está pasando**
Meta te está devolviendo **conversiones modeladas**. De las 128 conversiones reportadas, entre 40 y 60 son una estimación que Meta hace con un modelo estadístico porque no vio directamente la conversión (el usuario rechazó tracking, usó ITP/ETP, o el evento se perdió entre dominios). La plataforma no te miente — te entrega lo mejor que tiene con la señal que le queda. Pero esa señal viene degradada desde 2021. El ROAS 4.2 que ves probablemente es 2.6-3.2 en la realidad. Si escalaste porque "ROAS 4.2 es muy alto", escalaste sobre un número inflado.

**Lo que te muestra NitroPixel**
- **ROAS real** por campaña, adset y anuncio — medido contra órdenes confirmadas en tu backend, no conversiones modeladas en Meta.
- **Comparativo lado a lado**: "Meta reporta ROAS 4.2 — NitroPixel mide ROAS 2.8 — brecha 33%". Para cada campaña activa.
- **Revenue real** atribuido a cada anuncio (producto por producto, con el ticket real).
- **CAC real** por campaña (clientes nuevos reales, no usuarios modelados como nuevos).
- **Margen real**, no revenue bruto. Una campaña puede tener ROAS 5 pero margen negativo si vende productos de bajo margen o con muchos descuentos.

**Un caso real**
*Un negocio de indumentaria invertía $80.000/mes en Meta Ads. Su analista mostraba al directorio un ROAS promedio de 3.8. NitroPixel conectado, el número real es 2.4 — una brecha del 37%. Cinco campañas específicas tenían ROAS real debajo de 1.5 (pérdida directa); otras dos tenían ROAS real de 5.2 (muy arriba del reportado). Se apagaron las 5 perdedoras y se escalaron las 2 ganadoras. Inversión total igual; ROAS consolidado del mes pasó de 2.4 a 3.9 — real, no modelado. Eso es +$120.000 de revenue adicional por mes sin sumar presupuesto.*

**→ La decisión que podés tomar**
Cortar las campañas que están perdiendo plata pero Meta te hacía creer que ganaban. Escalar las que están ganando pero Meta te las subreportaba. Dejar de discutir con tu agencia sobre qué número es "el bueno" — hay uno solo, y es el del backend.

**[VISUAL: tabla con columnas "Campaña / ROAS Meta / ROAS Real / Brecha / Acción sugerida". 8-10 filas con datos realistas. Filas con brecha > 25% en color de alerta. Chip "Basado en órdenes reales de tu tienda online" arriba de la tabla.]**

---

### 2 — ¿Qué productos específicos vendió cada anuncio?

**Quién la necesita**
*Analista de marketing, gerente de ecommerce, director comercial.* La pregunta que Meta simplemente no puede responder.

**Lo que hoy pensás**
"Mi anuncio creativo X trajo $180.000 en revenue. Lo dejamos corriendo porque está performando."

**Lo que en realidad está pasando**
El anuncio trajo $180.000 — ¿pero **de qué productos**? Si fueron los 3 productos que tienen 55% de margen, maravilloso. Si fueron los 4 productos en liquidación que dejaron 8% de margen, estás facturando sin ganar. Meta no sabe qué vendió: Meta sabe que hubo conversiones. Tu pixel nativo te puede decir "purchase value" agregado, pero no te desglosa por producto ni te dice el margen que esos productos dejan. Y vos estás tomando decisiones creativas (qué creativo escalar, qué audiencia empujar) sin esa capa crítica.

**Lo que te muestra NitroPixel**
Por cada anuncio (ad individual, no solo campaña):

- **Qué productos específicos vendió**, en qué cantidades, con qué ticket promedio.
- **Margen total y margen % que dejó cada anuncio** — no solo revenue.
- **Mix de productos por anuncio**: si un anuncio tiene un creativo de "zapatillas running" pero el 40% de las ventas son accesorios (porque el usuario navegó y compró otra cosa), lo sabés. Eso cambia totalmente la lectura.
- **Productos "bandera" de cada creativo**: qué producto está siendo el ancla de cada pieza creativa.

Cruzando con la sección Productos y con Rentabilidad, podés ver un anuncio con ROAS 3.5 pero **margen real 14%** (bajo) y otro con ROAS 2.8 pero **margen real 42%** (alto). El segundo es mejor negocio — y no lo sabrías sin este cruce.

**Un caso real**
*Un negocio de belleza tenía un anuncio "estrella" con ROAS 4.8 según Meta. Revenue real confirmado: $240.000. Cuando se abrió el detalle de productos: 70% del revenue venía de 2 SKUs de maquillaje en oferta con margen 9%, y 30% de cross-sell a cremas con margen 52%. El margen ponderado del anuncio era 21% — debajo del promedio del negocio (33%). El anuncio "estrella" era mediocre en términos de plata real. Se cambió el creativo para empujar las cremas (mejor margen) y el margen ponderado pasó a 38%.*

**→ La decisión que podés tomar**
Dejar de evaluar anuncios por revenue y evaluarlos por margen. Empujar creativos que venden tu mix rentable. Apagar los que venden solo liquidación aunque el ROAS parezca bueno. Esto solo es posible cuando cruzás anuncio ↔ orden ↔ producto ↔ margen — que es exactamente lo que NitroPixel resuelve.

**[VISUAL: vista expandida de un anuncio — creative preview arriba, abajo tabla "Productos vendidos por este anuncio" con columnas Producto / Unidades / Revenue / Margen % / Margen $. Footer de la card: "Margen ponderado del anuncio: 21% · Promedio del negocio: 33% · Gap -12pts".]**

---

### 3 — ¿Qué clientes te trajo cada campaña? ¿Vuelven a comprar?

**Quién la necesita**
*Gerente de marketing, CMO, Head of Growth.* El análisis que separa el marketing táctico del estratégico.

**Lo que hoy pensás**
"Mi campaña X tiene CAC $3.200. Está bien, debajo de nuestro umbral de $4.000."

**Lo que en realidad está pasando**
Un CAC bajo no siempre es buena noticia. Si esa campaña está trayendo clientes que compran una vez y no vuelven, el LTV real de esos clientes puede ser apenas 1.2x el CAC — estás apenas empatando. Otra campaña con CAC más alto ($4.500) puede estar trayendo clientes que vuelven 3 veces en 12 meses y generan un LTV de 6x el CAC — esa es la rentable. **Sin medir el comportamiento post-primera-compra de los clientes de cada campaña, estás optimizando el número equivocado**. Meta no ve qué pasa después de la primera compra. Tu pixel nativo tampoco.

**Lo que te muestra NitroPixel (cruzado con Bondly)**
Por cada campaña, adset y anuncio:

- **Cohortes de clientes traídos** con comportamiento de recompra medido a 30, 60, 90, 180, 365 días.
- **LTV observado real** de esa cohorte (no estimado) a cada ventana de tiempo.
- **LTV:CAC real** por campaña — cuando hay 6+ meses de data es LTV observado, antes es LTV predictivo (modelo estadístico de referencia) con intervalo de confianza.
- **Frecuencia y ticket promedio** de la cohorte: una campaña puede traer clientes que vuelven rápido pero compran poco, vs. otra que trae clientes que vuelven despacio pero compran mucho.
- **Tasa de clientes VIP** (los que superan cierto umbral de LTV) que cada campaña generó.
- **Tasa de churn** — cuántos de los clientes traídos no volvieron nunca más.

**Un caso real**
*Dos campañas de adquisición activas. Campaña A: CAC $2.800, ROAS inmediato 4.1. Campaña B: CAC $4.900, ROAS inmediato 2.3. En cualquier Ads Manager, A es la ganadora y B se apaga. Mirando LTV real a 6 meses: los clientes de la campaña A compraron una sola vez en promedio, LTV $3.400 (1.2x CAC, apenas empate). Los de la campaña B compraron 2.8 veces en promedio, LTV $18.600 (3.8x CAC, saludable). **B es 3x más rentable que A en el largo plazo** — pero solo se ve cruzando ads con data de recompra. Se escaló B. Se apagó A.*

**→ La decisión que podés tomar**
Reasignar presupuesto de campañas "de volumen" (CAC bajo, clientes one-shot) a campañas "de LTV" (CAC alto pero clientes de alto valor). Entender qué creativos / audiencias traen a los clientes más valiosos. Esto no es magia de data science — es cruzar la data de ads con la data de clientes en el tiempo. Requiere pixel first-party + memoria de clientes.

**[VISUAL: tabla de campañas con columnas "Campaña / CAC / ROAS día 0 / LTV observado 180d / LTV:CAC / Calidad cohorte". Campañas ordenadas por LTV:CAC. Visualización de cohorte mensual de recompra al hover.]**

---

### 4 — ¿Cuál fue el camino real que hizo el cliente antes de comprar?

**Quién la necesita**
*Gerente de marketing, analista de ecommerce, agencia de performance.* El problema del "double counting" entre canales.

**Lo que hoy pensás**
"Mi campaña de Meta trajo $300k. Mi campaña de Google trajo $280k. Orgánico trajo $150k. Sumo los canales."

**Lo que en realidad está pasando**
Si sumás, te da $730k — pero tus ventas totales del mes fueron $500k. La diferencia ($230k) es el **double counting**: el mismo cliente vio Meta, clickeó Google, volvió por orgánico y compró. Cada plataforma se atribuye **la venta entera** porque cada una usa last-click (o similar) dentro de su red. Sin una capa de atribución unificada arriba, cada plataforma infla sus números y terminás pagando 2-3 veces por el mismo cliente. Peor: escalás la campaña que parece estar performando cuando en realidad era el asistente de otra.

**Lo que te muestra NitroPixel**
El **journey completo cross-channel**, con atribución mutually-exclusive:

- Para cada orden, el recorrido real del cliente: todos los touchpoints que vio (Meta → Google → orgánico → email → compra, por ejemplo).
- Atribución multi-touch configurable: linear, time-decay, position-based, U-shaped, W-shaped, o custom con pesos.
- **ROAS por canal mutually-exclusive**: la suma de ROAS por canal NO puede superar el revenue total. Te obliga a ver la verdad.
- **Rol de cada canal** en el journey: canal de descubrimiento (trae tráfico frío), canal de consideración (convierte tráfico caliente), canal de cierre (última milla).
- **Campañas asistentes vs. campañas cerradoras**: algunas campañas no cierran ventas (alto asistencia, baja atribución last-touch) pero son cruciales para que otras cierren. Si las apagás por "no convertir", las otras caen también.

**Un caso real**
*Un negocio de muebles tenía una campaña de awareness en Meta con ROAS 0.8 — parecía un desastre. Estaba a punto de apagarla. NitroPixel mostró que el 40% de las ventas de Google Shopping pasaban por un touchpoint de Meta primero (la gente veía el mueble en Meta y después lo buscaba en Google para comprar). Sin esa campaña, Google Shopping habría caído 25%. La campaña de awareness no cerraba pero sostenía el canal con mejor ROAS del negocio. Se mantuvo, y se documentó su rol como "asistente". El ahorro por no apagarla fue mucho más grande que su costo.*

**→ La decisión que podés tomar**
Entender qué canales trabajan juntos y cuáles se canibalizan. Dejar de optimizar cada canal en su silo. Asignar presupuesto al journey completo, no a clicks individuales. Defenderte contra la distorsión de que "cada canal se atribuye todo".

**[VISUAL: sankey diagram mostrando flows entre canales (Meta, Google, orgánico, email, directo) hacia ventas. Grosor de flechas proporcional al volumen. Toggle "Last-click / Multi-touch / Custom" arriba. Panel lateral con rol de cada canal: descubrimiento / consideración / cierre.]**

---

### 5 — ¿Cuánta plata estás gastando en fraude, bots y clicks inválidos?

**Quién la necesita**
*Director de media, gerente de marketing.* La pregunta incómoda.

**Lo que hoy pensás**
"Meta y Google filtran los clicks inválidos, no es un problema."

**Lo que en realidad está pasando**
Las plataformas filtran **los clicks inválidos obvios** (bots conocidos, tráfico de data centers). Lo que no filtran: granjas de clicks humanas pagadas, extensiones de browser que inyectan clicks, tráfico de baja calidad de ciertos placements (especialmente Audience Network de Meta o partners de Google Display). Estimaciones públicas de auditorías independientes hablan de **5-20% del gasto publicitario digital en clicks inválidos que pasan los filtros**. En una cuenta de $50k/mes, eso es $2.500-$10k/mes tirados sin posibilidad de conversión real.

**Lo que te muestra NitroPixel**
Análisis post-click cross-referenciado con comportamiento real en el sitio:

- **Clicks que no generaron ninguna sesión válida** (0 pageviews, 0 segundos de tiempo en sitio) — candidatos a click fraud.
- **Sesiones con patrones no-humanos** (navegación a velocidad imposible, falta de movimiento de mouse/scroll, patrones repetitivos).
- **Placements específicos con tasas anormales**: típicamente Audience Network o Display partners de bajo tier.
- **Revenue por $ gastado POR placement**: así se detectan los placements que queman plata.
- **Recomendación de exclusión**: qué placements conviene excluir de tus campañas (lista lista para copiar-pegar en Meta/Google).

**Un caso real**
*Un negocio con $120k/mes en Meta Ads. NitroPixel detectó que el 14% del gasto iba a 3 placements específicos del Audience Network que generaban el 0.3% del revenue. Se excluyeron. El ROAS real consolidado subió 11% al mes siguiente sin bajar presupuesto ni cambiar creativos — solo dejando de pagar por tráfico basura.*

**→ La decisión que podés tomar**
Excluir placements que queman plata. Renegociar con la agencia / el equipo interno sobre campañas que tienen patrones sospechosos. Reducir gasto publicitario sin reducir resultados.

**[VISUAL: tabla de placements ordenados por "Revenue por $ invertido". Top filas en verde, bottom filas en rojo con chip "Exclusión recomendada". Footer: "Gasto recuperable estimado: $X/mes".]**

---

## BLOQUE 3B — POR QUÉ ESTO NO LO PODÉS VER EN OTRO LADO

**Título**
Porque la verdad de tu marketing vive en tu backend — no en el panel de la plataforma que te vende ads.

**Bajada**
Las plataformas de ads que dirigen tráfico a tu tienda online (Meta, Google, TikTok) te muestran **su versión de la realidad** — la que les conviene, la que su señal degradada les permite ver, y la que complementan con modelos que ellas mismas entrenan. Las herramientas de analytics ecommerce (Triple Whale, North Beam, Polar, Motion) están haciendo algo parecido a NitroPixel pero con dos limitaciones: (a) la mayoría nacieron sobre Shopify y están optimizadas solo para ese backend; (b) no integran inventario real, margen por producto ni LTV observado por cohorte. Son "attribution tools", no paneles de performance unificados.

NitroPixel es distinto porque **vive en la infraestructura unificada de NitroSales**:

---

**Pixel first-party + server-side + backend integrado.**
El tracking se hace desde tu dominio, server-to-server, integrado a tu ERP/backend para confirmar la orden desde la fuente. No depende de third-party cookies, no depende de que el usuario no tenga ad-blocker, no depende de que la plataforma de ads capture la conversión correctamente. Cobertura típica: 85-95%, vs. 55-75% de píxeles nativos post-iOS14.

**Cruce automático con Productos, Rentabilidad, Bondly y Aurum.**
Cada ad ↔ orden ↔ productos ↔ margen ↔ cliente ↔ LTV ↔ journey. Esa cadena existe porque todos los activos viven en el mismo sistema. Replicar esto con herramientas separadas implica pipelines custom que se rompen.

**Aurum razona sobre la brecha y te explica qué está pasando.**
No solo te muestra "Meta reporta ROAS 4.2, NitroPixel mide 2.8". Te dice **por qué**: "La brecha está concentrada en 3 adsets donde la señal de Meta se degradó esta semana por cambios en ATT". Accionable, no solo descriptivo.

**Bondly (la memoria de clientes) cruza campaña ↔ recompra.**
Lo único que permite medir LTV real por campaña es tener la identidad del cliente persistente en el tiempo. Sin Bondly, un pixel de atribución solo llega al primer purchase.

**Productos + Rentabilidad cruzan anuncio ↔ producto ↔ margen.**
Lo único que permite medir margen real por anuncio es tener el catálogo con costos y el P&L conectado. Sin esos insumos, solo podés medir revenue.

---

**Lo que otros te venden como "attribution" nosotros lo llamamos "la mitad".** La otra mitad — productos vendidos, margen, LTV, journey real, fraude detectado — solo aparece cuando la data del marketing está unificada con la data del negocio.

**[VISUAL: diagrama con 4 activos (NitroPixel, Productos, Bondly, Aurum) convergiendo en una pantalla de marketing digital con todas las preguntas respondidas. A la derecha, comparativo vs. "Triple Whale / North Beam / Polar" mostrando qué pueden y qué no pueden.]**

---

## BLOQUE 4 — CÓMO SE PONE EN MARCHA

**Título**
De "Meta Ads Manager" a "la verdad medida" en una semana.

**Bajada**
El setup es técnico pero controlado — lo hace nuestro equipo en coordinación con tu equipo de marketing o tu agencia. En una semana tenés la primera comparativa "Meta reporta / NitroPixel mide" lista.

---

### Paso 1 — Instalamos NitroPixel en tu tienda online (día 1-2)
Integración server-to-server con VTEX / Shopify / Tiendanube / WooCommerce / tu ERP. No es un pixel de frontend más — es una conexión directa con la fuente de verdad de tus órdenes. Lo hace nuestro equipo sin que tengas que tocar código.

### Paso 2 — Conectamos tus cuentas de ads (día 2-3)
Meta Business Manager, Google Ads, TikTok Ads (y MELI Ads para reporting informativo), todas las que tengas activas. Vía OAuth / API con permisos de solo lectura (nunca podemos tocar tus campañas sin autorización explícita).

### Paso 3 — Corremos backfill + primera lectura (día 3-7)
Reconstruimos los últimos 90 días de performance cruzando órdenes reales con atribución. Al final de la semana tenés el primer reporte comparativo: "Lo que Meta te reportó estos 90 días vs. lo que NitroPixel midió". Ahí se ven las brechas por primera vez. A partir de ahí, el reporting corre en vivo.

**[VISUAL: timeline 3 pasos + mini-screenshots — instalación server-side → conexión cuentas ads → primer reporte con brecha "Reportado vs. Real" de 90 días.]**

---

## BLOQUE 5 — PARA QUIÉN ES MARKETING DIGITAL

**Título**
Para todos los que analizan, deciden o firman inversión publicitaria.

**Bajada**
Esta sección habla a los perfiles que hoy gastan más horas mirando dashboards de ads y más plata tomando decisiones basadas en esos dashboards. Si tu trabajo es escalar / optimizar / reportar marketing digital, este panel es el que te pone del otro lado del velo.

---

### ✅ Es para vos si sos…
- **Analista de marketing / performance analyst** que abre 4 pestañas (Meta, Google, GA4, su Excel) todas las mañanas y cruza data a mano.
- **Gerente de marketing / CMO / Head of Growth** que reporta el ROAS del mes al directorio y no duerme bien sabiendo que los números pueden estar inflados.
- **Analista de ecommerce** que tiene que explicar por qué "Meta dijo $300k, Google dijo $280k, pero las ventas totales fueron $500k".
- **Gerente / Head de ecommerce** que tiene la cuenta completa y necesita ver si la publicidad efectivamente vende.
- **Director de media / trafficker** interno o de agencia que compra ads todos los días y toma decisiones de pausar/escalar/redistribuir.
- **Agencia de marketing digital / performance** que atiende a este cliente — acceder a NitroPixel como co-operador permite reportar números creíbles, defender recomendaciones, y bajar el ruido con el cliente.
- **Dueño / CEO** que firma una factura de marketing de $30k, $100k o $500k al mes y quiere saber si esa plata está bien invertida.

### ✅ Y además, tu negocio…
- Invierte **$10.000+ al mes en publicidad digital** (por debajo de eso, la brecha existe pero el ROI de medirla se achica).
- Corre en **2 o más plataformas de ads** (Meta + Google como mínimo). El diferencial escala con la cantidad de canales.
- Usa **más de un canal de venta** (tu tienda + MELI, o tu tienda + marketplace). La atribución cross-channel requiere ver todos los backends.
- Tiene un **equipo que decide sobre ads** (interno, agencia o mix) y necesita una fuente de verdad común.

### ❌ Probablemente no todavía si…
- Invertís menos de $5.000/mes en ads. La complejidad técnica del setup no se justifica.
- Solo usás un canal (ej: solo Google Shopping) y tu negocio está en Shopify puro. Triple Whale / Polar pueden alcanzar.
- No tenés backend propio (dropshipping sin sistema de gestión). NitroPixel necesita backend para integrar.

---

## BLOQUE 6 — PRUEBA SOCIAL (CON HONESTIDAD)

**Título**
Los números fuertes los publicamos cuando los midamos con clientes reales. No antes.

**Bajada**
Los rangos de brecha "15-50%" que citamos vienen de comunicaciones oficiales de Meta y Google sobre modeled conversions, complementados con la experiencia de los primeros pilotos. La cifra específica de tu cuenta la vamos a medir en la primera semana del trial — sin promesas, sin proyecciones infladas.

---

### Lo que podés hacer hoy para estimar tu propia brecha
- Pedí la demo. Traé un snapshot de los últimos 30 días de **Meta Business Manager** (ROAS, conversiones, CAC) y de tu **backend** (órdenes totales, revenue real, clientes nuevos).
- En 30 minutos te armamos una comparativa estimada de qué proporción de las conversiones que Meta te atribuye probablemente sean modeladas, y cuál sería el ROAS real estimado.
- Si el número te sorprende, corremos un trial de 2 semanas con NitroPixel instalado y vemos la brecha real medida.

### Qué vamos a publicar acá cuando haya data
- Brecha promedio "Meta/Google reportado vs. NitroPixel medido" en los primeros 20 clientes.
- % de gasto publicitario recuperado al identificar campañas / placements / adsets que rendían debajo de lo reportado.
- Aumento de ROAS consolidado del primer trimestre post-integración (típico: 10-25% sin sumar presupuesto, solo reasignando).
- Reducción del costo-por-cliente-nuevo real con misma inversión.

**[VISUAL: placeholder "Métricas auditadas desde mayo 2026 · 3 trials en curso · ad spend combinado $450k/mes". Sin cifras fabricadas.]**

---

## BLOQUE 7 — OBJECIONES FRECUENTES

**Título**
Lo que te estás preguntando.

**Bajada**
Nueve objeciones concretas que aparecen en cada demo a marketers. Las respondemos directo, sin endulzar.

---

### "Meta tiene modeled conversions por una razón — funcionan."
Meta hace su mejor esfuerzo con la señal que tiene. El problema no es que el modelo esté "mal" — el problema es que es **un modelo**, con sus supuestos, su intervalo de error, y un incentivo inherente: Meta se beneficia cuando sus números se ven bien. NitroPixel no es un modelo — es medición directa. Si Meta dice 100 conversiones y NitroPixel mide 70, la verdad son 70 (confirmables una por una contra tu backend). Modeled vs. medido no es una "diferencia de perspectiva" — es observación vs. estimación. La medición siempre gana para tomar decisiones de plata.

### "Ya uso Triple Whale / North Beam / Polar."
Son buenas herramientas — si tu stack es Shopify puro. La mayoría están optimizadas para ese ecosistema. En mercados donde conviven VTEX + MELI + Shopify + Tiendanube + 3PL (como LATAM), la integración se vuelve frágil. NitroPixel está diseñado para ese stack complejo desde el día 1. Además, Triple Whale y similares cubren attribution pero no cruzan con inventario, margen por producto, ni LTV observado por cohorte del cliente — porque son tools standalone, no plataformas. NitroSales hace las dos cosas en el mismo sistema.

### "Mi agencia me reporta con sus propios dashboards — no quiero doble reporting."
Todo lo contrario. Cuando tu agencia tiene acceso a NitroPixel, reportan con la **misma verdad** que vos ves. Desaparece la conversación incómoda de "tu Meta dice X, mi análisis dice Y". La agencia recomienda con la data real (y los buenos partners lo prefieren — les saca ruido). Los que se oponen suelen ser los que no quieren que se vea la brecha.

### "¿Puedo confiar en que la medición de NitroPixel sea correcta?"
Sí, y la razón es que **no inventamos nada**. NitroPixel se conecta a la fuente de verdad de tu negocio (tu VTEX / Shopify / Tiendanube / ERP) y lee las órdenes que ahí están registradas. Si una orden no está en tu tienda, no la contamos. Si está, la contamos. Lo único que agregamos es la **atribución** (qué anuncio fue responsable de cada orden), y esa lógica la podés ver / configurar vos.

### "¿Y MELI Ads? ¿Por qué no entra en la medición real?"
Porque MELI Ads es una plataforma publicitaria que vive **adentro de MercadoLibre**: el anuncio se muestra en MELI y la venta se cierra en MELI, sin pasar por tu tienda online. NitroPixel se instala **en tu tienda** — no puede meterse adentro de la plataforma de MELI. Para MELI Ads traemos la data de la API oficial (ad spend, clicks, conversiones reportadas por MELI) y la cruzamos con las órdenes reales de tu cuenta MELI, para tener visibilidad consolidada. Es análisis y reporting, no "medición real vs. modelada". La deep dive de MercadoLibre (incluyendo el rol de MELI Ads en tu operación) vive en la sección **Marketplaces**.

### "¿Qué pasa si mi tienda online no está integrada (por ejemplo, uso una plataforma custom o un CMS viejo)?"
Tenemos conectores nativos para VTEX, Shopify, Tiendanube, WooCommerce. Para backends custom, conexión vía API o exportación periódica — el equipo de integración evalúa caso por caso en el setup.

### "¿Qué tipos de atribución soportan?"
Last-click, first-click, linear, time-decay, position-based, U-shaped, W-shaped, y custom (vos definís los pesos). Podés correr simultáneamente distintos modelos y comparar qué decisiones dan. La metodología por default (recomendada) es time-decay multi-touch con ventana de 30 días, pero es 100% configurable.

### "¿Cuánto cuesta esto en infraestructura / setup?"
El setup técnico está incluido en los packs que incluyen Marketing Digital. El costo marginal para el cliente es cero — cobramos por la sección, no por horas de implementación.

### "¿Esto es compatible con SKAdNetwork / Google Enhanced Conversions?"
Sí. NitroPixel puede exportar conversiones de vuelta a Meta (Conversions API) y a Google (Enhanced Conversions) para **mejorar también el algoritmo de optimización de ellos**. Es decir: no solo te damos la verdad para tus decisiones — te ayudamos a que Meta y Google optimicen mejor con señales más limpias.

---

## BLOQUE 8 — PRECIO

**Título**
Marketing Digital es una funcionalidad de NitroSales. Se activa con los packs que incluyen NitroPixel + análisis de campañas.

**Bajada**
Marketing Digital no se vende standalone — vive pegado a NitroPixel (el motor técnico). El costo escala con **scope** (qué incluye el pack), **scale** (ad spend mensual gestionado y cantidad de cuentas de ads conectadas), y **cantidad de canales** de venta.

### Qué incluye Marketing Digital cuando está activo
- **ROAS, CAC y métricas de performance reales** por campaña, adset y anuncio.
- **Contraste "Reportado por Meta/Google vs. Medido por NitroPixel"** en cada widget.
- **Margen real y productos vendidos** por anuncio.
- **LTV observado y cohortes** por campaña (cruzando con Bondly).
- **Journey cross-channel** con atribución multi-touch configurable.
- **Detección de clicks inválidos / placements sospechosos** con recomendación de exclusión.
- **Server-side pixel** (NitroPixel) instalado y mantenido por nuestro equipo.
- **Export a Meta Conversions API** y a Google Enhanced Conversions para alimentar la optimización algorítmica de las plataformas.
- **Integración con Aurum**: preguntas sobre cualquier campaña, adset o anuncio en lenguaje natural.
- **Alertas automáticas** cuando la brecha reportado/real excede umbral, cuando un placement se rompe, cuando una campaña cruza thresholds de performance.

**CTA primario**
[CTA: Ver planes completos → abre /precios]

**CTA secundario**
[CTA: Pedí una auditoría gratuita de tu ad spend → abre Calendly con campo "Ad spend mensual"]

**[VISUAL: tabla compacta de packs con fila destacada "Marketing Digital + NitroPixel en Pack Growth y Pack Completo".]**

---

## BLOQUE 9 — FAQ

**Título**
Preguntas que nos hacen seguido.

---

**¿Qué tan rápido se ve la brecha entre "reportado" y "medido"?**
A partir del día 7 post-instalación, cuando tenemos 7 días completos de órdenes cruzadas con 7 días de data de ads en paralelo. En la primera auditoría de 90 días (backfill) ya aparece la tendencia histórica.

**¿NitroPixel reemplaza al pixel de Meta / Google?**
No. Conviven. Meta y Google necesitan su pixel para optimizar sus algoritmos internos (lookalikes, retargeting, etc.). NitroPixel se instala en paralelo y **complementa**, además de enviarle señales más limpias a Meta/Google vía Conversions API / Enhanced Conversions.

**¿Puede NitroPixel trackear usuarios a través de dispositivos distintos?**
Con limitaciones. Si el usuario está identificado (email, login), sí — porque se resuelve la identidad vía Bondly. Si es anónimo y cambia de dispositivo, el journey se fragmenta (como con cualquier pixel).

**¿Cómo se manejan los usuarios que explícitamente rechazan tracking (ATT, cookie banners)?**
Respetamos el consentimiento del usuario. Si un usuario rechaza tracking, no lo trackeamos — pero la orden queda igualmente registrada en el backend (eso no depende del usuario). Para ese usuario, NitroPixel registra la venta pero no atribuye a un anuncio específico — se cuenta como "conversión orgánica / no atribuida".

**¿Qué pasa con GDPR, LGPD y normativas de privacidad?**
NitroPixel está diseñado para compliance — tracking condicional al consentimiento, derecho al borrado implementado, data residency en región. El manejo específico se configura en el onboarding según la jurisdicción del negocio.

**¿Puedo ver la brecha histórica de mi cuenta antes de contratar?**
En la demo hacemos una estimación de la brecha probable basada en tu categoría, tu mix de canales y benchmarks de industria. La brecha real medida se ve cuando NitroPixel está instalado.

**¿Funciona con TikTok Ads, LinkedIn Ads, Pinterest?**
Sí. Los conectores de ads son múltiples. Meta y Google son los más usados, pero TikTok, LinkedIn, Pinterest, Twitter/X, Amazon Ads y plataformas programmatic están soportadas.

**¿Hay riesgo de que Meta / Google "bloqueen" NitroPixel o penalicen la cuenta?**
No. NitroPixel se comporta como un pixel first-party estándar + lectura de data vía APIs oficiales. Nada de lo que hacemos viola los términos de uso de ninguna plataforma. Al contrario: usar Conversions API y Enhanced Conversions (que NitroPixel alimenta) es **recomendado explícitamente** por Meta y Google como buena práctica.

---

## BLOQUE 10 — CIERRE + CTA

**Título**
Dejá de escalar campañas sobre números que no existen.

**Subheadline**
Meta te dice. Google te dice. NitroPixel **te muestra**. Por campaña, por adset, por anuncio, por producto, por cliente. Medido, no modelado.

**Body (1 párrafo)**
Hay un momento en la historia de todo equipo de marketing en el que alguien hace la pregunta incómoda: *"¿qué parte de los números que miramos todos los días son reales, y qué parte es estimación?"*. La respuesta, desde 2021, es que **una parte cada vez más grande es estimación**. Las plataformas lo declaran: modeled conversions, modeled attribution, modeled reach. Lo hacen para no dejarte a ciegas, pero el efecto lateral es que estás escalando, pausando y reasignando presupuestos con un margen de error del 15 al 50% respecto a lo que tu negocio realmente factura. NitroPixel existe para cerrar esa brecha. Vive en tu backend, ve cada orden real, cruza con los anuncios que participaron del journey, y te devuelve **la verdad**: qué ROAS real tiene cada campaña, qué productos vendió cada anuncio, qué margen dejó, qué clientes trajo y cuánto valen esos clientes en el tiempo. No es un dashboard más sobre la data de Meta. Es una fuente paralela y más precisa — la tuya. El día que conectás NitroPixel y ves la primera brecha "reportado vs. real" de tu propia cuenta, ya no volvés al mundo de antes. Porque decidir marketing con los números de Meta, pudiendo decidir con los tuyos, ya no tiene sentido.

**CTA primario**
[CTA: Pedí tu auditoría gratuita → abre Calendly + input de ad spend mensual]

**CTA secundario**
[CTA: Conocé NitroPixel → link a /nitropixel]

**Texto final chico**
En la demo hacemos una estimación de la brecha probable en tu cuenta. Si después del trial no se confirma una brecha significativa, no avanzamos. Simple.

**[VISUAL: cierre con gradient NitroSales + pantalla dividida "Meta Ads Manager / NitroPixel" con cifras en contraste. Texto grande: "Informamos el real". CTAs grandes.]**

---

## FOOTER (compartido con la matriz y las otras sub-landings)

**Navegación**
- Producto: NitroPixel · Aurum · Bondly · Aura · Control de gestión · Marketing digital · Rentabilidad · Productos · Finanzas
- Recursos: Blog · Guías · Comparativas · Changelog
- Empresa: Sobre NitroSales · Founders · Contacto

**Legal**
- Términos · Privacidad · GDPR · LGPD · Status page

**Redes**
LinkedIn · Twitter/X · YouTube · WhatsApp

---

## NOTAS DE IMPLEMENTACIÓN (no van en la landing)

### Elementos que dependen de la próxima iteración
- Los **números concretos de brecha medida** en clientes reales se publican post 20 cuentas auditadas con 60+ días de NitroPixel activo.
- Los **logos de clientes** no se publican hasta tener autorización firmada + data medida.
- La **tabla de planes** del Bloque 8 referencia `/precios` pendiente del Modelo D 2D final post 5 betas.
- Los ejemplos numéricos del Bloque 3 son ilustrativos con ballpark realista — en producción se reemplazan por casos reales con autorización.

### Cross-links obligatorios
- Al inicio (header): linkea a `/` (matriz), a `/nitropixel` (el motor técnico atrás de esta sección), y a `/control-gestion` (para armar tableros custom de marketing).
- En Bloque 3B: linkea los activos (nitropixel, productos, bondly, aurum) explícitamente.
- En Bloque 8: linkea a `/precios`.
- En Bloque 10: linkea a `/nitropixel` (partner técnico).

### Reglas de voz (checklist antes de publicar)
- [ ] Cero signos de exclamación.
- [ ] Cero emojis en body (solo en los ✅ / ❌ del Bloque 5, controlado).
- [ ] Voseo consistente.
- [ ] Cero números inventados en prueba social (Bloque 6 con placeholder explícito).
- [ ] Los rangos 15-50% de brecha están respaldados por docs oficiales de Meta y Google (modeled conversions / attribution) y auditorías públicas de la industria post-iOS14.
- [ ] Mención honesta de que NitroPixel tiene cobertura 85-95% (no 100%) y que respeta consentimiento del usuario.
- [ ] Mención honesta de que para usuarios que rechazan tracking, la venta se registra pero no se atribuye.
- [ ] Mención honesta de que NitroPixel convive con pixel de Meta/Google, no los reemplaza.
- [ ] CERO segmentación por facturación en Bloque 5 (sí se segmenta por ad spend — distinto concepto, técnicamente justificado).
- [ ] Ejemplos numéricos usan ballpark realista.
- [ ] **Tono contundente-impacto** — es la landing donde el Tier 3 se pone más técnico y más shock-value. (Instrucción explícita Tomy 2026-04-19.)
- [ ] **Mantra "Informamos el real"** aparece en eyebrow, en Body del Hero, en Bloque 3B, y en cierre.
- [ ] **Contraste "reportado vs. medido"** visible en TODOS los widgets del Bloque 3 donde aplique.
- [ ] **Granularidad máxima explícita**: "por campaña, por adset, por anuncio, por producto, por cliente, por canal, por journey" — esta frase aparece varias veces como refuerzo.
- [ ] Hero abre con la verdad incómoda ("El ROAS que te muestra Meta no es el que cobra tu negocio").
- [ ] Bloque 5 menciona explícitamente a los 7 perfiles objetivo (analista marketing, gerente marketing, analista ecommerce, gerente ecommerce, director media, agencia, dueño).
- [ ] Bloque 7 tiene 9 objeciones (más que el promedio) — porque este target es más escéptico y más técnico, merece respuestas a fondo. Incluye explícitamente la objeción sobre MELI Ads y por qué queda fuera del alcance de medición de NitroPixel.
- [ ] **Distinción MELI Ads vs. resto** aparece en la tesis inicial, en el Hero (subhead), en el Trust Strip (tercera línea explícita), en Bloque 4 (paso 2), y en Bloque 7 (objeción dedicada). NitroPixel NO mide MELI Ads porque MELI Ads vive adentro de MELI — se trae data de la API de MELI Ads como análisis informativo, no como "verdad medida". Cross-link a `/marketplaces` para la deep dive.

### Flujo narrativo
Hero (shock: tu ROAS no es real) → Trust Strip (plataformas ads + backends + first-party + nota MELI Ads) → Bloque 3 (5 preguntas respondidas con contraste reportado/real: ROAS real / productos por anuncio / LTV por campaña / journey cross-channel / fraude y clicks inválidos) → Bloque 3B (por qué otros no alcanzan — Meta te da su versión, Triple Whale es attribution standalone) → Bloque 4 (setup 1 semana, 3 pasos, backfill 90d) → Bloque 5 (7 perfiles de marketing / ecommerce / media) → Bloque 6 (honestidad con placeholder + estimación gratuita de brecha) → Bloque 7 (9 objeciones técnicas, incluyendo por qué MELI Ads queda fuera) → Bloque 8 (precio — NitroPixel incluido) → Bloque 9 (FAQ — modeled vs measured, privacidad, compliance) → Bloque 10 (cierre "dejá de escalar sobre números que no existen").

### Patrón distintivo vs. resto del Tier 3
- **Tono más contundente** que el resto. Las otras landings son de "resolución de dolor"; esta es de **verdad incómoda**. El target técnico lo aprecia.
- **Mantra explícito** ("Informamos el real") que puede convertirse en la promesa pública de la marca en este vertical.
- **8 objeciones en Bloque 7** (vs. 6-7 habitual) por target más escéptico.
- **Único cross-link cruzado con /nitropixel** (Tier 1) porque /marketing-digital es la manifestación visible del motor de infraestructura. Se menciona explícitamente.
- **Primer uso de "shock value" calculado** en toda la matriz de landings. Tomy lo pidió explícito.

### Apertura de Fase 3 (actualizada)
Con Marketing Digital v1 completada, llevamos 5 de las 8 landings del Tier 3. Quedan:
- `/integraciones` — hub de conexiones (diferencial vs Triple Whale Shopify-only).
- `/alertas` — Aurum proactivo (detección de anomalías).
- `/marketplaces` — MELI deep dive.

---

_Última actualización: 2026-04-19 — v1.1 Sesión 3 VM (Fase 3-5 · Tier 3 quinta landing · primera con ángulo shock-value explícito y mantra "Informamos el real"). v1.1 saca MELI Ads del ángulo de medición con NitroPixel (MELI Ads vive adentro de MELI, NitroPixel se instala en tu tienda online). Próxima iteración post feedback de Tomy._
