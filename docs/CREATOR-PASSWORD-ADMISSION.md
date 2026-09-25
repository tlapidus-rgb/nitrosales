# Admisión de contraseñas de creadores

Implementación local en `codex/expansion-review-fixes`. No se aplicó la migración ni se modificó infraestructura.

## Contrato

`/verify`, el dashboard, GET de contenido y POST de contenido usan el mismo contador PostgreSQL. Hay dos presupuestos independientes: cinco intentos por creador y treinta por IP, por minuto. Los intentos en vuelo reservan cupo. Una clave correcta devuelve sólo su reserva en la ventana original; nunca borra los fallos de otras solicitudes. Una clave incorrecta conserva el intento consumido. Las solicitudes bloqueadas reciben 429 con Retry-After. Si no se puede consultar el contador, se devuelve 503 y no se verifica la clave.

La IP debe venir de un proxy confiable que reemplace X-Forwarded-For. No se afirma protección por IP frente a un origen accesible que acepte ese encabezado del cliente. El límite por creador sigue siendo independiente de la IP. Una ráfaga puede bloquear temporalmente a un creador durante un minuto: es el costo de un límite por cuenta y debe evaluarse en la prueba operativa.

La interfaz envía la clave codificada en un encabezado para los GET. Los handlers todavía aceptan el parámetro de URL para clientes abiertos antes del despliegue; eliminar esa compatibilidad queda para un despliegue posterior. Las respuestas con métricas/contenido son privadas y no almacenables. Se conserva el formato de hash existente, con comparación de tiempo constante. La migración de hashes es independiente.

## Requisitos antes de desplegar

1. Aplicar `prisma/migrations/creator_password_attempts.sql` en un entorno aislado autorizado. Es una tabla aditiva sin credenciales, organizaciones ni IPs en texto: sólo claves SHA-256, contadores y vencimientos. Validar el esquema y los permisos del usuario de la aplicación.
2. Probar dos procesos/conexiones PostgreSQL concurrentes y comprobar que el sexto intento de una cuenta no verifica la clave. Las pruebas PGlite validan SQL y handlers, pero no demuestran concurrencia entre sesiones independientes.
3. Validar la limpieza integrada en warm-cache: hasta 500 claves por ejecución, vencidas hace más de un día, con selección bloqueada mediante FOR UPDATE SKIP LOCKED y timeout SQL de tres segundos. El resultado creatorAttemptsPurged es null si se omite por presupuesto, -1 si falla y un número no negativo si se ejecuta. Una falla afecta el latido del cron. Verificar permisos DELETE y que warm-cache tenga margen para ejecutarla; observar acumulación y ajustar capacidad antes de desplegar. La limpieza acotada no garantiza absorber cualquier volumen de ataque.
4. Medir latencia de ingreso y del refresco del dashboard. Un acceso válido hace dos reservas y dos devoluciones de contador. Probar login, contenido, envío, recarga y errores 429/503 en navegador.
5. Aplicar la migración antes de desplegar código. Si falta, el acceso protegido devuelve 503 deliberadamente. Para rollback, restaurar primero el código; no es necesario borrar la tabla inmediatamente.

No se aplicó este procedimiento en Neon/Vercel. No se deben reutilizar credenciales reales en las pruebas. Las decisiones de rotación de secretos y migración de contraseñas quedan abiertas.
