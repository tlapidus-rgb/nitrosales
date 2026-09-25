# Plan de implementación — revisión de expansión

Base: fix/expansion-gate-e0 @ 060607f8. Rama de implementación: codex/expansion-review-fixes. Checkout: C:/Users/axelf/github/nitrosales-expansion-fixes.

Objetivo: cerrar los defectos del informe de revisión y preparar una integración verificable con main, preservando las mejoras de Analytics. No se cambian Neon/Vercel, secretos, retención real ni datos de clientes durante la implementación local.

## 1. Integridad de datos y seguridad

- MercadoLibre: corregir cobertura de ventanas al superar la paginación. Probar picos concentrados, bordes, subdías, reanudación y caso que no puede subdividirse.
- Backfills: serializar admisión global y definir propiedad/vencimiento del trabajo. Test con dos conexiones PostgreSQL y workers lentos/muertos; PGlite no alcanza para esta carrera.
- Creadores: unificar la verificación de contraseña y cubrir todas las rutas alternativas con límites por cuenta/IP; diseñar persistencia compartida y migración sin aplicarla a producción.
- VTEX: validar URL estructurada, dominio y ruta por mecanismo, org y autenticación; distinguir configuración válida de entrega comprobada.
- Aurum: reservar admisión antes del proveedor, contabilizar solicitudes en vuelo y costos desconocidos. Prueba de ráfaga concurrente con proveedor simulado.

Salida: reproducciones del informe en verde, nuevos casos de borde y commits separados por problema.

## 2. Resultados y estados que ve el usuario

- Finanzas: ocultar ganancias/márgenes derivados de costos insuficientes en todas las tarjetas, textos y colores; conservar métricas conocidas.
- Consumo: disponibilidad y truncamiento determinan completitud; desconocido no es cero.
- Onboarding: contrato común de plataformas admitidas, leads y conexiones; readiness con estado inconcluso e integración al flujo de aprobación.
- Crons: instrumentación explícita, latido en todas las salidas y estados de éxito parcial/total/envío fallido.
- Anomalías: retirar garantías estadísticas no acreditadas y probar la heurística por métrica/volumen.

Salida: pruebas de handlers/componentes completos, además de helpers.

## 3. Operaciones de datos y documentación

- Exportación: cursor/snapshot con identidad de filas verificable; reparación de atribución con continuación durable.
- Borrado: inventario de propiedad que incluya JSON y relaciones alternativas; descubrimiento fallido produce auditoría incompleta. Validación exclusivamente con datos ficticios.
- Suspensión: documentar y separar su estado parcial; cerrar semántica de acceso/ingesta antes de habilitarla.
- Consolidar estado de las 33 tareas y reabrir R-04, R-20, R-21 y R-35. Corregir instrucciones de variables/deploy y supuestos de capacidad.
- Normalizar finales de línea del snapshot del píxel conservando comparación estricta y prueba de sintaxis.

Salida: documentación coherente con código y pruebas, sin promesas de capacidad no medidas.

## 4. Integración con main

- Incorporar main vigente en la rama aislada.
- Resolver metrics/pixel conservando consultas optimizadas, trazas, claves vigentes, persistencia de caché y degradación explícita.
- Revisar semánticamente warm-cache, caché compartida y guard de Gold aunque el merge textual no falle.
- Ejecutar suite combinada, TypeScript, guards, dependencias y build.

Salida: candidato de integración local validado; todavía no es autorización de producción.

## 5. Validación operativa y criterio de merge

- Entorno aislado: alta ficticia completa, fallos de proveedor/reintentos, concurrencia de backfills y cuotas, exportación y borrado ficticios.
- Analytics y NitroPixel: organizaciones representativas, Arredo y El mundo del juguete si están disponibles en el entorno autorizado; hoy/1/7/14/30 días, frío/caliente, cambios rápidos y errores parciales. Medir hasta datos visibles y comparar valores.
- Verificar migraciones y variables del deployment efectivo; cobertura Gold por organización. Preparar migraciones y rollback antes de solicitar cualquier cambio externo necesario.
- Reportar defectos cerrados, pendientes y evidencia. Merge/deploy sólo tras completar esa verificación y respetando la autorización correspondiente.

## Seguimiento

### Bloque local de correcciones (2026-09-21)

- Finanzas `/finanzas/estado`: un límite de presentación común a Ejecutivo/Detallado aplica el umbral existente del 20%. Con cobertura insuficiente o desconocida no monta tarjetas de beneficio, semáforos de rentabilidad, cascada, comparaciones, detalle de márgenes ni exportación P&L. En su lugar conserva ventas, órdenes, unidades, ticket, gastos registrados y ventas por canal/categoría/marca. El COGS desconocido es `—`; si hay una fracción registrada se etiqueta parcial y no como costo total. Incluye acceso a completar costos y revisar gastos. Con cobertura >=20% conserva las vistas y advertencias existentes. Se habilitó la transformación JSX de Vitest para probar componentes reales. Diez casos de renderizado más dieciséis del criterio compartido pasan. Suite completa: **1492 aprobados, 7 omitidos, 0 fallos**. Falta revisión visual en navegador con datos autorizados. Este arreglo se limita a la presentación de Estado de Resultados: no cambia las fórmulas del API, otros módulos financieros ni las reglas existentes para cobertura parcial >=20%.

- Aurum `/api/chat`: reserva una fila antes de llamar al proveedor bajo lock transaccional por organización; el rate limit incluye solicitudes en vuelo. Actualiza y espera la misma fila al finalizar. Un modelo desconocido, una respuesta sin medición o una reserva no liquidada no se cuentan como cero: fuerzan FLASH con aviso. Errores de admisión devuelven 503; rechazos de cupo, 429 sin insertar consumo duplicado. Se reemplazaron los tests de texto del handler por ejecución con proveedor simulado y SQL PGlite. Suite completa: **1481 aprobados, 7 omitidos, 0 fallos**; TypeScript, guards, dependencias y build aprobados. Se agregó además una prueba del aviso de conciliación del reporte. Ver `docs/AURUM-ADMISSION.md`: aún faltan concurrencia PostgreSQL real, conciliación operativa de reservas huérfanas y cobertura de rutas auxiliares como `/api/aurum/section-insight`. No es un presupuesto duro en USD ni una garantía sobre todo el gasto IA.

- Suite completa después del bloque de creadores: **1474 aprobados, 7 omitidos, 0 fallos**, 118 archivos aprobados y uno omitido. El snapshot del píxel también pasó en esta corrida completa.

- Creadores: las cuatro entradas que aceptan contraseña usan admisión compartida PostgreSQL por cuenta e IP. Una solicitud correcta devuelve sólo su reserva; no reinicia el presupuesto de ataques. El fallo del contador deniega temporalmente la verificación. La interfaz deja de poner la clave en URLs y las respuestas protegidas dejan de usar caché pública. Se retiró el limitador obsoleto por instancia de `/verify`. Migración y procedimiento preparados en `docs/CREATOR-PASSWORD-ADMISSION.md`, **sin aplicar**. Validación focalizada: 14 casos nuevos con SQL PGlite/handlers y 7 de utilidad local; TypeScript, Prisma validate, guards, dependencias y build aprobados. **Pendiente antes de desplegar:** migración aislada, limpieza periódica, dos sesiones PostgreSQL reales y prueba de navegación/latencia. El cambio no completa por sí solo la fase de seguridad ni la migración de hashes.

- Admisión de backfills: el conteo y claim se ejecutan después de adquirir un advisory lock transaccional global, con aislamiento Read Committed. El cooldown es de seis minutos, superior al máximo declarado de cinco minutos del runner. Pruebas locales verifican orden de bloqueo/claim, rollback y límites inválidos; 73 tests del módulo pasan. **Pendiente:** prueba con dos sesiones PostgreSQL reales y recuperación de un worker lento/muerto. Esto no constituye una prueba de concurrencia real ni un lease con token de propietario.
- Consumo: una consulta de uso IA fallida conserva `null`, no inventa cero; un conjunto truncado no se declara completo. Los 25 tests de helper y handler pasan.
- VTEX: validación de origen exacto, HTTPS, ruta, organización única y clave actual/anterior válida; no basta que una URL contenga el nombre de NitroSales. Las claves no se incluyen en mensajes de diagnóstico. Los 46 tests de hooks y autenticación de webhook pasan. El resultado comprueba configuración, no entrega real.
- Readiness: credenciales u órdenes desconocidas producen estado inconcluso; backfill en curso impide declarar listo. Los 31 tests pasan. **Pendiente:** contrato de plataformas y conexión de este criterio al flujo de aprobación.
- Snapshot del píxel: comprobado que la copia Windows sólo difería por 1555 CRLF. Se restaura el contenido exacto ya versionado y se fija `eol=lf` con `.gitattributes`; se conserva la comparación estricta. Sus 13 tests pasan, sin cambiar el script ni regenerar el snapshot.
- Suite completa antes de corregir el checkout del snapshot: 1460 aprobados, 7 omitidos y ese único fallo de CRLF. Reejecución del archivo afectado: 13/13. TypeScript, guards de órdenes/Gold/ts-nocheck, dependency-cruiser y build Next.js aprobados. Build ejecutado directamente, sin regenerar Prisma sobre las dependencias compartidas. La validación operativa sigue pendiente.
- Siguen abiertos los demás puntos de las fases 1–5: estos cambios no habilitan merge ni despliegue. No se modificaron servicios externos o datos de clientes.

- Rama aislada creada desde el commit auditado; checkout de Claude preservado.
- Primer arreglo implementado: MercadoLibre divide primero hacia la mitad reciente y luego continúa hacia atrás, sin omitir la mitad superior. Subdivide también picos dentro de un día y reporta error si no puede separar más el intervalo.
- Validación del primer arreglo: los cuatro casos de regresión fallaron antes del cambio y pasan después; junto con los tests del mapeo ML son 14 casos aprobados. API y persistencia simuladas, sin llamadas reales a MercadoLibre o Neon.
- Límite operativo: esto no repara históricos ya completados con el algoritmo anterior. Antes de desplegar debe identificarse qué jobs requieren reiniciarse desde su rango original. No se modificaron cursores ni datos existentes.
- Las decisiones de producto (planes, nuevas plataformas, retención, suspensión) y cambios externos se separan de los defectos técnicos para que no bloqueen los arreglos independientes.

### Monitoreo de crons (2026-09-21)

- Alertas de clientes y control registran fallos de HTTP, JSON y entrega de correo; un envío rechazado ya no informa clientes avisados. El scheduler distingue errores de reglas de un corte normal por presupuesto: este último deja trabajo pendiente sin generar una falsa alarma de ejecución fallida.
- El control usa un inventario explícito de siete crons instrumentados y expone cuáles siguen sin latido. Se conservan todas las frecuencias cuando un cron tiene varias programaciones y se evalúa la más frecuente.
- Validación local: suite completa con 1509 aprobados y 7 omitidos, TypeScript, guards, dependencias y build aprobados. Después del ajuste final de presupuesto del scheduler se repitieron los 34 casos afectados, todos aprobados. No se hicieron envíos reales ni cambios de infraestructura.
- Pendientes: fallos parciales de digest/anomalies/ads-utm-audit, semántica de warm-cache, fallos de lectura de la tabla de latidos y errores que el motor de reglas absorbe internamente. El inventario explícito no equivale a monitoreo completo de todos los crons. No requiere migración y no habilita merge.
### Fallos parciales por organización (2026-09-21)

- Digest, anomalies y ads-utm-audit registran latido fallido si cualquier organización falla; mantienen el procesamiento de las restantes. La respuesta agrega `completo` y `estado` para distinguir finalización, trabajo pendiente por presupuesto y fallos parciales. Se conserva el contrato anterior de `ok` (al menos un resultado), por lo que el consumidor debe revisar también `completo`/`failures`.
- Un rechazo de sendEmail en digest/anomalies ahora entra en failures. La auditoría UTM conserva los resultados calculados pero informa cuando no logró persistir el insight. No se intenta reenviar automáticamente: falta idempotencia durable para evitar duplicados cuando parte de los efectos ya se guardó.
- Quince pruebas nuevas ejecutan los handlers con proveedores y base simulados: aislamiento entre organizaciones, falla total, éxito, rechazo de correo, error de persistencia y cortes de presupuesto. Validación conjunta de crons: **100 aprobadas**; TypeScript y diff check aprobados. No se repitió la suite completa ni el build tras este segundo bloque; los 1509 corresponden al bloque anterior.
- Siguen pendientes warm-cache, fallos al leer latidos, instrumentación de otros crons y reintentos durables. El cursor actual continúa su vuelta; este cambio mejora la detección, no garantiza recuperación inmediata ni entrega exactamente una vez. Sin cambios en producción, Neon o Vercel.
### Disponibilidad del monitoreo (2026-09-21)

- Leer latidos ahora distingue una consulta fallida de un historial vacío. Tabla ausente o conexión fallida producen una incidencia explícita de monitoreo no disponible; el correo ya no dice Todo OK. Si el correo se entrega pero no se pudo verificar el monitoreo, control-alerts devuelve 503 con sent:true, ok:false y disponible:false, y registra su ejecución como fallida.
- Una tabla legible pero vacía informa nunca-latio para los crons instrumentados, sin afirmar que dejaron de correr. La sección del correo se renombró a Ejecución y monitoreo de crons para cubrir también esos estados.
- Pruebas focalizadas: 73 aprobadas, incluidos seis casos nuevos de lectura, integración del chequeo, contenido del correo y respuesta del handler. TypeScript, guards de órdenes/Gold/ts-nocheck y dependencias aprobados. Suite completa: **1530 aprobadas, 7 omitidas, 0 fallos**. Build Next.js aprobado con 106 páginas estáticas. El primer intento de build falló por permisos locales en .next/trace; se repitió con escritura autorizada y terminó correctamente.
- Límites: sólo cubre lectura de latidos; no elimina la degradación de escritura, no agrega crons al inventario y no prueba servicios externos. Warm-cache aún puede registrar éxito tras fallos internos y checkJobsDeBackfillAtascados aún puede devolver vacío tras un error SQL; continúan pendientes. No se hicieron cambios de infraestructura ni envíos reales.
### Resultado de warm-cache (2026-09-24)

- Warm-cache deja de registrar éxito si fallan requests HTTP, el chequeo de frescura (incluidos errores por tabla), el envío de alertas o la purga. Expone fallos, completo y estado; un corte normal por presupuesto o tablas aún sin medir queda pendiente, sin inventar un fallo de ejecución. HTTP 200 conserva el resumen parcial: el consumidor debe revisar ok/completo.
- Una purga omitida devuelve cachePurged:null; cero queda reservado para una purga ejecutada sin eliminaciones. orgsPlanned informa el universo previsto, orgsWarmed las organizaciones con al menos un request HTTP exitoso, y orgsFullyWarmed las que completaron todos los pares rango/endpoint. Estas métricas no prueban que el contenido devuelto por un HTTP 200 esté completo.
- El cooldown de correo comienza sólo después de un envío aceptado. Rechazos o excepciones permiten reintentar en la siguiente invocación. Una segunda invocación dentro de la misma instancia informa entrega pendiente mientras la primera está enviando, sin duplicarla. El bloqueo y el cooldown siguen siendo locales a cada instancia, no una garantía distribuida.
- Validación: 13 casos nuevos del handler con base, fetch y correo simulados; 36 pruebas focalizadas aprobadas incluyendo planificación y caché compartida. TypeScript, guards y dependencias aprobados. Build Next.js aprobado (106 páginas estáticas); no se repitió la suite completa de 1530 del bloque anterior.
- Pendiente: integración de warm-cache con main preservando las mejoras de Analytics, evaluación del contenido de respuestas HTTP 200, resultado del self-heal en segundo plano, disponibilidad de fuentes en frescura y timeout de correo. Este bloque informa el trabajo real; no acelera queries ni garantiza frescura de los datos. Sin cambios en Neon, Vercel o producción.
### Chequeos de control incompletos (2026-09-24)

- checkJobsDeBackfillAtascados deja de convertir errores SQL en una lista vacía. Tabla ausente o timeout producen un error explícito; una consulta exitosa sin filas conserva [].
- control-alerts aísla los cinco chequeos para conservar hallazgos válidos aunque falle otro. El correo incorpora una sección de chequeos no disponibles, sin inventar jobs trabados ni afirmar Todo OK. La respuesta expone checksCompletos/checksNoDisponibles y devuelve 503 si el reporte es incompleto aun con correo enviado; un rechazo de correo sigue devolviendo 502. El latido registra fallo en ambos casos. Preview sigue sin enviar correo ni registrar ejecución.
- Diez casos nuevos cubren fallo de cada chequeo, conservación de hallazgos, consultas de backfill vacías/fallidas y el contenido escapado del correo. Validación focalizada: 54 aprobadas; TypeScript, guards y dependencias aprobados. Build Next.js aprobado con 106 páginas estáticas. No se repitió la suite completa de 1530 del bloque anterior.
- Límite: sólo se aíslan errores que los chequeos propagan; no se añadió timeout global ni se corrigieron todos los errores absorbidos internamente en otros motores. La propiedad/recuperación de workers de backfill y su prueba PostgreSQL real siguen pendientes. Sin envíos reales ni cambios de infraestructura.
### Admisión de Aurum contextual (2026-09-24)

- /api/aurum/section-insight ahora reserva FLASH con admitirAurum antes de llamar al proveedor, usando el mismo contador por organización que /api/chat. Un contador inaccesible devuelve 503 y un cupo agotado 429, sin llamadas a IA. La sesión y la validación básica preceden a la reserva.
- Suma el consumo de las rondas, registra herramientas/usuario y espera la actualización del mismo ID. Fallo del proveedor o tokens ausentes/inválidos conservan consumo incierto; una escritura final fallida deja la reserva pendiente. Se mantiene Haiku y el máximo existente de cinco rondas, no se cambia el comportamiento de las herramientas de alertas.
- Once pruebas nuevas del handler cubren admisión antes del proveedor, auth, validación, rechazo, contador inaccesible, uso incierto, múltiples rondas y finalización esperada/fallida. Pruebas conjuntas con chat y cuota: 49 aprobadas. Guards y dependencias aprobados. TypeScript y build aprobados (106 páginas estáticas). No se repitió la suite completa en este bloque. No se hicieron llamadas reales a IA ni a Neon.
- El inventario de llamadas directas en src/app/api/aurum sólo encontró esta ruta; esto no equivale a cobertura global de todos los proveedores/helpers/crons de la aplicación. La cuota contextual se devuelve en JSON; falta mostrar sus avisos en la UI. Siguen pendientes conciliación operativa y concurrencia PostgreSQL real. Este cambio no completa por sí solo el bloque Aurum.
### Avisos de Aurum contextual (2026-09-24)

- Panel flotante y asistente de SEO consumen el mismo contrato de respuesta: muestran los avisos de cuota en el insight inicial y las preguntas. Un 429/503 conserva el mensaje de cupo previsto por el servidor; respuestas no JSON usan un mensaje legible y otros errores no exponen detalles internos. Una respuesta exitosa vacía no se presenta como un resultado válido.
- El aviso se renderiza como texto escapado con role=status y se limpia al cambiar el contexto. Se conservan las respuestas del asistente y el flujo existente de preguntas.
- Validación: diez casos nuevos del lector/renderizado más once de admisión contextual, 21 aprobados. TypeScript, guards y dependencias aprobados. Build aprobado con 106 páginas estáticas. No se ejecutó una nueva suite completa ni prueba visual de navegador; tampoco se hicieron llamadas reales a IA.
- Pendientes de Aurum: conciliación de reservas huérfanas, concurrencia PostgreSQL real e inventario del resto de llamadas IA de la aplicación. Este arreglo no cambia la planificación de solicitudes ni resuelve las carreras preexistentes al navegar durante una pregunta.