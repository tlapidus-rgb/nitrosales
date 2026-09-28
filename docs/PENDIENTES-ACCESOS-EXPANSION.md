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
2. Backfill: admisión y ownership implementados con pruebas SQL locales; persistencia por versión compartida con notificaciones, reconciliación y tres importadores legacy. Force-refresh compara versión exacta. Reconciliación no adelanta watermark ante errores/truncamiento. Faltan paginación legacy verificable, subdividir ventanas de reconciliación mayores a 1000 resultados, presupuesto/cursor del cron, recuperación de detalles fuera de los recorridos, concurrencia multisesión y rollout aislado. También revisar autorización y selección de organización de las rutas manuales. Ver BACKFILL-OWNERSHIP.md.
3. Onboarding: readiness conectado a activación, aprobación transaccional y detección de cambios concurrentes de credenciales/períodos implementados; quedan contrato completo de plataformas y recorrido completo.
4. Ciclo de organización: exportación consistente, auditoría y borrado transitivo por FKs simples implementados con pruebas sintéticas; faltan gate global de suspensión, propiedades sin FK/JSON, retención y validación aislada con escritores concurrentes.
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

Antes de activar: inventariar los 251 usos encontrados de getOrganization/getOrganizationId en APIs, verificar llamadas de mantenimiento sin sesión y medir la consulta adicional por organización. Matriz de pruebas requerida: sesiones ya abiertas, suspensión/reactivación sin renovar JWT, org inexistente, base indisponible, JSON inválido, staff, view-as, impersonación, sesión ausente con una sola org y ausencia de recursión. Se requiere autorización específica para este cambio amplio, además de validación en preview aislado. Esta matriz es trabajo pendiente, no un resultado de pruebas aprobado.
