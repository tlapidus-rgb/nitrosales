# Validación aislada local — 2026-09-29

## Resultado comprobado

- Suite local: **1891 aprobadas, siete omitidas**, cero fallos; 158 archivos aprobados y uno omitido.
- TypeScript, guards y dependencias: sin errores nuevos (899 módulos, 2860 dependencias).
- Build Next: 106 páginas, correcto.
- PostgreSQL real: **ocho pruebas aprobadas**, con conexiones concurrentes mediante Prisma; no PGlite.
- Smoke HTTP real de Next: aprobado. Sesión activa, suspensión por staff, denegación de API con el mismo JWT, acceso de staff, impersonación bloqueada, reactivación sin renovar JWT y settings inválidos.
- main remoto consultado en modo lectura: `39d93a204c2d54730e886bae2be710718ec54e10`, coincide con la referencia integrada anteriormente. Sin fetch/merge/push.

## Aislamiento

PostgreSQL 16 en contenedor `nitrosales-expansion-pg`, puerto **127.0.0.1:15439**, base `expansion_test`, contraseña sintética `synthetic-local-only`. La imagen usada tiene digest `sha256:1a6ab3f5345eb6dbe04a1349529caabdb0ab09293a09590fad07b2246bfa4b54`. Ningún volumen productivo ni conexión a Neon. Los casos concurrentes crean un esquema aleatorio y eliminan sólo ese esquema al finalizar. El smoke usa `expansion_preview_smoke` con organizaciones y usuarios sintéticos.

El servidor Next escucha únicamente **127.0.0.1:3319** y recibe un entorno explícito sin claves heredadas de proveedores/correo. Se detiene al finalizar el script. No hay archivo .env en el checkout (sólo .env.example). No ejecutar con archivos .env que contengan conexiones reales.

## Repetir

En el checkout de la rama, iniciar el contenedor descartable con la misma configuración loopback y base indicadas arriba. No reutilizar un contenedor con datos reales.

```powershell
docker run --detach --rm --name nitrosales-expansion-pg --label nitrosales.purpose=expansion-isolated-validation -p 127.0.0.1:15439:5432 -e POSTGRES_PASSWORD=synthetic-local-only -e POSTGRES_DB=expansion_test postgres:16
$env:EXPANSION_LOCAL_POSTGRES='1'
node node_modules/vitest/vitest.mjs run --config vitest.postgres.config.ts --no-cache
$env:DATABASE_URL='postgresql://postgres:synthetic-local-only@127.0.0.1:15439/expansion_test?schema=expansion_preview_smoke'
$env:DATABASE_URL_UNPOOLED=$env:DATABASE_URL
node node_modules/prisma/build/index.js db push --schema prisma/schema.prisma --skip-generate
node node_modules/next/dist/bin/next build
node scripts/validation/session-smoke.cjs
```

Las cuatro migraciones `backfill_job_lease`, `backfill_enrichment_version`, `ml_sync_progress` y `ml_reconcile_progress` se aplican dos veces en el harness. Se comprueban admisión de seis workers con límite uno, leases de sync/reconcile, rechazo de owner viejo, rollback del watermark y snapshot RepeatableRead mientras otra conexión escribe.

## Límites

Esto no acredita contratos reales VTEX/ML/Ads, entrega de correo, calibración de anomalías ni tiempos de la base productiva. Tampoco acredita un recorrido visual completo, onboarding de proveedor real ni borrado con todos los escritores en marcha. El smoke genera JWTs sintéticos firmados para probar sesiones existentes; no prueba recuperación de contraseña ni el formulario de login. La prueba de snapshot acredita la semántica de aislamiento, no el endpoint completo de exportación a volumen real. No se aplicaron migraciones externas ni se habilitó producción.


## Limpieza

Al terminar se verificó la etiqueta `nitrosales.purpose=expansion-isolated-validation` y se detuvo únicamente `nitrosales-expansion-pg`. Al haber sido creado con --rm, se eliminó su base efímera. No queda un servidor Next de este smoke en ejecución. La imagen Docker queda disponible para repetir las pruebas. El script rechaza archivos .env antes de iniciar, además de usar un entorno explícito.
