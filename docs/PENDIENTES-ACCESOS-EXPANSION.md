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

1. Integración local de main: resolución y validación en curso, conservando caché/degradación parcial y optimizaciones.
2. Backfill: admisión local corregida; ownership y prueba multisesión todavía abiertos.
3. Onboarding: readiness corregido parcialmente; aprobación/plataformas y recorrido completo abiertos.
4. Ciclo de organización: exportación, borrado y suspensión requieren cerrar hallazgos de código y validación aislada.
5. Migraciones/E2E: preparar y verificar localmente todo lo posible; ejecución PostgreSQL y preview pendientes.
6. Anomalías: facturación y bases cero corregidas; períodos, cobertura de costos y salida IA en curso.

Este registro no declara los seis frentes terminados ni habilita producción.
