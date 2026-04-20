# LANDING /control-gestion — Control de Gestión

> **Qué es este archivo**: el texto (copy) completo y canónico de la landing `/control-gestion`. Tier 3 — Funcionalidad/panel de NitroSales. Cuarta landing de Fase 3 (post /rentabilidad, /productos, /finanzas).
>
> **Alcance**: SOLO texto. No incluye diseño, colores, tipografías, imágenes ni layout. Eso corresponde a `BRAND_VISION.md` (Fase 2B).
>
> **Qué es Control de Gestión (definición del positioning)**: "Panel personalizable — cada rol arma su propio tablero con las métricas que le importan, desde una sola base de data unificada del negocio." Control de Gestión NO es un producto con identidad de marca propia — es la **capa transversal de la plataforma** donde cualquier persona del negocio construye, guarda y comparte su vista de gestión, con la data que ya está corriendo en NitroSales.
>
> **Tesis central — facilidad como valor #1**: el dolor más grande de la gestión de un negocio ecommerce no es la falta de información — es la **complejidad brutal para accederla**. La data del negocio vive en 10+ lugares distintos (VTEX, MELI, Shopify, Meta Ads, Google Ads, bancos, ERP, 3PLs, CRM, Excel, Sheets). Cada vez que alguien quiere ver un número cruzado que no existe en ningún panel nativo, tiene que: exportar de varias plataformas, cruzar en una planilla, pedir ayuda al equipo de datos (si existe), o contratar un consultor / freelance que arme un dashboard a medida que **se rompe en 3 meses cuando cambia una API**. Las empresas medianas gastan miles de dólares por mes en esto — consultores de BI, data engineers, proyectos de Looker / Power BI / Tableau que duran 4 meses y quedan obsoletos al primer cambio de estructura. Control de Gestión invierte ese mundo: **una vez que NitroSales está conectado a toda tu data, tenés un mundo de información disponible de forma simple**. Nadie más arma dashboards "a medida que se rompen". Abrís la plataforma, elegís tu plantilla por rol (si no querés armar nada), o arrastrás 4 widgets a una grilla (si querés personalizar), y listo. Sin consultores, sin freelances, sin esperar 4 meses, sin que se rompa cuando Meta cambia su API.
>
> **Tesis secundaria — universal**: además de fácil, esta sección habla a **todos los perfiles del negocio al mismo tiempo** — a diferencia del resto del Tier 3, que apuntan a roles específicos. El CEO, el director de marketing, el gerente de compras, el gerente comercial, el director de operaciones, el CFO, el jefe de logística, el responsable de atención al cliente, el analista de datos — cada uno mira métricas distintas y necesita un tablero distinto. Cada uno arma el suyo en minutos con una plantilla pre-armada + constructor visual.
>
> **Audiencia primaria — todo el equipo ejecutivo y operativo del negocio**. No hay un "perfil primario" único. La landing tiene que mostrar cómo cada uno encuentra su lugar:
> - CEO / dueño / director general → vista de pulso del negocio
> - Director de marketing / growth → CAC, ROAS, atribución, journeys
> - Gerente de compras → rotación, stock crítico, OCs sugeridas
> - Gerente comercial → top marcas, candidatos campaña, velocidades por canal
> - Director de operaciones → despachos, SLA transportistas, tiempos
> - CFO / contador → P&L, caja, reconciliación pendiente
> - Customer Success / atención → tickets, NPS, tiempo de respuesta
> - Analista de datos → constructor libre, combinaciones custom
>
> **Audiencia secundaria**: socios / inversores / directorio que quieren una vista consolidada sin tener que pedir reportes al equipo cada semana.
>
> **Ángulo narrativo**: el problema no es la falta de data — es la falta de **la vista correcta para cada persona**. Hoy, el CEO y el gerente de compras miran "el mismo dashboard" porque la herramienta no permite otra cosa, o peor, el gerente de compras abre 3 tabs y copia a mano para armar su Excel. Control de Gestión parte de la idea opuesta: **cada rol tiene su vista, cada vista se arma sola con la data que ya está, y el dueño puede mirar todas las vistas cuando quiere**.
>
> **Elemento visual distintivo — PLAYGROUND EN LA LANDING**: a diferencia del resto de las landings, Control de Gestión incluye un componente **interactivo en la página misma** donde el visitante puede (a) elegir una plantilla por rol y verla renderizada en vivo con data de demo, y/o (b) construir un tablero de 4-6 widgets eligiéndolos de una biblioteca visible. Es un "probá acá cómo sería tu tablero" sin login. El texto de la landing asume que ese componente existe (marcado como [PLAYGROUND] en los bloques donde va).
>
> **Ángulo secundario — fácil de verdad**: la facilidad de uso es el segundo diferencial. Un gerente de compras no quiere aprender SQL ni aprender una herramienta de BI. Arrastra, suelta, guarda. La plataforma entiende de dónde viene cada métrica y la conecta sola. Si aparece algo que la persona no sabía que existía como métrica, Aurum se lo explica en una frase al lado del widget.
>
> **Honestidad obligatoria**:
> - El constructor visual de widgets tiene límites — para análisis ultra-específicos (queries complejas, joins entre tablas custom, etc.) se puede exportar a CSV o conectar una herramienta externa (Looker, Power BI) vía API de solo lectura. Se dice honesto.
> - Las plantillas pre-armadas por rol son 8-10 al lanzamiento; la biblioteca crece con feedback de clientes. No decimos "infinitas plantillas".
> - La personalización total está disponible, pero requiere que la data original exista conectada. Si un cliente quiere un widget de "tickets de soporte" pero no tiene Zendesk / similar conectado, no hay magia.
> - Como siempre: logos y cifras concretas quedan como placeholder hasta tener trials medidos.
>
> **Regla explícita**: NO segmentar por facturación. El fit se define por complejidad de equipo + cantidad de roles distintos que necesitan su propia vista.
>
> **Palabras prohibidas** (además de las generales): "poderoso", "potente", "revolucionario", "dashboard inteligente", "BI de última generación", "360°", "unificado" como slogan vacío (se usa donde corresponde, no como relleno). El valor se defiende con ejemplos concretos de tableros armados por rol.
>
> **Última actualización**: 2026-04-19 — v1 Sesión 3 VM (Fase 3-4 · Tier 3 cuarta landing · primera con playground interactivo y audiencia multi-rol).

---

## BLOQUE 1 — HERO

**Eyebrow (arriba del headline)**
CONTROL DE GESTIÓN · TU TABLERO EN MINUTOS, NO EN MESES

**Headline (H1)**
Lo que hoy te cuesta meses y consultores. Acá, minutos y sin ayuda.

**Subheadline (H2)**
Plantillas por rol + constructor visual + toda tu data ya conectada. Armás tu tablero vos mismo, sin código, sin IT, sin consultores externos y sin que se rompa cuando cambia una API.

**Body (1 párrafo)**
El dolor más grande de la gestión de un negocio no es la falta de información — es **la complejidad brutal para acceder a ella**. Tu data vive en 10+ lugares: VTEX, MercadoLibre, Shopify, Meta Ads, Google Ads, bancos, ERP, 3PL, CRM, planillas. Cada vez que querés un cruce que no existe nativamente, alguien tiene que exportar, unir en Excel, armar fórmulas, y rezar para que no cambie nada. Las empresas gastan miles de dólares al mes en consultores y freelances que arman dashboards a medida — y esos dashboards se rompen en 3 meses cuando Meta cambia su API o MELI modifica un endpoint. Control de Gestión existe para terminar con eso: **una vez que NitroSales se conectó a tu data, tenés un mundo de información al alcance de un click**. Cada persona del equipo elige su plantilla por rol (y ya tiene un tablero listo), o arrastra 4 widgets a una grilla (y tiene el suyo personalizado), en minutos. Sin código. Sin consultores. Sin proyectos de 4 meses. Sin nada que se rompa. Y cuando cambia una API de origen, lo arreglamos nosotros — vos no te enterás.

**Body (2° párrafo, opcional — puede ir más chico)**
Esto es lo que nos distingue: **la facilidad real**. No "fácil" como lo venden todas las herramientas que después te exigen aprender SQL o contratar un analista. Fácil de verdad: abrís, elegís, guardás.

**CTA primario**
[CTA: Armá tu tablero ahora → lleva al PLAYGROUND en la misma landing]

**CTA secundario**
[CTA: Pedí tu demo → abre Calendly]

**[VISUAL: pantalla central mostrando 4 tableros distintos en mini (mosaico 2x2), cada uno etiquetado con un rol — "CEO", "Marketing", "Compras", "Operaciones". Cada mini-tablero con widgets diferentes (KPIs, gráficos, tablas). Animación sutil: los widgets se reordenan / se intercambian entre tableros, mostrando la personalización. Mensaje: "Una plataforma. Infinitas vistas."]**

**[PLAYGROUND: debajo del Hero, componente interactivo donde el visitante puede:
(a) Elegir un rol del menú (CEO, marketing, compras, comercial, operaciones, finanzas, customer success, analista libre) y ver en vivo la plantilla correspondiente con data de demo.
(b) Alternativamente, construir un tablero desde cero — elegir 4-6 widgets de una biblioteca visible (ventas hoy, top productos, CAC por canal, runway, stock crítico, etc.) y ver cómo se verían arrastrándolos a una grilla.
Sin login, sin fricción. El CTA del playground lleva a "Pedí tu demo para verlo con TU data".]**

---

## BLOQUE 2 — TRUST STRIP

**Línea única**
La data que llena tus tableros viene de todo NitroSales conectado: ventas de todos los canales · marketing digital completo (Meta, Google, MELI Ads) · inventario y rotación · finanzas (P&L, caja, runway) · clientes y cohortes · creators (Aura) · logística (transportistas conectados) · atención al cliente.

**Segunda línea**
Y si necesitás conectar algo más — un CRM externo, un sistema de tickets, una planilla de Google Sheets — lo sumás como fuente y queda disponible como widget. La biblioteca crece con tu negocio.

**[VISUAL: mapa de fuentes de data con chips y flechas convergentes hacia "Tu tablero personalizado". Chips con nombres de data sources.]**

---

## BLOQUE 3 — CINCO COSAS QUE CONTROL DE GESTIÓN TE PERMITE HACER

**Título de la sección**
Cinco capacidades que hacen que cada persona del negocio arme su propia vista — sin ser técnica, sin pedirle a nadie.

**Bajada**
El control de gestión bien hecho no es una herramienta — es una **posibilidad** que se le da a cada rol del negocio. Estas son las cinco que hacen que funcione en la práctica, no solo en el discurso.

---

### 1 — Arrancás con una plantilla pensada para tu rol

**Quién la necesita**
*Todas las personas que abren la plataforma por primera vez.* Especialmente quienes no saben por dónde empezar.

**Lo que hoy pasa**
La mayoría de las herramientas de BI o dashboards te tiran a una pantalla en blanco. "Armate tu dashboard." Perfecto — si sos analista de datos y tenés 4 horas. Si sos gerente de compras, cerrás la herramienta a los 5 minutos y seguís con tu Excel.

**Cómo lo resuelve Control de Gestión**
Catálogo de plantillas pre-armadas por rol, cada una con los 8-15 widgets que esa función mira habitualmente:

- **CEO / Dueño**: facturación del mes, margen bruto, EBITDA, caja disponible, runway, top 5 productos, top 5 canales, CAC, ratio LTV:CAC, alertas abiertas.
- **Director de marketing**: inversión total, ROAS por canal, CAC por canal, CAC blended, share por fuente de adquisición, atribución multi-touch, journeys más frecuentes, top campañas activas, payback.
- **Gerente de compras**: rotación por producto, días de cobertura, OCs pendientes de aprobar, alertas de stock-out, plata dormida, top proveedores por volumen, lead time promedio.
- **Gerente comercial**: top productos subiendo, top productos cayendo, ranking por marca, ranking por categoría, velocidad por canal, candidatos para próxima campaña, margen promedio.
- **Director de operaciones**: órdenes despachadas hoy, SLA por transportista, demoras abiertas, costo logístico promedio, devoluciones, tiempo de preparación.
- **CFO / contador**: P&L del mes, caja consolidada, reconciliación bancaria pendiente, vencimientos próximos, flujo de caja proyectado, impuestos a pagar.
- **Customer Success**: tickets abiertos, tiempo de primera respuesta, NPS, reclamos por canal, top razones de contacto.
- **Analista de datos**: constructor libre con acceso a todas las tablas + posibilidad de guardar queries custom.

Cada plantilla viene lista. La adaptás a tu negocio moviendo widgets, cambiando rangos de fecha, eligiendo canales o productos específicos.

**Un caso real**
*La gerente de compras entra por primera vez, elige "Plantilla: Gerente de compras" y en 3 segundos ve un tablero con los 10 widgets que importan a su función. Reconoce todo. Cambia el rango de fechas del widget de rotación de "último mes" a "últimos 90 días". Elimina un widget que no le interesa. Agrega uno que sí. Guarda la vista como "Mi tablero de compras". Quedó en 8 minutos.*

**→ La decisión que podés tomar**
Entrar a la plataforma y empezar a decidir hoy, no en 3 semanas. La curva de aprendizaje desaparece porque la vista ya existe — solo la adaptás.

**[VISUAL: galería de plantillas como cards, cada una con el nombre del rol, una miniatura del tablero, y un botón "Usar esta plantilla". Al hover, se previsualiza la plantilla a tamaño completo.]**

---

### 2 — Armás tu tablero con drag-and-drop, sin escribir una línea de código

**Quién la necesita**
*Cualquiera que quiera personalizar más allá de la plantilla.* Cada rol lo hace en algún momento.

**Lo que hoy pasa**
Las herramientas de BI tradicionales (Looker, Power BI, Tableau) son potentes pero requieren saber construir queries, modelar fuentes, entender joins. Las herramientas "fáciles" (Geckoboard, Databox, Klipfolio) están limitadas a lo que su biblioteca pre-armada permite y te obligan a conectar cada fuente una por una. En el medio, el usuario no-técnico queda sin opciones buenas.

**Cómo lo resuelve Control de Gestión**
Un constructor visual con tres gestos:

- **Agarrás un widget** de la biblioteca (hay más de 80 widgets al lanzamiento — KPI simple, gráfico de línea, barras, tabla, donut, funnel, mapa, heat map, scorecard, alerta, narrativa de Aurum).
- **Lo soltás** en la grilla.
- **Le decís qué medir**, eligiendo de un menú: "ventas" → "por canal" → "últimos 30 días" → "filtro: categoría X". Todo dropdowns, nunca SQL.

La plataforma arma el widget al instante con la data real. Si querés compararlo con el período anterior, agregás "vs. mes anterior" con un click. Si querés partirlo por otra dimensión, arrastrás la dimensión al widget.

Lo que no está en la biblioteca se puede pedir como widget custom — el equipo de NitroSales lo arma en 48 horas si la data existe en el sistema.

**Un caso real**
*El director comercial quiere un widget que no viene en la plantilla — "margen por marca, por canal, últimos 60 días, ordenado de mayor a menor". Abre el constructor, arrastra un widget de tabla, elige "margen" como métrica, agrega dos dimensiones (marca + canal), fija el rango a 60 días, ordena por margen descendente. El widget renderiza en 2 segundos con 18 filas de data real. Lo guarda en su tablero personal. Tiempo total: 90 segundos.*

**→ La decisión que podés tomar**
Cualquier análisis que se te ocurra mirando el negocio, lo podés convertir en widget fijo en tu tablero. Dejás de depender del equipo de datos para preguntas ad-hoc.

**[VISUAL: animación del constructor en acción — biblioteca de widgets a la izquierda, grilla vacía al medio, un widget siendo arrastrado y soltado, configuración lateral apareciendo con dropdowns. Rápido, 2-3 segundos por acción.]**

---

### 3 — Cruzás cualquier data con cualquier data, porque ya está toda conectada

**Quién la necesita**
*Cualquiera que hoy cruza data entre dos sistemas a mano.* Marketing cruzando ads con ventas, operaciones cruzando despachos con órdenes, finanzas cruzando gastos con cobros.

**Lo que hoy pasa**
La data del ecommerce vive en 10+ lugares: VTEX, MELI, Shopify, Meta Ads, Google Ads, bancos, ERP, sistema de envíos, CRM, herramienta de tickets, planillas del equipo. Cualquier cruce entre dos de esas fuentes implica export manual + unión en Excel + lookup vlookup. La cruza la arma un analista una vez por mes y queda vieja al día siguiente.

**Cómo lo resuelve Control de Gestión**
Toda la data que NitroSales ya tiene conectada está disponible como fuente para widgets, y **todo se puede cruzar con todo** porque comparten el mismo backbone de identidad de producto, cliente y canal. Ejemplos:

- "**CAC por campaña de Meta** vs. **LTV observado de los clientes que trajo esa campaña**" — cruza Meta Ads + Bondly + atribución.
- "**Rotación de producto** vs. **inversión publicitaria en ese producto**" — cruza inventario + Meta/Google Ads filtrado por SKU.
- "**Margen por canal** vs. **tiempo promedio de despacho** vs. **NPS del canal**" — cruza finanzas + operaciones + atención al cliente.
- "**Productos que compran los clientes que vieron el creator X** en Aura" — cruza creator economy + ventas + cohortes.

Si ya está en NitroSales, se cruza. Si hay una fuente externa conectada (CRM, Zendesk, Google Sheets), también.

**Un caso real**
*El CMO quiere entender si las campañas de Meta que trae clientes de alto LTV están bien identificadas. Arma un widget que muestra: para cada campaña, el CAC vs. el LTV observado a 6 meses de los clientes que esa campaña trajo. Descubre que 3 de las 15 campañas activas tienen LTV:CAC debajo de 1.5 — están gastando pero trayendo clientes de bajo valor. Corta esas 3 campañas al día siguiente. Antes de Control de Gestión, esa cruza requería un export + 2 horas del analista + una planilla que nadie volvía a abrir.*

**→ La decisión que podés tomar**
Preguntas que antes no te hacías porque la cruza era imposible — ahora se hacen en 2 minutos. El negocio se gestiona con más granularidad sin contratar a un analista.

**[VISUAL: diagrama de data flows con fuentes (Meta, Google, MELI, VTEX, bancos, Aurum, Bondly, Productos, etc.) convergiendo en un "motor de cruces" que alimenta widgets del tablero. Una línea resaltada mostrando el cruce "CAC Meta x LTV Bondly" → widget.]**

---

### 4 — Compartís tableros con tu equipo, con permisos por rol

**Quién la necesita**
*Cualquier negocio con más de 2 personas.* Especialmente los que hoy viven en Excels duplicados.

**Lo que hoy pasa**
Los dashboards mueren en uno de dos extremos: o están bloqueados en la laptop de una persona (nadie más los ve), o se comparten por Excel / screenshots en WhatsApp (data desactualizada, sin contexto, cada uno con su versión). El resultado es el mismo negocio con 4 versiones distintas de "cómo vamos".

**Cómo lo resuelve Control de Gestión**
Cada persona tiene su tablero personal, pero también puede:

- **Compartir una vista específica** con otro usuario del negocio (ej: el CMO comparte su tablero de atribución con el CEO, que lo puede ver cuando quiera pero no editarlo).
- **Hacer un tablero de equipo** — ej: "Tablero de marketing" visible por todo el equipo de marketing, editable por el director, solo lectura para los demás.
- **Hacer un tablero público** dentro del negocio — ej: "Resumen ejecutivo" visible por todo el equipo, actualizado en vivo.
- **Definir permisos por widget**: el CEO puede ver todo; un analista junior ve los widgets públicos pero no los que incluyen nómina confidencial.
- **Programar envíos automáticos** del tablero por email o Slack (ej: el "resumen ejecutivo del lunes" llega a las 9 am a todo el directorio, sin que nadie lo mande).

**Un caso real**
*El directorio se reunía los lunes con una planilla que armaba el CFO los domingos a la tarde. Ahora, los domingos a las 23:59, el sistema envía automáticamente el "Tablero Directorio" (configurado una vez por el CFO) a los 5 miembros del directorio, con los 12 KPIs acordados, comparativos y alertas. El CFO no dedica más 4 horas los domingos. El directorio tiene la data lista el lunes 8 am, revisada o con preguntas anticipadas.*

**→ La decisión que podés tomar**
La organización entera trabaja sobre la misma data sin duplicar esfuerzo. El dueño ve lo que cada área ve (si quiere) sin pedir nada. El equipo gana tiempo.

**[VISUAL: grilla de 4 tableros con etiquetas ("Marketing", "Compras", "Ejecutivo Directorio", "Mi tablero personal"), cada uno con diferentes avatares y permisos visibles. Flechas mostrando que el mismo dato alimenta todos. Chip de "Envío programado: lunes 9am" en uno.]**

---

### 5 — Aurum arriba de tu tablero: no solo gráficos, explicación

**Quién la necesita**
*Cualquier persona que mira un número y se pregunta "¿por qué?".* Que es, básicamente, cualquier persona que mira números.

**Lo que hoy pasa**
Los dashboards muestran qué pasó, no por qué. Ves que las ventas bajaron 12% esta semana y empieza la caza: ¿fue un canal? ¿un producto? ¿una campaña? ¿estacionalidad? Alguien tiene que entrar a otras 4 pantallas, correlacionar a mano, escribir un mail al equipo. 2 horas después, quizás, hay una hipótesis.

**Cómo lo resuelve Control de Gestión**
Cada widget tiene un espacio para la **narrativa de Aurum**: una o dos frases explicando qué se está viendo, por qué se movió respecto al período anterior, y qué convendría mirar a continuación. Ejemplos:

- Widget "CAC": *"CAC subió 14% vs. semana pasada. El driver principal es Meta Ads (+31% en inversión sin aumento proporcional de conversiones). La campaña 'X' en particular está rindiendo por debajo del ROAS target. ¿Querés abrir el detalle?"*
- Widget "Plata dormida": *"Aumentó $1.2M esta semana. 42 unidades del producto Y pasaron de 'rotación lenta' a 'durmiendo' por caída de demanda. Proveedor recibe devoluciones — ¿armamos el pedido?"*
- Widget "Ventas totales": *"Crecieron 8% vs. la semana anterior. El 70% del crecimiento viene de MercadoLibre y está concentrado en la categoría Z (posible efecto de tu promo de Full). Se sostiene si mantenés la promo."*

Aurum no es un chatbot — es una capa de lenguaje natural encima de cada widget que contextualiza lo que estás viendo. Si querés profundizar, le preguntás por texto: "¿qué campañas específicas subieron el CAC?", y te contesta.

**Un caso real**
*El CEO entra un lunes, ve el widget de "Facturación semanal" con una caída del 6%. Antes hubiera llamado al CMO y al comercial para entender. Ahora lee la narrativa de Aurum arriba del widget: "Caída concentrada en el canal VTEX (-14%), específicamente en la categoría de accesorios. Marketing bajó la inversión en esa categoría hace 10 días — posible driver. El resto de los canales sostiene o crece." El CEO ya tiene el diagnóstico. Escribe al CMO: "¿subimos de nuevo accesorios en Meta?". Lo que antes tardaba 2 horas y 3 conversaciones, ahora se resuelve en 90 segundos.*

**→ La decisión que podés tomar**
Las decisiones operativas se toman más rápido porque el contexto viene con el número. Tu equipo ejecutivo deja de pedir reportes — los interpreta.

**[VISUAL: widget individual con el número grande arriba, gráfico al medio, y abajo un cuadro con ícono de Aurum y 2-3 frases de explicación. Al final, "Preguntá más" como call-to-action del widget.]**

---

## BLOQUE 3B — POR QUÉ ES TAN FÁCIL (Y EN OTROS LADOS NO)

**Título**
Un constructor de tableros sin la data ya unificada es solo un lienzo vacío — y ese lienzo cuesta caro.

**Bajada**
Existen buenas herramientas de BI (Looker, Power BI, Tableau) y de dashboarding fácil (Geckoboard, Databox, Klipfolio). Son excelentes en lo suyo, pero resuelven **la mitad del problema**: te dan el lienzo para construir, pero no te dan la data lista. Conectar 10 fuentes del ecommerce (VTEX, MELI, Shopify, Meta, Google, bancos, 3PL, CRM, tickets) a una herramienta externa requiere:

- Un **proyecto técnico de 2 a 4 meses** con un data engineer o consultor especializado.
- Entre **$5.000 y $30.000 dólares** de implementación inicial, dependiendo del alcance.
- **Mantenimiento permanente** — cada vez que una API cambia (Meta cambia algo cada par de meses, MELI también), el pipeline se rompe y hay que arreglarlo.
- Una **agencia, freelance o data engineer interno** que haga la operación continua.
- La esperanza de que el trabajo sea prolijo — la mayoría de los dashboards custom terminan con data inconsistente, fórmulas rotas y usuarios que dejan de confiar a los 6 meses.

El 80% de los negocios nunca lo hace porque es demasiado caro y complejo. El 20% que lo hace, termina pagando una y otra vez para mantenerlo funcionando.

Control de Gestión existe porque **NitroSales ya tiene toda la data unificada como parte de la plataforma**. No tenés que conectar nada. No tenés que modelar nada. No tenés que mantener nada. Cuando Meta cambia su API, lo arreglamos nosotros — vos no te enterás de que hubo un cambio. Abrís el constructor y la data ya está lista. Lo único que hacés es **elegir qué parte querés ver y cómo**. Todo lo que antes era un proyecto de consultoría de $20.000 y 3 meses, acá es un arrastre de 30 segundos.

---

**Toda la plataforma de NitroSales como fuente de widgets.**
Ventas, productos, campañas, clientes, finanzas, creators, logística, atención — cualquier dato del sistema es widget-izable en segundos. Sin pipeline, sin ETL, sin integración externa.

**Aurum razona sobre cualquier widget que construyas.**
No existe "widget sin contexto". Aurum explica qué se está viendo, por qué se movió, y qué mirar después — aprendiendo del uso que hacés del tablero.

**Bondly (la memoria de clientes) como fuente para tableros de negocio.**
Cualquier métrica de cliente (LTV observado, segmentos, cohortes, frecuencia, recencia) está disponible como widget — algo que herramientas de BI externas requieren modelar de cero.

**Productos (inventario unificado multicanal) como fuente para tableros operativos.**
Stock, rotación, multi-ubicación, proyecciones — todo disponible sin modelado adicional.

---

**El resultado**: armás tableros que con herramientas externas requerirían meses de setup técnico — y los armás vos, sin ayuda, en minutos.

**[VISUAL: diagrama comparativo lado a lado. Izquierda: "Herramienta de BI tradicional + tus fuentes fragmentadas" → flechas caóticas, símbolo de "configuración de semanas". Derecha: "NitroSales" → flechas limpias de todas las fuentes a un nodo único → "tu tablero en minutos". Muy visual, mucho contraste.]**

---

## BLOQUE 4 — CÓMO SE PONE EN MARCHA

**Título**
De cero tableros a tableros por rol en 48 horas.

**Bajada**
Control de Gestión es la sección más rápida de activar. No requiere configuración contable como Finanzas ni matching de productos como Productos — si el resto de la plataforma está funcionando, los tableros están a dos clicks.

---

### Paso 1 — Eliges plantilla por rol para cada miembro del equipo (hora 1)
Cada persona que se suma al sistema elige su rol inicial de un menú de plantillas. El tablero queda armado al instante con 8-15 widgets pensados para esa función, con data real del negocio.

### Paso 2 — Cada uno ajusta su vista (primeras 24 horas)
Los usuarios mueven widgets, cambian rangos, agregan filtros, eliminan lo que no les interesa. El sistema aprende las preferencias y sugiere widgets complementarios.

### Paso 3 — Se arman los tableros compartidos y envíos automáticos (día 2)
El equipo decide cuáles vistas se comparten (tablero de directorio, tablero de marketing, resumen ejecutivo para socios) y los envíos automáticos programados. A partir de ahí, la organización corre sobre la misma data sin esfuerzo.

**[VISUAL: timeline 3 pasos + mini-screenshots — selector de rol → usuario ajustando widgets → configuración de tablero compartido con emails programados.]**

---

## BLOQUE 5 — PARA QUIÉN ES CONTROL DE GESTIÓN

**Título**
Para cualquier persona del equipo que toma decisiones.

**Bajada**
A diferencia de otras secciones de la plataforma que tienen un rol primario, Control de Gestión es **universal**. Si tu función implica mirar números y decidir sobre el negocio, acá tenés tu tablero.

---

### ✅ Es para vos si sos…
- **CEO / dueño / director general** que quiere pulso del negocio sin pedir nada a nadie.
- **Director de marketing / growth / CMO** que mide CAC, ROAS, atribución y journeys todos los días.
- **Gerente de compras** que decide reposición y maneja el inventario.
- **Gerente comercial** que decide mix, campañas y empuje semanal.
- **Director de operaciones** que coordina despachos, logística y SLA.
- **CFO / contador** que monitorea P&L, caja y runway.
- **Customer Success / responsable de atención** que mide tickets, NPS y experiencia.
- **Analista de datos** que arma cruces complejos y quiere libertad total.
- **Inversor / socio / miembro del directorio** que quiere una vista sin depender del equipo.
- **Consultor / CFO fraccional** que trabaja con varios clientes y necesita vistas distintas por cada uno.

### ✅ Y además, tu negocio…
- Tiene **más de una persona tomando decisiones** con data. Cuanto más grande el equipo, más diferencial.
- Hoy usa **Excels o reportes estáticos** que se desactualizan rápido.
- Depende de **alguien del equipo de datos** (o un analista) para preguntas que tendrían que poder responderse solas.
- Tiene **directorio / inversores / socios** que piden reportes recurrentes.
- Quiere **escalar sin sumar reporteros** al equipo.

### ❌ Probablemente no todavía si…
- Sos un **equipo de una o dos personas** que revisan todo juntas en una sola pantalla. La personalización por rol no aporta tanto.
- Ya tenés un **equipo de BI robusto** con Looker / Power BI corriendo sobre un data warehouse propio, y el negocio está feliz con ese setup. Acá Control de Gestión puede complementar o no, según el caso.

---

## BLOQUE 6 — PRUEBA SOCIAL (CON HONESTIDAD)

**Título**
Sin promesas infladas sobre "miles de tableros creados".

**Bajada**
Estamos midiendo la adopción de Control de Gestión en los primeros trials. Los números que vamos a publicar son: cantidad mediana de tableros personalizados creados por negocio, cantidad de roles que activan su plantilla, tiempo medio desde setup hasta primer tablero compartido, reducción de tiempo en armado de reportes manuales. Mientras tanto, la promesa es metodológica: plantillas reales por rol + constructor visual funcional + data ya conectada.

---

### Mientras tanto, podés validarlo vos mismo
- Usá el **playground de la landing**: elegí una plantilla por rol o armá un tablero de 4 widgets. Sin login.
- Pedí la demo y traé a **3 personas del equipo con roles distintos** — que cada uno vea su plantilla con data real de tu negocio.
- Te armamos un **tablero ejecutivo personalizado** durante el trial, que queda tuyo incluso si no seguís con NitroSales.

### Qué vamos a publicar acá cuando haya data
- Cantidad mediana de tableros activos por negocio al primer trimestre.
- Cantidad de roles que usan plantillas personalizadas.
- Horas/mes ahorradas en armado de reportes manuales del equipo.
- Tiempo medio desde onboarding hasta primer tablero compartido.

**[VISUAL: placeholder "Métricas de adopción medidas desde mayo 2026 · 3 trials multi-rol activos". Sin logos inventados, sin cifras fabricadas.]**

---

## BLOQUE 7 — OBJECIONES FRECUENTES

**Título**
Lo que te estás preguntando.

**Bajada**
Siete dudas concretas que aparecen en cada demo. Respuesta directa a cada una.

---

### "Ya uso Looker Studio / Power BI / Tableau para esto."
Si ya tenés esas herramientas corriendo bien y el negocio está feliz, no hay motivo urgente para cambiar. Control de Gestión convive: exponemos toda la data de NitroSales vía API de solo lectura, así que podés seguir construyendo dashboards en Looker / Power BI / Tableau si preferís. La diferencia la notás con el tiempo: en NitroSales, cada miembro del equipo arma su tablero solo, sin pedir al equipo de BI. Y los análisis cross-función (que hoy requieren unir 3 data sources) son de 2 minutos. Muchos clientes mantienen sus dashboards de BI corporativo + agregan Control de Gestión para el día a día operativo.

### "¿Y si quiero un widget que no viene en la biblioteca?"
La biblioteca tiene 80+ widgets al lanzamiento. Si lo que necesitás no está, hay tres caminos: (1) el constructor libre te deja armar gráficos custom combinando métricas y dimensiones a tu gusto; (2) podés pedir un widget custom a nuestro equipo — si la data está en el sistema, lo armamos en 48 horas sin costo adicional para tu plan; (3) para casos muy específicos, exportás la data y la usás en Excel / BI externo.

### "¿Funciona bien en celular?"
Los tableros son responsive por default — un widget bien hecho se ve bien en desktop, tablet y mobile. Hay vistas optimizadas para mobile (tablero "resumen móvil" que prioriza 4-6 KPIs críticos para consulta rápida). Para construir tableros nuevos, la mejor experiencia es desktop.

### "¿Los tableros se actualizan en tiempo real?"
Depende del widget. Los KPIs críticos (ventas hoy, caja, stock crítico) se actualizan cada 2-5 minutos. Los análisis cruzados (atribución multi-touch, LTV por cohorte) corren cada hora o cada día porque son más pesados — se marca el timestamp de última actualización en cada widget.

### "¿Se puede usar para presentar a inversores / directorio?"
Sí. El modo "presentación" del tablero muestra los widgets en pantalla grande sin controles de edición, con formato limpio — se puede proyectar en una sala. Y podés exportar cualquier tablero a PDF o a imagen para adjuntar en un deck.

### "¿Necesito un analista de datos para armar tableros avanzados?"
Para tableros estándar y cruces comunes, no. El constructor visual resuelve el 95% de los casos sin una línea de código. Para análisis muy específicos (queries custom complejas, modelado avanzado), el rol de analista sigue siendo útil — NitroSales expone la data vía API para esos casos. El analista gana tiempo porque deja de armar cada reporte a pedido.

### "¿Qué pasa si alguien del equipo borra un widget por error?"
Versionado de tableros: cada cambio queda guardado, se puede volver atrás cualquier versión. Y los tableros compartidos tienen permisos — si un tablero es "solo lectura" para un usuario, no lo puede modificar.

---

## BLOQUE 8 — PRECIO

**Título**
Control de Gestión está incluido en todos los packs de NitroSales.

**Bajada**
A diferencia de otras secciones del Tier 3, Control de Gestión no se vende como funcionalidad aparte — forma parte del core de la plataforma. Si activás cualquier pack de NitroSales (Básico, Operativo, Ejecutivo, Completo), tenés acceso al constructor, la biblioteca de widgets, las plantillas por rol y los tableros compartidos.

### Qué está incluido en todos los planes
- **8-10 plantillas por rol** al lanzamiento (CEO, marketing, compras, comercial, operaciones, finanzas, customer success, analista).
- **Biblioteca de 80+ widgets** (KPIs, gráficos, tablas, funnels, mapas, alertas, narrativas).
- **Constructor visual drag-and-drop** con dropdowns de dimensiones y filtros.
- **Cruces entre todas las fuentes conectadas** (ventas, campañas, inventario, clientes, finanzas, logística, atención).
- **Tableros compartidos con permisos** por rol.
- **Envíos automáticos programados** por email o Slack.
- **Integración con Aurum** en cada widget (narrativa contextual).
- **Modo presentación** + export PDF/imagen.
- **API de solo lectura** para integración con herramientas externas (Looker, Power BI, Tableau).

### Lo que depende del pack
- **Cantidad de usuarios activos** (cada plan tiene un tope distinto; usuarios extra se suman con upgrade).
- **Retención histórica** de datos (plan básico: 12 meses; plan completo: ilimitada).
- **Widgets custom a medida** (solicitud al equipo NitroSales — incluidos desde el plan Ejecutivo).

**CTA primario**
[CTA: Ver planes completos → abre /precios]

**CTA secundario**
[CTA: Pedí una demo con tu equipo → abre Calendly]

**[VISUAL: chip "Incluido en todos los packs" destacado. Tabla compacta de packs con retención de data y cantidad de usuarios por plan.]**

---

## BLOQUE 9 — FAQ

**Título**
Preguntas que nos hacen seguido.

---

**¿Cuántos tableros puede tener un usuario?**
Ilimitados por usuario. Cada persona puede armar todos los tableros que quiera (uno principal, uno por campaña, uno para el comité, uno de prueba). Los tableros compartidos a nivel negocio tienen un tope según el plan (en general entre 5 y 50).

**¿Se puede combinar data de NitroSales con data externa (un CRM, una planilla de Google Sheets)?**
Sí. Conectás la fuente externa como "data source" adicional y sus campos quedan disponibles para widgets. Para CRMs comunes (HubSpot, Pipedrive, Salesforce) hay conectores nativos. Para planillas, conexión directa con Google Sheets / Excel 365. Para APIs custom, se configura con el equipo en onboarding.

**¿Los widgets muestran tendencias o solo snapshots?**
Ambos. La mayoría de widgets tiene dos vistas: valor actual + comparación con período anterior (tendencia). Los gráficos (línea, barras) muestran la evolución en el rango elegido. Los KPIs simples muestran el número + la flecha de variación.

**¿Se puede definir metas / targets por widget?**
Sí. Cada KPI acepta un target configurable (mensual, trimestral, anual). El widget muestra progreso hacia el target (por ejemplo, barra de progreso o semáforo). Si hay desvío significativo, Aurum lo destaca en la narrativa.

**¿Cómo se manejan los permisos cuando hay información sensible (ej: facturación, sueldos, márgenes)?**
Permisos a nivel widget, a nivel tablero y a nivel campo. Un usuario "junior de marketing" puede ver el tablero de marketing pero no los widgets que incluyen margen bruto; puede ver inversión pero no sueldos del equipo. Se configura una vez por el admin y es consistente en todos los tableros.

**¿Los envíos automáticos (email, Slack) pueden adjuntar el tablero completo?**
Sí. El email/mensaje Slack incluye un snapshot del tablero (imagen + link a la versión interactiva). El receptor ve lo mismo que ve quien accede desde la plataforma.

**¿Hay versiones móviles / app móvil?**
App móvil nativa en roadmap. Hoy, la versión web es responsive y funciona bien en mobile para consulta. Para construir tableros, desktop es mejor.

**¿Se puede comparar el negocio con benchmarks externos (promedio de la industria, competidores)?**
Para las métricas estándar (CAC, LTV, ROAS, conversión) hay benchmarks agregados por industria que se muestran como referencia en los widgets relevantes. Son anónimos y agregados — no exponen la data de otros clientes. No hay benchmarks individuales por competidor.

---

## BLOQUE 10 — CIERRE + CTA

**Título**
Dejar de depender de consultores, freelances y planillas que se rompen.

**Subheadline**
Plantillas por rol + constructor visual + toda la data ya conectada + Aurum explicando cada número. Todo lo que hoy te cuesta miles de dólares y meses de proyecto, acá es abrir, elegir y guardar.

**Body (1 párrafo)**
El problema nunca fue la falta de información — siempre fue **lo caro y complejo** que era acceder a ella. Cada negocio ecommerce llega a un punto en que necesita gestión por dato, y ahí aparece el costo: un consultor de BI que cotiza $15.000 para armar tableros; un freelance que hace un Looker Studio que se rompe cuando Meta cambia su API; un analista interno que pasa 3 días del mes armando el reporte para el directorio; una agencia que cobra fee mensual por mantener pipelines que se siguen cayendo. Todo eso antes de ver el primer número útil. Control de Gestión elimina ese costo. La data ya está conectada — la conectamos nosotros, la mantenemos nosotros, la arreglamos nosotros cuando algo cambia. Vos abrís la plataforma, elegís la plantilla para tu rol (tablero listo en 3 minutos), arrastrás widgets si querés personalizar (en menos de una hora tenés tu vista perfecta), y compartís con tu equipo con permisos. Aurum explica cada número para que no tengas que perseguir a nadie preguntando "¿por qué bajó esto?". Cada persona del equipo decide con su propia pantalla, hecha por ella. **Sin consultores. Sin freelances. Sin que se rompa.**

**CTA primario**
[CTA: Armá tu tablero ahora → lleva al PLAYGROUND]

**CTA secundario**
[CTA: Pedí tu demo → abre Calendly]

**Texto final chico**
¿Querés que tu equipo pruebe con roles distintos? Organizamos una demo multi-rol — hasta 4 personas con plantillas distintas viendo su vista en vivo.

**[VISUAL: cierre con gradient NitroSales + mosaico de 6-8 tableros (uno por rol) + CTAs grandes. El mensaje visual: "todas las vistas posibles, una sola plataforma".]**

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

### Elementos de diseño interactivo (CRÍTICOS en esta landing)
Esta landing requiere un **componente interactivo inédito**: el PLAYGROUND, donde el visitante arma un tablero en vivo sin login. Recomendaciones para la fase visual (Fase 2B / 4):
- Ubicación: justo debajo del Hero (antes del Trust Strip), para aprovechar el pico de atención.
- Dos modos: **"Elegí una plantilla"** (rápido — 6 plantillas visibles, click y se renderiza con data demo) y **"Armá desde cero"** (biblioteca de 20-30 widgets "highlight" de la biblioteca completa, drag-and-drop en grilla vacía).
- CTA de salida del playground: "Pedí tu demo para verlo con TU data" + capturar email opcional.
- Móvil: versión simplificada con scroll vertical de plantillas + preview.
- Data de demo: ficticia pero realista, de un negocio ejemplo con ~60 productos, 3 canales, 12 meses de historia.
- El playground también es **la prueba social más fuerte** de esta landing — reemplaza (parcialmente) los logos de clientes.

### Cross-links obligatorios
- Al inicio (header): linkea a `/` (matriz).
- En Bloque 3B: linkea los activos (aurum, bondly, productos, nitropixel) explícitamente.
- En Bloque 8: linkea a `/precios`.
- En Bloque 10: linkea al playground de la misma landing (anchor).

### Reglas de voz (checklist antes de publicar)
- [ ] Cero signos de exclamación.
- [ ] Cero emojis en body (solo en los ✅ / ❌ del Bloque 5, controlado).
- [ ] Voseo consistente ("pedí", "armá", "probá").
- [ ] Cero números inventados en prueba social (Bloque 6 con placeholder explícito).
- [ ] Mención honesta de limitaciones del constructor visual — para casos muy complejos hay export + API (Objeción 6, FAQ 1, Objeción 1).
- [ ] Mención honesta de que las plantillas son 8-10 al lanzamiento, biblioteca crece.
- [ ] Mención honesta de que la personalización requiere que la data exista conectada.
- [ ] CERO segmentación por facturación en Bloque 5.
- [ ] Bloque 3B conecta con los activos Tier 1/2 (Aurum, Bondly, Productos, NitroPixel).
- [ ] Ejemplos de widgets / tableros usan dimensiones reales y verosímiles.
- [ ] **Voz universal pero concreta**: la landing habla a muchos perfiles distintos, pero siempre con ejemplos específicos por rol (no "todo para todos" abstracto).
- [ ] **Hero enfatiza "cada rol el suyo"** — universalidad con especificidad.
- [ ] **Bloque 5 nombra 10 perfiles explícitos** (CEO, CMO, compras, comercial, operaciones, CFO, CS, analista, inversor, consultor).
- [ ] **Playground mencionado en Hero y en Cierre** como CTA alternativo a "pedí demo".
- [ ] **Bloque 3B diferenciado de herramientas de BI genéricas** (Looker, Power BI, Tableau) — "tenemos la data lista, ellos solo el lienzo".
- [ ] **FACILIDAD COMO VALOR #1** — el dolor que la landing ataca es la **complejidad y el costo** actual (consultores, freelances, dashboards a medida que se rompen, meses de proyecto, miles de dólares). Esto se refuerza en Hero, Bloque 3B y Cierre. La facilidad no es un feature — es la propuesta de valor central. (Ratificado post feedback Tomy 2026-04-19.)
- [ ] **Contraste "mundo de hoy vs mundo con NitroSales"** explícito: cifras concretas del costo actual ($5k-$30k de implementación, 2-4 meses, mantenimiento continuo, APIs que se rompen) vs. "3 minutos, sin código, sin consultores".
- [ ] **"Nosotros arreglamos cuando cambia una API"** — mensaje distintivo mencionado en Hero y Bloque 3B. Es el argumento que cierra la promesa de "no se rompe".

### Flujo narrativo
Hero (tu tablero, cada rol el suyo + CTA al playground) → Trust Strip (todas las fuentes conectadas de origen) → Bloque 3 (5 capacidades: plantillas por rol / constructor drag-and-drop / cruces any-to-any / compartir con permisos / narrativa de Aurum) → Bloque 3B (por qué BI externo no alcanza — data lista vs lienzo vacío) → Bloque 4 (setup 48hs, 3 pasos) → Bloque 5 (para quién — 10 perfiles universales) → Bloque 6 (prueba social con placeholder + playground como prueba viviente) → Bloque 7 (7 objeciones: BI existente, widget no en biblioteca, mobile, tiempo real, presentación, necesidad de analista, errores) → Bloque 8 (precio — incluido en TODOS los packs) → Bloque 9 (FAQ operativa — tableros por usuario, fuentes externas, tendencias, targets, permisos, envíos, móvil, benchmarks) → Bloque 10 (cierre "cada persona con su vista, el mismo negocio").

### Patrón distintivo vs. resto del Tier 3
- **Única landing del Tier 3 con audiencia universal** (no un rol primario). El Bloque 5 nombra 10 perfiles.
- **Única con playground interactivo en la landing** (diferenciador de conversión).
- **Única con precio "incluido en todos los packs"** — porque es la capa transversal de la plataforma, no una funcionalidad específica.
- **El Bloque 3 no sigue el patrón "Lo que hoy pensás / Lo que en realidad está pasando"** (que es más narrativo-emocional) — usa "Quién la necesita / Lo que hoy pasa / Cómo lo resuelve / Caso real / La decisión que podés tomar". Tono más funcional, menos emotivo — por la naturaleza multi-rol.

### Paralelismo con las otras Tier 3
- Mismo esqueleto de 10 bloques.
- Bloque 3B siempre conecta con activos Tier 1/2 (Aurum, Bondly, Productos, NitroPixel).
- Checklist de voz y honestidad en la misma lógica.
- Cross-links naturales: puede cerrar hacia cualquier landing específica (no hay "par natural" como Rentabilidad ↔ Productos).

### Apertura de Fase 3 (actualizada)
Con Control de Gestión v1 completada, llevamos 4 de las 8 landings del Tier 3. Quedan:
- `/marketing-digital` — campañas + atribución cross-canal + journeys.
- `/integraciones` — hub de conexiones (diferencial vs Triple Whale Shopify-only).
- `/alertas` — Aurum proactivo (detección de anomalías).
- `/marketplaces` — MELI deep dive.

---

_Última actualización: 2026-04-19 — v2 Sesión 3 VM (Fase 3-4 · Tier 3 cuarta landing · reforzada FACILIDAD como valor #1 post feedback Tomy, con contraste explícito vs. el costo actual de consultores + freelances + proyectos de BI que se rompen)._
