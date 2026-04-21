# NEXT_SESSION_PROMPT.md — Sesión 55: Test end-to-end con credenciales reales de EMDJ

> **Cómo usar este archivo**: copiás el contenido de la sección "Prompt para pegar" y lo mandás como primer mensaje en la próxima sesión. Claude va a leer automáticamente CLAUDE.md + CLAUDE_STATE.md + ERRORES_CLAUDE_NO_REPETIR.md + BACKLOG_PENDIENTES.md + MEMORY.md al arrancar (via ritual #2), así que no hace falta que le mandes esos archivos — solo el prompt específico de la fase que sigue.

---

## Prompt para pegar

```
Hola Claude. Sesión nueva (55). Venimos de cerrar sesión 54 donde armamos todo el flow de onboarding nuevo:

- Form público ultra-simple de postulación (/onboarding)
- 2 aprobaciones humanas desde /control/onboardings (cuenta + backfill)
- OnboardingOverlay bloqueante dentro del producto con wizard paso-a-paso y tutoriales quirúrgicos
- Backfill asíncrono con cron cada 5min + rango elegible por cliente
- Email domain nitrosales.ai verificado en Resend + FROM = team@nitrosales.ai
- Fix crítico del overlay: ahora chequea realidad (connections ACTIVE + backfill jobs), no solo el status enum

Leé primero CLAUDE_STATE.md sección "Sesion 54" para tener el contexto completo + ERRORES_CLAUDE_NO_REPETIR.md sección "S54" (3 errores nuevos para no repetir).

**Tarea de esta sesión: BP-S55-001 — Test end-to-end con credenciales REALES de EMDJ**

Objetivo: probar el flow completo de onboarding con credenciales reales pasando data real al sistema. Todo lo que armamos en S54 solo lo probamos con jobs fake. Necesitamos ver que el backfill real funcione.

Pasos del test (pedido explícito de Tomy al cerrar S54):

1. Tomy logueado como tomylapidus1999@gmail.com (user de prueba que ya existe en DB — la postulación de S54)
2. El overlay debería estar en fase "wizard" (con el fix de S54 así queda si no hay connections ACTIVE)
3. Tomy completa el wizard pegando las credenciales REALES de VTEX de EMDJ (accountName="elmundodeljuguete" o lo que sea, appKey, appToken)
4. Elegir rango chico: 3 meses (así el backfill termina en ~10-30 min real, no en horas)
5. Enviar wizard → ver fase "validating"
6. Cambiar a sesión Owner (Tomy Lapidus OWNER de MdJ) → /control/onboardings
7. Click en la postulación de tomylapidus1999 → drawer con botón "Aprobar backfill (paso 2)"
8. Click → confirmar
9. Volver a sesión de prueba → ver fase "backfilling" con progreso REAL (no fake 45%)
10. Esperar que termine
11. Confirmar que el overlay desaparece solo cuando el backfill termina
12. **Inspeccionar la DB**: ¿la data histórica de EMDJ apareció duplicada en la nueva org de prueba? ¿Las órdenes se procesaron correctamente?

Preguntas a responder durante el test:
- ¿Qué tan rápido es el backfill real? (el ETA que mostramos en el selector es realista?)
- ¿El progreso del overlay se actualiza bien en vivo?
- ¿El email de "data lista" llega correctamente al email de prueba (tomylapidus1999@gmail.com)?
- ¿Hay algún error en la consola o en los logs del server durante el proceso?

Arrancá preguntándome si estoy listo para probar, o si antes querés revisar algún archivo específico del flow.

Si encontramos bugs durante el test, arreglarlos en el momento (es la prioridad). Documentar cada bug encontrado en ERRORES_CLAUDE_NO_REPETIR.md con sección #S55-XXX.

Recordá: regla de autonomía. Avanzás solo en decisiones técnicas (fixes de bugs, ajustes de UI menores), me preguntás solo cosas de producto/UX con trade-offs reales.
```

---

## Contexto rápido que Claude debería tener al arrancar

### Credenciales VTEX de EMDJ
Están guardadas en la Connection de la org de MdJ (organizationId = `cmmmga1uq0000sb43w0krvvys`). Platform = VTEX, status = ACTIVE. Tomy puede compartirlas copy-paste desde el admin drawer (existe botón "Ver" que las muestra encriptadas → desencriptadas).

O Claude puede hacer:
```sql
SELECT credentials FROM connections
WHERE "organizationId" = 'cmmmga1uq0000sb43w0krvvys' AND platform = 'VTEX';
```

### Endpoints útiles para diagnóstico durante el test

- `GET /api/me/onboarding/state` — ver la fase actual del overlay + signals (obStatus, connectionsCount, activeConnectionsCount, activeBackfillCount)
- `GET /api/admin/onboardings/{id}/backfill-status` — detalle de los jobs de un onboarding
- `POST /api/admin/debug-flip-my-test?phase=wizard` — reset a fase wizard si hace falta empezar de cero
- `GET /api/control/clients-health` — estado global de clientes
- `/control/onboardings` — UI admin

### Estado al arrancar sesión 55 (si no pasó nada entre 54 y 55)

- Postulación de `tomylapidus1999@gmail.com` existe en DB
- Organization de prueba creada (con ese owner)
- No hay connections reales para esa org
- No hay backfill jobs activos
- Overlay debería mostrar fase "wizard" al loguear

Si el state cambió por debug-flipping durante S54, correr:
```
fetch('/api/admin/debug-flip-my-test?phase=wizard').then(r=>r.json()).then(console.log)
```

Para dejar todo listo para el test real.

---

**Versión**: 1.0 (cierre Sesión 54)
**Fecha**: 2026-04-21
