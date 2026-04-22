# BACKLOG_PENDIENTES.md — Temas pendientes de NitroSales

> **Propósito**: tracker vivo de temas que Tomy decidió no abordar ahora, pero que quedan registrados para no perderlos. Claude lee este archivo al inicio de cada sesión junto con `CLAUDE.md`, `CLAUDE_STATE.md` y `ERRORES_CLAUDE_NO_REPETIR.md`.
>
> **Cómo funciona**:
> - Tomy puede pedirle a Claude que cargue un tema nuevo acá en cualquier momento.
> - Cada ítem tiene contexto, prioridad, estado, y cuándo entró al backlog.
> - Cuando un ítem se resuelve, se marca como `✅ resuelto` con la sesión y commit(s), y se archiva en la sección "Resueltos".
> - Cuando un ítem se descarta, se marca como `🗑 descartado` con la razón.
>
> **Última actualización**: 2026-04-22 — Sesión 55 CIERRE EXITOSO. Test end-to-end del backfill con credenciales reales: **12.437 órdenes en 4 min 9 seg** (vs 3.000 en 1 hora del motor viejo, ~64x más rápido). Onboarding listo para Arredo.

---

## ✅ BP-S55-001 — Test end-to-end EXITOSO (Sesión 55)

**Resuelto**: 2026-04-22 — varios commits cubriendo Aurum Onboarding + admin tools + backfill speed refactor.

**Resultado del test**:
- Aprobado 03:36:02 → Completado 03:40:11 = **4 min 9 seg**
- 12.437 órdenes procesadas correctamente, 0 errores
- Email "tu data está lista" llegó al cliente
- Overlay desbloqueado automáticamente al terminar
- Cliente entró al producto con data real

**3 fixes críticos al backfill** (commits `4162d5b`, `debd13b`, `73f0aca`, `8d6144f`):
1. Loop interno + trigger inmediato + cron 1min + chunks de 2000
2. Reusar mismo job en loop interno (esquivar cooldown legítimo de pickNextJob)
3. **Date-window pagination** para esquivar límite de 30 páginas de VTEX (este era el ROOT cause del problema histórico)
4. Pre-query para totalEstimate (barra de progreso correcta)

---

## 🔴 Prioridad ALTA — Próxima sesión (S56)

### BP-S56-001 — Auditoría completa de paginación + eficiencia en sync de TODAS las plataformas

**Entró al backlog**: 2026-04-22 (Sesión 55, pedido explícito de Tomy)
**Estado**: 📝 pendiente
**Contexto**: Hoy arreglamos el backfill de VTEX (date-window, loop, etc). Tomy preguntó si esto se puede replicar a las otras plataformas. La respuesta es SÍ pero requiere análisis dedicado.

**Qué hay que hacer**:
1. **Auditar BACKFILL** (lo que se trae históricamente al onboardear) por plataforma:
   - VTEX: ✅ resuelto en S55
   - MercadoLibre: ❌ stub (devuelve isComplete=true sin procesar). Implementar con date-window similar a VTEX (`/orders/search` con filtros por fecha)
   - Meta Ads: actualmente es "on-demand" cuando el user abre la página. Evaluar si necesita backfill explícito en onboarding
   - Google Ads: idem Meta, on-demand. Evaluar
   - GA4: cron diario, sin backfill explícito. Evaluar
   - GSC: cron diario, sin backfill explícito. Evaluar

2. **Auditar SYNC INCREMENTAL** (lo que se trae cada día) por plataforma:
   - Verificar que ninguna sufra el límite de paginación que tuvo VTEX
   - Identificar cuellos de botella de tiempo
   - Ver si vale agregar APIs bulk donde existan (Meta async insights, Google Ads streaming, MELI bulk endpoints)

3. **Aplicar patterns aprendidos donde corresponda**:
   - Date-window pagination cuando hay límite de páginas
   - Loop interno + trigger inmediato cuando hay sistema de jobs
   - Pre-query para totalEstimate cuando se necesita progress real

**Estimación**: 2-3 horas dedicadas (sesión completa).

**Importante**: NO tocar nada hasta que Tomy esté en sesión y apruebe. El sync actual de producción funciona y mantiene la data al día.

---

## 🟡 Prioridad MEDIA — Para cuando haya aire

### BP-S56-002 — Implementar processor real de MercadoLibre para backfill

**Entró al backlog**: 2026-04-22 (Sesión 55)
**Estado**: 📝 pendiente
**Contexto**: El dispatcher actual de ML (`src/lib/backfill/dispatcher.ts:14-21`) devuelve `isComplete: true` sin procesar nada. Funciona el sync incremental normal de ML pero NO trae histórico al hacer onboarding.

**Qué hay que hacer**: implementar `processMercadoLibreChunk` siguiendo el patrón de `processVtexChunk`. ML usa `/orders/search` con filtros por fecha y paginado, similar a VTEX.

**Cuándo**: cuando llegue un cliente que use ML como canal principal (no es bloqueante para Arredo que no usa ML).

---

## 🟡 Prioridad MEDIA — Centro de Control

### BP-S55-002 — Panel de "Activity log / Run history" en Centro de Control

**Entró al backlog**: 2026-04-22 (Sesión 55, pedido de Tomy durante el test)
**Estado**: 📝 pendiente
**Contexto**: La tabla `backfill_jobs` guarda el detalle de cada job con timestamps. Hoy esa info solo se ve por queries directas a DB o el endpoint `backfill-status`.

**Qué hay que hacer**: agregar página `/control/activity` que muestre log histórico de:
- Backfills (de tabla `backfill_jobs`)
- Syncs incrementales (con timestamps, items procesados, errores)
- Webhooks recibidos (VTEX, ML, etc)
- Inspirado en "Activity log" de Stripe/Segment

---

## ✅ Pre-onboarding Arredo — COMPLETADO (Sesión 53)

Los 4 pendientes de la auditoría multi-tenant quedaron cerrados. **La plataforma está lista para onboardear Arredo.**

### BP-MT-001 — Cron ML-sync: iterar TODAS las orgs activas
**Resuelto**: 2026-04-20 (Sesión 53) — commit `c215039`
**Qué se hizo**: Refactor de `api/cron/ml-sync/route.ts` con helper `syncOneOrg(orgId, connId)`. Handler ahora itera todas las conns ML ACTIVE con fail-soft por org. Resultado per-org en el response.

### BP-MT-002 — Schema `user_alert_favorites` y `user_alert_reads` con `organizationId`
**Resuelto**: 2026-04-20 (Sesión 53) — commit `37b60eb`
**Qué se hizo**:
- Endpoint `/api/admin/migrate-alert-favs-reads-orgid` agregó columna `organizationId` + FK CASCADE + index
- Backfill: 0 rows en favorites, 4 rows en reads
- UNIQUE viejo `(userId, alertId)` reemplazado por `(userId, alertId, organizationId)`
- `alerts/favorite` + `alerts/read` + `lib/alerts/alert-hub.ts` actualizados para filtrar por orgId

### BP-MT-003 — STORE_URL multi-tenant
**Resuelto**: 2026-04-20 (Sesión 53) — commit `ed5a155`
**Qué se hizo**:
- 8 endpoints migrados a `getStoreUrl(orgId)` (helper ya existía)
- API `/api/settings/organization` GET/PUT acepta `storeUrl`
- UI `/settings/organizacion`: input "URL de tu tienda" + Organization ID visible read-only con botón Copiar
- Bug fix bonus: `aura/creators/[id]/send-password` tenía `STORE_URL` como fallback del APP URL (mal) + hardcode "elmundodeljuguete" en slug. Ambos arreglados.
- Tomy seteó storeUrl de MdJ vía UI post-deploy

### BP-MT-OPS-001 — Reconfigurar webhook VTEX con `?org=<mdjOrgId>`
**Resuelto**: 2026-04-20 (Sesión 53) — operación en VTEX prod vía API
**Qué se hizo**:
- Inventory webhook: Tomy actualizó manualmente en VTEX Admin → Afiliados → NSL
- Orders webhook: descubrimos que estaba configurado vía `/api/orders/hook/config` (API-only, no UI en VTEX). Ejecutamos POST con la URL actualizada (`&org=cmmmga1uq0000sb43w0krvvys`) tras dry-run de validación.
- Verificación end-to-end: orden REAL `1626321512569-01` procesada correctamente via URL nueva en 785ms (items, productos, customer, pixelAttribution OK).

**Aprendizaje clave** (agregado a MEMORY.md): los "Afiliados" en VTEX Admin NO cubren todos los hooks. El Orders Broadcaster es API-only. Para futuros onboardings, siempre chequear `/api/orders/hook/config` vía API, no solo la UI de Afiliados.

---

## 🔴 Prioridad CRÍTICA

### BP-001 — pLTV predictivo: rails de sanidad + capa contextual con IA

**Entró al backlog**: 2026-04-17 (Sesión 40)
**Estado**: 📝 pendiente
**Trigger**: bug encontrado en el rediseño Bondly LTV. Cliente Ariel Lizárraga (2 compras en 4 días, gasto total $157k) aparece en el top con pLTV 365d = $4.874.306 y 54% de confianza. Imposible defenderlo frente a un usuario no-técnico.

**Diagnóstico**:
- BG/NBD + Gamma-Gamma extrapola la frecuencia observada (0,5 compras/día con 4 días de historia) a 365 días sin piso de antigüedad mínima.
- El modelo es matemáticamente correcto para el input recibido, pero el input es inadecuado para clientes con T < 30 días.
- Probablemente el 15-30% de los clientes del top-N ranking actual están inflados por este efecto.
- Ver `ERRORES_CLAUDE_NO_REPETIR.md` → Error #S40-MODELO-SIN-BARANDAS para regla completa.

**Plan por fases** (acordado con Tomy en Sesión 40):

#### Fase 1 — Rails de sanidad (esta es la que arregla el bug visible)

Cambios en `/api/ltv/predict`:
1. **Piso de antigüedad**: si `T < 30 días` → NO usar BG/NBD. Fallback a promedio del segmento × factor de retención del canal.
2. **Cap duro**: `pLTV_365 ≤ avgTicket × freqP95_segmento × 365`. Si BG/NBD supera el cap, truncar.
3. **Confianza recalibrada**: `confianza_final = min(confianza_modelo, f(T))` con `f(T<30)=20%, f(T<90)=50%, f(T<180)=75%, f(T≥180)=modelo_raw`.
4. **Badge "Cliente nuevo"** en la UI cuando se usó el fallback, con texto explicativo "Historia insuficiente · usando promedio del segmento".
5. **Filtro default del Top-N ranking**: excluir T < 30 días, con toggle "Incluir clientes nuevos".

Esfuerzo: 1-2 commits. Impacto: arregla el bug visible de credibilidad. **No toca la matemática de BG/NBD**, solo agrega barandas alrededor.

#### Fase 2 — Capa contextual con IA (Claude Haiku)

Arquitectura de 5 capas:
1. **Capa de piso** (de Fase 1): hard rules + caps. Defensa contra ridículos.
2. **Capa estadística**: BG/NBD intacto, solo activa con T ≥ 30 días.
3. **Capa contextual (nueva)**: Claude Haiku recibe por cliente:
   - Perfil (productos, categorías, ticket, T, frecuencia, canal, ciudad, segmento).
   - Benchmark del segmento (promedio y p75 de clientes similares con 180+ días).
   - Macro del momento: inflación esperada (BCRA REM), ICC (Di Tella), calendario de tentpoles (Día del Niño, Black Friday, Navidad, inicio escolar).
   - Señales de NitroPixel: frecuencia de visita post-compra, engagement con email.
   Devuelve: `{p90d, p365d, confidence, reasoning_bullets[], intent_archetype}`.
4. **Capa de ensamble**: blending por T:
   - T < 30 → 85% contextual + 15% segmento (BG/NBD OFF).
   - 30 ≤ T < 180 → 40% BG/NBD + 50% contextual + 10% lookalike.
   - T ≥ 180 → 60% BG/NBD + 30% contextual + 10% lookalike.
5. **Capa UI**: mostrar ensemble value + reasoning text + breakdown colapsable de aporte de cada capa + confidence ring recalibrado.

Costo estimado: ~$7-15/mes en API calls (top-50 diario o top-1000 semanal). Precomputar en cron de las 3am → tabla `ltv_predictions` → dashboard solo hace SELECT.

Esfuerzo: 3-4 semanas.

#### Fase 3 — Drift monitor + feedback loop (mes 2-3)

- Comparar predicciones de hace 3/6/12 meses con lo que realmente pasó.
- Calcular MAE (mean absolute error) mensual y alertar si sube > X%.
- Dashboard interno de salud del modelo.
- Retrain cron trimestral.

Esfuerzo: 1-2 semanas.

#### Fase 4 — XGBoost especializado (mes 12-18+)

Solo cuando haya 3.000-5.000 clientes con ≥ 12 meses de historia digital madura. Entonces se entrena un modelo gradient-boosted sobre cohortes recientes y reemplaza parcialmente la Capa 3 contextual para clientes con historia suficiente. Los nuevos siguen usando Claude Haiku.

Requisitos previos:
- Tener Fases 1-3 funcionando.
- Volcar 5 años de data del retail Mundo del Juguete como **base de conocimiento y benchmarks** (NO como training data cruda — domain shift es real).
- Feature engineering: 30-50 features por cliente.
- Infra: entrenamiento en notebook/Colab + predicciones precomputadas en cron.

Esfuerzo: 4-6 semanas cuando llegue el momento.

**Data del retail Mundo del Juguete (aporte de Tomy en Sesión 40)**:
- 45 años de historia de clientes físicos.
- Útil como **contexto**, no como training data directo (cambió el negocio, los canales, el mix de productos).
- Transferible: arquetipos familiares (abuela regaladora, mamá con hijos, comprador impulso), estacionalidad cultural argentina, afinidades de categoría por edad del niño, geografía socioeconómica.
- No transferible: frecuencias absolutas, canales de adquisición, sensibilidad a cuotas, mix de productos actual.

**Decisión de Tomy (Sesión 40)**: avanzar Fase 1 cuando se retome el tema, no ahora. La Fase 2 se revisa con documento aparte antes de implementar.

**Actualización de ambición (Sesión 40, segundo pase)**: Tomy explícitamente dice que quiere "implementar el más potente para que NitroSales sea más robusto". O sea, la ambición explícita del ítem es ejecutar **las 4 fases completas** y posicionar este módulo como **la versión más robusta de pLTV predictivo del ecommerce argentino**. No limitarse a Fase 1. Cuando llegue el momento, se abre documento de arquitectura detallado con:

- Fases 1-3 implementadas en secuencia como ruta crítica.
- Fase 4 planificada con checkpoints claros de "¿ya tenemos data madura suficiente?" (criterio: 3-5k clientes con ≥12 meses de historia digital limpia).
- Uso completo del retail Mundo del Juguete como base de conocimiento (no training): arquetipos, benchmarks, curvas estacionales, grafo de afinidades por edad del niño.
- Señales externas dinámicas integradas al prompt de la capa contextual: Google Trends por IP/categoría, calendario cinematográfico infantil, TikTok trends, macro INDEC/BCRA/Di Tella, calendario escolar, paritarias, aguinaldos, clima, tipo de cambio, competencia MELI.
- Reasoning text expuesto en la ficha del cliente (auditable) + badges de archetype (regalo único / reponedor frecuente / estacional / heavy user / comprador impulso).
- Drift monitor con alertas automáticas en Slack/email cuando MAE sube sobre threshold.
- Posible API propia (`/api/ltv/predict/v2`) para que agencias/partners puedan consumir predicciones con cliente autorizado. Diferenciador comercial.

---

## 🟡 Prioridad ALTA

### BP-005 — Motor de mensajería multi-canal hiperpersonalizada (push + email + WhatsApp) alimentado por NitroPixel

**Entró al backlog**: 2026-04-17 (Sesión 40)
**Estado**: 📝 pendiente
**Trigger**: idea estratégica de Tomy. Activar el valor de NitroPixel convirtiendo sus señales de comportamiento en mensajes accionables que impacten ventas en tiempo real.

**Concepto**:
Un sistema de triggers que escucha en tiempo real las señales de comportamiento que NitroPixel captura —productos vistos, carrito abandonado, tiempo en página, intent score behavioral, recencia de visita, categorías de interés, scoring, etapa del funnel— y dispara mensajes **altamente personalizados** a través de 3 canales: push notifications web, email y WhatsApp. La diferencia con "email marketing tradicional" es que la personalización es **cliente → mensaje único**, no segmento → blast.

**Casos de uso concretos**:
- **Abandono de carrito inteligente**: WhatsApp si el cliente abrió un WhatsApp en los últimos 7 días, email si no. Mensaje menciona el producto específico + cuánto tiempo hace que lo vio + intent score ("parece que te interesó mucho").
- **Reposición predictiva**: si el cliente compró un producto de consumo repetitivo hace X días (pañales, pilas, etc.), dispara recordatorio en el canal de mayor engagement histórico.
- **Noticia de producto que miró**: si un producto que el cliente vio 3+ veces tiene stock bajo / vuelve al stock / baja de precio → push notification con deep link.
- **Win-back contextual**: cliente con behavioral score cayendo + antigüedad >60d sin compra → mensaje con el "archetype" identificado (regalo único vs. reponedor vs. estacional) y oferta ajustada.
- **Bienvenida behavioral**: nuevo visitante identificado, mensaje de onboarding diferente según categorías visitadas y hora del día.
- **Lanzamiento segmentado**: producto nuevo solo se anuncia a usuarios cuya historia behavioral predice interés real (no blast masivo).

**Requisitos técnicos** (high level):
- Orquestador de triggers (evaluación en tiempo real o near-real-time via cron de 5-10 min).
- Rules engine: condiciones compuestas (IF behavioral_score > 70 AND last_visit > 3d AND category_interest = 'juguetes_educativos' THEN dispara trigger X).
- Proveedores:
  - Web push: navegador nativo + service worker (gratis, sin proveedor externo).
  - Email: SendGrid / Resend / Postmark.
  - WhatsApp: WhatsApp Business API (Meta directo o via 360dialog / Twilio). Requiere templates aprobados.
- Templates dinámicos con merge fields por cliente (productos vistos, última visita, score, archetype).
- Consent & opt-out management por canal (fundamental para WhatsApp y legal por Ley 25.326).
- Frecuencia capping: no más de N mensajes por cliente por día / semana para evitar fatiga.
- Attribution: trackear qué trigger generó qué venta vía UTM + cookie matching.
- Dashboard operativo: volumen enviado / abierto / click / convertido por trigger, por canal, por arquetipo.
- Integración con Bondly Segmentos y Aura (los mismos clientes identificados).

**Por qué tiene sentido ahora**:
- NitroPixel ya captura las señales (implementado en sesiones 37-39).
- Bondly ya identifica clientes y scoring behavioral (sesión 40).
- El motor convierte datos observados → plata, que es la razón existencial de todo el stack.
- WhatsApp tiene tasas de apertura de 95%+ en Argentina — canal dominante para ecommerce retail.

**Skills relevantes para cuando se implemente**: `channels-whatsapp`, `email-automations`, `segmentation-clv`, `backend-api`, `gtm-master`, `legal-compliance` (consent).

**Riesgos/consideraciones**:
- **Fatiga de canal**: si se abusa, el cliente bloquea push/WhatsApp y se pierde el canal para siempre. Frecuencia capping es mandatorio.
- **Costos de WhatsApp**: la API cobra por conversación iniciada (~$0,05-0,15 por conversación en AR). Hay que calcular unit economics del trigger.
- **Compliance**: WhatsApp Business exige opt-in explícito + templates pre-aprobados + ventana de 24h para mensajes no-template. La implementación tiene burocracia.
- **Personalización genuina vs. creepy**: un mensaje que diga "vimos que viste esto 3 veces" es transparente. Uno que implique tracking sin decirlo es inquietante. Balance.

**Ambición**: motor nivel Klaviyo/Braze pero nativo a NitroSales, alimentado por NitroPixel (que un Klaviyo no tiene) y Bondly scoring. Diferencial competitivo fuerte.

---

### BP-006 — Aura como marketplace de afiliados cross-NitroSales (efecto red entre tiendas de la red)

**Entró al backlog**: 2026-04-17 (Sesión 40)
**Estado**: 📝 pendiente
**Trigger**: idea estratégica de Tomy. Transformar Aura de "módulo de creator economy de una marca" a "backbone de afiliación de toda la red NitroSales".

**Concepto**:
Hoy Aura vive dentro de una marca: cada tenant tiene sus propios creadores, campañas y deals aislados. La propuesta es abrirlo a marketplace multi-tenant donde:

- **Cualquier cliente** de cualquier tienda que use NitroSales aparece automáticamente en Aura como **afiliado potencial** (previa opción de opt-in obviamente).
- **Del lado oferta**: cada marca publica sus campañas de afiliación con comisiones, ventana de atribución, términos, y requisitos mínimos (ej: "solo para afiliados con score >70").
- **Del lado demanda**: creadores + clientes recurrentes + afiliados eligibles aplican y se matchean con marcas relevantes a su perfil (categoría de consumo, geografía, reach social si lo declaran, trust score interno).
- Aura deja de ser módulo cerrado → se vuelve el **sistema nervioso de afiliación de toda la red NitroSales**.

**Cómo crea efecto red**:
- Cada nueva tienda que se suma a NitroSales **aporta oferta** (campañas) + **aporta demanda** (su base de clientes como afiliados potenciales).
- Más tiendas = más ofertas para los afiliados = más afiliados activos = más ventas para todas las tiendas = más tiendas quieren entrar.
- Clásico two-sided marketplace con flywheel positivo.
- Diferencial contra plataformas genéricas (ShareASale, Impact): la data del comportamiento de compra real (vía NitroPixel + histórico de orders) hace que el matching sea muchísimo más preciso que un formulario de "me interesa la categoría X".

**Ejemplos de uso**:
- Cliente VIP de Mundo del Juguete que compra muñecos mensualmente aparece como afiliado recomendado para una marca nueva de accesorios de muñecas que entró a NitroSales.
- Creador ya activo en una marca puede aplicar a 5 campañas más de marcas complementarias sin pasar por otra curva de alta.
- Una marca chica que entra nueva a la red arranca con acceso a la base completa de afiliados activos (no tiene que empezar a construir audiencia desde cero).

**Requisitos técnicos** (high level):
- **Modelo multi-tenant real en Aura**: hoy `creatorId` vive bajo `organizationId`. Hay que agregar la noción de "afiliado global de la red" que puede operar contra múltiples `organizationId`.
- **Consent cross-tenant**: cada cliente de tenant A debe consentir que aparezca en Aura como afiliado potencial visible a otros tenants (GDPR-ish / Ley 25.326 requirement).
- **Matching engine**: recomendador que empareje afiliados con campañas según afinidad de categoría, historial de conversión, tamaño de audiencia declarado, geografía, arquetipo.
- **Browsing de campañas estilo marketplace**: UI donde un afiliado ve campañas disponibles, filtros por comisión/categoría/marca.
- **Dashboard de afiliado global**: el afiliado ve TODAS las campañas activas suyas en una sola vista, no tenant por tenant.
- **Liquidación cross-tenant**: un afiliado recibe payouts de múltiples tenants, posiblemente con estructuras fiscales distintas. Hay que modelar bien.
- **Trust score interno**: para evitar fraude / fake conversions, score de reputación basado en histórico de cumplimiento, tasa de conversión real, tasa de contracargo, etc.
- **Attribution cross-domain**: cookie / fingerprint / deterministic matching (email) para trackear conversions que cruzan de tienda A (donde el afiliado promociona) a tienda B (donde se concreta), sin romper atribución.
- **Dispute resolution**: marco para resolver conflictos de atribución entre marcas cuando 2 afiliados reclaman la misma venta.

**Por qué tiene sentido ahora**:
- Aura ya tiene la base de creator economy (sesiones 31-36).
- Bondly ya identifica y scorea clientes (sesión 40).
- El paso natural es abrir la puerta entre módulos y entre tenants.
- Un afiliado que conoce una marca porque fue su cliente probablemente la vende mejor que un desconocido con seguidores.

**Skills relevantes para cuando se implemente**: `loyalty-referral`, `marketplace-master`, `legal-compliance`, `backend-api`, `database-infra` (multi-tenant schema).

**Riesgos/consideraciones**:
- **Fricción de consent**: clientes pueden ver "querés ser afiliado de otras marcas" como invasivo. Propuesta de valor y UI de opt-in tienen que ser muy claras.
- **Competencia interna**: si 2 tiendas compiten en la misma categoría, ¿pueden verse los afiliados entre sí? Necesita reglas de exclusividad opcional por categoría o a criterio de la marca origen.
- **Escalabilidad de liquidación**: cuando haya 100+ tenants x 1000+ afiliados x múltiples monedas/AFIP, el módulo de payouts se pone complejo. Planear arquitectura desde el día 1.
- **Quality control**: afiliados con mal desempeño bajan la percepción de la red entera. Sistema de rating + baja automática requerido.
- **Pricing del feature**: ¿cobra NitroSales una comisión sobre comisiones? ¿Es gratis y se monetiza vía otros módulos? Decisión estratégica importante.

**Ambición**: volver a NitroSales el **"Shopify Collabs" del ecommerce LATAM** pero con data de comportamiento real en el core. Moat muy fuerte — cuanto más grande la red, más difícil de replicar.

---

## 🟢 Prioridad MEDIA

### BP-007 — Permisos granulares por tipo de dato dentro de cada sección (sub-permisos)

**Entró al backlog**: 2026-04-19 (Sesión 48 — fase Permisos / enforcement)
**Estado**: 📝 pendiente
**Trigger**: Tomy planteó caso real: "un analista de ecommerce entra a /productos para ver qué vende, pero NO debería ver márgenes ni costos". Sistema actual de permisos es binario por sección: ve toda la sección o no la ve.

**Contexto**:
- Hoy (commit `4ef1a52`) cada sección tiene 1 permiso con 4 niveles (none/read/write/admin). Funciona bien pero no separa data sensible de data operativa dentro de la misma página.
- Casos reales que aparecerán:
  - Analista de ecommerce ve productos pero NO márgenes/costos.
  - Contador externo ve Fiscal y Costos pero NO márgenes estratégicos.
  - Marketing manager ve Campañas (ROAS, spend) pero NO costos COGS del producto.
  - Jefe de ventas ve Órdenes (totales, clientes) pero NO márgen por orden.

**Opción acordada con Tomy (Opción B)**: sub-permisos por tipo de dato.
- Dividir secciones en sub-secciones lógicas:
  - `products` → `products_basico` (catálogo, SKU, stock, ventas unitarias) + `products_financiero` (costos, márgenes, rentabilidad)
  - `orders` → `orders_basico` (totales, clientes, productos) + `orders_financiero` (márgen, comisiones detalladas)
  - `bondly_clientes` → `bondly_basico` (contacto, compras) + `bondly_financiero` (LTV, revenue acumulado)
  - `campaigns` → `campaigns_basico` (spend, impresiones) + `campaigns_financiero` (ROAS, márgen por campaña)
- La matriz de permisos suma ~5-8 columnas nuevas.
- Cada card/columna sensible se envuelve con `<PermissionGate section="products_financiero" level="read">`.

**Esfuerzo estimado**: 2-3 sesiones.

**Cuándo implementarlo**: cuando algún cliente real (Arredo, TV Compras o posteriores) pida específicamente este nivel de control. No antes. Mientras tanto, si no querés que alguien vea márgenes → no le das acceso a Productos. Punto.

**Opción descartada**: field-level permissions completo (cada columna/card con permiso individual tipo Salesforce). Overkill para <30 personas por org. Se reconsiderará cuando haya 10+ clientes pagando con auditoría formal.

---



### BP-002 — `/bondly/audiencias` sin contenido

**Entró al backlog**: 2026-04-17 (Sesión 40)
**Estado**: 📝 pendiente
**Contexto**: la ruta existe en el sidebar de Bondly desde Fase 1, pero la página todavía no tiene contenido. Es la próxima sección natural del rediseño Bondly después de LTV. Debería incluir: builder de audiencias con reglas (gasto, recencia, productos, segmento, LTV tier), preview con contador, export a Meta/Google CRM lists, segmentos predefinidos (VIP, en riesgo, cart abandoners, etc.), sincronización automática.

### BP-003 — Row expansions en tabla de cohortes de LTV

**Entró al backlog**: 2026-04-17 (Sesión 40)
**Estado**: 📝 pendiente
**Contexto**: la tabla de retención por cohorte en `/bondly/ltv` muestra porcentajes por mes. Click en celda debería expandir fila mostrando el drill de clientes de ese cohorte con comportamiento de retención individual. Útil para investigar por qué un cohorte específico (ej: diciembre 2024) tiene retención anómala.

### BP-004 — Cursor pagination en Behavioral Explorer feed

**Entró al backlog**: 2026-04-17 (Sesión 40)
**Estado**: 📝 pendiente
**Contexto**: el Behavioral LTV Explorer en `/bondly/ltv` muestra visitantes pixel scoreados. Hoy está limitado a un paginado básico. Cuando la base de visitantes crezca (>50k), el endpoint puede volverse lento. Migrar a cursor pagination (`id > lastSeenId LIMIT N`) cuando sea necesario.

---

## 🔵 Prioridad BAJA (nice-to-have)

_(vacío por ahora)_

---

## ✅ Resueltos

_(vacío por ahora — cuando un ítem se resuelva, mover acá con fecha, sesión y commit)_

---

## 🗑 Descartados

_(vacío por ahora — cuando un ítem se descarte, mover acá con razón)_

---

## Notas de uso para Claude

- **Al inicio de cada sesión**: leer este archivo junto con los otros tres obligatorios (`CLAUDE.md`, `CLAUDE_STATE.md`, `ERRORES_CLAUDE_NO_REPETIR.md`).
- **Cuando Tomy pida "agregar un pendiente"**: agregar un nuevo ítem con ID correlativo (`BP-XXX`), prioridad, estado, fecha de entrada y contexto. No inventar prioridad — preguntar si no queda clara del mensaje.
- **Cuando Tomy pida "resolver un pendiente" o lo hagamos juntos**: actualizar el estado, mover al bloque "Resueltos" con fecha/sesión/commit(s).
- **Cuando Tomy pida "descartar un pendiente"**: mover al bloque "Descartados" con la razón.
- **Al cierre de sesión**: si surgieron cosas "para después" durante el trabajo, proponerlas a Tomy para agregarlas acá (no auto-agregarlas sin consulta).
- **No duplicar**: si un tema ya está en `CLAUDE_STATE.md` → sección "Pendientes / backlog" de alguna sesión, hacer match acá con el ID correspondiente para evitar que vivan en dos lados.
