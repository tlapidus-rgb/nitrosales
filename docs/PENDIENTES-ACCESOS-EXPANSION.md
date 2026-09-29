# Estado y pendientes de expansión — 2026-09-29

Trabajo exclusivo en `codex/expansion-review-fixes`. No push, merge, despliegue ni cambios en producción. El usuario pidió completar los tres bloques; confirmó que no existe entorno externo aislado y no decidió el alcance de altas sólo Ads/NitroPixel.

## Cerrado localmente

- Suspensión conectada al callback Node, incluidos JWT existentes; acceso de soporte preservado e impersonación bloqueada. Sin fallback single-org. El rechazo automático anterior quedó superado por el pedido explícito de hacer los tres bloques. No se aplicó el diseño de middleware con self-fetch.
- ml-sync y ml-reconcile con cursores/ownership; las tres rutas manuales ML usan organización de sesión; sync/trigger propaga la organización a Meta/Google.
- Creado PostgreSQL Docker descartable local: cuatro migraciones repetidas y ocho casos reales de concurrencia/rollback aprobados.
- Smoke HTTP de Next con base y sesiones sintéticas: suspensión/reactivación y APIs comprobadas.
- main remoto coincide con `39d93a204c2d54730e886bae2be710718ec54e10`. Consulta de sólo lectura.
- Suite: 1891 aprobadas, siete omitidas; build y tipos correctos. Evidencia, reproducción y límites en EXPANSION-VALIDACION-LOCAL.md.

## Pendientes que requieren entorno, credenciales o decisiones

| Pendiente | Necesidad concreta | Qué falta |
| --- | --- | --- |
| Proveedores | Cuentas/credenciales de sandbox de VTEX, ML y Ads; correo a destinatarios de prueba | Verificar filtros inclusivos, paginación, credenciales, webhooks y entrega real. No reutilizar cuentas productivas |
| Preview externo | Proyecto independiente y base aislada, si se requiere comprobar comportamiento de Vercel | No existe según el usuario. El smoke local no acredita runtime/protección/scheduler de Vercel |
| Recorrido completo | Entorno anterior y fixtures de negocio | Onboarding extremo a extremo, visual, exportación/borrado a volumen y escritores concurrentes; no equivalen al smoke de sesión |
| Retención/borrado | Propiedad y plazos para email_log, leads, logs sin usuario, copias y proveedores | Propuesta en EXPANSION-DECISIONES-Y-ROTACION.md; sin borrado real ni promesa de borrado total |
| Altas sólo Ads/NitroPixel | Decidir alcance del producto sin órdenes | Usuario respondió «No sé». Se conserva rechazo explícito actual; no inventar backfill ni activar por omisión |
| Rotación de secretos | Configuración de emisores/receptores en entorno autorizado y coordinación posterior de producción | Inventario de 29 cron paths con clave en query y plan sin valores preparados. No se rotó ningún secreto real; producción sigue prohibida |
| Anomalías | Datos autorizados y criterio de negocio | Calibrar selección/prioridad, revisar textos históricos; no inferir causalidad de fixtures |

Las decisiones están preparadas; no aprobadas por ausencia de respuesta. No se necesita volver a autorizar la implementación local de suspensión, ya realizada. Estos pendientes no son todos simples permisos: incluyen validación y decisiones reales.

## Antes de cualquier despliegue posterior

Verificar migraciones en la base de destino autorizada, permisos SELECT/INSERT/UPDATE, drenar workers antiguos, conservar tablas/columnas para rollback y probar scheduler/contratos. El éxito local no autoriza despliegue ni borrado de organizaciones. Ver BACKFILL-OWNERSHIP.md y EXPANSION-RETENCION-PROPIEDAD.md.
