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
