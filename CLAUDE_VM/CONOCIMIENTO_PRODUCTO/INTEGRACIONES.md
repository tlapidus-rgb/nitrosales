# INTEGRACIONES.md — Catálogo de integraciones de NitroSales

> **Propósito**: Fuente única de verdad de qué integraciones existen, con qué profundidad, qué hacen y qué NO hacen. Este archivo contesta preguntas comerciales como "¿se conecta con X?" sin tener que improvisar.
>
> **Regla de honestidad**: si una integración no está en esta lista, no existe. Si existe pero es limitada, se dice claramente. Prometer integraciones inexistentes es el camino más rápido a perder un cliente beta.

---

## Mapa rápido

| Plataforma | Profundidad | Mecanismo | Estado |
|---|---|---|---|
| **VTEX** | Deep | Webhooks + Cron 1x/día 3am | Producción |
| **MercadoLibre** | Deep | OAuth2 + Webhooks + Cron 1x/día 2am | Producción |
| **Meta Ads** | Deep | On-demand + Custom Audiences v21 | Producción |
| **Google Ads** | Medium | On-demand + Customer Match v17 | Producción |
| **Google Analytics 4 (GA4)** | Medium | Cron 1x/día | Producción |
| **Google Search Console (GSC)** | Medium | Cron 1x/día 9am | Producción |
| **Anthropic (Claude)** | Core | API directa (Aurum, narrative engine) | Producción |
| **Resend** | Light | API directa para envío puntual | Producción |
| **AFIP** | Medium | API facturación electrónica + Mis Comprobantes | Producción |
| **dolarapi.com** | Light | API pública (tipo de cambio MEP/oficial) | Producción |
| **INDEC** | Light | API IPC para ajuste por inflación | Producción |

---

## Integraciones de canal (ecommerce)

### VTEX

**Qué hace la integración**:
- **Webhooks en tiempo real**: al crearse/modificarse una orden en VTEX, llega al pixel de NitroSales instantáneamente.
- **Cron diario a las 3am**: safety net que reconcilia por si algún webhook se perdió.
- **Sync de catálogo**: lee productos, SKUs, categorías, brands, suppliers, stock.
- **Sync de órdenes**: estados, items, cliente, dirección, pago, envío, totales.
- **Sync de clientes**: perfiles, historia de compras, contactabilidad.
- **SKU-first architecture**: un mismo SKU vendido en VTEX + ML aparece unificado.
- **Atribución cruzada**: las órdenes VTEX se cruzan con eventos de NitroPixel para saber de qué canal vinieron.

**Lo que el cliente necesita**:
- URL de la tienda VTEX (ej: `mundojuguete.com.ar`).
- App Key + App Token de VTEX (permisos de lectura + webhooks).
- Configurar los webhooks (se hace asistido en onboarding).

**Lo que NO hace** (por ahora):
- No escribe en VTEX (no modifica precios, no cambia stock, no actualiza productos).
- No es un conector bidireccional — es lectura + atribución.

**Diferenciador comercial**:
> "VTEX nativo con webhooks = atribución instantánea. No es un conector Zapier que corre cada 15 minutos. Cada click, cada venta, se procesa en segundos."

**Caso beta vigente**: tienda VTEX `mundojuguete` (El Mundo del Juguete / El Mundo del Bebé).

---

### MercadoLibre (ML)

**Qué hace la integración**:
- **OAuth2** para conectar la cuenta de seller.
- **Webhooks en tiempo real**: órdenes, publicaciones, preguntas, reclamos, cambios de precio.
- **Cron diario a las 2am**: safety net.
- **Sync de publicaciones**: título, precio, stock, status (activa/pausada), categoría ML, atributos.
- **Sync de órdenes ML**: estados específicos ML (pago acreditado, envío, entregado, cancelado, devuelto).
- **Sync de preguntas**: lista de preguntas pendientes y respondidas por publicación.
- **Sync de reputación**: color del vendedor, puntaje, reclamos abiertos.
- **Atribución**: cada orden ML se trackea separada de VTEX; se pueden comparar.

**Lo que el cliente necesita**:
- Una cuenta de seller de MercadoLibre activa.
- Autorizar vía OAuth2 (proceso de 1 click).

**Lo que NO hace** (por ahora):
- No responde preguntas automáticamente (solo las lee).
- No modifica publicaciones (precio, stock) desde NitroSales.
- No gestiona reclamos.

**Diferenciador comercial**:
> "Pocos dashboards miran ML con la profundidad de NitroSales. Leemos publicaciones, preguntas, reputación, no solo órdenes. Para un ecommerce argentino que vende fuerte en ML, esto es oro."

**Caso beta vigente**: cuenta ML de KAVOR S.A. (la razón social de El Mundo del Juguete).

**Historial importante** (lección de CLAUDE.md): hubo un incidente donde se perdieron 1600 órdenes ML por 6 días porque un fix del webhook estaba en staging pero main seguía con el código roto. Por eso el modelo de branches ahora es solo `main`. Esto NO hay que usarlo en conversación comercial — es lección interna.

---

## Integraciones de advertising (paid)

### Meta Ads (Facebook + Instagram)

**Qué hace la integración**:
- **On-demand**: al abrir `/campaigns/meta` se dispara un fetch si pasaron >30 min desde el último.
- **Sync de campañas + ad sets + ads**: spend, impressions, clicks, CTR, CPC, CPM, conversions, ROAS.
- **Sync de creativos**: imágenes, videos, copies, variants por ad.
- **Performance por placement**: Feed, Stories, Reels, etc.
- **Custom Audiences API v21**: permite crear audiencias en Meta desde un segmento de NitroPixel (ej: "carrito abandonado 7d") y sincronizarlas.
- **Atribución combinada**: se muestra la atribución de NitroPixel al lado de la de Meta para ver el gap.

**Lo que el cliente necesita**:
- Cuenta Business Manager de Meta.
- Permisos de acceso al Ad Account + pixel.
- Autorización OAuth.

**Lo que NO hace**:
- No crea campañas desde NitroSales (no es un ad manager).
- No edita budgets ni bids.
- No hace bidding automatizado.

**Diferenciador comercial**:
> "Lo que Meta te dice que vendiste y lo que vendiste de verdad son dos cosas distintas. NitroPixel + Meta Attribution side-by-side te muestra el gap."

---

### Google Ads

**Qué hace la integración**:
- **On-demand**: al abrir `/campaigns/google` se dispara un fetch si pasaron >30 min.
- **Sync de campañas + ad groups + keywords**: spend, impressions, clicks, CTR, CPC, conversions.
- **Search Terms Report**: los términos reales de búsqueda que dispararon los clicks.
- **Quality Score por keyword**.
- **Customer Match API v17**: sincronización de audiencias desde NitroPixel a Google.

**Lo que el cliente necesita**:
- Cuenta de Google Ads.
- Autorización OAuth.

**Lo que NO hace**:
- No crea campañas ni keywords.
- No edita bids.
- No es un smart bidding engine.

---

### Google Analytics 4 (GA4)

**Qué hace la integración**:
- **Cron diario**: sync de data de GA4.
- **Métricas core**: sessions, users, pageviews, conversiones, engagement.
- **Atribución orgánica**: separar tráfico orgánico de paid.
- **Complemento a NitroPixel**: para clientes que ya tienen GA4 instalado, se cruza data.

**Lo que NO hace**:
- No reemplaza a NitroPixel. GA4 es lectura complementaria.

**Diferenciador**: no es un diferenciador per se — es table stakes. Pero es importante mencionarlo porque muchos prospects preguntan.

---

### Google Search Console (GSC)

**Qué hace la integración**:
- **Cron diario a las 9am**.
- **Sync de search data**: impresiones, clicks, CTR, posición promedio.
- **Top queries** y **top pages**.
- **Comparativa período vs período**.
- **Alertas**: caída de impresiones o clicks en queries importantes.

**Lo que NO hace**:
- No hace on-page SEO audits (no es Ahrefs/Semrush).
- No hace backlink analysis.
- No sugiere keywords nuevas.

---

## Integración de IA

### Anthropic (Claude)

**Qué hace la integración**:
- **Aurum** (asistente conversacional): toda la conversación con el asistente va a Claude.
- **Narrative engine** (P&L Pulso): los bullets en lenguaje natural que resumen el estado del mes se generan con Claude.
- **3 modos de reasoning** en Aurum: Flash (rápido), Core (balanceado), Deep (profundo). Mapean a distintos modelos Claude.

**Lo que el cliente NO necesita hacer**: no tiene que tener API key propia. NitroSales provee la capa IA como parte del producto.

**Consideración comercial**: el costo de IA está incluido en el pricing (cuando se defina). No se cobra usage aparte. Ver `PRECIOS.md`.

**Diferenciador**:
> "La app piensa con Claude de Anthropic — el modelo con mejor razonamiento del mundo. Y lo hace en español nativo, sin traducir."

---

## Integración de messaging

### Resend

**Qué hace la integración**:
- **Envío de emails transaccionales** desde la app (alertas, reports, notificaciones).
- **API directa** — no es un ESP completo.

**Lo que NO hace**:
- No es Klaviyo. No tiene flujos de marketing, ni segmentación avanzada de email, ni templates visuales.
- Es solo el canal de envío de NitroSales.

**Nota comercial**: si el cliente tiene Klaviyo/Mailchimp/etc, no se reemplaza. Resend es para los emails del sistema.

---

## Integraciones de contexto argentino (exclusivas LATAM)

### AFIP (Administración Federal de Ingresos Públicos)

**Qué hace la integración**:
- **Facturación electrónica**: emite facturas/notas de crédito/débito cuando se habilita.
- **Mis Comprobantes**: lee el registro de comprobantes emitidos/recibidos.
- **IVA débito / IVA crédito / posición neta del mes**.
- **Alertas de vencimientos fiscales**.
- **Conciliación**: cruce entre revenue operativo (VTEX+ML) vs facturación AFIP para detectar gaps.

**Lo que el cliente necesita**:
- Certificado digital AFIP (o delegación de responsabilidad).
- CUIT y datos fiscales de la razón social.

**Lo que NO hace**:
- **No reemplaza al contador**. Es reconciliación y alertas, no contabilidad completa.
- No liquida impuestos. No es un ERP.

**Diferenciador comercial (BIG)**:
> "¿Conocés algún otro dashboard de ecommerce que te lea AFIP? No, no hay. Esto lo hacemos porque pensamos la app para Argentina desde el día uno."

---

### dolarapi.com

**Qué hace la integración**:
- **Fetch diario del tipo de cambio**: dólar oficial, MEP, CCL, blue.
- Alimenta el tri-currency toggle de la app.
- Permite calcular revenue en USD en tiempo real.

**Lo que el cliente NO necesita hacer**: nada. Es automático.

---

### INDEC (Instituto Nacional de Estadística y Censos)

**Qué hace la integración**:
- **Fetch del IPC** (índice de precios al consumidor).
- Permite ajustar ARS por inflación: el toggle "ARS ajustado" usa estos datos.
- Alimenta la narrativa de P&L ("tu crecimiento real es X% vs Y% nominal").

**Lo que el cliente NO necesita hacer**: nada. Es automático.

**Diferenciador comercial (BIG)**:
> "Podemos decirte cuánto creciste real, descontando inflación. Ningún dashboard USA puede. Ningún LATAM tampoco. Es cuenta de cabeza que nadie hace."

---

## Integraciones futuras (roadmap comercial)

**Importante**: si un prospect pregunta por estas, la respuesta es "está en roadmap, no tengo fecha confirmada". NO prometer timelines.

- **Shopify**: es la plataforma más grande del mundo. Para expansión USA/global es necesario. Sin fecha.
- **Amazon Marketplace**: marca argentina grande suele estar ahí también. Sin fecha.
- **TikTok Shop**: relevante cuando se active en Argentina. Sin fecha.
- **Tiendanube**: para captar el mid-market. Sin fecha.
- **WhatsApp Business API**: canal conversacional clave en LATAM. Sin fecha.
- **Bancos (transferencia automática de saldos)**: hoy es manual override en P&L. Sin fecha.
- **Rappi / PedidosYa**: si el cliente vende comida/retail en apps. Sin fecha.

---

## Cómo responder preguntas sobre integraciones en una demo

### Si preguntan "¿se conecta con X?" y X está en la lista
- Responder con confianza + profundidad de la integración.
- Mostrar la pantalla relevante si es demo en vivo.

### Si preguntan "¿se conecta con X?" y X NO está en la lista
- "Por ahora no. Lo tenemos [en roadmap / bajo evaluación / no planeado]. ¿Me contás para qué lo necesitás?" — la pregunta descubre el dolor real. A veces el dolor se resuelve con otra integración que sí tenemos.

### Si preguntan "¿cuánto tarda el setup?"
- VTEX + ML: 15-30 min con onboarding asistido.
- Meta + Google: 5 min cada uno (solo OAuth).
- AFIP: 1-2 días (requiere certificado digital y coordinación con contador).

### Si preguntan "¿quién hace el setup, yo o ustedes?"
- Onboarding asistido por nosotros (Tomy / equipo que se arme). No se deja solo al cliente.

---

## Notas para Claude VM

- **NUNCA prometas una integración que no está en la lista de producción.** Roadmap se menciona solo si se pregunta.
- Cuando un prospect da su stack, mapear directamente qué cubrimos y qué no.
- Si cubre todo su stack → listo para arrancar onboarding.
- Si falta algo importante → honesto: "hoy no lo tenemos, ¿podés usar [alternativa]?"
- Priorizar **profundidad** sobre **cantidad** en la narrativa: "sí, pero de verdad, con webhooks, con SKU-first" vence a "sí, tenemos 40 integraciones" (que es la línea de Zapier).
