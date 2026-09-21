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
