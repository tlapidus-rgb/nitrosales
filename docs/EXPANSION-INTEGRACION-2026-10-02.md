# Integración local de expansión y hotfix — 2026-10-02

Rama de trabajo: `codex/expansion-integrated`, checkout `C:/Users/axelf/github/nitrosales-integrated`.
Integra `claude/listo-para-merge` (`99395ac4`) y `claude/hotfix-admin-key` (`49bc5caa`).
Sin push, cambios a main, despliegue ni operaciones de producción. Los worktrees de Claude y los cambios locales de Codex originales se preservaron.

Este documento actualiza el estado técnico de la integración; los informes anteriores conservan el contexto histórico. Se copiaron las tres actualizaciones documentales locales de Claude al nuevo checkout, sin modificar sus originales.

## Resuelto en la integración

- Conflictos resueltos preservando suspensión, identidad verificada contra DB y permisos de staff.
- Reatribución conserva organización obligatoria y límite de 2.000 registros por llamada; reconciliación exige organización explícita y elimina el fallback a la primera organización.
- fix-brands exige organización explícita, conserva la organización al continuar y aísla credenciales/base y caché de categorías de VTEX por solicitud; pruebas intercaladas y con IDs de categorías compartidos entre dos organizaciones.
- Alertas: el cron y el endpoint comparten una función de consulta; no hay self-fetch contra una ruta bloqueada por el nuevo gate. API exige staff y cron conserva su autenticación propia.
- Migración de cursores exige sesión de staff en GET/POST.
- Continuación de recuperación de emails VTEX conserva destino preview, cookie y headers de protección; rechaza redirecciones.
- Guard de rutas administrativas usa scanner TypeScript: un glob en un comentario ya no oculta imports al test.
- Pruebas integradas adaptadas a las nuevas validaciones sin eliminar controles de autorización.
- Harness PostgreSQL incluye la quinta migración y el runbook SQL exacto repetido; cancelación de exportación comprueba cualquier transacción abierta.

## Validación

- Suite completa: **2.387 aprobadas, 7 omitidas**, 188 archivos aprobados y uno omitido (183,47 s). Incluye los ocho casos de fix-brands.
- Build Next final: correcto, **106 páginas**; incluye verificación TypeScript. Comando directo para no regenerar el cliente Prisma compartido.
- Contrato de órdenes: baseline 15, sin nuevas infracciones.
- Serve Gold: baseline 19, sin nuevas infracciones.
- `@ts-nocheck`: 290, no creció.
- Dependencias: sin violaciones, 903 módulos / 2.910 dependencias.
- `git diff --check`: correcto; no quedan conflictos de merge.
- No se editaron los cuatro archivos CORE protegidos durante esta integración.
- Evidencia local sin versionar: `.integration-tests-final.log`, `.integration-build-final.log`.

El primer intento de suite había detectado dos fixtures del hotfix incompatibles con la exigencia de organización de expansión. Se corrigieron sin relajar permisos y se repitió la suite completa. La revisión posterior añadió regresiones para organización explícita, continuaciones y contexto/caché por solicitud. No se ejecutaron pruebas de proveedores ni PostgreSQL real en esta tanda.

## Pendientes externos y decisiones (no ejecutados)

1. PostgreSQL real local: Docker no arrancó por el problema local previo. No se resetearon sockets, volúmenes ni configuración. Ejecutar `vitest.postgres.config.ts` con el opt-in y la instancia descartable fija del harness; luego smoke HTTP. Las ocho pruebas reales del 29 de septiembre corresponden a una versión anterior y no validan estos cambios.
2. Preview y proveedores: no existe entorno externo aislado según el usuario. Se requieren base/proyecto de prueba y credenciales sandbox para recorrido completo, webhooks, scheduler y correo de prueba.
3. Antes de publicar: validar/aplicar las cinco migraciones y permisos en el destino expresamente autorizado, drenar workers anteriores y ejecutar el runbook. Ninguna migración se aplicó a Neon desde esta tarea.
4. Decisiones de producto siguen en `revision-2026-09/09-PARA-TOMY.md`: finanzas sin costos, umbral de alertas, comportamiento de Aurum ante uso no medido, monitoreo, activación/VTEX fallido y alcance sólo Ads/NitroPixel. No se adoptaron opciones propuestas por ausencia de respuesta.
5. Seguridad operacional: el hotfix mitiga accesos pero no acredita cierre del secreto expuesto ni configuración efectiva de Vercel. No se cambiaron secretos, permisos externos ni claves reales.
6. Retención, borrado de cuenta y copias externas siguen sujetos a definición de propiedad/plazos.

Los tests locales no autorizan publicar ni prueban por sí solos el comportamiento de proveedores o de producción.


## Actualización: siete commits adicionales de Claude

Se integra el lote fijo `49bc5caa..cfad5ef4` de `claude/hotfix-admin-key` sobre la rama de preview previamente subida (`50becf74`). La autorización del usuario incluye actualizar esa misma rama para Vercel/Neon; no autoriza main ni producción.

- OAuth Meta/Google requiere sesión de la organización y nonce en cookie httpOnly; elimina el inicio anónimo con orgId y destinos externos. MercadoLibre valida el destino de retorno.
- Los textos de confirmaciones y correos escapan HTML de datos ingresados por usuarios.
- Las métricas de Pedidos usan exclusivamente organización de sesión; se conserva además validación del id antes de SQL. Products/rate-summary/asset-stats usan credencial interna para warm-cache y sesión para uso normal.
- Warm-cache conserva planificación por rango/rotación y limpiezas de expansión; manda credencial interna sólo en header para los endpoints modificados. Se evita también exposición de IDs en el detalle de frescura añadido por expansión y errores de resultados. El endpoint CORE pixel conserva su contrato anterior y el riesgo operativo previamente documentado.
- ml-test sólo admite staff verificado; sin bypass por clave de cron.
- Conflictos de cuatro archivos resueltos sin sustituir la lógica de rendimiento por las versiones antiguas.
- Tests de correo simulan validación del proveedor para no ejecutar VTEX; contrato de Orders actualizado al acceso por sesión y regresión de id de sesión inválido.

Validación final del lote: **2.451 pruebas aprobadas, 7 omitidas**, 193 archivos aprobados y uno omitido (172,52 s). Build correcto: **106 páginas**, con TypeScript verificado. Guards: order-contract 15, serve-gold-first 19, ts-nocheck 290; dependencias sin violaciones (906 módulos / 2.930 dependencias). Diff sin errores ni conflictos pendientes. Evidencia local sin versionar: `.claude-seven-tests-final.log` y `.claude-seven-build-final.log`.

Los tres subagentes de revisión de esta tanda no pudieron ejecutar por límite de uso. La revisión y resolución de conflictos se completaron directamente, con pruebas dirigidas y suite completa. No se declara una revisión paralela que no ocurrió.

Los bloqueos de base de datos/proveedores/decisiones del documento siguen vigentes. Este lote valida código local, no la base de Neon ni el deployment. Antes de pruebas externas se debe confirmar la base aislada y las integraciones del preview.

## Validación externa en la copia de Neon — 2026-10-02

Esta actualización supera los bloqueos históricos de acceso a Neon descritos arriba. La rama `codex/expansion-integrated` ya fue subida con el lote completo y el preview identificado corresponde al commit `113497a3d5ce9732584fa3bbb7ed03fdfde4734c`. Main y producción no se modificaron.

- Entorno comprobado por las CLI oficiales: deployment READY de `codex/expansion-integrated`, y Neon `preview/codex/expansion-integrated`, no primary ni default, reseteada por el usuario. Ambas variables de conexión del preview apuntan a su endpoint aislado (pooled y directo).
- La copia reseteada no tenía las cinco migraciones. Se aplicaron sólo allí, una sentencia por transacción con lock_timeout de 3 s y statement_timeout de 15 s, y se repitieron sin errores. Las nueve comprobaciones del runbook dan true. Backfills RUNNING en esta copia: cero; no se consultó ese estado en producción.
- PostgreSQL real: **18 casos aprobados** (28,03 s), incluyendo backends concurrentes distintos, admisión global, leases obsoletos, ML sync/reconcile, rollback del watermark, snapshot repetible, runbook exacto dos veces, exportación de 10.001 órdenes, cancelación, borrado por organización y rollback ante conflictos/fallos tardíos.
- El harness temporal usa bases descartables con nombres aleatorios y datos sintéticos. Un primer intento por esquema no aisló las consultas raw y se detuvo en CREATE TABLE por una relación existente, sin insertar ni borrar datos de clientes; se cambió a bases propias y se repitieron todos los casos. Confirmación posterior: cero bases y cero esquemas de fixtures pendientes.
- Los IDs de las cuatro organizaciones clonadas cumplen el formato del guard de Pedidos (conteos agregados, sin exportar datos de clientes).
- Smoke HTTP anónimo del deployment: `/api/auth/session` devuelve 200 con sesión vacía; migración de cursores y `ml-test` devuelven 401 sin ejecutar operaciones. Pedidos rechaza el acceso, pero devolvía 500 por falta de sesión. Se añadió manejo específico de NoOrganizationError para devolver 401 y evitar reintentos; errores reales de DB conservan 500. Regresión observada roja (500 frente a 401 esperado) y verde tras el arreglo.
- Evidencia local ignorada: `.gstack/neon-validation/results.log`, harness temporal y logs de suite/build. No se guardaron connection strings ni valores de credenciales en estos archivos.

### Pendientes que permanecen

1. **Integraciones sin aislamiento:** el preview hereda variables compartidas con producción de Resend, VTEX, Google Ads/GA4, Meta y Anthropic. Se comprobaron sólo nombres/alcances; no se llamaron proveedores, no se enviaron correos y no se modificó la configuración de Vercel. Hace falta definir credenciales sandbox o bloqueos efectivos antes de probar esos flujos. La copia de DB también puede contener configuraciones de conectores reales.
2. **Recorrido autenticado en el deployment:** la automatización de navegador sigue fallando por el problema local de permisos; la sesión iniciada en Opera GX no estuvo accesible. Los tests de autorización con DB real y el smoke anónimo no sustituyen ese recorrido en pantalla.
3. **Publicación:** las migraciones siguen pendientes en producción; el resultado de la copia no acredita sus permisos ni el drenado de workers reales. No hay autorización de merge ni de cambios en producción.
4. Las decisiones de producto y retención previamente listadas siguen pendientes. Esta validación no las resuelve ni acredita el cierre del riesgo documentado en CORE Pixel.

Validación final del arreglo HTTP: **2.452 pruebas aprobadas, 7 omitidas** (193 archivos aprobados y uno omitido, 188,98 s). Build Next correcto, 106 páginas y TypeScript verificado; guards 15/19/290 y dependencias sin violaciones (906 módulos, 2.930 dependencias). El arreglo se publica exclusivamente en la rama de preview; no se considera listo para producción hasta resolver los pendientes externos anteriores.
