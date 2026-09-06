# PLAN_REMEDIACION.md — Remediación post-auditoría

> **Creado:** 2026-09-02 · **Commit auditado:** `9ad4616d` (= `origin/main` = producción)
> **Origen:** auditoría de 6 frentes en paralelo → **197 hallazgos** (37 críticos, 60 altos, 60 medios, 40 bajos)
> **Evidencia completa:** `docs/auditoria-2026-09/` — un reporte por frente, todos con `archivo:línea`
> **⚠️ 2026-09-05:** existe ahora `PLAN_EXPANSION.md`, que **manda sobre este archivo** mientras el
> objetivo del negocio sea meter clientes nuevos. Varios criticos de acá (R-C11, R-C13, R-C15,
> R-C16, R-C17, R-C18, R-C19 y las tandas 1.1/1.2) son **precondiciones de vender** y se ejecutan
> dentro de las fases E0/E1 de aquel plan, no por separado.
> **Estado global:** 🟨 FASE 0 en curso — verificación estática ✅ hecha (20 hallazgos confirmados,
> 1 ampliado, 1 ascendido de "sin confirmar" a confirmado) · el acceso a Vercel/Neon que bloqueaba
> 5 verificaciones **ya está resuelto**: R-V01 y R-V02 contestadas (2026-09-06) · **1 de 31 tareas
> críticas cerradas** (R-C25) + R-C05 y R-C06 parciales — todo en branches, sin mergear
> **Línea base de validación (2026-09-02):** `tsc --noEmit` → 0 errores · `vitest run` → 396 pasan,
> 7 skipped, 22s. **Cualquier cambio tiene que mantener esto en verde.**

---

---

## ⏸️ DÓNDE QUEDAMOS — leer esto primero

> **Trabajo PAUSADO el 2026-09-02.** Axel lo frenó para atender otra cosa que pidió Tomy.
> No es un abandono ni un bloqueo técnico: se pausó a propósito, en un punto limpio.

**Qué está hecho:**
- La auditoría completa (197 hallazgos) y este plan. Evidencia en `docs/auditoria-2026-09/`.
- **R-V07**: verificación estática de los 20 hallazgos críticos contra el código real. Los 20 son
  reales; salieron 3 correcciones a los reportes (están al final de R-V07).
- Línea base de validación tomada: `tsc` 0 errores, `vitest` 396 pasan.

**Qué NO está hecho:**
- **Cero cambios en `src/`.** Ni una línea de la aplicación fue tocada. Los 197 hallazgos siguen
  todos vivos en producción.
- R-V01 a R-V06: 🔒 bloqueadas por falta de acceso a Vercel y a Neon.

**El próximo paso concreto, cuando se retome — dos caminos, se pueden hacer en cualquier orden:**

1. **Desbloquear la FASE 0** (10 minutos, lo tiene que hacer alguien con acceso): correr
   `vercel login && vercel link && vercel env ls production` y contestar R-V01, R-V02 y R-V03.
   Más el backup de Neon (R-V06). Esto es lo que dice si hay **crons muertos ahora mismo**.
2. **Arrancar la tanda 1.1**, que casi no depende de lo anterior: R-C01 (borrar los 3 backdoors),
   R-C02 (neutralizar `backfill/vtex`), R-C03 (sacar los endpoints públicos), R-C04 (`ml-sync`
   fail-open). Y la mitigación más barata de todo el plan: el paso 1 de **R-C22**, el guard que
   impide `prisma db push` — cierra el riesgo de borrar 30 tablas de producción y no depende de
   ninguna verificación.

**⚠️ Estado de git:** este plan, `docs/auditoria-2026-09/` y el aviso agregado arriba de
`CLAUDE_STATE.md` están **sin commitear, por decisión de Axel** (se mantienen locales). Los dos
primeros son archivos **sin trackear**: sobreviven a un `git checkout` o un cambio de rama, pero
**un `git clean -fd` los borra**. Si se quiere conservarlos a largo plazo, hay que commitearlos o
copiarlos afuera del repo.

**Pregunta abierta para Tomy** (R-V05, no requiere acceso técnico): *¿las cuentas de Meta Ads y
Google Ads de Arredo, TeVeCompras, EMDJ y El Mundo facturan todas en pesos, o alguna en dólares?*
De la respuesta depende si el ROAS de la plataforma tiene un error de factor ~1.000.

---

## 0. Qué es esto y cómo se usa

Este archivo es **la fuente de verdad del trabajo de remediación**. Está escrito para que
cualquier sesión nueva de Claude (o cualquier persona) pueda abrirlo, entender en qué estado
está todo, y seguir desde donde quedó **sin haber participado de la auditoría**.

Tres reglas de uso:

1. **Se lee entero antes de tocar nada.** Las tareas tienen dependencias reales; hacer la #9
   antes de la #7 rompe producción.
2. **Se edita al terminar cada tarea.** No al final del día, no "después". Ver REGLA #0.
3. **Nada se marca ✅ sin haber corrido la validación** que la propia tarea define.

---

## 1. REGLA #0 — Documentar SIEMPRE que se termina una tarea

> **Esta regla es obligatoria y no admite excepciones.** Una tarea no está terminada hasta que
> está documentada. Si el contexto se acaba, si la sesión se corta, si Tomy interrumpe con otra
> cosa: **primero se documenta lo hecho, después se para.**

Al cerrar **cada** tarea (`R-Cxx`, `R-Hxx`, `R-Mxx`, `R-Lxx`) hay que hacer estas cuatro cosas,
en este orden:

**a) Cambiar el estado de la tarea en este archivo.**
De `⬜ pendiente` a `✅ hecho`, `🟡 parcial` o `⛔ descartada`. Si es parcial o descartada, el
motivo va en la misma línea. Nunca se borra una tarea: se marca.

**b) Agregar una entrada en la Bitácora (§ 9 de este archivo).** Formato exacto:

```
### [AAAA-MM-DD] R-Cxx — <título de la tarea>
- **Estado final:** ✅ hecho / 🟡 parcial / ⛔ descartada
- **Qué se cambió:** <2-4 líneas en lenguaje simple, no jerga — Tomy tiene que poder leerlo>
- **Archivos tocados:** <lista>
- **Commit:** <hash> — <mensaje>
- **Validación ejecutada:** <el comando/prueba concreta + su resultado real, no "debería andar">
- **Qué NO quedó cubierto:** <si algo del hallazgo original sigue vivo, decirlo acá>
- **Efectos secundarios / lo que hay que vigilar:** <o "ninguno">
```

**c) Actualizar la documentación viva del repo si el cambio la afecta:**

| Si la tarea… | Actualizar |
|---|---|
| cambió cómo funciona el sistema (sync, webhooks, atribución, permisos) | `CLAUDE_STATE.md` (arriba de todo, sección nueva con fecha) |
| cambió una regla de proceso o una convención | `CLAUDE.md` |
| corrigió un error que se puede volver a cometer | `ERRORES_CLAUDE_NO_REPETIR.md` |
| cerró un ítem del backlog | `BACKLOG_PENDIENTES.md` (marcar cerrado, no borrar) |
| cambió variables de entorno | `.env.example` |
| cambió la definición de una métrica | `DATA_COHERENCE.md` |
| tocó UI | `UI_VISION_NITROSALES.md` si cambió una regla visual |

**d) Actualizar el contador de "Estado global" del encabezado de este archivo.**

**Nunca se documenta una tarea como terminada si la validación no se corrió.** Si no se pudo
validar (falta acceso a prod, hace falta un dato de Tomy), el estado es `🟡 parcial` y la
bitácora dice exactamente qué falta para poder cerrarla.

---

## 2. Protocolo de arranque para una sesión nueva

Si sos un Claude que nunca vio este trabajo, hacé esto **en este orden** antes de escribir una línea:

```bash
cd C:/Users/axelf/github/nitrosales
git fetch origin --prune
git status
git branch --show-current
git log --oneline -5
```

Después leé, en este orden:

1. **`CLAUDE.md`** — reglas de proceso del repo (branch única `main`, validaciones antes de push,
   cómo se le habla a Tomy, orden de migraciones). **Son inmutables salvo que Tomy las cambie.**
2. **Este archivo, entero.** Especialmente la Bitácora (§ 9): ahí está qué se hizo ya.
3. **`ERRORES_CLAUDE_NO_REPETIR.md`** — errores reales cometidos antes; varios de los hallazgos
   de esta auditoría son reincidencias.
4. **`CLAUDE_STATE.md`** — las primeras ~120 líneas alcanzan (el archivo pesa 584 KB; leerlo
   entero no es realista y nadie lo hace).
5. **El reporte del frente que vas a tocar**, en `docs/auditoria-2026-09/`. No arranques una
   tarea sin leer su hallazgo original: acá está el resumen, allá está la evidencia completa
   con los números y los escenarios de falla.

Y si la tarea toca UI/UX/visual/animaciones/componentes: **además** `UI_VISION_NITROSALES.md`.

**Cómo saber dónde quedó todo:** la Bitácora (§ 9) en orden cronológico inverso + los estados
de las tareas. Si los dos se contradicen, gana la Bitácora (es lo que efectivamente pasó) y
hay que corregir el estado.

---

## 3. Convenciones

### IDs de tarea
`R-C01` … `R-C31` → críticas · `R-H01` … → altas · `R-M01` … → medias · `R-L01` … → bajas.
Los IDs **no se reutilizan ni se renumeran nunca**, aunque una tarea se descarte.

### Estados
| Símbolo | Significa |
|---|---|
| ⬜ | pendiente, nadie la tocó |
| 🔵 | en curso (poner quién/cuándo al lado) |
| ✅ | hecha **y validada** |
| 🟡 | parcial — el motivo va escrito al lado, sin excepción |
| ⛔ | descartada por decisión explícita de Tomy — el motivo va escrito al lado |
| 🔒 | bloqueada por una dependencia o por una respuesta que falta |

### Riesgo de cada tarea
- 🟢 **bajo** — borrar código muerto, agregar validación, cambios locales sin efecto en prod.
- 🟡 **medio** — cambia comportamiento visible pero es reversible con un revert.
- 🔴 **alto** — puede tumbar producción o perder datos si sale mal. **Requiere OK explícito de
  Tomy antes de ejecutar**, más backup y rollback preparado (ver `CLAUDE.md` § "Cambios en
  config de sistemas externos en prod": los 7 pasos son obligatorios acá).

### Antes de cualquier `git push origin main` (REGLA #3 del repo)
```bash
npx tsc --noEmit          # tiene que pasar
npx vitest run            # tiene que quedar verde (396 tests hoy)
npx next build            # si tocó UI o rutas
git fetch origin && git pull --rebase origin main
```

### Formato de commit
```
<tipo>(<área>): <qué se arregló> [R-Cxx]

<cuerpo opcional>

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```
El ID de tarea entre corchetes es lo que permite rastrear después qué commit cerró qué hallazgo.

### Una tanda = un commit lógico
No mezclar tandas en un commit. Si una tarea necesita 3 commits, que los 3 lleven el mismo ID.

---

## 4. Mapa de fases

| Fase | Contenido | Tareas | Riesgo dominante | Se puede hacer… |
|---|---|---|---|---|
| **FASE 0** | Verificar antes de tocar | 6 | 🟢 ninguno, no toca código | ya mismo |
| **FASE 1** | 37 hallazgos críticos → 31 tareas | 31 | mezclado, incluye 🔴 | después de FASE 0 |
| **FASE 2** | 60 hallazgos altos | 60 | 🟡 medio | después de FASE 1 |
| **FASE 3** | 60 hallazgos medios | 60 | 🟢🟡 | en paralelo con FASE 2 si hay manos |
| **FASE 4** | 40 hallazgos bajos | 40 | 🟢 | cuando haya aire |

**Por qué FASE 0 primero:** cinco hallazgos críticos cambian de gravedad según cosas que no se
pueden saber leyendo código (si una variable de entorno vale tal cosa, si un feature flag está
prendido). Empezar a arreglar sin eso es arreglar a ciegas, y en dos casos el arreglo
"obvio" —rotar el secreto— **tumba producción en silencio**.

---

# FASE 0 — Verificación (no toca una sola línea de código)

> Tiempo estimado: 1-2 horas. Sin esto, la FASE 1 se hace a ciegas.

> **⚠️ Estado de la FASE 0 al 2026-09-02:** la parte que se podía hacer desde el repo está hecha
> (ver **R-V07**, verificación estática). Las cinco verificaciones que necesitan producción están
> 🔒 **bloqueadas**: en esta máquina no hay `.env` ni `.vercel` linkeado, así que no hay acceso a
> las variables de entorno ni a la base. **Las tiene que correr alguien con acceso a Vercel/Neon
> (Axel o Tomy).** Abajo, los comandos exactos.

### R-V01 · Confirmar si las tres variables de entorno valen el literal publicado
- **Estado:** 🔒 bloqueada — requiere acceso a Vercel · **Riesgo:** 🟢 · **Bloquea a:** R-C07, R-C08, R-C09
- **Avance hecho (2026-09-02):** confirmado en el código que **28 de 28 entradas de cron** en
  `vercel.json` mandan el literal, y mapeadas las tres familias de validación. **38 rutas** validan
  contra `NEXTAUTH_SECRET`. `src/lib/admin-key.ts:20` cae a un valor aleatorio por proceso si
  `ADMIN_API_KEY` no está seteada (fail-closed → 403 silencioso).
- **Comando para quien tenga acceso:**
  ```bash
  vercel login && vercel link          # una sola vez
  vercel env ls production
  ```
  Y comparar el valor de `ADMIN_API_KEY`, `NEXTAUTH_SECRET` y `SYNC_KEY` contra
  `<CLAVE-EN-vercel.json-VER-R-C09>`.
- **Alternativa sin acceso al panel — sondas de SOLO LECTURA** (importante: **no** usar
  `/api/sync?key=...` como sonda, que dispara un sync completo en producción). Usar un `GET` que
  solo lea, desde el dominio propio:
  - familia `ADMIN_API_KEY` → un `GET` admin de lectura protegido por `isValidAdminKey`
  - familia `SYNC_KEY` → `/api/cron/exchange-rates` es el más liviano de los cinco
  - familia `NEXTAUTH_SECRET` → **no hay sonda inocua**; todos los que la validan escriben.
    Verificar esta por panel, no por llamada.
  Un **401/403** significa que esa familia de crons **está muerta ahora mismo** → es un incidente
  activo, no una tarea de plan.
- **Qué hay que averiguar:** si `ADMIN_API_KEY`, `NEXTAUTH_SECRET` y `SYNC_KEY` valen
  exactamente `<CLAVE-EN-vercel.json-VER-R-C09>` (el literal que está en `vercel.json:15-157`).
- **Cómo:** entrar al panel de Vercel → Settings → Environment Variables y leerlas. Si no hay
  acceso, la alternativa sin riesgo es llamar a mano, **desde el dominio propio**, un cron de
  cada familia y mirar el status:
  - familia `ADMIN_API_KEY`: `/api/cron/warm-cache?key=...`
  - familia `NEXTAUTH_SECRET`: `/api/sync?key=...`
  - familia `SYNC_KEY`: `/api/cron/anomalies?key=...`
- **Qué significa cada resultado:**
  - **200 en las tres** → el secreto de sesión está publicado en el repo. R-C09 pasa a máxima
    prioridad, y hay que asumir que **pudo haber sido leído** (rotar, no solo esconder).
  - **401/403 en alguna** → esa familia de crons **está muerta ahora mismo**. Anotar cuál y
    desde cuándo (revisar logs de Vercel). Es un incidente activo, no una tarea de plan.
- **Documentar en:** Bitácora + `CLAUDE_STATE.md`.

### R-V02 · Inventariar los feature flags que están en `true` en producción
- **Estado:** 🟡 parcial — defaults resueltos desde el código; falta confirmar los valores reales en Vercel
- **Riesgo:** 🟢 · **Bloquea a:** R-C25, R-H (varios de datos)
- **Avance hecho (2026-09-02) — esto baja la urgencia de R-C25:** los flags no son todos iguales.
  | Flag | Comparación en el código | Default si NO está seteada |
  |---|---|---|
  | `PIXEL_USE_GOLD` | `=== "true"` (`metrics/pixel/route.ts:264`) | **APAGADO** |
  | `PIXEL_USE_CHANNELS` | `=== "true"` (`metrics/pixel/route.ts:294`) | **APAGADO** |
  | `PIXEL_USE_GOLD_CHANNEL` | `=== "true"` (`metrics/pixel/route.ts:324`) | **APAGADO** |
  | `ORDERS_USE_GOLD` | `=== "true"` (`metrics/orders/route.ts:209`) | **APAGADO** |
  | `ATTRIBUTION_ROLLUP_ENABLED` | `=== "false"` (`refresh-gold-attribution/route.ts:39`) | **PRENDIDO** |
  | `SILVER_ORDERS_ENABLED` | `=== "false"` (`refresh-silver-orders/route.ts:44`) | **PRENDIDO** |
  Los cuatro de serve son **opt-in**: si nadie los seteó, están apagados. Además,
  `MERGE-CANALES.local.md:31` y `RETOMAR.local.md:56` dicen que Canales quedó *"merge-ready,
  esperando el OK de Tomy"* con el flag **OFF por default**, y que la verificación con el flag
  prendido se hizo **en preview**, no en producción.
- **Lectura provisoria:** lo más probable es que R-C25 (el revenue Gold que solo sube) sea **una
  bomba sin cebar, no un incendio activo**. Pero es inferencia, no confirmación.
- **Falta:** `vercel env ls production` y mirar si alguna de las cuatro está en `true`.
- **Cuáles:** `PIXEL_USE_GOLD`, `PIXEL_USE_CHANNELS`, `PIXEL_USE_GOLD_CHANNEL`, `ORDERS_USE_GOLD`,
  `ATTRIBUTION_ROLLUP_ENABLED`, `SILVER_ORDERS_ENABLED`.
- **Por qué importa:** con `PIXEL_USE_GOLD_CHANNEL=true`, el hallazgo del revenue que solo sube
  (R-C25) es **un incendio activo**: los clientes están viendo plata que no existe. Con el flag
  apagado, es una bomba sin cebar y la prioridad baja.
- **Trampa documentada:** `pixel_daily_channel` puede estar **vacía** por un `catch {}` silencioso
  (`rollup-backfill.ts:374-377`). Si alguien prende `PIXEL_USE_GOLD_CHANNEL` viendo que el flag
  existe, el dashboard va a mostrar **cero con toda confianza**. No prender nada en esta fase.

### R-V03 · Confirmar a qué apunta `NEXTAUTH_URL`
- **Estado:** 🔒 bloqueada — requiere acceso a Vercel · **Riesgo:** 🟢 · **Bloquea a:** R-C14
- **Avance hecho (2026-09-02):** confirmado que **solo 3 sitios en todo el repo** mandan
  `x-vercel-protection-bypass` (`cron/refresh-pixel-first-source:176`, `cron/warm-cache:139` y
  `:275`). `sync/chain:141` usa `req.nextUrl.origin` y sus tres `fetch` (líneas 49, 65, 81) **no
  mandan el header**. El hallazgo C-5 de flujos queda confirmado.
- **Comando:** `vercel env ls production` y mirar `NEXTAUTH_URL`.
- **Por qué:** hay **seis** flujos de sync que funcionan "por suerte" — hacen self-fetch sin el
  header de bypass y salvan solo porque la URL base es el dominio propio. Si apunta a la URL del
  deployment, esos seis están rotos ahora mismo. Y si alguien la cambia en el futuro, se rompen
  los seis a la vez sin que nada avise.
- **Lista de los seis:** `cron/vtex-sync-recent:67`, `cron/backfill-runner:147`,
  `cron/post-backfill-finalize:35`, `api/sync/route.ts:39,68`, `api/sync/trigger:73`.

### R-V04 · Auditar cuáles de las 36 migraciones admin corrieron realmente
- **Estado:** 🔒 bloqueada — requiere acceso a la base · **Riesgo:** 🟢 · **Bloquea a:** R-C22
- **Avance hecho (2026-09-02):** confirmado el drift del schema. Ninguna de estas 9 tablas figura
  en `prisma/schema.prisma` (verificado buscando su `@@map`): `silver_orders`, `gold_daily_revenue`,
  `gold_attribution_channel`, `pixel_daily_funnel_by_source`, `api_cache`, `onboarding_requests`,
  `meli_webhook_events`, `backfill_jobs`, `channel_rule`. **El riesgo del `prisma db push` es real
  y verificado.**
- **Se puede hacer YA, sin esperar esta verificación:** el paso 1 de R-C22 (el guard que impide
  `db push`) no depende de saber qué migraciones corrieron. Es la mitigación más barata del plan.
- **Cómo:** por cada endpoint `/api/admin/migrate-*`, leer qué columna/tabla/índice crea y
  verificar contra `information_schema.columns` / `information_schema.tables` / `pg_indexes`
  en la base de producción (solo `SELECT`).
- **Entregable:** una tabla en la Bitácora — endpoint, qué crea, ¿existe en prod?, ¿se puede borrar?
- **Por qué:** hoy el registro de qué corrió vive en la memoria de quien lo corrió y en una tabla
  de `CLAUDE.md` que cubre 3 de las 36.

### R-V05 · Preguntarle a Tomy en qué moneda facturan las cuentas de ads
- **Estado:** 🔒 bloqueada — esperando respuesta de Tomy · **Riesgo:** 🟢
- **La pregunta, textual:** *"¿Las cuentas de Meta Ads y Google Ads de Arredo, TeVeCompras, EMDJ
  y El Mundo facturan todas en pesos? ¿Alguna está en dólares?"*
- **Por qué:** `ad_metrics_daily.spend` **no tiene columna de moneda** y el conector no la pide.
  El ROAS de toda la plataforma es revenue en ARS dividido gasto en moneda desconocida. Si una
  sola cuenta factura en USD, **el ROAS de ese canal está mal por un factor de ~1.000**. De la
  respuesta depende si esto es un hallazgo documental (bajo) o de negocio (crítico).

### R-V06 · Backup de la base antes de empezar la FASE 1
- **Estado:** 🔒 bloqueada — requiere acceso a Neon · **Riesgo:** 🟢 · **Bloquea a:** toda la FASE 1
- **Qué:** snapshot de Neon (o el mecanismo de branching de Neon) con fecha, anotado en la
  Bitácora. Varias tareas de la FASE 1 tocan datos; sin punto de retorno no se empieza.

---

### R-V07 · Verificación estática de los hallazgos críticos contra el código real
- **Estado:** ✅ hecho (2026-09-02) · **Riesgo:** 🟢 (solo lectura, no se tocó nada)
- **Por qué se hizo:** los seis reportes los escribieron agentes. Antes de que alguien actúe sobre
  un hallazgo —y varios implican borrar código o tocar producción— hacía falta comprobar uno por
  uno contra el archivo real. **Ninguno de los 20 verificados resultó falso.**

| Hallazgo | Verificación | Resultado |
|---|---|---|
| Literal en `vercel.json` | 28 de 28 entradas de cron lo llevan | ✅ confirmado |
| `NEXTAUTH_SECRET` como API key | **38 rutas** lo validan como `?key=` | ✅ confirmado (más de las 24 reportadas) |
| Webhook VTEX valida con ese secreto | `webhooks/vtex/orders/route.ts:79` | ✅ confirmado |
| `admin-key.ts` fail-closed a valor aleatorio | línea 20 | ✅ confirmado |
| Backdoor `"usage-2026"` | `admin/usage/route.ts:30` | ✅ confirmado |
| Backdoor `'reattribute-2026'` ×2 | `reattribute:18`, `reconcile:29` | ✅ confirmado |
| Clave `"nitrosales-backfill-2024"` ×2 | `backfill/vtex:29`, `fix-brands:9` | ✅ confirmado |
| Inyección SQL | `backfill/vtex:702` (`UPDATE`) y `:693/696/697` (`DELETE`) | ✅ confirmado |
| IDOR de credenciales VTEX | `:605` usa `orgParam` sin compararlo contra la sesión (`:578`) | ✅ confirmado |
| Credenciales VTEX en globals de módulo | `:25-28` declaradas, `:606-608` asignadas dentro del handler | ✅ confirmado |
| `ml-sync` fail-open | `cron/ml-sync:293` — `if (cronSecret && ...)`, comentario *"Optional"* | ✅ confirmado |
| Webhook VTEX responde 200 al fallar | `:794-796` — `NextResponse.json({ok:false})` sin `status` | ✅ confirmado |
| `markSyncSuccess` incondicional | `sync/route.ts:83`, fuera del `try/catch`, antes del `return ok:true` | ✅ confirmado |
| `sync/chain` sin header de bypass | `:141` usa `nextUrl.origin`; los 3 `fetch` sin header | ✅ confirmado |
| `IDENTIFY` re-atribuye 10 órdenes | `identity.ts:403-426` — `take: 10` + `calculateAttribution` | ✅ confirmado |
| `LivePulse status="LIVE"` | `(app)/layout.tsx:414` | ✅ confirmado |
| `setError` nunca se usa | `dashboard/page.tsx` — solo 2 apariciones: declararlo y vaciarlo | ✅ confirmado |
| 28 queries en `Promise.all` | `metrics/pixel:365`; **0** usos de `allSettled` en el archivo | ✅ confirmado |
| Clave de caché desalineada | warm manda `&model=` (`:257`); `analytics/page.tsx:519` no | ✅ confirmado |
| Dos planificadores de rollups | `vercel.json` `3,18,33,48 * * * *` + GH Actions `*/15` con `for i in 1..6` | ✅ confirmado |
| Gold de atribución sin `DELETE` | `buildDeleteOrphans` se usa en 4 transforms; los 2 de atribución no | ✅ confirmado |
| `/discrepancy` fuera del contrato | sin `ordersValid`; y `'NITRO'` hardcodeado en `:100` | ✅ confirmado |
| Drift de schema | 9 de 9 tablas verificadas sin `@@map` en `schema.prisma` | ✅ confirmado |

**Tres cosas que la verificación cambió respecto de los reportes:**

1. **Ascendido de "SIN CONFIRMAR" a confirmado — `backfill/vtex` escribe con org vacía.** El
   `ORG_ID` de módulo (`:25`) **nunca se asigna en ningún lado**; el handler declara un `const`
   local (`:578`) que no lo alcanza. Las fases `catalog`/`inventory`/`orders` lo usan en las líneas
   166, 217, 433, 468 y 496 → **escriben con `organizationId = ''`**. Es un argumento más para
   borrar el endpoint (R-C02) en vez de arreglarlo.
2. **Ampliado — `dashboardPasswordPlain` se escribe en dos lugares**, no en uno:
   `api/influencers/route.ts:115` **y** `api/influencers/[id]/route.ts:108`. R-C06 tiene que tocar
   los dos. Sigue confirmado que **nunca se lee**.
3. **Precisión para no arreglar la línea equivocada en R-C11:** el chequeo de key del webhook VTEX
   **sí** devuelve 401 correctamente (`:79-83`) — el comentario de arriba dice *"still return 200
   to not confuse VTEX"* y **miente sobre su propio código**. El 200-al-fallar está en el `catch`
   final (`:794-796`), que es otra línea. Arreglar el `catch`, no el chequeo de key, y de paso
   borrar el comentario que confunde.

**Bonus confirmado de paso (R-L14):** `backfill/vtex/route.ts` tiene bloques de comentario con
encoding roto en cadena — 45 líneas que ocupan 94 KB de basura. Otra razón para borrar el archivo.

---

# FASE 1 — Los 37 hallazgos críticos (31 tareas)

> **Orden pensado:** primero lo que se puede cerrar sin romper nada (tanda 1.1), después la
> rotación de secretos que sí es delicada (1.2), después lo que hace que se pierdan ventas (1.3),
> después la capacidad de enterarse (1.4), después el alivio de performance (1.5), después la
> coherencia de datos (1.6) y al final el diseño (1.7).
>
> **No cambiar este orden sin entender por qué está así.** En particular: 1.2 va después de 1.1
> porque borrar backdoors es gratis, y la rotación de secretos tumba cosas si se hace mal.

---

## TANDA 1.1 — Cerrar puertas (bajo riesgo, alto impacto)

### R-C01 · Borrar las tres contraseñas hardcodeadas de los endpoints admin
- **Estado:** ⬜ pendiente · **Riesgo:** 🟢 bajo · **Frente:** Seguridad
- **Evidencia:** `review-seguridad.md` → CRIT-03 · `review-arquitectura.md` → H-02
- **Archivos:**
  - `src/app/api/admin/usage/route.ts:30` — `key !== process.env.ADMIN_SECRET && key !== "usage-2026"`
  - `src/app/api/admin/reattribute/route.ts:18` — `... && key !== 'reattribute-2026'`
  - `src/app/api/admin/reconcile/route.ts:29` — `... && key !== 'reattribute-2026'`
- **Qué está mal:** el `&&` con un literal vuelve el control decorativo. Sin sesión, desde
  internet, `reconcile?org=<cualquiera>` reescribe la atribución de un cliente ajeno y
  `reattribute` recorre **todas las atribuciones de todas las organizaciones** en un loop
  secuencial (además de corromper datos, satura Neon).
- **Qué hacer:**
  1. Borrar el `|| key !== '<literal>'` de los tres.
  2. Decidir con Tomy si `reattribute` y `reconcile` se usan todavía. **Si no se usan, borrar los
     endpoints enteros** — es más seguro que protegerlos.
  3. Si se quedan: exigir `isInternalUser()` además de la key, y agregarles `?dry=true` obligatorio
     por defecto (hoy `reconcile` lo tiene opt-in y `reattribute` no lo tiene).
  4. `reattribute` además no filtra por `organizationId`: si se queda, hacerlo obligatorio.
- **Validar:** `curl -X POST '<url>/api/admin/reattribute?key=reattribute-2026'` → debe dar 401.
- **Rollback:** `git revert` del commit.

### R-C02 · Neutralizar `/api/backfill/vtex` (inyección SQL + IDOR + credenciales compartidas)
- **Estado:** ⬜ pendiente · **Riesgo:** 🟡 medio (si se usa para onboarding) · **Frente:** Seguridad + Flujos
- **Evidencia:** `review-seguridad.md` → CRIT-05 · `review-flujos.md` → C-7
- **Archivos:** `src/app/api/backfill/vtex/route.ts` (líneas 25-28, 29, 578, 605-608, 650-702)
- **Tres problemas en un mismo archivo:**
  1. **Inyección SQL:** `newStatus` y `orderId` salen crudos de `searchParams` y se interpolan en
     `$executeRawUnsafe` (línea 702 y 650/664/675/693/696/697). Un `newStatus` que cierre la comilla
     alcanza la tabla `orders` **entera, de todos los tenants**. La variante `action=delete` llega
     a `DELETE FROM orders`.
  2. **IDOR:** `getVtexConfig(orgParam)` (línea 605) usa el `?org=` del que llama **sin verificar
     que su sesión pertenezca a esa organización** → carga y usa las credenciales VTEX de otro cliente.
  3. **Credenciales en variables de módulo:** `VTEX_ACCOUNT`, `VTEX_KEY`, `VTEX_TOKEN` (líneas 25-28)
     se comparten entre invocaciones concurrentes de la misma instancia (Fluid Compute). Dos
     backfills simultáneos de orgs distintas se pisan las credenciales.
  4. Bonus de correctitud: `ORG_ID` a nivel de módulo queda en `""` para las fases
     `catalog`/`inventory`/`orders`, que lo usan en las líneas 166/217/433/468/496/520.
- **Qué hacer:**
  1. **Preguntarle a Tomy si este endpoint se usa.** Si el backfill de onboarding pasa por
     `backfill_jobs` + `backfill-runner` (que es lo que sugiere el resto del código), **este
     endpoint es un fósil y hay que borrarlo entero**. Esa es la opción preferida: cierra los
     cuatro problemas de una.
  2. Si se usa: parametrizar con `Prisma.sql`, allowlist para `newStatus` contra el enum
     `OrderStatus`, validar la sesión contra el `?org=`, y mover las tres `VTEX_*` adentro del
     handler.
  3. Mismo tratamiento para `src/app/api/fix-brands/route.ts` (misma clave hardcodeada
     `nitrosales-backfill-2024`, mismas globals de módulo en las líneas 15-16, y es un `GET`
     de 1.007 líneas que **muta datos**).
- **Validar:** intentar el payload de inyección contra un entorno que no sea prod, o revisar por
  lectura que no quede ninguna interpolación. `git grep 'executeRawUnsafe' src/app/api/backfill/`.

### R-C03 · Sacar de producción los endpoints y páginas públicas que no deberían estar
- **Estado:** ⬜ pendiente · **Riesgo:** 🟢 bajo · **Frente:** Seguridad + Flujos + Diseño
- **Evidencia:** `review-flujos.md` → H-8, H-12 y Anexo B · `review-diseno.md` → H-5, H-6 · `review-arquitectura.md` → § 4
- **Lista concreta:**
  | Qué | Dónde | Por qué |
  |---|---|---|
  | `/api/debug/meta` | `src/app/api/debug/meta/route.ts` | público, sin auth, devuelve datos de **todos** los tenants |
  | `/design-preview` | `src/app/design-preview/` | pública, sin login, con cifras de un cliente real |
  | `/aura/paletas` | `src/app/(app)/aura/paletas/page.tsx` | laboratorio dark neón publicado |
  | `/api/alertas` | `src/app/api/alertas/route.ts` | duplicado muerto en español que **saltea el RBAC** |
  | 27 endpoints `debug-*` + 10 `test-*` | ver Anexo B de `review-flujos.md` | superficie de ataque sin uso |
- **Qué hacer:** borrarlos. Para los 37 de debug/test: revisar la lista del Anexo B uno por uno,
  borrar los que no tengan uso, y para los pocos que sí sirvan, meterlos detrás de `isInternalUser()`.
- **Ojo:** al menos 5 de los debug están en el allowlist del guard `check-order-contract`, o sea
  que además tienen el filtro de órdenes drifteado. Borrarlos también limpia ese allowlist.
- **Validar:** `npx next build` + `curl` a cada URL borrada → 404.

### R-C04 · `ml-sync`: convertir el fail-open en fail-closed
- **Estado:** ⬜ pendiente · **Riesgo:** 🟢 bajo · **Frente:** Flujos
- **Evidencia:** `review-flujos.md` → C-6
- **Archivo:** `src/app/api/cron/ml-sync/route.ts:290-294`
- **Qué está mal:**
  ```ts
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) { return 401; }
  ```
  Si la variable no existe, el `if` no se evalúa y **el endpoint queda público**. `CRON_SECRET`
  no aparece ni en `.env.example` ni en `vercel.json`. Cualquiera que descubra la URL puede
  dispararlo en loop: cada llamada lanza syncs de ML para las 4 orgs, satura Neon y consume la
  cuota de la app de MercadoLibre (que ML puede desactivar por abuso).
- **Qué hacer:** invertir la condición — si `CRON_SECRET` no está seteada, **devolver 500 y no
  ejecutar nada**. Setear la variable en Vercel. Documentarla en `.env.example`.
- **Segundo hallazgo del mismo sitio:** `ml-sync` **no está agendado en `vercel.json`**, pero
  `CLAUDE.md` documenta *"MercadoLibre: cron 1x/día 2am"* como red de seguridad. **Esa red no
  existe.** Decidir con Tomy: agendarla o corregir `CLAUDE.md`. No dejar la doc mintiendo.
- **Validar:** `curl` sin header → 401 con la variable puesta, 500 sin ella.

### R-C05 · Cerrar los huecos del middleware
- **Estado:** 🟡 **PARCIAL (2026-09-06)** — huecos 1 y 2 cerrados en `1e8b65c4`
  (branch `fix/expansion-gate-e0`). El hueco 3 (los dos fail-open) sigue abierto y va
  **después de R-C09**, como dice el paso 3 de acá abajo.
- **Riesgo:** 🟡 medio (puede dejar afuera a alguien) · **Frente:** Seguridad
- **Evidencia:** `review-seguridad.md` → CRIT-06
- **Archivos:** `src/lib/section-access.ts:21-56, 144, 155` · `src/middleware.ts:65`
- **Tres huecos:**
  1. `API_SECTION_PREFIXES` no incluye `/api/admin`, `/api/backfill`, `/api/pixel`, `/api/webhooks`,
     `/api/influencers`, `/api/settings`, `/api/dashboard`. Un `MEMBER` de cualquier org atraviesa
     el middleware hacia cualquier ruta admin; lo único que lo frena es el `isInternalUser()` de
     cada handler — **que 50 de las 154 rutas admin no tienen**.
  2. Todo el gating vive dentro de un `if (token)` (`middleware.ts:65`): sin token no hay gating.
  3. **Doble fail-open:** `isPathAllowed` devuelve `true` si `allowedSections` no es un array
     (línea 144) y otra vez si `writableSections` no lo es (línea 155). Un JWT emitido antes del
     deploy de RBAC pasa todo, lectura y escritura, durante 24 horas.
- **Qué hacer:**
  1. Agregar un gate único para `/api/admin/*` y `/api/backfill/*` exigiendo `isStaff`.
  2. Mapear los prefijos faltantes a sus secciones.
  3. Convertir los dos fail-open en fail-closed **después** de que todos los JWT viejos hayan
     expirado (o sea: después de R-C09, que rota el secreto e invalida todas las sesiones).
- **Cuidado:** el paso 3 depende de R-C09. Hacerlo antes deja a usuarios legítimos afuera.
- **Validar:** probar con las cuentas reales (`mromero@arredo.com.ar` y `leandroc@tevecompras.com`
  tienen rol Standard restringido) que sigan viendo lo que deben y nada más.
- **Lo hecho (2026-09-06):** `/api/admin/*` y `/api/backfill/*` son staff-only, **fail-closed**.
  Dos cosas que casi lo vuelven un incidente y quedaron con test:
    · los crons y los self-fetch server-to-server le pegan a `/api/admin/*` **sin cookie**, así
      que no tienen token y el gate no los evalúa. Un 403 ahí no lo alerta Vercel;
    · `/api/admin/channel-rules` y `/api/admin/channels-breakdown` las llama el **cliente** desde
      `/pixel/canales`. Van como excepción, a la sección `pixel`. Un gate ciego a `/api/admin`
      le apagaba el panel de canales a Arredo y a TeVe.
- **De paso:** el middleware decidía staff con `token.isStaff` a secas mientras `auth.ts` usa
  `isStaffUser()` (flag de DB **+** allowlist por email). Era el único lugar con ese criterio.
- **Del resto de prefijos que pedía la auditoría, revisados y NO gateados a propósito:**
  `/api/pixel/*` es el ingest **público** del pixel y el serve del snippet; `/api/webhooks/*` los
  llaman VTEX y MELI con su propia key; `/api/settings` y `/api/dashboard` tienen flujos SELF.
  Queda documentado en `section-access.ts` para no rehacer el análisis.
- **Hallazgo aparte, no estaba en la auditoría** (`83d13d1a`): `/admin/onboardings` vive en
  `src/app/(app)/admin/`, otro grupo de rutas, así que el `isInternalUser()` de
  `src/app/admin/layout.tsx` **no le aplicaba**. Cualquier usuario logueado podía abrir la
  pantalla de solicitudes de activación. Cerrado con un layout propio + un test que recorre las
  18 páginas bajo `admin`/`control` y exige guard en algún ancestro.

### R-C06 · Contraseñas de creadores: dejar de guardarlas en texto plano
- **Estado:** 🟡 **PARCIAL (2026-09-06)** — pasos 1 y 2 hechos en `62ed2b5a`. Los pasos 3, 4 y 5
  siguen pendientes: **el paso 3 invalida las contraseñas de creadores reales y hay que
  coordinarlo con Tomy.**
- **Riesgo:** 🟡 medio (invalida contraseñas existentes) · **Frente:** Seguridad + Arquitectura
- **Evidencia:** `review-arquitectura.md` → H-03 · `review-seguridad.md` → HIGH-03
- **Archivos:**
  - `src/app/api/influencers/route.ts:114-115` — escribe `dashboardPasswordPlain`
  - `prisma/schema.prisma:1261` — la columna
  - `hashPassword` (SHA-256 sin salt) **duplicado literal en 7 archivos**: `api/influencers/route.ts:16`,
    `applications/route.ts:23`, `[id]/route.ts:17`, `public/influencers/[slug]/[code]/route.ts:19`,
    `.../content/route.ts:14`, `.../set-password/route.ts:19`, `.../verify/route.ts:14`
- **Qué está mal:** la copia en claro **más** un hash sin salt que se rompe con una rainbow table.
  Mientras tanto los usuarios de la app usan bcrypt. Los creadores reusan contraseñas: un dump de
  esa tabla expone credenciales reales de personas.
- **Qué hacer, en este orden:**
  1. Confirmar que `dashboardPasswordPlain` **no se lee en ningún lado** (la auditoría dice que no:
     `git grep dashboardPasswordPlain src/` debería dar solo la escritura).
  2. Dejar de escribirla (borrar la línea 115).
  3. Migrar los 7 `hashPassword` a una única función con bcrypt en `src/lib/` (o reusar la de
     `auth.ts`). Los hashes viejos no se pueden convertir: hay que **forzar reseteo de contraseña
     a los creadores** o aceptar ambos esquemas durante una ventana.
  4. Recién después: `ALTER TABLE influencers DROP COLUMN "dashboardPasswordPlain"` y sacarla del
     schema. **Respetar el orden de migraciones de `CLAUDE.md`**: endpoint admin primero, ejecutar,
     después tocar el schema.
  5. Borrar `/api/admin/migrate-creator-password-plain` (además, su comentario tiene un `curl` con
     el secreto adentro).
- **Coordinar con Tomy:** hay creadores reales con acceso. Hay que avisarles.
- **⚠️ ERA PEOR DE LO QUE DICE ESTA FICHA (encontrado el 2026-09-06):** no es sólo un problema de
  almacenamiento. Los **cuatro** handlers de `/api/influencers` devolvían la fila **entera** (el
  GET usa `findMany` sin `select`; los otros tres hacen `...influencer`), así que en cada listado
  **viajaban al navegador las contraseñas en claro de todos los creadores de la org**. Ninguna
  pantalla las usa: `manage/page.tsx` sólo las manda al crear o editar.
- **Además la ficha listaba un solo sitio de escritura; son dos** (también el PUT de
  `[id]/route.ts:108`).
- **Lo hecho:** se dejó de escribir la copia en claro y se sacaron las dos columnas de toda
  respuesta, con un sanitizador único en `src/lib/influencer-secretos.ts`. En su lugar va un
  booleano `tieneDashboardPassword`, que es lo único que la UI necesitaba.
- **Lo que sigue abierto:** los valores en claro **ya guardados** siguen en la base hasta borrar
  la columna (pasos 4-5), y el hash sigue siendo SHA-256 sin salt hasta el paso 3.

---

## TANDA 1.2 — Rotación de secretos 🔴

> **Esta tanda entera es riesgo alto.** Hecha en el orden equivocado, tumba el webhook de órdenes
> de los cuatro clientes y los 28 crons, en silencio (Vercel no alerta por 401 en crons).
> **Requiere OK explícito de Tomy y los 7 pasos de `CLAUDE.md` § "Cambios en config de sistemas
> externos en prod".**

### R-C07 · Separar los secretos y aceptar los dos valores durante la transición
- **Estado:** ⬜ pendiente · **Riesgo:** 🟡 medio · **Depende de:** R-V01 · **Frente:** Seguridad + Flujos
- **Evidencia:** `review-seguridad.md` → CRIT-01, CRIT-02 · `review-flujos.md` → C-1, C-2
- **La foto actual:** un solo literal (`<CLAVE-EN-vercel.json-VER-R-C09>`, en `vercel.json:15-157`)
  alimenta **cuatro** secretos distintos:
  | Secreto | Dónde se valida | Qué cubre |
  |---|---|---|
  | `ADMIN_API_KEY` | `src/lib/admin-key.ts:19-27` | ~20 crons + endpoints admin |
  | `NEXTAUTH_SECRET` | `api/sync/route.ts:139`, `sync/chain:133`, `webhooks/vtex/orders:79` | `/api/sync`, `/api/sync/chain`, **el webhook de órdenes**, 24 rutas `migrate-*` |
  | `SYNC_KEY` | `cron/anomalies:27`, `digest:23`, `ads-utm-audit:37`, `exchange-rates:66`, `inflation-index:51` | 5 crons |
  | literal `nitrosales-backfill-2024` | `backfill/vtex:29`, `fix-brands:9` | endpoints manuales (los cierra R-C02) |
- **Qué hacer (paso previo, sin romper nada):**
  1. Crear en Vercel tres variables **nuevas** con valores nuevos y distintos: `CRON_SECRET_V2`,
     `ADMIN_API_KEY_V2`, `VTEX_WEBHOOK_SECRET`.
  2. Cambiar cada validador para que acepte **el valor nuevo O el viejo** (transición).
  3. Deployar. Verificar que todo sigue funcionando.
  4. Cambiar `vercel.json` para que los crons manden el valor nuevo — preferentemente en un
     header `Authorization: Bearer`, no en query param (los query params quedan en los access logs
     de Vercel, en el historial del browser y en el `Referer`).
  5. Deployar. Verificar cron por cron que devuelvan 200.
- **Validación obligatoria entre paso y paso:** llamar cada uno de los 28 crons a mano y mirar el
  status. **No avanzar con uno solo en 401.**
- **Documentar todas las variables nuevas en `.env.example`** (hoy no está documentada ninguna de
  las siete que el sistema usa).

### R-C08 · Sacar el secreto de sesión de la URL del webhook de VTEX
- **Estado:** ⬜ pendiente · **Riesgo:** 🔴 alto · **Depende de:** R-C07 · **Frente:** Seguridad
- **Evidencia:** `review-seguridad.md` → CRIT-02
- **Archivos:** `src/app/api/webhooks/vtex/orders/route.ts:79` · `webhooks/vtex/inventory/route.ts:42`
- **Qué está mal:** la URL del webhook —que incluye `?key=<NEXTAUTH_SECRET>`— se configura
  **dentro del panel de administración de VTEX de cada cliente**, donde cualquier operador de la
  tienda la puede leer (Configuración → Pedidos → Orders Broadcaster). Con ese secreto se firma un
  JWT propio como staff de cualquier organización, se forja un token de impersonate
  (`admin/impersonate/route.ts:26-33` usa el mismo secreto como clave HMAC) y se forja un reset de
  contraseña para cualquier email (`password-reset-token.ts:41`).
- **Qué hacer:**
  1. Que el webhook valide `VTEX_WEBHOOK_SECRET` (creado en R-C07), **por organización si es
     posible**, y aceptarlo también por header.
  2. Durante la transición, aceptar los dos.
  3. **Reconfigurar el hook en los cuatro clientes.** Ojo: VTEX tiene **dos mecanismos separados**
     (Afiliados por UI, Orders Broadcaster solo por API) — está documentado en `CLAUDE.md` §
     "Multi-tenant webhooks VTEX". Hay que tocar los dos, y conservar el `?org=<orgId>`.
  4. Verificar con una orden de prueba real por cliente antes de sacar el valor viejo.
- **Rollback preparado:** el `POST` a `/api/orders/hook/config` con la configuración anterior,
  capturada antes de tocar nada (paso 3 de los 7 de `CLAUDE.md`).
- **Red de seguridad durante la ventana:** `vtex-sync-recent` cada 30 min recupera órdenes, pero
  **está capado a 100 por org** (ver R-H de flujos). Subir ese cap temporalmente durante esta tarea.

### R-C09 · Rotar `NEXTAUTH_SECRET` y sacar el literal de `vercel.json`
- **Estado:** ⬜ pendiente · **Riesgo:** 🔴 alto · **Depende de:** R-C07, R-C08 · **Frente:** Seguridad
- **Qué hacer:**
  1. Confirmar que **ningún** cron ni webhook depende ya de `NEXTAUTH_SECRET` (o sea: R-C07 y
     R-C08 cerradas y validadas).
  2. Rotar `NEXTAUTH_SECRET` en Vercel. **Esto invalida todas las sesiones**: todos los usuarios,
     incluidos los clientes, tienen que volver a loguearse. Avisarles antes.
  3. Borrar el literal de las 28 entradas de `vercel.json`.
  4. **El literal queda en el historial de git para siempre.** Por eso el paso 2 no es opcional:
     borrarlo del archivo no alcanza. `TODOS.md` § 2 ya advertía exactamente esto y sigue sin hacerse.
  5. Aprovechar la ventana: una vez que todos los JWT viejos murieron, cerrar los dos fail-open
     de `section-access.ts:144,155` (paso 3 de R-C05).
- **Efecto secundario deseado:** después de esto, el snapshot de permisos viejo en JWT
  (`review-seguridad.md` → HIGH-07) deja de ser un problema para las sesiones existentes.

### R-C10 · Sacar las credenciales VTEX de las variables de módulo
- **Estado:** ⬜ pendiente · **Riesgo:** 🟡 medio · **Frente:** Flujos
- **Evidencia:** `review-flujos.md` → C-7
- **Archivos:** `api/backfill/vtex/route.ts:25-28` · `api/fix-brands/route.ts:15-16`
- **Nota:** si R-C02 termina en "borrar los dos endpoints", **esta tarea se cierra sola**. Marcarla
  ✅ con la referencia al commit de R-C02.
- **Si no:** mover todas las variables de módulo (`VTEX_ACCOUNT`, `VTEX_KEY`, `VTEX_TOKEN`,
  `_requestHeaders`, `_requestBaseUrl`) adentro del handler, y **buscar el mismo patrón en el
  resto del repo**: `git grep -n "^let \|^var " src/app/api/ | grep -v "^.*://"`.

---

## TANDA 1.3 — Que dejen de perderse ventas

### R-C11 · El webhook de órdenes de VTEX tiene que fallar con 500, no con 200
- **Estado:** ⬜ pendiente · **Riesgo:** 🟡 medio · **Frente:** Flujos
- **Evidencia:** `review-flujos.md` → C-3
- **Archivos:** `src/app/api/webhooks/vtex/orders/route.ts:794-796`, `:152-159`, `:29`, `:148`, `:344-412`
- **Qué está mal:** el `catch` final devuelve `{ok:false}` **sin `status`**, o sea 200. El Orders
  Broadcaster de VTEX usa el código HTTP para decidir si reintenta: un 200 significa "recibido y
  procesado". Cualquier excepción en las ~700 líneas del handler (timeout de Neon, un item sin
  precio, VTEX lento) se convierte en "listo, gracias" y **la orden no entra nunca**.
- **Qué hacer:**
  1. Que el `catch` devuelva **500**. Lo mismo en `:152-159` y en `webhooks/vtex/inventory:293`.
  2. Agregar timeout al `fetch` a la OMS de VTEX (línea 148): hoy no tiene, y `maxDuration=30`.
     Si VTEX tarda 35s, la función muere sin responder nada.
  3. Envolver `orderItem.deleteMany` + los `create` (línea 344) en una transacción: hoy están
     sueltos y si la función muere a mitad la orden queda con ítems parciales o cero.
  4. Achicar el N+1 del loop de ítems (líneas ~344-412): por cada ítem hace `product.findUnique`
     + a veces un `fetch` HTTP a VTEX sin timeout + `product.upsert` + `orderItem.create`. Una
     orden de 20 ítems son ~60 queries secuenciales y hasta 20 llamadas HTTP dentro de 30 segundos.
     Batchear los `findUnique` y sacar el fetch del loop.
- **Ojo con el orden:** hacer (1) sin (2), (3) y (4) hace que VTEX reintente órdenes que van a
  volver a fallar por lentitud. **Los cuatro pasos van en el mismo commit.**
- **Validar:** forzar un error controlado en un entorno de prueba y ver que devuelve 500. Después,
  en prod, una orden de prueba real de punta a punta.

### R-C12 · Webhook de MercadoLibre: autenticarlo y reintentar lo que falló
- **Estado:** ⬜ pendiente · **Riesgo:** 🟡 medio · **Frente:** Flujos
- **Evidencia:** `review-flujos.md` → C-9
- **Archivos:** `src/app/api/webhooks/mercadolibre/route.ts:25-26, 62-69, 94-112, 125-146`
- **Dos problemas:**
  1. **Sin autenticación de ningún tipo** — ni key, ni firma, ni filtro de IP (los IPs de ML están
     comentados en las líneas 25-26). Cualquiera que conozca el `user_id` de ML de un cliente puede
     pre-insertar `_id`s en el outbox y **envenenar el dedup** para que las notificaciones reales
     se descarten.
  2. **Lo que falla no se reintenta nunca.** Se responde 200 antes de procesar, se inserta la fila
     en `meli_webhook_events` antes de procesar, y si el proceso tira, la fila queda con
     `processed = false`. **Ningún proceso en todo `src/` lee esas filas.** `ml-missed-feeds` solo
     trae lo que ML no pudo entregar, no lo que entregó y nosotros rompimos.
- **Qué hacer:**
  1. Autenticar el endpoint (filtro de IP de ML + un secreto en la URL del callback).
  2. **Escribir un worker de reintentos** que lea `WHERE processed = false` con backoff, y que
     alerte si hay filas pendientes más de N minutos. Agendarlo en `vercel.json`.
  3. Alertar cuando la cantidad de pendientes cruce un umbral.
- **Por qué importa:** este es el mecanismo exacto del incidente citado en `CLAUDE.md` —
  **1.600 órdenes de MELI perdidas durante 6 días**.

### R-C13 · Que la señal de salud del sync deje de auto-confirmarse
- **Estado:** ⬜ pendiente · **Riesgo:** 🟡 medio (van a aparecer alertas reales) · **Frente:** Flujos
- **Evidencia:** `review-flujos.md` → C-4
- **Archivos:** `src/app/api/sync/route.ts:83` · `sync/chain/route.ts:95` · `src/lib/sync-tracker.ts:19-22` ·
  `src/lib/control/checks.ts:42, 76-80` · `src/lib/sync-lock.ts:80`
- **Qué está mal:** `markSyncSuccess()` se llama **fuera** de los `try/catch` y sin mirar `results`.
  `/api/sync/chain` corre cada 2 horas y escribe "sync exitoso hace 0 minutos" pase lo que pase, y
  además pone `lastSyncError = null` (borrando el rastro del error real). Con el umbral de alerta
  en 24 horas, la conexión VTEX de cualquier cliente **es matemáticamente incapaz de cruzarlo**.
- **Qué hacer:**
  1. `markSyncSuccess` solo si `results` no tiene errores. Si los tiene, `markSyncError` con el
     detalle.
  2. Dejar de pisar `lastSyncError` en `releaseSyncLock` (`sync-lock.ts:80`).
  3. Revisar el umbral de 1440 min: con `chain` corriendo cada 2h, 24h es demasiado laxo.
- **Advertencia:** al cerrar esto **van a aparecer alertas que hoy están ocultas**. Eso es el punto.
  Avisarle a Tomy antes de deployar para que no lo tome como una regresión.

### R-C14 · `sync/chain`: agregar el header de bypass
- **Estado:** ⬜ pendiente · **Riesgo:** 🟢 bajo · **Depende de:** R-V03 · **Frente:** Flujos
- **Evidencia:** `review-flujos.md` → C-5
- **Archivo:** `src/app/api/sync/chain/route.ts:141` (`req.nextUrl.origin`) y los tres `fetch` de
  las líneas 47, 65, 80.
- **Qué está mal:** cuando lo dispara Vercel Cron, `req.nextUrl.origin` es la URL del deployment,
  que está detrás de Deployment Protection. Los tres self-fetch reciben **401 con un body HTML**,
  `res.json()` explota, y el resultado se guarda como error… que después R-C13 tapa con
  `markSyncSuccess`. **Esto está fallando ahora mismo, cada 2 horas**: inventario, detalles de
  órdenes y reconcile de los cuatro clientes no corren, y el módulo de P&L usa un `costPrice` que
  nunca se puebla.
- **Qué hacer:** usar `NEXTAUTH_URL` como base **y** mandar `x-vercel-protection-bypass`, como ya
  hace `cron/warm-cache:263` y `cron/refresh-pixel-first-source:163`.
- **Además:** los **seis** flujos que hoy funcionan "por suerte" (lista en R-V03) deberían mandar
  el header también, para no depender de que `NEXTAUTH_URL` no cambie nunca.
- **Validar:** disparar el cron desde Vercel (no a mano desde el dominio propio, que es lo que
  despistó durante semanas en el incidente BP-ROLLUP-CRON) y ver que los tres pasos den `ok:true`.

### R-C15 · Que un onboarding trabado deje de ser invisible
- **Estado:** ⬜ pendiente · **Riesgo:** 🟢 bajo · **Frente:** Flujos
- **Evidencia:** `review-flujos.md` → C-10
- **Archivos:** `src/lib/control/checks.ts:171` · `src/app/api/admin/onboardings/[id]/approve-backfill/route.ts:110-205` ·
  `src/app/api/cron/backfill-runner/route.ts:147`
- **Tres agujeros que llevan al mismo lugar:**
  1. `checkStuckOnboardings` filtra `status IN ('PENDING','NEEDS_INFO','IN_PROGRESS')` — **falta
     `BACKFILLING`**. Un onboarding en ese estado es invisible para el Centro de Control para siempre.
  2. `approve-backfill` pone `status = 'BACKFILLING'` **incondicionalmente** y devuelve
     `ok: true, "Jobs creados: 0"` aunque no haya creado ninguno (pasa si `historyVtexMonths = 0`,
     que es el default). El cliente recibe el mail de "empezamos a traer tu historia" igual.
  3. El disparo de `post-backfill-finalize` (línea 147 de `backfill-runner`) es un `fetch`
     fire-and-forget **sin `waitUntil`**, dentro de un handler que responde inmediatamente después.
     En Vercel la función se congela al responder → el fetch puede no salir nunca. Y
     `post-backfill-finalize` no está en `vercel.json`, así que si ese disparo se pierde **nunca
     corren el catalog-refresh, el recompute de agregados ni el backfill de `costPrice`** → el
     módulo de P&L queda entero en cero.
- **Qué hacer:** agregar `BACKFILLING` al check; que `approve-backfill` falle ruidosamente si crea
  0 jobs; envolver el fetch en `waitUntil` (el mismo archivo ya lo usa bien en las líneas 89-101 y
  183-197, o sea que es un olvido, no una decisión); agendar `post-backfill-finalize` como red.
- **Por qué importa:** es literalmente el caso Arredo, documentado en `ERRORES_CLAUDE_NO_REPETIR.md`
  → `#ONBOARDING-BACKFILL-ORDENES-FALTANTE`. **El mecanismo que lo permitió sigue intacto.**

---

## TANDA 1.4 — Que el sistema pueda avisar

### R-C16 · Telemetría real
- **Estado:** ⬜ pendiente · **Riesgo:** 🟢 bajo · **Frente:** Flujos
- **Evidencia:** `review-flujos.md` → M-1 (medio en su reporte, pero **es lo que hace que todos
  los críticos sean invisibles**, por eso sube a esta tanda)
- **La foto:** 519 `console.error` en `src/`, y **cero** Sentry / Datadog / OpenTelemetry. El único
  canal de alerta real es un mail a **una** dirección personal hardcodeada
  (`tlapidus@99media.com.ar`, en 7 sitios).
- **Qué hacer:**
  1. Instalar Sentry (o el que Tomy prefiera) y capturar excepciones en las rutas de API.
  2. Reemplazar el destinatario hardcodeado por una variable de entorno con lista.
  3. Alertar específicamente sobre: webhook fallando, cron devolviendo 401/403, cron que no corrió,
     y filas `processed=false` acumulándose.
- **Sin esto, las tandas 1.1-1.3 arreglan los problemas pero no la ceguera.**

### R-C17 · Que un fallo deje de verse como un cero
- **Estado:** ⬜ pendiente · **Riesgo:** 🟡 medio · **Frente:** Flujos + Performance + Diseño
- **Evidencia:** `review-flujos.md` → C-8 · `review-performance.md` → C4 · `review-diseno.md` → C-2, C-3, C-4
- **Archivos (backend):** `src/app/api/metrics/pixel/route.ts:158, 365, 1986-1996` ·
  `metrics/orders/route.ts:27-34` · `metrics/orders/enrich/route.ts:116, 399` ·
  `cron/exchange-rates:88` · `cron/inflation-index:67,75,91` · **+17 rutas más (Anexo C de `review-flujos.md`)**
- **Qué está mal:** ante cualquier excepción se devuelve **HTTP 200 con todo en cero**. El frontend
  no puede distinguir "no hubo tráfico" de "la query murió". Y hay un agravante: `warm-cache`
  **persiste ese cero en el caché compartido de Postgres**, así que se le sirve a todos los
  usuarios de esa organización hasta el próximo TTL.
- **Qué hacer:**
  1. `metrics/pixel/route.ts:365`: pasar las 28 queries de `Promise.all` a **`Promise.allSettled`**,
     para que una sola falla no rechace el batch entero. La ruta hermana `metrics/orders` ya tiene
     degradación parcial con `safeQuery` — copiar ese patrón.
  2. Que el fallo devuelva un status de error real, o al menos un campo `_error` **que la UI lea**.
  3. Que `warm-cache` **no escriba en caché** una respuesta con `_error`.
  4. Repasar las 17 rutas del Anexo C.
- **Parte de UI (va junto, si no el backend arregla algo que nadie ve):**
  - `src/app/(app)/dashboard/page.tsx:445, 544, 570, 578, 587, 1173-1175` — `setError` se llama
    **una sola vez en 1.542 líneas, y es para vaciarlo**. El banner rojo de la línea 1174 es código
    muerto. Los ~25 fetches hacen `.catch(() => null)`.
  - `src/components/dashboard/WidgetFormats.tsx:211, 254, 290, 319, 386, 445, 528` — ocho lugares
    donde una colección vacía se pinta como **esqueleto de carga infinito**. Un cliente nuevo con
    0 pedidos, un cliente cuya API explotó y un período sin ventas ven exactamente lo mismo.
  - `src/app/(app)/nitropixel/page.tsx:100-106, 378` — los `?? 0` renderizan la página entera con
    "US$0 · 0 eventos · 0 días vivo" y el error va abajo del fold en rojo casi invisible.
- **Qué hacer en UI:** crear un `<EmptyState>` y un `<ErrorState>` de verdad (con copy, ícono y
  botón de reintentar) y usarlos en los ocho sitios. En `/nitropixel`, si `data === null` mostrar
  el estado de error **en lugar** de la página, no debajo.
- **Referencia de cómo se hace bien en este mismo repo:** `pixel/analytics/page.tsx:889`.

---

## TANDA 1.5 — Alivio de performance

### R-C18 · Dejar un solo planificador de rollups
- **Estado:** ⬜ pendiente · **Riesgo:** 🟢 bajo · **Frente:** Performance
- **Evidencia:** `review-performance.md` → C1
- **Archivos:** `.github/workflows/keep-pixel-rollups-fresh.yml:18-44` · `vercel.json:126-129` ·
  `src/app/api/cron/refresh-pixel-rollups/route.ts:141` · `src/app/api/cron/warm-cache/route.ts:118-146`
- **Qué está mal:** el mismo endpoint pesado se dispara desde **dos planificadores que no se
  conocen**: GitHub Actions cada 15 min con un bucle de **6 llamadas seguidas**, más el cron de
  Vercel cada 15 min, más el self-heal de `warm-cache`. Son ~7 invocaciones de hasta 250 segundos
  cada una dentro de una ventana de 900 segundos, agregando con HLL sobre una tabla de **43 GB**.
  Los dos eligen "la tabla más atrasada", así que eligen la misma y corren el mismo statement dos
  veces. Para `channel` hay además un `DELETE` seguido de `INSERT` sin lock: es una carrera real.
- **Por qué es lo primero de performance:** esto es, mecánicamente, **la razón de que el working
  set del dashboard nunca quede caliente**. El diagnóstico de que el cuello era memoria fue
  correcto; subir Neon de 2 a 4 CU atacó la oferta sin tocar la demanda.
- **Qué hacer:** dejar **uno** de los dos planificadores (el workflow de GH se agregó como red
  cuando Vercel dejó de disparar; con la red puesta, el cron de `vercel.json` es redundante), y
  bajar el bucle de `for i in 1 2 3 4 5 6` a `1 2`. La rotación ya elige la tabla más atrasada.
- **Validar:** mirar las métricas de Neon (cache hit rate) antes y después. El hallazgo predice
  una mejora medible.

### R-C19 · `warm-cache`: alinear la clave y dejar de generar cómputos huérfanos
- **Estado:** ⬜ pendiente · **Riesgo:** 🟢 bajo · **Frente:** Performance
- **Evidencia:** `review-performance.md` → C2, C3
- **Dos bugs, uno de ellos de una línea:**
  1. **La clave no coincide.** `warm-cache/route.ts:255-258` calienta con `&model=NITRO`;
     `pixel/analytics/page.tsx:519` pide **sin `model`**. `cache-key.ts:52` mete `model` en la
     clave → son dos entradas distintas de `api_cache` y el cron llena la que nadie lee. **El 100%
     del trabajo dirigido a `/pixel/analytics` se tira.** Se arregla agregando `&model=${apiModel}`
     en `analytics/page.tsx:519` (o sacando `model` del warm; cualquiera de las dos).
  2. **El warm aborta a los 20s pero el cómputo sigue vivo.** `warm-cache:268` usa
     `AbortSignal.timeout(20_000)`, pero abortar el fetch no cancela nada del lado del servidor, y
     `metrics/pixel:1975` mete el cómputo en `waitUntil(...)`, que **explícitamente** mantiene viva
     la función. Con presupuesto de 220s, una corrida puede dejar **hasta 11 cómputos en paralelo**,
     cada uno con 28 queries, contra un pool de 24 conexiones. El comentario del código describe un
     diseño "estrictamente secuencial, anti-thundering-herd" que no existe.
- **Qué hacer:** el fix de una línea primero (es gratis y devuelve muchísimo). Después, alinear el
  timeout del warm con lo que realmente tarda el cómputo, o cambiar el mecanismo para que el warm
  no dispare un cómputo que no va a esperar.

### R-C20 · Matar los `LIKE '%…%'` de la ingesta del pixel
- **Estado:** ⬜ pendiente · **Riesgo:** 🟡 medio (toca el camino de PURCHASE) · **Frente:** Performance
- **Evidencia:** `review-performance.md` → C5
- **Archivos:** `src/app/api/pixel/event/route.ts:238-245, 283, 313`
- **Qué está mal:** `props: { path:['orderId'], string_contains }` se traduce a
  `(props #>> '{orderId}') LIKE '%…%'` sobre una tabla de **24M filas sin ningún índice en `props`**.
  Y `orders.externalId LIKE '%…%'` con comodín inicial inutiliza el índice único. Ocurre **dos
  veces por compra**. A ~1.000 compras/día son del orden de 10⁸ lecturas diarias de heap sobre 43 GB.
- **Por qué es crítico aunque no rompa ninguna pantalla:** es **el segundo gran envenenador de la
  caché de Neon** después de la tormenta de rollups, y no aparece en ningún cron ni en ningún log.
  En picos, el receptor se pone lento, el `sendBeacon` del navegador se pierde y **se pierden
  eventos de compra en silencio** (el endpoint devuelve 204 pase lo que pase).
- **Qué hacer:** entender por qué se busca por "contiene" en vez de por igualdad (probablemente
  prefijos de `orderId` de VTEX). Si es un prefijo, usar `LIKE 'X%'` (indexable) o normalizar el
  `orderId` al guardarlo y comparar por igualdad. Si hace falta, índice de expresión sobre
  `(props ->> 'orderId')`.

### R-C21 · Acotar las dos queries de historia completa de `/api/metrics/products`
- **Estado:** ⬜ pendiente · **Riesgo:** 🟢 bajo · **Frente:** Performance
- **Evidencia:** `review-performance.md` → C6
- **Archivos:** `src/app/api/metrics/products/route.ts:305-322` (Query 6), `:395-417` (Query 9), `:13` (`maxDuration = 60`)
- **Qué está mal:** las dos escanean **toda la historia de órdenes** de la organización, no el
  rango pedido. La Query 9 además ordena por `p.sku, o."orderDate" DESC`, que ningún índice
  soporta. El comentario de la línea 134 dice **"~58s"** medidos en una org **más chica que
  Arredo**, con `maxDuration=60`: el margen es de dos segundos. Y como el resultado es
  independiente del rango, `warm-cache` las recalcula 4 veces por org cada 5 minutos —
  ~192 escaneos de historia completa por hora para dos resultados que no cambian.
- **Qué hacer:** acotarlas por fecha si la semántica lo permite; si no, cachearlas aparte con TTL
  largo (el resultado no depende del rango) y sacarlas del warm por rango.

### R-C22 · Cerrar el drift entre la base de producción y `schema.prisma`
- **Estado:** ⬜ pendiente · **Riesgo:** 🔴 alto (tocar el schema mal borra tablas) · **Depende de:** R-V04 · **Frente:** Flujos + Performance
- **Evidencia:** `review-flujos.md` → C-11 · `review-performance.md` → H5
- **Qué está mal:** **~30 tablas físicas y 13 índices de producción no existen en
  `prisma/schema.prisma`**: toda la capa medallion (`silver_*`, los seis `gold_*`), los siete
  `pixel_daily_*`, `pixel_visitor_first_source`, `onboarding_requests`, `meli_webhook_events`,
  `backfill_jobs`, `api_cache`, `channel_rule`, `alert_rules`, `email_*`, `sync_watermarks`,
  `vtex_*`… (lista completa en `review-flujos.md` → C-11).
- **El riesgo real:** un `npx prisma db push` —el comando más normal del mundo para sincronizar un
  campo nuevo— **las detecta como huérfanas y ofrece borrarlas**. Se perderían silver, gold, todos
  los rollups del pixel, el onboarding y el outbox de ML. La reconstrucción es de días.
- **Qué hacer, con mucho cuidado y en este orden:**
  1. **Primero, la protección barata:** agregar un guard en `package.json` o un `pre-commit` que
     impida `prisma db push` sin una confirmación explícita. Esto se puede hacer **hoy** y cierra
     el riesgo agudo mientras se hace el resto.
  2. Declarar las tablas en `schema.prisma` **con `@@map` y sin cambiar su forma**, una tanda por
     vez, verificando con `prisma migrate diff` que Prisma no proponga ningún `ALTER`.
  3. Lo mismo con los 13 índices (tabla en `review-performance.md` § a.1/a.2).
  4. Reemplazar los 36 endpoints `admin/migrate-*` por migraciones versionadas de Prisma, o al
     menos una tabla de registro de qué corrió (hoy vive en la memoria de quien lo corrió).
- **No hacer:** un `db push` "para probar". Nunca, hasta que esto esté cerrado.

---

## TANDA 1.6 — Coherencia de los datos

> **Advertencia:** `attribution.ts` y `webhooks/vtex/orders/route.ts` están marcados como **CORE
> PROTEGIDO** en `CORE-ATTRIBUTION.md`: *"prohibido modificar sin autorización explícita del
> fundador"*. Las tareas R-C23, R-C24 y R-C28 tocan ese núcleo. **Cada una necesita OK de Tomy por
> separado**, y antes de tocar nada hace falta R-H01 (test de caracterización).

### R-C23 · El merge "IP+UA" es solo por IP
- **Estado:** ⬜ pendiente · **Riesgo:** 🔴 alto (CORE, cambia números históricos) · **Frente:** Datos
- **Evidencia:** `review-datos.md` → C-1 · `[YA CONOCIDO: BACKLOG_PENDIENTES.md:67]`
- **Archivos:** `src/lib/pixel/attribution.ts:216-267` · `src/lib/pixel/identity.ts:139-141`
- **Qué está mal:** el bloque se llama "IP+UA Identity Merging" y se justifica con *"el 99,3% de
  las combinaciones IP+UA son de un solo visitante"*, pero la query **solo filtra por `ipHash`** —
  no hay ninguna condición sobre `userAgent`, y `hashIP()` no lo incluye. Bajo CGNAT móvil argentino
  (Claro, Movistar, Personal comparten IP pública entre miles de abonados) la premisa se cae.
- **Consecuencia:** los eventos de decenas de personas se fusionan en el recorrido de una. Meta se
  lleva last-clicks de ventas que no generó. Y **el mismo motor calcula la comisión de los
  creadores de Aura**: le paga plata real a quien no vendió.
- **Opciones (decisión de Tomy):**
  - **(a)** agregar la condición sobre `userAgent` que el nombre del bloque ya promete;
  - **(b)** desactivar el merge por IP hasta poder medir cuánto aporta;
  - **(c)** dejarlo pero excluirlo del cálculo de comisiones de Aura.
- **Antes de decidir:** medir cuántas atribuciones dependen hoy de este merge. Sin ese número la
  decisión es a ciegas.

### R-C24 · La ingesta del pixel no puede seguir disparando atribución
- **Estado:** ⬜ pendiente · **Riesgo:** 🔴 alto (CORE) · **Frente:** Seguridad + Datos
- **Evidencia:** `review-seguridad.md` → CRIT-04 · `[YA CONOCIDO PARCIALMENTE: BP-PIXEL-AUDIT]`
- **Archivos:** `src/app/api/pixel/event/route.ts:110, 260-296, 305-331` · `src/lib/pixel/identity.ts:380-433`
- **Dos vectores:**
  - **A (el documentado, confirmado):** mandar un `PURCHASE` forjado con el `orderId` de una orden
    real entra por el Case B (línea 260), reapunta el evento del webhook al visitante del atacante
    y **re-ejecuta `calculateAttribution`** (línea 288).
  - **B (nuevo, no estaba en el backlog, y más barato):** un `IDENTIFY` con el email de un
    comprador real linkea el visitante al `Customer` (identity.ts:385-389), trae **sus últimas 10
    órdenes** (líneas 403-411) y corre `calculateAttribution` sobre cada una (línea 426). **Un solo
    POST re-atribuye 10 órdenes históricas.** No hace falta adivinar ningún ID.
- **Qué hacer:** lo que ya dice el backlog, más el vector nuevo:
  1. El `PURCHASE` que llega del browser **no dispara atribución ni comisión** — solo el webhook
     autenticado de VTEX/MELI.
  2. El `IDENTIFY` **no re-atribuye órdenes históricas** sin corroboración del lado del servidor.
  3. Rate limit real (hoy es un `Map` en memoria del proceso: inútil en serverless) y **por IP, no
     por organización** — hoy un atacante desde una sola IP puede quemar la cuota de Arredo y hacer
     que se descarten los eventos de sus compradores reales.
  4. Límite de tamaño de `props` (hoy es JSON arbitrario que se persiste entero).
  5. Validar el rango de `event.timestamp` (línea 375): hoy es controlado por el cliente y se puede
     backdatear para caer dentro de la ventana de atribución de un creador.

### R-C25 · Gold de atribución: agregar el borrado de huérfanas
- **Estado:** ✅ **HECHO (2026-09-06)** — branch `hotfix/gold-attribution-huerfanas`, commits
  `aaf41b81` (fix + tests) y `8b8063db` (verificación). **Sin mergear**: el merge espera al plan entero.
  Verificación completa en `docs/VERIFICACION-R-C25.md` (en esa branch).
- **Riesgo:** 🟡 medio · **Depende de:** R-V02 (contestado: los 3 flags en `true`) · **Frente:** Datos
- **Evidencia:** `review-datos.md` → C-2
- **Archivos:** `src/data/gold/gold-attribution-channel-transform.ts:28-101` ·
  `gold-attribution-source-transform.ts:37-121` · `cron/refresh-gold-attribution-channel/route.ts:34, 76`
- **Qué está mal:** son los **únicos dos** de los seis rollups Gold sin el arreglo de "días
  afectados + borrado de huérfanas" que `affected-days.ts:80-97` documenta y que los otros cuatro
  aplican. Son `INSERT ... ON CONFLICT DO UPDATE` puro, sin `DELETE`.
- **Consecuencias:** una venta cancelada **sobrevive en la tabla para siempre** (el revenue solo se
  corrige hacia arriba). Y como el canal es parte de la clave primaria y cambia cuando se editan
  las reglas desde `/pixel/canales`, **renombrar una regla duplica el revenue de los últimos 4 días**
  y parte la serie histórica en dos canales que son el mismo.
- **El modelo a copiar está en el mismo repo:** `rollup-backfill.ts:356-372` (`pixel_daily_channel`)
  hace DELETE-then-insert **y el comentario explica exactamente por qué**.
- **Además:** `DAYS_BACK = 4` con filtro `o."orderDate" >= $2` hace que una orden re-atribuida con
  fecha de hace 10 días **nunca entre a Gold**. Revisar esa ventana.
- **Prioridad según R-V02:** si `PIXEL_USE_GOLD_CHANNEL=true` en prod, esto es un incendio activo.
- **Medido en prod (2026-09-06):** con `?full=1` sobre la copia aislada de producción aparecieron
  **672 huérfanas sobre 12.502 filas** en `gold_attribution_source` (**5,4 % de la tabla**) y **26**
  en `gold_attribution_channel` (todas de TeVe Compras). O sea: no era teórico, el panel venía
  sumando ~698 filas de plata que ya no existe.
- **Lo que hizo que no fuera copiar y pegar:** la ventana usaba el instante **con hora**, así que
  el día del borde se recomputaba parcial. Agregar el DELETE sobre eso habría borrado revenue
  **real**. La ventana ahora se trunca al inicio del día AR.

### R-C26 · Unificar el vocabulario de canales del embudo
- **Estado:** ⬜ pendiente · **Riesgo:** 🟡 medio · **Frente:** Datos
- **Evidencia:** `review-datos.md` → C-3
- **Archivos:** `src/app/api/metrics/pixel/funnel/route.ts:60-75` vs `:172-186` ·
  `src/lib/pixel/touchpoint-source-sql.ts:51-59` · `src/app/(app)/pixel/analytics/page.tsx:562, 645, 668`
- **Qué está mal:** el desplegable ofrece `google_organic` (con sufijo, que es lo que emite
  `touchpointSourceCase`), las etapas 1-4 leen `first_source` que **sí** tiene ese bucket, pero la
  etapa "Compra" compara contra el `source` **crudo** del touchpoint, que nunca lo tiene:
  `attribution.ts` escribe `source='google'` + `medium='organic'`. La igualdad no matchea jamás.
- **Qué ve el cliente:** filtrando por Google Orgánico en Arredo, 30 días:
  84.300 visitas → 41.100 productos → 6.900 carritos → 2.100 checkouts → **0 compras**. La verdad
  son ~1.100 órdenes. Y el espejo: filtrando por Google Ads, la etapa Compra suma también las
  orgánicas → **una tasa de conversión del 129%** visible en pantalla (`page.tsx:1188-1193`).
- **Qué hacer:** una sola función que traduzca `source+medium` → bucket canónico, usada por los dos
  caminos. **No parchear un lado solo**: el bug espejo demuestra que las dos puntas tienen que
  compartir la definición.

### R-C27 · `/discrepancy`: aplicar el contrato canónico de orden válida
- **Estado:** ⬜ pendiente · **Riesgo:** 🟢 bajo · **Frente:** Datos
- **Evidencia:** `review-datos.md` → C-4 · `[YA CONOCIDO parcialmente: DATA_COHERENCE.md § Próximos pasos]`
- **Archivo:** `src/app/api/metrics/pixel/discrepancy/route.ts` (las 7 queries: líneas 94-101,
  115-122, 136-143, 156-163, 180-187, 241-248, 277-280)
- **Qué está mal:** **ninguna** de las 7 aplica `ordersValidWhere` ni excluye marketplace. El
  `import` del contrato no existe en el archivo. Es justamente la pantalla cuyo trabajo es comparar
  el número de NitroSales contra el de Meta y Google.
- **Qué ve el cliente:** 30 días de Arredo, `/pixel/analytics` dice **$850M** y `/pixel/discrepancia`
  dice **$970M** para el mismo rango y modelo, porque suma pendientes, canceladas y marketplace.
  El delta contra Meta queda sesgado ~14% hacia arriba.
- **Bug secundario en el mismo archivo:** la línea 100 hardcodea `pa.model::text = 'NITRO'` mientras
  el resto usa `${selectedModel}` → si el usuario elige LAST_CLICK, esa tarjeta sigue mostrando NITRO.
- **Qué hacer:** importar los helpers de `src/domains/orders/index.ts` en las 7 queries + arreglar
  el modelo hardcodeado. Actualizar `DATA_COHERENCE.md`, que además apunta a
  `src/lib/metrics/orders.ts` — un archivo que **ya no existe** (se movió a `src/domains/orders/`).

### R-C28 · Recalcular la atribución cuando VTEX cambia el monto de la orden
- **Estado:** ⬜ pendiente · **Riesgo:** 🔴 alto (CORE) · **Frente:** Datos
- **Evidencia:** `review-datos.md` → C-5
- **Archivos:** `src/app/api/webhooks/vtex/orders/route.ts:224-238, 430-434` ·
  `src/lib/pixel/attribution.ts:751, 765-789` · `cron/attribution-reconcile/route.ts:88-99`
- **Qué está mal:** el webhook actualiza `totalValue` en cada cambio de estado, pero la atribución
  solo corre la primera vez (`if (!isNewOrder) { ... pixelAttribution = true; // Assume it was
  already done }`), y `attributedValue` se congela con el valor del momento. **No hay ningún camino
  que re-sincronice** `pixel_attributions.attributedValue` con `orders.totalValue`.
- **Qué ve el cliente:** una orden que entra por $1.500.000 y queda en $900.000 tras cancelar un
  ítem muestra **$900.000 en el KPI de revenue web y $1.500.000 en "Revenue por canal"**, en la
  misma pantalla. A escala Arredo (252k órdenes, cancelaciones parciales frecuentes en muebles) es
  estructural, no un caso borde. Y **infla el ROAS**, porque el numerador sale de `attributedValue`
  y el denominador de `ad_metrics_daily`.
- **Qué hacer:** si `totalValue` cambió, actualizar `attributedValue` (recalculando o
  reescalando proporcionalmente los touchpoints). Ojo con la interacción con R-C25: si Gold no
  borra huérfanas, corregir hacia abajo no se propaga.

---

## TANDA 1.7 — Lo que ve el cliente

### R-C29 · Conectar el indicador "EN VIVO" al dato real
- **Estado:** ⬜ pendiente · **Riesgo:** 🟢 bajo · **Frente:** Diseño
- **Evidencia:** `review-diseno.md` → C-1
- **Archivos:** `src/app/(app)/layout.tsx:414` — `<LivePulse status="LIVE" />` ·
  `src/components/enterprise/ui.tsx:96-116` · el dato real ya existe y llega por API:
  `pixelData.liveStatus.status`, usado en `pixel/analytics/page.tsx:730`
- **Qué está mal:** el único indicador de salud del producto —el puntito que Tomy pidió para
  mostrar que el pixel mide en vivo— es un literal. Si el pixel de Arredo se cayó hace tres días,
  si el snippet nunca se instaló, si el período no tiene un solo evento: **la píldora sigue verde,
  sigue pulsando y sigue diciendo EN VIVO** en las 82 pantallas.
- **Qué hacer:** pasarle el `liveStatus` real, y borrar el badge duplicado de
  `pixel/analytics:730-736` (hoy conviven dos indicadores de "vivo" a 40px, con dos verdes
  distintos y solo uno verdadero).

### R-C30 · Estados de vacío y de error de verdad
- **Estado:** ⬜ pendiente · **Riesgo:** 🟢 bajo · **Va junto con:** R-C17 · **Frente:** Diseño
- **Ver el detalle completo en R-C17** (la parte de UI). Se listan como tareas separadas porque
  R-C17 es backend y esta es frontend, pero **conviene hacerlas en el mismo commit**: arreglar el
  backend sin la UI no cambia nada de lo que ve el cliente.

### R-C31 · Cerrar el perímetro visual
- **Estado:** ⬜ pendiente · **Riesgo:** 🟢 bajo · **Frente:** Diseño
- **Evidencia:** `review-diseno.md` → C-5, C-6
- **Archivos:**
  - `src/components/OnboardingGate.tsx:57-59, 77-110` — `AuroraLoader`: pantalla completa `#0A0A0F`
    con dos blobs de 45vw/50vw y `blur(100px)` animados en loop, **en cada carga en frío y cada F5
    de cualquier página**. El audit de agosto ya marcó esto como crítico #1; se arregló
    `layout.tsx:246` y quedó la causa un nivel más arriba en el árbol.
  - `src/app/login/page.tsx:32, 79` — fondo casi negro con aurora naranja y **botón con gradiente
    naranja fluo**, que es el antipatrón #8 explícito de `UI_VISION_NITROSALES.md` § 9.
  - `src/components/OnboardingOverlay.tsx:94, 190-219` — `AuroraBackground` con tres orbes.
  - `src/app/accept-invite/page.tsx` (29 clases slate) y `src/app/unauthorized/page.tsx` (13).
  - `src/app/forgot-password/`, `src/app/reset-password/`.
- **Qué está mal:** el barrido cromático funcionó **dentro** del panel (0 clases `slate`, 0 `gray`
  en las 82 páginas) pero no cruzó al perímetro, que es lo que el cliente ve **antes** de entrar.
  El recorrido de día 1: login oscuro con aurora naranja → onboarding negro con tres orbes → panel
  hueso cálido → invitar a un colega devuelve al slate frío. **Cuatro sistemas visuales en cinco
  pantallas.**
- **Qué hacer:** `OnboardingGate:57` → `<PageLoader minHeight="100vh" />` sobre `bg-canvas` (borrar
  `AuroraLoader` entero); login / forgot / reset → canvas hueso + botón `bg-ink`; borrar
  `AuroraBackground`; `accept-invite` y `unauthorized` → `bg-canvas`.
- **Bonus de copy roto:** `login/page.tsx:42` dice *"La primera pantalla después de entrar es
  NitroPixel"*. Es falso desde el commit `2b14de25`: `src/app/page.tsx:32` redirige según permisos,
  que para un usuario normal es `/dashboard`.

---

# FASE 2 — Los 60 hallazgos altos

> Formato compacto: cada fila es una tarea. El detalle con `archivo:línea` está en el reporte del
> frente. **Marcar el estado en la columna de la izquierda al cerrarla, y documentar en la Bitácora
> igual que las críticas** (REGLA #0 aplica a todas las fases).

## 2.1 — Seguridad (9)

| # | Est. | Tarea | Evidencia |
|---|---|---|---|
| R-H01 | ⬜ | Rate limiting y anti-enumeración en el login | seguridad HIGH-01 |
| R-H02 | ⬜ | El token de impersonate no puede caer a un secreto hardcodeado | seguridad HIGH-02 |
| R-H03 | ⬜ | Dashboard del afiliado: bcrypt, contraseña fuera de la URL, rate limit en `/verify` | seguridad HIGH-03 · BP-DASH-SEC |
| R-H04 | ⬜ | Autenticar el webhook de MercadoLibre | seguridad HIGH-04 · (ver R-C12) |
| R-H05 | ⬜ | La verificación de firma de webhooks deja de ser un no-op por defecto | seguridad HIGH-05 |
| R-H06 | ⬜ | `/api/influencers/*` detrás del gate de sección (hoy cualquier logueado toca la plata de Aura) | seguridad HIGH-06 |
| R-H07 | ⬜ | Revalidar permisos contra la DB en vez de confiar 24h en el snapshot del JWT | seguridad HIGH-07 |
| R-H08 | ⬜ | Aurum: límite de costo por org y cortar el camino de prompt-injection hacia escritura | seguridad HIGH-08 |
| R-H09 | ⬜ | Dejar de devolver `error.message` crudo (365 endpoints) y stack traces (~15) | seguridad HIGH-09 |

## 2.2 — Datos (10)

| # | Est. | Tarea | Evidencia |
|---|---|---|---|
| R-H10 | ⬜ | `/pedidos` (`metrics/orders`) al contrato canónico — ~40 copias ad-hoc del filtro | datos H-1 |
| R-H11 | ⬜ | Los toques posteriores a la compra no deben llevarse el last-click | datos H-2 · BACKLOG:66 |
| R-H12 | ⬜ | Estrategias 2b y 4 del webhook: dejan de asignar órdenes al azar bajo concurrencia | datos H-3 |
| R-H13 | ⬜ | Chequeo de cobertura del rollup por canal en los dos bordes, no solo el inferior | datos H-4 |
| R-H14 | ⬜ | `customers.totalSpent`/`totalOrders`: una sola definición canónica (hoy hay tres) | datos H-5 |
| R-H15 | ⬜ | `/finanzas`: el año se calcula en AR, no en UTC (hoy el YTD se resetea 3h antes) | datos H-6 |
| R-H16 | ⬜ | Alinear la ventana de `bad_packs` entre Gold y Bronze en `/pedidos` | datos H-7 |
| R-H17 | ⬜ | El delta de ROAS tiene que usar el gasto del período anterior | datos H-8 |
| R-H18 | ⬜ | `finance/alerts/predictive`: filtrar por estado de orden | datos H-9 |
| R-H19 | ⬜ | Revisar el merge de visitantes por teléfono solo | datos H-10 |

## 2.3 — Flujos (13)

| # | Est. | Tarea | Evidencia |
|---|---|---|---|
| R-H20 | ⬜ | `sync-lock` como mutex real, y que deje de pisar los campos de salud | flujos H-1 |
| R-H21 | ⬜ | Alinear `maxDuration` declarado con el techo real de Vercel, en un solo lugar | flujos H-2 · perf L3 |
| R-H22 | ⬜ | Documentar y alinear `statement_timeout` (150s real) y pool (24 real) | flujos H-3 · perf H1 |
| R-H23 | ⬜ | Sacar el DDL del arranque en frío (`ensureColumns`, lock exclusivo sobre `orders`) | flujos H-4 · perf H10 |
| R-H24 | ⬜ | Un `webhookSecret` en cualquier conexión de una org no puede romper su webhook | flujos H-5 |
| R-H25 | ⬜ | Subir el cap de las redes de seguridad de VTEX (hoy 100 órdenes, por debajo del volumen real) | flujos H-6 |
| R-H26 | ⬜ | Arreglar la carrera del refresh de token de ML (puede matar la conexión de forma permanente) | flujos H-7 |
| R-H27 | ⬜ | Borrar `/api/debug/meta` | flujos H-8 · arq H-07 · (cubierto por R-C03) |
| R-H28 | ⬜ | Bajar el baseline de `@ts-nocheck` (290 archivos, 207 en API) — plan por tandas | flujos H-9 · arq H-08 |
| R-H29 | ⬜ | Acotar el `Promise.all` del motor de alertas | flujos H-10 |
| R-H30 | ⬜ | Que las alertas dejen de decir "0 alertas, todo OK" cuando fallan (`catch { return [] }`) | flujos H-11 |
| R-H31 | ⬜ | Borrar los 37 endpoints de debug/test (Anexo B) | flujos H-12 · (cubierto por R-C03) |
| R-H32 | ⬜ | Pasar `authOptions` a las 13 llamadas de `getServerSession()` | flujos H-13 |

## 2.4 — Performance (10)

| # | Est. | Tarea | Evidencia |
|---|---|---|---|
| R-H33 | ⬜ | `statement_timeout` alineado con `maxDuration` (hoy quedan queries zombie) | perf H1 |
| R-H34 | ⬜ | `metrics/orders`: lock de refresco + sacar el retry ×3 del frontend (estampida) | perf H2 |
| R-H35 | ⬜ | Que el tab VTEX/MELI no desactive toda la capa Gold de `/pedidos` | perf H3 |
| R-H36 | ⬜ | Funnel por canal: cobertura + plan B que no devuelva "no disponible" | perf H4 · BACKLOG BP-PIXEL-CHANNEL-ROLLUP |
| R-H37 | ⬜ | Declarar los 13 índices en el schema | perf H5 · (va con R-C22) |
| R-H38 | ⬜ | `metrics/pnl`: `maxDuration`, caché y aislamiento para sus 14 queries | perf H6 |
| R-H39 | ⬜ | Purga de `api_cache` (nunca se limpia y su espacio de claves crece a diario) | perf H7 |
| R-H40 | ⬜ | Acotar los 5-8 endpoints que el dashboard dispara en paralelo desde el navegador | perf H8 |
| R-H41 | ⬜ | `/discrepancy`: caché, `maxDuration` y Gold | perf H9 |
| R-H42 | ⬜ | Backfill masivo del rollup de canal (ahora que Neon está en 4 CU) | BACKLOG BP-PIXEL-CHANNEL-ROLLUP |

## 2.5 — Diseño (11)

| # | Est. | Tarea | Evidencia |
|---|---|---|---|
| R-H43 | ⬜ | Unificar los 81 "Cargando…" en `<PageLoader>` (empezando por `SectionGuard:46`, que es compartido) | diseño H-1 |
| R-H44 | ⬜ | Consolidar las 16 tarjetas de KPI y los 4 sistemas de Card en las primitivas | diseño H-2 |
| R-H45 | ⬜ | Subir `--ent-ink-40` de 3,77:1 a ≥4,5:1 (1.489 usos) y `--ent-amber`; 964 textos ≤10px | diseño H-3 |
| R-H46 | ⬜ | Arreglar los 28 fondos/bordes invisibles por alpha heredado del tema oscuro | diseño H-4 |
| R-H47 | ⬜ | Borrar `/aura/paletas` | diseño H-5 · (cubierto por R-C03) |
| R-H48 | ⬜ | Borrar `/design-preview` | diseño H-6 · (cubierto por R-C03) |
| R-H49 | ⬜ | Barrer los 231 gradientes y 496 clases de la paleta vieja en pantallas del menú | diseño H-7 |
| R-H50 | ⬜ | `<h1>` en las 21 páginas que no lo tienen, incluida la principal | diseño H-8 |
| R-H51 | ⬜ | Labels asociados (3 `htmlFor` para 223 inputs) y foco de teclado (152 `outline-none`) | diseño H-9 |
| R-H52 | ⬜ | `prefers-reduced-motion` global en `globals.css` | diseño H-10 |
| R-H53 | ⬜ | Reemplazar los 39 `alert()`/`confirm()` nativos, empezando por los de pagos a creadores | diseño H-11 |

## 2.6 — Arquitectura (7)

| # | Est. | Tarea | Evidencia |
|---|---|---|---|
| R-H54 | ⬜ | **Test de caracterización de `attribution.ts`** (698 líneas, 0 tests) — **bloquea la tanda 1.6** | arq H-04 |
| R-H55 | ⬜ | `metrics/orders` al contrato canónico (ya divergió) | arq H-05 · (= R-H10) |
| R-H56 | ⬜ | Borrar `/api/alertas` (duplicado muerto que saltea el RBAC) | arq H-06 · (cubierto por R-C03) |
| R-H57 | ⬜ | Que `check-ts-nocheck` y `vitest` corran en el build | arq H-08 |
| R-H58 | ⬜ | Validación con zod en las 114 rutas que leen JSON del cliente (hoy: 0) | arq H-09 |
| R-H59 | ⬜ | Revisar los 122 `catch` silenciosos, prioridad los 33 del motor de alertas | arq H-10 |
| R-H60 | ⬜ | Tests de la lógica de comisiones (`influencer-attribution.ts`, 319 líneas, decide plata) | arq § 5 |

> **R-H54 y R-H60 conviene adelantarlos.** Son la red que hace seguro tocar la tanda 1.6. El propio
> reporte de arquitectura lo dice: *"testear antes que partir: sin red, el refactor es la regresión"*.

---

# FASE 3 — Los 60 hallazgos medios

## 3.1 — Seguridad (7)

| # | Est. | Tarea |
|---|---|---|
| R-M01 | ⬜ | Firmar el `returnTo` de los tres flujos OAuth (open redirect) |
| R-M02 | ⬜ | Cerrar el bypass del gate multi-tenant si el sistema vuelve a tener una sola org |
| R-M03 | ⬜ | Parametrizar los 786 usos de `queryRawUnsafe` con `orgId` interpolado |
| R-M04 | ⬜ | Cookie "View as Org": acortar los 30 días y agregarle marca de tiempo |
| R-M05 | ⬜ | Verificar que las credenciales de conectores no queden en texto plano en la DB |
| R-M06 | ⬜ | Gate en `admin/aura-resend-onboarding` y `admin/migrate-aura-dedup-indexes` |
| R-M07 | ⬜ | El límite de escritura del RBAC no puede fallar abierto para JWT viejos |

## 3.2 — Datos (11)

| # | Est. | Tarea |
|---|---|---|
| R-M08 | ⬜ | El filtro "web" está copiado inline en ~20 lugares y **dos copias ya divergen** |
| R-M09 | ⬜ | La atribución diferida deja `pixel_attributions.visitorId` desincronizado de sus touchpoints |
| R-M10 | ⬜ | `orders.channel` guarda dos formatos distintos según qué camino escribió la fila |
| R-M11 | ⬜ | HLL con precisiones distintas entre tablas que se comparan en la misma pantalla |
| R-M12 | ⬜ | El modelo `TIME_DECAY` se escribe en la base y ninguna pantalla lo puede leer |
| R-M13 | ⬜ | `orders.updatedAt` es `timestamp` sin zona y se compara contra `timestamptz` |
| R-M14 | ⬜ | `/metrics/pixel` sin `from`/`to` compara una ventana rodante contra días calendario |
| R-M15 | ⬜ | `DIM_RULE_EXPRS.source` no aplica `LOWER` y el camino touchpoint sí |
| R-M16 | ⬜ | La etapa "Compra" del funnel es any-touch mientras las otras cuatro son first-touch |
| R-M17 | ⬜ | `traffic_enriched` de Silver usa el primer touchpoint crudo, sin canonicalizar |
| R-M18 | ⬜ | El funnel no distingue `sin_clasificar` entre el camino rollup y el fallback |

## 3.3 — Flujos (12)

| # | Est. | Tarea |
|---|---|---|
| R-M19 | ⬜ | (cubierto por R-C16) Telemetría — 519 `console.error`, un solo destinatario hardcodeado |
| R-M20 | ⬜ | Cooldowns de alerta en memoria de proceso: no funcionan en serverless |
| R-M21 | ⬜ | `useSyncStatus` declara éxito mirando `lastSyncAt`, que también se actualiza al fallar |
| R-M22 | ⬜ | `/api/sync/trigger` sin `maxDuration`, y bloquea una lambda esperando a otra |
| R-M23 | ⬜ | Comentarios de cabecera que mienten sobre si el cron corre (`attribution-reconcile`, `refresh-silver-orders`) |
| R-M24 | ⬜ | N+1 en `checkInactiveClients` dentro de un loop sobre todas las organizaciones |
| R-M25 | ⬜ | `refresh-pixel-first-source` estuvo desagendado 5 semanas sin que nada avisara |
| R-M26 | ⬜ | `backfill-runner` cada minuto con budget de 240s: solapamiento garantizado |
| R-M27 | ⬜ | Revisar los 96 `catch` vacíos |
| R-M28 | ⬜ | 115 interpolaciones de `organizationId` en SQL crudo |
| R-M29 | ⬜ | El middleware de Prisma recorre recursivamente cada resultado convirtiendo `Decimal` |
| R-M30 | ⬜ | `Promise.all` sin límite sobre arrays no acotados (4 sitios) |

## 3.4 — Performance (13)

| # | Est. | Tarea |
|---|---|---|
| R-M31 | ⬜ | Dos queries de geografía byte-idénticas ejecutadas en paralelo (2× el costo) |
| R-M32 | ⬜ | El anti-join de `bad_packs` se evalúa ~22 veces por request (usar la columna `is_valid` de Silver) |
| R-M33 | ⬜ | Subquery de atribuciones sin filtro de fecha: lee toda la historia para cruzar 30 días |
| R-M34 | ⬜ | `recentOrders`: LATERAL con 3 subqueries por item, `ORDER BY` sin desempate, `OFFSET` |
| R-M35 | ⬜ | `= ANY(array de hasta 20.000)` sobre un `COALESCE` no indexable |
| R-M36 | ⬜ | `/metrics/conversion` sin caché ni `maxDuration` |
| R-M37 | ⬜ | Locks y rate-limits en memoria: inútiles con N instancias (es el mismo problema que R-C24) |
| R-M38 | ⬜ | `getFunnelStages`: si el rollup se atrasa, el tramo "en vivo" crece sin techo (se agrava solo) |
| R-M39 | ⬜ | `/metrics/products` devuelve el catálogo completo sin `LIMIT` ni paginación |
| R-M40 | ⬜ | 17 batches secuenciales en `/metrics/orders`: agrupar los de una sola query |
| R-M41 | ⬜ | `next.config.js`: `optimizePackageImports` y configuración de imágenes |
| R-M42 | ⬜ | `pixel_visitors`: 1,3M UPDATEs por semana sobre 1,2M filas (y `totalPageViews` no se usa) |
| R-M43 | ⬜ | `backfill-runner` cada minuto con `maxDuration=300`: hasta 4 lambdas vivas a la vez |

## 3.5 — Diseño (10)

| # | Est. | Tarea |
|---|---|---|
| R-M44 | ⬜ | 159 tooltips nativos `title=` + dos sistemas propios; sin acceso táctil |
| R-M45 | ⬜ | `/nitropixel` vs `/pixel/*`: la arquitectura de información se contradice con las URLs; USD y ARS mezclados |
| R-M46 | ⬜ | Tildes: 45 de 46 títulos del dashboard sin acentuar |
| R-M47 | ⬜ | Jerga en inglés y de producto expuesta a un cliente no técnico |
| R-M48 | ⬜ | Las primitivas oficiales se usan en 11 de ~110 archivos; hay 15 `THEME` locales |
| R-M49 | ⬜ | Código muerto y variantes duplicadas de la migración (11 ítems listados) |
| R-M50 | ⬜ | 37 archivos de UI superan las 800 líneas (el mayor: 3.047) |
| R-M51 | ⬜ | 75 de 82 páginas son client-side; `/products` sin paginación de servidor ni virtualización |
| R-M52 | ⬜ | `SectionGuard`: paleta ajena, loader propio y el copy "Estado desconocido." |
| R-M53 | ⬜ | `PixelInstallBanner` se puede descartar para siempre; después el producto muestra ceros sin explicar |

## 3.6 — Arquitectura (7)

| # | Est. | Tarea |
|---|---|---|
| R-M54 | ⬜ | `NEXTAUTH_SECRET` como API key en 64 rutas (cubierto en parte por R-C07/R-C09) |
| R-M55 | ⬜ | `formatARS` ×5, una de ellas divergente |
| R-M56 | ⬜ | No hay cliente VTEX: 15 archivos hablan HTTP a mano |
| R-M57 | ⬜ | `/influencers` y `/aura` conviven y ya divergieron |
| R-M58 | ⬜ | 53 archivos >800 líneas y 802 funciones >50 (la mayor: 2.439 líneas) |
| R-M59 | ⬜ | `organizationId` interpolado en SQL crudo (= R-M28) |
| R-M60 | ⬜ | Instalar `@vitest/coverage-v8`: hoy el 80% declarado **no es medible** |

---

# FASE 4 — Los 40 hallazgos bajos

| # | Est. | Tarea | Frente |
|---|---|---|---|
| R-L01 | ⬜ | Cabeceras de seguridad y CSP | Seguridad |
| R-L02 | ⬜ | Hash de IP sin salt y truncado a 64 bits | Seguridad |
| R-L03 | ⬜ | `?org=` como IDOR de solo lectura en endpoints admin con key | Seguridad |
| R-L04 | ⬜ | `@ts-nocheck` en endpoints admin destructivos | Seguridad |
| R-L05 | ⬜ | `DATA_COHERENCE.md` apunta a `src/lib/metrics/orders.ts`, que ya no existe | Datos |
| R-L06 | ⬜ | Ninguna métrica de dinero considera la moneda | Datos |
| R-L07 | ⬜ | `ad_metrics_daily.spend` sin columna de moneda (**ver R-V05**) | Datos |
| R-L08 | ⬜ | `Number()` / `::float` sobre `Decimal(12,2)` de revenue | Datos |
| R-L09 | ⬜ | La Estrategia 1 del webhook matchea el `orderId` por prefijo | Datos |
| R-L10 | ⬜ | `pixel_visitor_aliases.oldVisitorId` es único global, no por organización | Datos |
| R-L11 | ⬜ | El "assisted revenue" nunca se materializa | Datos |
| R-L12 | ⬜ | Claves de API en texto plano en `vercel.json` (= R-C09) | Datos |
| R-L13 | ⬜ | `err.stack` filtrado al cliente en `cron/vtex-sync-recent:107` | Flujos |
| R-L14 | ⬜ | Mojibake (encoding roto) en `backfill/vtex` y `analyze/creative:20` | Flujos |
| R-L15 | ⬜ | Dominio hardcodeado en 6+ sitios; uno apunta al dominio viejo dentro de un mail a clientes | Flujos |
| R-L16 | ⬜ | `GET` público en el webhook de VTEX confirma que el endpoint existe | Flujos |
| R-L17 | ⬜ | `.env.example` no documenta 9 variables que el sistema usa, y sí una deprecada | Flujos |
| R-L18 | ⬜ | `useSyncStatus` dispara un sync en cada montaje si la plataforma nunca sincronizó | Flujos |
| R-L19 | ⬜ | Documentación desincronizada: `CLAUDE.md` dice pool 8 / 3 queries; el código usa 24 y dispara 29 | Flujos |
| R-L20 | ⬜ | 121 `console.log` en producción, incluidos los hot paths de webhooks | Flujos |
| R-L21 | ⬜ | Deriva documental en los números de performance (5 lugares donde el comentario contradice al código) | Perf |
| R-L22 | ⬜ | Un `console.log` por batch de eventos del pixel: ~1,3M líneas de log por semana | Perf |
| R-L23 | ⬜ | Los `maxDuration` no describen la realidad de Vercel (la función muere a ~340s) | Perf |
| R-L24 | ⬜ | `pixel_daily_channel` puede estar vacía por un `catch {}` silencioso (**riesgo si se prende el flag**) | Perf |
| R-L25 | ⬜ | 159 SVG inline conviven con `lucide-react` | Diseño |
| R-L26 | ⬜ | `hover` que no hace nada | Diseño |
| R-L27 | ⬜ | `hover:scale-[1.02]` en tarjetas de datos | Diseño |
| R-L28 | ⬜ | Sombras de modal heredadas del tema oscuro | Diseño |
| R-L29 | ⬜ | Foco del sidebar de baja visibilidad | Diseño |
| R-L30 | ⬜ | Enlaces internos con `<a>` en vez de `<Link>` | Diseño |
| R-L31 | ⬜ | Signos de apertura de interrogación faltantes | Diseño |
| R-L32 | ⬜ | Tablas sin contenedor de scroll horizontal | Diseño |
| R-L33 | ⬜ | Exportaciones a PDF con la paleta anterior | Diseño |
| R-L34 | ⬜ | Landing pública de creadores sin migrar | Diseño |
| R-L35 | ⬜ | 15 referencias rotas en la documentación (7 solo en `BACKLOG_PENDIENTES.md`) | Arq |
| R-L36 | ⬜ | 121 `console.log` (= R-L20) | Arq |
| R-L37 | ⬜ | 87 TODO/FIXME/HACK sin tracking | Arq |
| R-L38 | ⬜ | Encoding roto en `package.json:5` | Arq |
| R-L39 | ⬜ | `@ts-ignore` en vez de `@ts-expect-error` | Arq |
| R-L40 | ⬜ | Recrear el `PLAN_PIXEL_HARDENING.md` perdido, o borrar las referencias que lo citan | Arq |

---

# 9. Bitácora

> **Se escribe de arriba hacia abajo: lo más nuevo primero.** Formato en la REGLA #0 (§ 1).
> Esta sección es lo primero que lee una sesión nueva para saber dónde quedó todo.
> **Si la Bitácora y el estado de una tarea se contradicen, gana la Bitácora** y hay que corregir
> el estado.

### [2026-09-06] 🟡 R-C05 y R-C06 — las dos puertas de E-07 que se cierran sin tocar secretos
- **Estado final:** 🟡 las dos PARCIALES a propósito; lo que falta de cada una depende de algo que
  no es código. Commits `1e8b65c4` (R-C05), `62ed2b5a` (R-C06), `83d13d1a` (hallazgo nuevo), en
  `fix/expansion-gate-e0`. **Sin mergear.**

**R-C05 — `/api/admin/*` y `/api/backfill/*` pasan a ser staff-only.** Ninguno de los dos prefijos
estaba en `API_SECTION_PREFIXES`, así que `requiredSectionForPath` devolvía `null` e `isPathAllowed`
devolvía `true`: cualquier usuario logueado de cualquier org atravesaba el middleware hacia las 154
rutas admin, y lo único que lo frenaba era el `isInternalUser()` de cada handler — que 50 de esas
154 no tienen. El gate nuevo es **fail-closed**, al revés que el resto del archivo (los dos
fail-open existen para no lockear a alguien con un JWT viejo; con `maxAge` de 24 h no puede quedar
vivo uno anterior a RBAC, y "no sé si sos staff" no puede resolverse como "pasá").

- **Las dos formas en que esto podía tumbar producción, ambas con test:**
    1. los crons y los self-fetch server-to-server le pegan a `/api/admin/*` **sin cookie de
       NextAuth** → sin token → el middleware no los evalúa. Un 403 ahí no lo alerta Vercel: se
       descubre semanas después, con datos faltantes;
    2. `/api/admin/channel-rules` y `/api/admin/channels-breakdown` las llama el **cliente** desde
       `/pixel/canales`. Van como excepción → sección `pixel`. Un gate ciego le apagaba el panel de
       canales a Arredo y a TeVe.
- **De yapa:** el middleware era el único lugar que decidía staff con `token.isStaff` a secas, en vez
  de `isStaffUser()` (flag de DB + allowlist por email). Un staff sin `users.isStaff=true` pasaba de
  "ve menos secciones" a "no entra más a `/control`".
- **Prefijos revisados y NO gateados a propósito:** `/api/pixel/*` (ingest público del pixel),
  `/api/webhooks/*` (VTEX y MELI con su propia key), `/api/settings` y `/api/dashboard` (flujos
  SELF). Documentado en `section-access.ts` para no rehacer el análisis.

**Hallazgo nuevo, no estaba en la auditoría** (`83d13d1a`): `src/app/admin/layout.tsx` gatea por
`isInternalUser()` todo lo que cuelga de `src/app/admin/*`, pero `/admin/onboardings` vive en
`src/app/(app)/admin/onboardings/` — otro grupo de rutas, otra cadena de layouts, sin guard. La
pantalla de solicitudes de activación la podía abrir **cualquier usuario logueado**. Desde la URL
los dos `/admin` se ven como uno solo; por eso pasó desapercibido. El test recorre `src/app` y
exige guard en algún ancestro para las 18 páginas bajo `admin`/`control`.

**R-C06 — las contraseñas de los creadores salían por la API.** La ficha lo describía como un
problema de almacenamiento. Es peor: los **cuatro** handlers de `/api/influencers` devolvían la fila
entera, así que en cada listado viajaban al navegador **las contraseñas en claro de todos los
creadores de la org**. Ninguna pantalla las usa. Y había **dos** sitios de escritura, no uno.
Se dejó de escribir la copia en claro y se sacaron las dos columnas de toda respuesta, con un
sanitizador único. **No arregla lo ya guardado** (borrar la columna, pasos 4-5) ni el hash SHA-256
sin salt (paso 3, migrar a bcrypt: invalida contraseñas de creadores reales, coordinar con Tomy).

- **Validación:** `tsc` 0 · `vitest` **526 passed** · `next build` 0. Todos los casos nuevos
  verificados en rojo sin su fix (14 del gate staff-only, 2 de la allowlist, 4 de las guardias de
  R-C06, 1 del layout faltante).
- **Lo que NO se hizo y por qué:** el paso 3 de R-C05 (convertir los dos fail-open en fail-closed)
  va **después de R-C09**, que rota el secreto e invalida las sesiones. Hacerlo antes deja afuera a
  usuarios legítimos.

### [2026-09-06] ✅ R-C25 — borrado de huérfanas en los dos rollups Gold de atribución
- **Estado final:** ✅ hecho y verificado en preview · **sin mergear** (el merge espera al plan entero).
- **Dónde:** branch `hotfix/gold-attribution-huerfanas` (sale de `origin/main` 9ad4616d).
  `aaf41b81` fix + tests · `8b8063db` doc de verificación.
- **Qué se cambió:** `gold-attribution-source-transform.ts` y `gold-attribution-channel-transform.ts`
  suman `buildGold…DeleteOrphans()`, y la ventana incremental pasa de `>= $2` crudo a
  `>= date_trunc('day', $2 AT TIME ZONE AR)`. Los dos crons sacan `runStartedAt` de `SELECT now()`
  de la **base** y corren upsert + DELETE en **una sola transacción**.
- **Por qué el truncado al día AR es parte del fix, no cosmética:** con la hora cruda el día del
  borde se recomputaba parcialmente, así que un bucket cuyas órdenes fueran todas anteriores a la
  hora de corte no se re-emitía — y el DELETE se lo habría llevado, perdiendo plata real.
- **Hallazgo (esto es lo importante):** con `?full=1` contra la copia aislada de prod salieron
  **672 huérfanas / 12.502 filas en `gold_attribution_source` (5,4 %)** y **26 en
  `gold_attribution_channel`** (TeVe Compras). Con `PIXEL_USE_GOLD` y `PIXEL_USE_GOLD_CHANNEL` en
  `true`, el panel venía leyendo esas filas. **Es plata inflada que se está mostrando hoy.**
- **Verificación:** 3 pasadas incrementales dan conteos idénticos (272 · 71/44/160) y 0 huérfanas
  — el DELETE no se come lo que el upsert acaba de escribir. La 2ª pasada de `full=1` da 0 en las
  dos tablas. `tsc` 0 · `vitest` 401 passed · `next build` 0. Tests nuevos:
  `gold-attribution-huerfanas.test.ts` (5 casos con PGlite, verificados en rojo sin el fix).
- **Se corrió contra el preview, NO contra producción:** se comprobó en Settings → Environment
  Variables que la integración de Neon creó un `DATABASE_URL` scopeado a la branch.
- **Al mergear, pendiente:** correr `?full=1` una vez en los dos endpoints (21 s, una sola
  invocación cada uno) para barrer las ~698 acumuladas, y **avisar que los totales de atribución
  van a bajar** — no es regresión, es la plata que sobraba.

### [2026-09-02] ⏸️ PAUSA — se frena la remediación para atender otro pedido de Tomy
- **Estado final:** 🟡 parcial — FASE 0 a medias, FASE 1 sin empezar
- **Qué se cambió:** nada del código. Axel frenó el trabajo acá para pasar a otra cosa que pidió
  Tomy. Se deja el punto de retorno documentado en la sección **"⏸️ DÓNDE QUEDAMOS"**, arriba de
  todo en este archivo.
- **En qué estado queda:** **cero cambios en `src/`** — los 197 hallazgos siguen todos vivos en
  producción. Lo único hecho es diagnóstico: la auditoría, este plan y la verificación R-V07.
- **Archivos tocados:** `PLAN_REMEDIACION.md`, `CLAUDE_STATE.md` (solo el aviso de arriba),
  `docs/auditoria-2026-09/` (nuevo). Nada más.
- **Commit:** _sin commitear, por decisión de Axel — se mantiene local._
- **Validación ejecutada:** no aplica (no se tocó código). La línea base sigue siendo
  `tsc` 0 errores / `vitest` 396 pasan, tomada hoy.
- **Qué NO quedó cubierto:** todo el plan, salvo el diagnóstico. Concretamente: R-V01, R-V02
  (parcial), R-V03, R-V04, R-V05 y R-V06 bloqueadas; las 31 tareas críticas, las 60 altas, las 60
  medias y las 40 bajas, todas en ⬜ pendiente.
- **Efectos secundarios / lo que hay que vigilar:** **nada rompió, pero nada mejoró.** Todo lo que
  la auditoría encontró sigue exactamente igual en producción, incluidos los tres backdoors, la
  inyección SQL, el webhook que pierde órdenes y el secreto commiteado. Si alguien corre
  `prisma db push` mientras esto está pausado, se borran ~30 tablas de producción (R-C22 sin hacer).
  Y ojo con `git clean -fd`: este plan y la carpeta de evidencia están sin trackear.

---

### [2026-09-02] R-V07 — Verificación estática de los hallazgos críticos
- **Estado final:** ✅ hecho
- **Qué se cambió:** nada del código de la aplicación. Se comprobaron **20 hallazgos críticos** uno
  por uno contra el archivo y la línea que citaba cada reporte, para que nadie actúe sobre algo que
  un agente pudo haber inventado. **Los 20 son reales.** Además se corrió la línea base de
  validación. En criollo: la auditoría no exageró nada, y el proyecto compila y pasa sus pruebas.
- **Archivos tocados:** `PLAN_REMEDIACION.md` (estados de la FASE 0 + sección R-V07 + esta entrada).
  Ningún archivo de `src/`.
- **Commit:** _sin commitear por pedido de Axel — el plan se mantiene local._
- **Validación ejecutada:** `npx tsc --noEmit` → **exit 0, sin errores**. `npx vitest run` → **50
  archivos pasan, 1 skipped; 396 tests pasan, 7 skipped; 22,20s**. Esta es la línea base: cualquier
  cambio de la FASE 1 tiene que dejarla igual o mejor.
- **Qué NO quedó cubierto:** **cinco de las seis verificaciones de la FASE 0 (R-V01 a R-V06) siguen
  bloqueadas.** En esta máquina no hay `.env` ni `.vercel` linkeado: sin acceso a las variables de
  entorno de producción ni a la base, no se puede confirmar si el secreto está publicado, qué flags
  están prendidos, a qué apunta `NEXTAUTH_URL`, qué migraciones corrieron, ni tomar el backup.
  Los comandos exactos quedaron escritos en cada tarea.
- **Efectos secundarios / lo que hay que vigilar:** tres correcciones a los reportes originales,
  detalladas al final de R-V07: (1) el bug de `organizationId = ''` en `backfill/vtex` pasó de
  "sin confirmar" a **confirmado**; (2) `dashboardPasswordPlain` se escribe en **dos** lugares, no
  uno — R-C06 tiene que tocar los dos; (3) en R-C11 hay que arreglar el `catch` de la línea 794,
  **no** el chequeo de key de la línea 79, que está bien y tiene un comentario que miente.
  También quedó una lectura provisoria importante: por los defaults del código y lo que dicen
  `MERGE-CANALES.local.md` y `RETOMAR.local.md`, **R-C25 es probablemente una bomba sin cebar y no
  un incendio activo** — pero hasta ver `vercel env ls` es inferencia, no certeza.

---

### [2026-09-02] Creación del plan
- **Estado final:** ✅ hecho
- **Qué se cambió:** se corrió una auditoría de producción con 6 agentes en paralelo (seguridad,
  datos, flujos, performance, diseño, arquitectura) sobre el commit `9ad4616d`. Salieron 197
  hallazgos. Se armó este plan y se guardaron los 6 reportes completos en `docs/auditoria-2026-09/`.
- **Archivos tocados:** `PLAN_REMEDIACION.md` (nuevo), `docs/auditoria-2026-09/` (nuevo, 7 archivos).
- **Commit:** _pendiente de commitear_
- **Validación ejecutada:** ninguna necesaria — no se tocó código de la aplicación. La auditoría
  corrió en modo solo lectura.
- **Qué NO quedó cubierto:** nada se implementó. Las 197 tareas están todas en ⬜ pendiente.
- **Efectos secundarios / lo que hay que vigilar:** los reportes citan textualmente los secretos
  hardcodeados que ya están en `vercel.json`. No agregan exposición nueva (ya estaban commiteados),
  pero cuando se cierre R-C09 conviene revisar si estos archivos se quedan en el repo o se mueven
  a un lugar privado.

---

# 10. Índice de la evidencia

| Reporte | Contenido | Hallazgos |
|---|---|---|
| `docs/auditoria-2026-09/review-seguridad.md` | auth, RBAC, multi-tenant, ingesta, inyección, Aurum | 26 |
| `docs/auditoria-2026-09/review-datos.md` | contrato de orden, atribución, rollups, medallion, fechas, moneda | 34 |
| `docs/auditoria-2026-09/review-flujos.md` | crons, webhooks, sync, errores, onboarding, migraciones | 45 |
| `docs/auditoria-2026-09/review-performance.md` | queries, índices, caché, Neon, proyección a 3× | 33 |
| `docs/auditoria-2026-09/review-diseno.md` | sistema visual, estados, accesibilidad, copy, IA | 37 |
| `docs/auditoria-2026-09/review-arquitectura.md` | tsc, tests, cobertura, duplicación, código muerto | 22 |
| `docs/auditoria-2026-09/radiografia.html` | el consolidado, para leer y compartir | — |

Cada reporte cierra con una tabla de severidad, una lista de "lo que está bien y no hay que
romper", y las preguntas que no se pueden responder leyendo código.

---

_Última actualización de este archivo: 2026-09-06 — R-C25 ✅ (verificada en preview: 698 huérfanas reales en prod). R-C05 y R-C06 🟡 parciales: lo que falta de cada una depende de R-C09 o de coordinar con Tomy. Hallazgo nuevo: /admin/onboardings se colaba por el grupo de rutas (app). Todo en branches, sin mergear. Punto de retorno: la Bitácora._
