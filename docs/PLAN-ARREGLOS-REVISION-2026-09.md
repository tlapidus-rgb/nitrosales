# Plan de implementación — revisión de expansión

Base: fix/expansion-gate-e0 @ 060607f8. Rama de implementación: codex/expansion-review-fixes. Checkout: C:/Users/axelf/github/nitrosales-expansion-fixes.

Objetivo: cerrar los defectos del informe de revisión y preparar una integración verificable con main, preservando las mejoras de Analytics. No se cambian Neon/Vercel, secretos, retención real ni datos de clientes durante la implementación local.

## Estado consolidado — 2026-09-27, segunda pasada

- Borrado: descubre rutas transitivas y alternativas, respeta columnas referenciadas distintas de id, ordena las hijas antes de perder sus rutas por SET NULL/CASCADE y bloquea referencias a otra organización o a datos retenidos. Las FKs compuestas se informan como no resueltas y bloquean la ejecución. Fallos de catálogo no producen una auditoría vacía. Hay pruebas SQL de borrado y rollback exclusivamente en PGlite sintético. Esto no acredita borrado total: faltan propiedades por JSON/campos no FK, retención, escritores concurrentes y derivados externos.
- Suspensión: rechaza el corte de ingesta no implementado y deja de afirmar que lo aplicó. Modifica sólo la clave suspension sobre el JSON actual, preservando ajustes cambiados desde la lectura. El gate de acceso sigue desconectado; el parche de middleware fue rechazado por revisión automática y no se aplicó. Detalle en PENDIENTES-ACCESOS-EXPANSION.md.
- Aprobación: bloquea/relee conexiones y meses dentro de la transacción; si cambiaron desde la lectura inicial, devuelve conflicto sin jobs, activación de conexiones ni correo. VTEX requiere credenciales con estructura utilizable. No equivale a validar permisos vigentes del proveedor.
- Verificaciones: respuestas VTEX malformadas o catálogo con error no se interpretan como una cuenta vacía válida. NitroPixel devuelve conteo estructurado y diferencia indisponibilidad de cero. Anomalías rechaza como incompleto el análisis contextual que contiene filas inválidas/duplicadas, preservando los hallazgos independientes por reglas.
- Backfills: un solo fallo de persistencia conserva la página. VTEX reintenta detalles/enriquecimiento fallidos; ML guarda IDs pendientes de enriquecimiento en el cursor y los recupera aunque la orden básica ya esté actualizada. Sólo se cuentan páginas completadas, incluyendo órdenes ya presentes. Respuestas malformadas o truncadas no acreditan finalización.
- VTEX: subdivide ventanas con más de 3000 órdenes, sin pasar a la anterior omitiendo el excedente. Ambas plataformas usan límites de milisegundos sin solapar ventanas; el volumen imposible de separar en un mismo instante informa un error. Pruebas con picos recientes/antiguos, extremos exactos y reanudación. Las fechas/páginas de proveedores reales siguen pendientes de validación de contrato.

Límites técnicos que aún no se cierran: los upserts de negocio ya iniciados no están protegidos por el token del job; versiones concurrentes de órdenes/items requieren una estrategia común con webhooks. La recuperación ML ante pérdida del cursor se amplía en la pasada siguiente, documentada abajo; todavía no equivale a una cola global de reconciliación. Tampoco se afirma entrega exactamente una vez. La prueba PostgreSQL multisesión y el recorrido completo en preview independiente siguen pendientes.

Validación final de esta pasada: **1733 pruebas aprobadas, 7 omitidas, 0 fallos**; 143 archivos aprobados y uno omitido. Build Next.js aprobado. TypeScript y controles de órdenes, Gold, deuda de tipos y dependencias aprobados. Tras la suite/build sólo se retiraron declaraciones/imports no usados y se ajustaron comentarios/documentación; TypeScript y guards se repitieron para ese estado. No se hizo push, merge, despliegue, envío real ni SQL contra una base externa.

### Recuperación de enriquecimientos ML — pasada siguiente

Se añade marca persistente de la versión enriquecida en orders. El upsert invalida la marca atómicamente al recibir una versión nueva; el reintento recupera órdenes sin marca aunque se haya perdido el cursor retryEnrichmentIds. La confirmación exige misma organización, fuente y versión externa. Se preparó migración aditiva TIMESTAMPTZ (mismo tipo que externalUpdatedAt), aplicada dos veces sólo al fixture PGlite. Casos cubiertos: estado persistido tras interrupción, cursor perdido, confirmación fallida, actualización concurrente de versión, otra organización, migración ausente y no repetir una versión ya completa. No se acredita atomicidad de las escrituras internas de detalles frente a webhooks; tampoco se agrega un barrido de páginas ya confirmadas. Ver BACKFILL-OWNERSHIP.md y la lista separada de pendientes para rollout aislado y límites.

Validación de esta pasada: **1740 pruebas aprobadas, 7 omitidas, 0 fallos**, 144 archivos aprobados y uno omitido. Build de 106 páginas, TypeScript, guards de órdenes/Gold/ts-nocheck, dependencias y diff check aprobados. Sólo se ajustaron comentarios/documentación durante la validación final. Sin push, merge ni cambios externos.

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
### Limpieza de contadores de creadores (2026-09-25)

- Se reemplaza la receta de limpieza comentada por mantenimiento ejecutable desde warm-cache, sin cambiar su programación. Lotes de 500 (máximo admitido 1000), vencimiento anterior a un día, selección bloqueada FOR UPDATE SKIP LOCKED y DELETE en una sola sentencia transaccional. Timeout SQL de tres segundos y transacción acotada.
- Las ventanas activas y los intentos recientes se conservan. creatorAttemptsPurged distingue omitido por presupuesto (null), fallo (-1) y cantidad eliminada. El fallo de mantenimiento queda en fallos y en el latido; la omisión hace que completo sea false.
- Validación: ocho casos nuevos SQL/PGlite y uno del handler, junto con admisión y warm-cache: 36 aprobados. TypeScript, guards y dependencias aprobados. Build aprobado con 106 páginas estáticas. No se repitió la suite completa. PGlite no prueba contención de locks entre sesiones reales.
- Pendientes antes de desplegar: aplicar y verificar la migración en entorno aislado autorizado, permisos DELETE/INSERT/UPDATE, concurrencia real de limpieza y admisión, y capacidad del lote frente a la creación de claves. Si la tabla falta, el acceso sigue devolviendo 503 y el mantenimiento informa fallo. No se aplicó SQL a Neon ni se ejecutó limpieza sobre datos reales.
### Comparaciones del detector de anomalías (2026-09-25)

- El cálculo porcentual requiere base previa positiva y valores finitos no negativos: crecer desde cero ya no inventa +100%. Sin pedidos actuales/previos no se interpreta AOV cero como caída del ticket; sin inversión en ambos períodos no se compara ROAS. CPA exige inversión en ambos períodos. El aumento de gasto sólo afirma falta de crecimiento cuando revenue es comparable o está medido en cero en ambos períodos.
- Se retiraron del helper las afirmaciones de significancia y tasa de falsos positivos (~5%). Se mantienen los umbrales y la fórmula por compatibilidad, documentados como heurística de negocio sin calibración estadística. Esto no valida la distribución de ingresos, los denominadores publicitarios ni el uso de órdenes como proxy para todas las métricas.
- Nueve casos nuevos del detector prueban bases cero, pedidos/inversión ausentes, datos inválidos y alertas que deben conservarse. Con regresiones del cron: 50 aprobados. TypeScript, guards, dependencias y build aprobados (106 páginas estáticas). No se repitió la suite completa. No se ejecutó detección real ni se enviaron correos.
- Bloque de anomalías todavía abierto: períodos comparables, agregación de revenue sin duplicación por items en el cron, cobertura de costo de ambos períodos, denominadores publicitarios y validación de respuestas de IA. Los documentos originales de revisión conservan el historial; este seguimiento es el estado actualizado. No se probó ni se promete una tasa de falsos positivos.
### Facturación sin duplicación en anomalías (2026-09-25)

- Las consultas de facturación de ambos períodos del cron suman directamente orders; se elimina el join a order_items y la columna units no utilizada. Cada pedido válido contribuye una vez, con el mismo contrato de estados y aislamiento por organización. No se usa SUM(DISTINCT totalValue), que omitiría pedidos distintos con el mismo importe.
- Se reprodujo el fallo ejecutando el SQL real del handler en PGlite: el período actual devolvía 300 en vez de 200 y el anterior 320 en vez de 160. El caso incluye múltiples items, pedidos de igual importe, pedidos sin items, otra organización y cancelados. Tras el arreglo, revenue, pedidos, AOV y beneficio derivados coinciden con los esperados (COGS simulado).
- Validación conjunta: 51 pruebas aprobadas; TypeScript, guards y dependencias aprobados. Build aprobado con 106 páginas estáticas. No se repitió la suite completa. No se recalcularon insights históricos ni se consultaron datos reales.
- Siguen pendientes períodos comparables, cobertura de costos de ambos períodos, denominadores publicitarios y validación de IA. Esta corrección no completa todo el bloque de anomalías.
### Integración local de Analytics/NitroPixel (2026-09-26)

- Incorporada la referencia local origin/main 39d93a20 a la rama de correcciones. Se conserva la degradación parcial sin cachear y la persistencia esperada con el prefijo de main. Sin modificar main ni publicar cambios.
- Warm-cache conserva rotación, estados y limpieza con los cinco rangos/cuatro endpoints integrados. Se ajustaron cinco aserciones antiguas y el tipo del plan para organizaciones sin modelo explícito.
- Suite completa inicial: 1598 aprobadas, cinco fallos de contratos antiguos y siete omitidas. Tras ajustes, las 41 pruebas afectadas pasan. Los seis scripts de regresión de Analytics pasan, incluidos 20 casos SQL del funnel. TypeScript, guards de órdenes/Gold y build (106 páginas) aprobados.
- Pendiente comprobar actualización del remoto y E2E con infraestructura aislada. Registro consolidado: PENDIENTES-ACCESOS-EXPANSION.md. La integración no cierra los otros cinco frentes.

### Períodos, costos y salida de IA en anomalías (2026-09-26)

- Dos semanas consecutivas de siete días completos de Argentina, excluyendo hoy. Límites superiores exclusivos también en ads, con claves de fecha explícitas para evitar depender de la zona horaria de PostgreSQL. Incluye timestamps con microsegundos antes del límite.
- Cobertura de costos de ambos períodos sin redondear a 100%; pedidos sin items y costos inválidos no cuentan como completos. Margen sólo se compara con cobertura completa, revenue positivo y valores finitos en ambos períodos. No se envían ganancias/márgenes incompletos al proveedor.
- CPA y ROAS usan volumen de conversiones publicitarias en lugar de órdenes de la tienda; se conservan conversiones fraccionarias. CPA sin conversiones no se presenta como observado. Sigue siendo una heurística, no una prueba estadística.
- JSON de IA validado por tipos, campos, tamaños y métricas permitidas, hasta tres métricas distintas. La evidencia numérica se calcula desde los snapshots; se rechazan métricas sin denominador/cobertura. El texto libre del modelo aún puede ser incorrecto. Fallos del proveedor continúan devolviendo [] y falta representar su disponibilidad por separado.
- Pruebas focalizadas: 87 aprobadas más dos del proveedor simulado. SQL real en PGlite cubre límites, zona horaria, ausencia de items y aislamiento. TypeScript, guards, dependencias y build aprobados. Suite completa en ejecución; no se contactó un proveedor real ni se corrigieron insights históricos.

### Auditoría previa de borrado (2026-09-26)

- Fallos al leer organización, catálogo o dependencias ya no se interpretan como ausencia de datos. Ejecución bloqueada con 503 si faltan metadatos o conteos previos; organización inexistente devuelve 404. Un catálogo vacío no permite declarar una limpieza exitosa.
- Simulacro expone si la auditoría está completa; la respuesta explicita alcance y borradoTotalVerificado:false. Después de ejecutar, ok/completo dependen de la auditoría del alcance revisado, sin afirmar borrado total de todos los datos del cliente.
- Ocho pruebas del handler y 27 del módulo pasan. Sólo dobles locales: ninguna transacción destructiva real. Siguen abiertos dependencias transitivas/propietarios alternativos, retención, concurrencia con ingesta y validación de rollback en PostgreSQL aislado. Exportación/suspensión no quedan cerradas por este arreglo.

Validación conjunta final del bloque (2026-09-26): suite completa con **1649 aprobadas, 7 omitidas, 0 fallos**; 133 archivos aprobados y uno omitido. Build aprobado con 106 páginas. La prueba SQL es PGlite de una sesión, no una validación de concurrencia real.

### Propiedad de backfill, activación y exportación (2026-09-27)

- Backfill: cada claim asigna un token nuevo; progreso/error/finalización requieren token y RUNNING. La actualización de cursor/error es atómica. El runner se detiene al perder propiedad y no dispara finalización. Override staff separado, acotado al onboarding. Migración aditiva preparada y aplicada dos veces sólo a PGlite. Ver BACKFILL-OWNERSHIP.md para límites, rollback y validación multisesión pendiente.
- Aprobación: bloqueo por organización y onboarding, relectura de estado, conexiones/jobs/estado en una transacción. Prueba SQL reproduce fallo del segundo INSERT y comprueba rollback de primer job y conexiones. Selección de plataformas preservada; MercadoLibre sin tokens OAuth no crea jobs. Sigue pendiente revisar contrato completo de plataformas, credenciales cambiadas concurrentemente y duración de verificaciones externas.
- Activación: exige READY_FOR_REVIEW, recolecta readiness en servidor y usa UPDATE condicional con jobs completos. Un cambio concurrente no dispara correo/hooks. Readiness comparte recolección con el endpoint de inspección y distingue consultas fallidas de jobs/conexiones vacíos. El rechazo de correo ya no informa emailSent:true y no devuelve el secreto del hookUrl.
- Exportación: conteos y páginas en transacción RepeatableRead de sólo lectura; cursor por ID en lugar de OFFSET. El stream espera al consumidor y detiene lecturas al cancelarse. Pie de éxito sólo tras cerrar la transacción; error devuelve cierre incompleto. Tres pruebas ejecutan SQL en PGlite con 1001 órdenes, otra organización, items indirectos, credenciales eliminadas y cancelación. Falta medir duración/tamaño sobre PostgreSQL real; una descarga larga mantiene un snapshot abierto.
- Anomalías: configuración ausente, error del proveedor y JSON/envelope inválidos se reportan como análisis contextual no disponible. Se conservan hallazgos por reglas y se marca el cron incompleto con latido fallido. No se realizan llamadas reales a IA. El texto libre y calibración siguen pendientes.
- No se conectó todavía el gate global de suspensión. El código lo sigue declarando seAplica:false; no se presenta una suspensión anotada como efectiva. Borrado transitivo/propietarios alternativos y retención siguen abiertos.
- Controles focalizados, TypeScript, guards de órdenes/Gold/ts-nocheck y dependencias aprobados. Suite completa y build en curso; registrar el resultado al terminar.
Validación del bloque: suite completa con **1678 aprobadas, 7 omitidas, 0 fallos**, 138 archivos aprobados y uno omitido. TypeScript, guards, dependencias y build de 106 páginas aprobados. Después se corrigieron dos casos de borde (selección explícita vacía/inválida y detalle de complete tras perder ownership): las 16 pruebas afectadas y TypeScript pasan; no se repitió la suite completa tras estos dos ajustes. La selección inválida no abre transacciones ni se amplía a todas las conexiones.

### Recuperación y escritura ML por versión (2026-09-28)

- Commits locales e0dbe41b y b35efafd: marca persistente de enriquecimiento, recuperación de la misma versión tras interrupción y persistencia compartida entre backfill y notificaciones. El detalle se escribe en una transacción con bloqueo y comparación de versión; un fallo revierte customer/productos/items/campos del detalle. Las consultas al proveedor ocurren antes del bloqueo.
- Las notificaciones propagan fallos para permitir reintentos; pagos y envíos refrescan la orden canónica. Un evento viejo no enriquece una versión más reciente. Esta garantía no cubre aún todos los escritores ML legacy ni prueba concurrencia multisesión.
- Validación de b35efafd: 1758 pruebas aprobadas, siete omitidas, cero fallos; TypeScript, guards, dependencias y build de 106 páginas aprobados. SQL probado sólo en PGlite. Migraciones preparadas, sin aplicar a Neon. Alcance y límites ampliados en BACKFILL-OWNERSHIP.md.

### Texto visible de anomalías y suspensión (2026-09-28)

- Las anomalías contextuales nuevas conservan selección/tipo/prioridad del modelo, pero título, descripción y acción se construyen desde una plantilla por métrica y valores medidos. No se reutilizan cifras ni causas inventadas, ni instrucciones del modelo para modificar campañas. La comparación no se presenta como causalidad. Puntos porcentuales y porcentajes usan unidades distintas; una base no comparable no inventa crecimiento.
- Seis pruebas nuevas cubren texto contradictorio, causas y acciones inventadas, margen, base cero, pérdidas, comparación plana y unidades. Con contrato y proveedor simulado: 51 aprobadas. No se recalcularon insights históricos. Calibración de selección/prioridad y revisión editorial de reglas preexistentes siguen pendientes.
- Revisión automática rechazó también conectar suspensión desde sesiones Node y reescribir auth-guard por su alcance global. La conexión parcial se retiró; no queda gate activo. Propuesta y matriz de pruebas pendiente de autorización específica en PENDIENTES-ACCESOS-EXPANSION.md. Esa matriz no se ejecutó ni se declara aprobada.
- Validación final: **1764 pruebas aprobadas, siete omitidas, cero fallos** (147 archivos aprobados y uno omitido). TypeScript, guards de órdenes/Gold/ts-nocheck, dependencias y build de 106 páginas aprobados. Sin llamadas reales a proveedores ni cambios en producción.

### Reconciliación ML y revisión de reglas (2026-09-28)

- Reconciliación usa persistencia compartida por versión/fuente. Conserva el watermark ante errores de token, fetch o escritura y páginas inválidas/truncadas, e informa ok:false. No recorta intervalos antiguos sin procesar ni retrocede la frontera por una finalización concurrente anterior. Fetch acotado a 15 segundos por intento.
- Una ventana mayor a 1000 resultados se rechaza como incompleta: falta subdividirla, no se declara procesada. También siguen pendientes el presupuesto total/jitter del cron y recuperación de detalles fuera de las páginas del backfill. Los cuatro escritores legacy inventariados están en BACKFILL-OWNERSHIP.md; no se afirma cobertura global.
- Re-enriquecimiento administrativo valida identidad y resultado: un null o identidad distinta no cuenta como enriquecido ni devuelve ok:true. Una versión básica desactualizada necesita reconciliación antes del reintento.
- Reglas de anomalías: CPA se describe por conversión atribuida, sin equipararlo a clientes únicos/nuevos; AOV habla de importe, no cantidad de productos. Aumentos de facturación/gasto recomiendan revisar evidencia antes de cambiar inversión, y ticket bajo antes de definir promociones. No se alteraron umbrales ni históricos.
- Pruebas focalizadas: 30 de reconciliación/estado/recuperación y 54 de anomalías aprobadas. Dobles de proveedor y SQL local existente; ninguna llamada real. TypeScript, guards y dependencias aprobados. Build aprobado con 106 páginas.
- Suite completa final: **1780 aprobadas, siete omitidas, cero fallos**, 148 archivos aprobados y uno omitido. Sin push, merge, despliegue ni migraciones externas.

### Escritores legacy de órdenes ML (2026-09-28)

- Cron ml-sync, sync manual y backfill manual (órdenes y fees) usan ingestMlOrder en lugar de escrituras duplicadas de órdenes/items. El flujo admite reparar la misma versión, rechaza detalles sobre versiones distintas y confirma enriquecimiento con UPDATE condicional por organización/fuente/versión. Conserva la separación entre básico y detalle: no se afirma atomicidad del proceso completo.
- Se preservan promociones, fees explícitas y fallback de medio de pago. El cron lee una ventana de 72 horas una vez y elimina la inserción de items fuera de transacción. Fallos capturados ya no producen ok:true ni adelantan lastSuccessfulSyncAt. Force-refresh sólo reclasifica la versión exacta; versiones distintas requieren reconciliación previa.
- 44 pruebas focalizadas de ingesta/rutas/transacción/contratos y cinco SQL de force-refresh aprobadas. PGlite verifica protección por versión, organización y fuente, junto con rollback de detalles; no simula locks entre conexiones reales. TypeScript y guards/dependencias aprobados.
- Límites documentados en BACKFILL-OWNERSHIP.md: paginación legacy truncada, duración/cursor del cron, coste adicional de enriquecimiento, revisión de autorización y selección de primera conexión en rutas manuales, recuperación fuera de recorridos y concurrencia PostgreSQL. No se consultaron proveedores reales ni se ejecutaron endpoints externos.
- Validación final: **1802 pruebas aprobadas, siete omitidas, cero fallos**, 151 archivos aprobados y uno omitido. TypeScript, guards, dependencias y build con 106 páginas aprobados. Cambios exclusivamente locales.
