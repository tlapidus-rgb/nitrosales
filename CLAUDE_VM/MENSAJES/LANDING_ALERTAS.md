# LANDING /alertas — Alertas

> **Qué es este archivo**: el texto (copy) completo y canónico de la landing `/alertas`. Tier 3 — Funcionalidad/panel de NitroSales. Séptima landing de Fase 3 (post /rentabilidad, /productos, /finanzas, /control-gestion, /marketing-digital, /integraciones).
>
> **Alcance**: SOLO texto. No incluye diseño, colores, tipografías, imágenes ni layout. Eso corresponde a `BRAND_VISION.md` (Fase 2B).
>
> **Qué es Alertas (definición del positioning)**: "El ojo que ve todo tu ecosistema ecommerce y te avisa cuando algo se sale del plan. Por default mira solo, sin que configures nada. Y si querés que mire algo más específico de tu negocio, se lo pedís a Aurum en castellano — sin rules engine, sin umbrales, sin wizards." Alertas NO es un producto con identidad de marca propia — es **la capa de vigilancia continua de NitroSales**, donde convergen las anomalías que el sistema detecta solo y las reglas que el negocio le pide a Aurum crear en lenguaje natural. Vive como hub central en `/alertas` (inbox style de 3 columnas: sidebar jerarquizado + lista temporal + detalle).
>
> **Tesis central — dos capas, un solo hub, cero fricción de setup**:
>
> Primera capa: **el ojo vigila solo desde el minuto cero**. Una vez que están conectadas las integraciones del ecosistema ecommerce (VTEX, MELI, Shopify, Tiendanube, Meta Ads, Google Ads, bancos, pasarelas), NitroSales empieza a mirar un set base de cosas que "no deberían salirse de control" — fallas de sync, preguntas de MELI sin responder hace más de 24h, vencimientos fiscales próximos, Monotributo acercándose al tope, runway bajo, CAC payback que explota, caídas súbitas de venta, spend sin retorno, stock crítico con órdenes en curso, churn de clientes VIP. Nadie tiene que configurar ni entrenar nada — el ojo viene con visión base de fábrica.
>
> Segunda capa: **si querés que el ojo mire algo más específico, le hablás a Aurum**. En la sección que estés (campaigns, productos, clientes, finanzas) o en `/aurum` directo, le escribís en castellano lo que querés que te avise: "avisame si esta campaña sube su CPA más de 20% de un día al otro", "avisame si el margen de la categoría Pañales baja del 18%", "avisame si algún cliente VIP no compra en 60 días". Aurum entiende lo que le pedís, crea la alerta con la regla correcta por debajo, y la alerta pasa a vivir en `/alertas` con su row, severidad, CTA, read state y favoritas — igual que cualquier alerta del piso proactivo. Cero rules engine expuesto al usuario. Cero formularios de condiciones. Cero wizards.
>
> **Audiencia primaria**: **todo el negocio ecommerce a la vez**. La landing no habla a un perfil único — habla a cualquiera que esté operando parte del ecosistema y no quiera vivir mirando 10 pestañas para descubrir que algo se rompió hace 3 días.
> - CEO / dueño → runway, caídas de venta, spend sin retorno, churn de VIP, salud del negocio de un vistazo.
> - Growth / performance → CPA escapándose, ROAS cayendo, creatives quemados, campañas pausadas sin aviso, presupuesto consumido antes de tiempo.
> - Contador / CFO → vencimientos fiscales, Monotributo, margen negativo por categoría, cash runway por umbral, reconciliación atrasada.
> - Product / compras / operaciones → stock crítico, quiebres inminentes, rotación anómala, sync de alguna plataforma caído.
> - Customer / atención / MELI → preguntas sin responder, reputación bajando, reclamos abiertos, publicaciones pausadas.
>
> **Audiencia secundaria**: socios, directorio, inversores que quieren saber que hay un sistema mirando continuamente sin depender de que alguien del equipo se acuerde de revisar.
>
> **Tono**: **directo, aliviador, conversacional**. Menos técnico que `/finanzas`, menos narrativo que `/rentabilidad`, más cercano a lo que sentís cuando un socio de confianza te dice "relajate, yo te aviso si pasa algo". Es una landing que tiene que transmitir **descanso mental** — sacate de encima la carga de estar revisando todo el tiempo, hay un ojo mirando.
>
> **Ángulo narrativo — el ojo**: la metáfora central es literal — "un ojo que ve absolutamente todo lo que pasa en tu ecosistema y chequea que nada salga fuera del control y todo esté saliendo como está en los planes". Funciona porque es lo que todo dueño de ecommerce quiere y nunca tuvo: alguien (o algo) mirando todo el tiempo, sin olvidarse, sin cansarse, sin pedir que le expliques qué mirar. El texto vuelve a esa metáfora varias veces sin abusar.
>
> **Ángulo secundario — cero setup manual**: la diferencia con cualquier rules engine del mercado (Zapier, IFTTT, n8n, workflows nativos de Shopify / Meta / MELI, reglas custom de dashboards genéricos) es que acá **el usuario no entra nunca a configurar condiciones**. O el sistema ya mira por default, o le pide a Aurum que mire algo más. Nada de formularios de `if X > Y then notify`.
>
> **Ángulo terciario — un solo lugar**: hoy las alertas están repartidas en 8 apps distintas — Meta te manda un email cuando una campaña se pausa, MELI te notifica dentro de su app que hay una pregunta, Shopify te manda push cuando se agota stock, el banco te avisa vía SMS cuando hay un débito grande, el software contable te avisa cuando vence una declaración. Nadie las mira todas. `/alertas` es un inbox único donde todo converge, con severidad normalizada, read state, favoritas, filtros por categoría/fuente, agrupación temporal.
>
> **Honestidad obligatoria**:
> - El "ojo" ve lo que tiene conectado. Si una fuente no está conectada (ej: tu banco no tiene API), no ve lo que pasa ahí hasta que se conecte (o se carga manualmente). Se dice claro.
> - Aurum crea alertas sobre data que **ya existe** en el sistema. Si pedís una alerta sobre algo para lo que no hay data conectada, Aurum te lo dice y te pide conectar la fuente antes. No inventa data.
> - Las alertas proactivas por default son las de las fuentes activas al momento del lanzamiento (sync, MELI preguntas, fiscal calendario, Monotributo, predictivas financieras). Las de productos Bondly / Aura / NitroPixel aparecen como "Próximamente" en el sidebar hasta que la Fase 8f y siguientes las activen.
> - La rules engine técnica que procesa las alertas creadas por Aurum se audita desde `/alertas/reglas` (sección de "qué reglas tenés activas") — pero la creación normal se hace hablándole a Aurum, no ahí.
> - Las alertas no reemplazan al sentido común del operador ni al análisis humano — son una capa de vigilancia base para que nada importante pase desapercibido.
>
> **Regla explícita**: NO segmentar por facturación. El fit se define por **complejidad del ecosistema conectado** (cuántas plataformas, cuántas personas mirando cosas distintas), no por tamaño.
>
> **Palabras prohibidas** (además de las generales): "configurá alertas", "armá reglas", "definí condiciones", "seteá umbrales", "workflow engine", "rules builder", "poderoso", "potente", "revolucionario", "inteligencia artificial de última generación", "IA predictiva". La IA real que usamos (Aurum) se muestra funcionando, no se vende como adjetivo.
>
> **Última actualización**: 2026-04-20 — v1.1 Sesión 3 VM (pase consistencia Tier 3). v1.1 cambia 3 referencias `/mercadolibre` → `/marketplaces`, saca cross-links externos a `/customers` y `/customers/vip` (pantallas internas), y fraseo alrededor de Mercado Ads queda como "próximamente" / "en roadmap" sin números de fase en copy público.

---

## BLOQUE 1 — HERO

**Eyebrow (arriba del headline)**
ALERTAS · EL OJO QUE MIRA TU ECOMMERCE CUANDO VOS NO PODÉS

**Headline (H1)**
Un ojo que ve todo lo que pasa en tu ecosistema. Y un oído que entiende castellano.

**Subheadline (H2)**
NitroSales vigila las 24h y te avisa cuando algo se sale del plan. Si querés que mire algo más específico de tu negocio, se lo decís a Aurum en castellano — sin configurar reglas, sin umbrales, sin wizards.

**Body (1 párrafo)**
Hay una pregunta que vive con cualquier dueño de ecommerce todo el día: "¿hay algo pasando ahora mismo que debería saber y no sé?". Meta pausa una campaña, una pregunta de MercadoLibre se queda sin responder 48 horas, un SKU se queda sin stock con órdenes en curso, la reputación de tu cuenta ML empieza a bajar, el CPA de una campaña se triplica en dos días, el runway de caja pasó por debajo de 3 meses, un cliente que te compraba todos los meses hace 60 días que no aparece, Monotributo se te acerca al tope. Ninguna de esas cosas te llega a tu mesa el día que pasan — llegan tarde, cuando ya hiciste daño. Alertas existe para invertir eso: **hay un ojo mirando todo tu ecosistema, todo el tiempo, y cuando algo se sale del plan te lo dice**. Por default el ojo ya sabe mirar las cosas básicas que ningún negocio ecommerce debería dejar escaparse. Y si querés que también mire algo tuyo muy específico — una métrica, un umbral, un cliente, una campaña — le hablás a Aurum en castellano y listo. Sin configurar reglas. Sin aprender nada nuevo. La alerta aparece sola en `/alertas` cuando se tenga que disparar.

**CTA primario**
[CTA: Pedí tu demo → abre Calendly]

**CTA secundario**
[CTA: Ver Alertas en vivo (3 minutos) → abre video demo]

**[VISUAL: centro de la pantalla ocupado por una representación visual del "ojo" — no literal sino abstracta: una forma circular con radiales que se expanden hacia varios iconos orbitando (tienda, marketplace, ads, banco, inventario, cliente, fiscal). Alrededor del ojo, pequeñas alertas que aparecen con animación sutil: "CPA Meta +34% en 48h", "Stock crítico: SKU-1293", "Runway 2.9 meses", "Cliente VIP sin comprar 62 días". Abajo, un chat minimalista donde un mensaje dice "Avisame si el margen de Pañales baja del 18%" y la respuesta muestra "Listo — alerta creada." Mensaje visual: el ojo mira solo + vos sumás lo que quieras sin esfuerzo.]**

---

## BLOQUE 2 — TRUST STRIP

**Línea única**
El ojo ya mira por default: sync de plataformas · MercadoLibre (preguntas, reputación, reclamos) · calendario fiscal + Monotributo · runway de caja y CAC · caídas de venta y spend sin retorno · stock crítico · churn de clientes VIP · anomalías predictivas de `/finanzas/pulso`. Todo lo demás se lo pedís a Aurum en castellano.

**Segunda línea**
Cinco fuentes activas hoy + expansión progresiva con Aurum, Bondly, Aura y NitroPixel. Una sola bandeja, read state sincronizado, favoritas persistidas, filtros por severidad, agrupación por tiempo (hoy / esta semana / más viejas).

**[VISUAL: fila de chips / íconos representando las fuentes activas en escala de grises (Sync · ML · Fiscal · Monotributo · Finanzas Predictivas) + chip destacado "Aurum entiende castellano" en color cálido. Abajo, chips en gris clarito con tag "Próximamente": Aurum task completions · Bondly · Aura · NitroPixel.]**

---

## BLOQUE 3 — LO QUE EL OJO VIGILA, Y LO QUE LE PEDÍS A AURUM

**Título de la sección**
Cinco áreas que el ojo mira solo desde el día uno. Más todo lo que quieras sumar hablándole a Aurum.

**Bajada**
No hay un "wizard" para configurar alertas. Hay dos caminos claros: **(a) lo que viene mirando solo por default**, explicado abajo en cinco áreas concretas; y **(b) lo que quieras sumar**, que se hace escribiéndole a Aurum desde donde estés, en la sección del producto que estés mirando, en una frase en castellano. Esa alerta se crea al toque y empieza a vivir en `/alertas` con todo el framework (severidad, CTA, read state, favoritas).

Cada área de abajo arranca con **Qué mira el ojo solo**, sigue con **Ejemplo concreto de lo que podés pedirle a Aurum en esa misma área**, y cierra con **Una alerta real** del día a día.

---

### 1. Ventas, spend y rentabilidad — que nada se te escape en vivo

**Qué mira el ojo solo**
Caídas súbitas de ventas por canal (VTEX, MELI, Shopify, Tiendanube) vs. tendencia propia. Overspend de campañas que gastan sin traer retorno. CPA de Meta / Google / MELI Ads cuando se dispara contra el promedio histórico. Margen negativo por categoría. Descuentos aplicados que comen margen por encima del planeado. Velocidad de rotación que se corta abrupto.

**Ejemplo concreto de lo que podés pedirle a Aurum**
Estás en `/campaigns` mirando Meta Ads. Le escribís al bubble de Aurum que flota abajo a la derecha:
> *"Avisame si esta campaña sube su CPA más de 25% de un día al otro."*

Aurum entiende el contexto (ya sabe qué campaña estás mirando), crea la alerta, y te responde "listo — vas a verla aparecer en `/alertas` cuando se dispare, con link directo acá".

**Una alerta real**
> **Severidad: crítico**
> *La campaña "Pañales_Conversion_Abril" subió su CPA de US$ 3.40 a US$ 6.10 en 48h. Spend acumulado de los últimos 7 días: US$ 1.340. Ventas atribuidas: 4. El ROAS pasó de 2.8 a 0.9. Revisar creatives o pausar antes del fin de semana.*
> [Ir a la campaña →]

---

### 2. Plataformas, sync y operación — que ninguna integración quede caída sin darte cuenta

**Qué mira el ojo solo**
Fallas de sync en cualquier plataforma conectada (VTEX / MELI / Shopify / Tiendanube / Meta / Google / bancos / pasarelas). Errores repetidos en un canal que antes funcionaba. Preguntas de MercadoLibre sin responder hace más de 24 horas (warning si hay 1-4, crítico si hay 5+). Reputación de MELI bajando. Reclamos abiertos sin atender. Publicaciones pausadas automáticamente por la plataforma.

**Ejemplo concreto de lo que podés pedirle a Aurum**
Estás en `/marketplaces` viendo tus publicaciones. Le decís a Aurum:
> *"Avisame si alguna publicación de las top 10 en ventas pierde la caja de compra."*

Aurum crea la alerta sobre ese subconjunto específico (no sobre el catálogo entero, que sería ruido), la guarda con los 10 SKUs actuales + lógica de actualización, y la alerta salta cuando corresponde.

**Una alerta real**
> **Severidad: advertencia**
> *Tenés 7 preguntas sin responder en MercadoLibre de más de 24h. La publicación "Set Pañales Newborn x3" acumula 4 de esas 7. Responderlas rápido protege conversión y reputación.*
> [Ver preguntas →]

---

### 3. Plata, caja y runway — que no te sorprenda ningún agujero

**Qué mira el ojo solo**
Cash runway por debajo de 3, 6, 12 meses (niveles definidos por el motor de `/finanzas/pulso`). CAC payback que se alarga vs. mes anterior. Ratio LTV:CAC que cae por debajo de umbrales saludables. Margen bruto que baja por categoría o canal. Reconciliación bancaria atrasada más allá del umbral del negocio. Gastos recurrentes que cambian de forma significativa sin explicación. Ingresos de un canal que se desvían de la proyección.

**Ejemplo concreto de lo que podés pedirle a Aurum**
Desde `/aurum` directo, sin contexto de página:
> *"Avisame si el margen bruto mensual baja del 28% — ese es el piso que tenemos como plan."*

Aurum entiende que estás fijando un umbral contra el plan mensual del negocio, crea la alerta contra el dato que ya calcula `/finanzas/estado`, y la dispara el primer día que cruce el umbral.

**Una alerta real**
> **Severidad: crítico**
> *Cash runway bajó a 2.8 meses. Burn actual: US$ 48.200/mes. Caja disponible: US$ 134.900. La caída se explica por un aumento de 22% en spend de Meta vs. los 60 días previos sin variación equivalente en revenue. Revisar o ajustar presupuesto antes del próximo ciclo.*
> [Ir a Pulso →]

---

### 4. Fiscal, compliance y obligaciones — que ningún vencimiento te agarre de atrás

**Qué mira el ojo solo**
Vencimientos fiscales en los próximos 5 días (warning), próximos 1-2 días (crítico) según el calendario cargado en `/finanzas/fiscal`. Monotributo acercándose al tope anual según proyección conservadora (revenue 12 meses o la mayor entre actual y promedio de los últimos 3 meses anualizado). Cambios de categoría sugeridos. Facturación pendiente por cargar. Retenciones no aplicadas. Descuentos del régimen que vencen.

**Ejemplo concreto de lo que podés pedirle a Aurum**
Desde `/finanzas/fiscal`:
> *"Avisame si proyectamos cerrar el año por encima del tope del Monotributo, con al menos 60 días de anticipación."*

Aurum crea la alerta con el umbral de anticipación pedido, y va a dispararla la primera semana que la proyección cruce el tope.

**Una alerta real**
> **Severidad: advertencia**
> *Proyección anual: ARS 58.700.000 (conservadora). Tope Monotributo categoría actual: ARS 56.000.000. Estás a 61 días de vencimiento. Conviene empezar a evaluar Responsable Inscripto o subir de categoría antes de cruzar el tope.*
> [Ver Monotributo →]

---

### 5. Clientes, producto y stock — que el problema no viaje contigo sin que lo sepas

**Qué mira el ojo solo**
Stock crítico con órdenes en curso (SKU con ventas activas y stock que no alcanza para cumplir). Quiebre inminente (velocidad de venta > cobertura en días). Rotación anómala vs. el histórico propio. Churn de clientes VIP (no compran hace más de X días, donde X se define por tu cohorte real, no por un genérico). Devoluciones concentradas en un producto o canal. Reclamos abiertos sin atender. NPS que cae en la última cohorte medida.

**Ejemplo concreto de lo que podés pedirle a Aurum**
Estás mirando tus clientes VIP dentro de la plataforma:
> *"Avisame cuando algún cliente del top 50 LTV no compre hace más de 60 días."*

Aurum arma la lógica sobre ese segmento (top 50 por LTV), crea la alerta, y la dispara individualmente por cada cliente que cruce el umbral. Vos ves una alerta por cliente, con botón directo a mandarle un mensaje desde Bondly.

**Una alerta real**
> **Severidad: advertencia**
> *María L. (top 20 LTV, 14 compras en 18 meses, ticket promedio ARS 78.000) no compra hace 63 días. Última compra: 15 de febrero. Es candidata a reactivación antes de que pase a frío.*
> [Abrir ficha en Bondly →]

---

**Estas son las cinco áreas que el ojo mira desde el día uno.** Cualquier cosa que quieras sumar — una métrica específica de tu negocio, un umbral que definiste en un plan, un segmento custom, una combinación que sólo aplica a tu caso — se lo pedís a Aurum en castellano y queda creada en segundos. Sin rules engine. Sin formularios. Sin abrir otro lugar.

---

## BLOQUE 3B — POR QUÉ ESTO NO ES ZAPIER, IFTTT, NI LAS NOTIFICACIONES DE TU PLATAFORMA

**Título**
Todo esto ya lo hace "otra herramienta". Spoiler: no.

**Bajada**
La pregunta razonable es: "¿no puedo hacer esto con Zapier / IFTTT / notificaciones nativas de Meta / Shopify / MELI / mi banco?". Respuesta honesta: podrías intentarlo, y vas a terminar armando un Frankenstein que no escala. Acá está por qué.

---

**Las plataformas nativas son silos.**
Meta te avisa dentro de Meta. MELI te avisa dentro de MELI. Shopify manda emails. Tu banco manda SMS. Cada una tiene su bandeja, su criterio de severidad (o ninguno), y cero cruce con el resto de tu negocio. La alerta de "campaña pausada" no sabe que además tu stock del producto estrella está al borde del quiebre. Nadie conecta los puntos. Vos.

**Zapier / IFTTT / n8n son workflow engines que te exigen ingeniería.**
Son buenas herramientas para flujos simples. Para alertas de negocio ecommerce reales, terminás escribiendo docenas de zaps con condiciones anidadas, filtros, "if/else branches", y rezando que no se rompa la primera vez que cambia una API. Y la persona que los arma necesita entender técnicamente cada integración. No es fácil — es una forma distinta de complejidad.

**Los rules engines de los dashboards genéricos (Looker, Power BI, Tableau, Metabase) son formularios de condiciones.**
Te piden que entres a una UI, elijas una métrica, definas un umbral, un operador (mayor, menor, igual), una ventana de tiempo, una frecuencia de chequeo, un canal de notificación. Es mejor que nada, pero requiere que seas vos el que piense el criterio, lo traduzca a la sintaxis del tool, y lo mantenga. Y si cambia la estructura de la data por un cambio de API, se rompe.

**NitroSales parte de un lugar distinto.**
Primero, **el ojo ya mira un set base por default**, sin que nadie configure nada — porque hay cosas que todo ecommerce debería estar vigilando siempre (runway, vencimientos, stock crítico, CPA quemado, preguntas ML sin responder). Segundo, **lo que no está en el set base se agrega hablándole a Aurum en castellano**. Aurum entiende el pedido, sabe qué data está conectada, crea la regla correcta por debajo, y guarda la alerta. No hay formulario de condiciones, no hay umbrales que definir, no hay operadores booleanos que aprender. Tercero, **todo converge en una sola bandeja** — `/alertas` — con severidad normalizada, read state sincronizado, favoritas por usuario, filtros y agrupación temporal. No tenés que andar cazando entre 8 apps distintas.

**Y lo más importante**: cuando una API de origen cambia, lo arreglamos nosotros. Vos no te enterás. El ojo sigue mirando, las alertas creadas por Aurum siguen funcionando. No hay zap que mantener.

**[VISUAL: comparativa visual de 4 columnas — Plataformas nativas (fragmentadas, íconos de varias apps aisladas) / Zapier-IFTTT (un diagrama de flujo enredado con nodos y flechas) / Dashboards BI (un formulario con campos vacíos) / NitroSales (un ojo + una burbuja de chat con Aurum + un inbox limpio con alertas unificadas). Colores desaturados en las 3 primeras, colores vivos en la última.]**

---

## BLOQUE 4 — CÓMO SE PONE EN MARCHA

**Título**
Cero setup manual. El ojo empieza a mirar desde el primer minuto.

**Bajada**
No hay fase de "configuración de alertas" en el onboarding. Desde el día uno, el ojo vigila lo que puede vigilar con la data conectada. Sumar alertas custom después es una conversación de 10 segundos con Aurum.

---

**Paso 1. Conectás tus integraciones del ecosistema ecommerce (una vez sola)**
Lo mismo que para cualquier funcionalidad de NitroSales: VTEX, MercadoLibre, Shopify, Tiendanube, Meta Ads, Google Ads, bancos, pasarelas. Cada fuente habilita automáticamente las alertas del ojo que dependen de esa fuente. Por ejemplo: conectar MELI habilita las alertas de preguntas sin responder, reputación, publicaciones pausadas. Conectar tu contabilidad (import + export) habilita Monotributo, vencimientos, Responsable Inscripto si aplica.

**Paso 2. El ojo arranca solo**
Al terminar el onboarding, `/alertas` empieza a poblarse con lo que detecta el ojo. La primera vez es la más relevante — solemos ver entre 5 y 20 alertas "históricas" que estaban pasando pero nadie se había dado cuenta (preguntas MELI acumuladas, sync caído de alguna plataforma hace días, SKUs en quiebre, vencimientos próximos). El equipo las revisa, las marca leídas o las snoozea, y a partir de ahí el flujo ya es normal.

**Paso 3. Sumás lo tuyo hablándole a Aurum, cuando lo necesites**
No tiene que ser el día uno. La primera semana, típicamente, cada persona del equipo pide 2-5 alertas específicas mientras recorre sus pantallas. Al final del mes hay entre 15 y 40 alertas custom conviviendo con el set base — todas creadas en una frase, ninguna por formulario.

**Paso 4. El sistema se mantiene solo**
Cuando cambia una API, lo arreglamos nosotros — vos no te enterás. Cuando sumamos fuentes nuevas (Aurum task completions, Bondly, Aura, NitroPixel — en fases próximas), las alertas base correspondientes aparecen automáticamente en la sección "Próximamente" del sidebar hasta que estén live.

---

**[VISUAL: timeline horizontal con 4 pasos. Paso 1 con íconos de las integraciones. Paso 2 con una pantalla de `/alertas` poblándose con las primeras alertas (stagger animation). Paso 3 con el chat de Aurum visible ("Avisame si...") → alerta que aparece en el inbox. Paso 4 con un ícono de reloj / mantenimiento invisible.]**

---

## BLOQUE 5 — PARA QUIÉN ES CADA PARTE

**Título**
Una sola bandeja. Muchos roles encontrando lo suyo.

**Bajada**
`/alertas` no es "solo para el dueño" ni "solo para el equipo de operaciones". Cada rol ve las alertas que le tocan, con un sidebar que permite filtrar por categoría, por fuente y por severidad. El read state es por usuario (si vos marcás una alerta como leída, no afecta al resto del equipo). Las favoritas también.

---

**CEO / dueño / director general**
Entra 2 veces al día (arranque + cierre). Lo que más mira: runway, caídas de venta del día, campañas que se dispararon en CPA, churn de VIP. Las alertas están pensadas para que en 30 segundos sepa si hay algo a atender o puede seguir con su día.

**Growth / performance manager**
Entra varias veces al día, sobre todo cuando hay campañas activas. Lo que más mira: CPA escapándose, ROAS cayendo, creatives con fatiga, presupuesto consumido antes de tiempo, campañas pausadas automáticamente por la plataforma. Pide seguido a Aurum alertas específicas por campaña o segmento.

**Contador / CFO / analista financiero**
Entra diariamente en período de cierre y una o dos veces por semana el resto del mes. Lo que más mira: vencimientos fiscales, Monotributo, margen negativo por categoría, cash runway, reconciliación atrasada. Pide a Aurum alertas sobre planes y umbrales internos del negocio ("avisame si X categoría pasa de Y en gasto").

**Product / compras / operaciones**
Entra 1-2 veces al día. Lo que más mira: stock crítico, quiebres inminentes, sync caído, rotación anómala. Alertas que se conectan con `/productos` y con la infraestructura de inventario de NitroSales.

**Customer / atención al cliente / MELI**
Entra cada vez que revisa pendientes. Lo que más mira: preguntas de MELI sin responder, reclamos abiertos, reputación bajando, publicaciones pausadas. Alertas con CTA directo a la pantalla de resolución.

**Roles ejecutivos y soporte (socios, directorio, inversores, CFO fraccional)**
Acceso a la bandeja completa con permisos de solo lectura, sin tener que pedir reportes semanales a nadie.

---

**[VISUAL: 5 tarjetas (una por perfil) con un mini-inbox de ejemplo mostrando las 3 alertas más típicas para ese rol, cada una con su severidad visual.]**

---

## BLOQUE 6 — PRUEBA SOCIAL

**Título**
Lo que nos dicen los primeros equipos que lo están usando.

**Bajada**
Todavía estamos en betas cerradas. Cuando tengamos 60-90 días de operación con alertas activas por cliente vamos a publicar números medidos. Por ahora, fragmentos reales de feedback.

---

> *"Lo primero que vi cuando conectamos las integraciones fueron 14 preguntas de MELI sin responder de hace más de 2 días. Las resolvimos todas en una hora. No tenía idea de que estaban ahí."*
> — Fundador, beta cerrada en marca de moda infantil.

> *"Le pedí a Aurum que me avise si el margen de una categoría específica bajaba del 22%. Tardó 10 segundos en crear la alerta. Hace dos meses atrás, para eso hubiera tenido que abrir 3 planillas."*
> — Director comercial, beta cerrada en marca de consumo.

> *"Dejé de abrir 8 pestañas cada mañana. Ahora abro una sola — `/alertas` — y si no hay nada, sigo con mi día."*
> — CEO, beta cerrada en marca DTC de accesorios.

> *[Placeholder para 1-2 casos con métricas medidas — "Equipo de 6 personas pasó de X horas/semana revisando pantallas a Y horas/semana; cantidad de alertas custom creadas por usuario en los primeros 30 días: Z"]*

---

**[VISUAL: 3-4 cards con el quote + nombre de rol + logo en escala de grises placeholder. Layout tipo testimonial clásico.]**

---

## BLOQUE 7 — OBJECIONES

**Título**
Lo que te estás preguntando.

**Bajada**
Siete dudas concretas que aparecen en cada demo de Alertas. Respuesta directa a cada una.

---

### "Ya tengo notificaciones en Meta, Google, Shopify, MELI y el banco. ¿Para qué necesito otra cosa?"
Porque esas notificaciones viven en 8 apps distintas, usan criterios de severidad que no se cruzan entre sí, no saben nada de tu negocio (Meta te avisa que pausó una campaña sin saber que tu stock del producto está crítico), y se te mezclan con miles de mails de marketing hasta que las ignorás. `/alertas` es una bandeja única donde todo se normaliza, con severidad compartida, CTA accionable y read state propio. No reemplazamos las notificaciones de las plataformas — hacemos que dejen de ser el lugar donde las mirás.

### "¿Esto no es lo mismo que Zapier o un rules engine?"
No. Zapier / IFTTT / n8n son workflow engines que te exigen que seas vos quien piense, arme y mantenga cada regla técnicamente. Acá el usuario nunca entra a un formulario de condiciones — o el ojo ya mira por default, o le pedís a Aurum que mire algo más en castellano. Además: cuando cambia una API de origen, lo arreglamos nosotros. En Zapier te lo arreglás vos.

### "¿Y si Aurum interpreta mal lo que le pido? ¿Inventa reglas?"
No inventa. Si el pedido es ambiguo, Aurum pregunta antes de crear (ej: "¿'bajar significativamente' qué umbral concreto tomo? ¿15%, 20%, 25%?"). Cada alerta creada tiene trazabilidad completa — quién la pidió, cuándo, con qué frase, qué regla quedó en el motor, sobre qué fuente de data opera. Todo auditable desde `/alertas/reglas`. Y si no hay data conectada para lo que le pedís, te lo dice honestamente en el momento: no crea una regla que no tiene de qué alimentarse.

### "¿Puedo pausar, editar o eliminar una alerta una vez que está creada?"
Sí. Pausar, snoozear, marcar como leída, marcar como favorita, eliminar — todo desde la interfaz de `/alertas` por cada alerta individual. Editar la regla de una alerta creada por Aurum también se hace hablando con Aurum ("la alerta del margen de Pañales, bajala al 15% en vez de 18%"). La edición es conversacional igual que la creación.

### "¿Cuántas alertas puedo tener activas al mismo tiempo?"
No hay tope duro — crecen con el uso. En las betas vemos equipos que arrancan con las base (~15-20 activas por default según las integraciones conectadas) y en 30 días llegan a 40-80 alertas activas entre el set base y las custom del equipo. El read state y los filtros del sidebar hacen que no se vuelva ruidoso.

### "¿Cómo me entero cuando se dispara una alerta — solo si abro la app?"
El badge del sidebar en la app muestra el count de no leídas en tiempo real (refresca cada 30s y al reenfocar la pestaña). Integraciones con email / Slack / WhatsApp están en roadmap cercano — se activan como canal secundario, sin reemplazar al inbox principal.

### "¿Qué pasa si pido una alerta sobre una métrica que todavía no está medida?"
Aurum te lo dice en el momento. Ejemplo: si pedís "avisame cuando suba el NPS" pero todavía no tenés encuestas conectadas, te explica que necesita conectar Tally / Typeform / módulo interno antes de poder crear esa alerta. Cero promesas vacías.

---

## BLOQUE 8 — PRECIO

**Título**
Alertas es una funcionalidad de NitroSales. Se incluye en los packs que activan Control de Gestión + Aurum.

**Bajada**
Alertas no se vende standalone. Forma parte de los packs de NitroSales donde está activo Aurum (porque sin Aurum, no hay capa conversacional de creación de alertas custom). El costo escala con el **scope** (módulos contratados) y el **scale** (cantidad de integraciones conectadas, cantidad de usuarios con acceso al inbox), no por cantidad de alertas activas.

### Qué incluye Alertas cuando está activo en tu plan
- **Ojo vigilante por default** sobre las 5 fuentes activas (sync, MELI, fiscal, Monotributo, predictivas financieras) + las que se sumen en fases próximas (Aurum task completions, Bondly, Aura, NitroPixel) sin costo adicional.
- **Creación de alertas custom por conversación con Aurum** desde cualquier sección del producto o desde `/aurum` directo — sin tope de cantidad.
- **Hub central `/alertas`** inbox style 3 columnas con sidebar jerarquizado (Todas / Favoritas / Secciones / Productos), lista temporal (Hoy / Esta semana / Más viejas) y vista de detalle.
- **Favoritas persistidas** por usuario en DB.
- **Read state sincronizado** por usuario en DB.
- **Badge reactivo** en sidebar con count de no leídas (poll 30s + refresh por focus/storage).
- **Filtros** por categoría, por fuente, por severidad y toggle "solo no leídas".
- **Auditoría de reglas** en `/alertas/reglas` para ver qué reglas tiene activas el negocio, quién las creó, con qué frase.
- **Permisos** por rol (solo lectura, editor, admin) — el acceso a alertas respeta los roles del equipo.

**CTA primario**
[CTA: Ver planes completos → abre /precios]

**CTA secundario**
[CTA: Pedí tu demo → abre Calendly]

**[VISUAL: tabla compacta de packs con fila destacada "Alertas incluido en todos los packs que activan Aurum".]**

---

## BLOQUE 9 — FAQ

**Título**
Preguntas que nos hacen seguido.

---

**¿Aurum mira mis pedidos de alerta en tiempo real o con qué frecuencia?**
La frecuencia de chequeo se calibra por tipo de alerta. Las de sync se chequean continuamente. Las de venta y spend se chequean cada hora o al cierre del día según la métrica. Las de runway y fiscal una vez al día. Las que dependen de flujos internos (ML preguntas, reclamos) se chequean cuando llega el evento. No hay "polling ciego" — cada tipo tiene su lógica de cuándo disparar.

**¿Las alertas se pueden recibir por email / Slack / WhatsApp además de en el inbox?**
En roadmap cercano. El inbox `/alertas` es el canal primario (bandeja única, read state, favoritas, todo normalizado). Los canales secundarios van a ser opt-in por usuario: cada uno va a poder elegir qué severidad se le reenvía por dónde. Hoy, el badge del sidebar + chequeo diario es el flujo principal.

**¿Qué pasa si una alerta sigue disparándose todos los días — no se vuelve ruido?**
El sistema detecta recurrencia. Si la misma alerta se repite varios días seguidos, se consolida en una sola row con contador y no ensucia la bandeja. Si querés snoozearla (pausarla durante N días) hay botón explícito.

**¿Puedo tener usuarios con distintos niveles de acceso al inbox?**
Sí. Hay tres roles: **Solo lectura** (ve la bandeja completa, no puede marcar leída ni eliminar — típicamente inversores / directorio), **Editor** (ve, marca leída, favorita, snoozea, crea alertas custom vía Aurum), **Admin** (todo lo anterior + gestiona quién recibe qué, audita el rules engine, puede forzar eliminación de reglas creadas por otros). Los permisos se gestionan desde Settings.

**¿Las alertas creadas por un usuario las ven los demás del equipo?**
Sí — las alertas son del negocio, no del usuario. Cualquier persona con acceso al inbox ve todas las alertas activas. Lo que sí es per-usuario: el read state (si yo la leí, vos seguís viéndola como no leída) y las favoritas (si yo la marco como favorita, aparece primera en mi vista del sidebar).

**¿Qué pasa si desactivo una integración — las alertas de esa fuente desaparecen?**
Sí — si desconectás MELI, se pausan las alertas dependientes de MELI. Si la reconectás, se reactivan. No hay alertas "huérfanas" disparándose sobre fuentes que ya no están.

**¿Hay un histórico de alertas que se dispararon en el pasado?**
Sí. El inbox tiene agrupación temporal (Hoy / Esta semana / Más viejas) y se puede scrollear hacia atrás. Adicionalmente, desde `/alertas/reglas` se puede ver la historia completa de disparos por regla (cuántas veces se disparó, cuándo, con qué valor puntual).

**¿Aurum puede pausar o editar alertas o solo crearlas?**
Crear, editar, pausar, reactivar, eliminar — todo por conversación. "Pausá la alerta del CPA de Meta por 7 días", "cambiá el umbral de runway a 4 meses", "eliminá la alerta de stock crítico del SKU X porque ya no lo vendemos más". Todo queda auditable en `/alertas/reglas`.

---

## BLOQUE 10 — CIERRE + CTA

**Título**
Sacate de encima la carga de estar revisando todo.

**Subheadline**
El ojo mira tu ecosistema 24/7. Aurum entiende castellano. `/alertas` es donde todo eso converge, en una sola bandeja.

**Body (1 párrafo)**
El problema no es que no haya información — es que nadie puede estar mirando todo todo el tiempo. Meta tiene sus notificaciones. MELI las suyas. Shopify las suyas. Tu banco manda SMS. Tu contador te pasa vencimientos por WhatsApp. Tu equipo se olvida de revisar dos veces. Y mientras tanto, cosas pasan sin que nadie las vea a tiempo — un SKU en quiebre con órdenes adentro, una campaña que quemó el presupuesto del mes en 4 días, una pregunta de MELI sin responder hace 72 horas, el runway que pasó por debajo de 3 meses, Monotributo acercándose al tope. Alertas invierte eso: hay un ojo mirando todo tu ecosistema todo el tiempo, con visión base de fábrica para lo que todo ecommerce debería vigilar siempre, y con oído abierto a lo que vos quieras sumar — hablando en castellano con Aurum, desde donde estés, sin configurar ni aprender nada. `/alertas` es la bandeja única donde todo aparece cuando corresponde. Abrís una vez al día, revisás lo que importa, y seguís con lo tuyo.

**CTA primario**
[CTA: Pedí tu demo → abre Calendly]

**CTA secundario**
[CTA: Conocé Aurum → link a /aurum]

**Texto final chico**
¿Más dudas? Escribinos por WhatsApp al [+54 9 11 ....] — te respondemos nosotros, no un bot. O abrí una cuenta beta y empezá a ver lo que pasa en tu negocio hoy mismo.

**[VISUAL: cierre con un ojo abierto central rodeado de alertas resueltas (palomitas verdes) + el chat de Aurum abajo + CTAs grandes.]**

---

## FOOTER (compartido con la matriz y las otras sub-landings)

**Navegación**
- Producto: NitroPixel · Aurum · Bondly · Aura · Control de gestión · Marketing digital · Rentabilidad · Productos · Finanzas · Alertas
- Recursos: Blog · Guías · Comparativas · Changelog
- Empresa: Sobre NitroSales · Founders · Contacto

**Legal**
- Términos · Privacidad · GDPR · LGPD · Status page

**Redes**
LinkedIn · Twitter/X · YouTube · WhatsApp

---

## NOTAS DE IMPLEMENTACIÓN (no van en la landing)

### Elementos que dependen de la próxima iteración
- Los **números concretos del impacto** (horas/semana ahorradas, alertas disparadas con resolución rápida, cantidad de alertas custom creadas por usuario en 30 días) se publican cuando haya 2-3 trials con 60+ días de Alertas activo.
- Los **logos y nombres reales** del Bloque 6 quedan como placeholder hasta tener autorización por cliente.
- El **canal email / Slack / WhatsApp** se menciona como "en roadmap cercano" — se saca el disclaimer cuando la fase esté deployada.
- Los **productos en sidebar "Próximamente"** (Bondly, Aura, NitroPixel) se sacan del disclaimer a medida que las fases 8f / 9 / 10 / etc. los activan.
- La **auditoría de `/alertas/reglas`** está descrita asumiendo el placeholder del commit `cdb9600`; cuando la rules engine real quede activa, revisar si cambia la narrativa.

### Cross-links obligatorios
- Al inicio (header): linkea a `/` (matriz) y a `/aurum` (par natural de esta landing).
- En Bloque 3: cada ejemplo concreto linkea a la sección del producto correspondiente (/campaigns, /marketplaces, /finanzas/pulso, /finanzas/fiscal). Mención a clientes VIP como funcionalidad interna (sin cross-link externo a /customers/vip, que queda como pantalla interna de la app).
- En Bloque 3B: linkea a `/integraciones` para reforzar el "no somos un hub tipo Zapier".
- En Bloque 8: linkea a `/precios` y a `/aurum`.
- En Bloque 10: linkea a `/aurum` como destino principal (Alertas y Aurum son la pareja narrativa: vigilancia + IA conversacional).

### Reglas de voz (checklist antes de publicar)
- [ ] Cero signos de exclamación.
- [ ] Cero emojis en body.
- [ ] Voseo consistente ("pedí", "hablale", "avisame", "contá").
- [ ] Cero uso de "configurá alertas", "armá reglas", "definí condiciones", "seteá umbrales", "workflow engine", "rules builder". Acción del usuario = "pedile a Aurum" / "decile en castellano".
- [ ] Cero uso de "poderoso", "potente", "revolucionario", "IA de última generación". La IA se muestra funcionando (ejemplos concretos de pedidos + respuestas), no se vende como adjetivo.
- [ ] Ningún caso con métricas inventadas en Bloque 6 — placeholders explícitos.
- [ ] CERO segmentación por facturación en Bloque 5 (regla ratificada 2026-04-19).
- [ ] Mención honesta de que el ojo ve lo que tiene conectado, y que Aurum no inventa reglas sobre data inexistente.
- [ ] Mención explícita de que Bondly / Aura / NitroPixel aparecen en sidebar como "Próximamente" hasta que las fases correspondientes estén live.
- [ ] Las 5 áreas del Bloque 3 siguen el patrón "Qué mira el ojo solo / Ejemplo de pedido a Aurum / Una alerta real". Patrón consistente a lo largo de toda la sección.
- [ ] Palabra "ojo" usada con criterio — aparece en Hero, Bloque 3 intro, Bloque 10. No se abusa al punto de volverla kitsch.
- [ ] Pareja narrativa con `/aurum` explícita en Bloque 10 y en cross-links.

### Flujo narrativo
Hero (el ojo que ve todo + Aurum que entiende castellano) → Trust Strip (5 fuentes activas por default + "Próximamente" honesto) → Bloque 3 (5 áreas que el ojo vigila, cada una con pedido real a Aurum + alerta real) → Bloque 3B (por qué no somos Zapier / IFTTT / notificaciones nativas / dashboards BI) → Bloque 4 (setup cero — el ojo arranca solo desde el minuto 1, lo custom se suma hablando) → Bloque 5 (para quién — 5 roles con lo que miran típicamente) → Bloque 6 (prueba social honesta con quotes reales + placeholder para métricas) → Bloque 7 (7 objeciones: notificaciones nativas, Zapier, Aurum inventando, pausar/editar, cantidad, cómo me entero, métrica inexistente) → Bloque 8 (precio incluido en packs con Aurum) → Bloque 9 (FAQ — frecuencia, canales, ruido, permisos, compartir con equipo, desconectar integración, histórico, Aurum editando) → Bloque 10 (cierre "sacate la carga" con pareja Alertas+Aurum).

### Patrón distintivo vs. resto del Tier 3
- **Primera landing donde el protagonista narrativo es un activo con marca** (Aurum). Aurum aparece en todas las landings como "capa transversal", pero acá es literalmente el mecanismo de interacción — sin Aurum no hay capa conversacional de creación de alertas. Por eso el cross-link principal del Bloque 10 es a `/aurum`, no a `/control-gestion`.
- **Primera landing que combina "sistema vigilando solo" + "IA conversacional entendiendo el pedido"** como par de valor. Ninguna de las otras 6 Tier 3 tiene esa dualidad.
- **Primera landing con metáfora visual central** (el ojo). Las otras son más abstractas ("panel", "plataforma", "un solo lugar"). Acá hay una imagen literal que puede anclar el diseño visual de todo el Tier 3 secundariamente.

### Paralelismo con el resto del Tier 3
- **Mismo esqueleto** (Hero → Trust → Bloque 3 cinco cosas / áreas → Bloque 3B diferenciación → Setup → Para quién → Prueba social → Objeciones → Precio → FAQ → Cierre).
- **Tono distinto**: más aliviador / conversacional / humano que `/finanzas` (ejecutivo-financiera) o `/integraciones` (técnico-detallada). Pero mantiene voseo sin exclamaciones y cero palabras prohibidas generales.
- **Cross-link principal a `/aurum`** (par natural), secundarios a `/integraciones` (Bloque 3B), `/finanzas/pulso` (Bloque 3 área 3), `/marketplaces` (Bloque 3 área 2), `/productos` (Bloque 3 área 5). Mención a clientes VIP como funcionalidad interna, no como cross-link externo.

### Apertura de Fase 3 (actualizada)
Con Alertas v1 completada, llevamos 7 de las 8 landings del Tier 3. Queda:
- `/marketplaces` — MELI deep dive (MELI Ads, publicaciones, reputación, cuenta oficial) — la que no entra limpio en `/integraciones` por tener su propio ángulo comercial.

Con `/marketplaces` cierra Fase 3. Después viene: pasada de consistencia cruzada entre las 8 Tier 3 + matriz, Fase 2B (BRAND_VISION.md, sistema visual), Fase 4 (build real en Next.js sobre `nitrosales.vercel.app`).

---

_Última actualización: 2026-04-20 — v1.1 Sesión 3 VM (pase de consistencia Tier 3 post-/marketplaces). v1.1 aplica: (a) /mercadolibre → /marketplaces (3 lugares), (b) /customers y /customers/vip sacados de cross-links externos y convertidos en mención de funcionalidad interna, (c) coherencia con decisión "fases fuera del copy público". Próxima iteración post feedback de Tomy._
