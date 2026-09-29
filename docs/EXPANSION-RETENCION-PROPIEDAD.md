# Propiedad y retención: revisión local (2026-09-29)

Este inventario sale de schema.prisma y el código de borrado; no sustituye el catálogo de una base real. No autoriza borrado, retención legal ni cambios de producción.

| Superficie | Propiedad observable | Tratamiento / pendiente |
| --- | --- | --- |
| Modelos con organizationId, incluido JSON de settings/credentials | Columna de organización | El plan dinámico los descubre por columna. JSON alojado en esas filas desaparece con la fila; revisar retención antes de ejecutar. |
| OrderItem | FK a Order y Product | Plan transitivo comprueba ambos caminos y bloquea propiedad cruzada. Validar catálogo real. |
| BotMessage.metadata | FK a BotChat | Propiedad por chat; el JSON no necesita borrarse por clave separada cuando se elimina la fila. |
| AudienceSyncLog.metadata | FK a Audience | Propiedad por audiencia; verificar derivados en proveedores externos aparte. |
| PixelVisitorAlias | FK a PixelVisitor | Propiedad transitiva; requiere catálogo completo. |
| InfluencerCommissionTier | FK a Influencer | Propiedad transitiva; validar dependencias reales. |
| LoginEvent con userId | FK nullable a User, SET NULL | El plan transitivo puede alcanzar filas vinculadas antes de eliminar usuarios. No basta con confiar en SET NULL. |
| LoginEvent sin userId | Email/IP/UA sin vínculo de organización | No hay una atribución segura a una sola organización. Definir retención/anonimización por producto; no borrar por coincidencia de email sin revisar cuentas compartidas. |
| CreatorPasswordAttempt | Clave sin organización/FK y vencimiento | Limpieza por vencimiento ya implementada. No inferir propiedad por una clave opaca. |
| ExchangeRateDaily / InflationIndexMonthly | Datos globales sin organización | No atribuir a un cliente. |
| email_log / leads | Datos de contacto; excepciones explícitas del plan | Decidir retención/anonimización; no declarar borrado total mientras sobrevivan. |
| Tablas creadas por rutas migrate-* y SQL fuera de Prisma | Sólo catálogo real puede confirmar columnas/FKs | Revisar simulacro en base aislada. El esquema local no acredita el inventario productivo. |
| Cachés, proveedores y archivos externos | Sin garantía por FKs de PostgreSQL | Inventariar entorno autorizado y definir purga/retención con responsable. |

El módulo mantiene borradoTotalVerificado:false. No corresponde cambiarlo a true basándose sólo en este inventario. Los tests de rollback, caminos transitivos, propietarios alternativos y restricciones compuestas cubren el motor local; no cubren escritores concurrentes ni la retención de sistemas externos.

Decisiones concretas pendientes: plazo y alcance para logs de login sin usuario, email_log y leads; manejo de identidades compartidas; derivados externos; ventana/protocolo de pausa de escritores durante borrado. Hasta decidirlo, no añadir DELETE por heurísticas de texto/JSON/email.
