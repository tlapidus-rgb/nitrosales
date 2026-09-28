# Propiedad de jobs y validación antes de despliegue

Estado: código preparado en codex/expansion-review-fixes. No desplegado, sin SQL aplicado a Neon.

## Contrato

Cada claim asigna leaseToken nuevo dentro del UPDATE atómico. Progreso, error y finalización exigen el token del worker y estado RUNNING. Un worker reemplazado no puede modificar el cursor, contadores ni estado del job. El runner compara el token al refrescar y no dispara finalización si pierde una escritura condicional. La finalización manual usa otra función, vuelve a comprobar onboardingRequestId y anula el token.

El cooldown existente de seis minutos sigue excediendo el máximo del worker (300 s). No se libera anticipadamente una lease después de un error de proveedor. Los jobs interrumpidos se recuperan al vencer; el reaper conserva el reloj de progreso independiente del claim.

**Límite:** esto protege las escrituras de control del job. No cancela llamadas a proveedores ya iniciadas ni revierte escrituras de órdenes/items hechas por un chunk antes de perder propiedad. La idempotencia de esos procesadores y la carrera con una finalización manual necesitan pruebas adicionales; no se promete ejecución exactamente una vez.

## Migración preparada

Archivo: prisma/migrations/backfill_job_lease.sql. Agrega una columna TEXT nullable con IF NOT EXISTS. La prueba local la ejecuta dos veces en PGlite y verifica recuperación, rechazo del token anterior, reaper y override administrativo. No genera Prisma ni modifica dependencias compartidas.

Antes de desplegar, en PostgreSQL descartable:

1. Crear una base aislada con fixtures sintéticos y registrar versión/permisos.
2. Ejecutar la migración dos veces; verificar columna y compatibilidad con jobs anteriores.
3. Con conexiones independientes, disputar claims con cupo 1; sólo una debe ser admitida.
4. Recuperar un job vencido; intentar progreso, error y complete desde el propietario anterior. Deben afectar cero filas.
5. Intercalar reaper y force-complete con un chunk; verificar que no revive ni finaliza el onboarding dos veces.
6. Simular caída de proceso y reinicio: el cursor válido debe permitir continuar sin duplicar registros del negocio.
7. Verificar rechazo de migración/claim con permisos insuficientes; nunca devolver éxito inventado.

Rollout futuro: drenar workers anteriores antes de habilitar código nuevo, porque un binario viejo no respeta el token. Aplicar la columna primero en el entorno autorizado, luego desplegar. Para rollback, detener workers nuevos antes de revertir código y conservar la columna nullable. No borrar leases activas para acelerar el rollback.

No ejecutar estos pasos en producción sin autorización. PostgreSQL multisesión y preview con base aislada siguen pendientes.

## Reanudación por página — 2026-09-27

Ambos procesadores conservan la página ante cualquier fallo de persistencia. VTEX incluye fallos de detalle/enriquecimiento; ML persiste retryEnrichmentIds para recuperar detalles de órdenes cuyo upsert ya terminó. Los contadores avanzan sólo con la página completa. Esto evita omitir un fallo minoritario o contarlo dos veces en un reintento normal, pero no ofrece un commit atómico entre escrituras del negocio y cursor.

VTEX subdivide ventanas que exceden 30 páginas antes de persistir la página de prueba. Un cursor antiguo superior a ese límite se reexamina: puede volver a recorrer órdenes existentes y su contador histórico no representa necesariamente IDs únicos. Ambos procesadores evitan solapamientos de un milisegundo entre ventanas nuevas, validan listas/totales y rechazan truncamientos. Un pico indivisible o un cambio de página que pierde IDs de enriquecimiento pendientes exige reconciliación visible.

Pruebas sintéticas: más de 3000 órdenes VTEX, picos en ambas mitades, extremos exactos, fallo minoritario de escritura, detalle/enrichment nulos, reanudación con JSON persistido y respuesta malformada. Queda probar proveedores reales de sandbox, caída antes de guardar cursor, actualizaciones de webhooks durante enrichment y locks PostgreSQL independientes.
