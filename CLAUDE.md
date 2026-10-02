# CLAUDE.md

NitroSales es analítica de e-commerce multi-tenant: Next.js (App Router) en Vercel, Postgres en
Neon, Prisma, NextAuth con JWT. Tiene **clientes reales en producción** (`app.nitrosales.ai`),
y `main` se deploya solo a esa URL en cada push.

Trabajo con dos personas:

- **Tomy**, el fundador. No es técnico. Le hablo en castellano llano, sin jerga (ver
  [Comunicación](#comunicación)).
- **Axel**, que maneja el desarrollo día a día y es quien suele estar en el chat.

El código, los comentarios y los docs están en castellano a propósito. Los comentarios son
largos porque explican **por qué** algo es como es; mantené ese estilo cuando edites.

---

## Límites

Estas reglas tienen motivos concretos detrás. Si una situación no encaja, preguntá antes de
hacer una excepción.

1. **La base de producción no se toca desde acá.** No corro SQL contra prod ni manejo
   connection strings. Si hace falta SQL en prod, lo escribo y Axel/Tomy lo corren en la
   consola de Neon. *Por qué:* una vez se filtró un `DATABASE_URL` y hubo que rotar la
   password de `neondb_owner` (`docs/HANDOFF.md`).

2. **Nada llega a `main` ni a producción sin autorización explícita en el chat.** Eso incluye
   merge, push a `main`, cambios de variables en Vercel y configuración de sistemas externos.
   Push a una branch de trabajo, tampoco sin que me lo pidan. *Por qué:* `main` = producción
   con clientes; no hay staging entre medio.

3. **Nunca `git push --force`** (ni `--force-with-lease` sobre branches compartidas). Si un
   push es rechazado: `git pull --rebase` y de nuevo. Hay otros agentes pusheando al mismo
   remote.

4. **Archivos CORE PROTEGIDO — no se modifican sin autorización del fundador.** Llevan el
   aviso en su cabecera:
   - `src/app/api/metrics/pixel/route.ts`
   - `src/app/api/pixel/script/route.ts`
   - `src/app/api/webhooks/vtex/orders/route.ts`
   - `src/lib/pixel/attribution.ts`

   Si un arreglo pasa por uno de estos, lo dejo como decisión pendiente, no lo aplico.

5. **`CLAUDE_VM/` es read-only.** Es el dominio del Claude de Ventas & Marketing. Lo leo para
   contexto; no edito, creo ni borro nada ahí. Si veo una inconsistencia con el producto, la
   anoto en `BACKLOG_PENDIENTES.md` (prefijo `PR-YYYYMMDD-NN`) y aviso. Referencia:
   `CLAUDE_VM/PARA_CLAUDE_PRODUCTO.md`.

6. **Secretos.** No los escribo en código, tests, commits ni docs. **El repo es público en
   GitHub**: todo lo que se commitea (código, docs, mensajes de commit) lo lee cualquiera, para
   siempre. No rotar `ADMIN_API_KEY`/`NEXTAUTH_SECRET` es una decisión tomada; no la re-propongas.

---

## Al arrancar una sesión

```bash
git fetch origin --prune
git status
git branch --show-current
git worktree list          # otros agentes pueden tener branches abiertas en otros directorios
git log --oneline -10
```

Después, según la tarea:

| Leer | Cuándo |
|---|---|
| `CLAUDE_STATE.md` | Siempre. Estado actual del producto. |
| `ERRORES_CLAUDE_NO_REPETIR.md` | Siempre. Errores pasados destilados en patrones. |
| `BACKLOG_PENDIENTES.md` | Si la tarea es "resolvamos BP-XXX" o agregar un pendiente. |
| `PLAN_EXPANSION.md` | Trabajo del plan de expansión (techos técnicos antes de sumar clientes). |
| `docs/revision-2026-09/` | La revisión multiagente de `fix/expansion-gate-e0`: hallazgos, decisiones pendientes, errores cometidos. |
| `docs/ESTADO-BRANCH-INTEGRACION.md` | Estado de la branch de integración. |
| `UI_VISION_NITROSALES.md` | **Obligatorio** si la tarea toca UI, estilos, componentes o animaciones. |

**Otros agentes trabajan en este repo.** Codex usa branches `codex/*` en worktrees separados;
el Claude VM trabaja en `CLAUDE_VM/`. Antes de empezar, mirá qué commits nuevos hay en las
branches relacionadas con tu tarea: puede que alguien ya haya hecho parte, o que haya tocado
los mismos archivos. Una branch que está checked out en otro worktree no se puede checkoutear
acá — trabajala desde su directorio, y si ese directorio tiene cambios sin commitear, no son
tuyos: no los toques.

---

## Git

- **Trabajo en branches de feature**, nunca directo en `main`. El plan de expansión vive
  entero en una branch de integración y se mergea cuando está revisado completo — no por
  partes.
- Commits en formato `<tipo>: <descripción>` (`feat`, `fix`, `refactor`, `docs`, `test`,
  `chore`, `perf`, `ci`), con cuerpo que explique el porqué cuando no es obvio.
- Antes de pushear: `git pull --rebase origin <branch>`. Si tengo cambios sin commitear,
  `git stash` → pull → `git stash pop`.
- Cuando algo quede listo, lo digo y espero. No mergeo "porque ya estaba todo verde".

> *Historia:* hasta 2026-04 el repo operaba sólo con `main` y push directo, porque no había
> clientes y un modelo con staging había dejado fixes atrapados (se perdieron ~1.600 órdenes
> de MELI en 6 días). Con clientes reales el costo de un push roto cambió, y se pasó a
> branches con merge autorizado. Staging sigue sin existir: las previews de Vercel por branch
> cumplen ese rol.

---

## Verificar

### Los comandos

```bash
npx vitest run                              # suite completa
npx tsc --noEmit                            # sin salida = limpio
npm run build                               # prisma generate + guards + depcruise + next build
node scripts/check-ts-nocheck.mjs           # no está en build; correrlo aparte
```

`npm run build` incluye `check-order-contract.mjs`, `check-serve-gold-first.mjs` y
`depcruise`. Si sólo querés los guards: `npm run check:order-contract`,
`npm run check:serve-gold-first`, `npm run cruise`.

### `tsc` no alcanza

~290 archivos tienen `// @ts-nocheck` en la línea 1. En ellos, un import que falta, una
variable inexistente o un `await` olvidado pasan `tsc` limpios. **Sólo `next build` los
atrapa.** Si tocás un archivo con `@ts-nocheck`, el build es obligatorio, no opcional. (Pasó:
un import que nunca se agregó habría hecho explotar `/finanzas/estado` en el navegador de un
cliente.)

### Un test que nunca se vio rojo no prueba nada

Para cada arreglo con test nuevo:

1. Verde sobre el código arreglado.
2. Reintroducir el bug → **rojo, por el motivo correcto** (leer el mensaje, no sólo el conteo).
3. Restaurar → verde.
4. Si el test es un guard que barre archivos: confirmar que **no marca código sano**. Un guard
   que copia la forma sintáctica del bug en vez de su condición da falsos positivos.

Formas de falso verde que ya aparecieron en este repo:

- Aserciones sobre el fuente que se satisfacen con un **comentario** (filtrar comentarios antes
  de buscar).
- Tests que arman el resultado a mano y nunca llaman a la función bajo prueba.
- Fixtures de SQL que no coinciden con la DDL real.
- Nombres de test que prometen más que sus aserciones.
- "Señales" en una lista que en realidad son nombres de variable, no comprobaciones.

### Números

Nunca reportes un número de memoria (cantidad de tests, de archivos, de commits, de filas).
Sacalo del output del comando en el momento, o no lo digas. Y cuando un número sostiene una
conclusión (capacidad, techo, costo), verificá la **premisa** del cálculo, no sólo la
aritmética: el "techo de 44 organizaciones" era aritmética correcta sobre un modelo falso, y
el número real era ≈2.

---

## Mecánica del repo

- **Los archivos son CRLF** (`core.autocrlf=true`). Un script que edite con `\n` deja finales
  mezclados, y un reemplazo que busca `\n` no matchea y "no cambia nada" en silencio.
  Verificá EOL antes de commitear archivos editados por script.
- **Los scripts de edición no pasan por el shell.** `node -e '…'` se come backslashes y
  backticks, y un comentario con `*/` o un backtick en prosa puede cerrar el literal que lo
  contiene. Escribí el script a un `.cjs` en el scratchpad y corré `node archivo.cjs`.
- **Scripts idempotentes:** el centinela que decide "ya se aplicó" tiene que ser algo que
  sólo exista si el cambio se aplicó — no un identificador (como `R-18`) que también puede
  aparecer en un comentario que vos mismo agregaste.
- **Un `includes()` sobre el archivo entero no dice si un import existe.** Buscalo en las
  líneas de import.
- `undefined !== undefined` es `false`: una comparación de secretos contra
  `process.env.X` es fail-open si ambos lados pueden ser `undefined` (ej. el valor viene de
  `headers.get(...)?.replace(...)`). Usá `isValidAdminKey` (`src/lib/admin-key.ts`) o
  `coincideConAlguna` (`src/lib/comparacion-segura.ts`), que rechazan el caso vacío.

---

## Comunicación

**Con Tomy**, sin jerga. Traducciones útiles:

- `main` / producción → "la app en vivo, la que usan los clientes"
- merge → "pasar los cambios a la app en vivo"
- build roto → "los cambios no se pudieron publicar, lo estoy arreglando"
- branch → "una copia aparte donde pruebo sin tocar lo que usan los clientes"

**Decisiones.** Algo necesita decisión humana cuando **cambia lo que ve o recibe un cliente**
(datos que aparecen o desaparecen, límites, alertas, qué se borra), cuando toca producción o
un archivo CORE, o cuando hay un trade-off de negocio. El tamaño del cambio no es el criterio.
Si una tarea queda trabada en una decisión: la escribo con contexto, opciones y mi
recomendación, la dejo pendiente, y sigo con la siguiente tarea.

**Errores propios.** Cuando me equivoco de una forma que se puede repetir, lo anoto — en la
bitácora de la tanda en curso si existe, y el patrón general en
`ERRORES_CLAUDE_NO_REPETIR.md`.

---

## Conocimiento de dominio

### SQL en `/api/metrics/orders` — anti-página-en-blanco

Esa API corre muchas queries en paralelo; una que explota o tarda deja **toda** la página en
blanco. Antes de tocar su SQL:

- **No JOIN a tablas grandes** en geografía/segmentación. Si necesitás otra tabla, query
  separada y cruce en JS.
- **No `CAST(... AS int)`** sobre columnas con datos mixtos (`postalCode` puede ser `"1754"`
  o `"B1754BCD"`). Comparaciones de texto.
- **No sumar subqueries correlacionados** a queries que ya son pesadas.
- **Probar con rango de 1 día** después del deploy: si no responde en ~15 s, está rota.
- El pool y su justificación están en `src/lib/db/client.ts` — leelo antes de agregar
  paralelismo.
- `check-order-contract` y `check-serve-gold-first` protegen el contrato de esta ruta; si
  fallan, el problema está en tu cambio.

### Migraciones: la DB primero, el schema después

El build de Vercel **no migra la DB**. Agregar un campo a `schema.prisma` antes de que exista
la columna rompe producción. Orden:

1. Escribir el SQL con `ADD COLUMN IF NOT EXISTS` (idempotente).
2. Axel/Tomy lo corren en Neon (ver [Límites](#límites) #1).
3. Recién ahí: campo en el schema + código que lo usa.

Ver `#13` y `#S36-SCHEMA-SIN-MIGRACION` en `ERRORES_CLAUDE_NO_REPETIR.md`.

### Sync de datos

Los horarios reales están en `vercel.json` (29 crons); ésa es la fuente de verdad, no esta
tabla. Resumen de los de ingesta:

| Plataforma | Principal | Red de seguridad (UTC) |
|---|---|---|
| VTEX | Webhooks | `vtex-sync-recent` c/30 min · `/api/sync/chain` c/2 h (:30) · `/api/sync` 03:00 |
| MercadoLibre | Webhooks | `ml-missed-feeds` c/30 min · `ml-reconcile` c/2 h + pasada profunda 03:00 |
| Meta Ads / Google Ads | On-demand al abrir la página | Token de Meta: `meta-token-refresh` 05:00 |
| GA4 | Dentro de `/api/sync` 03:00 | — |
| GSC | `/api/sync/gsc` 09:00 | — |

**On-demand** = hook `useSyncStatus`: si los datos tienen >30 min, dispara
`/api/sync/trigger?platform=X`, que sincroniza en background con `waitUntil`.

Los crons de pixel/silver/gold (`refresh-*`) están escalonados en minutos distintos a
propósito para no pisarse; si agregás uno, elegí un minuto libre.

### Pestañas que se abren solas

`/api/sync`, `/api/sync/chain` y `/api/sync/inventory` redirigen a `/` si los abre un
navegador (`sec-fetch-dest: document`). Se agregó porque aparecían pestañas con JSON crudo.
La causa real era una **tarea programada de Claude Desktop** olvidada de una sesión anterior.

**Lección:** ante comportamiento inexplicable en el navegador (pestañas solas, requests sin
origen), revisar primero las tareas programadas de Claude Desktop, antes que el código.

### VTEX: dos mecanismos de webhook

Al onboardear un cliente VTEX hay que configurar **ambos**, con `?org=<orgId>` en la URL:

| Mecanismo | Dónde se configura | A qué endpoint nuestro apunta |
|---|---|---|
| Afiliados | A mano en VTEX Admin → Pedidos → Config → pestaña "Afiliados" | `/api/webhooks/vtex/orders` — la URL completa la arma `/api/me/vtex-affiliate-info` y el onboarding se la muestra al cliente |
| Orders Broadcaster | Sólo por API: `/api/orders/hook/config` (no tiene UI); `activate-client` lo configura solo, y sólo en producción | `/api/webhooks/vtex/orders` |

Existe además `/api/webhooks/vtex/inventory` para cambios de SKU/stock. Una versión anterior
de este archivo decía que los Afiliados mandan "SKU / inventario": el código no lo usa así,
y la verificación de hooks (`src/lib/vtex/hooks.ts`) exige `/orders` para los dos.

Para ver lo configurado:

```bash
curl -H "X-VTEX-API-AppKey: $KEY" -H "X-VTEX-API-AppToken: $TOKEN" \
  "https://{account}.vtexcommercestable.com.br/api/orders/hook/config"
```

Ver `#S53-VTEX-HOOKS-TWO-MECHANISMS`.

### Cambiar configuración de sistemas externos en producción

VTEX, MELI, Meta, Google, GA4, Resend. Además de la autorización (Límites #2), no se ejecuta
sin:

1. El código que recibe el cambio ya deployado en `main`.
2. Fallback en el código si llega el payload viejo.
3. Backup del estado actual.
4. Rollback en un comando, preparado.
5. Red de seguridad secundaria identificada (cron, reintentos).
6. Dry-run idempotente (reenviar la config actual sin cambios).
7. Prueba end-to-end con datos reales después del cambio.

Ver `#S53-PROD-CHANGES-SIN-DRY-RUN`.

### Aura — creator economy (`/aura/*`)

```
Creator (Influencer) → Campaign → Deal → Attribution → Payout
```

- Cada creador tiene una campaña **Always On** (`isAlwaysOn=true`), creada al aprobar su
  aplicación.
- Los deals viven dentro de campañas; en la UI no son una entidad aparte.
- **Un solo deal de comisión activo por creador** (`COMMISSION`, `TIERED_COMMISSION`,
  `HYBRID`), validado en la API.
- Tipos de deal: `COMMISSION`, `FLAT_FEE`, `PERFORMANCE_BONUS`, `TIERED_COMMISSION`, `CPM`,
  `GIFTING`, `HYBRID`.
- `excludeFromCommission` en deals que no son de comisión evita el doble pago cuando un
  creador tiene comisión por UTM y además cupón.
- Visual: *Creator Gradient* `#ff0080 → #a855f7 → #00d4ff` (detalle en
  `UI_VISION_NITROSALES.md`).
- `migrate-aura-payouts`, `migrate-aura-columns` y `backfill-always-on`
  (`src/app/api/admin/`) ya se ejecutaron en producción; no se vuelven a correr. Si
  `migrate-aura-dedup-indexes` se corrió en producción no está registrado en ningún lado: antes
  de depender de esos índices únicos, verificarlo en Neon (`pg_indexes` de `influencer_deals` y
  `payouts`).
