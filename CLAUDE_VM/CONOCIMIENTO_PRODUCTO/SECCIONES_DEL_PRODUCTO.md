# SECCIONES_DEL_PRODUCTO.md — Las 5 secciones funcionales de NitroSales

> **Propósito**: Mapa funcional de la app. Mientras `QUE_ES_CADA_PRODUCTO.md` describe los 4 activos con marca (NitroPixel, Aurum, Bondly, Aura) que se venden como propuesta de valor, este archivo describe **cómo está organizada la app por adentro** — qué ve el usuario cuando abre la sidebar.
>
> Fuente de verdad: `PROPUESTA_SIDEBAR_REORG.md` (aprobado en Sesión 41). Última reorg vigente al cierre de S42 (SHA `6441ec25`).

---

## Mapa mental: 2 capas, 5 secciones, 8 tiers de sidebar

La app tiene **dos capas de organización** que conviven:

1. **Los 4 activos con marca** — lo que se vende. NitroPixel / Aurum / Bondly / Aura.
2. **Las 5 secciones funcionales** — cómo se usa día a día. Control de Gestión / Marketing Digital / Comercial / Marketplaces / Finanzas.

Los activos con marca están **embebidos** dentro de las secciones funcionales. Ejemplo: Bondly es un activo, pero la **experiencia del usuario** vive dentro de la sección "Comercial". NitroPixel es el activo que **alimenta** a casi todas las otras secciones (Marketing Digital, Comercial, Aura).

La sidebar aprobada en S41 tiene **8 tiers visuales** (agrupaciones de navegación) que se mapean a las 5 secciones funcionales:

| Tier de sidebar | Sección funcional | Notas |
|---|---|---|
| ACTIVOS DIGITALES | Marketing Digital | NitroPixel se muestra como activo top-level |
| CONTROL DE GESTIÓN | Control de Gestión | Centro de Control, Pedidos, Alertas |
| FIDELIZACIÓN Y COMUNIDAD | Comercial | Bondly + (futuro) programas de lealtad |
| MARKETING DIGITAL | Marketing Digital | Campañas, SEO, Audiencias, Aura |
| COMERCIAL | Comercial | Productos, Rentabilidad |
| MARKETPLACES | Marketplaces | MercadoLibre |
| FINANZAS | Finanzas / P&L | P&L Pulso, Estado, Costos, Escenarios, Fiscal |
| CONFIGURACIÓN | Transversal | Integraciones, billing, usuarios |

Esto importa porque el **pitch comercial** se hace por activos, pero la **demo en vivo** se hace recorriendo secciones funcionales. Cuando alguien dice "mostrame cómo funciona", lo que se ve es la sidebar.

---

## Sección 1 — Control de Gestión

**Lo que hace**: el dashboard del día a día. Lo primero que abre Tomy o el fundador cliente cada mañana.

**Pantallas principales**:

### 1.1 — Centro de Control (dashboard home)

- **Hero** con KPIs principales: ventas del día, AOV, sessions, conversion rate, ad spend, ROAS.
- **Comparativas** vs día anterior, vs mismo día semana pasada, vs mismo día mes pasado.
- **Breakdown por canal**: VTEX, MercadoLibre, suma total.
- **Gráfico de revenue** últimas X horas / X días con granularidad ajustable.
- **Tiles de alertas**: cuántas alertas activas hay en cada categoría.
- **Shortcut a Aurum**: botón "Preguntale a Aurum" que abre el asistente con contexto del día cargado.
- **Sync status indicator**: muestra última sincronización de cada integración (VTEX, ML, Meta, Google, GA4, GSC).

### 1.2 — Pedidos

- **Lista unificada** de pedidos VTEX + MercadoLibre.
- **Filtros**: canal, estado, rango de fechas, cliente, monto.
- **Detalle por pedido**: items, cliente, dirección, estado de pago, estado de envío.
- **Acceso a atribución**: cada pedido muestra de qué canal vino (según NitroPixel).
- Diferencia vs backoffice nativo: **un solo lugar** para ver todo el pipeline de órdenes sin saltar entre VTEX admin y ML seller center.

### 1.3 — Alertas

- **Sistema proactivo** que detecta anomalías y las publica acá.
- Categorías de alertas:
  - Anomalías de venta (caída día/semana).
  - Anomalías de spend (overspend campaña X).
  - Problemas de stock (SKU agotado con órdenes en curso).
  - Problemas de sync (una integración se cayó).
  - Riesgos de churn (clientes alto valor sin comprar hace X días).
  - Alertas de P&L (cash runway corto, margen negativo categoría X).
- **Cada alerta tiene CTA** (ir a la pantalla relevante) y puede silenciarse o snoozearse.

### 1.4 — Sync Status (pantalla dedicada)

- Estado detallado de todas las integraciones con timestamps, errores, manual triggers.
- No es para mostrar en demo comercial — es para el power user / soporte.

**Por qué importa comercialmente**: esta sección es lo que reemplaza al "abrir 8 pestañas cada mañana". Es el **ritual** que crea hábito diario. Sin un dashboard que se abra todos los días, la app se olvida.

---

## Sección 2 — Marketing Digital

**Lo que hace**: toda la capa de paid + orgánico + atribución + creator economy.

**Pantallas principales**:

### 2.1 — NitroPixel (activo con marca dentro de esta sección)

Navegación interna:
- **Overview**: sessions, visitors, devices, orígenes top, funnel básico.
- **Atribución**: dashboard con 4 modelos (LAST_CLICK, FIRST_CLICK, LINEAR, NITRO). Toggle para comparar. Vista por canal, por campaña, por día.
- **Audiencias**: segmentación behavioral (carrito abandonado 7d, alto intent no compró, etc).
- **Funnel**: visualización paso a paso con drop-off rates.
- **Customer Journey**: timeline de eventos por visitor.
- **Realtime** (si está activado): eventos en vivo.
- **Setup**: estado de instalación del pixel, domain verification, gateway exclusions config.

### 2.2 — SEO

- **Dashboard GSC**: impresiones, clicks, CTR, posición promedio.
- **Top queries** + **top pages**.
- **Comparativas** período vs período.
- **Integración con GA4**: sessions orgánicas, conversiones orgánicas.
- **Alertas de caída** de impresiones o clicks en queries importantes.

### 2.3 — Campañas (Meta + Google + Creativos)

- **Meta Ads**:
  - Lista de campañas con KPIs (spend, impressions, clicks, CTR, CPC, CPM, conversions, ROAS).
  - Vista por Ad Set y por Ad.
  - Export + sync on-demand (al abrir la página se dispara fetch si hace >30min).
  - Performance por placement (Feed, Stories, Reels).
  - **Atribución combinada**: NitroPixel + Meta Attribution para ver discrepancia.
- **Google Ads**:
  - Lista de campañas con KPIs.
  - Vista por Ad Group y por Keyword.
  - Search Terms Report.
  - Quality Score por keyword.
- **Creativos**:
  - Grid de todos los creativos (imágenes / videos) con performance agregado.
  - Comparativa de top performers vs bottom performers.
  - Tags por temática, concepto, CTA.

### 2.4 — Audiencias

- Lista de audiencias creadas desde NitroPixel.
- Estado de sync a Meta Custom Audiences y Google Customer Match.
- Tamaño estimado, tasa de match.
- Botón para crear nueva audiencia desde un segmento de NitroPixel.

### 2.5 — Aura (activo con marca dentro de esta sección)

Navegación interna:
- **Aura Inicio**: dashboard de creators con 7 zonas (ver `QUE_ES_CADA_PRODUCTO.md`).
- **Creadores**: lista de influencers con estado, deal activo, métricas.
- **Campañas**: lista de campañas de creadores con performance.
- **Deals**: editor de deals (7 tipos: COMMISSION, FLAT_FEE, etc.).
- **Payouts**: queue de pagos pendientes, historial, exports para transferencias.
- **Aplicaciones**: pipeline de creadores aplicando (approve/reject).

**Por qué importa comercialmente**: esta es la sección **más cara de replicar** para un competidor genérico. Triple Whale no tiene creator economy nativa. Shopify apps tienen atribución pero no tienen P&L. La profundidad acá es el moat.

---

## Sección 3 — Comercial

**Lo que hace**: entender qué vendés, a quién, y con qué margen. Es la capa de "producto + cliente + rentabilidad" que falta en casi todos los dashboards del mercado.

**Pantallas principales**:

### 3.1 — Productos

- Lista maestra de SKUs con datos unificados VTEX + ML.
- **SKU-first architecture**: un mismo SKU aparece una sola vez, con breakdown por canal.
- Métricas por SKU: unidades vendidas, revenue, stock, rotación, días sin venta, margen.
- Filtros por categoría, brand, supplier, tags.
- **Detalle de SKU**: performance 30/60/90/365 días, heatmap por día de la semana, campañas asociadas, clientes que lo compran.

### 3.2 — Rentabilidad

- **Matriz de rentabilidad**: revenue vs margen por categoría, por SKU, por canal.
- **Costos cargados** por SKU (COGS) más flete + comisión + impuestos.
- **Margen de contribución** real por unidad vendida.
- **Top ganadores / perdedores** del período.
- Relación directa con la sección de Finanzas (P&L).

### 3.3 — Bondly (activo con marca dentro de esta sección)

Navegación interna:
- **Pulse Banner** (siempre visible arriba): hoy entregamos 12 paquetes, esperamos 3 pagos, 4 clientes alto valor inactivos +60d.
- **Customer 360**: lista de clientes con triple-layer LTV (historical / predicted / behavioral).
- **Insights Engine**: feed de los 5 detectores (VIP at risk, high intent, retention pattern, win-back opportunity, lookalike seed).
- **Churn Risk Scoreboard**: scoring de riesgo por cliente con acciones sugeridas.
- **Segmentos**: VIP, casi-VIP, riesgo, hielo, nuevos, recurrentes.
- **Detalle por cliente**: perfil completo, timeline de compras, predicciones, touchpoints.

**Por qué importa comercialmente**: "Rentabilidad + Bondly juntos" es la respuesta al fundador que dice *"vendo mucho pero no sé si gano plata"*. Es la sección que más engancha en demo.

---

## Sección 4 — Marketplaces

**Lo que hace**: todo lo específico de MercadoLibre (por ahora). Futuro: Amazon, Noventa9.

**Pantallas principales**:

### 4.1 — MercadoLibre

- **Dashboard**: revenue ML, unidades, AOV, comisiones pagadas, publicaciones activas.
- **Publicaciones**: lista con precio, stock, status, visitas, conversiones.
- **Órdenes**: lista específica de órdenes ML con estados específicos (pago acreditado, envío en tránsito, entregado, cancelado, devuelto).
- **Preguntas**: lista de preguntas de compradores por publicación.
- **Métricas de reputación**: color del vendedor, puntaje, reclamos.
- **Alertas específicas ML**: publicación pausada, reputación bajando, reclamo abierto.

**Por qué importa comercialmente**: **90% de las marcas argentinas venden en ML**. No tener ML nativo es dealbreaker. La integración profunda (no solo lectura de órdenes, sino estado de publicaciones, preguntas, reputación) es diferencial fuerte vs dashboards USA.

---

## Sección 5 — Finanzas (P&L / Estado de Resultados)

**Lo que hace**: el P&L (Estado de Resultados) conversacional. Respuesta a "cómo vamos este mes" en contexto argentino (inflación, devaluación, dólar MEP).

**Pantallas principales**:

### 5.1 — P&L Pulso (Sesión 42 — recién lanzado)

- **Hero**: Cash Runway (en meses) según revenue promedio, burn promedio, saldo actual.
- **Tri-currency toggle**: USD MEP (default) / ARS nominal / ARS ajustado inflación. Todas las pantallas respetan el toggle.
- **Marketing Financiero**: spend total del mes, blended ROAS, CAC, margen neto post-marketing.
- **Sparkline 12m**: evolución de P&L neto mes a mes.
- **Costos YTD**: breakdown de costos por categoría año hasta la fecha.
- **Narrative engine**: bullets en lenguaje natural resumen del estado ("estás vendiendo bien pero el margen se comió la devaluación de abril"). Genera el narrative con Anthropic.
- **Alerts engine**: alertas financieras específicas (cash runway <3 meses, categoría X margen negativo, etc.).
- **Manual cash override**: input para corregir el saldo de caja manualmente cuando los sistemas bancarios no están integrados.
- **Aurum context**: el narrative se alimenta del contexto de Aurum para ser consistente.

### 5.2 — Estado (P&L tradicional)

- Tabla clásica de P&L: revenue bruto, devoluciones, revenue neto, COGS, margen bruto, marketing, fulfillment, fijos, EBITDA, impuestos, neto.
- Por mes, por trimestre, YTD.
- Comparativa vs período anterior.

### 5.3 — Costos

- Breakdown detallado de costos por tipo (COGS, Marketing, Fulfillment, Platform Fees, Fijos).
- Serie temporal de cada categoría.
- Top movimientos del período (cuál subió más, cuál bajó más).

### 5.4 — Escenarios (projection tool)

- Simulador: qué pasaría si subo precio 10%, si corto un canal, si cambia el tipo de cambio.
- Sliders y output en tiempo real.
- Guardar escenarios para comparar.

### 5.5 — Fiscal

- Integración AFIP (facturación electrónica, Mis Comprobantes, IVA).
- Resumen fiscal del mes: IVA débito, IVA crédito, posición neta.
- Alertas de vencimientos.
- Conciliación con revenue para detectar gaps entre facturación vs revenue operativo.

**Por qué importa comercialmente**: esta es la sección que **vuelve sticky al fundador**. Ventas y marketing los puede ver en cualquier dashboard. Pero P&L con tri-currency, AFIP y narrative es único de NitroSales. Es la sección que el CEO abre los viernes a la tarde.

---

## Cómo conectan las 5 secciones entre sí

Flujo típico de uso (día promedio de un fundador):

1. **Abre Control de Gestión** → ve Centro de Control, chequea alertas.
2. **Click en alerta "spend Meta creciendo sin ROAS"** → salta a Marketing Digital > Campañas Meta.
3. **Ve la campaña rota** → decide pausar. Click en "ver audiencia" → salta a NitroPixel > Audiencias para entender por qué no convierte.
4. **Ve que la audiencia es lookalike genérico** → crea nueva audiencia desde un segmento de NitroPixel (alto intent 30d).
5. Más tarde: **abre Comercial > Rentabilidad** → nota que categoría X tiene margen negativo.
6. **Abre Finanzas > Escenarios** → simula subir precio 8% → ve el impacto en EBITDA mensual.
7. Cierre del día: **abre Aurum** (FloatingAurum, botón flotante) → pregunta "resumime cómo fue el día". Aurum le da 3 bullets.

**Este flujo es el storyboard del pitch comercial**: "empezás por el dashboard, te mete en un problema, te lleva a la solución, cierra con Aurum". Hay que tenerlo en mente cuando se arman demos en video.

---

## Qué NO está en la app (a propósito)

- **Email marketing transaccional avanzado**: no competimos con Klaviyo/Mailchimp en flujos automáticos. NitroSales se conecta con Resend para envíos puntuales, pero no es una plataforma de email.
- **CRM tradicional (pipeline de ventas B2B)**: no es Pipedrive ni HubSpot Sales. Bondly es un CRM **para ecommerce**, no para cuentas de outbound.
- **CMS / editor de landing pages**: no compite con Webflow, Tiendanube nativo, o Shopify. NitroSales vive **arriba** de la tienda; la tienda la tiene el cliente.
- **Help desk / atención al cliente**: no es Zendesk. La atención a clientes ecommerce se deja a Tidio/Intercom/WhatsApp API.
- **ERP / contabilidad completa**: Finanzas es P&L de gestión, no es contabilidad full. AFIP es para reconciliación, no para reemplazar al contador.

Esto importa en el pitch: **cuando el cliente pregunta "¿tiene email marketing?" la respuesta es "no, nos integramos con tu Klaviyo/Resend — nosotros somos la cabeza, tu stack de ejecución sigue"**. No prometemos lo que no hacemos.

---

## Notas para el Claude VM

Cuando escribas landing, one-pagers o decks:
- **Ordená por activos** (NitroPixel, Aurum, Bondly, Aura) para la narrativa comercial.
- **Usá secciones funcionales** cuando estés describiendo la demo o el producto físicamente.
- **Siempre recordá** que Finanzas (P&L) es el sticky maker. Mencionalo temprano en cualquier storyline.
- Si un prospect pregunta "¿tiene X?" y X no está en las 5 secciones: es probable que no. No inventes features.
