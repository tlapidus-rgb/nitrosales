# Decisiones operativas y rotación — 2026-09-29

## Estado y límites

El usuario pidió completar los tres bloques, manteniendo la prohibición de modificar producción. Confirmó que no existe preview/base de prueba y que todavía no sabe si quiere altas sólo Ads/NitroPixel. Se implementó suspensión local y se creó PostgreSQL Docker descartable para validar. Este documento prepara decisiones/operación; no declara secretos rotados, borrado ejecutado ni una política de retención aprobada.

## Altas sin órdenes

Propuesta para decidir: habilitar un flujo específico de Ads/NitroPixel que evalúe únicamente las integraciones elegidas y muestre claramente la ausencia de historia de órdenes. Requiere definir qué pantallas estarán disponibles y qué métricas no se pueden calcular. No simular un backfill completo ni activar mediante un job ficticio. Hasta que se elija ese alcance, conservar el rechazo explícito actual. El usuario no aprobó este nuevo comportamiento.

## Retención y borrado

| Datos | Propuesta técnica | Decisión pendiente |
| --- | --- | --- |
| Filas con propietario y sus dependencias | Exportación previa y simulacro revisado; borrar sólo con escritores pausados y alcance confirmado | Momento de cierre y responsable que confirma el alcance |
| email_log y logs de login | Definir anonimización de contactos/IP y mínimo de evidencia que necesita soporte | Plazo, excepciones y campos a conservar |
| Leads e identidades compartidas | No inferir pertenencia por email ni eliminar contactos de otras organizaciones | Regla de propiedad y tratamiento de cuentas compartidas |
| Proveedores/cachés/copias | Inventario separado con confirmación del responsable de cada sistema | Alcance de purga y conservación de copias |

No se fija un plazo arbitrario ni se cambia `borradoTotalVerificado:false`. La suspensión conserva ingesta y no sustituye pausa de escritores para borrar. Las pruebas de snapshot PostgreSQL no prueban un protocolo global de borrado concurrente.

## Rotación: secuencia preparada, ejecución pendiente

1. Usar inventario de referencias, sin copiar valores. Los 29 cron paths con `key=` en vercel.json siguen siendo una superficie expuesta; eliminar el valor del último commit no invalida copias históricas.
2. Preparar en un entorno independiente la autenticación del scheduler mediante secreto dedicado y header, y comprobar que cada handler lo valide. No asumir que todos usan el helper común: el inventario de abajo distingue referencias y exige revisar igualdades directas.
3. Para ADMIN_API_KEY, probar clave nueva y anterior en consumidores compatibles; actualizar emisores, luego retirar la anterior. No mantener una ventana indefinida. Los consumidores con igualdad directa necesitan adaptación antes del cambio.
4. Separar las claves de tareas de NEXTAUTH_SECRET. Rotar NEXTAUTH_SECRET puede invalidar sesiones e impersonaciones; coordinarlo con un despliegue y comunicar el reingreso. No hacerlo sólo para cambiar un cron.
5. Rotar claves de proveedores y webhook con sus cuentas de prueba primero; cambiar emisores/receptores coordinadamente y verificar rechazos con claves retiradas. Las credenciales de base requieren actualizar clientes y pools antes de revocar las antiguas.
6. Guardar valores nuevos exclusivamente en gestores/configuración autorizados; no en Git, documentos, capturas o mensajes. Tras validar, revocar los valores expuestos y registrar evidencia sin secretos.

La ejecución sobre Vercel/Neon/proveedores productivos queda prohibida por el alcance vigente. Para seguir faltan un entorno externo independiente, cuentas de sandbox y autorización delimitada para configurar/rotar en ese entorno. No se reutilizaron credenciales productivas en el smoke local.

## Cron paths con clave en query (sólo nombres, sin valores)

Detección estática de referencias; no afirma compatibilidad completa con rotación.

| Ruta | Referencias de autorización |
| --- | --- |
| /api/sync | clave compartida con sesiones |
| /api/cron/vtex-sync-recent | referencia ADMIN_API_KEY; revisar igualdad directa, clave compartida con sesiones |
| /api/sync/chain | clave compartida con sesiones |
| /api/cron/anomalies | helper admin con ventana, referencia ADMIN_API_KEY; revisar igualdad directa |
| /api/cron/digest | helper admin con ventana, referencia ADMIN_API_KEY; revisar igualdad directa |
| /api/sync/gsc | referencia ADMIN_API_KEY; revisar igualdad directa |
| /api/sync/competitors | referencia ADMIN_API_KEY; revisar igualdad directa, referencia CRON_SECRET |
| /api/cron/ml-missed-feeds | referencia ADMIN_API_KEY; revisar igualdad directa |
| /api/cron/ml-reconcile | referencia ADMIN_API_KEY; revisar igualdad directa |
| /api/cron/ml-reconcile | referencia ADMIN_API_KEY; revisar igualdad directa |
| /api/cron/influencer-summary | clave compartida con sesiones |
| /api/cron/ads-utm-audit | helper admin con ventana, referencia ADMIN_API_KEY; revisar igualdad directa |
| /api/cron/exchange-rates | helper admin con ventana, referencia ADMIN_API_KEY; revisar igualdad directa |
| /api/cron/inflation-index | helper admin con ventana, referencia ADMIN_API_KEY; revisar igualdad directa |
| /api/cron/alerts-scheduler | referencia ADMIN_API_KEY; revisar igualdad directa |
| /api/cron/alertas-clientes | helper admin con ventana, referencia ADMIN_API_KEY; revisar igualdad directa |
| /api/cron/control-alerts | referencia ADMIN_API_KEY; revisar igualdad directa |
| /api/cron/backfill-runner | referencia ADMIN_API_KEY; revisar igualdad directa |
| /api/cron/meta-token-refresh | referencia ADMIN_API_KEY; revisar igualdad directa |
| /api/cron/warm-cache | referencia ADMIN_API_KEY; revisar igualdad directa |
| /api/cron/refresh-pixel-first-source | helper admin con ventana, referencia ADMIN_API_KEY; revisar igualdad directa, referencia CRON_SECRET |
| /api/cron/refresh-pixel-rollups | helper admin con ventana, referencia ADMIN_API_KEY; revisar igualdad directa |
| /api/cron/attribution-reconcile | referencia ADMIN_API_KEY; revisar igualdad directa, clave compartida con sesiones, referencia CRON_SECRET |
| /api/cron/refresh-silver-orders | helper admin con ventana, referencia ADMIN_API_KEY; revisar igualdad directa |
| /api/cron/refresh-gold-daily-revenue | helper admin con ventana, referencia ADMIN_API_KEY; revisar igualdad directa |
| /api/cron/refresh-gold-attribution | helper admin con ventana, referencia ADMIN_API_KEY; revisar igualdad directa |
| /api/cron/refresh-gold-attribution-channel | helper admin con ventana, referencia ADMIN_API_KEY; revisar igualdad directa |
| /api/cron/refresh-product-dimensions | helper admin con ventana, referencia ADMIN_API_KEY; revisar igualdad directa |
| /api/cron/refresh-pixel-name-dict | helper admin con ventana, referencia ADMIN_API_KEY; revisar igualdad directa |
