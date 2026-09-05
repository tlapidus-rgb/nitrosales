# Auditoría de Arquitectura, Calidad de Código y Tests — NitroSales

**Commit auditado:** `9ad4616d` (== `origin/main` == producción)
**Fecha:** 2026-09-02
**Alcance:** solo lectura. No se modificó ningún archivo del repo. No se corrió `next build`.

---

## 1. Data dura

### Compilación

| Métrica | Valor |
|---|---|
| `npx tsc --noEmit` | **exit 0 — 0 errores** |
| Archivos `.ts/.tsx` en `src/` | 846 |
| Archivos con `// @ts-nocheck` | **290 (34,3%)** |
| Concentración del `@ts-nocheck` | 207 en `src/app/api`, 41 en `src/app/(app)`, 12 en `src/app/control` |
| `@ts-ignore` | 1 |
| `@ts-expect-error` | 0 |

> **El "0 errores" es falso como señal de salud.** `tsc` no mira 290 archivos. Dos tercios
> del código de API/crons está fuera del chequeo. Esto ya está documentado y medido por el
> propio repo en `scripts/check-ts-nocheck.mjs` — ver hallazgo **H-02** sobre por qué ese
> guard hoy no protege nada.

### Tests

| Métrica | Valor |
|---|---|
| `npx vitest run` | **exit 0 — verde** |
| Archivos de test | 50 passed, 1 skipped (51) |
| Tests | **396 passed, 7 skipped (403)** |
| Duración | 28,45 s |
| Red / DB externa | **No.** Usa PGlite (Postgres WASM en proceso). La suite es autocontenida. |

### Cobertura

**No se pudo medir: `@vitest/coverage-v8` no está instalado** y instalarlo modificaría el
repo. Proxy estructural medido:

| Métrica | Valor |
|---|---|
| Archivos de test / archivos fuente | 51 / 846 = **6,0 %** |
| Módulos distintos importados por algún test | **51** |
| Estándar declarado del proyecto (`~/.claude/rules/.../testing.md`) | 80 % |

> La distancia real no es "80 % vs X %". Es que **no existe la instrumentación para
> siquiera producir el número**. El estándar de 80 % está declarado en las reglas y nunca
> fue medible en este repo. Ver **H-04**.

### Tamaño y forma del código

| Métrica | Valor |
|---|---|
| LOC totales en `src/` | 227.200 |
| Archivos > 800 líneas (límite propio del proyecto) | **53** |
| Archivos > 500 líneas | 104 |
| Funciones > 50 líneas (límite propio del proyecto) | **802** |
| Funciones > 200 líneas | 190 |
| Funciones > 500 líneas | **42** |
| Función más larga | `CostosPage` — **2.439 líneas** (`src/app/(app)/finanzas/costos/page.tsx:236`) |

### Tipos y validación

| Métrica | Valor |
|---|---|
| Ocurrencias de `any` | **2.550** |
| `as any` | **549** |
| `zod` en `package.json` | sí (`^3.23.0`) |
| Archivos que usan `zod` | **1** (`src/lib/aura/deal-validation.ts`) |
| Rutas que leen `await req.json()` | **114** |
| ...de esas, que validan con `zod` | **0** |

### Límites de módulos

| Métrica | Valor |
|---|---|
| `depcruise src --config .dependency-cruiser.js` | **✔ 0 violaciones** (825 módulos, 2.594 deps) |
| Ciclos | **0** (el baseline `docs/domain-graph-baseline.txt` tenía 2 → resueltos) |
| `src/lib/*` importando de `src/app/**` | 0 |

> **Esto está bien y hay que decirlo.** El grafo está limpio, los 2 ciclos del baseline se
> cerraron, y ninguna regla de frontera se viola. Es la parte más sana de la auditoría.

### Guards propios del repo

| Guard | Resultado | ¿Corre en `npm run build`? |
|---|---|---|
| `check-order-contract.mjs` | ✅ 15 archivos, allowlist 15 | **Sí** |
| `check-serve-gold-first.mjs` | ✅ 19 rutas, allowlist 19 | **Sí** |
| `depcruise` | ✅ 0 violaciones | **Sí** |
| `check-ts-nocheck.mjs` | ✅ 290 == baseline 290 | ❌ **NO** |
| `vitest` | ✅ verde | ❌ **NO** |

### Otros

| Métrica | Valor |
|---|---|
| API routes totales | 424 |
| Endpoints `/api/admin/*` | 154 |
| Endpoints de debug en producción | **27** |
| `queryRawUnsafe` / `executeRawUnsafe` | 786 llamadas en 204 archivos |
| ...con interpolación `${}` | 8 (todas con IDs internos, no input de usuario) |
| `} catch {` silencioso (traga el error) | **122** |
| `console.log` | 121 |
| `TODO` / `FIXME` / `HACK` | 87 |
| Docs `.md` en la raíz | 34 |
| Archivos `*.local.md` | 22 — **0 versionados** (gitignored) |
| Referencias rotas en documentación | **15** |

---

## 2. Hallazgos

### 🔴 CRITICAL

---

#### H-01 — La clave de admin de producción está en el repo, en texto plano, 28 veces

**Archivo:** `vercel.json:15` y otras 27 líneas
**Evidencia:**

```json
{ "path": "/api/sync?key=nitrosales-secret-key-2024-production", "schedule": "0 3 * * *" }
```

El literal `nitrosales-secret-key-2024-production` aparece en las 28 entradas de `crons`.

Los endpoints validan contra `ADMIN_API_KEY` (`src/lib/admin-key.ts:27`):

```ts
export function isValidAdminKey(key: string | null | undefined): boolean {
  return typeof key === "string" && key.length > 0 && key === ADMIN_API_KEY;
}
```

Y por ejemplo `src/app/api/cron/warm-cache/route.ts:180` hace `if (key !== WARM_CACHE_KEY)`
donde `WARM_CACHE_KEY = ADMIN_API_KEY`.

**Por lo tanto:** para que los 28 crons de Vercel funcionen, la env `ADMIN_API_KEY` en
producción **tiene que ser exactamente ese literal**. La clave de bypass admin de producción
está commiteada.

**Qué desbloquea esa clave:** los 154 endpoints `/api/admin/*`, incluidos
`/api/admin/replay-attribution` (que **escribe** atribuciones),
`/api/admin/reattribute`, `/api/admin/reconcile`, y todos los `migrate-*` que ejecutan DDL.

**Riesgo concreto:** cualquiera con acceso de lectura al repo — un contratista, un agente de
IA con el repo montado, una fuga futura, o el propio historial de git si el repo alguna vez
se abre — puede reescribir la atribución de todos los clientes con un `curl`. La atribución
es lo que define qué canal se lleva el crédito de cada venta y cuánta comisión cobra cada
creador de Aura. No es un endpoint de lectura: **mueve plata**.

**Nota:** `TODOS.md` §2 ya identifica esto ("Clave de admin hardcodeada en `vercel.json`") y
dice *"falta el cambio en `vercel.json` y setear la variable"*. **Sigue sin hacerse.** El
propio TODO advierte lo correcto: la clave está en el historial de git, así que borrarla del
archivo no alcanza — **hay que rotarla en Vercel**.

---

#### H-02 — Backdoor con contraseña hardcodeada en los dos endpoints que reescriben la atribución

**Archivos:**
- `src/app/api/admin/reattribute/route.ts:18`
- `src/app/api/admin/reconcile/route.ts:29`

**Evidencia (idéntica en ambos):**

```ts
if (key !== process.env.ADMIN_SECRET && key !== 'reattribute-2026') {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

Un segundo secreto, distinto del anterior, escrito literal en el código. Además usa
`ADMIN_SECRET` — una env **distinta** de `ADMIN_API_KEY` que usa el resto del repo.

**Qué hacen esos endpoints:** `reattribute` recorre **todas** las `pixelAttribution` de
**todas las orgs** (`prisma.pixelAttribution.findMany({ distinct: ['orderId'] })`, sin filtro
de `organizationId`) y las recalcula con `calculateAttribution`. `reconcile` linkea órdenes
a visitantes con 3 estrategias y también cruza orgs.

**Riesgo concreto:** `POST /api/admin/reattribute?key=reattribute-2026` desde cualquier lado
de internet reescribe la atribución histórica de todos los clientes. No hay rate limit, no
hay confirmación, no hay dry-run obligatorio (`reconcile` tiene `?dry=true` pero es opt-in).
Y como es un `POST` que "arregla datos", si alguien lo dispara nadie se entera: los números
simplemente cambian. Esto contradice frontalmente el propio `CLAUDE.md` §"Cambios en config
de sistemas externos en prod", que exige backup + rollback + dry-run.

**Además:** `admin-key.ts` fue creado precisamente (BP-M1) para eliminar la clave hardcodeada
de ~89 archivos y dice *"NO queda ningún literal del secreto en el código"*. **Quedaron dos**,
con otro secreto distinto, en los dos endpoints más destructivos del sistema.

---

#### H-03 — Contraseñas de creadores guardadas en texto plano

**Archivo:** `src/app/api/influencers/route.ts:114-115`
**Evidencia:**

```ts
dashboardPassword: body.dashboardPassword ? hashPassword(body.dashboardPassword) : null,
dashboardPasswordPlain: body.dashboardPassword || null,
```

Schema (`prisma/schema.prisma:1261`):

```prisma
dashboardPasswordPlain  String?   // Copia en texto plano para que el admin la vea/reenvíe (low-stakes read-only dashboard)
```

Y el `hashPassword` de al lado (`src/app/api/influencers/route.ts:16`) es **SHA-256 sin salt**:

```ts
function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}
```

Esa misma función está **duplicada literal en 7 archivos**:
`api/influencers/route.ts:16`, `api/influencers/applications/route.ts:23`,
`api/influencers/[id]/route.ts:17`, `api/public/influencers/[slug]/[code]/route.ts:19`,
`api/public/influencers/[slug]/[code]/content/route.ts:14`,
`.../set-password/route.ts:19`, `.../verify/route.ts:14`.

Mientras tanto los usuarios de la app usan **bcrypt** (`src/lib/auth.ts` y 7 archivos más).

**Riesgo concreto:** hay dos esquemas de contraseñas conviviendo. El de creadores es el peor
de los dos mundos: texto plano en una columna **más** un hash sin salt (rainbow-tableable en
segundos). El comentario del schema justifica con *"low-stakes read-only dashboard"*, pero
los creadores reusan contraseñas — un dump de esa tabla es un set de credenciales reales de
personas, no de un dashboard. Y como el hash es SHA-256 sin salt, ni siquiera hace falta la
columna plana. Esto es notificable bajo cualquier régimen de datos personales.

---

### 🟠 HIGH

---

#### H-04 — El motor CORE de atribución (698 líneas, 1 sola función) no tiene un solo test

**Archivo:** `src/lib/pixel/attribution.ts:133` — `calculateAttribution`, **698 líneas**,
la **única** función exportada del archivo (869 líneas).

**Evidencia:** ningún archivo de test importa `@/lib/pixel/attribution`. Lista completa de
los 51 módulos que algún test importa — `attribution.ts` no está.

Módulos de alto riesgo **sin ningún test**:

| Archivo | Líneas | Qué decide |
|---|---|---|
| `src/lib/pixel/attribution.ts` | 869 (fn de 698) | **Qué canal se lleva el crédito de cada venta** |
| `src/lib/finanzas/scenario-engine.ts` | 638 | Proyecciones financieras |
| `src/lib/finanzas/fiscal-calendar.ts` | 561 | Vencimientos impositivos |
| `src/lib/ltv/prediction-engine.ts` | 441 | LTV por cliente |
| `src/lib/pixel/identity.ts` | 441 | Stitching de identidad de visitante |
| `src/lib/pixel/influencer-attribution.ts` | 319 | **Atribución de comisión a creadores** |
| `src/lib/finanzas/fiscal-monotributo.ts` | 243 | Categoría de monotributo |
| `src/lib/bondly/churn-score.ts` | 186 | Score de churn |
| `src/lib/bondly/behavioral-score.ts` | 185 | Score de comportamiento |
| `src/app/api/webhooks/vtex/orders/route.ts:33` | fn de **766** | **Ingesta de TODAS las órdenes VTEX** |

**Lo que sí está bien testeado** (y hay que reconocerlo): toda la capa SQL de canales y del
medallion. `channel-rules` (5 tests), `channel-rollup-resolution` (5),
`first-source-*` (5 archivos), `silver-orders-sql` (6), los 6 transforms de Gold, los 2 de
Silver. Eso es trabajo serio y cubre bien la resolución de canal.

**El problema no es "falta cobertura".** Es que la cobertura está **exactamente al lado** de
donde hace falta: se testea con rigor cómo un `(source, medium, campaign)` se resuelve a un
canal, y no se testea nada de la función de 698 líneas que decide **a qué touchpoint se le
asigna la venta en primer lugar**. Un test verifica el diccionario; nadie verifica el motor.

**Riesgo concreto:** los dos endpoints de H-02 (`reattribute`, `reconcile`) llaman a
`calculateAttribution` para **reescribir el histórico**. Si alguien toca esas 698 líneas —
un agente de IA optimizando, un fix de un caso borde — la suite sigue en verde, `tsc` sigue
en 0, el build pasa, y la atribución de todos los clientes cambia en silencio. No hay ningún
mecanismo en el repo que detecte esa regresión. Y como Aura paga comisiones sobre
`InfluencerAttribution`, una regresión ahí es plata mal pagada a creadores reales.

---

#### H-05 — El dashboard de órdenes no usa el contrato de "orden válida" y ya divergió

**Contrato** (`src/domains/orders/index.ts:68`):

```ts
return `${p}status NOT IN (${orderStatusNotConcretedList()}) AND ${p}"totalValue" > 0`;
```

→ válida = `status NOT IN ('CANCELLED','PENDING','RETURNED')` **AND `totalValue > 0`**

**Dashboard** (`src/app/api/metrics/orders/route.ts:234`, y también 254, 315, 321):

```sql
WHERE "organizationId" = '${ORG_ID}'
  AND "orderDate" >= $1 AND "orderDate" <= $2
  AND status NOT IN ('CANCELLED', 'RETURNED', 'PENDING')
```

**No hay `totalValue > 0`.** Y verificado: `metrics/orders/route.ts` **no importa
`@/domains/orders` en ninguna línea** — reimplementa el filtro a mano.

**La divergencia está probada por el propio test suite:**
`src/__tests__/silver-orders-sql.test.ts` tiene el caso
*"el contrato de orden válida se aplica: totalValue = 0 no es válida"* — o sea, el pipeline
Silver/Gold **excluye** las órdenes de $0, y el dashboard Bronze las **incluye**.

**Riesgo concreto:** dos respuestas distintas a "¿cuántas ventas hubo?" según qué pantalla
mire el cliente. Es exactamente la clase de bug "12 vs 14 vs 16" que
`scripts/check-order-contract.mjs` fue escrito para matar — y el archivo está **en el
allowlist** del guard, o sea el guard lo ve, lo cuenta, y lo deja pasar por herencia. El
guard protege contra archivos *nuevos*; el archivo más importante ya estaba adentro.

---

#### H-06 — `/api/alertas` es un duplicado muerto que además saltea el RBAC

**Archivo:** `src/app/api/alertas/route.ts` (94 líneas)

**Evidencia:**
- La única referencia en todo el repo es un comentario en `src/lib/section-access.ts:54`:
  `// ⚠️ /api/alertas parece duplicado en español de /api/alerts — verificar si es dead code antes de gatearlo.`
- `src/lib/section-access.ts:37` mapea `{ prefix: "/api/alerts", section: "alertas" }`.
  **`/api/alertas` no está en la tabla.**
- `isPathAllowed` (`section-access.ts:143`): `if (section === null) return true;`

**Riesgo concreto:** un usuario con un rol que **no** tenga la sección `alertas` recibe 403
en `GET /api/alerts` y **200 con los datos** en `GET /api/alertas`. Ambos leen `prisma.insight`
de la misma org. Es un bypass de permisos de una letra de distancia. Está org-scopeado
(`getOrganizationId()`), así que no hay fuga entre clientes — pero sí entre roles, que es
justo lo que se acaba de construir en `3ce43997 rbac: rol base MEMBER (Editor)`.

---

#### H-07 — `/api/debug/meta` es público, sin auth, sin scope de org

**Archivo:** `src/app/api/debug/meta/route.ts` — 17 líneas, **sin un solo chequeo de auth**.

```ts
export async function GET() {
  const [products, orderItems, customers, orders, itemsWithProduct, sampleItems] =
    await Promise.all([
      prisma.product.count(), prisma.orderItem.count(), prisma.customer.count(),
      prisma.order.count(), prisma.orderItem.count({ where: { productId: { not: null } } }),
      prisma.orderItem.findMany({ take: 3, include: { product: true } }),
    ]);
  return NextResponse.json({ products, orderItems, customers, orders, itemsWithProduct, sampleItems });
}
```

**Por qué el middleware no lo tapa** (`src/middleware.ts:63`): el gate RBAC está dentro de
`if (token) { ... }`. Sin token no se evalúa nada y cae en `NextResponse.next()`. Y aunque
hubiera token, `/api/debug` no está en `API_SECTION_PREFIXES` → `requiredSectionForPath`
devuelve `null` → `isPathAllowed` devuelve `true`.

**Riesgo concreto:** un `curl` anónimo devuelve el volumen de negocio agregado de **todos**
los clientes (cantidad de órdenes, clientes, productos) y **3 `OrderItem` reales con su
producto incluido**, sin filtro de `organizationId`. Para un SaaS multi-tenant que está por
entrar a Arredo, es una fuga de datos de cliente y una métrica de negocio regalada a
cualquiera que pruebe `/api/debug/meta`.

Hay **27 endpoints de debug** en producción. Los otros 26 sí validan (`isValidAdminKey` o
`isInternalUser`); este es el único sin nada — que es peor que si no validara ninguno,
porque nadie lo va a buscar.

---

#### H-08 — El guard de `@ts-nocheck` y la suite de tests no corren en el build

**Archivo:** `package.json:7`

```json
"build": "prisma generate && node scripts/check-order-contract.mjs && node scripts/check-serve-gold-first.mjs && depcruise src --config .dependency-cruiser.js && next build"
```

`check-ts-nocheck.mjs` **no está**. `vitest run` **no está**. Único workflow de CI
(`.github/workflows/keep-pixel-rollups-fresh.yml`) es un cron de producción, no corre tests.

**Riesgo concreto:** el script `check-ts-nocheck.mjs` está escrito con un razonamiento
excelente — dice literalmente *"un chequeo que dice OK sobre dos tercios del código y se
reporta como si fuera todo es peor que no tenerlo"* — y después **nadie lo ejecuta**. El
ratchet de 290 no ratchea: el próximo `@ts-nocheck` entra sin resistencia y el baseline
queda mintiendo. Igual con los tests: 396 tests verdes que nadie corre antes de pushear a
producción son 396 tests que se van a poner rojos y nadie se va a enterar hasta que alguien
los corra a mano meses después. `CLAUDE.md` REGLA #3 pide `tsc` antes de pushear pero **no
menciona `npm test`**.

Este es el hallazgo más barato de arreglar de toda la auditoría y el que más protege al resto.

---

#### H-09 — Cero validación de runtime en los 114 endpoints que reciben JSON

**Evidencia:** 114 `route.ts` hacen `await req.json()` / `await request.json()`. **Ninguno**
usa `zod`. `zod` está en `package.json` y se usa en **1** archivo de todo `src/`
(`src/lib/aura/deal-validation.ts`), que ni siquiera es una ruta.

Lo mismo en el borde de salida: 36 puntos en `src/lib/connectors/` y `src/lib/onboarding/`
parsean respuestas de VTEX/Meta/Google con `await res.json()` y las castean a mano.

Combinado con los 290 `@ts-nocheck` (207 de ellos en `src/app/api`) y los 549 `as any`, el
tipado de los bordes es decorativo: el tipo dice una cosa, el runtime recibe otra, y no hay
nada en el medio.

**Riesgo concreto:** cuando VTEX cambie un campo (ya pasó — ver
`ERRORES_CLAUDE_NO_REPETIR.md` §S53), el error no va a aparecer en el borde con un mensaje
claro. Va a viajar como `undefined` hasta el cálculo de una métrica y salir como un `$0` o
un `NaN` en la pantalla del cliente, o como una fila mal escrita en la DB. Esos son los bugs
que tardan semanas — y con 207 rutas sin tipar, `tsc` no va a avisar.

---

#### H-10 — 122 `catch` silenciosos, 33 de ellos en el motor de alertas

**Evidencia:** `grep -c "} catch {$"` → 122 en `src/`. En `src/lib/alerts/` solos hay 33.

Patrón representativo (`src/lib/alerts/primitives/orders.ts:26`):

```ts
} catch {
  return { count: 0, total: 0, aov: 0 };
}
```

**Riesgo concreto:** este es un **primitivo de alerta**. Si la query falla (timeout, índice
faltante, cambio de schema), la función devuelve "0 órdenes, $0 de revenue" en vez de
propagar el error. Una alerta del tipo *"avisame si las órdenes del período bajan de X"*
—que es literalmente el `label` de `ordersCountBelow` en ese mismo archivo— **se dispara con
un falso positivo**. Y una alerta de "revenue por encima de" **nunca se dispara**. En ambos
casos el cliente recibe información falsa y **nadie sabe que la query se rompió**, porque el
error no se loguea ni se cuenta.

Contradice la regla propia del proyecto (`coding-style.md`): *"Never silently swallow errors"*.

---

### 🟡 MEDIUM

---

#### M-01 — 64 rutas usan `NEXTAUTH_SECRET` como API key en la query string

**Evidencia:** 64 archivos bajo `src/app/api` referencian `process.env.NEXTAUTH_SECRET`.
Patrón típico (`src/app/api/admin/migrate-custom-roles/route.ts:26`):

```ts
if (!key || key !== process.env.NEXTAUTH_SECRET) {
  return NextResponse.json({ error: "No autorizado" }, { status: 401 });
}
```

Y el comentario de `migrate-creator-password-plain/route.ts:8` lo documenta como uso normal:

```
curl "https://nitrosales.vercel.app/api/admin/migrate-creator-password-plain?key=<NEXTAUTH_SECRET>"
```

**Riesgo concreto:** `NEXTAUTH_SECRET` es la clave con la que se **firman los JWT de sesión**.
Usarla como parámetro de URL la manda a los access logs de Vercel, al historial del browser,
al `Referer` de cualquier request saliente, y a cualquier proxy en el medio. Quien la
obtenga no entra a un endpoint de migración: **forja sesiones de cualquier usuario de
cualquier org**. Es una escalada de "leí un log" a "soy el owner de Arredo".

Hay **tres esquemas de auth admin conviviendo**: `isValidAdminKey()`/`ADMIN_API_KEY`
(correcto, fail-closed), `NEXTAUTH_SECRET` como key (64 rutas), y el literal
`'reattribute-2026'` (2 rutas, H-02). La migración BP-M1 se hizo a medias.

---

#### M-02 — `formatARS` definido 5 veces, y una ya divergió

| Archivo | Implementación |
|---|---|
| `src/lib/utils/format.ts:1` | `"$ " + Math.round(n).toLocaleString("es-AR")` |
| `src/app/api/insights/route.ts:11` | idéntica (copia) |
| `src/lib/email/templates.ts:212` | idéntica (copia, función local) |
| `src/lib/email/templates.ts:406` | idéntica (copia, función local — **en el mismo archivo que la anterior**) |
| `src/app/(app)/nitropixel/page.tsx:53` | **`new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 })`** |

La quinta usa un mecanismo distinto. Además hay **233** `toLocaleString("es-AR")` inline y
**46** `Intl.NumberFormat` sueltos por el código.

**Riesgo concreto:** el redondeo y el símbolo no están centralizados. `Math.round()` +
`toLocaleString` y `Intl.NumberFormat({style:"currency"})` no garantizan el mismo string
(espacio duro vs espacio normal, comportamiento con negativos). Cuando alguien cambie la
política de decimales —"Tomy quiere ver centavos en Finanzas"— va a tocar una de las cinco y
las otras cuatro van a seguir mostrando lo viejo. Con `formatARS` en emails que se mandan al
cliente, la inconsistencia sale del producto.

---

#### M-03 — No hay cliente VTEX: 15 archivos hablan HTTP con VTEX a mano

**Evidencia:** 15 archivos contienen `X-VTEX-API-AppKey` directamente. Existe
`src/lib/connectors/vtex.ts` y `src/lib/connectors/vtex-enrichment.ts`, pero además hacen
llamadas crudas: 10 rutas bajo `src/app/api/sync/*` y `src/app/api/admin/*`,
`src/lib/backfill/processors/vtex-processor.ts`, `src/lib/onboarding/credential-tests.ts`.

**Riesgo concreto:** el retry, el timeout, el rate limit y el manejo de credenciales están
reimplementados 15 veces. `CLAUDE.md` documenta que VTEX tiene 2 mecanismos de webhooks y que
hay que configurar `?org=<orgId>` en cada uno — esa clase de regla no se puede enforcear
cuando la llamada vive en 15 lugares. Cuando VTEX rote un header o cambie un endpoint, son 15
ediciones y la que se olvide falla de noche, en un cron, sin tipos (esos archivos están entre
los 207 con `@ts-nocheck`).

---

#### M-04 — Dos módulos de creadores conviviendo: `/influencers` y `/aura`

**Evidencia:**
- `/api/influencers/*`: 14 rutas. `/api/aura/*`: 33 rutas. Ambos gestionan `Influencer`.
- 11 páginas en `src/app/(app)/influencers/`.
- **Están entrelazados**: `src/app/api/aura/inbox/route.ts:121,140,161,181` y
  `src/app/api/aura/insights/route.ts:244,342` linkean **hacia** páginas `/influencers/*`.
- Ya divergieron en el manejo de contraseñas: `api/influencers/route.ts:114-115` escribe hash
  SHA-256 **+ texto plano**; `api/aura/creators/route.ts:54` escribe `dashboardPassword: null`.
- `src/lib/section-access.ts:52`: `// ⚠️ PENDIENTE: /api/influencers no tiene sección propia
  — decisión de producto de Tomy. Dejado sin gatear.`

**Riesgo concreto:** las 14 rutas de `/api/influencers` **no pasan por el gate de secciones**
(no están en `API_SECTION_PREFIXES`), incluidas `POST /api/influencers` (crea creadores) y
`GET /api/influencers/export`. Sí validan org vía `getOrganization()`, así que no hay fuga
entre clientes — pero cualquier usuario logueado de la org las puede llamar sin tener la
sección `aura`. Y no es dead code que se pueda borrar: Aura linkea hacia él. Es una migración
a medio hacer que hay que terminar en una dirección o la otra.

---

#### M-05 — 53 archivos y 802 funciones violan los límites del propio proyecto

Las reglas del repo dicen funciones <50 líneas y archivos <800. La realidad:
**802 funciones >50 líneas, 190 >200, 42 >500. 53 archivos >800 líneas.**

Ranking por **riesgo** (no por tamaño): un archivo grande en el core de datos es peor que
uno grande en una página.

| # | Archivo | Líneas | Fn más larga | Por qué urge |
|---|---|---|---|---|
| 1 | `src/lib/pixel/attribution.ts` | 869 | **698** (`calculateAttribution:133`) | Core de atribución. 0 tests. Mueve comisiones. |
| 2 | `src/app/api/metrics/pixel/route.ts` | 1.998 | **1.834** (`realHandler:165`) | Alimenta el dashboard principal. `@ts-nocheck`. |
| 3 | `src/app/api/metrics/orders/route.ts` | 1.772 | **1.644** (`ordersRealHandler:97`) | Revenue del dashboard + drift de H-05. |
| 4 | `src/app/api/webhooks/vtex/orders/route.ts` | — | **766** (`POST:33`) | Ingesta de TODAS las órdenes. 0 tests. |
| 5 | `src/app/api/fix-brands/route.ts` | 1.327 | **1.007** (`GET:322`) | Un `GET` de 1.007 líneas que **muta** productos. |

Las páginas gigantes (`CostosPage` 2.439, `ProductsPage` 2.113, `LtvPage` 2.112) son molestas
pero de menor riesgo: rompen visible y en una sola pantalla.

**Riesgo concreto:** una función de 698 o 1.834 líneas no entra en la cabeza de nadie ni en
el contexto útil de un agente de IA. Con un equipo de 1 dev + agentes, el modo de fallo no es
"se rompe el build" —es que el agente lee 400 de las 1.834 líneas, cambia lo que ve, y rompe
una rama que estaba 900 líneas más abajo. `CLAUDE.md` REGLA #3 no lo va a atrapar: `tsc`
pasa (el archivo tiene `@ts-nocheck`) y no hay tests.

---

#### M-06 — `/api/metrics/orders` interpola el `organizationId` en SQL crudo

**Archivo:** `src/app/api/metrics/orders/route.ts:232` (y repetido en el subquery de :236)

```sql
WHERE "organizationId" = '${ORG_ID}'
```

Las fechas sí van parametrizadas (`$1`, `$2`) — el org no.

**Riesgo concreto:** hoy es **bajo**: `ORG_ID` viene de `getOrganizationId()` (sesión), no de
input del usuario. Pero es el patrón, no el caso: 786 `queryRawUnsafe`/`executeRawUnsafe` en
204 archivos, y el día que alguien agregue un `?org=` para debug —cosa que ya existe en varios
endpoints admin— la inyección queda armada, en la query que define el revenue, en un archivo
sin tipos ni tests. Los 8 casos de interpolación `${}` que encontré son todos IDs internos y
ninguno es explotable hoy; el hallazgo es de deuda, no de exploit.

---

#### M-07 — El estándar de 80 % de cobertura no es medible

`@vitest/coverage-v8` no está instalado y `vitest.config.ts` no declara bloque `coverage`.
No hay forma de producir el número que las reglas del proyecto exigen.

**Riesgo concreto:** "80 % de cobertura" funciona hoy como una creencia, no como un control.
Sin instrumentación no se puede saber si un cambio bajó la cobertura, así que la regla no
puede fallar nunca — y una regla que no puede fallar no cambia ninguna decisión.

---

### 🔵 LOW

---

#### L-01 — 15 referencias rotas en la documentación

Ver §5. `PLAN_PIXEL_HARDENING.md` (ya detectado) más 14.

#### L-02 — 121 `console.log` en `src/`

Contra la propia checklist de `code-review.md` ("No console.log or debug statements"). En
rutas de API van a los logs de Vercel; algunos imprimen payloads.

#### L-03 — 87 `TODO`/`FIXME`/`HACK` sin tracking

No están vinculados a `BACKLOG_PENDIENTES.md`. Son deuda invisible para el proceso.

#### L-04 — `package.json:5` tiene la descripción con el encoding roto

`"NitroSales - Inteligencia para vender mÃÂÃÂ...ÂÂ¡s"` — mojibake acumulado por
re-encodings sucesivos. Cosmético, pero es un canario de que algo escribe el archivo con la
codificación equivocada.

#### L-05 — `@ts-ignore` en vez de `@ts-expect-error`

1 sola ocurrencia, pero `@ts-expect-error` es estrictamente mejor (falla si el error
desaparece, evitando supresiones zombie).

---

## 3. Tabla resumen

| ID | Sev | Título | Archivo clave |
|---|---|---|---|
| H-01 | 🔴 | Clave admin de prod en el repo, 28 veces | `vercel.json:15` |
| H-02 | 🔴 | Backdoor `'reattribute-2026'` en los endpoints que reescriben atribución | `api/admin/reattribute/route.ts:18` |
| H-03 | 🔴 | Contraseñas de creadores en texto plano + SHA-256 sin salt (×7) | `api/influencers/route.ts:114` |
| H-04 | 🟠 | Motor CORE de atribución: 698 líneas, 0 tests | `lib/pixel/attribution.ts:133` |
| H-05 | 🟠 | El dashboard no usa el contrato de orden válida — ya divergió | `api/metrics/orders/route.ts:234` |
| H-06 | 🟠 | `/api/alertas` duplicado muerto que saltea el RBAC | `api/alertas/route.ts` |
| H-07 | 🟠 | `/api/debug/meta` público, sin auth ni scope de org | `api/debug/meta/route.ts` |
| H-08 | 🟠 | Guard de `@ts-nocheck` y tests no corren en el build | `package.json:7` |
| H-09 | 🟠 | 114 rutas leen JSON, 0 validan (zod usado en 1 archivo) | `package.json` / 114 rutas |
| H-10 | 🟠 | 122 `catch` silenciosos, 33 en el motor de alertas | `lib/alerts/primitives/orders.ts:26` |
| M-01 | 🟡 | `NEXTAUTH_SECRET` como API key en 64 rutas | `api/admin/migrate-*/route.ts` |
| M-02 | 🟡 | `formatARS` ×5, una divergente | `lib/utils/format.ts:1` |
| M-03 | 🟡 | Sin cliente VTEX: 15 archivos hablan HTTP a mano | `lib/connectors/vtex.ts` |
| M-04 | 🟡 | `/influencers` y `/aura` conviven, ya divergieron | `api/influencers/` |
| M-05 | 🟡 | 53 archivos >800 líneas, 802 funciones >50 | `lib/pixel/attribution.ts` |
| M-06 | 🟡 | `organizationId` interpolado en SQL crudo | `api/metrics/orders/route.ts:232` |
| M-07 | 🟡 | 80 % de cobertura no es medible | `vitest.config.ts` |
| L-01 | 🔵 | 15 referencias rotas en docs | `BACKLOG_PENDIENTES.md` |
| L-02 | 🔵 | 121 `console.log` | — |
| L-03 | 🔵 | 87 TODO/FIXME sin tracking | — |
| L-04 | 🔵 | Encoding roto en `package.json` | `package.json:5` |
| L-05 | 🔵 | `@ts-ignore` en vez de `@ts-expect-error` | — |

---

## 4. Código muerto — candidatos a borrar

Con la evidencia de que nadie los referencia:

| # | Qué | Evidencia | Confianza |
|---|---|---|---|
| 1 | `src/app/api/alertas/route.ts` (94 líneas) | Única referencia en todo el repo es un comentario en `section-access.ts:54` preguntándose si es dead code. Duplicado en español de `/api/alerts`. | **Alta** |
| 2 | `src/app/api/debug/meta/route.ts` (17 líneas) | Ninguna referencia. Sin auth (H-07). Borrarlo cierra el hallazgo. | **Alta** |
| 3 | `src/app/api/admin/migrate-creator-password-plain/route.ts` | Migración ya ejecutada (columna existe en prod). Los `migrate-*` son one-shot. Borrarlo debe ir junto con **dropear la columna `dashboardPasswordPlain`** (H-03). | **Alta** |
| 4 | Los otros ~24 `/api/admin/migrate-*` | `CLAUDE.md` documenta 3 como "✅ ejecutado". Son one-shot por diseño; quedan como superficie de ataque DDL permanente. Verificar cada uno contra la DB antes de borrar. | **Media** |
| 5 | 27 endpoints `/api/*debug-*` | Ninguno referenciado desde la UI. Son herramientas de sesión de debug ya cerradas. Al menos 5 están en el allowlist del `order-contract` (o sea, además tienen el filtro drifteado). | **Media** |
| 6 | `src/app/api/fix-brands/route.ts` (1.327 líneas, `GET` de 1.007) | Nombre de fix one-shot. Es un `GET` que muta datos. Verificar si ya corrió. | **Media** |
| 7 | `dashboardPasswordPlain` (columna) | Escrita solo en `api/influencers/route.ts:115`; **nunca leída** en todo `src/`. Es puro pasivo de seguridad. | **Alta** |
| 8 | Sin `.bak`/`.old`/`.orig` | Verificado: 0 archivos. **Esto está limpio.** | — |

---

## 5. Los 5 archivos que más urge partir/testear

Ordenados por *(riesgo de que rompa plata o permisos) × (imposibilidad de revisarlo)*:

1. **`src/lib/pixel/attribution.ts`** — 869 líneas, `calculateAttribution` de **698**, cero
   tests, y es lo que `reattribute`/`reconcile` invocan para reescribir el histórico de todos
   los clientes. **Primero un test de caracterización** (fijar el comportamiento actual con
   casos reales), después partir. Testear antes que partir: sin red, el refactor es la
   regresión.

2. **`src/app/api/metrics/orders/route.ts`** — 1.772 líneas, `ordersRealHandler` de **1.644**,
   `@ts-nocheck`, no usa el contrato de orden válida y ya divergió (H-05). Es el revenue que
   ve el cliente. Arreglar el drift **es** el primer paso de partirlo: importar
   `ordersValidSql` de `@/domains/orders` en las 6 queries.

3. **`src/app/api/webhooks/vtex/orders/route.ts`** — `POST` de **766 líneas**, cero tests, es
   la puerta de entrada de **todas** las órdenes VTEX. Si esto se rompe, no se rompe la
   pantalla: se pierden ventas silenciosamente. Ya pasó antes (`CLAUDE.md`: *"pérdida de 1600
   órdenes MELI por 6 días"*).

4. **`src/app/api/metrics/pixel/route.ts`** — 1.998 líneas, `realHandler` de **1.834**, la
   función más larga del backend. `@ts-nocheck`. Alimenta NitroPixel, que es la pantalla que
   `section-access.ts:169` define como landing por defecto del producto.

5. **`src/lib/pixel/influencer-attribution.ts`** — "solo" 319 líneas, pero **decide cuánta
   comisión cobra cada creador** y no tiene un test. Es el más chico de los cinco y el más
   barato de cubrir: 319 líneas de lógica de plata sin red es la peor relación
   riesgo/esfuerzo del repo. **Por acá empezaría.**

---

## 6. Referencias rotas en la documentación

15 encontradas (confirmando y ampliando `PLAN_PIXEL_HARDENING.md`):

| Documento | Referencia rota |
|---|---|
| `BACKLOG_PENDIENTES.md` | `PLAN_PIXEL_HARDENING.md` ← *ya detectado* |
| `BACKLOG_PENDIENTES.md` | `AURA_ESTADO_Y_PENDIENTES.md` |
| `BACKLOG_PENDIENTES.md` | `AURA_ONBOARDING_PLAN.md` |
| `BACKLOG_PENDIENTES.md` | `BUGS_Y_ERRORES.md` |
| `BACKLOG_PENDIENTES.md` | `CHECKLIST_DEMO_JUEVES.md` |
| `BACKLOG_PENDIENTES.md` | `LISTO_PARA_DEPLOY.md` |
| `BACKLOG_PENDIENTES.md` | `MEMORY.md` |
| `CLAUDE_STATE.md` | `PLAN_PIXEL_HARDENING.md`, `AURA_ESTADO_Y_PENDIENTES.md`, `MEMORY.md` |
| `CLAUDE_STATE.md` | `design-patterns.md`, `linear-pondering-lemur.md`, `migration.sql` |
| `ERRORES_CLAUDE_NO_REPETIR.md` | `MEMORY.md`, `Prisma.sql` |

**`BACKLOG_PENDIENTES.md` tiene 7 punteros rotos** y pesa 127 KB. `CLAUDE_STATE.md` pesa
**584 KB** — es el archivo que `CLAUDE.md` REGLA #2 manda leer al inicio de **toda sesión**.
Ningún agente lo lee entero; en la práctica la regla se cumple leyendo el principio.

### Bus factor / operabilidad

**22 archivos `*.local.md` y `*.local.sql`, cero versionados.** `.gitignore` los excluye
explícitamente (*"Docs de trabajo locales (contexto de sesion, no se pushean)"*).
`git ls-files | grep -c local.md` → **0**.

Entre ellos: `PROJECT-HANDOFF.local.md` (el más reciente, 1-sep),
`RETOMAR.local.md` (45 KB), `AUDITORIA-ESTRUCTURA.local.md`,
`MIGRATION-RECIPE.local.md`, `SQL-INDICES-VENTANA-SILVER.local.md`,
`PLAN-CANALES.local.md` (18 KB), más 7 `.local.sql` de backfills de producción.

**Riesgo concreto:** todo eso existe **solo en el disco de Axel**. Un `git clone` en una
máquina nueva —o el próximo agente de IA en otro entorno— no ve nada de eso. Los `.local.sql`
son backfills que ya se corrieron **contra la base de producción** y son el único registro de
qué se le hizo a los datos de los clientes. Si ese disco muere, el repo compila y deploya
igual, pero nadie puede reconstruir por qué los datos están como están.

Procedimientos manuales sin automatizar ni documentar en el repo versionado:
- Configurar los 2 mecanismos de webhooks VTEX con `?org=` por cliente (`CLAUDE.md` lo
  describe, pero es un `curl` a mano por onboarding).
- Ejecutar los `/api/admin/migrate-*` en el orden correcto (regla documentada, ejecución manual).
- Rotar `ADMIN_API_KEY` (H-01) — sin runbook.

---

## 7. Lo que está bien (para no romperlo)

Una auditoría que solo lista problemas miente por omisión. Esto es sólido:

- **El grafo de dependencias está limpio.** 0 ciclos, 0 violaciones de frontera, 825 módulos.
  Los 2 ciclos del `domain-graph-baseline.txt` se cerraron. Ningún `src/lib` importa de
  `src/app`.
- **Los guards son de buena ingeniería.** `check-order-contract.mjs` y
  `check-serve-gold-first.mjs` usan el patrón correcto (allowlist grandfathered + falla solo
  ante deuda nueva), están comentados con el *por qué* y el caso real que los originó, y
  **corren en el build**.
- **La capa medallion (Silver/Gold) está bien testeada.** Los 6 transforms de Gold, los 2 de
  Silver, y toda la resolución de canales tienen tests con PGlite —Postgres real, no mocks—
  incluyendo idempotencia, convergencia y anti-shadowing. Es trabajo de calidad.
- **Los tests corren en 28 s, sin red y sin DB externa.** No hay excusa de fricción para
  meterlos en el build (H-08).
- **La documentación de arquitectura es honesta.** `PLAN_ARQUITECTURA_MODULAR_MONOLITO.md`
  abre con un aviso en mayúsculas de que no refleja el estado actual y apunta a la fuente de
  verdad, con un cuadro de avance real medido contra el código. Eso es raro y es valioso.
- **El aislamiento multi-tenant se respeta.** Todas las rutas que revisé filtran por
  `organizationId`, varias con el comentario `// org en el where (TOCTOU, D9)`. La excepción
  es `/api/debug/meta` (H-07).
- **Cero archivos `.bak`/`.old`/`.orig`. Cero componentes duplicados por nombre.**

---

## 8. Orden sugerido

**Esta semana (contención, ~1 día):**
1. Rotar `ADMIN_API_KEY` en Vercel + pasar `vercel.json` a variable de entorno (H-01).
2. Borrar el literal `'reattribute-2026'` de los 2 endpoints (H-02).
3. Borrar `/api/debug/meta` y `/api/alertas` (H-07, H-06) — dos `rm`, dos hallazgos cerrados.
4. Agregar `node scripts/check-ts-nocheck.mjs && vitest run` al script `build` (H-08).

**Este mes (evitar que empeore):**
5. Test de caracterización de `calculateAttribution` **antes** de tocarlo (H-04).
6. `metrics/orders/route.ts` importa `ordersValidSql` de `@/domains/orders` (H-05).
7. Dropear `dashboardPasswordPlain` y migrar creadores a bcrypt (H-03).
8. Versionar los `.local.md` que documentan producción (bus factor).

**Después (deuda estructural):**
9. `zod` en los bordes, empezando por los webhooks de VTEX/MELI (H-09).
10. Migrar las 64 rutas de `NEXTAUTH_SECRET` a `isValidAdminKey()` (M-01).
11. Decidir `/influencers` vs `/aura` y terminar la migración (M-04).
