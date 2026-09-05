# Estudio de ESCALABILIDAD — ¿cuántos clientes aguanta NitroSales?

**Commit:** `9ad4616d` (= `origin/main` = producción) · **Fecha:** 2026-09-05 · **Alcance:** solo lectura.
No se ejecutó ninguna query contra producción, no se llamó ningún endpoint, no se tocó ningún archivo del repo.

**Punto de partida:** la sección "(c) Orden de caída proyectado a 3× de escala" de
`docs/auditoria-2026-09/review-performance.md:511-551`. Ese documento proyecta *dos* escenarios (Arredo ×3,
y 5 Arredos). Este documento hace lo que faltaba: **poner un número al eje que importa para vender —
la cantidad de organizaciones— y decir en qué N exacto se rompe cada cosa.**

**Escala de referencia (de `CLAUDE_STATE.md:56-64` y `:87-89`):** Arredo `cmohl80fx…` = 24M `pixel_events`
/ 43 GB / 1,3M eventos por semana / 1,2M visitantes / 252.701 órdenes. Otras 3 orgs, chicas.
Neon Max 4 CU (16 GB RAM), autosuspend 5 min. Pool real 24 (`src/lib/db/client.ts:59`).

> **Nota metodológica.** Los tiempos por-org que uso salen del propio repo (comentarios que registran
> mediciones de incidentes reales). Todo lo que no tiene una medición atrás va marcado **ESTIMADO**.
> Los precios de Neon y Vercel son de mi conocimiento del mercado y están marcados **ESTIMADO — VERIFICAR**:
> son órdenes de magnitud para decidir, no una factura.

---

# 1. El número titular

## El sistema aguanta hoy entre 8 y 10 organizaciones — y **exactamente un** cliente del tamaño de Arredo

Y hay tres formas distintas de decir el mismo límite, todas verificables en el código:

### 1.1 El límite duro: el rollup del pixel

`refresh-pixel-rollups` procesa **una tabla de rollup × un día × TODAS las orgs** por invocación
(`src/app/api/cron/refresh-pixel-rollups/route.ts:233-236`), iterando org por org
(`src/lib/pixel/rollup-backfill.ts:381-390`).

El dato clave, y es el más importante de todo este documento:

```
src/lib/pixel/rollup-backfill.ts:381-390
async function backfillDay(d, orgs, table) {
  for (const org of orgs) {
    touched += await backfillDayOrg(d, org, table);   // ← NO hay chequeo de tiempo acá
  }
}
```

**El loop de orgs no mira el reloj.** El presupuesto se chequea una sola vez por *día*
(`rollup-backfill.ts:520-528`), antes de arrancar. Una vez que el día arranca, recorre las N orgs
completas pase lo que pase. O sea: **el presupuesto de 250s (`route.ts:141`) no protege contra
"muchas orgs" — protege contra "muchos días".** El único freno real cuando hay muchas orgs es el
wall de Vercel a ~300s (documentado en `route.ts:132-140`: "la función SIEMPRE muere a ~340s").

Aritmética, con los tiempos medidos que el propio código registra
(`route.ts:132-140`: "un día = 7 tablas × orgs (~500s org grande)"; "funnel ~170s el más caro";
`rollup-backfill.ts:443-445`: "funnel ~190s el más caro"):

| Entrada | Valor | Fuente |
|---|---|---|
| Costo de 1 tabla-día para Arredo (promedio) | 500s ÷ 7 tablas = **71s** | `refresh-pixel-rollups/route.ts:135-137` |
| Costo de la tabla más cara (`funnel`) para Arredo | **170-190s** | `route.ts:137` / `rollup-backfill.ts:444` |
| Costo de 1 tabla-día para una org chica | **~8s** ESTIMADO (Arredo tiene ~100× el volumen; asumo 1/20 del costo, no 1/100, por el piso fijo del planner) | ESTIMADO |
| Presupuesto que devuelve limpio | 250.000 ms | `route.ts:141` |
| Wall real de Vercel | ~300s (muere a ~340s) | `route.ts:132-136` |

**Ceiling con la tabla `funnel` (la que manda):**

```
190s (Arredo) + 8s × S (orgs chicas) ≤ 250s   →   S ≤ 7    →  8 orgs en total (retorno limpio)
190s (Arredo) + 8s × S               ≤ 300s   →   S ≤ 13   → 14 orgs en total (antes del wall)
```

**Y con dos Arredos:** `190 × 2 = 380s > 300s`. **Se rompe el día que entra el segundo cliente grande,
sin importar cuántos clientes haya en total.**

Todas chicas: `250 ÷ 8 = 31 orgs` (limpio) / `300 ÷ 8 = 37` (wall).

### 1.2 Por qué "se rompe" significa que **nunca más se arregla solo**

Cuando `funnel` deja de entrar en una invocación, la función muere a ~340s **sin avanzar el cursor**.
La tabla queda atrasada. Y el selector de rotación elige "la MÁS atrasada"
(`route.ts:238-260`, `MIN(MAX(day))`). Entonces `funnel` **gana la elección en todas las corridas
siguientes**, consume las 4 invocaciones/hora de Vercel + las 6 de GitHub Actions
(`.github/workflows/keep-pixel-rollups-fresh.yml:40`), y **las otras 6 tablas nunca reciben turno.**

Esto no es una hipótesis: es el incidente `BP-ROLLUP-CHANNEL-STARVATION-2` textual, documentado en
`route.ts:184-197`, donde `pixel_daily_channel` se volvió "tabla veneno" y las 7 monitoreadas
quedaron stale 22→27h con mails de frescura al cliente. Ahí la causa fue un bug (tabla vacía).
**A escala, la causa va a ser la cantidad de clientes, y no hay un `ROTATION_TABLES.filter()` que lo tape.**

Síntoma para el cliente: `/pixel/analytics` con el funnel en cero o congelado, y correos automáticos
de frescura (umbral 8h, `warm-cache/route.ts:105`).

### 1.3 Quién sufre primero: **el cliente que acabás de vender**

La lista de orgs del rollup sale ordenada:

```
src/lib/pixel/rollup-backfill.ts:495-497
SELECT DISTINCT "organizationId" org FROM pixel_visitor_first_source ORDER BY 1
```

`organizationId` es un `cuid()` (`prisma/schema.prisma`), y el cuid lleva el timestamp de creación
en los caracteres 2-9 en base36 → **orden lexicográfico ≈ orden cronológico**. Se verifica con los ids
del repo: El Mundo `cmmmga1uq…` (más viejo) < Arredo `cmohl80fx…` (más nuevo).

Consecuencia: **cuando el presupuesto se agota, siempre se corta en la cola de la lista, y la cola es
siempre el cliente más nuevo.** El cliente que Tomy acaba de firmar es el que ve la app vacía en la
semana de onboarding. El mismo patrón (sin `ORDER BY`, pero con orden estable de la tabla) está en
`refresh-silver-orders/route.ts:58-60`, `refresh-pixel-name-dict/route.ts:43` y
`refresh-product-dimensions/route.ts:156-159`.

### 1.4 Hay tres cosas que **ya están rotas hoy, con 4 clientes**

No son proyecciones. Son lecturas del código a la escala actual:

| Qué | Evidencia | Cuántas orgs entran hoy |
|---|---|---|
| **`/api/sync/chain`** — `maxDuration = 60`, itera orgs secuencial, cada org consume hasta 55s de presupuesto interno (`chain/route.ts:14`, `:47`, `:60`, `:78`, `:157-161`) | `sync/chain/route.ts:13` | **1 org.** Y como reinicia desde el tope de la lista en cada corrida, las orgs 2..N **nunca** corren inventory/details/reconcile |
| **`warm-cache`** — 8 fetches/org (4 rangos × 2 endpoints, `warm-cache/route.ts:163-171` y `:235-238`), abort a 20s por fetch (`:244`), presupuesto 220s (`:247`). El compute de `/api/metrics/pixel` de la org grande tarda >85s (`metrics/pixel/route.ts:79-86`) → los 8 fetches de Arredo abortan a 20s = **160s de los 220** | `warm-cache/route.ts:244-252` | **~1,4 orgs.** Arredo se come el 73% del presupuesto y no calienta nada (además de C3: calienta una key que `/pixel/analytics` no lee) |
| **`attribution-reconcile`** — 40 órdenes/org × ~6s = 240s ≈ el presupuesto entero de 250s | `attribution-reconcile/route.ts:33`, `:51` | **1 org por invocación.** Cada 30 min → ciclo = N × 30 min |

---

# 2. Trabajo que escala con la cantidad de organizaciones

Esta es la tabla central. "N máx" = a partir de cuántas orgs el cron deja de completar su vuelta.
Los costos por org marcados ESTIMADO no tienen medición en el repo; los otros sí.

| Cron | Cadencia | Presupuesto | ¿Itera orgs? | Costo/org grande | Costo/org chica | **N máx** | Qué pasa al pasarse |
|---|---|---|---|---|---|---|---|
| **`refresh-pixel-rollups`** | `3,18,33,48 * * * *` + GH Actions ×6/15min | 250s (wall 300s) — **el loop de orgs no lo chequea** (`rollup-backfill.ts:381-390`) | ✅ todas | **190s** (funnel) / 71s (prom.) | ~8s ESTIMADO | **8 limpio / 14 wall** · **2 si ambas son Arredo** | Muere a ~340s, cursor clavado, `funnel` gana toda elección futura → las 7 tablas stale → mails de frescura |
| **`sync/chain`** | `30 */2 * * *` | **`maxDuration = 60`** (`chain/route.ts:13`) | ✅ todas, secuencial | hasta 55s | hasta 55s | **1** | Orgs 2..N nunca sincronizan inventario/precios. **Ya roto hoy** |
| **`/api/sync`** | `0 3 * * *` | `maxDuration = 60` (Anexo A #1, `review-flujos.md:467`) | ✅ todas, hasta 50 páginas c/u | >60s | ~10s ESTIMADO | **1-2** | Red de seguridad diaria de VTEX inexistente para la cola. **Ya roto hoy** |
| **`warm-cache`** | `*/5 * * * *` + GH ×1/15min | 220s (`:247`), 20s/fetch (`:244`) | ✅ activas | **160s** (8 aborts) | ~24s ESTIMADO | **1,4 grandes / 9 chicas** | Cache frío → cada carga paga el compute completo → race de `GLOBAL_TIMEOUT_MS=85000` → **dashboard en cero con HTTP 200** |
| **`attribution-reconcile`** | `*/30 * * * *` | 250s (`:51`), 40 órdenes/org × ~6s (`:33`) | ✅ conns VTEX | ~240s | ~240s si hay backlog | **1 por corrida** → ciclo N × 30 min | Órdenes sin atribuir en la cola. A 25 orgs el ciclo es **12,5h** |
| **`refresh-gold-attribution-channel`** | `25,55 * * * *` | 250s (`:35`) | ✅ orgs con atribuciones | ~20s ESTIMADO | ~5s ESTIMADO | **~15-45** | Devuelve `resume: "?orgCursor=N"` (`:82`) **que nadie llama** → la cola nunca se procesa |
| **`refresh-silver-orders`** | `0,30 * * * *` | 250s (`:31`) | ✅ **todas** (`SELECT id FROM organizations`, `:58-60`) | ~10s ESTIMADO | ~1s ESTIMADO | **~50-100** | Silver/Gold desactualizado para la cola → `/pedidos` cae a Bronze |
| **`refresh-product-dimensions`** | `30 4 * * *` (**1×/día**) | 250s (`:36`, `:147`) | ✅ conns VTEX | ~60s ESTIMADO | ~15s ESTIMADO | **~10-16** | `results.push({ok:false, error:"sin tiempo, volver a llamar"})` (`:182`) — **nadie vuelve a llamar**. El skip de 20h (`:169`) no salva: a las 24h ya no aplica → **la cola no se procesa nunca** |
| **`refresh-pixel-name-dict`** | `0 5 * * *` (**1×/día**) | 260s (`:26`) | ✅ **todas** (`:43`) | ~60s ESTIMADO | ~10s ESTIMADO | **~10-20** | `callAgain: true` (`:92`) que nadie atiende. Mismo starving permanente |
| **`refresh-pixel-first-source`** | `7,37 * * * *` | 240s (`:98`), `MIN_SLICE=180s` (`:101`) | ✅ resumible por `orgCursor` | ~200s/pasada | — | **soft**, encadena | Es el mejor diseñado del grupo: cursor propio + el cron encadena |
| **`vtex-sync-recent`** | `*/30 * * * *` | **ninguno** (`vtex-sync-recent/route.ts` no tiene budget), 5 en paralelo × 50s (`:53`, `:68`) | ✅ conns VTEX | 50s | 50s | **~30** (6 chunks × 50s = 300s) | Muere en el wall sin devolver nada; las últimas orgs no sincronizan |
| **`alerts-scheduler`** | `*/15 * * * *` | **ninguno** (`alerts-scheduler/route.ts:22` solo `maxDuration=300`) | ✅ todas las reglas de todas las orgs (`engine.ts:254-262`) | ~5s/regla ESTIMADO | ~5s/regla | **~60 reglas ≈ 12 orgs** a 5 reglas c/u | Las alertas de la cola **no se disparan y su `nextFireAt` no avanza** → se acumulan. Y `catch{return[]}` (`engine.ts:264`) reporta "0 reglas, todo ok" |
| **`control-alerts`** | `0 */6 * * *` | **`maxDuration = 60`** (`:28`) | ✅ todas, **2 queries por org secuenciales** (`lib/control/checks.ts:188-233`) | ~2s ESTIMADO | ~1s ESTIMADO | **~30-40** | Se muere el health-check del producto. Nadie se entera de nada |
| **`backfill-runner`** | `* * * * *` | 240s (`:43`) | ❌ **UN job global** (`lib/backfill/job-manager.ts:71-84`, `LIMIT 1`, FIFO por `createdAt`) | — | — | **1 onboarding a la vez, en toda la plataforma** | Onboardear 5 clientes = 5 backfills **en fila**. Arredo fueron 252.701 órdenes (`CLAUDE_STATE.md:47-49`) |
| `refresh-gold-daily-revenue` / `-attribution` | `15,45` / `20,50` | **ninguno** — 1 statement sobre todas las orgs | ❌ no itera | escala con volumen total | idem | **~50+** ESTIMADO | Sin budget: si pasa 300s muere en la transacción y **rollback** → reintenta eternamente sin progresar |

**Resumen de la tabla:** el sistema tiene **catorce** trabajos que recorren todas las organizaciones dentro de
una invocación con presupuesto fijo. **Ocho de ellos no tienen ninguna forma de continuar donde quedaron**
(no hay cursor persistido, o lo hay y nadie lo usa). Eso significa que el modo de falla por defecto de este
sistema al crecer no es "va más lento": es **"a algunos clientes no les corre nunca"**, en silencio, y siempre
a los mismos — los más nuevos.

---

# 3. La rotación de rollups: cuándo los dashboards muestran datos viejos para siempre

Mecánica (`refresh-pixel-rollups/route.ts:233-260`): 7 tablas en rotación
(`ROTATION_TABLES` = las 8 de `rollup-backfill.ts:124-133` menos `channel`, excluida como tabla veneno,
`route.ts:184-197`). Cada invocación reconstruye **1 tabla × 1 día × N orgs**.

**Tiempo de ciclo = 7 tablas ÷ (invocaciones útiles por hora).**

Pero cada invocación solo es útil si la tabla-día **entra** en 300s. Entonces hay dos regímenes:

### Régimen 1 — todo entra (N pequeño)
El ciclo lo pone el scheduler, no el trabajo. Vercel dispara 4/h; GitHub Actions dispara 6 hits
seguidos cada 15 min (`keep-pixel-rollups-fresh.yml:40-46`) → hasta 28 hits/h.
El repo documenta el ciclo real: **~1,75h** con la cadencia de 15 min
(`warm-cache/route.ts:107-108`: "un ciclo normal de rotación (~1.75h)"), contra un umbral de
alerta de **8h** y un self-heal a **2,5h** (`warm-cache/route.ts:112`).
Margen actual: 1,75h de ciclo contra 8h de umbral = **4,5× de margen**.

### Régimen 2 — la tabla más cara no entra (N ≥ el ceiling de §1.1)
El ciclo se vuelve **infinito**. No "más lento": infinito. `funnel` muere, no avanza el cursor, gana la
elección de "más atrasada" en la corrida siguiente, y las otras 6 tablas dejan de recibir turno.

### Proyección del ciclo, tabla por tabla

Costo de una tabla-día = `Σ_orgs costo(org, tabla)`. Con 1 Arredo (71s prom / 190s funnel) + S chicas (8s):

| Clientes | Costo tabla-día promedio | Costo tabla-día `funnel` | Ciclo de 7 tablas | ¿Los dashboards están al día? |
|---|---|---|---|---|
| **4 (hoy)** | 71 + 3×8 = **95s** | 190 + 3×8 = **214s** ✅ (< 250) | **~1,75h** (medido) | ✅ Sí, con 4,5× de margen |
| **10** (1 Arredo + 9 chicas) | 71 + 72 = **143s** | 190 + 72 = **262s** ⚠️ (> 250, < 300) | ~2,6h ESTIMADO | ⚠️ Al filo. `funnel` ya se pasa del presupuesto y solo la salva el wall de 300s. Cualquier día pico la mata |
| **25** (1 Arredo + 24 chicas) | 71 + 192 = **263s** | 190 + 192 = **382s** 🔴 (> 300) | **∞** | 🔴 **No.** `funnel` no entra nunca. Rotación clavada. 7 tablas stale permanentemente |
| **25** (5 Arredos + 20 chicas) | 355 + 160 = **515s** 🔴 | 950 + 160 = **1.110s** 🔴 | **∞** | 🔴 **Ninguna tabla entra.** El pipeline de rollups deja de existir |
| **2 Arredos, nada más** | 142s ✅ | **380s** 🔴 | **∞** | 🔴 **Se rompe con el segundo cliente grande.** No hace falta llegar a 10 |

**El número que importa:** el ciclo de rollups deja de cerrar en **N ≈ 10 orgs chicas + 1 Arredo**, o en
**2 orgs tamaño Arredo**. A partir de ahí `/pixel/analytics` muestra datos permanentemente viejos y el
sistema manda mails de frescura al cliente todos los días.

**Y hay un segundo efecto, peor.** `getFunnelStages` (`src/lib/metrics/pixel-funnel.ts:68`) calcula
`liveFromDay = !maxRoll || maxRoll < fromDay ? fromDay : maxRoll`: cuando el rollup se atrasa, el tramo
"en vivo" que se computa contra `pixel_events` crudo **crece sin techo**. Rollup atrasado → queries en vivo
caras → DB saturada → rollup más atrasado. Es el único bucle auto-alimentado del sistema (M8 de la
auditoría, `review-performance.md:410-412`), y **el disparador es la cantidad de clientes.**

---

# 4. Base de datos: almacenamiento, working set y costo

## 4.1 Densidad medida

```
43 GB ÷ 24.000.000 filas = 1,79 KB por fila de pixel_events (incluye índices + TOAST del JSONB props)
```

Arredo genera **1,3M eventos/semana** (`CLAUDE_STATE.md:56`). Entonces:

```
1,3M ev/sem × 1,79 KB = 2,33 GB por semana
2,33 GB × 52 = 121 GB por año, por cliente tamaño Arredo
```

Chequeo cruzado: 24M filas ÷ 1,3M/semana = **18,5 semanas ≈ 4,3 meses** para acumular los 43 GB.
`43 GB ÷ 4,3 meses × 12 = 120 GB/año`. Los dos caminos dan lo mismo → el número es confiable.

## 4.2 No hay retención. De ninguna clase.

`grep -rni "DELETE FROM pixel_events\|retention\|purge\|prune" src/` → **cero** política de retención sobre
`pixel_events`. Nada borra un evento nunca. Los rollups HLL agregan la historia
(`pixel_daily_*`, una fila por org×día×dimensión), pero **la tabla cruda se guarda entera igual**.

Y `api_cache` es peor, porque su función de limpieza existe y es código muerto:

```
src/lib/api-cache-shared.ts:114-121
/** Borra las entradas vencidas. Lo llama el cron de warm-cache. */
export async function purgeExpiredSharedCache(): Promise<number> { ... }
```

`grep -rn "purgeExpiredSharedCache" src/` devuelve **una sola línea: su propia declaración**. El comentario
miente. La key incluye `from`/`to` (`src/lib/pixel/cache-key.ts:59-68`), así que cada día genera keys nuevas
que nunca se vuelven a leer y nunca se borran. La auditoría midió **~28 MB/día con 4 orgs**
(`review-performance.md:311-315`) = **7 MB/org/día = 2,55 GB/org/año** de basura pura.

## 4.3 Proyección de almacenamiento

Piso: hoy ~43 GB de `pixel_events` + órdenes/atribuciones/rollups/`api_cache` ≈ **50-60 GB** ESTIMADO.

| Escenario | `pixel_events` acumulado a 12 meses | `api_cache` basura/año | Total DB ESTIMADO |
|---|---|---|---|
| 4 clientes (hoy) | 43 + 121 = 164 GB | 10 GB | **~190 GB** |
| 10 (1 grande + 9 chicas) | 164 + 9×6 GB = **218 GB** | 26 GB | **~260 GB** |
| 25 (1 grande + 24 chicas) | 164 + 144 = **308 GB** | 64 GB | **~390 GB** |
| 25 (5 grandes + 20 chicas) | 5×164 + 120 = **940 GB** | 64 GB | **~1,05 TB** |
| 50 (5 grandes + 45 chicas) | 820 + 270 = **1.090 GB** | 128 GB | **~1,25 TB** |
| 100 (10 grandes + 90 chicas) | 1.640 + 540 = **2.180 GB** | 256 GB | **~2,5 TB** |

(orgs chicas: ESTIMADO 6 GB/año cada una, ~1/20 del volumen de Arredo)

## 4.4 Working set vs. RAM: acá está el muro real

El diagnóstico de `BP-NEON-CAPACITY` (`BACKLOG_PENDIENTES.md:49-53`) es explícito: el cuello **no** era
CPU ni conexiones ni deadlocks — era **memoria**. Working set ~28 GB contra local file cache de 7 GB
(2 CU / 8 GB RAM) → hit rate **44%**. Se subió a 4 CU (16 GB RAM) y las queries sobre `pixel_events` crudo
pasaron de 9-33s a 0,3-1,5s.

Neon da **~4 GB de RAM por CU**. La regla de escalado que sale de eso:

```
CU necesarios ≈ working set (GB) ÷ 4
```

| Escenario | Working set ESTIMADO | CU para cachearlo | CU máximo de Neon (autoscale) |
|---|---|---|---|
| Hoy, 4 clientes | 28 GB | 7 CU | **4 CU** (ya insuficiente, hit rate < 100%) |
| 10 clientes | ~45 GB | 11 CU | 16 CU alcanza |
| 25 clientes (1 grande) | ~65 GB | 16 CU | **16 CU justo en el límite** |
| 25 clientes (5 grandes) | ~150 GB | **38 CU** | 🔴 **fuera del rango de autoscale de Neon** |
| 50 / 100 clientes | 200-400 GB | 50-100 CU | 🔴 **no existe ese plan** |

**Conclusión dura, y es la más importante de esta sección:** a partir de ~25 clientes con más de un cliente
grande, **el problema deja de tener solución comprando compute.** No hay tier de Neon que cachee 150 GB de
working set a un precio razonable. La salida obligada es del lado de la demanda:

1. **Retención sobre `pixel_events`** — los rollups HLL ya tienen la historia agregada. Guardar 24 meses de
   eventos crudos para alimentar unos rollups que ya están materializados es el mayor desperdicio del sistema.
   Una retención de 90 días bajaría el working set de Arredo de 43 GB a **~9 GB** (43 × 90/430 días).
2. **Particionado de `pixel_events` por org y/o por mes** — hoy es una sola tabla monolítica
   (`prisma/schema.prisma:796-800`, sin `@@map` a partición). Con particiones por mes, las queries del rango
   reciente solo tocan 1-2 particiones y el working set efectivo se desploma.
3. **Dropear los 6 índices no usados** que la auditoría ya identificó (`review-performance.md:465-490`):
   ~3-4 GB menos de working set y −4 escrituras de índice por evento ingerido.

## 4.5 Costo de Neon

> ⚠️ **ESTIMADO — VERIFICAR en neon.com/pricing.** Uso: Scale $69/mes (50 GB storage, 750 CU-h incluidas),
> Business $700/mes (500 GB, 1.000 CU-h), compute extra ~$0,26/CU-h, storage extra ~$1,50/GB-mes.

**Dato crítico primero: el compute de Neon nunca se suspende.** El autosuspend es de 5 min
(`CLAUDE_STATE.md:35`) pero `backfill-runner` corre **cada minuto** (`vercel.json:120-123`,
`* * * * *`). O sea que se paga **730 horas de compute por mes, siempre**, no importa si hay tráfico.

```
Hoy (promedio ESTIMADO 2 CU × 730 h) = 1.460 CU-h/mes
  incluidas en Scale: 750  →  extra 710 CU-h × $0,26 = $185
  + base $69 + storage (~190 GB − 50 incl.) × $1,50 = $210
  ≈ $460/mes  ESTIMADO
```

| Escenario | Plan | CU sostenido | CU-h/mes | Storage | **Costo mensual ESTIMADO** |
|---|---|---|---|---|---|
| 4 clientes (hoy) | Scale | 2 | 1.460 | 190 GB | **~$460** |
| 10 clientes | Scale/Business | 4 | 2.920 | 260 GB | **~$1.070** (Business: 700 + 1.920×0,26 = 1.199; Scale: 69 + 565 + 315 = 949) |
| 25 (1 grande) | Business | 8 | 5.840 | 390 GB | **~$1.960** (700 + 4.840×0,26 = 1.958) |
| 25 (5 grandes) | Business / Enterprise | 16 (tope) — **insuficiente** | 11.680 | 1,05 TB | **~$4.170** (700 + 10.680×0,26 + 550 GB×$0,50) — **y aun así el hit rate va a estar por el piso** |
| 50 clientes | Enterprise | fuera de rango | — | 1,25 TB | **$6.000-10.000+** o rediseño (sharding/retención) |
| 100 clientes | — | — | — | 2,5 TB | **No hay plan.** Obliga a particionado + retención + posible warehouse separado |

---

# 5. Conexiones y concurrencia

## 5.1 Los números del pool

`src/lib/db/client.ts:59`:
```
connection_limit=24 & pool_timeout=160 & statement_timeout=150000
```

Ojo: **24 es por instancia de lambda**, no global. Vercel levanta una instancia por ráfaga de
concurrencia, así que el total de conexiones lógicas contra Neon es `24 × instancias calientes`. El pooler
de Neon (PgBouncer en modo transacción, `client.ts:52-58`) absorbe muchas conexiones lógicas, pero
**el trabajo real lo hacen los 4 vCPU del compute**. El pool no es el techo; el CPU sí.

## 5.2 Cuántas queries dispara una pantalla

| Pantalla | Queries por carga | Evidencia |
|---|---|---|
| `/dashboard` (frío) | **60-80 concurrentes** (5-8 endpoints × 2-14 queries c/u) | `review-performance.md:325-341`, `dashboard/page.tsx:559-593` |
| `/pixel/analytics` | **41** (34 de `metrics/pixel` + 7 de `discrepancy`, en `Promise.all`) | `review-performance.md:345-356`, `analytics/page.tsx:518-521` |
| `/pedidos` | ~25 en 17 batches secuenciales | `metrics/orders/route.ts:218-1443` |

**Una sola carga de `/dashboard` ya supera el pool de 24 por sí sola.** Con `pool_timeout=160`, lo que
sobra **espera** en vez de fallar: la app se siente colgada, no rota.

## 5.3 Cuántos usuarios concurrentes aguanta hoy

Anclaje medido: *"batch de 19 queries en paralelo = ~300ms Neon caliente"* (`CLAUDE_STATE.md:65`).
Con 4 vCPU, 19 queries en 300ms ≈ **1,2 CPU-segundos** de trabajo real. Extrapolando a una carga
de dashboard de ~65 queries: **~4 CPU-segundos por carga** ESTIMADO (caliente; en frío es mucho peor).

```
Capacidad = 4 vCPU × tiempo de espera tolerable
Con un techo de 15s de espera:  4 × 15 = 60 CPU-s disponibles
60 CPU-s ÷ 4 CPU-s por carga = 15 cargas de dashboard concurrentes
```

**≈ 15 cargas concurrentes de dashboard = ~5 clientes con 3 usuarios cada uno.**

Y eso es el caso optimista. Descuenta el trabajo de fondo que corre siempre:
`refresh-pixel-rollups` barriendo 43 GB (C1: hasta 1.750s de scan pesado en ventanas de 900s,
`review-performance.md:56`), `backfill-runner` cada minuto, `warm-cache` 4×/15min con hasta 11 computes
huérfanos por corrida (C2, `review-performance.md:79`). Ese fondo se lleva **1-2 de los 4 vCPU en régimen
permanente** ESTIMADO. Capacidad real: **~8-10 cargas concurrentes ≈ 3 clientes con 3 usuarios.**

## 5.4 Las 9 de la mañana con 25 clientes

```
25 clientes × 3 usuarios = 75 cargas de dashboard concurrentes
75 × 4 CPU-s = 300 CPU-segundos de trabajo
÷ 4 vCPU = 75 segundos de cola  (con el fondo: 100-150s)
```

Consecuencias encadenadas, todas verificables:

1. **75s > `maxDuration` de casi todas las rutas** (60s en `metrics/products`, 90 en `metrics/orders`,
   sin declarar en `metrics/pnl`) → 504 en cascada.
2. **`statement_timeout = 150000` (150s) es 2-10× el `maxDuration`** (H1, `review-performance.md:179-196`):
   Vercel mata la función, Postgres **sigue ejecutando la query**. El usuario reintenta (F5) y suma otra.
   **Queries zombie que se acumulan.** Es el mecanismo que convierte un pico en una caída.
3. **`/api/metrics/pixel` tiene `GLOBAL_TIMEOUT_MS = 85000`** (`metrics/pixel/route.ts:86`): a los 85s
   devuelve `buildEmptyMockResponse()` con **HTTP 200**. El cliente ve **$0 y 0 visitantes, sin ningún
   error**. A las 9 AM con 25 clientes, esto pasa en todas las sesiones.
4. **`Promise.all` de 28 sin aislamiento** (C4, `review-performance.md:103-120`): una sola query que caiga
   por timeout deja el dashboard entero en cero.

**Veredicto de concurrencia: el sistema soporta hoy ~3-5 clientes activos simultáneos en horario pico.**
Ya está por debajo de los 4 que tiene. Es coherente con los incidentes de "dashboard en cero" documentados.

---

# 6. Límites de Vercel

| Límite | Valor | Estado hoy | ¿Escala con clientes? |
|---|---|---|---|
| **Crons por proyecto** | **40 en el plan Pro** (Hobby: 2) — **ESTIMADO, VERIFICAR** en la doc de Vercel | **28 usados** (`vercel.json:14-232`) = 70% | ❌ No — los crons son por proyecto, no por cliente. **Buena noticia.** Pero quedan solo ~12 slots para features nuevas |
| **`maxDuration` real** | **~300s** (la función muere a ~340s) pese a declarar 800 en `vercel.json:4-12` | Documentado y probado: *"Vercel NO da >300s pese a Fluid Compute + Default Max Duration=800 + vercel.json + Node 22"* (`refresh-pixel-rollups/route.ts:132-136`) | ❌ No, pero es **el techo que define todos los ceilings de §2** |
| **Invocaciones concurrentes** | ~1.000 por cuenta en Pro — **ESTIMADO, VERIFICAR** | Lejos del límite | ⚠️ Sí, pero no es el cuello: el cuello es Neon |
| **Costo por invocación** | ~$0,60 / 1M invocaciones + Active CPU ~$0,128/h — **ESTIMADO, VERIFICAR** | Ingesta: 1,3M ev/sem ≈ 5,6M/mes, batcheados (`pixel/event/route.ts:150`) → ESTIMADO ~560k invocaciones/mes = **$0,34** | ✅ Sí, linealmente — pero es **calderilla** |
| **Bandwidth** | 1 TB incluido en Pro — **ESTIMADO** | Payload de `/api/metrics/pixel` = **878 KB en 30d** (`metrics/pixel/route.ts:48-50`). Sesión ≈ 3 MB. 25 clientes × 3 usuarios × 20 cargas/día × 3 MB × 30 = **135 GB/mes** | ✅ Sí, pero no es cuello hasta ~150-200 clientes |
| **Logs** | — | **1 `console.log` por batch de eventos** (`pixel/event/route.ts:150`, L2 de la auditoría) = ~1,3M líneas/semana **por cliente grande** | ✅ Sí, linealmente. A 10 Arredos son 13M líneas/semana. Cuesta plata y entierra las señales |

**Los 28 crons no son un problema de escala de clientes** — es el hallazgo tranquilizador de esta sección.
Pero el `maxDuration` real de 300s **sí es el techo que define todo lo demás**, porque cada cron que itera
orgs tiene que meter N clientes adentro de esos 300 segundos.

---

# 7. Costo marginal del cliente N+1

> Todo **ESTIMADO**. Los precios de Neon/Vercel/Resend hay que verificarlos.

## 7.1 Cliente CHICO (≈ una de las 3 orgs actuales)

| Componente | Cálculo | Costo/mes |
|---|---|---|
| Neon — storage | ~6 GB/año → 0,5 GB/mes acumulado × $1,50 | **$0,75** (creciendo a $9/mes al año) |
| Neon — compute | ~8s/tabla-día × 7 tablas × 12 ciclos/día × 30 = 5,6 h/mes de 1 CU × $0,26 | **$1,46** |
| Neon — dashboard | ESTIMADO 3 usuarios × 20 cargas/día × 4 CPU-s = 20 CU-h/mes × $0,26 | **$5,20** |
| Vercel — invocaciones + CPU | ESTIMADO ~30k invocaciones/mes | **$0,50** |
| Aurum (tokens) | **No medible con el código actual** — ver §7.3 | **?** |
| Resend | ESTIMADO ~50 mails/mes (digest + alertas) | **~$0,10** |
| Meta CAPI | Gratis (API de Meta) | $0 |
| **Total** | | **~$8-17/mes** |

## 7.2 Cliente tamaño ARREDO — **este es el número para pricing**

| Componente | Cálculo | Costo/mes |
|---|---|---|
| Neon — storage | **121 GB/año** = 10 GB/mes acumulado × $1,50 | **$15/mes el 1er mes → $180/mes al año** |
| Neon — compute de rollups | 71s prom/tabla × 7 tablas × 12 ciclos/día × 30 días = 4,97 h/día = **149 h/mes** de 1 CU × $0,26 | **$39** |
| Neon — compute de `first-source` | ~200s/pasada × 2 pasadas/h × 730 h = **81 h/mes** × $0,26 | **$21** |
| Neon — ingesta | 5,6M eventos/mes con **8 índices** sobre `pixel_events` (4 en `schema.prisma:796-799` + los de `ensure-coherence-indexes`) | **$25** ESTIMADO |
| Neon — dashboard + warm-cache | 3 usuarios + 8 fetches × 288 corridas/día de warm | **$60** ESTIMADO |
| Vercel — invocaciones + CPU | 560k invocaciones + Active CPU de la ingesta | **$15** ESTIMADO |
| Vercel — logs | 5,6M líneas de log/mes | **$10** ESTIMADO |
| Aurum | no medible (§7.3) | **?** |
| Resend + CAPI | | **~$1** |
| **Total mes 1** | | **~$190** |
| **Total mes 12** (con la historia acumulada) | | **~$350-450** |

**Esto es una decisión de pricing y Tomy la necesita.** Un cliente tamaño Arredo cuesta **entre $190 y
$450 por mes solo en infraestructura**, y el número **crece todos los meses** porque nada borra
`pixel_events`. Si el ticket mensual de un cliente grande no está bastante por encima de $450, el negocio
pierde plata con cada cliente grande que suma, y pierde cada vez más con el tiempo.

Corolario directo: **implementar retención de `pixel_events` a 90 días no es una optimización técnica —
es la palanca de margen bruto más grande que tiene el producto.** Bajaría el componente de storage de
$180/mes a ~$38/mes por cliente grande, y de paso arregla el problema de working set de §4.4.

## 7.3 El agujero: no se puede costear Aurum hoy

`prisma/schema.prisma:683-704` (`aurum_usage_logs`) guarda `inputTokens`, `outputTokens`, `totalTokens`,
`model`, `mode` y `organizationId`. Tiene todo lo necesario. Pero:

```
grep -rn "costUsd|cost_usd|PRICE_PER|pricePer" src/  →  0 hits
```

**No hay ninguna tabla de precios por modelo en ningún lado del repo**, y `/api/admin/usage`
(`src/app/api/admin/usage/route.ts:38-60`) agrega tokens pero **no calcula un solo dólar**. Además
`take: 10000` (`:41`) recorta la muestra en silencio: con más clientes, los números del panel van a
estar mal sin que nadie lo note.

**Falta un mapa `model → $/1M tokens` y una columna `costUsd`.** Son ~20 líneas de código y es la
diferencia entre "sabemos qué nos cuesta cada cliente" y "no tenemos idea". Sin eso, cualquier decisión de
pricing que incluya Aurum es a ciegas.

---

# 8. Tabla de umbrales: 10 / 25 / 50 / 100 clientes

| | **10 clientes** | **25 clientes** | **50 clientes** | **100 clientes** |
|---|---|---|---|---|
| **Qué se rompe PRIMERO** | `refresh-pixel-rollups`: la tabla `funnel` (190s Arredo + 9×8s = **262s**) se pasa del presupuesto de 250s (`route.ts:141`). Solo la salva el wall de 300s | **La rotación de rollups se clava.** funnel = **382s > 300s** → muere sin avanzar cursor → gana toda elección futura → **las 7 tablas stale para siempre** | **Neon.** Working set >200 GB contra 16 GB (4 CU) o 64 GB (16 CU). Hit rate al piso. **Ningún tier arregla esto** | **No hay sistema.** Los 14 crons que iteran orgs necesitarían 20-40 min por vuelta contra un wall de 300s |
| **Qué se rompe SEGUNDO** | `warm-cache`: 10 orgs × 8 fetches = 80 fetches, presupuesto para ~11-27. **Solo se calientan 1-3 orgs** | **Concurrencia.** 25×3 = 75 cargas → 75-150s de cola → 504 masivos y `GLOBAL_TIMEOUT` → **dashboards en cero** | Los crons diarios (`product-dimensions`, `name-dict`): la cola de orgs **nunca** se procesa. Catálogos y diccionarios congelados | Storage 2,5 TB. Costo de infra $6-10k/mes con la app igual sin funcionar |
| **Qué se rompe TERCERO** | `alerts-scheduler`: ~50 reglas × 5s = 250s ≈ el `maxDuration` de 300s. Las alertas de la cola dejan de dispararse | `control-alerts` (`maxDuration=60`, 2 queries/org): **se muere el health-check.** Nadie se entera de nada | `api_cache`: **128 GB/año de basura** que nadie borra, dentro de la misma DB que ya no entra en RAM | El onboarding: `backfill-runner` es **una cola global de 1 job** (`job-manager.ts:71-84`). 100 clientes = 100 backfills en fila |
| **Síntoma que ve el CLIENTE** | "El funnel a veces no carga". Datos de 3-5h de atraso. **El cliente más nuevo lo ve peor** (§1.3) | **"Todo en cero."** `/pixel/analytics` con $0 y 0 visitantes, **HTTP 200** (`metrics/pixel/route.ts:86` + `:1964`). Mails automáticos de frescura todos los días | "La app tarda un minuto en abrir" / 504. Catálogo con productos viejos. Alertas que no llegan | Nada carga |
| **Umbral de frescura** (8h, `warm-cache/route.ts:105`) | Ciclo ~2,6h. ✅ pero con **3× de margen** en vez de 4,5× | Ciclo **∞**. 🔴 Umbral violado permanentemente | 🔴 | 🔴 |
| **Costo Neon/mes** ESTIMADO | ~$950-1.200 | ~$2.000 (1 grande) / **~$4.200 (5 grandes)** | $6.000-10.000 | Sin plan disponible |
| **QUÉ HABÍA QUE HACER ANTES** | **(a)** Poner un chequeo de presupuesto **dentro** del loop de orgs (`rollup-backfill.ts:381-390`) + cursor de org persistido. **(b)** `sync/chain`: subir `maxDuration` de 60 a 300 y agregar cursor. **(c)** Que `warm-cache` warmee por rotación, no de a una org entera | **(d)** Sacar la rotación 1-tabla-todas-las-orgs → **una unidad de trabajo = (org, tabla, día)** con cola persistida. **(e)** Retención de `pixel_events` a 90 días. **(f)** Llamar a `purgeExpiredSharedCache()` desde `warm-cache`. **(g)** `Promise.allSettled` + `safeQuery` en `metrics/pixel` (C4) | **(h)** Particionar `pixel_events` por mes. **(i)** Replica de lectura de Neon separada para el dashboard. **(j)** Cursor persistido en TODOS los crons diarios | **(k)** Warehouse analítico separado (ClickHouse/BigQuery) para `pixel_events`. **(l)** Un scheduler de trabajo real (cola con workers), no crons de Vercel |

---

# 9. Los 5 cambios que más techo compran por hora invertida

Ordenados por (clientes desbloqueados ÷ horas de trabajo). Ninguno toca el CORE de atribución ni el
contrato de `DATA_COHERENCE.md`.

### 1. Chequeo de presupuesto **dentro** del loop de orgs + cursor de org persistido — **2-4 h**
**Dónde:** `src/lib/pixel/rollup-backfill.ts:381-390` (agregar el check de tiempo y devolver el índice de
org donde cortó) + `src/app/api/cron/refresh-pixel-rollups/route.ts` (persistir y reanudar ese índice).
**Qué compra:** convierte el ceiling de **8-14 orgs en un ceiling de cientos.** El trabajo deja de tener
que entrar en una invocación: se reparte entre invocaciones y el cursor garantiza que **todas** las orgs
reciban turno, en vez de que la cola (= los clientes nuevos) se muera de hambre.
**Es el cambio más importante del documento.** Un chequeo de reloj adentro de un `for` es lo único que
separa "8 clientes" de "todos los que quieras".
**Riesgo:** bajo. Es el mismo patrón que `refresh-pixel-first-source` ya usa bien (`route.ts:98-101` +
`orgCursor`) y que `refresh-gold-attribution-channel` ya calcula pero nadie consume (`route.ts:82`).

### 2. Retención de `pixel_events` a 90 días — **4-8 h** (+ OK de Tomy sobre la ventana)
**Dónde:** no existe hoy — hay que crear un cron. `grep` confirma cero política de retención.
**Qué compra:** working set de Arredo de 43 GB → **~9 GB**. Con 5 Arredos: 215 GB → **45 GB**, que **sí**
entra en 16 CU. Es lo único que hace viable el escenario de "varios clientes grandes".
Y baja el costo de storage por cliente grande de ~$180/mes a **~$38/mes** — el mayor movimiento de margen
bruto disponible.
**Precondición:** verificar que los rollups HLL cubren el 100% de la historia que la UI muestra
(hoy `pixel_daily_channel` está vacía, `review-performance.md:445-449`, y el backfill masivo de
funnel-por-canal sigue pendiente, `BACKLOG_PENDIENTES.md:28-37`). **No borrar nada hasta que eso cierre.**
**Riesgo:** medio-alto si se hace antes de tiempo — es el único ítem de esta lista que destruye datos.

### 3. Subir `maxDuration` de `sync/chain` y `/api/sync` de 60 a 300 + cursor — **1-2 h**
**Dónde:** `src/app/api/sync/chain/route.ts:13` (`maxDuration = 60`) y la ruta `/api/sync`.
**Qué compra:** hoy entra **1 sola org** por corrida y las demás **nunca** sincronizan inventario, precios
ni detalles de VTEX. Es un bug de multi-tenancy activo con 4 clientes, no una proyección. Pasar a 300s con
cursor lo lleva a ~5-6 orgs por corrida y encadena el resto.
**Riesgo:** muy bajo. Un número en `vercel.json` ya cubre estas rutas con 800; solo falta el `export`.

### 4. Un scheduler, no dos + llamar a la purga de cache — **1 h**
**Dónde:** borrar la entrada de `refresh-pixel-rollups` de `vercel.json:126-129`, bajar el `for i in 1..6`
a `1..2` en `.github/workflows/keep-pixel-rollups-fresh.yml:40`, y agregar una línea
`await purgeExpiredSharedCache()` en `warm-cache` (la función existe y **no tiene ningún caller**,
`src/lib/api-cache-shared.ts:114-121`).
**Qué compra:** hoy hay **hasta 1.750 segundos de scan pesado sobre 43 GB dentro de ventanas de 900s**
(C1) — o sea ≥2 escaneos concurrentes 24/7 desalojando de la RAM justo las páginas que el cliente necesita.
Es demanda pura tirada a la basura. Más ~10 GB/año de basura de `api_cache` que se deja de acumular.
Es el mejor ratio impacto/hora de toda la lista.
**Riesgo:** casi cero. Es borrar configuración y llamar a una función que ya está escrita.

### 5. `Promise.all` → `Promise.allSettled` + `safeQuery` en `metrics/pixel` y `metrics/pnl` — **3-5 h**
**Dónde:** `src/app/api/metrics/pixel/route.ts:365` (el `Promise.all` de 28) y
`src/app/api/metrics/pnl/route.ts:60-75` (el de 14). El patrón ya existe, probado y funcionando, en
`metrics/orders` (`safeQuery`).
**Qué compra:** no sube el ceiling de clientes, pero **cambia el modo de falla** en todos los tramos.
Hoy, cualquier timeout en una de 28 queries deja el dashboard entero en cero con HTTP 200. Con
`allSettled`, el mismo timeout deja **una tarjeta vacía**. A los 25 clientes va a haber timeouts sí o sí;
la pregunta es si el cliente ve "una métrica no disponible" o **"mi negocio facturó $0"**.
La auditoría lo dice bien: `/pedidos` es el que mejor se comporta bajo estrés, y es el que hay que copiar.
**Riesgo:** bajo, y es puramente aditivo.

---

## Cierre en una frase

**El sistema aguanta hoy ~8-10 clientes y exactamente un Arredo. El límite no es la base de datos ni
Vercel ni la plata: es un `for` sin chequeo de reloj en `rollup-backfill.ts:381-390`. Arreglar eso son
2-4 horas y multiplica el techo por diez. Después de eso, el límite pasa a ser la memoria de Neon, y ahí
la palanca es retención de `pixel_events` — que además es el mayor movimiento de margen bruto disponible
en el producto.**
