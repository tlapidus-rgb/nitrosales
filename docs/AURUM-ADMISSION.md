# Admisión de Aurum en /api/chat

## Comportamiento implementado

La admisión toma un advisory lock transaccional por organización, obtiene el reloj de PostgreSQL y lee el consumo con aislamiento Read Committed. Si hay cupo, inserta una fila en `aurum_usage_logs` antes de llamar al proveedor y libera el lock. La llamada externa ocurre fuera de la transacción. El contador del último minuto incluye solicitudes todavía en vuelo; las rechazadas no crean otra fila de consumo.

La fila reservada usa el modelo interno `__aurum_pending__`. El handler actualiza ese mismo ID y espera la escritura al terminar, en vez de lanzar una inserción sin esperar. Si la escritura final falla, la reserva permanece visible. Si una llamada al proveedor termina sin consumo verificable, el marcador es `__aurum_usage_unknown__`. Ninguno se puede convertir en costo cero con la tabla configurable de precios.

Un modelo sin precio o una reserva sin finalizar hacen que el gasto mensual sea desconocido. La siguiente solicitud usa FLASH con aviso y `medicionDisponible: false`. Tras liquidar correctamente todas las solicitudes pendientes, vuelve a aplicarse el criterio normal. Una reserva huérfana NO se borra ni vence como si fuera gratis: puede mantener a la organización en FLASH durante el resto del mes hasta reconciliarla.

El límite mensual sigue siendo un umbral para pasar a FLASH, no un presupuesto duro. No se reserva un importe en dólares: no hay una cota fiable del costo de la solicitud con historial y rondas variables. El rate limit limita inicios por minuto, no el total de solicitudes concurrentes de larga duración. Estos límites son deliberadamente explícitos para no prometer un techo de gasto que el código no garantiza.

## Validación y límites

- Pruebas del handler con proveedor simulado y SQL PGlite: ráfaga, degradación, rechazo, espera de finalización, rollback, fallos de proveedor/persistencia, ventana móvil y aislamiento de organizaciones.
- PGlite usa una cola de transacciones simulada; no reemplaza la validación con dos conexiones reales PostgreSQL y el pool de deployment.
- No se necesita una tabla nueva: se utiliza `aurum_usage_logs` existente. Antes del despliegue debe verificarse que existe con el esquema esperado y que el usuario de aplicación tiene permiso para INSERT/UPDATE y advisory locks transaccionales.
- No ejecutar simultáneamente workers viejos y nuevos durante la prueba: el código anterior no participa del protocolo de admisión. Revisar despliegues activos y previews que compartan la base.
- Revisar por organización las filas cuyo modelo empieza con `__aurum_`; reconciliar consumo con evidencia del proveedor. No ponerlas en cero automáticamente. El cambio no modifica históricos.
- Alcance: `/api/chat` y `/api/aurum/section-insight`. La ruta contextual reserva FLASH en el mismo contador por organización, suma tokens de sus rondas y liquida la misma fila antes de retornar. Mantiene el modelo Haiku y su máximo existente de cinco rondas; no reduce ese flujo a las dos rondas del chat FLASH. Los avisos de cuota se exponen en el JSON; su presentación en la interfaz contextual sigue pendiente. Las rutas auxiliares que llamen al proveedor directamente deben inventariarse antes de afirmar un control global de todo el gasto IA. La prueba operativa de latencia y navegación también sigue pendiente.

No se hicieron llamadas reales al proveedor ni modificaciones de Neon/Vercel durante esta implementación.
