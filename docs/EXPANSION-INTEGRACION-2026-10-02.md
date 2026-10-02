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
