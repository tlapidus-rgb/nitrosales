# E-08 — Control de admisión del backfill de alta

> Branch `feat/backfill-alta-controlada` · 2026-09-06 · **sin mergear**

## El problema

El momento de mayor riesgo para los clientes que **ya están adentro** es cuando entra uno nuevo.
El backfill de Arredo trajo 252.701 órdenes y tumbó Neon repetidas veces
(`BACKLOG_PENDIENTES.md` → BP-NEON-CAPACITY).

`backfill-runner` corre **cada minuto** con `maxDuration = 300`, así que puede haber hasta 5
invocaciones solapadas. Y además `approve-backfill` lo dispara al instante con `waitUntil`. Sobre
eso había dos agujeros:

1. **El claim no era atómico.** `pickNextJob()` hacía un `SELECT` y `markJobRunning()` un `UPDATE`,
   en dos queries. Entre una y otra, otra invocación corría el mismo `SELECT` y salía con el **mismo
   job**: el chunk se procesaba dos veces, en paralelo. El "lock" por frescura de `lastChunkAt` no
   servía para un job en `QUEUED` — todavía no tenía ninguno.
2. **No había límite de nada.** Con varios jobs encolados (las 4 plataformas de un cliente, o dos
   clientes la misma semana) cada invocación tomaba uno distinto y los corría en paralelo contra la
   misma base.

## Lo que hace ahora

Antes de tocar un solo chunk, el runner se pregunta tres cosas:

| Pregunta | Variable | Default | ¿Prendido? |
|---|---|---|---|
| ¿Estamos en la ventana horaria? | `BACKFILL_VENTANA` | *(sin setear)* | **No** — opt-in |
| ¿Hay otro backfill corriendo? | `BACKFILL_MAX_CONCURRENTES` | `1` | **Sí** |
| ¿La base responde bien? | `BACKFILL_LATENCIA_MAX_MS` | `2000` | **Sí** |

Si alguna dice que no, el runner devuelve **200** con `admitido: false` y el `motivo`. **No es un
error**: los jobs quedan en `QUEUED` y el próximo tick (1 min) reintenta.

El freno por latencia además se re-evalúa **entre chunks**: si la base empieza a sufrir mientras
corremos, soltamos con el cursor guardado y el próximo tick retoma donde quedó.

### Por qué esos defaults

Lo que sólo puede **demorar** trabajo va prendido: el límite de concurrencia y el freno por latencia
nunca pierden nada, sólo posponen. La ventana horaria, en cambio, es **política de negocio** — define
si un alta aprobada a las 3 de la tarde arranca recién de madrugada — así que va apagada salvo que se
configure. Prenderla por default cambiaría el comportamiento del alta sin que nadie lo haya pedido.

Un `BACKFILL_VENTANA` mal escrito (`"1a7"`, `"25-3"`) se trata como **sin restricción**, a propósito:
un typo que congelara el backfill para siempre no lo notaría nadie hasta que el cliente reclame.

## Cómo se opera

**Para prender la ventana de madrugada** — en Vercel → Settings → Environment Variables, para
Production:

```
BACKFILL_VENTANA=1-7
```

Son horas **argentinas**, `desde-hasta`, y se puede dar la vuelta al día (`22-6`). Con esto, un alta
aprobada de día queda encolada y arranca a la 1 de la mañana.

**Para forzar que arranque ya**, salteando sólo la ventana:

```
GET /api/cron/backfill-runner?key=<ADMIN_API_KEY>&ignorarVentana=1
```

`ignorarVentana` **no** saltea el límite de concurrencia ni el freno por latencia: es para "necesito
que arranque ahora", no para atropellar la base.

**Para ver por qué no arranca**, mirar la respuesta del runner:

```json
{ "ok": true, "admitido": false, "motivo": "fuera-de-ventana", "horaAr": 15, "ventana": "1-7" }
{ "ok": true, "admitido": false, "motivo": "otro-backfill-corriendo", "jobsActivos": 1 }
{ "ok": true, "admitido": false, "motivo": "base-lenta", "latenciaMs": 3400, "umbralMs": 2000 }
```

Si aprobaste un backfill y "no arrancó", el `motivo` lo explica. No hay que buscar un error: casi
siempre es el freno haciendo su trabajo.

## Tests

- `src/lib/backfill/admision.test.ts` — 23 casos de la lógica pura: parseo de la ventana (incluida la
  que da la vuelta al día y los valores inválidos), los defaults, y el orden en que se evalúan los
  frenos. Cubre explícitamente **dos clientes nuevos la misma semana**.
- `src/lib/backfill/job-claim.test.ts` — 10 casos del claim atómico contra Postgres de verdad
  (PGlite), no contra strings de SQL: que dos invocaciones no se lleven el mismo job, que un job
  abandonado se recupere, que terminar lo empezado tenga prioridad sobre empezar otro.

Verificado que el bug era real: reproduje el `SELECT` viejo en dos pasos y devuelve el mismo job las
dos veces.

`tsc` 0 · `vitest` 434 passed · `next build` 0.

## Lo que NO cubre

- **El bootstrap de MercadoLibre** (`/api/sync/mercadolibre/bootstrap`) lo dispara
  `approve-backfill` **en paralelo** al runner, y no pasa por este control de admisión. Es carga
  menor comparada con un backfill de órdenes, pero es una segunda fuente de trabajo pesado en el
  mismo momento. Queda anotado como pendiente.
- **La cola sigue siendo FIFO global**, sin noción de prioridad por organización. Con `maxConcurrentes
  = 1` eso alcanza: un cliente grande no compite con otro, sólo lo hace esperar. El modelo de cola por
  unidad `(organización, tabla, día)` es E-10, y el plan dice explícitamente que no se arranca antes
  de cerrar el gate.
- **No hay alerta** si un backfill queda frenado muchas horas seguidas (por ejemplo, ventana mal
  puesta más nadie mirando). Hoy se ve consultando el runner a mano.
