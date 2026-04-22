# NEXT_SESSION_PROMPT.md — Retomar Test E2E MercadoLibre (S55 BIS+3 interrumpido)

> **Actualizado S55 BIS+3 (2026-04-22 tarde)**: Tomy se fue a evento en medio del test E2E de ML. Retoma de noche. Este archivo refleja el estado real para retomar exactamente donde quedó.

## 🎯 CONTEXTO ACTUAL (críticísimo para entender el estado)

**Lo que SÍ pasó hoy**:
- ML sync v2 de 4 capas (webhooks + missed_feeds + reconcile + deep) deployado (commit `c081230`)
- Email log (observability) deployado (commit `5debbde`)
- Reset test env deployado (commit `3708512`)
- Debug email flow con 5 emails del flow (commits `d27cbbe`, `009227a`)
- **Fix deliverability**: Tomy cambió `RESEND_FROM` de `no-reply@nitrosales.ai` a address humano. Emails empezaron a llegar al inbox.
- Test E2E parcialmente completado: lead creado, form completado, cuenta activada, emails llegando OK.

**Donde se detuvo**:
- En el paso de conectar credenciales ML en el wizard (dentro del producto).
- Tenía que autorizar MercadoLibre OAuth con su cuenta alternativa + elegir meses de historia + aprobar backfill.

**Pendiente crítico**:
- ⚠️ Tomy tiene que ejecutar 2 migraciones (1 click cada una, banners visibles):
  1. `/control/onboardings` → banner naranja "Migración ML sync v2"
  2. `/control/emails` → banner amarillo "Ejecutar migración" (email_log)
- Si estas 2 migraciones NO se corrieron, todo el sistema sigue funcionando por fallback hardcoded PERO los nuevos features (logs, reconciliación, etc) quedan inactivos.

## 🚀 Cómo retomar la próxima sesión

### Paso 1 — Validar migraciones (5 min)

Chequeá que las 2 tablas nuevas existan:
- `sync_watermarks` (ML sync v2)
- `meli_webhook_events` (webhook outbox)
- `email_log` (email observability)
- Columna `Order.externalUpdatedAt`

Cualquier consulta rápida a DB confirma. Si faltan → Tomy ejecuta banners in-UI.

### Paso 2 — Resetear entorno de test (1 click, 10 seg)

`/control/onboardings` → botón "🔧 Debug" → sección roja "Reset test environment":
- Email: `tomylapidus@elmundodeljuguete.com.ar` (o el que haya usado)
- Click "Borrar todo" → confirma
- Borra lead + onboarding + user + org + connections + orders + backfill_jobs + webhook_events + watermarks atómicamente
- NO borra email_log (mantiene historial para debug)

### Paso 3 — Re-hacer flow de onboarding completo

1. `/control/pipeline` → + Agregar lead (mismo email, empresa "Test ML")
2. Llega email "Tu acceso a NitroSales" al inbox
3. Completar form de `/onboarding` (pre-llenado por query params)
4. Admin: aprobar cuenta (email de activación con credenciales llega al inbox)
5. Loguear con las credenciales al producto
6. Wizard: **conectar MercadoLibre** (OAuth con cuenta alternativa de Tomy)
7. Elegir 3 meses de historia
8. Admin: aprobar backfill

### Paso 4 — Monitorear backfill ML en tiempo real

- **`/control/emails`**: cada intento de email queda registrado
- **Logs Vercel**: buscar `[ml-processor] chunk done:`
- **`/control/onboardings/[id]`**: progreso del backfill_job

Si todo anda: eventualmente llega email "Data lista".

### Paso 5 — Validación end-to-end

- [ ] Backfill completa N órdenes sin errores
- [ ] email_log muestra todos los envíos con `ok=true`
- [ ] Email "Data lista" llega al inbox
- [ ] Revisar data en el producto: ordenes de ML aparecen

## 🔧 Tools nuevas disponibles para debug

- **Debug email flow** (`/control/onboardings` → 🔧 Debug): elige 1 de los 5 emails del flow, haz dry-run o test real. Devuelve diagnóstico granular.
- **Email log** (`/control/emails`): historial completo de envíos con filtros. Stats 7d.
- **Reset test env** (botón en panel debug): borra todo lo asociado a un email. Ideal para re-testear.

## 📋 Si el test E2E falla

1. Revisar `/control/emails` → ¿qué envió y cuál falló?
2. Revisar logs Vercel → buscar `[ml-processor]` o `[backfill-runner]`
3. Si es error de credenciales ML → validar con `/api/admin/onboardings/[id]/test-credentials`
4. Si es error de backfill → revisar `backfill_jobs` en DB, campo `lastError`
5. Si es error de rate limit → ajustar `concurrency` en `ml-processor.ts`

## 📌 Lo que queda DESPUÉS del test E2E exitoso

1. Auditoría pendiente de otras plataformas (GA4 multi-tenant, GSC multi-tenant, Google Ads batch upserts, Meta cron backup)
2. Activity log / Run history en Centro de Control (BP-S55-002)
3. Onboardear Arredo con confianza

---

## Tarea principal — Auditoría completa de paginación + eficiencia en sync de TODAS las plataformas

> **Cómo usar este archivo**: copiás el contenido de la sección "Prompt para pegar" y lo mandás como primer mensaje en la próxima sesión. Claude va a leer automáticamente CLAUDE.md + CLAUDE_STATE.md + ERRORES_CLAUDE_NO_REPETIR.md + BACKLOG_PENDIENTES.md + MEMORY.md al arrancar (via ritual #2), así que no hace falta que le mandes esos archivos — solo el prompt específico de la fase que sigue.

---

## Prompt para pegar

```
Hola Claude. Sesión nueva (56). Venimos de cerrar sesión 55 con
TEST END-TO-END EXITOSO del backfill: 12.437 ordenes en 4 min 9 seg
para el onboarding del cliente de prueba. Sistema listo para
onboardear Arredo.

Leé primero:
- CLAUDE_STATE.md sección "Sesion 55" para contexto completo
- MEMORY.md (especialmente los 3 patrones críticos nuevos: límite
  paginación, validación runtime, cooldowns vs loop interno)
- ERRORES_CLAUDE_NO_REPETIR.md sección "S55" (3 errores nuevos
  para no repetir)
- BACKLOG_PENDIENTES.md sección "BP-S56-001"

**Tarea de esta sesión: BP-S56-001 — Auditoría completa de
paginación + eficiencia en backfill + sync de TODAS las plataformas**

Pedido explícito de Tomy al cerrar S55: "Este cambio lo podemos
replicar en las otras sincronizaciones, sincronizaciones, o hacer
un análisis de cómo están hechas las otras sincronizaciones para
la información para atrás, y poder determinar realmente cómo va a
ser la forma más eficiente para todas las plataformas."

Plan sugerido:

1. **Auditar BACKFILL** (lo que se trae históricamente al onboardear)
   por plataforma:
   - VTEX: ✅ resuelto en S55 (date-window + loop)
   - MercadoLibre: ❌ stub. Implementar con date-window
   - Meta Ads: actualmente "on-demand". Evaluar si necesita backfill
   - Google Ads: idem Meta. Evaluar
   - GA4: cron diario sin backfill. Evaluar
   - GSC: cron diario sin backfill. Evaluar

2. **Auditar SYNC INCREMENTAL** (lo que se trae cada día) por plataforma:
   - Verificar que ninguna sufra el límite de paginación de VTEX
   - Identificar cuellos de botella de tiempo
   - Ver si vale agregar APIs bulk donde existan (Meta async insights,
     Google Ads streaming, MELI bulk endpoints)

3. **Aplicar patterns aprendidos donde corresponda**:
   - Date-window pagination cuando hay límite de páginas
   - Loop interno + trigger inmediato cuando hay sistema de jobs
   - Pre-query para totalEstimate cuando se necesita progress real

Reglas importantes:
- NO tocar nada hasta haber hecho el análisis completo y obtener OK
  de Tomy sobre el plan de cambios concretos
- Empezar por LECTURA del código de cada plataforma + docs oficiales
  para entender qué tiene cada una y dónde están los límites
- Aplicar las 3 reglas críticas de S55: trace runtime, leer docs
  para detectar límites, considerar cooldowns/locks al diseñar loops
- El sync actual de producción funciona y mantiene la data al día.
  No romper eso bajo ningún concepto.

Arrancá preguntándome si querés profundizar en alguna plataforma
específica o si arrancás con el análisis general primero.
```

---

## Contexto rápido para Claude al arrancar

### Lo que YA está resuelto (no tocar)
- **VTEX backfill**: motor nuevo con date-window pagination, loop interno, trigger inmediato. 12.437 ordenes en 4 min 9 seg. Files: `src/lib/backfill/processors/vtex-processor.ts`, `src/app/api/cron/backfill-runner/route.ts`, `src/app/api/admin/onboardings/[id]/approve-backfill/route.ts`, `vercel.json` (cron 1min).
- **Aurum Onboarding Assistant**: chat con vision en wizard. Files: `src/components/OnboardingAurumChat.tsx`, `src/app/api/onboarding/aurum-assist/route.ts`.
- **Test admin de credenciales**: 7 plataformas. Files: `src/lib/onboarding/credential-tests.ts`, `src/app/api/admin/onboardings/[id]/test-credentials/route.ts`.

### Lo que es STUB (implementar)
- **MercadoLibre backfill**: `src/lib/backfill/dispatcher.ts:14-21` devuelve `isComplete: true` sin procesar nada. Hay que implementar `processMercadoLibreChunk` siguiendo patron de `processVtexChunk` (date-window).

### Plataformas con sync diario (auditar)
- VTEX: cron 3am `/api/sync` (puede sufrir el mismo límite de 30 páginas si trae rangos grandes)
- ML: cron 2am `/api/cron/ml-sync`
- GA4: cron diario (parte de `/api/sync`)
- GSC: cron 9am `/api/sync/gsc`

### Webhooks (real-time, posiblemente no tienen problema de paginación)
- VTEX orders broadcaster
- VTEX inventory afiliados
- ML notifications

### Donde mirar primero
- `src/lib/connectors/*` — implementaciones de cada plataforma
- `src/app/api/sync/*` — endpoints de sync
- `vercel.json` — schedule de crons
- Docs oficiales: VTEX Developer Portal, MercadoLibre API, Meta Marketing API, Google Ads API, GSC API

### BP residuales bajo prioridad (de S55, para cuando haya aire)
- BP-S55-002: Activity log/Run history en Centro de Control
- BP-S56-002: Implementar processor real de MercadoLibre para backfill (parte de la auditoría)

---

**Versión**: 2.0 (cierre Sesión 55, generado 2026-04-22)
**Última sesión**: S55 cerró exitosamente con backfill funcionando 64x más rápido que antes
