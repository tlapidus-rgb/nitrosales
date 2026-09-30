# Estado final del plan de expansión — revisión del 2026-09-30

> **Qué se revisó.** La branch más avanzada del proyecto: `codex/expansion-review-fixes`,
> commit `db4dbdd6`. Tiene 169 commits sobre `main` (producción, `39d93a20`): los 126 del plan
> y la revisión anterior (Claude, hasta `060607f8`) y 43 que hizo Codex después, que **nadie
> había revisado**. Fast-forward limpio sobre `main`: sin conflictos, `main` no avanzó.
>
> **Veredicto: no está listo para mergear.** El código compila y los tests pasan, pero si se
> mergea tal cual, **en el mismo minuto del deploy se corta la entrada de órdenes de
> MercadoLibre, se frenan todas las altas de clientes y ningún creador puede entrar a su
> panel**. Además apareció un problema de seguridad que **ya está en producción hoy**.

---

## Cómo se revisó

**Lo que corrí yo, de cero, en un checkout limpio de `db4dbdd6`** (sin `.env`, sin conexión a
nada externo):

| Chequeo | Resultado |
|---|---|
| `npx vitest run` | **1.891 pasan, 7 omitidos, 0 fallan** (158 archivos). Coincide con lo que declaró Codex. |
| `npx tsc --noEmit` | limpio |
| `check-ts-nocheck` | la deuda de tipos no creció |
| `check-order-contract`, `check-serve-gold-first` | OK |
| `depcruise` | sin violaciones (899 módulos, 2.860 dependencias) |
| `next build` | compila, genera las 106 páginas |

`prisma generate` no se pudo re-correr (el motor estaba tomado por otro proceso de la misma
revisión); el cliente generado en `npm ci` incluye el modelo nuevo, así que el build es válido.

**Lo que no se pudo correr:** las pruebas de Codex contra PostgreSQL real (Docker Desktop no
arrancó por un error propio) ni nada contra proveedores reales o producción.

**Siete revisores independientes en paralelo**, cada uno con un foco:

1. Ingesta y backfill (con la skill `review`).
2. Seguridad de toda la branch (con la skill `cso`).
3. Lo que ve el cliente: crons, anomalías, Aurum, finanzas, onboarding (con `review`).
4. Mutación: revertir cada arreglo de Codex y confirmar que su test se pone rojo.
5. Completitud: las 33 tareas y los 37 hallazgos, contra el código.
6. Deploy/SRE: qué se rompe al mergear y el runbook.
7. Uno **sin contexto**, para una mirada fresca.

Los hallazgos graves **los verifiqué yo contra el código** antes de ponerlos acá; está marcado
cuál.

---

## 1. Bloqueantes para mergear

### B1 — Cinco migraciones de base que producción no tiene *(verificado)*

El código de Codex usa cinco columnas/tablas nuevas. Ninguna existe en `main`
(`git grep` sobre `origin/main`: cero apariciones) y ningún documento registra que se hayan
corrido en Neon. El build de Vercel no migra.

| Migración | Si el código llega sin ella |
|---|---|
| `backfill_enrichment_version.sql` → `orders."backfillEnrichedVersion"` | **No entra ninguna orden de MercadoLibre.** El upsert de `ml-order-persistence.ts:47` falla entero (inserts incluidos). Lo usan el webhook, `ml-missed-feeds`, `ml-sync`, `ml-reconcile` y el backfill. Un revisor lo reprodujo en PGlite. |
| `backfill_job_lease.sql` → `backfill_jobs."leaseToken"` | **Ningún backfill arranca**: el claim de `job-manager.ts:342` falla. Las altas nuevas quedan trabadas. |
| `ml_sync_progress.sql` | `ml-sync` falla entero en cada corrida. |
| `ml_reconcile_progress.sql` | `ml-reconcile` falla. |
| `creator_password_attempts.sql` | **Ningún creador entra a su panel** (503 a propósito). |

**La parte buena:** las cinco son aditivas e idempotentes (`IF NOT EXISTS`) y el código actual
de producción las ignora. Se pueden correr **antes** del merge sin riesgo, y un rollback del
deploy no obliga a revertirlas.

**Pérdida de datos, no sólo demora:** los webhooks de ML que fallen durante esa ventana no se
reprocesan (un reenvío de ML con el mismo id se descarta como duplicado).

### B2 — El checklist de merge diría "listo" igual *(verificado)*

`src/lib/merge/checklist.ts` y `/api/admin/checklist-merge` no miran ninguna de las cinco. Con
lo demás configurado responde `listo: true` aunque el deploy vaya a cortar ML. Es la
herramienta que se armó para no olvidarse de nada, y se olvida de lo que más rompe. Hay que
sumarle los cinco chequeos como **bloqueantes** (y los permisos: el rol de la app necesita
`DELETE` sobre `creator_password_attempts`).

### B3 — El webhook de ML deja de guardar órdenes cuando falla una consulta secundaria *(verificado)*

Commit `b35efafd`, `ml-notification-processor.ts:125-134`. Para completar SKU y foto, el
webhook consulta `/items/{id}` en ML — casi siempre, porque el payload no trae el SKU.

- **Antes:** si esa consulta fallaba, se logueaba y **la orden se guardaba igual**, sin SKU.
- **Ahora:** no tiene `try/catch`; la excepción corta el proceso **antes** de guardar la orden.

Un 429 o un timeout de ML en esa consulta secundaria hace que la orden no entre. Como el
reenvío se descarta por duplicado, sólo aparece cuando la levanta `ml-reconcile` (cada 2 h).
Esto pasa **aunque las migraciones estén aplicadas**.

### B4 — Hay trabajo de Codex sin commitear que conviene incluir

En su worktree (`nitrosales-expansion-fixes`) hay cambios sin commitear que, según el revisor
de deploy, limitan la configuración automática del Orders Broadcaster de VTEX a producción
(`VERCEL_ENV === "production"`). Sin eso, **activar un cliente desde un preview o desde local
reconfiguraría el VTEX real del cliente**. También hay un test de integración nuevo. Si se
mergea `db4dbdd6`, eso queda afuera. Es de Codex: hay que pedirle que lo cierre.

---

## 2. Seguridad — ya está en producción hoy

### S1 — Cualquier usuario de cualquier cliente puede ver el secreto que firma las sesiones *(verificado)*

`GET /api/me/vtex-affiliate-info` le arma a **cualquier usuario logueado** la URL del webhook
de VTEX con `?key=<NEXTAUTH_SECRET>` adentro. La pantalla de integración VTEX de cada cliente
la muestra para que la copie en VTEX. `src/lib/auth.ts` no define `secret`, así que ese mismo
valor es el que firma los JWT de sesión.

Con ese valor, un usuario de un cliente puede fabricar una sesión de **staff** y entrar a lo
que sólo ve el equipo de NitroSales: otras organizaciones, "ver como" cualquier cliente, y —
con esta branch mergeada — **exportar o borrar otra organización**. Los controles más fuertes
que agrega la branch ("sólo sesión de staff, la clave de admin no alcanza") valen lo mismo que
ese secreto.

- **No lo introdujo la branch**: el archivo es idéntico en `main`. No estaba entre los
  hallazgos de la revisión anterior (los dos endpoints conocidos que filtraban el secreto están
  detrás de la clave de admin; éste no).
- **La branch lo agrava**, porque agrega acciones destructivas que dependen de ser staff.
- **Relación con "no rotar":** la decisión sigue siendo de ustedes y no la re-propongo. Pero
  es un dato nuevo: el secreto no sólo está en `vercel.json`, también **lo tiene cada usuario
  de cada cliente y está pegado en la configuración de VTEX de cada uno**. Dejar de devolverlo
  no requiere rotar: se puede usar una clave de webhook propia por organización y que las
  acciones destructivas vuelvan a leer `isStaff` de la base en vez de confiar en el token.

### S2 — Se puede dejar sin acceso al panel de un creador ajeno *(reportado por el revisor de seguridad, verificado ejecutando su test)*

El límite de intentos de contraseña de creadores (5 por minuto por cuenta) corta **antes** de
mirar la contraseña. Quien conozca `slug` y `code` (el `code` es público: va en los links de
tracking) puede mandar 6 pedidos por minuto y el creador recibe 429 aunque use la contraseña
correcta, todo el tiempo que el atacante quiera. Severidad media.

---

## 3. Riesgos que un cliente notaría (no impiden compilar)

| # | Qué pasa | Dónde | Severidad |
|---|---|---|---|
| R1 | **Un error momentáneo de la base deja a todos los clientes afuera.** La suspensión de organizaciones hace una consulta en *cada* resolución de sesión (y NextAuth la repite cada vez que el usuario vuelve a la pestaña). Si falla, la app entera muestra "No pudimos verificar el acceso" y las APIs dan 401. | `organizacion/session-access.ts:14-29`, `auth.ts:274` (`db4dbdd6`) | Alta (confirmado por 3 revisores) |
| R2 | **Un solo error del proveedor de IA deja a la organización en Aurum básico hasta fin de mes.** Queda una fila de uso sin precio y el cálculo de cuota la trata como "no sé cuánto gastó" → FLASH hasta el día 1. No hay nada que concilie esas filas. | `aurum/consumo-actual.ts`, `aurum/cuota.ts` (`f6fe11cf`, `f0984c94`) | Alta (el revisor lo reprodujo) |
| R3 | **Una orden "envenenada" frena backfill y reconciliación para siempre.** El enriquecimiento pasó de fallar en silencio a fallar la página entera. Si una orden siempre falla (un 404 persistente), la página se reintenta sin fin, el job termina FAILED y la historia más vieja nunca se importa. No hay cuarentena ni tope por orden. | `mercadolibre-enrichment.ts`, `ml-processor.ts:351`, `vtex-processor.ts:305`, `ml-reconcile/route.ts:214` | Media |
| R4 | **La verificación del afiliado VTEX de inventario da falso error**, e indica re-apuntarlo al endpoint de órdenes (que es CORE PROTEGIDO). Si alguien sigue la instrucción, rompe el stock en tiempo real. No bloquea la activación. | `vtex/hooks.ts:164` (`199c50de`) | Media |
| R5 | El sync manual de ML falla entero en vendedores grandes (antes traía un resultado parcial). Sólo el botón manual. | `sync/mercadolibre/route.ts` | Baja |
| R6 | `ml-reconcile` ya no acota cuánto mira hacia atrás; con un watermark viejo el catch-up lleva muchas corridas. | `ml-reconcile/route.ts:120` | Baja |
| R7 | Ruido operativo: el primer reporte de control después del deploy lista crons como "nunca latió"; `warm-cache` puede marcarse como fallido por un solo fetch. | `checks.ts`, `warm-cache` | Baja |

---

## 4. Decisiones que Codex tomó sin pasar por Tomy

Criterio: **cambia lo que ve o recibe un cliente**. Ninguna de éstas figura como aprobada en
`05-DECISIONES-PARA-TOMY.md` ni en los docs de Codex.

| Qué cambió | Hoy en producción | Con la branch | Verificado |
|---|---|---|---|
| **Estado de resultados (P&L)** | Con poca cobertura de costos se ve completo, con un aviso | Con menos de **20%** de costos cargados, **desaparece** (ganancia, márgenes, cascada, tendencia, exportación, CAC/LTV) y queda una vista reducida. Un rango sin ventas (p.ej. "hoy" a la mañana) da cobertura 0 y muestra "falta cargar los costos" a un cliente que los tiene todos. | sí |
| **Alerta "margen bruto se comprimió"** | Sale con más de 20% de cobertura | Exige **100% exacto** en los dos períodos. Un solo producto sin costo en la semana apaga una alerta que hoy manda email. | sí |
| **Textos de anomalías** | Explicación escrita por la IA | Texto genérico ("comparación de períodos… no determina la causa"), en pantalla y en el email. Y si la IA devuelve algo fuera de formato, se descarta todo el análisis de esa organización. | reportado |
| **Aurum ante errores** (era la decisión 7) | Sigue andando | Degrada a FLASH (y 503 si falla el contador). Coincide con mi recomendación, pero va más allá. | reportado |
| **Monitoreo de crons** (era la decisión 4) | — | Se eligió vigilar sólo los 7 crons que ya laten (opción B). **Es lo contrario de lo recomendado**; el cron que motivó la tarea sigue sin vigilancia. | sí (lista de 7) |
| **Activar clientes** | El admin puede activar como override | Exige estado "listo para revisión", todas las conexiones probadas en vivo y todos los backfills completos. Un token vencido en una conexión secundaria bloquea la activación sin salida, salvo tocando la base. | reportado |
| **Suspensión de organizaciones** | No se aplica | Se aplica de verdad, en cada sesión. El doc de Codex dice que se hizo tras un pedido explícito ("hacé los 3"). | sí |

---

## 4b. Calidad de los tests de Codex (auditoría de mutación)

Se revirtió cada arreglo en su línea clave y se miró si su test se ponía rojo: **21 arreglos,
~70 mutaciones**. La gran mayoría se pone roja por el motivo correcto — los leases del
backfill, el borrado con propiedad transitiva, la admisión de creadores, el progreso de ML y la
suspensión están muy bien cubiertos.

**Falsos verdes** (el código de hoy está bien, pero ningún test atraparía que se rompa):

| # | Qué se puede romper sin que ningún test lo note | Consecuencia si pasa | Sev. |
|---|---|---|---|
| T1 | `ml-reconcile/route.ts:214`: sacar `if (stats.errors > 0) break;` | Una orden que falla en la última página se pierde en silencio: el watermark avanza por encima. Los tests sólo miran que no se llame a "completar", nunca qué cursor se guardó. | Alta |
| T2 | `ml-order-persistence.ts`: sacar la guarda `externalUpdatedAt <` | Una notificación vieja de ML pisa el estado y el total de una orden más nueva. Todos los tests mockean esa función. | Alta |
| T3 | `aurum/consumo-actual.ts:16`: volver a poner `.catch(() => [])` | Si falla la consulta del gasto, cuenta $0 y habilita DEEP: el fail-open que el arreglo vino a sacar. | Media |
| T4 | `approve-backfill/route.ts:160`: sacar el filtro de credenciales usables | Una conexión inutilizable queda ACTIVA sin job y los crons intentan usarla. | Media |
| T5 | Los advisory locks de Aurum y de admisión de backfill: cambiarlos por `SELECT 1` | Pedidos concurrentes pasan todos la cuota. Los tests comparan contra la constante, no contra lo que hace. El de backfill sí lo cubre la prueba con PostgreSQL real, que no está en `npm test`. | Media |
| T6 | `finanzas/estado/page.tsx:1367`: desconectar el gate del P&L desde la página | Se testea el componente, no que la página lo use. | Media |

Menores: `READ ONLY` de la exportación, el resultado posterior de `borrar-todo`, el diagnóstico
de `collectReadiness` ante un error, y el corte de admisión tomado antes del lock.

---

## 5. Qué falta — lista única

### a) Trabajo técnico que no necesita decisiones

1. **Sumar las 5 migraciones al checklist de merge** como bloqueantes, con permisos (B2).
2. **Restaurar el `try/catch` del webhook de ML**: que la orden se guarde aunque falle la
   consulta de SKU (B3).
3. Cuarentena o tope de reintentos para órdenes que fallan siempre en el enriquecimiento (R3).
4. Corregir la verificación del afiliado VTEX de inventario (R4).
5. Que la verificación de suspensión no bloquee a todos ante un error transitorio de la base
   (caché corta o tolerancia) — o decidir explícitamente que así se quiere (R1).
6. Conciliar las filas de uso de Aurum sin precio o pendientes (R2).
7. Que el límite de contraseña de creadores no bloquee al que acierta (S2).
8. Llevar los 14 crons que comparan la clave directo a `isValidAdminKey` (condición para
   cualquier rotación futura), o corregir `PLAN_EXPANSION.md`, que dice que ya no cortan.
9. Que Codex commitee su trabajo pendiente (B4).
9b. Tests para los seis falsos verdes de la sección 4b (T1 y T2 primero).
10. **Sincronizar los documentos de seguimiento**: ninguno se actualizó después del
    2026-09-20. `PLAN_EXPANSION.md` dice 23 de 33 y "la cadencia sale de vercel.json" (ya no);
    `CLAUDE_STATE.md` y `docs/ESTADO-BRANCH-INTEGRACION.md` hablan de 1.245 y 1.362 tests;
    `BACKLOG_PENDIENTES.md` da los 37 hallazgos como abiertos; `04-` y `05-` presentan como
    pendientes R-13 y R-16, que Codex ya resolvió.
11. Codex borró comentarios explicativos en castellano (`rate-limit.ts`, `aurum/cuota.ts`,
    `piso-de-volumen.ts`) y dejó otros en inglés. Menor.

### b) Decisiones de negocio

1. **Ratificar o revertir las siete de la sección 4.**
2. **S1**: cómo dejar de entregar el secreto a los clientes (y si eso cambia la decisión de no
   rotar).
3. Las que ya estaban pendientes y siguen abiertas: borrado de la organización y
   `wipe-account` (R-07/R-08), factor √2 de anomalías (R-14), wizard de Shopify/Tiendanube y
   altas sólo Ads/NitroPixel (R-23/R-24/R-29), cursor de `reattribute` (R-22), si el Orders
   Broadcaster bloquea el alta (R-26), fecha del pixel "recibió antes" (R-27b), recálculo del
   techo (R-36).
4. Del plan: qué hace el campo `plan` (E-22), qué plataformas se soportan (E-31), alertas
   externas tipo Sentry (E-20), retención de datos (`email_log`, leads, logs de login).
5. Autorización del fundador para el cambio en `metrics/pixel/route.ts` (CORE PROTEGIDO): vino
   del PR #9, ya en producción, y de la resolución del merge.

### c) Requiere producción o credenciales (lo hace una persona)

1. **Hoy, sin esperar el merge:** verificar que `SYNC_KEY` existe en Vercel. El fail-open de
   cinco crons (R-01) sigue en producción.
2. Correr las 5 migraciones en Neon **antes** del merge (runbook abajo).
3. Configurar `ALERTAS_EMAILS` y el resto del checklist de merge.
4. Un entorno de prueba (preview con base aislada y cuentas sandbox de VTEX/ML/Ads) para
   probar lo que ningún test local cubre: el alta de punta a punta y los contratos de
   paginación de los proveedores. Hoy no existe.
5. Medir el próximo alta real (E-32).

---

## 6. Estado de las 33 tareas del plan

Verificado contra el código de `db4dbdd6`, no contra lo que dicen los documentos.

- **Hechas:** E-01 a E-06, E-08, E-11 a E-19, E-21, E-23 a E-27, E-29. Varias las endureció
  Codex (E-08 con lease, E-15 conectada a la activación, E-25 extendida al P&L, E-27 conectada
  a la sesión).
- **Parciales:** E-07 (la ventana de rotación existe, pero 14 crons no la usan), E-20 (sin
  alertas externas; cambió de diseño), E-28 (borrado sí, retención no), E-30 (falta la ingesta
  común con atribución para los escritores que no son ML), E-33 (5 de 6; el que falta depende
  de E-32).
- **No hechas / bloqueadas:** E-09 (bloqueada: `pixel_daily_channel` vacía), E-10
  (desaconsejada), E-22 y E-31 (decisión), E-32 (se hace en el próximo alta).

**Los 24 arreglos de la revisión anterior siguen en pie.** Codex tocó archivos de 9 de ellos y
en ninguno deshizo el arreglo; en varios lo reforzó.

---

## 7. Runbook de merge (para cuando se autorice)

`[N]` = una persona en la consola de Neon. `[V]` = en Vercel.

**Antes**
1. Resolver B3, B2 y B4, y las decisiones de la sección 4 que se quieran revertir.
2. `[N]` Crear un punto de restauración de Neon (branch o snapshot).
3. Confirmar que no hay backfills corriendo ni altas en curso. La migración de leases pide
   drenar los workers viejos.
4. `[N]` Correr las cinco migraciones, cada una precedida de `SET lock_timeout = '3s';`
   (la de `orders` toma un lock exclusivo breve; si hay una consulta larga, espera y bloquea a
   las demás). Si una da timeout, reintentar: son idempotentes.
5. `[N]` Verificar en `information_schema` que las cinco existen y que el rol de la app tiene
   permisos, incluido `DELETE` en `creator_password_attempts`.
6. `[N]` Mirar el consumo de Aurum del mes por organización contra el tope nuevo (USD 100).

**Merge**
7. Fast-forward de `main`. Deploy automático.

**Después**
8. `[V]` `POST /api/admin/migrate-cron-cursors`.
9. `[V]` Corrida manual de los dos crons Gold con `?full=1`.
10. Verificar en las primeras dos horas: logs sin `column … does not exist`, órdenes nuevas de
    MercadoLibre entrando por webhook, `backfill-runner` respondiendo 200, un panel de creador
    con clave abriendo, un usuario cliente (no staff) entrando sin el cartel de acceso.

**Rollback**
11. `[V]` Instant Rollback al deploy anterior. **No revertir las migraciones**: son aditivas y
    el código viejo las ignora. Si había organizaciones suspendidas, el rollback las reactiva.

---

## 8. Lo que se revisó y está bien

- **Aislamiento entre clientes:** el borrado con propiedad transitiva no puede alcanzar datos
  de otra organización; la exportación filtra todo por organización; las queries nuevas de
  ingesta filtran por `organizationId`; el sync manual de ML ahora toma la organización de la
  sesión (en producción tomaba la primera conexión global — esto corrige un problema).
- **Sin SQL injection** en los `$queryRawUnsafe`/`$executeRawUnsafe` nuevos.
- **Concurrencia de backfill:** leases con token, claim bajo lock, el runner re-chequea la
  propiedad del job en cada vuelta, cooldown mayor que la duración máxima.
- **Particiones de ventanas** de VTEX y ML sin huecos.
- **Anomalías:** ya no duplica facturación por el JOIN con ítems; fechas en hora Argentina.
- **Emails:** no se envía nada nuevo a clientes; digest y alertas ya no dan por entregado un
  mail rechazado.
- **Archivos `@ts-nocheck` modificados:** imports y variables revisados a mano.
- **CORE PROTEGIDO:** Codex no tocó ninguno.
- **Sin TODO/FIXME nuevos.**

---

## 9. Límites de esta revisión

- Nada se probó contra PostgreSQL real, proveedores reales ni producción. Que las migraciones
  no estén en producción se infiere de que ningún documento las registra, no de mirar la base.
- La frecuencia real de R1, R3 y B3 depende de cuántos errores devuelvan Neon, ML y VTEX en la
  práctica; el mecanismo está verificado, la frecuencia no.
- El revisor sin contexto y el de "lo que ve el cliente" terminaron antes de un corte por
  límite de uso; los otros cinco se cortaron y se retomaron con su contexto intacto.
- La auditoría de mutación cubrió 21 de los 42 commits de Codex, elegidos por riesgo.
