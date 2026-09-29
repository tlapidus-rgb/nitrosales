# Validaciones y autorizaciones pendientes

Trabajo exclusivo en codex/expansion-review-fixes. No merge a main, push, despliegue ni cambios en producción autorizados. Los pedidos externos se agrupan aquí; no bloquean las correcciones locales.

| Pendiente | Acceso o decisión necesaria | Para qué | Estado |
| --- | --- | --- | --- |
| Actualidad de main | Lectura de GitHub/fetch | Comparar con la referencia local 39d93a20 usada para integrar Analytics y NitroPixel | Pendiente; no se consultó el remoto |
| PostgreSQL aislado | Base descartable o Docker/PostgreSQL local disponible; permiso de DDL sólo allí | Aplicar migraciones, verificar rollback, locks entre conexiones, carreras de admisión y recuperación de backfill | Pendiente; PGlite no acredita concurrencia real |
| Preview independiente | Entorno no productivo con base aislada y cuentas de prueba | Recorrer onboarding, suspensión, exportación y simulacro/borrado de una organización sintética | Pendiente; un preview conectado a producción no sirve para estas pruebas |
| Proveedores | Credenciales de sandbox y destinatarios de prueba autorizados | Contratos VTEX/ML, correo e IA; sin usar datos ni destinatarios reales | Pendiente; pruebas locales usan dobles |
| Retención y borrado | Decisión de producto sobre datos retenidos (email_log, leads y derivados externos) | Definir alcance verificable antes de habilitar un borrado total | Pendiente; no se elimina información real |
| Secretos publicados anteriormente | Autorización y responsable de rotación fuera del código | Sustituir credenciales en plataformas y configuración, sin copiarlas a documentos | Pendiente; no se rotaron secretos |

## Alcance de los seis frentes

1. Integración local de main: integración 1f12e598 validada localmente, conservando caché/degradación parcial y optimizaciones.
2. Backfill/ML: ownership, cursor persistente y rotación de ml-sync implementados; lectura legacy y reconciliación dividen ventanas densas. Reconciliación también reintenta detalles incompletos. Las tres rutas manuales revisadas usan organización de sesión. La sustitución completa de ml-reconcile fue rechazada. La alternativa acotada conserva el lector, autorización y contratos y añade checkpoint por página en una tabla separada; quedó implementada localmente el 29/09. Quedan validación PostgreSQL multisesión, capacidad/timeout integral y contratos reales de sandbox. Ver BACKFILL-OWNERSHIP.md.
3. Onboarding: readiness conectado a activación, aprobación transaccional y detección de cambios concurrentes de credenciales/períodos implementados; quedan contrato completo de plataformas y recorrido completo.
4. Ciclo de organización: exportación consistente, auditoría y borrado transitivo por FKs simples implementados con pruebas sintéticas; falta gate global de suspensión y decisión de propiedad/retención para filas sin vínculo seguro; inventario local en EXPANSION-RETENCION-PROPIEDAD.md. Validación aislada con escritores concurrentes pendiente.
5. Migraciones/E2E: preparar y verificar localmente todo lo posible; ejecución PostgreSQL y preview pendientes.
6. Anomalías: facturación y bases cero corregidas; períodos comparables, cobertura de ambos períodos, denominadores publicitarios y contrato IA corregidos localmente; fallos del proveedor ya se reportan como incompletos. El nuevo texto contextual se genera desde las métricas medidas, sin reutilizar cifras/causas/acciones libres del modelo. Siguen pendientes calibración, revisión de textos históricos y validación con datos autorizados.

Este registro no declara los seis frentes terminados ni habilita producción.

## Suspensión: cambio rechazado por revisión automática

La revisión automática rechazó conectar un gate global de middleware mediante self-fetch, por posible recursión y riesgo de indisponibilidad general si falla la consulta. Ese parche no se aplicó. Falta revisar una alternativa de autenticación con alcance y comportamiento ante fallos comprobados, cubrir sesiones ya abiertas, impersonación y rutas con API key, y verificarla en un preview aislado. La excepción existente de `/api/auth/` debe formar parte de la prueba de ausencia de recursión; no resuelve por sí sola la dependencia de disponibilidad. No se solicita autorizar un despliegue del diseño rechazado.

El endpoint local ahora rechaza `cortarIngesta:true`, conserva configuraciones ajenas mediante actualización JSON atómica y declara el bloqueo de acceso desconectado. Esto no sustituye el gate pendiente.

## Decisiones de alcance y validación agrupadas

- Definir si altas sólo de publicidad/NitroPixel (sin VTEX/ML ni historia) deben activar sin backfill de órdenes. El flujo actual las rechaza de forma explícita; no se inventa un job ni se decide un nuevo producto por código.
- Definir retención/anonimización de email_log, leads, settings y datos externos. Las dependencias compuestas se bloquean hasta clasificar su propiedad; un catálogo incompleto nunca habilita borrado.
- Confirmar en sandbox la semántica de fechas inclusivas, paging.total, credenciales y muestras VTEX/ML. Los fixtures prueban la implementación, no el contrato real del proveedor.
- El token de job no cerca upserts de negocio ya iniciados. Revisar una estrategia compartida de versiones/recuperación con webhooks y probar intercalados multisesión; un reintento por página no da ejecución exactamente una vez.
- Calibrar la selección, tipo y prioridad de anomalías con datos autorizados. El texto contextual nuevo usa comparaciones deterministas y pasos de revisión; no demuestra causalidad ni calibración estadística. Se corrigieron reglas que confundían conversiones con clientes, importe con cantidad de productos y recomendaban cambiar presupuestos sin revisar evidencia. Los insights históricos no se reescribieron.
- Medir exportación consistente y borrado transaccional a volumen realista en base descartable. Evitar activar borrado mientras haya escritores concurrentes sin un protocolo de quiescencia validado.

Estos pendientes incluyen decisiones y trabajo técnico aún abierto; no son todos simples pedidos de credenciales ni una declaración de finalización local completa.

Migración adicional pendiente: `prisma/migrations/backfill_enrichment_version.sql`. Validar primero en PostgreSQL aislado, junto con `backfill_job_lease.sql`. La recuperación ML de enriquecimientos ahora tiene marca persistente por versión; faltan la carrera multisesión con webhooks, medición del reintento de registros antiguos y reconciliación fuera de las páginas que el job recorre. No se aplicó esta migración a Neon ni a ningún entorno externo.

## Autorización específica pendiente — acceso por sesión (2026-09-28)

La revisión automática también rechazó la alternativa sin self-fetch: reescribir globalmente auth-guard y activar el filtro de sesiones. Motivo: cambia numerosos endpoints y puede interrumpir flujos; considera insuficiente la autorización general para continuar. La conexión parcial en auth.ts se retiró, el guard original permanece y EL_GATE_ESTA_CONECTADO sigue false. No se usó otra vía para aplicar el cambio rechazado.

Propuesta concreta a autorizar después: comprobar settings de la organización al resolver sesiones Node; conservar acceso del staff real para soporte, aplicar el bloqueo al impersonar un cliente y retirar la identidad de sesiones suspendidas/no verificables. Eliminar el fallback que selecciona la única organización sin sesión. Mostrar un estado de suspensión/reintento en la aplicación. Webhooks y crons deben seguir resolviendo una organización explícita con su propia autorización; no cortar ingesta. No incluye deploy.

Inventario AST realizado el 29/09: 243 llamadas directas al guard en 170 archivos route.ts (excluye comentarios), detalladas en EXPANSION-AUTH-SUSPENSION-INVENTARIO.md. No hay llamadas directas en cron/webhooks, pero sí rutas intermedias por HTTP. Se corrigió sync/trigger para pasar organizationId a Meta/Google. Antes de activar todavía falta completar la revisión transitiva de mantenimiento y medir la consulta adicional por organización. Matriz de pruebas requerida: sesiones ya abiertas, suspensión/reactivación sin renovar JWT, org inexistente, base indisponible, JSON inválido, staff, view-as, impersonación, sesión ausente con una sola org y ausencia de recursión. Se requiere autorización específica para este cambio amplio, además de validación en preview aislado. Esta matriz es trabajo pendiente, no un resultado de pruebas aprobado.


## Reconciliación persistente — aprobación específica pendiente (2026-09-29)

La revisión automática rechazó reemplazar completamente api/cron/ml-reconcile: consideró demasiado amplio el cambio sobre autenticación, watermark, leases y procesamiento multi-organización, y objetó retirar cobertura de contrato. El comando no se ejecutó. Se retiraron los preparativos de tipos/tabla para separar modos, conservando únicamente el cursor aprobado de ml-sync. No se intentó otra vía.

Propuesta histórica (no aplicada): reutilizar el procesador por páginas para last_updated con cursor/lease independientes para incremental/deep; conservar la autenticación actual, importar la frontera anterior sin recortes y publicar el watermark sólo al completar todo el rango. Mantener pruebas de acceso, mapeo de estados por delegación, contratos de respuesta, ownership, recuperación y organización. No incluye deploy. La versión actual sigue guardando watermark sólo tras éxito y subdivide ventanas, pero reintenta desde la frontera previa si agota presupuesto.

Estado al 29/09: la alternativa acotada de reconciliación fue aceptada por la revisión automática y está implementada localmente; no se reemplazó el endpoint ni se retiraron contratos. El gate global de suspensión volvió a ser rechazado porque la revisión automática no considera «seguí» una autorización específica suficiente. No se ejecutó ninguna parte de ese comando. Sigue pendiente una autorización inequívoca que mencione el cambio de autenticación/suspensión global, exclusivamente local y sin despliegue.

Nueva migración preparada: prisma/migrations/ml_sync_progress.sql. Probada dos veces en PGlite; aplicar y comprobar en PostgreSQL aislado antes de desplegar ml-sync. No se aplicó a Neon. Se necesitan permisos de SELECT/INSERT/UPDATE en esa tabla y el procedimiento de drain/rollback de BACKFILL-OWNERSHIP.md.


## Reconciliación: alternativa acotada implementada (2026-09-29)

Tabla adicional `ml_reconcile_progress`, independiente de `ml_sync_progress`: conserva pila de ventanas, offset y total observado, límites originales y lease por organización/modo. La autenticación admin-key/staff, la ingesta versionada, el filtro last_updated y los contadores anteriores se conservan. Al cambiar el total, reinicia esa ventana; tras error conserva la página sin declarar cobertura. El último checkpoint vacío y el watermark se completan con ownership en una operación SQL atómica. Se retienen los tests anteriores y se agregan pruebas de reanudación, permisos y SQL.

Pendiente externo: aplicar `prisma/migrations/ml_reconcile_progress.sql` en base aislada junto con las migraciones anteriores, validar contratos y concurrencia, permisos SELECT/INSERT/UPDATE y drain antes del despliegue. Sin esta tabla el endpoint reporta fallo; no hace fallback silencioso a un recorrido sin cursor. No se ejecutó DDL externo. La búsqueda del proveedor no ofrece un snapshot local: un total estable no prueba ausencia de movimientos entre páginas, y los contratos/tie-break de fechas deben verificarse en sandbox. Presupuesto cooperativo: una operación ya iniciada puede sobrepasarlo.
