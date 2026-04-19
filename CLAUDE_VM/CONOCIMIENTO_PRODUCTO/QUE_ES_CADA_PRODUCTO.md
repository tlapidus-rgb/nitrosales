# QUE_ES_CADA_PRODUCTO.md — Los 4 activos digitales de NitroSales

> Este archivo documenta en profundidad los 4 productos con marca propia dentro de NitroSales. Cada uno tiene identidad, pitch, features y posicionamiento propio. Son el corazón del moat.
>
> **Última actualización**: 2026-04-18 — Sesión 1 VM. Estado al cierre de Sesión 42 de Producto.

---

## Vista general

| Activo | Qué es | Pilar | Tagline |
|---|---|---|---|
| **NitroPixel** | Pixel de atribución first-party propio | Percepción | "Google mide para Google. Meta mide para Meta. NitroPixel mide para vos." |
| **Aurum** | Asistente IA con memoria del negocio | Cognición | "El cerebro con memoria de tu ecommerce." |
| **Bondly** | Inteligencia de clientes con LTV predictivo | Memoria (clientes) | "Tus clientes, previstos." |
| **Aura** | Creator economy integrada | Memoria (creadores) | "Tu nuevo canal de ventas." |

---

## 1. NitroPixel — el activo vivo que observa

### El one-liner
**"Google mide para Google. Meta mide para Meta. NitroPixel mide para vos."**

### Qué es
NitroPixel es un **pixel de atribución first-party propio** de NitroSales. Se instala en la tienda del cliente, corre en el navegador de cada visitante, captura touchpoints, y reconcilia con las órdenes reales que llegan por webhook de VTEX. Resultado: la tienda deja de depender de Meta y Google para saber qué campañas funcionan, y pasa a tener una **fuente de verdad propia**.

### Por qué importa (el dolor que resuelve)
- Meta dice que una campaña vendió X. Google dice que vendió Y. La realidad en VTEX es Z. Ninguna de las tres cifras coincide.
- El cliente está gastando USD 5K/mes en ads sin saber qué realmente vuelve.
- Cuando Meta actualiza el algoritmo o cambia la API, el ROAS reportado salta 20% sin que el negocio real haya cambiado.

NitroPixel resuelve esto siendo **dueño del dato**: la tienda es dueña del pixel, no alquila el dato a Meta.

### Features concretos (hoy en producción)

#### Captura
- **Cross-domain cookie persistence** (maneja los TLDs compuestos de LATAM como `.com.ar`).
- **Bot filtering** inteligente (WhatsApp bot preview se excluye; bots reales se filtran).
- **Session-based touchpoint engine**: un touchpoint por sesión por canal, no por evento.
- **SPA navigation tracking**: capta `pushState`, `replaceState`, `popstate`, `hashchange`.
- **VTEX dataLayer interception**: `productView`, `addToCart`, `view_item`, Enhanced Ecommerce.
- **VTEX orderForm API capture**: ADD_TO_CART real, no heurístico.
- **Early identification**: usa la API de profile de VTEX, formularios de login, páginas de cuenta — identifica al usuario antes del checkout.
- **Configurable attribution window**: 7, 14, 30, 60 días.

#### Atribución
- **4 modelos de atribución**: `LAST_CLICK`, `FIRST_CLICK`, `LINEAR`, `NITRO` (proprietary).
- **Exclusión de pasarelas de pago**: MercadoPago, GoCuotas, Payway, TodoPago, Decidir, PayPal, Stripe, Mobbex y otros 10+ gateways no se cuentan como fuentes de tráfico.
- **View-through attribution**: asist para visualizaciones que no fueron click.
- **Channel Role Map**: first-touch / assist-touch / last-touch / solo-touch por canal.
- **Meta CAPI integration**: fire-and-forget en PURCHASE (server-side para compensar iOS 14).
- **Dedupe de webhooks VTEX**: `isNewOrder` check evita procesar atribución múltiple veces.

#### Analytics (la página `/nitropixel` o `/analytics`)
Organizado en 7 zonas:

1. **KPI Strip**: Visitantes, Sesiones, PageViews, Identificados, Carrito, Compradores (con % de cambio).
2. **Channel Truth Table**: ROAS real (pixel) vs ROAS plataforma, Truth Score por canal, tooltip educativo con el rol (Descubrimiento/Asistencia/Cierre).
3. **Funnel + Journeys**: funnel de conversión + 10 journeys recientes con touchpoints visuales.
4. **Revenue Intelligence**: toggle "Truth / Channels" — area chart pixel vs platform vs ad spend, o bar stacked por canal.
5. **Velocidad de Conversión**: barras horizontales por bucket de lag temporal + auto-insight.
6. **Dispositivos + Top Páginas**: PieChart mobile/desktop/tablet + top 6 páginas (unique visitors, sin checkout, con pretty-print de slugs).
7. **Pixel Coverage Timeline**: AreaChart de cobertura % con línea de referencia al 80% + alertas automáticas.

#### Seguridad
- XSS protection en orgId.
- localStorage null-safety.
- PII stripping en emails capturados (hash SHA-256 antes de persistir).

### Data points defensibles
- 4 modelos de atribución.
- 18+ payment gateways filtrados.
- Cross-domain tracking de TLDs compuestos (diferencial vs competidores americanos).
- Meta CAPI integrado fire-and-forget para servidor-a-servidor.
- 7 zonas de analytics con Truth Score por canal.

### Para quién
Fundadores que gastan >USD 1K/mes en Meta o Google Ads y están cansados de tomar decisiones con ROAS que saltan 30% entre reportes de la plataforma y reportes reales.

### Cómo se pitch en una línea
"Dejá de confiar en los números que te da Meta. Instalá un pixel que sea tuyo y medí la verdad de qué canal realmente convierte."

---

## 2. Aurum — el cerebro con memoria

### El one-liner
**"El cerebro con memoria de tu ecommerce."**

### Qué es
Aurum es el **asistente de IA integrado en toda la plataforma**, con memoria persistente del negocio. No es un chatbot genérico al que le explicás quién sos cada vez. Aurum recuerda tu industria, tu país, tus canales, tus clientes VIP, tus productos estrella, tus reglas de negocio. Y tiene **12 herramientas** para leer data del negocio en tiempo real.

### Por qué importa (el dolor que resuelve)
- ChatGPT es inútil para tu ecommerce: no sabe qué vendés, ni cuáles son tus mejores clientes, ni qué pasó ayer en Meta.
- Los copilots de dashboards tipo Shopify / Polar te dan respuestas genéricas porque no tienen memoria.
- Aurum conoce tu tienda, recuerda tus reglas, y razona sobre tu data actualizada.

### Features concretos (hoy en producción)

#### 12 herramientas (data tools)
1. `get_sales_overview` — ventas por canal, período, producto.
2. `get_products_inventory` — catálogo, stock, quiebre.
3. `get_ads_performance` — Meta + Google Ads con ROAS real.
4. `get_traffic_funnel` — funnel NitroPixel (visitantes → identificados → comprados).
5. `get_customers_ltv` — LTV histórico, predicho, behavioral.
6. `get_seo_performance` — GSC data con 5 tabs.
7. `get_competitors_analysis` — intelligence de competidores.
8. `get_financial_pnl` — P&L dual view.
9. `get_mercadolibre_health` — estado del seller ML.
10. `get_influencers_performance` — creadores, campañas, payouts.
11. `get_pixel_attribution` — Truth Table por canal.
12. `get_creative_performance` — creativos Meta + Google con drilldown.

#### 3 modos de razonamiento
- **Flash** (Haiku): rápido, económico, para preguntas simples ("¿cuánto vendí ayer?").
- **Core** (Sonnet): default, balance entre velocidad y profundidad.
- **Deep** (Opus): análisis complejos, razonamiento multi-paso ("¿vale la pena escalar mi inversión en Meta vs Google dado el CAC payback actual?").

El usuario elige el modo en cada mensaje. Cambiar modo tiene latencia y costo asociado — Aurum es honesto sobre eso.

#### Memory system
- Tabla `BotMemory` con cuatro tipos: `rule`, `fact`, `preference`, `calendar`.
- Cada memoria tiene prioridad, contenido, y fuente.
- Seed inicial con 5 reglas de negocio cuando se crea el org.
- UI `/memory` para que Tomy vea, edite, agregue, borre memorias.
- **Página `/sinapsis`** (1,229 líneas de UI) con visualización de memorias y relaciones — cómo se conectan los conceptos.

#### Onboarding inteligente
- **Auto-detecta** (sin preguntar): industria (de las categorías de producto), país (de timezone / currency), business type, stage (30d orders), sales channels (de connections), ads channels (de ad_metrics_daily).
- **Solo pregunta lo que no sabe**: 6 pasos en chat (industry → country → business type → stage → sales channels → ads channels).
- Al terminar, genera memorias contextuales por industria.

#### Experiencia visual
- **FloatingAurum global bubble** en todas las rutas de la app (excepto `/chat` y `/login`).
- **Saturn-ring gold orb** (variante elegida sobre 4 opciones) — orb dorado con anillo 3D, la mitad de atrás del anillo pasa detrás del orb.
- **Animaciones**: shimmer, orbit, breath, float, fade-up, pulse ring (6 keyframes globales).
- **Welcome screen**: 280px radial halo, badge "Intelligence Engine v1", gradient headline, CyclingHeadline rotando 3 frases, suggestion cards con top accent line.
- **Context-aware**: cuando el usuario abre el bubble en `/campaigns`, Aurum ya sabe que está mirando campañas y sugiere preguntas relevantes (pathname fallback mapeado para 30 rutas).

#### Telemetría y admin
- Tabla `aurum_usage_logs` con 15 columnas: input tokens, output tokens, cache tokens, costUsd, latencyMs, toolCalls, success, mode, model.
- Dashboard admin en `/admin/usage?key=usage-2026`: requests por modo, total cost USD, latencia, error rate, top orgs.

### Data points defensibles
- 12 herramientas de data real, no generadores genéricos.
- 3 modos de razonamiento que el usuario elige.
- Sistema de memoria persistente (nada "vive" en el prompt; todo en DB).
- Onboarding que **auto-detecta** 6 campos sin preguntar.
- Presencia global en toda la app via FloatingAurum.
- Telemetría completa de costo y latencia.

### Para quién
Fundadores que saben que la IA es una palanca, pero que están frustrados con "asistentes" genéricos (ChatGPT, Claude.ai) que no tienen memoria del negocio. Quieren una IA que les hable como un analista que trabaja con ellos desde hace 6 meses.

### Cómo se pitch en una línea
"Una IA que ya conoce tu tienda, tus clientes y tus reglas. Le preguntás en castellano, te responde con data real de tu negocio, y recuerda lo que hablaste ayer."

---

## 3. Bondly — la memoria de tus clientes

### El one-liner
**"Tus clientes, previstos."**

### Qué es
Bondly es el **módulo de Customer Intelligence** para tiendas VTEX. Unifica Clientes, LTV (Lifetime Value) y Audiencias en un solo módulo premium. Explícitamente VTEX-only (MercadoLibre no comparte data de cliente, así que queda fuera del módulo — ML se trata como "orgánico no atribuible"). Ofrece LTV en 3 capas (histórico / predicho / behavioral), journey unificado pixel+comercio+email, churn risk scoring, affinity matrix, insights rule-based.

### Por qué importa (el dolor que resuelve)
- Saber quiénes son tus clientes VIP (no los que más compraron **una vez**, sino los que van a traer más plata en los próximos 12 meses).
- Detectar clientes en riesgo de churn **antes** de que se vayan.
- Entender cómo se comportan antes de comprar (behavioral LTV desde el pixel).
- Lanzar lookalike audiences desde tu CRM a Meta/Google.
- Ver el customer journey completo (visitas + compras + emails) en una sola pantalla.

### Features concretos (hoy en producción)

#### Pulse banner (entrada visual del módulo)
Banner con 2 timelines LIVE:
1. **Commerce timeline**: órdenes de VTEX en tiempo real.
2. **NitroPixel timeline**: visitas identificadas en tiempo real.

Indicador que señala si visitantes están pre-compra activos ahora.

#### Customer 360 — `/bondly/clientes`
- **Lista con anonymous + identificados** (toggle).
- **Identity de 3 vías**: resuelve por customerId OR email.
- **Period filter**: últimos 7, 30, 90 días, custom.
- **Paginación numerada** (no scroll infinito).
- **Detail sheet** con timeline pixel + commerce **unificado**:
  - Dedupe por URL normalizado + ventana de 3 minutos (evita duplicados entre pixel y webhook).
  - Human titles en lugar de URLs crudas.
  - Map de event types real (view_product, add_to_cart, purchase, identify, etc.).
  - Badge **"Pre-pixel"** para órdenes previas al deploy del pixel.

#### LTV premium — `/bondly/ltv`
**Triple-layer LTV**:
1. **Histórico**: cuánto gastó el cliente hasta hoy.
2. **Predicho** (BG/NBD + Gamma-Gamma de Fader & Hardie, Wharton): cuánto se espera que gaste en 90 / 365 días. Con rails de sanidad (fase 1 del BP-001 cuando se implemente).
3. **Behavioral** (de NitroPixel, pre-compra): score 0-100 de probabilidad de comprar basado en comportamiento de navegación.

**7 KPI tiles animados** (con count-up):
- LTV histórico, LTV predicho, Behavioral LTV (las 3 capas).
- LTV:CAC, Repurchase 30d, Median LTV, Pareto concentration alert.

**Trust Strip**: "Compatible con Meta · Google · Basado en investigación de Wharton" + intervalos P10/P50/P90.

**Secciones**:
- **Insights Engine**: 5 detectores rule-based — toxic channel, sweet spot, star cohort, VIP visitors, at-risk whales.
- **Behavioral LTV Explorer**: filter anonymous/identified/customers; scoring pre-compra.
- **Customer Journey Drawer**: overlay con commerce + pixel + email en un timeline.
- **Deciles + Pareto**: distribución de revenue por decil de cliente (el clásico 20/80).
- **Product Affinity Matrix**: cross-sell category→category con gradiente esmeralda.
- **Churn Risk Scoreboard**: tiers critical / high / medium / low, con cutoffs 75 / 55 / 30, CTA "Ver journey" por cliente.
- **Top Clientes tier-aware**: VIP / GOLD / BRONZE top-3 con halo y Journey column.
- **Channels table**: tier-aware CTAs (LTV:CAC ≥3 → "Escalar inversión" verde; <1 → "Revisar audiencia" rojo; repeat rate >40% → "Crear lookalike" indigo).

#### Audiencias — `/bondly/audiencias`
Hoy **placeholder** (está en backlog BP-002 para Fase 2).

Cuando se implemente, va a tener:
- Builder de audiencias con reglas (spent, recency, products, segment, LTV tier).
- Preview con contador.
- Export a Meta Custom Audiences / Google Customer Match (tecnología ya existe en el módulo Audience Sync, falta unificar UI en Bondly).
- Segmentos predefinidos: VIP, en riesgo, cart abandoners, primera compra, recurrentes.
- Sincronización automática.

#### Señales — `/bondly/senales`
- Moments + Live Feed.
- Eventos behavioral relevantes (cart abandoners, producto visitado 3+ veces, re-visita post-compra).

#### Anti-pérdida de data
- **Backfill visitor-customer link**: hook `linkVisitorToCustomer` en webhook VTEX + endpoint admin para correr el backfill por histórico.
- **Anti-dupe via NOT EXISTS**: evita crear vínculos duplicados.

### Data points defensibles
- LTV en 3 capas vs competidores que solo hacen histórico.
- Fader & Hardie (Wharton) como base matemática defendible.
- Identity 3 vías (customerId + email) resuelve el clásico problema de clientes con múltiples compras desde distintos devices.
- Behavioral LTV desde pixel (único vs Klaviyo que solo tiene post-compra).
- 5 insights rule-based accionables automáticamente.
- Churn risk scoring con tiers y CTA "Ver journey".

### Para quién
Tiendas VTEX con más de 500 clientes históricos, que ya invirtieron en adquisición y quieren extraer el máximo valor de la retención. Fundadores que dicen "tengo que hacer email marketing mejor" pero no saben a quiénes mandarle qué.

### Cómo se pitch en una línea
"Bondly te muestra no solo quiénes son tus clientes, sino cuánto van a gastar el año que viene, y qué hacer hoy para que no se vayan."

### Nota importante
- **Solo VTEX**. MercadoLibre está explícitamente excluido del módulo porque ML no comparte data de cliente (ni email, ni nombre, ni customerId único). Si un prospect pregunta "¿incluye ML?", la respuesta es "no — ML no comparte la data necesaria. Por eso en NitroSales vive como canal separado".

---

## 4. Aura — la creator economy integrada

### El one-liner
**"Tu nuevo canal de ventas."**

### Qué es
Aura es el módulo completo de **creator economy / marketing de influencia** integrado en NitroSales. Maneja el ciclo completo: aplicación pública → aprobación → creación automática de campaña Always On → deals de múltiples tipos → tracking vía UTM + cupones → payouts → dashboards públicos para cada creador. Es Shopify Collabs / SparkLoop pero nativo a la plataforma, conectado al pixel y al customer intelligence.

### Por qué importa (el dolor que resuelve)
- Trabajar con creadores manualmente es un caos: spreadsheets de deals, pagos manuales, atribución imposible de probar.
- Los tools externos (SparkLoop, AfterShip Commissions, Shopify Collabs) no se integran con el pixel propio ni con la data de clientes.
- El creador quiere ver su performance en un dashboard lindo, no un email de Excel al final del mes.

### Features concretos (hoy en producción)

#### Aura Inicio — `/aura/inicio`
7 zonas visuales:

1. **Saludo personalizado + Aurum pulse + period selector** (7d / 30d / 90d).
2. **Hero metrics**: revenue, orders, commissions, AOV, active creators.
3. **Hall of Flame**: podio top-3 creadores como trading cards con halo + sparkles.
4. **Pending actions tray**: aplicaciones para revisar, contenido para aprobar, campañas que cerrar, creadores silenciados.
5. **Campaigns in flight**: flight deck con progress bars vs bonus + ETA.
6. **Content Radar**: plataformas activas + top pieces por engagement + UGC reciente.
7. **Quick insights**: 4 rule-based (top creator, best campaign, viral content, alert).

Sistema monocromático champagne.

#### Creadores — `/aura/creadores`
- Lista con cards.
- Perfil individual con deals inline, campañas, pagos.
- **Applications pipeline**: `PENDING → APPROVED → REJECTED`.
- Aplicación pública: `/i/[slug]/apply`.
- Al aprobar → **auto-crea campaña "Always On"** + deal base con comisión default.

#### Campañas — `/aura/campanas`
- Lista + create + detail.
- **7 tipos de deal**:
  1. `COMMISSION` — porcentaje fijo sobre venta atribuida.
  2. `FLAT_FEE` — pago único por colaboración.
  3. `PERFORMANCE_BONUS` — bonus al superar X ventas.
  4. `TIERED_COMMISSION` — porcentajes distintos por rango de ventas.
  5. `CPM` — pago por cada 1000 impresiones.
  6. `GIFTING` — producto regalado sin comisión.
  7. `HYBRID` — combinación de los anteriores.

- **Constraint crítico**: solo 1 deal de comisión activo por creador (COMMISSION, TIERED_COMMISSION o HYBRID). Validado en API.
- Toggle **`excludeFromCommission`**: evita doble pago cuando un creador tiene comisión por UTM + cupón activo.
- **Attribution window customizable por creador**: 1-180 días, default 14.

#### Contenido — `/aura/contenido`
- Briefings CRUD con 6 tipos: `GENERAL`, `REEL`, `STORY`, `POST`, `UNBOXING`, `REVIEW`.
- Content approvals workflow.
- UGC Library (contenido generado por creadores).
- Product Seeding tracking: `PENDING → SHIPPED → DELIVERED → CONTENT_RECEIVED`.

#### Pagos — `/aura/pagos`
- Payouts multi-estado.
- Cálculo automático de comisión según tipo de deal.
- Tabla de payouts con filtros por período y creador.

#### Dashboard público del creador — `/i/[slug]/[code]`
- Protegido con password (SHA-256).
- Adapta el contenido al tipo de deal (un creador con COMMISSION ve revenue y comisiones; uno con FLAT_FEE ve KPIs de performance).
- Revenue, ventas, comisiones, AOV, best days, recent sales.
- Active campaigns table con progress.
- Cupones asignados.
- Creator Gradient aplicado: `#ff0080 → #a855f7 → #00d4ff`.
- **Email + view password** del dashboard desde el admin con un botón.
- Fallback + HTTPS upgrade automático para imágenes de producto.

#### UTM tracking
- Link de tracking auto-generado por creador:
  `?utm_source=influencer&utm_medium=referral&utm_campaign=[slug]`
- Conecta con NitroPixel: cada visita con ese UTM queda atribuida al creador correspondiente.

#### Emails (Resend)
- Aprobación de aplicación → email auto con credenciales y link al dashboard.
- Future: briefing assignments, payout ready, campaña nueva.

#### Visual
- **Creator Gradient**: `#ff0080 → #a855f7 → #00d4ff` (pink → violet → cyan).
- **Sidebar con mini-headers** agrupando sub-rutas: CREADORES / CAMPAÑAS / CONTENIDO / PAGOS.
- Holographic premium style.

#### Legacy naming
"Nitro Creators" fue el nombre anterior (sesiones 6-7). Desde sesión 31+ se unifica bajo **Aura**. Las rutas y la UI hoy dicen "Aura".

### Data points defensibles
- 7 tipos de deal (más que la mayoría de competidores).
- Campaña Always On auto-creada al aprobar (zero manual setup).
- Attribution window configurable 1-180 días por creador.
- `excludeFromCommission` como safeguard contra doble pago.
- Conexión nativa con NitroPixel (atribución vía UTM directo a tu pixel propio).
- Dashboards públicos adaptativos por tipo de deal.

### Para quién
Fundadores que trabajan (o quieren empezar) con micro-influencers, creadores de nicho, UGC creators, o programas de afiliados. Especialmente relevante para rubros con alta rotación de producto y componente emocional (moda, kids, belleza, alimentación).

### Cómo se pitch en una línea
"Desde una aplicación pública hasta el pago, Aura orquesta tu programa de creadores en la misma plataforma donde ya ves tus campañas y tu P&L. Un creador aplica hoy, al segundo ya tiene link de tracking y dashboard."

### Visión futura (backlog BP-006)
Transformar Aura de "módulo de una marca" a **marketplace multi-tenant**: cualquier cliente de cualquier tienda NitroSales puede aparecer como afiliado potencial. Crea efecto red: más tiendas = más ofertas = más afiliados = más ventas = más tiendas. Sería el "Shopify Collabs del ecommerce LATAM" pero con data real de comportamiento de compra en el core.

---

## Cómo se relacionan los 4 activos entre sí

Los 4 activos no son silos. Se alimentan entre ellos:

- **NitroPixel** captura el journey de cada visitante.
- **Bondly** toma los customers identificados de NitroPixel + órdenes de VTEX y produce LTV + churn + affinity.
- **Aura** usa UTM tracking + NitroPixel para atribuir ventas a creadores con precisión real.
- **Aurum** lee data de los 3 anteriores para razonar en lenguaje natural ("¿cuál es el LTV:CAC de mis creadores top vs Meta Ads?").

Este diagrama mental es clave cuando un prospect pregunta "¿por qué no usar solo uno?". La respuesta: **cada uno aumenta el valor de los otros**.

---

_Última revisión: 2026-04-18. Fuentes: CLAUDE_STATE.md sesiones 1-42, PROPUESTA_SIDEBAR_REORG.md, CORE-ATTRIBUTION.md, UI_VISION_NITROSALES.md, BACKLOG_PENDIENTES.md._
