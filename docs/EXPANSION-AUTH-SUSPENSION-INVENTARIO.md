# Superficie de autenticación para suspensión — 2026-09-29

Inventario estático generado mediante TypeScript AST: imports de auth-guard y llamadas directas en route.ts. No cuenta comentarios. No prueba autorización completa, llamadas dinámicas ni caminos transitivos.

Resultado: 170 archivos y 243 llamadas directas. La cifra histórica de 251 menciones no equivale a rutas ni a llamadas ejecutables.

## Hallazgos revisados manualmente

- auth-guard conserva el fallback a la única organización sin sesión. Por eso filtrar la sesión sin retirar ese fallback no permite afirmar bloqueo de acceso. Ambos cambios globales permanecen sin aplicar por el rechazo de revisión automática.
- No se encontraron llamadas directas al guard dentro de api/cron ni api/webhooks. Eso no demuestra independencia: los crons pueden llamar a otras rutas por HTTP.
- api/sync/trigger resolvía una organización pero llamaba a Meta/Google sin enviarla. Corregido localmente: organizationId proviene del guard, se codifica con URLSearchParams y se conserva el destino de selfFetchBaseUrl. Las rutas receptoras ya admiten ese parámetro. Se agregan headers de protección del propio preview; no se envían cookies del cliente.
- api/sync/meta y api/sync/google-ads admiten una organización explícita tras validar su clave interna; api/sync/reconcile y api/sync/vtex admiten org. Mantener estas ramas de ingesta al cambiar el guard; comprobar otros llamadores antes de retirar compatibilidad.
- middleware usa getToken en Edge; no vuelve a leer el estado de organización. El diseño propuesto debe controlar las sesiones Node y datos protegidos: cambiar sólo el JWT al login no alcanza para sesiones existentes.
- control/layout usa isInternalUser: conservar staff real y view-as para soporte. Una sesión que impersona al cliente debe recibir el bloqueo del cliente.
- onboarding/layout es público. No debe quedar detrás de un bloqueo general del shell; revisar separadamente autorización y tokens de cada API de onboarding.

## Matriz previa a activar el cambio global

Cliente activo/suspendido/reactivado con el mismo JWT; org inexistente; consulta fallida; settings inválidos; identidad staff real; view-as; impersonación; cierre de sesión; respuestas de APIs; fallback single-org sin sesión; llamadas internas con clave y org explícita. Medir además el costo por petición y recorrer un preview con base aislada. Este documento no declara esas pruebas realizadas.

## Archivos por área

| Área | Archivos |
| --- | --- |
| admin | 3 |
| alertas | 1 |
| alerts | 5 |
| audiences | 2 |
| aura | 33 |
| aurum | 2 |
| auth | 1 |
| bondly | 8 |
| chat | 1 |
| competitors | 5 |
| connectors | 1 |
| dashboard | 1 |
| finance | 16 |
| finanzas | 2 |
| influencers | 14 |
| insights | 1 |
| ltv | 2 |
| me | 5 |
| memory | 2 |
| mercadolibre | 4 |
| metrics | 32 |
| nitropixel | 3 |
| onboarding | 1 |
| settings | 11 |
| sync | 14 |

## Llamadas directas

| Archivo | Función:línea |
| --- | --- |
| src/app/api/admin/aura-resend-onboarding/route.ts | getOrganization:48 |
| src/app/api/admin/channel-rules/route.ts | getOrganizationId:40 |
| src/app/api/admin/channels-breakdown/route.ts | getOrganizationId:48 |
| src/app/api/alertas/route.ts | getOrganizationId:21, getOrganizationId:64 |
| src/app/api/alerts/favorite/route.ts | getOrganizationId:61, getOrganizationId:102 |
| src/app/api/alerts/read/route.ts | getOrganizationId:90, getOrganizationId:143 |
| src/app/api/alerts/route.ts | tryGetOrganizationId:45 |
| src/app/api/alerts/rules/preview/route.ts | getOrganizationId:27 |
| src/app/api/alerts/rules/route.ts | getOrganizationId:25, getOrganizationId:76, getOrganizationId:120, getOrganizationId:185 |
| src/app/api/audiences/route.ts | getOrganizationId:20, getOrganizationId:88, getOrganizationId:157, getOrganizationId:203 |
| src/app/api/audiences/sync/route.ts | getOrganizationId:21 |
| src/app/api/aura/applications/[id]/route.ts | getOrganization:30 |
| src/app/api/aura/applications/list/route.ts | getOrganization:17 |
| src/app/api/aura/briefings/[id]/route.ts | getOrganization:20, getOrganization:96, getOrganization:181 |
| src/app/api/aura/briefings/list/route.ts | getOrganization:17 |
| src/app/api/aura/briefings/route.ts | getOrganization:17 |
| src/app/api/aura/campaigns/[id]/route.ts | getOrganization:24, getOrganization:267, getOrganization:358 |
| src/app/api/aura/campaigns/in-flight/route.ts | getOrganization:24 |
| src/app/api/aura/campaigns/list/route.ts | getOrganization:28 |
| src/app/api/aura/campaigns/route.ts | getOrganization:21 |
| src/app/api/aura/content/radar/route.ts | getOrganization:60 |
| src/app/api/aura/creators/[id]/balance/route.ts | getOrganization:20 |
| src/app/api/aura/creators/[id]/orders/[orderId]/route.ts | getOrganization:28 |
| src/app/api/aura/creators/[id]/payments/route.ts | getOrganization:28 |
| src/app/api/aura/creators/[id]/route.ts | getOrganization:35, getOrganization:438 |
| src/app/api/aura/creators/[id]/send-password/route.ts | getOrganizationIdStrict:44 |
| src/app/api/aura/creators/[id]/settle/route.ts | getOrganization:35 |
| src/app/api/aura/creators/list/route.ts | getOrganization:53 |
| src/app/api/aura/creators/pending-list/route.ts | getOrganization:31 |
| src/app/api/aura/creators/route.ts | getOrganization:26 |
| src/app/api/aura/creators/simple/route.ts | getOrganization:12 |
| src/app/api/aura/deals/list/route.ts | getOrganization:15 |
| src/app/api/aura/deals/route.ts | getOrganization:31 |
| src/app/api/aura/inbox/route.ts | getOrganization:24 |
| src/app/api/aura/insights/route.ts | getOrganization:65 |
| src/app/api/aura/metrics/hero/route.ts | getOrganization:57 |
| src/app/api/aura/metrics/podium/route.ts | getOrganization:39 |
| src/app/api/aura/payouts/[id]/route.ts | getOrganization:22, getOrganization:41, getOrganization:138 |
| src/app/api/aura/payouts/auto-generate/route.ts | getOrganization:62 |
| src/app/api/aura/payouts/list/route.ts | getOrganization:17 |
| src/app/api/aura/payouts/route.ts | getOrganization:20 |
| src/app/api/aura/pulse/route.ts | getOrganization:74 |
| src/app/api/aura/submissions/[id]/route.ts | getOrganization:19, getOrganization:97 |
| src/app/api/aura/submissions/list/route.ts | getOrganization:17 |
| src/app/api/aurum/context-autodetect/route.ts | getOrganization:100 |
| src/app/api/aurum/section-insight/route.ts | getOrganization:113 |
| src/app/api/auth/mercadolibre/callback/route.ts | tryGetOrganizationId:81 |
| src/app/api/bondly/behavioral-ltv/route.ts | getOrganizationId:80 |
| src/app/api/bondly/churn-risk/route.ts | getOrganizationId:95 |
| src/app/api/bondly/clientes/[id]/route.ts | getOrganizationId:86 |
| src/app/api/bondly/clientes/route.ts | getOrganizationId:138 |
| src/app/api/bondly/customer-journey/[customerId]/route.ts | getOrganizationId:76 |
| src/app/api/bondly/ltv-insights/route.ts | getOrganizationId:85 |
| src/app/api/bondly/pulse/route.ts | getOrganizationId:71 |
| src/app/api/bondly/senales/route.ts | getOrganizationId:186 |
| src/app/api/chat/route.ts | getOrganization:285 |
| src/app/api/competitors/ads/route.ts | getOrganization:17 |
| src/app/api/competitors/ads/sync/route.ts | getOrganization:21 |
| src/app/api/competitors/discover/route.ts | getOrganization:22 |
| src/app/api/competitors/route.ts | getOrganization:20, getOrganization:53, getOrganization:91, getOrganization:128 |
| src/app/api/competitors/scrape/route.ts | getOrganization:18 |
| src/app/api/connectors/route.ts | getOrganizationId:29 |
| src/app/api/dashboard/preferences/route.ts | getOrganizationId:87, getOrganizationId:122 |
| src/app/api/finance/alerts/predictive/route.ts | getOrganizationId:96 |
| src/app/api/finance/auto-costs/route.ts | getOrganizationId:18 |
| src/app/api/finance/fiscal-profile/route.ts | getOrganizationId:78, getOrganizationId:113, getOrganizationId:163 |
| src/app/api/finance/fiscal/calendar/route.ts | getOrganizationId:49 |
| src/app/api/finance/fiscal/monotributo-alert/route.ts | getOrganizationId:25 |
| src/app/api/finance/fiscal/overrides/route.ts | getOrganizationId:70, getOrganizationId:92, getOrganizationId:139, getOrganizationId:191 |
| src/app/api/finance/fiscal/retentions/route.ts | getOrganizationId:34 |
| src/app/api/finance/manual-costs/bulk-update/route.ts | getOrganizationId:58 |
| src/app/api/finance/manual-costs/route.ts | getOrganizationId:102, getOrganizationId:189, getOrganizationId:383, getOrganizationId:479 |
| src/app/api/finance/platform-config/route.ts | getOrganizationId:12, getOrganizationId:41 |
| src/app/api/finance/scenarios/[id]/route.ts | getOrganizationId:37, getOrganizationId:90, getOrganizationId:165, getOrganizationId:227 |
| src/app/api/finance/scenarios/route.ts | getOrganizationId:27, getOrganizationId:126 |
| src/app/api/finance/shipping-rates/calculate/route.ts | getOrganizationId:22 |
| src/app/api/finance/shipping-rates/carriers/route.ts | getOrganizationId:16 |
| src/app/api/finance/shipping-rates/import/route.ts | getOrganizationId:38 |
| src/app/api/finance/shipping-rates/route.ts | getOrganizationId:18, getOrganizationId:109, getOrganizationId:201, getOrganizationId:262 |
| src/app/api/finanzas/cash-balance/override/route.ts | getOrganizationId:79, getOrganizationId:113, getOrganizationId:204 |
| src/app/api/finanzas/pulso/route.ts | getOrganizationId:300 |
| src/app/api/influencers/[id]/campaigns/route.ts | getOrganization:23, getOrganization:60 |
| src/app/api/influencers/[id]/coupons/route.ts | getOrganization:23, getOrganization:51, getOrganization:104, getOrganization:142 |
| src/app/api/influencers/[id]/metrics/route.ts | getOrganization:21 |
| src/app/api/influencers/[id]/route.ts | getOrganization:35, getOrganization:81, getOrganization:129 |
| src/app/api/influencers/[id]/tiers/route.ts | getOrganization:21, getOrganization:77 |
| src/app/api/influencers/[id]/tracking-link/route.ts | getOrganization:20 |
| src/app/api/influencers/analytics/route.ts | getOrganization:16 |
| src/app/api/influencers/applications/route.ts | getOrganization:29, getOrganization:55 |
| src/app/api/influencers/briefings/route.ts | getOrganization:19, getOrganization:47, getOrganization:77 |
| src/app/api/influencers/content/route.ts | getOrganization:18, getOrganization:47 |
| src/app/api/influencers/export/route.ts | getOrganization:16 |
| src/app/api/influencers/leaderboard/route.ts | getOrganization:17 |
| src/app/api/influencers/route.ts | getOrganization:41, getOrganization:86 |
| src/app/api/influencers/seeding/route.ts | getOrganization:19, getOrganization:55, getOrganization:93 |
| src/app/api/insights/route.ts | getOrganization:163 |
| src/app/api/ltv/customer-detail/route.ts | getOrganizationId:13 |
| src/app/api/ltv/predict/route.ts | getOrganizationId:27, getOrganizationId:207 |
| src/app/api/me/connections/ml/route.ts | tryGetOrganizationId:18 |
| src/app/api/me/manual-spend/[id]/route.ts | getOrganizationId:24, getOrganizationId:84 |
| src/app/api/me/manual-spend/route.ts | getOrganizationId:16, getOrganizationId:39 |
| src/app/api/me/nitropixel-recent-events/route.ts | getOrganizationId:18 |
| src/app/api/me/onboarding/verificar-pixel/route.ts | getOrganizationId:24 |
| src/app/api/memory/[id]/route.ts | getOrganizationId:18, getOrganizationId:54 |
| src/app/api/memory/route.ts | getOrganizationId:15, getOrganizationId:46 |
| src/app/api/mercadolibre/dashboard/route.ts | getOrganizationId:14 |
| src/app/api/mercadolibre/preguntas/route.ts | getOrganizationId:13 |
| src/app/api/mercadolibre/publicaciones/route.ts | getOrganizationId:13 |
| src/app/api/mercadolibre/reputacion/route.ts | getOrganizationId:20 |
| src/app/api/metrics/ads/by-adset/route.ts | getOrganizationId:14 |
| src/app/api/metrics/ads/route.ts | getOrganizationId:174, getOrganizationId:553 |
| src/app/api/metrics/ads/structure/route.ts | getOrganizationId:56 |
| src/app/api/metrics/advisor/route.ts | getOrganizationId:362 |
| src/app/api/metrics/analytics/route.ts | getOrganization:81 |
| src/app/api/metrics/campaigns/drilldown/route.ts | getOrganizationId:19 |
| src/app/api/metrics/campaigns/route.ts | getOrganizationId:11, getOrganizationId:287 |
| src/app/api/metrics/competitors/route.ts | getOrganization:17 |
| src/app/api/metrics/conversion/route.ts | getOrganizationId:51 |
| src/app/api/metrics/customers/route.ts | getOrganizationId:14 |
| src/app/api/metrics/distribution/route.ts | getOrganization:27 |
| src/app/api/metrics/insights/route.ts | getOrganizationId:48 |
| src/app/api/metrics/intelligence/route.ts | getOrganization:20 |
| src/app/api/metrics/ltv/route.ts | getOrganizationId:14 |
| src/app/api/metrics/orders/enrich/route.ts | getOrganizationId:78 |
| src/app/api/metrics/orders/route.ts | getOrganizationId:115 |
| src/app/api/metrics/pixel/discrepancy/route.ts | getOrganizationId:25 |
| src/app/api/metrics/pixel/funnel/route.ts | getOrganizationId:139 |
| src/app/api/metrics/pixel/journeys/route.ts | getOrganizationId:133 |
| src/app/api/metrics/pixel/lag-summary/route.ts | getOrganizationId:15 |
| src/app/api/metrics/pixel/rate-summary/route.ts | getOrganizationId:19 |
| src/app/api/metrics/pixel/route.ts | getOrganizationId:211 |
| src/app/api/metrics/pixel/sales-by-ad/route.ts | getOrganizationId:84 |
| src/app/api/metrics/pixel/sales-by-source/route.ts | getOrganizationId:20 |
| src/app/api/metrics/pixel/summary-tail/route.ts | getOrganizationId:14 |
| src/app/api/metrics/pnl/route.ts | getOrganizationId:22 |
| src/app/api/metrics/products/route.ts | getOrganizationId:125 |
| src/app/api/metrics/route.ts | getOrganization:142 |
| src/app/api/metrics/searches/route.ts | getOrganizationId:49 |
| src/app/api/metrics/seo/route.ts | getOrganizationId:20 |
| src/app/api/metrics/top/route.ts | getOrganization:24 |
| src/app/api/metrics/trends/route.ts | getOrganization:13 |
| src/app/api/nitropixel/asset-stats/route.ts | getOrganizationId:88 |
| src/app/api/nitropixel/data-quality-score/route.ts | getOrganizationId:399 |
| src/app/api/nitropixel/install-status/route.ts | getOrganizationId:29 |
| src/app/api/onboarding/route.ts | getOrganization:70, getOrganization:92 |
| src/app/api/settings/api-keys/[id]/route.ts | getOrganizationId:22 |
| src/app/api/settings/api-keys/route.ts | getOrganizationId:42, getOrganizationId:71 |
| src/app/api/settings/attribution/route.ts | getOrganizationId:33, getOrganizationId:61 |
| src/app/api/settings/custom-roles/[id]/route.ts | getOrganizationId:30, getOrganizationId:126 |
| src/app/api/settings/custom-roles/route.ts | getOrganizationId:29, getOrganizationId:61 |
| src/app/api/settings/ltv/route.ts | getOrganizationId:21, getOrganizationId:86 |
| src/app/api/settings/organization/route.ts | getOrganizationId:51, getOrganizationId:98 |
| src/app/api/settings/permissions/route.ts | getOrganizationId:29, getOrganizationId:56 |
| src/app/api/settings/team/invitations/route.ts | getOrganizationId:40, getOrganizationId:202 |
| src/app/api/settings/team/members/[userId]/route.ts | getOrganizationId:26, getOrganizationId:137 |
| src/app/api/settings/team/route.ts | getOrganizationId:19 |
| src/app/api/sync/catalog/route.ts | getOrganizationId:194, getOrganizationId:211 |
| src/app/api/sync/fix-prices/route.ts | getOrganizationId:70 |
| src/app/api/sync/google-ads/route.ts | getOrganization:110, getOrganization:643 |
| src/app/api/sync/gsc/route.ts | getOrganization:50 |
| src/app/api/sync/inventory/route.ts | getOrganization:72 |
| src/app/api/sync/mercadolibre/import-csv/route.ts | getOrganization:140 |
| src/app/api/sync/meta/route.ts | getOrganization:35 |
| src/app/api/sync/prices/route.ts | getOrganization:65 |
| src/app/api/sync/reconcile/route.ts | getOrganizationId:34 |
| src/app/api/sync/status/route.ts | getOrganization:8 |
| src/app/api/sync/trigger/route.ts | getOrganization:23 |
| src/app/api/sync/vtex-details/route.ts | getOrganization:23 |
| src/app/api/sync/vtex-stock/route.ts | getOrganization:20 |
| src/app/api/sync/vtex/route.ts | getOrganization:164, getOrganization:366 |
