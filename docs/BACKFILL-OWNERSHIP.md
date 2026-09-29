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

Pruebas sintéticas: más de 3000 órdenes VTEX, picos en ambas mitades, extremos exactos, fallo minoritario de escritura, detalle/enrichment nulos, reanudación con JSON persistido y respuesta malformada. Queda probar proveedores reales de sandbox, actualizaciones de webhooks durante enrichment y locks PostgreSQL independientes.

## Recuperación ML independiente del cursor

Migración adicional preparada, sin aplicar externamente: `prisma/migrations/backfill_enrichment_version.sql`. Añade `orders.backfillEnrichedVersion` TIMESTAMPTZ, igual que la versión externa definida en migrate-ml-sync-infra. No forma parte del modelo Prisma actual: se usa mediante SQL, como externalUpdatedAt.

Una actualización de orden invalida esta marca en el mismo upsert. El procesador recupera detalles pendientes al volver a leer una versión sin marca, incluso si murió antes de guardar retryEnrichmentIds. Sólo confirma después de que el enriquecimiento devuelve éxito, con comparación de organizationId, source y externalUpdatedAt. Un fallo al guardar la confirmación mantiene la orden pendiente.

Pruebas SQL reproducen el estado persistido de una interrupción, cursor perdido, actualización de versión, confirmación fallida, organización ajena y migración ausente. No simulan dos conexiones PostgreSQL ni un corte real del proceso. La comparación evita confirmar una versión ajena, pero no vuelve atómicas las escrituras internas del enriquecimiento frente a un webhook concurrente.

Rollout: aplicar primero en base descartable y medir el costo de reenriquecer registros antiguos sin marca. El código nuevo requiere la columna; si falta, falla antes del primer upsert. No rellenar marcas antiguas suponiendo completitud. No inicia un barrido global: recupera órdenes que el backfill vuelve a recorrer. Órdenes de páginas ya confirmadas o versiones posteriores al payload necesitan reconciliación aparte. Para rollback conservar la columna y drenar workers; no borrar marcas ni leases activas.

## Escrituras de detalles ML — 2026-09-28

Backfill y notificaciones de órdenes comparten ahora el upsert básico con guard de versión y fuente. El enriquecimiento obtiene envíos antes de abrir la transacción; después bloquea la orden por ID, organización, fuente y versión. Cliente, productos, reemplazo de ítems y campos de la orden se escriben en esa misma transacción. Un fallo revierte esos detalles juntos. La fila básica continúa siendo una fase previa separada, con marca pendiente para recuperación.

Las notificaciones de pagos/envíos consultan la orden actual y usan ese mismo camino; ya no escriben un fragmento desactualizado. Los errores llegan al outbox en lugar de marcarse como procesados. Las URLs de recursos no pueden dirigir el token a otro host. Ítems malformados producen rollback; una lista explícitamente vacía elimina ítems obsoletos dentro de la transacción.

### Reconciliación: éxito y límite de recuperación

`api/cron/ml-reconcile` también usa el upsert compartido, incluyendo guard de fuente y invalidación de la marca de enriquecimiento. No avanza el watermark si hay errores de lectura/escritura, páginas malformadas/truncadas o más de 1000 resultados. Una finalización anterior concurrente no reduce el watermark; no se recorta silenciosamente un intervalo pendiente por antigüedad. Un intervalo demasiado grande queda incompleto hasta implementar subdivisión/cursor: este arreglo evita omitirlo, pero no lo procesa automáticamente. El cron sólo reconcilia campos básicos; queda recuperar detalles pendientes fuera del backfill. Los fallos conservan la frontera previa sin guardar un nuevo lastRunStatus en la tabla; la respuesta informa ok:false/errors.

`api/admin/ml-reenrich-fields` comprueba identidad de la orden y retorno del enriquecimiento; un null deja errors y complete:false. Si el proveedor tiene una versión distinta de la básica guardada, requiere reconciliar primero esa versión y reintentar; no se cuentan detalles rechazados como enriquecidos.

Inventario local de escritores legacy: `api/cron/ml-sync`, `api/sync/mercadolibre`, `api/sync/mercadolibre/backfill` y `api/admin/ml-force-refresh`. La migración de sus escrituras se detalla a continuación; este inventario no acredita todos los posibles escritores de la aplicación.

### Migración de escritores legacy (2026-09-28)

Los tres importadores de órdenes usan `ingestMlOrder`: upsert por versión/fuente, recuperación de la misma versión, enriquecimiento transaccional y confirmación condicional de la marca. Incluye la reparación de fees, que valida la identidad del detalle recibido. Un fallo no confirma la marca ni reporta enriquecimiento completo. Promociones deduplicadas, comisiones explícitas (incluyendo cero) y fallback del medio de pago se conservan dentro del enriquecimiento. Fees ausentes no se inventan; valores inválidos revierten detalles.

El cron reemplaza sus dos lecturas/escrituras de órdenes por una lectura de las últimas 72 horas y enriquecimiento por orden. Se elimina el INSERT masivo de items fuera de transacción. Un fallo de órdenes/reputación deja ok:false y no adelanta lastSuccessfulSyncAt; sync manual y backfill también reflejan los fallos capturados. Esta ruta agrega costo de enriquecimiento por orden: medir duración y consultas de envíos en sandbox antes de desplegar.

Force-refresh sólo reclasifica una versión externa exactamente igual, siempre dentro de organización y fuente MELI. Si la base tiene versión vieja, nula o más reciente, omite esa fila; reconciliar el básico antes de intentar la reparación. No avanza artificialmente la versión de toda la orden al corregir sólo su estado.

Pendientes: el cron requiere presupuesto/cursor a volumen real. Las rutas manuales aún seleccionan la primera conexión activa y no se ha revisado su autorización/selección por organización en este bloque. No se tocó el guard global rechazado ni se declara aislamiento de acceso de esas rutas. La carrera entre fases básicas/detalles puede dejar temporalmente detalles previos; la marca permite reintento, pero no hay snapshot atómico del proceso completo. PGlite acredita SQL de una conexión, no concurrencia multisesión.

### Lectura completa o error en búsquedas legacy (2026-09-28)

`fetchSellerOrders` usa ahora `searchMlOrders`: fija from/to, subdivide ventanas de más de 1000 resultados antes de acumularlas, valida tamaño/total de cada página y rechaza IDs repetidos, fechas inválidas o fuera de ventana. Si el total cambia durante la paginación, falla en vez de declarar un recorrido completo. Backfill semanal y enrich-items pasan el límite superior explícito; ya no consumen primero órdenes más recientes ajenas a su ventana.

Los topes maxOrders, 1100 solicitudes y 90 segundos entre solicitudes producen error, nunca retorno parcial. Cada fetch tiene timeout de 15 segundos; una última solicitud en vuelo puede extender el presupuesto. Un pico que no cabe en un milisegundo falla explícitamente. Se mantienen límites inclusivos con subdivisión sin solapamiento, que requieren validar precisión y semántica de fechas del proveedor en sandbox. Esto no es un snapshot: cambios de contenido que conserven total e IDs pueden no detectarse.

Fixture de 1600 órdenes prueba ambos extremos y mitades, sin omisiones ni duplicados. Pruebas adicionales cubren límites, truncamiento, respuestas inválidas, cambios de total, fallo tardío y presupuesto. El helper acumula el resultado antes de devolverlo; al fallar no entrega un prefijo a los importadores. Superar el límite requiere un intervalo menor o un job persistente, no un reintento idéntico indefinido. La reconciliación por fecha de actualización conserva su lector separado y aún requiere subdivisión.

Escritor adicional descubierto al recorrer llamadas: `api/sync/mercadolibre/enrich-items`. El inventario anterior de cuatro escritores no era exhaustivo; su migración posterior se detalla a continuación.

### Enrich-items y corte cooperativo (2026-09-29)

Enrich-items selecciona sólo órdenes existentes de la organización y fuente MELI con SQL parametrizado. Respeta force para incluir órdenes con items, pero ya no borra items antes del enriquecimiento. Usa la transacción común que bloquea/verifica versión y reemplaza los detalles de forma atómica. Una lista explícitamente vacía puede limpiar items obsoletos en force; una versión distinta o un fallo devuelve incomplete/errors. No crea órdenes ni actualiza su versión básica: reconciliar esa versión primero cuando corresponda. Se retiró productsUpserted, que antes contaba candidatos de un lote y no productos efectivamente escritos; no se encontraron consumidores del campo en src. Días/offset inválidos se rechazan antes de leer.

El cron ml-sync deja de iniciar órdenes o reputación al alcanzar 240 segundos desde el inicio; organizaciones aún no iniciadas figuran como diferidas y no como procesadas. No adelanta lastSuccessfulSyncAt por trabajo incompleto. Es un corte cooperativo, no un timeout duro: una consulta, renovación de token o búsqueda en vuelo puede extender la duración. Falta presupuesto integral por operación y cursor persistente con rotación justa entre organizaciones; una org pesada aún puede agotar sucesivos turnos. No se promete reanudación automática exacta por este cambio.

Persisten los pendientes de autorización/selección de organización de rutas manuales y prueba PostgreSQL multisesión/volumen real. No se modificó el guard global rechazado ni se ejecutaron rutas reales.

Pruebas SQL y de dispatcher cubren rollback final, versión nueva que rechaza detalles viejos, organización/fuente ajenas y propagación de fallos. Esto todavía no acredita concurrencia PostgreSQL multisesión. Otros importadores legacy y herramientas administrativas pueden escribir órdenes por caminos distintos; no se afirma cobertura global de todos los escritores. La entrega del outbox, sus duplicados fallidos y la recuperación de páginas fuera del backfill conservan pendientes propios. Validar también el tratamiento de respuestas 404/permisos de envíos en sandbox antes del rollout.
