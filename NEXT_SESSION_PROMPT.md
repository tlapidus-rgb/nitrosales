# NEXT_SESSION_PROMPT.md — Tarea A (auditoría paginación) · B (limpieza) · C (activity log)

> **Actualizado S55 BIS+2 (2026-04-22 tarde)**: editor emails + onboarding redesign + pipeline fix ya listos. Este archivo refleja el estado real.

## ✅ Ya resueltos esta jornada

- Editor admin `/control/email-templates` (commit `df05718`) — pendiente que Tomy ejecute la migración (botón in-UI)
- Onboarding form split + first-fold + personalización query params (`e07e8f4`)
- Modal pipeline: empresa requerida cuando sendInvite (`e07e8f4`)
- Variante A (profesional sobrio) activa como default en `leadInviteEmail`

## 🧹 Tarea B — Limpieza express (10 min)

1. `rm "src/components/VisualTutorials 2.tsx"` (duplicado macOS) + commit
2. Ejecutar migración editor emails: ir a `/control/email-templates` → botón "Ejecutar migración" (seedea 9 templates)

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
