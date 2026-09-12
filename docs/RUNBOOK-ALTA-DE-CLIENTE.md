# Runbook — Alta de un cliente, de punta a punta

> Creado el 2026-09-07 (E-18). Los seis runbooks que existían son recetas de SQL para construir la
> capa Medallion; **no había ninguno operativo**. Este es el primero.
>
> Todo lo que está acá se verificó contra el código, no contra la memoria de nadie.

---

## 0. Lo que más se olvida, primero

**Registrar el Orders Broadcaster de VTEX es el paso que rompe todo si falta.** Ya pasó: TeVe
Compras entró con **0 de 8 órdenes atribuidas** porque nadie lo registró.

> ### ✅ Desde el 2026-09-12 no hace falta correrlo a mano, pero SÍ hay que verificarlo
>
> `activate-client` configura el Orders Broadcaster solo al activar un cliente. El problema es que
> **si falla, no bloquea nada**: deja un flag en la respuesta y sigue. Por eso el paso que queda es
> comprobar que haya quedado bien:
>
> ```
> GET /api/admin/onboardings/<id>/readiness?verificarWebhook=1
> ```
>
> El item `webhook-vtex` contesta una de cinco cosas, y cada una se arregla distinto:
>
> | Qué dice | Qué pasó | Qué hacer |
> |---|---|---|
> | **ok** | Está bien configurado y con el `org` correcto | Nada |
> | **No hay hook** | No se configuró, o el POST falló | `POST /api/admin/vtex-configure-broadcaster?orgSlug=<slug>` |
> | **Falta el `?org=`** | El caso TeVe Compras. Las órdenes llegan y no se pueden atribuir | Reconfigurar con el mismo POST |
> | **Lleva el `org` de otro cliente** | ⚠️ **Las órdenes de este cliente se están contando como del otro.** Los dos tienen los números mal | Reconfigurar YA y revisar las órdenes ya ingresadas de **los dos** |
> | **Apunta a otro dominio** | El cliente tiene otra integración conectada | **Hablar con el cliente antes de pisarlo**: VTEX guarda un solo hook por cuenta, así que configurarlo borra el que está |
>
> La verificación es opt-in porque llama a la API de VTEX y tarda. Sin el parámetro, el semáforo
> dice "sin verificar" en amarillo — que no es lo mismo que "está bien".

VTEX tiene **dos** mecanismos de webhook y hay que configurar los dos, cada uno con `?org=<orgId>`
en la URL. El de arriba cubre el segundo; **el de Afiliados sigue siendo manual**:

| Mecanismo | Dónde | Qué manda |
|---|---|---|
| **Afiliados** | VTEX Admin → Config tienda → Pedidos → Config → tab "Afiliados" | Cambios de SKU e inventario |
| **Orders Broadcaster** | Automático al activar; se verifica con el semáforo | Estados de orden: creada, pagada, facturada, cancelada |

Ver qué hay configurado hoy:

```bash
curl -H "X-VTEX-API-AppKey: $KEY" -H "X-VTEX-API-AppToken: $TOKEN" \
  "https://{account}.vtexcommercestable.com.br/api/orders/hook/config"
```

**Si la URL registrada no termina en `?org=<orgId>`, las órdenes llegan y no se sabe de quién son.**

Síntoma de que falta: el cliente ve las órdenes históricas del backfill y **ninguna nueva**. No hay
error, no hay alerta. `vtex-sync-recent` (cada 30 min) tapa parte del agujero, pero no la atribución.

---

## 1. El flujo completo

```
wizard público                  → onboarding_requests = PENDING
admin "Activar"                 → crea org + usuario, manda credenciales → NEEDS_INFO
admin "Aprobar backfill"        → crea backfill_jobs (QUEUED)            → BACKFILLING
cron backfill-runner (1×/min)   → procesa chunks
todos los jobs completos        → post-backfill-finalize + READY_FOR_REVIEW
admin "Habilitar"               → configura el Orders Broadcaster, manda mail → ACTIVE
```

**Dos puntos donde el flujo espera a un humano** y el cliente no ve nada moverse:
`BACKFILLING` (espera al cron) y `READY_FOR_REVIEW` (espera un click).
Desde 2026-09-07 los dos están vigilados por `control-alerts` (cada 6 h), con umbrales de 12 h y 6 h.

### Antes de aprobar el backfill

```
GET /api/admin/onboardings/<id>/readiness
```

Es el semáforo (E-15). Contesta las cinco cosas que antes había que chequear en cinco pantallas:
credenciales, pixel, webhook de VTEX, backfill y órdenes. Cada item que no está en verde dice
**qué hacer**.

`listo: false` con `bloqueantes > 0` significa que hay algo que arreglar antes de habilitar.

---

## 2. "El cliente dice que ve todo en cero"

En orden, del más común al menos:

### a) ¿Tiene órdenes?

```
GET /api/admin/onboardings/<id>/readiness
```

Si `órdenes: 0` con el backfill en `COMPLETED`, el backfill corrió y no trajo nada: revisar
credenciales, el rango de fechas pedido, y que la cuenta tenga ventas en ese período.

### b) ¿El backfill quedó trabado?

```
GET /api/cron/backfill-runner?key=<ADMIN_API_KEY>
```

Si devuelve `admitido: false`, **el freno funcionó y nadie se enteró**. Los motivos posibles:

| `motivo` | Qué pasó | Qué hacer |
|---|---|---|
| `fuera-de-ventana` | `BACKFILL_VENTANA` está seteada y estamos fuera | Esperar, o `&ignorarVentana=1` |
| `otro-backfill-corriendo` | Hay otro job activo (el default es 1 a la vez) | Esperar; si lleva horas, ver abajo |
| `base-lenta` | La latencia de Neon pasó el umbral | Mirar la carga de la base |

Si un job quedó zombie, el runner lo mata solo a los 30 min sin progreso y lo reporta en
`abandonados`. `control-alerts` avisa a las 3 h de un job en `QUEUED`.

### c) ¿El P&L está en cero pero las órdenes están?

Falta `Product.costPrice`. Lo puebla `post-backfill-finalize`, que se dispara solo al completar el
último job:

```
GET /api/cron/post-backfill-finalize?orgId=<orgId>&key=<ADMIN_API_KEY>
```

Es idempotente: correrlo de más no rompe nada.

### d) ¿El panel de NitroPixel muestra ceros?

`/api/metrics/pixel` devuelve **HTTP 200 con ceros** en tres casos: timeout global, cache miss con
el lock tomado por otro request, y excepción del handler. **Ninguna de las tres pantallas distingue
eso de "no hubo ventas"** — es un agujero conocido, todavía abierto.

Para descartarlo, mirar el JSON crudo: si trae `_timeoutMs`, `_error` o `_degraded`, los ceros son
falsos.

---

## 3. Verificar que el pixel está sano

```
GET /api/nitropixel/install-status
```

O directo:

```sql
SELECT COUNT(*) FROM pixel_events
 WHERE "organizationId" = '<orgId>' AND timestamp >= NOW() - INTERVAL '48 hours';
```

**El checkbox "ya pegué el snippet" del wizard no verifica nada** — el backend lo descarta. La única
verificación real es que hayan llegado eventos.

Si hay eventos pero el panel muestra poco, el problema suele ser la atribución, no la ingesta:
mirar `pixel_attributions` para esas órdenes y correr `attribution-reconcile`.

---

## 4. Pedido de borrado de datos

**No hay un endpoint que lo haga completo.** Lo que existe:

- `/api/admin/orgs/<orgId>/wipe-account` — borra los datos de la organización.
- La retención de `pixel_events` **no existe todavía** (es E-09): hay eventos desde 2024 en la tabla
  caliente.

Al recibir un pedido, verificar a mano que no queden filas en: `orders`, `order_items`, `customers`,
`pixel_events`, `pixel_visitors`, `pixel_attributions`, `silver_orders` y las tablas `gold_*`.

**Esto es deuda conocida** — E-28 lo cubre y todavía no se hizo.

---

## 5. Después de mergear la branch del plan

Hay **cuatro** acciones manuales que, si no se hacen, dejan cosas apagadas **en silencio**:

| Acción | Si no se hace |
|---|---|
| `POST /api/admin/migrate-cron-cursors` — **antes** de mergear el código que la usa | Los cursores de los crons no guardan nada: a algunos clientes no les corre nunca |
| `ALERTAS_EMAILS` en Vercel (separadas por coma) | Todas las alertas siguen yendo a una sola casilla. Si esa casilla manda a spam, el sistema pierde su único sentido de la vista |
| `BACKFILL_VENTANA=1-7` en Vercel *(opcional)* | El backfill corre a cualquier hora. Los otros dos frenos sí están activos solos. **Horas enteras: `1-7`, NO `01:00-07:00`** — el parser rechaza el segundo y un valor que no parsea significa "sin restricción" |
| `?full=1` en los dos crons de atribución Gold | Quedan las huérfanas históricas acumuladas |

> La lista de referencia es `docs/ESTADO-BRANCH-INTEGRACION.md`. Si las dos difieren, gana aquella.

---

## 6. Lo que este runbook no cubre, y hay que saber

- **`NEXTAUTH_SECRET` es el mismo literal que está en `vercel.json`**, verificado contra producción.
  Con ese valor se puede forjar una sesión de staff. La rotación está pendiente y tiene un orden
  estricto: rotarlo antes de que el webhook de VTEX tenga su propio secreto **corta la ingesta de
  órdenes de los cuatro clientes, en silencio**. Ver R-C07/08/09.
- ~~**El wizard no valida credenciales.**~~ **Desactualizado, corregido el 2026-09-08.** Desde E-13
  el submit **sí valida VTEX** (`src/lib/onboarding/validacion-wizard.ts`), sin botón de "probar" y
  sin mostrar errores crudos, que era lo que la decisión de UX quería evitar. Las otras tres
  plataformas no se validan **a propósito**: sus credenciales las pone el callback de OAuth del lado
  del servidor y no viajan en el wizard.
- ~~**Un `.sql` de backfill por cliente vive en el disco de Axel.**~~ **Desactualizado, corregido el
  2026-09-08.** Es E-17 y **está hecha**: el SQL está parametrizado en
  `src/lib/pixel/first-source-repair.ts` y se corre con
  `POST /api/admin/pixel/repair-first-source?org=<id>`. El `CASE` de clasificación se importa de la
  misma fuente que usa el cron, así que no puede divergir.

> ⚠️ **Estas dos entradas estuvieron mal durante un día** y decían que el bus factor seguía siendo 1
> cuando la tarea que lo arreglaba ya estaba hecha. El runbook se escribió el mismo día que los dos
> commits que lo invalidaron. **Es el único documento de este plan que se usa sin un técnico al
> lado**, así que conviene revisarlo cada vez que se cierra una tarea de la FASE E2.
