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

- Rama aislada creada desde el commit auditado; checkout de Claude preservado.
- Primer arreglo implementado: MercadoLibre divide primero hacia la mitad reciente y luego continúa hacia atrás, sin omitir la mitad superior. Subdivide también picos dentro de un día y reporta error si no puede separar más el intervalo.
- Validación del primer arreglo: los cuatro casos de regresión fallaron antes del cambio y pasan después; junto con los tests del mapeo ML son 14 casos aprobados. API y persistencia simuladas, sin llamadas reales a MercadoLibre o Neon.
- Límite operativo: esto no repara históricos ya completados con el algoritmo anterior. Antes de desplegar debe identificarse qué jobs requieren reiniciarse desde su rango original. No se modificaron cursores ni datos existentes.
- Las decisiones de producto (planes, nuevas plataformas, retención, suspensión) y cambios externos se separan de los defectos técnicos para que no bloqueen los arreglos independientes.
