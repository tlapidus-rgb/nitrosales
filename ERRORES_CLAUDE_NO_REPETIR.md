# ERRORES_CLAUDE_NO_REPETIR.md — Errores que Claude NO debe volver a cometer

> **Instrucción**: Claude DEBE leer este archivo al inicio de cada sesión.
> Cada error está documentado con causa raíz y la regla que lo previene.
> Si Claude comete un error que ya está acá, es una falla grave de proceso.

> **Última actualización: 2026-05-02 madrugada+++ — Sesión 60 EXT-2 BIS+++ (2 errores nuevos: codigo duplicado por refactor incompleto que persiste sin lint, y comentarios SQL "too much complexity" como excusa para shortcuts incorrectos).**

---

## Error #S60-EXT2BISPLUS-CODIGO-DUPLICADO-POR-REFACTOR-INCOMPLETO — Tres bloques idénticos en producción durante meses

**Cuándo pasó**: Sesión 60 EXT-2 BIS+++. En `src/app/(app)/pixel/page.tsx` el bloque de sliders del modelo Custom (Primer/Intermedios/Último clic) estaba renderizado **3 veces seguidas** (líneas 519/591/674). Cuando el usuario seleccionaba "Precision" se veían los 3 widgets idénticos apilados. Los 2 primeros eran exactos (variable `gradient` renombrada como `grad` la única diferencia), el 3ro era una versión vieja con emojis horizontal.

Probablemente un refactor que probó 3 variantes de UI y nunca borró las 2 que no quedaban. ~250 líneas de código muerto que sobrevivieron deploys, code reviews y nadie noticeó hasta que Tomy reportó "aparece triplicado".

### Causa raíz
- En archivos largos (>800 líneas), bloques duplicados se vuelven invisibles porque scrolleas por encima de ellos.
- TypeScript no detecta condicionales duplicadas (`{cond && (...)} {cond && (...)} {cond && (...)}`).
- ESLint default no detecta este patrón.
- Code review pasó por alto el mismo `selectedModel === "CUSTOM" && (() => {` repetido 3 veces.

### Regla
**Cuando se ve un archivo de 800+ líneas con state complejo, hacer pasada de detección de duplicados antes de tocar nada.**

Comandos útiles:
```bash
# Detectar bloques que empiezan con la misma condicion
grep -n 'selectedModel === "CUSTOM"' archivo.tsx

# Detectar funciones identicas dentro del mismo archivo
grep -n 'const handleSlider' archivo.tsx

# Si aparecen 2+ ocurrencias del mismo guard/handler en un solo archivo, alarma.
```

### Patrón de prevención
- Cuando refactor agrega una versión nueva del mismo widget, **borrar la vieja en el mismo commit**, no en uno futuro. Los "limpio después" no llegan.
- Si dos versiones tienen que coexistir temporalmente (A/B test), wrappearlas en `useFeatureFlag()` explícito con TODO de remoción. Nunca dejar `{condA && (...)} {condA && (...)}` que renderiza ambas.
- Cualquier sección que ocupe >100 líneas inline en un archivo principal debería ser un componente separado en `/components`.

### Caso similar futuro a chequear
- Otros archivos largos del codebase: `pixel/analytics/page.tsx` (1900+ líneas), `(app)/layout.tsx` (1400+ líneas), Aurum dashboards.

---

## Error #S60-EXT2BISPLUS-COMMENT-AS-EXCUSE-FOR-SHORTCUT — Comentarios "too much complexity" justificando logica incorrecta

**Cuándo pasó**: Sesión 60 EXT-2 BIS+++. En `/api/metrics/pixel/route.ts` query #20 (revenue por canal por día) había un comentario explícito:

```ts
// 20. Per-day per-source pixel revenue (for daily trend table)
// Uses LAST_CLICK logic here; model-specific SQL would add too much complexity.
// The selected model is respected via the model filter.
```

La lógica `WHEN tp_ord = touchpointCount THEN attributedValue ELSE 0` **siempre** daba el revenue completo al último touchpoint, sin importar el modelo seleccionado. El comentario justificaba el shortcut afirmando que era complejo escribir SQL model-aware. **En realidad fueron 8 líneas con CASE WHEN** distribuyendo `attributedValue` como factor multiplicativo según el modelo.

Esto significaba que cuando el usuario cambiaba a LINEAR/FIRST_CLICK/NITRO, los números de esa tarjeta no se movían. Tomy lo reportó como "muchas veces no cambia las atribuciones".

### Causa raíz
- Aceptar a ciegas el assumption de un comentario sin validar.
- "Too much complexity" en realidad significaba "no me dio ganas en ese momento" — siempre vale revisar el costo real.
- El segundo párrafo del comentario ("The selected model is respected via the model filter") es **falso** y engañoso: filtrar por modelo en el WHERE solo selecciona QUÉ filas leer, no cómo distribuir el revenue dentro de cada fila.

### Regla
**Cuando un comentario justifica un shortcut con una excusa cualitativa ("complex", "edge case", "good enough", "TODO"), tratar como red flag y validar la complejidad real ANTES de aceptarlo.**

Patrones de comentarios sospechosos:
- "Uses X logic here; doing it right would be too complex"
- "TODO: this is approximate, fix later"
- "Edge case ignored — should be rare"
- "Good enough for now"
- "Model-specific would add too much complexity"

Acciones:
1. Estimar el costo real de la solución correcta. Si es <50 líneas, hacerlo.
2. Si efectivamente es complejo, dejar comentario CON el costo estimado y crear entry en BACKLOG_PENDIENTES.
3. NUNCA dejar un comentario que afirme falsedades ("the selected model is respected" cuando no lo es).

### Patrón de prevención
- Grep de fix-en-deuda: `grep -rn "too much complexity\|TODO.*model\|approximate\|good enough" src/`
- Code review: si un comentario dice "no se puede hacer X", el reviewer debería preguntar "¿probaste? ¿cuántas líneas tomaría?".

---

## Error #S60-EXT2BIS-JOIN-HOMONIMO-ERRADO — JOIN entre tablas usando columnas con mismo nombre pero contenido distinto

**Cuándo pasó**: Sesión 60 EXT-2 BIS++. El módulo "CR por Dispositivo" en `/pixel/analytics` mostraba "Sin datos de dispositivos" para EMDJ aunque había 2.518 pixel_attributions en la ventana. Mi primer fix (alinear device source) no resolvió. El verdadero bug era el JOIN base:

```sql
-- INCORRECTO
JOIN pixel_visitors pv ON pv."visitorId" = pa."visitorId"
```

`pixel_visitors` tiene DOS columnas que se prestaban a confusión:
- `id`: cuid Prisma autogenerado (`cmooltjc1006j...`)
- `visitorId`: UUID v4 del cookie `_np_vid` (`8c24cdd3-95c6-4954-...`)

`pixel_attributions.visitorId` y `pixel_events.visitorId` ambos guardaban **el `id` del PixelVisitor (cuid)**, NO el UUID del cookie. Por convención el código bautizó la columna `visitorId` aunque su contenido es el `id` del visitor row.

El JOIN comparaba `pv.visitorId` (UUID v4) contra `pa.visitorId` (cuid) → **siempre 0 matches** → query devolvía array vacío → frontend filter `d.visitors > 0` vaciaba todo → módulo "Sin datos".

### Causa raíz
- Asumir que dos columnas con el mismo nombre (`visitorId`) en tablas relacionadas guardan el mismo valor.
- No leer el comentario del schema (`// UUID del cookie _np_vid`) que explicitamente decía que `pv.visitorId` es el cookie.
- No ver que `/api/metrics/orders/route.ts:932` ya usaba el JOIN correcto (`pv.id = pa.visitorId`), lo cual era una pista clarísima del patrón correcto.
- Hacer copy-paste del JOIN incorrecto entre archivos sin verificarlo.

### Regla
**Antes de hacer JOIN entre dos tablas usando columnas con el mismo nombre, verificar que ambas guarden el mismo tipo de valor.**

Pasos obligatorios:
1. Leer el schema (`prisma/schema.prisma`) y los comentarios de cada columna.
2. Hacer un `SELECT id, "visitorId" FROM tabla LIMIT 5` de cada lado para ver el formato real.
3. Buscar en otros archivos cómo se hace el mismo JOIN — si hay variantes (`pv.id` vs `pv.visitorId`), una está mal.

### Patrón de diagnóstico cuando un módulo viene vacío sin error
Cuando una query devuelve `[]` (no error, no exception, solo vacío), probable que el problema sea un JOIN. Crear endpoint debug que ejecute la query con `LEFT JOIN` en vez de `JOIN` y cuente cuántas filas pierden el match. En este caso:

```sql
SELECT COUNT(*) as total, COUNT(pv.id) as with_pv
FROM pixel_attributions pa
LEFT JOIN pixel_visitors pv ON pv."visitorId" = pa."visitorId"
```

Si `with_pv` es 0 mientras `total` > 0 → JOIN está mal.

### Prevención
- Cuando aparezca un módulo vacío en producción, antes de tocar nada hacer un mini-audit de las queries: ¿cuántas filas hay en la base? ¿cuántas pasa cada JOIN? ¿el JOIN aplica el filtro de `organizationId`?
- Considerar renombrar columnas con nombres ambiguos: `pa.visitorId` debería ser `pa.pixelVisitorId` para que no se confunda con `pv.visitorId` (cookie). Pero ese es un refactor grande con migración — para ahora, comentario `-- pa.visitorId guarda pv.id, NO pv.visitorId` en cada query que lo use.

### Casos similares conocidos en el codebase
- `pixel_events.visitorId` también guarda `pv.id` (no el cookie). Mismo bug.
- `pixel_attributions.visitorId` igual.
- `pv.id` ↔ `pa.visitorId` ↔ `pe.visitorId` son la misma cosa (cuid).
- `pv.visitorId` es el cookie UUID y solo se usa internamente cuando el snippet identifica un visitor.

### Fix aplicado
Commits `80e2aec` (productivo) + endpoint debug `9dbd907..d764d8f`.

---

## Error #S60-EXT2BIS-CRON-SIN-PAGINAR — Cron diario llamaba a paginated endpoint sin loop

**Cuándo pasó**: Sesión 60 EXT-2 BIS+. El cron diario `/api/sync` invocaba `/api/sync/vtex` una sola vez por org. El endpoint `/api/sync/vtex` defaulteaba a `page=1` y devolvía hasta 100 órdenes con un flag `hasMore`. **El cron nunca leía ese flag, nunca iteraba.** Si una org generaba >100 órdenes en el rango procesado, las páginas siguientes simplemente no se traían — se perdían silenciosamente.

Síntoma cliente: 24 órdenes faltantes en TVC entre 30/04 y 02/05. El cron 30min agregado en el mismo bloque las recuperó, pero ocultó el bug real durante horas hasta que Tomy forzó investigar la causa raíz.

### Causa raíz
- Asumir que un endpoint que devuelve `hasMore` es responsabilidad del CALLER iterar — pero olvidar implementarlo.
- No probar el cron con una org que tuviera volumen >100 órdenes/día.
- El cron 30min creado como "safety net" funcionaba bien por su rango chico (24hs), enmascarando el bug del cron diario.

### Regla
**Cualquier endpoint paginated que devuelva `hasMore` (o equivalente: `nextPage`, `nextCursor`, `total`) y sea consumido por un cron, DEBE consumirse con loop hasta agotar páginas o llegar a un cap de seguridad (`maxPages`).**

```ts
// CORRECTO
let page = 1;
const maxPages = 50;
while (page <= maxPages) {
  const res = await fetch(`/api/sync/vtex?org=${orgId}`, {
    method: "POST",
    body: JSON.stringify({ syncKey, page }),
  });
  const data = await res.json();
  results.push(data);
  if (!data.hasMore || data.error) break;
  page++;
}
```

### Prevención
- Revisar TODOS los crons existentes que invocan endpoints internos: ¿el endpoint es paginated? ¿el cron itera?
- Cuando se encuentra un sintoma "X no aparece en producción", SIEMPRE investigar por qué los caminos de recovery (cron, reintentos, webhooks) NO recuperaron — no agregar más caminos.
- Logging defensivo: cron debe loggear `pagesProcessed` y `totalRecords` por org. Si una org consistente reporta exactamente 100 páginas/100 records, alarma.

---

## Error #S60-EXT2BIS-FLAG-SERVERSIDE-EN-CLIENTE — Componente cliente leyó flag que solo existe en servidor

**Cuándo pasó**: Sesión 60 EXT-2 BIS+. Implementé `OrgSwitcher.tsx` (componente cliente) con `const isAdmin = session.user.isInternalUser === true`. El componente nunca se renderizaba porque ese campo NO está en la sesión de NextAuth — `isInternalUser` es una **función server-side** en `src/lib/feature-flags.ts` que llama a `getServerSession`. La sesión que llega al cliente solo tiene los campos que el callback `session` de NextAuth expone explícitamente.

Tomy probó con hard refresh y mandó captura: switcher no aparece. Diagnóstico: el flag en cliente era siempre `undefined`, comparado con `=== true` siempre `false`, render condicional siempre null.

### Causa raíz
- Asumir que cualquier helper auth llamado `isInternalUser` está disponible en cliente solo por convención de nombre.
- No leer `src/lib/feature-flags.ts` antes de usar el flag — habría visto que es `async function getServerSession`.
- Confundir "está en el codebase" con "está en `session.user`".

### Regla
**Antes de usar un flag de auth en componente cliente (`"use client"`), confirmar que está expuesto en la session de NextAuth (callback `session` en `authOptions`) o pasarlo via prop desde un Server Component.**

Opciones válidas para gates UX en cliente:
1. **Agregar el flag al callback `session`** de NextAuth → todos los componentes cliente lo ven en `useSession`.
2. **Replicar la lista (si no es secreta)** en frontend → comparar localmente. Ej: `INTERNAL_EMAILS` con emails públicos.
3. **Server Component padre** lee el flag y pasa boolean prop al cliente.

```ts
// OPCION 2 (replicar lista, válido si no es secreta)
const INTERNAL_EMAILS = new Set<string>(["tlapidus@99media.com.ar"]);
const email = (session?.user?.email || "").toLowerCase();
const isAdmin = INTERNAL_EMAILS.has(email);
```

### Prevención
- Antes de leer `(session?.user as any)?.X`, hacer un grep rápido en `src/lib/auth.ts` o `authOptions.callbacks.session` para confirmar que `X` se está agregando al token.
- Si un componente cliente no se renderiza, primero loguear `JSON.stringify(session?.user)` para ver qué campos REALMENTE existen.

---

## Error #S60-EXT2BIS-PARCHE-EN-VEZ-DE-CAUSA-RAIZ — Agregar más cron/retry/safety-net en vez de investigar por qué el sistema actual falla

**Cuándo pasó**: Sesión 60 EXT-2 BIS+. Aparecieron 24 órdenes faltantes en TVC. Mi primer impulso fue agregar `/api/cron/vtex-sync-recent` cada 30 min como "red de seguridad". Lo implementé y desplegué. Tomy frenó:

> "creo que se vuelve más costoso y tener que estar atendiendo carteros todo el tiempo, que tratar de revisar por qué los carteros pierden las cartas. ¿Por qué EMDJ no perdió ninguna y TVC sí? Hace una investigación profunda."

La investigación reveló el bug real: cron diario no paginaba. El cron 30min funcionaba correctamente, pero ocultaba el sintoma sin resolverlo. Si TVC hubiera generado >100 órdenes en 30 min (improbable pero posible en sales), seguiría perdiendo.

### Causa raíz
- Sesgo cognitivo: agregar capa = trabajo visible y "resuelve" rápido. Investigar = trabajo lento, sin garantía de hallazgo, requiere parar.
- Dos crons (diario + 30min) parecía "redundancia defensiva" pero en realidad era enmascarar un bug.
- Comparar EMDJ vs TVC end-to-end no se me había ocurrido — Tomy lo forzó.

### Regla
**Cuando un sistema de recovery (cron, retry, safety-net) "no funciona", investigar por qué falló ANTES de agregar otro sistema de recovery encima.**

Preguntas obligatorias antes de agregar nueva capa:
1. ¿Qué hizo (o no hizo) la capa anterior cuando ocurrió el sintoma? Logs, last run, output.
2. ¿Otra org/cliente tiene el mismo problema? Si NO → comparar implementación, no resultado.
3. ¿Existe un cap de paginación, timeout, rate limit que silencia el bug?
4. Si agrego una nueva capa hoy, ¿cuál es el sintoma que mañana revelará el bug original?

Si después de responder las 4 preguntas la nueva capa sigue siendo necesaria, está bien agregarla — pero documentar la causa raíz separadamente.

### Prevención
- En CLAUDE_STATE.md mantener una sección "Investigaciones pendientes" cuando un bug se resuelve con un workaround.
- Cuando Tomy diga "¿estás seguro? hace una investigación profunda", **parar de implementar** y usar agentes paralelos / WebFetch / queries SQL para auditar.
- No tratar el cron 30min como "exito" hasta haber explicado por qué el cron 1x/día falló.

---

## Error #S59-OAUTH-ORGID-FROM-QUERY — Aceptar orgId desde query param sin validar contra sesión

**Cuándo pasó**: Sesión 59. El endpoint `/api/oauth/meta/start` aceptaba `?orgId=...` literal del query string. Tomy abrió la URL con un valor mal copiado (probablemente arrastró `TU_ORG_ID` literal o uno de otra org de prueba). El OAuth completó, Meta redirigió al callback que guardó el token en la Connection de **una org fantasma** (`cmn8gt0lj00011dsvlr0dox2q`), no en la org real del cliente logueado (`cmmmga1uq0000sb43w0krvvys`).

Resultado: Tomy revisaba el endpoint de status de SU cuenta y el token aparecía como faltante, aunque acababa de hacer OAuth con éxito. Confusión. Tiempo perdido diagnosticando.

### Causa raíz
- El endpoint usaba `url.searchParams.get("orgId")` directamente sin contrastar con la sesión NextAuth.
- Asumía que el cliente sabía cuál era su orgId y lo iba a poner correctamente.
- Sin validación cruzada, cualquier orgId arbitrario era aceptado.

### Regla
**En endpoints OAuth (start) y cualquier endpoint que acepte un identificador del propietario, SIEMPRE leer el orgId/userId de la sesión NextAuth y forzarlo sobre el query param.**

```ts
// CORRECTO
const queryOrgId = url.searchParams.get("orgId") || "";
let orgId = queryOrgId;
const session = await getServerSession(authOptions);
const sessionOrgId = (session as any)?.user?.organizationId;
if (sessionOrgId) orgId = sessionOrgId; // sesion gana
if (!orgId) return error("orgId requerido");
```

Si el cliente está logueado, el orgId viene de la sesión. El query param solo se usa como fallback para casos sin sesión (raros). Esto previene que un cliente pueda hacer OAuth para una org que no es la suya.

### Prevención
- Cada vez que un endpoint acepte `orgId`/`userId` desde query string, agregar validación cruzada con sesión.
- Logs en endpoints OAuth: log el orgId final usado + sessionOrgId + queryOrgId, así un mismatch se detecta inmediatamente.
- Este error es **falla de seguridad** además de bug — un cliente malicioso podía hacer OAuth para tokens de otras orgs.

---

## Error #S59-DUPLICATE-ENDPOINTS — Crear endpoint nuevo sin buscar el existente equivalente

**Cuándo pasó**: Sesión 59. Construyendo páginas dedicadas en `/settings/integraciones/*`, creé `/api/me/ml-status` para que la página de MercadoLibre leyera el estado. NO chequee si ya existía un endpoint equivalente. **Existía**: `/api/me/connections/ml` que el wizard usaba desde S55.

Resultado: 2 endpoints duplicados con shape parecido pero distintos. La auditoría de coherencia detectó la duplicación. Tuve que unificar y borrar el mío.

### Causa raíz
- Empecé a programar sin hacer el listado de endpoints existentes para la plataforma que estaba tocando.
- Asumí que si necesitaba un nuevo dato (lastSyncAt, nickname), tenía que crear un endpoint nuevo. Pero podía extender el existente.
- El nombre `connections/ml` no me era familiar al momento; busqué `ml-status` por inercia y no encontré, así que lo creé.

### Regla
**Antes de crear cualquier endpoint nuevo, hacer un grep por la plataforma + buscar paths típicos:**
- `/api/me/{platform}*`
- `/api/me/connections/{platform}`
- `/api/auth/{platform}*`
- `/api/oauth/{platform}*`
- `/api/sync/{platform}*`

Si encuentro algo cercano (incluso con shape distinto), **extender ese** en vez de crear nuevo.

```bash
# Comando sanity check antes de crear endpoint
grep -rn "api/me/[a-z-]*ml\|api/me/connections/ml" src/
```

### Prevención
- Auditoría de coherencia DESPUÉS de hacer cambios grandes — comparar endpoints usados por wizard vs settings vs admin. Si dos lugares pegan a endpoints distintos para la misma data, hay algo mal.
- Naming consistente: si existe `/api/me/connections/ml`, las nuevas plataformas deberían seguir el mismo path (`/api/me/connections/meta`, etc.) en vez de inventar `/me/meta-status`.

---

## Error #S59-TEST-ASKS-SERVER-ENV-FROM-CLIENT — Test de credenciales pedía env vars del servidor al cliente

**Cuándo pasó**: Sesión 59. Tomy testeó las credenciales de TVC y `testGoogleAds` devolvió "Faltan credenciales OAuth (clientId/clientSecret/refreshToken)" aunque TVC había cargado correctamente su `customerId`.

Causa: el código leía clientId, clientSecret, developerToken **desde `creds`** (input del cliente), cuando en realidad esas son env vars del servidor (la app OAuth registrada de NitroSales en Google Cloud Console). El cliente solo carga `customerId` + `loginCustomerId`. El refreshToken se obtiene cuando completa el OAuth post-wizard, no se carga manual.

```ts
// MAL
const clientId = (creds?.clientId || "").trim(); // ← cliente nunca lo tuvo
const clientSecret = (creds?.clientSecret || "").trim();
if (!clientId || !clientSecret || !refreshToken) {
  return { ok: false, detail: "Faltan credenciales OAuth..." };
}
```

### Causa raíz
- Confusión entre los 5 valores de OAuth:
  - `clientId` + `clientSecret` → identidad de la app OAuth (server-side, registrados en Google Cloud)
  - `developerToken` → token global de la app para Google Ads API (server-side env)
  - `refreshToken` → token del CLIENTE post-OAuth (DB, no env)
  - `customerId` → ID de la cuenta del cliente (input)

  Solo los 2 últimos son del cliente. Los 3 primeros son del servidor.

- Test escrito asumiendo que TODOS venían del cliente.

### Regla
**Al escribir test de credenciales para una plataforma OAuth de terceros, listar EXPLÍCITAMENTE qué inputs vienen del cliente y qué del servidor.**

Mental check antes de escribir:
| Input | Quién lo tiene |
|---|---|
| App credentials (clientId/clientSecret) | Servidor (env vars) |
| Developer/API token | Servidor (env vars) |
| User refresh token | DB Connection (post-OAuth flow) |
| Account ID (customer/ad account) | Cliente (input wizard) |

Sólo lo último (account ID) lo carga manualmente el cliente. El resto se lee de env vars o de la DB.

### Prevención
- Al integrar una plataforma OAuth nueva, primero documentar las 4 categorías arriba en un comment del archivo de test.
- Después escribir el test leyendo de los lugares correctos (env vs creds vs DB).

---

## Error #S59-WRONG-COLUMN-NAME-IN-RAW-SQL — Query raw con nombre de columna inexistente

**Cuándo pasó**: Sesión 59. Test NitroPixel fallaba con error Postgres `42703: column "eventTime" does not exist`. La query era:

```ts
`SELECT COUNT(*)::int AS c FROM "pixel_events" WHERE "organizationId" = $1 AND "eventTime" >= $2`
```

La columna real del schema Prisma es `receivedAt` (cuando server recibió) o `timestamp` (timestamp del cliente). `eventTime` no existe.

### Causa raíz
- Usé un nombre genérico ("eventTime") en vez de chequear el schema real (`schema.prisma`) o un endpoint que ya leyera de esa tabla.
- TypeScript NO captura este error porque `$queryRawUnsafe` recibe un string — no hay tipos.
- Bug pasivo: el test devolvió error solo cuando alguien lo tiró (Tomy probando TVC).

### Regla
**Para queries SQL raw (`$queryRawUnsafe` / `$executeRawUnsafe`), siempre verificar nombres de columna contra `schema.prisma` antes de escribir.**

```bash
grep -A 30 "model PixelEvent" prisma/schema.prisma
```

Mirar los campos exactos. Notar que Prisma usa camelCase y los mapea a la DB (a veces snake_case). En queries raw, usás el nombre EXACTO del campo Prisma (que en este proyecto es camelCase con doble comilla).

### Prevención
- Cuando construyas una query raw nueva, antes de escribir copiar el modelo del schema.prisma como referencia.
- Si hay un endpoint que ya consulta esa tabla via Prisma client (`prisma.pixelEvent.findMany`), usar ese como referencia de cómo se llaman los campos.
- Tests: agregar test smoke que ejecute la query con datos reales en algún momento de CI.

---

## Error #S58-RACE-COUNT-CREATE — Race condition con `count + if(==0) + createMany` en lugar de transactional deleteMany+createMany

**Cuándo pasó**: Sesión 58 BIS. En `vtex-enrichment.ts` y `mercadolibre-enrichment.ts`, el patron era:
```ts
const existing = await prisma.orderItem.count({ where: { orderId } });
if (existing === 0) {
  await prisma.orderItem.createMany({ data: items });
}
```

Auditoria con agente paralelo detecto que esto NO es atomico: si webhook (real-time) y backfill (cron) llegaban concurrentes a la misma orden, ambos podian leer `count=0`, ambos pasaban el if, y ambos hacian `createMany` → items duplicados en la orden.

### Causa raíz
- "Idempotencia naive" basada en check-then-act sin transaccion.
- Asumia que solo un proceso a la vez tocaba la orden, pero en realidad webhook + cron + re-enrich pueden coexistir.
- El bug NO se manifestaba en testing local (single-process) — solo en prod con concurrencia real.

### Regla
**Para "estado final consistente" (la orden debe quedar con EXACTAMENTE los items que dice la fuente), usar `$transaction([deleteMany, createMany])` en vez de check-then-act.**

```ts
// CORRECTO — atomico, idempotente, race-safe
await prisma.$transaction([
  prisma.orderItem.deleteMany({ where: { orderId } }),
  prisma.orderItem.createMany({ data: items }),
]);
```

Esto reemplaza COMPLETAMENTE los items existentes por los nuevos, en una sola transaccion. Si dos calls concurrentes llegan, el ultimo gana, pero NUNCA quedan duplicados.

### Prevención
- Cada vez que veo `count + if + create` o `findUnique + if-not-exists + create` → ALARMA. Usar transaction o upsert.
- Tests de stress (varios calls concurrentes al mismo recurso) cuando hay webhook + cron + manual ops sobre la misma entidad.

---

## Error #S58-FALLBACK-OR-VS-NULLISH — `||` colapsa 0/false/string-vacio a fallback

**Cuándo pasó**: Sesión 58 BIS. En `vtex-enrichment.ts`:
```ts
const unitPrice = (item.sellingPrice || item.price) / 100;
```

VTEX devuelve sellingPrice y price en centavos. Para items con `sellingPrice = 0` (regalo, sample, item promocional), el `||` colapsaba al fallback `item.price`. Pero el regalo *deberia* costar 0, no el precio de catalogo. La auditoria con agente detecto que ~5% de items en muchos sellers podrian tener este caso.

### Causa raíz
- `||` testea truthy/falsy. `0`, `""`, `false`, `null`, `undefined` son TODOS falsy → caen al fallback.
- Pero el dato de negocio es: "0 es VALOR VALIDO, fallback solo si es null/undefined".
- En APIs financieras/comerciales, distinguir 0 valido de null faltante es CRITICO.

### Regla
**Para fallback de campos numericos/booleanos donde 0/false son valores validos, SIEMPRE usar `??` (nullish coalescing) en vez de `||`.**

```ts
// CORRECTO — solo cae a fallback si es null/undefined
const rawSelling = item.sellingPrice;
const rawList = item.price;
const rawCents = rawSelling != null ? Number(rawSelling) : (rawList != null ? Number(rawList) : 0);
const unitPrice = Number.isFinite(rawCents) ? rawCents / 100 : 0;
```

Notar: `Number.isFinite` es la guarda final contra NaN/Infinity (por si el cast falla).

### Prevención
- Buscar en codebase patrones `(field1 || field2)` donde fields son numericos. Cambiar a `??`.
- Mental check al escribir fallbacks: ¿0 es un valor valido aqui? ¿Y false? ¿Y string vacio? Si SI a cualquiera → usar `??`.

---

## Error #S58-MINI-OBJECT-VS-AUTHORITATIVE — Leer datos del mini-objeto de un endpoint LIST cuando hay un endpoint DETAIL autoritativo

**Cuándo pasó**: Sesión 58 BIS. ML `/orders/search` devuelve cada orden con un objeto `shipping` chico que tiene `id`, a veces `shipment_type`, pero CASI NUNCA `cost`, `logistic_type`, `receiver_address.zip_code`. El codigo:

```ts
const orderFields = {};
if (mlOrder.shipping?.cost != null) orderFields.shippingCost = mlOrder.shipping.cost;
if (mlOrder.shipping?.logistic_type) orderFields.shippingCarrier = mlOrder.shipping.logistic_type;
if (mlOrder.shipping?.receiver_address?.zip_code) orderFields.postalCode = mlOrder.shipping.receiver_address.zip_code;
```

Resultado: 100% de las orders MELI quedaron sin shipping_cost, shipping_carrier, postal_code aunque ML expone esos datos en `/shipments/{id}`. La fuente autoritativa es OTRA URL.

Mismo patron pasa en VTEX: `/api/oms/pvt/orders` (list) trae info chica vs `/api/oms/pvt/orders/{id}` (detail) que trae todo.

### Causa raíz
- Asumi que el `shipping` del payload de `/orders/search` era el mismo que `/shipments`. NO lo es.
- El payload del LIST endpoint suele ser un MINI-OBJETO con solo IDs y campos basicos para listings. El DETAIL trae el objeto completo.
- Sin auditoria explicita campo-por-campo (health-check), el bug pasaba desapercibido — campos quedaban en null pero no rompia.

### Regla
**Al integrar APIs externas, IDENTIFICAR explicitamente cual es el endpoint autoritativo para cada campo. NO leer del payload de LIST si DETAIL existe.**

Patron correcto:
```ts
let detailedData = lookupFromListPayload();
if (needsAuthoritativeData && hasResourceId && hasToken) {
  try {
    detailedData = await fetchFromDetailEndpoint(resourceId, token);
  } catch {} // failsafe silent
}
// Despues leer SIEMPRE de detailedData con fallback al list payload
const cost = detailedData?.cost ?? listPayload?.shipping?.cost;
```

### Prevención
- Al integrar nueva API, mapear: ¿que campos vienen completos en LIST? ¿Cuales requieren DETAIL?
- Health-check post-backfill (gaps por campo y por source) detecta este bug rapido — campos al 100% null = sospechar mini-objeto.
- Documentar en comments: "este campo viene de /shipments, no de /orders/search".

---

## Error #S58-TRUTHY-OBJECT-CHECK — Check `if (!obj)` no detecta objetos vacios `{}`

**Cuándo pasó**: Sesión 58 BIS. En `mercadolibre-enrichment.ts`:
```ts
let addr = mlOrder.shipping?.receiver_address;
if (!addr && shippingId) {
  // hacer GET /shipments para llenar addr
}
```

El codigo asumia que si `addr` era null/undefined, hacia el lookup. Pero ML devuelve `receiver_address: {}` (objeto vacio truthy) en `/orders/search`. Asi `!addr` era `false` → NUNCA disparaba el lookup → city/state/country quedaban 98% null en customers ML.

Bug pasivo durante MESES sin detectar (S55 ya tenia la misma logica).

### Causa raíz
- En JS/TS, `Boolean({}) === true`. Objeto vacio es truthy.
- El check `!addr` solo detecta null/undefined/0/""/false, no objetos sin campos.
- Asumir "si addr existe → tiene data" era invalido.

### Regla
**Para validar "el objeto trae data util", chequear las KEYS especificas que necesitas, no si el objeto existe.**

```ts
// CORRECTO — chequea los campos que realmente importan
const needsLookup = !addr?.city?.name || !addr?.state?.name;
if (needsLookup && shippingId && token) {
  // hacer GET /shipments
}
```

### Prevención
- Cada vez que hacer `if (!obj)` sobre un objeto que vino de API externa → preguntar: "¿esta API devuelve objetos vacios cuando no hay data?". Si la respuesta es SI o "no se" → chequear keys especificas.
- Al hacer lookup condicional (dispara solo si falta data), nombrar la variable de check semanticamente: `needsShipmentLookup` mejor que `if (!addr)`.

---

## Error #S56-TAG-OVERRIDES-STATUS — Priorizar tag histórico sobre status terminal al mapear desde API externa

**Cuándo pasó**: Sesión 56. Al clasificar órdenes de MELI en nuestro enum interno, `mapMlStatus` revisaba primero `tags.includes("delivered")` y solo después el `status`. MELI mantiene el tag `"delivered"` históricamente incluso cuando después cancela el pack (el item se entregó, después lo devolvieron y cancelaron la venta). Resultado: 48 packs cancelados quedaron marcados como DELIVERED en nuestra DB → KPIs de ventas inflados (/orders mostraba 1246 vs MELI UI 1196 — diff del 4%).

### Causa raíz
- Mapping priorizaba tag (dato histórico/derivado) sobre status (fuente de verdad actual).
- Los tags en APIs externas suelen ser acumulativos — se agregan pero no se quitan cuando el estado evoluciona.
- El bug solo se manifestaba con data real de >6 meses: recién cuando suficientes packs sufrían ciclo "entregado → devuelto → cancelado" la discrepancia se hacía visible.

### Regla
**Al mapear status desde una API externa, SIEMPRE priorizar terminal states (cancelled, invalid, refunded) sobre cualquier tag/flag derivado.**

Orden correcto en switch/if:
1. **Primero: terminal/negative states** (cancelled, invalid, failed, refunded) → resultado final correcto.
2. **Después: tags/flags derivados** (delivered, shipped) → solo si el status base no es terminal.
3. **Final: switch sobre status regular**.

Ejemplo correcto:
```ts
function mapStatus(status: string, tags?: string[]): string {
  if (status === "cancelled" || status === "invalid") return "CANCELLED"; // terminal gana
  if (tags?.includes("delivered")) return "DELIVERED"; // tag override para no-terminales
  switch (status) { ... }
}
```

### Prevención
- Preguntar al integrar una API: ¿qué estados son terminales e irreversibles? Esos SIEMPRE ganan.
- Test mental: ¿qué pasa si un pack pasa por paid → shipped → delivered → (cliente reclama) → cancelled? El mapping debe devolver CANCELLED, no DELIVERED.

---

## Error #S56-UNMAPPED-STATUS-SILENT-FALLBACK — Status de API externa sin mapear caen a default engañoso

**Cuándo pasó**: Sesión 56. MELI devolvía status `partially_refunded` (7 packs = reembolso parcial, venta válida con reembolso de parte del monto) que no estaba en nuestro `switch` de `mapMlStatus`. Caía al `default: return "PENDING"`. Pero como esos packs además tenían tag=delivered, el tag-override (también buggeado, ver #S56-TAG-OVERRIDES-STATUS) los clasificaba como DELIVERED. Comportamiento inconsistente y KPIs erróneos.

### Causa raíz
- Implementé el mapping solo con los statuses "comunes" que vi en docs de MELI: paid, confirmed, cancelled, invalid, shipped, delivered.
- No cubrí los menos comunes: partially_refunded, partially_paid, fraud_risk_detected, returned, etc.
- `default: return "PENDING"` silenciaba el problema — todas las órdenes entraban a la DB, pero con status incorrecto.
- Sin observability: ningún log avisaba "status X no mapeado".

### Regla
**Al mapear enums desde APIs externas, NUNCA usar un default silencioso que enmascare statuses desconocidos.**

Opciones aceptables:
- **A)** `default: throw new Error('Unknown status: ${status}')` — forzar a conocer cada status. Agresivo pero correcto.
- **B)** `default: console.warn(...) && return "PENDING"` — fallback pero con log.
- **C)** Tabla de mapeo exhaustiva con TODOS los statuses posibles de la API, revisada al integrar y al upgradear versiones.

Para APIs con muchos statuses (MELI, Shopify, Stripe), opción C es la más defensiva.

### Prevención
- Al integrar nueva API, buscar en docs la LISTA COMPLETA de statuses posibles (incluyendo los raros/edge).
- Mapear explícitamente CADA UNO. Venta válida → APPROVED/DELIVERED. Inválida → CANCELLED. Transitorio → PENDING.
- No mapear un status == olvidarlo == bug futuro.

---

## Error #S56-ITERATE-WITHOUT-VLOOKUP — Iterar fixes sin BUSCARV directo contra la fuente de verdad

**Cuándo pasó**: Sesión 56. Tomy reportó que /orders mostraba 1246 pedidos pero MELI UI mostraba 1196. En vez de hacer un BUSCARV directo (comparar los 1246 packs nuestros vs los 1196 de MELI y ver los 50 de diferencia), hice 3 hipótesis consecutivas sin validar:
1. "son packs PENDING" → pushé filtro, 0 cambios porque no había PENDING.
2. "son packs mixtos" → pushé anti-join, 0 cambios porque no había mixtos.
3. "MELI UI debe usar lógica interna distinta" → propuse aceptar la diferencia.

Tomy me reclamó correctamente: *"Si yo tuviese un Excel, haría un BUSCARV, así de fácil. No entiendo por qué vos con más herramientas no podés resolver algo tan simple."*

Cuando finalmente hice el BUSCARV (endpoint `ml-diff-detail`), en 1 consulta encontramos que 48 packs tenían status=cancelled en MELI pero DELIVERED en nuestra DB — causa raíz identificada en 30 segundos.

### Causa raíz
- Reflejo "hipótesis → fix → ver si cambió" en vez de "medir directamente → identificar → fix".
- Inferí la naturaleza de la diferencia desde estadísticas globales en lugar de mirar los registros específicos.
- Me ahorré 5 minutos de construir el endpoint de diagnóstico y me costaron 60 minutos de iterar a ciegas + frustración del usuario.

### Regla
**Cuando hay una diferencia numérica entre nuestra DB y una fuente externa (MELI, VTEX, Stripe, etc), el PRIMER paso SIEMPRE es el BUSCARV literal:**

1. Query: "dame los IDs en nuestra DB del set A" (ej. 1246 packs non-cancelled)
2. Query: "dame los IDs en la API externa del set B" (ej. 1196 packs concretadas)
3. Set theory: A\B = lo que tenemos de más, B\A = lo que perdimos, A∩B = match.
4. Para cada subset, sample de 5-10 registros con su status en ambos lados.
5. **RECIÉN ahí** formular hipótesis, validar con el sample, y fix.

**NUNCA iterar fixes declarativos sin haber hecho primero el BUSCARV.**

### Prevención
- Al escuchar "nuestro número X no matchea con su número Y", **reflexivamente** construir el endpoint de diff antes de tocar una línea de código.
- El endpoint de diff es barato (5-10 min de código) y evita 60+ min de iteraciones a ciegas.
- Pattern reutilizable: `src/app/api/admin/ml-diff-detail/route.ts` (S56) y `ml-audit-packs/route.ts` (S56).
- Al reconocer patterns de "pack_id", "order.id", "externalId" que dividen 1 entidad lógica en N rows, SIEMPRE armar el BUSCARV por el ID lógico (pack_id), no por el row (externalId).

---

## Error #S55BIS3-NO-REPLY-SPAM — Usar `no-reply@` como FROM de emails transaccionales en dominio nuevo

**Cuándo pasó**: Sesión 55 BIS+3. Los emails automáticos del onboarding (invitación, confirmación, activación) caían a spam aunque el envío manual por debug endpoint llegaba al inbox. Contradictorio. Tomy cambió `no-reply@nitrosales.ai` → address humano (ej `hola@nitrosales.ai`) y empezaron a llegar.

### Causa raíz
- `RESEND_FROM` env var en Vercel estaba en `no-reply@nitrosales.ai`.
- Filtros anti-spam (Gmail especialmente) son extremadamente agresivos con `no-reply@` + dominio nuevo (<6 meses). Heurística automática clasifica como probable spam transaccional.
- SPF/DKIM/DMARC estaban OK — no era problema de auth.
- Default del código tenía `team@nitrosales.ai` pero env var global lo sobreescribía.

### Regla
**Para emails transaccionales en dominio nuevo (< 6 meses), usar SIEMPRE un FROM humano:**
- ✅ `hola@dominio.com` / `team@dominio.com` / `nombre@dominio.com`
- ❌ `no-reply@dominio.com` / `noreply@dominio.com`

**Anti-pattern sutil**: default del wrapper correcto pero env var global mal. Siempre chequear env vars efectivas en producción (con un endpoint debug que las devuelva), no solo defaults en código.

**Cómo detectar**: si emails manuales llegan OK pero automáticos van a spam, sospechar del FROM. Si ambos fallan, sospechar auth o reputación del dominio.

---

## Error #S55BIS3-PARCHE-VS-DIAGNOSTICO — Reenviar manualmente un email cuando el flow automático falla

**Cuándo pasó**: Sesión 55 BIS+3. Tomy reportó emails automáticos no llegando. Mi primer instinto: "te armo botón para reenviar manual". Tomy respondió: *"me da miedo que sea un parche y el proceso automático siga roto"*. Tenía razón.

### Causa raíz
- Reflejo de "arreglar síntoma" en vez de diagnosticar causa.
- Reenvío manual oculta el bug: el flujo automático sigue roto, el admin lo "parcha" cada vez.
- En producción con 2+ clientes/semana, esto escala a trabajo manual recurrente.

### Regla
**Cuando un flow automático falla, NUNCA ofrecer reenvío manual como primera opción.** Orden correcto:
1. **Diagnóstico sin modificar producción** — endpoint que ejecute el flow paso a paso con reporte de dónde falla.
2. **Fix del bug raíz**.
3. **Validación creando caso nuevo** (NO reenviando el roto).
4. **Observability** si el problema fue difícil de detectar (agregar tabla de log al wrapper, panel admin, etc).

**Reenvío manual solo acceptable en**: cliente urgente + raíz ya diagnosticada + fix en vuelo. Siempre documentar que es parche.

---

## Error #S55BIS3-OBSERVABILITY-MISSING — Wrappers de servicios externos sin persistencia de intentos

**Cuándo pasó**: Sesión 55 BIS+3. Sin tabla `email_log`, debuggear "no llegó el email" requería: mirar logs de Vercel + dashboard de Resend + adivinar. Cada debug tardaba 10-15 min vs 30 seg con panel admin.

### Causa raíz
- Wrappers de servicios externos (`sendEmail`, futuros `stripe`, `twilio`, etc) hacían fire-and-forget con `.catch()` silencioso.
- Ningún registro persistente de intentos → no había forma de reconstruir qué pasó con un envío específico.

### Regla
**Cada wrapper de servicio externo DEBE persistir automáticamente cada intento en una tabla de log.**

Estructura mínima:
- `timestamp`, `service`, `operation`
- `input_summary` (to, subject, size — no content completo)
- `ok`, `external_id` (resendId/stripeId/etc), `error_message`, `http_status`
- `duration_ms`, `context`

Requisitos:
- **Insert try/catch silencioso**: si falla, NO romper el envío real.
- **Panel admin visible** con filtros (only=failed, by destinatario, by context).
- **Retención mínima 30 días**.

**Pattern aplicado en S55 BIS+3 a email con `email_log`**. Replicar cuando integremos: Stripe, Twilio, webhooks outgoing, S3. El `meli_webhook_events` es el mismo pattern aplicado a webhooks incoming.

---

## Error #S55-VTEX-PAGE-LIMIT — Asumir que un endpoint paginado no tiene límite de páginas máximo

**Cuándo pasó**: Sesión 55. Despues de 4 commits para acelerar el backfill de VTEX, el job se trababa en 3.000 órdenes con error `"Max page exceed ( 30 ), refine filter"`. La API `/api/oms/pvt/orders` de VTEX permite MAXIMO 30 páginas por filtro de fecha = 3.000 órdenes max por consulta.

Esto significa que el backfill VIEJO TAMBIEN estaba roto desde siempre — solo que tardaba muchísimo en chocar con el límite. Tomy reportaba históricamente que los backfills no funcionaban y terminaba cargando por CSV.

### Causa raíz
- Asumí que la API de VTEX permitía paginar indefinidamente con `?page=N`. Es lo más común en APIs paginadas.
- No leí docs de VTEX previamente para detectar limites.
- El bug solo se manifestaba con volumen real (>3.000 ordenes) que en testeos sintéticos nunca se alcanzaba.

### Regla
**Antes de implementar paginación contra una API externa, verificar EXPLÍCITAMENTE en la doc oficial:**
- ¿Hay límite de páginas máximo? (ej VTEX: 30)
- ¿Hay límite de items totales por consulta? (ej Shopify: 250 por request)
- ¿Hay APIs alternativas para volúmenes grandes? (bulk export, async insights, streaming)

**Si el endpoint es paginado, asumí que TIENE límite hasta que la doc te diga lo contrario.** Si tiene límite, usar **date-window pagination** desde el inicio:
- Dividir el rango total en ventanas chicas
- Paginar dentro de cada ventana hasta el límite
- Mover ventana cuando se agota

Pattern aplicado en `src/lib/backfill/processors/vtex-processor.ts`. Replicar en futuros processors (ML, Shopify, Tiendanube).

---

## Error #S55-RUNTIME-TRACE-MISSING — Validar solo con tsc/build sin tracear flow runtime

**Cuándo pasó**: Sesión 55. Pushé el primer fix del backfill (loop interno) confiando en que `tsc --noEmit + next build` validaban. El loop NO funcionaba — solo procesaba 1 chunk por invoke (el bug del cooldown de pickNextJob). Tomy lo descubrió al medir y me pidió: "valida porque la vez anterior validaste mal".

### Causa raíz
- tsc valida tipos. Build valida sintaxis y compilación.
- **NINGUNO valida lógica runtime**: race conditions, condiciones de break, interacciones entre módulos en tiempo de ejecución.
- Yo asumí que "compila OK" era suficiente para deployar a producción.

### Regla
**Cuando se toca lógica de control (loops, condicionales complejos, race conditions, interacciones async), agregar SIEMPRE un tercer paso de validación: TRACE MENTAL DEL FLOW.**

Antes de pushear, escribir explícitamente (puede ser solo en la cabeza pero detallado):
- Caso 1 — Flujo normal: ¿qué pasa en iter 0, 1, 2...?
- Caso 2 — Edge case del input vacío
- Caso 3 — Error mid-loop
- Caso 4 — Race condition con worker concurrente
- Caso 5 — Backwards compat con datos viejos
- Caso 6 — Cuando otro componente que llama a este se comporta inesperado

Si algún caso no tiene respuesta clara, **NO pushear** hasta cubrirlo con código o test.

Aplicado correctamente en el fix del loop (Sesión 55 commit `debd13b`) — se documentaron 6 casos antes de pushear y todos resultaron correctos en producción.

---

## Error #S55-COOLDOWN-VS-INTERNAL-LOOP — Mecanismo de seguridad anti-race compitiendo con loop interno propio

**Cuándo pasó**: Sesión 55. Implementé un loop interno en el runner del backfill para procesar varios chunks por invoke. La función `pickNextJob` tenía un cooldown de 2 minutos para evitar race conditions entre cron + waitUntil (legítimo). Pero ese cooldown bloqueaba al mismo runner cuando intentaba retomar el job que él mismo acababa de procesar — el loop solo procesaba 1 chunk y break.

### Causa raíz
- pickNextJob fue diseñado para resolver un problema específico (workers concurrentes compitiendo por el mismo job).
- El cooldown como "última escritura > 2 min ago" funcionaba para ese caso.
- Cuando agregué loop interno, el mismo worker volvió a llamar pickNextJob al instante → su propia lastChunkAt fresca lo bloqueaba.
- No previ que el mecanismo de seguridad antiRace se interpondría con uso legítimo del mismo worker.

### Regla
**Cuando una función tiene mecanismos de seguridad (cooldowns, locks, throttling), antes de llamarla en un nuevo contexto preguntar:**
1. ¿El nuevo contexto choca con la condición de seguridad? (ej: mismo worker reusando lock propio)
2. ¿La función debería distinguir entre uso "externo" (otro worker, otro request) vs "interno" (mismo flujo)?
3. ¿La solución es:
   - (a) bypassear el mecanismo desde el contexto interno (lo que hice), o
   - (b) refactorizar el mecanismo para que sea más fino (ej: lock por workerId, no por timestamp)?

Para casos puntuales de iteración interna, **(a) es aceptable y más simple**: tener una variable local del worker que mantiene el "ownership" del job y reutilizarla sin re-pickear hasta que complete.

Aplicado en commit `debd13b`: el runner ahora mantiene `currentJob` local y solo llama `pickNextJob` la primera vez o cuando el actual completa.

---

## Error #S54-OVERLAY-FALSIFIABLE — Confiar solo en un status enum para gating de UI sin chequear realidad

**Cuándo pasó**: Sesión 54. El OnboardingOverlay del producto decidia si mostrar o no el bloqueo en base SOLO al campo `status` del `onboarding_request`. Durante testeo con `debug-flip-my-test`, flipeé a status ACTIVE y el cliente entró al producto sin haber hecho NADA del onboarding (sin connections, sin backfill). Tomy detectó el bug: "no te deberia habilitar el producto hasta no terminar completamente el onboarding".

### Causa raíz
- Asumí que el `status` del onboarding_request era la única fuente de verdad.
- No considere que el status puede quedar inconsistente con la realidad por: bug, debug endpoint, edición manual en DB, migración mal hecha, race condition, etc.

### Regla
**Para gating crítico de UI (overlays bloqueantes, permisos, acceso a features pagas), NUNCA confiar en un solo status enum. Siempre chequear también la REALIDAD:**
- ¿Hay los recursos que deberían estar si el status fuera correcto? (connections ACTIVE, jobs completados, data presente)
- ¿Hay procesos en curso que deberían bloquear? (backfill jobs RUNNING/QUEUED, alerts pendientes)

Si cualquier señal real contradice el status, **fallar cerrado** (mantener bloqueado), no abrir.

### Ejemplo del fix
```ts
// MAL — solo mira status
if (onboarding.status === "ACTIVE") return { locked: false };

// BIEN — chequea realidad
const hasActiveConnections = await count("connections", { orgId, status: "ACTIVE" }) > 0;
const hasActiveBackfill = await count("backfill_jobs", { orgId, status: ["RUNNING", "QUEUED"] }) > 0;
if (onboarding.status === "ACTIVE" && hasActiveConnections && !hasActiveBackfill) {
  return { locked: false };
}
return { locked: true };
```

### Prevención
- Al armar gating/overlays, siempre listar 2-3 señales REALES que deben coincidir con el status declarado.
- Agregar `signals` al response del endpoint (diagnóstico) para poder debuggear facil por que esta bloqueado.

---

## Error #S54-FROM-HARDCODED — Email FROM hardcoded con dominio que no es del cliente

**Cuándo pasó**: Sesión 54. El codigo tenia `NitroSales <alertas@nitrosales.com>` hardcodeado como default de `RESEND_FROM`, pero el dominio real de Tomy es `nitrosales.ai` (.ai, no .com). Resend aceptaba los emails via API (devolvia `ok:true` con un ID), pero Gmail los rechazaba silencioso por SPF/DKIM fail — el dominio no tenia registros DNS porque Tomy nunca fue dueño de nitrosales.com.

Debug: endpoint de test reportaba OK pero emails no llegaban. Solo revisando el codigo encontramos el mismatch.

### Causa raíz
- Default hardcodeado sin verificar que el dominio existe y esta verificado en Resend.
- Resend no falla loud cuando manda desde dominio no verificado — solo silenciosamente el email no entrega.
- El debug inicial decia "todo OK" porque solo chequeaba el response de Resend, no la entrega efectiva.

### Regla
**Al configurar emails transaccionales en produccion, SIEMPRE:**
1. Verificar el dominio del FROM en el provider (Resend, SendGrid, etc.) con SPF/DKIM configurados
2. Confirmar que el dominio del FROM pertenece al cliente (no hardcodear dominios genericos)
3. Testear entrega real (abrir Gmail y verificar que llega al inbox, no solo que la API devuelva OK)
4. Considerar que providers como Gmail rechazan silencioso mails con DKIM fail — la API dice OK pero el mail nunca llega

### Prevención
- Agregar endpoint `/api/admin/debug-email-test` que testea envio real y deja claro el `resendFrom` que usa (ya implementado).
- Documentar en README/onboarding docs: "antes de mandar emails a clientes, verificar dominio en Resend y configurar DNS".
- Para nuevos clientes: usar un subdominio o dominio dedicado con SPF/DKIM desde el dia 1.

---

## Error #S54-REFACTOR-SIN-CONFIRMAR — Hacer refactor grande sin confirmar el plan con Tomy

**Cuándo pasó**: Sesión 54. Tomy pidio un flow hibrido (form corto + wizard adentro del producto en `/setup`). Implemente el refactor completo en ~2 horas (pagina `/setup`, layout, endpoint, etc.). Cuando le mostre a Tomy, cambio de estrategia: no queria `/setup` como URL separada, queria overlay DENTRO del producto. Borre todo el codigo de `/setup`.

No fue error en el codigo — fue error de proceso. 2 horas perdidas por no confirmar el plan antes.

### Causa raíz
- Interprete el pedido de Tomy como "implementa el flow hibrido" sin mostrar antes un mockup o diagrama de la experiencia.
- Tomy estaba pensando el flow desde la perspectiva UX, no desde la implementacion tecnica — y la diferencia clave (URL separada vs overlay) no era obvia para el desde mi descripcion.

### Regla
**Para refactors grandes (>2 archivos nuevos o >200 LOC nuevos):**
1. Describir el plan en 4-5 lineas ANTES de codear
2. Incluir: "X va a pasar desde Y a Z", "URL va a ser W", "visual es A o B"
3. Pedir "confirmame" explicito
4. Si la descripcion es ambigua (ej: "wizard dentro del producto" puede ser URL separada O overlay), listar las 2-3 opciones y preguntar

### Prevención
Antes de codear refactor grande, mostrar algo asi:
```
Plan:
1. Nueva ruta /setup (pagina full-screen con wizard)
2. Form publico /onboarding se acorta a solo datos de contacto
3. Cliente loguea y es redirigido a /setup si no completo
4. Desde /setup sale al producto al terminar

Confirmame que es esto o si preferis otra cosa (ej: overlay DENTRO del producto en la misma URL).
```

Si hubiera hecho esto, Tomy habria dicho "no, overlay en misma URL" en 2 minutos en vez de descubrirlo 2 horas despues.

---

## Error #S53-VTEX-HOOKS-TWO-MECHANISMS — Asumir que los webhooks de VTEX estan todos en la UI de Admin

**Cuándo pasó**: Sesión 53, cerrando BP-MT-OPS-001. Asumí inicialmente que todos los webhooks de VTEX estaban en un solo lugar de la UI. Tomy tambien recordaba "haberlos configurado en el admin". Pero al buscar encontramos solo 1 de los 2 (el de inventory, en Afiliados). Después de revisar código, docs y confirmar via API, descubrí que VTEX tiene DOS mecanismos separados:

1. **Afiliados** (Admin → Configuracion de la tienda → Pedidos → Configuracion → tab Afiliados) — TIENE UI. Cada afiliado tiene un "Endpoint de busca". Maneja eventos de SKU/inventory principalmente.
2. **Orders Broadcaster** (`POST /api/orders/hook/config`) — **NO TIENE UI**. Solo API. Maneja cambios de estado de ordenes (order-created, payment-approved, invoiced, etc.).

### Causa raíz
- Asumí paridad entre UI y totalidad de features. Error tipico: "si tiene UI para A, tiene UI para todo".
- La doc de VTEX está fragmentada y no deja claro que son 2 mecanismos separados.

### Regla
**Para onboarding / auditoria de webhooks en plataformas externas (VTEX, MELI, Shopify, etc.), SIEMPRE chequear via API además de la UI.** No basta con la UI del admin.

Para VTEX específicamente, siempre correr estos 2 curls al inicio:
```bash
# Lista Afiliados (orders API si existe en UI)
curl -H "X-VTEX-API-AppKey: $KEY" -H "X-VTEX-API-AppToken: $TOKEN" \
  "https://{account}.vtexcommercestable.com.br/api/checkout/pvt/configuration/orderForm/affiliates"

# Lista Orders Broadcaster (API-only, NO aparece en UI)
curl -H "X-VTEX-API-AppKey: $KEY" -H "X-VTEX-API-AppToken: $TOKEN" \
  "https://{account}.vtexcommercestable.com.br/api/orders/hook/config"
```

El segundo es el que uno olvida. Si devuelve un objeto con `hook.url`, hay un webhook de orders configurado via API que **no aparece** en la UI.

### Prevención
- Al onboardear cualquier cliente VTEX, incluir en checklist: "lista hooks via ambos endpoints"
- Documentar en el runbook de onboarding que el Orders Broadcaster es API-only
- Agregado a MEMORY.md como patron crítico multi-tenant

---

## Error #S53-PROD-CHANGES-SIN-DRY-RUN — Ejecutar cambios en producción externa sin checklist ni dry-run

**Cuándo pasó**: Sesión 53. Inicialmente propuse a Tomy "ejecutar el PUT para actualizar el webhook VTEX" con un plan de 4 pasos simples. Tomy (con razón) me frenó 3 veces pidiendo análisis más profundo. Me llamó la atención explícita: *"necesito que seas más quirúrgico y minucioso"*.

Tras la tercera iteración terminé con un plan robusto que incluyó:
- Checklist de 7 puntos pre-ejecución
- Dry-run idempotente (POST con config actual sin cambios) para validar creds + payload
- Rollback payload listo
- Verificación end-to-end triggerendo con data real (orden real de hace 2 min)

Esto debería haber sido el plan DESDE el inicio, no después de que Tomy me lo exigiera 3 veces.

### Causa raíz
- Confundí "acción reversible en minutos" con "acción de bajo riesgo justificando plan simple"
- No internalicé que producción externa (VTEX, MELI, etc.) merece el mismo nivel de cuidado que producción propia (DB)
- Tomy es founder no técnico — mi trabajo es proteger su plataforma con el máximo rigor, no optimizar para velocidad

### Regla
**Para cualquier cambio en config de sistema externo en prod (VTEX, MELI, Meta, Google, GA4, Resend, etc.), ejecutar este checklist MÍNIMO de 7 puntos ANTES de cualquier POST/PUT/DELETE:**

1. **Código receptor deployado**: ¿el codigo que va a recibir el nuevo shape YA está en `origin/main`? (verificar con `git merge-base --is-ancestor <commit> origin/main`)
2. **Fallback en código propio**: ¿si llega payload viejo durante la ventana, el código no crashea?
3. **Atomicidad en el sistema externo**: ¿el POST/PUT reemplaza config de manera atómica (sin half-applied state)?
4. **Backup capturado**: ¿tengo la config actual guardada byte a byte para rollback?
5. **Rollback en un comando**: ¿tengo el curl exacto para volver al estado previo?
6. **Red de seguridad secundaria**: ¿hay cron nocturno / reintentos / data persistida en el sistema externo que garantice recuperación aunque el cambio falle?
7. **Dry-run idempotente**: ¿puedo probar las credenciales de escritura enviando la config ACTUAL (idéntica) antes del cambio real?

Solo tras PASAR los 7 puntos, ejecutar el cambio real + GET verificación + test end-to-end con data real.

**Patron DRY-RUN**: el dry-run es un POST con la config actual (sin cambios). Si devuelve 2xx, probamos que:
- Credenciales tienen permiso de escritura ✅
- Payload es aceptado por el endpoint ✅
- No cambió nada (idempotente) ✅

Solo después del dry-run exitoso, ejecutar el cambio real.

**Patrón TEST END-TO-END**: no conformarse con "HTTP 200 en el save". Triggerear el flujo completo con data real:
- Para webhooks: simular el webhook con un orderId REAL reciente
- Para API keys: hacer una llamada real al endpoint protegido
- Para DB migrations: correr una query de ejemplo que use el schema nuevo

Solo si el pipeline COMPLETO procesa correctamente, confirmar éxito.

### Prevención
- Agregado a MEMORY.md como patron crítico para cambios en prod externa
- En sesiones futuras, si Tomy menciona "quirúrgico", "cero margen de error", "minucioso" — arrancar DIRECTO con el checklist de 7 puntos sin esperar que me lo pida

---

## Error #S52-FINDFIRST-SIN-ORGID — findFirst sin scoping de organizationId (multi-tenant unsafe)

**Cuándo pasó**: Sesión 52, auditoría multi-tenant profunda. Encontré 21 endpoints/funciones que usaban `prisma.X.findFirst({ where: { platform: "..." } })` SIN incluir `organizationId` en el where. Todos funcionaban perfecto en single-tenant (1 sola org en DB) pero habrían causado data leak silencioso el día que se cree la 2da org (Arredo). Específicamente:
- `getSellerToken()` devolvía el token de cualquier conn ML
- Webhooks VTEX podían procesar órdenes en la org equivocada
- Endpoints de páginas ML (dashboard, reputacion, preguntas, publicaciones) usaban findFirst para resolver orgId en vez de tomarlo de session
- Admin endpoints (fix-brands, etc) tenían orgId hardcoded o default a org específica

### Causa raíz
- En single-tenant no hay penalty — siempre hay solo 1 conn VTEX/ML/etc, así que findFirst siempre devuelve la correcta.
- Dev diario no expone el bug → se propaga por meses.
- El bug se manifiesta EL DÍA que se crea la 2da org y ya es tarde (data mezclada silenciosamente).

### Regla
**En cualquier query que busque entidades scopeadas a org (Connection, Product, Order, Customer, Alert, etc.), SIEMPRE incluir `organizationId` en el WHERE.** Si no hay orgId en scope, resolverlo explícitamente antes:
- Endpoints autenticados: `const orgId = await getOrganizationId()` desde session
- Endpoints públicos (webhooks): resolver por identifier único del payload (mlUserId, accountName, etc.) o query param `?org=`
- Endpoints admin sin session: query param `?org=` explícito

```ts
// ✅ BIEN
const orgId = await getOrganizationId();
const connection = await prisma.connection.findFirst({
  where: { platform: "MERCADOLIBRE" as any, organizationId: orgId },
});

// ❌ MAL (multi-tenant unsafe)
const connection = await prisma.connection.findFirst({
  where: { platform: "MERCADOLIBRE" as any },
});
```

**Antipatrón adicional**: `const orgId = connection.organizationId` **después** del findFirst. Esto es circular — ya usaste la conn de org equivocada.

**Ver también**: patrón de fallback condicional en auth-guard para casos transicionales single→multi.

---

## Error #S52-AUDITORIA-UN-SOLO-PASE — Auditorías de seguridad de un solo pase son insuficientes

**Cuándo pasó**: Sesión 52. Primer pase de auditoría multi-tenant encontró 13 hallazgos. Tomy pidió auditoría profunda PRE-MERGE para "cero margen de error". Segundo pase encontró **8 bugs adicionales** que se habían escapado del pase inicial. Si hubiera mergeado con solo el pase 1, esos 8 bugs habrían llegado a producción.

### Causa raíz
- Primer pase usa queries amplias (Agent Explore) que cubren los casos obvios pero miss patterns específicos.
- Los bugs multi-tenant son sutiles: no rompen tsc, no rompen en single-tenant, no se ven en testing visual.
- Exceso de confianza post-primer pase = tentación de mergear sin segundo review.

### Regla
**Para cambios sistémicos críticos (multi-tenant, auth, permisos, pagos), SIEMPRE hacer 2 pases de auditoría antes de mergear:**

**Pase 1 (amplio)**: Agent Explore o similar — lista amplia de hallazgos.
**Pase 2 (profundo, pre-merge)**: greps específicos con patterns exactos:
- `platform:\s*"X"` sin `organizationId`
- `updateMany\(` / `deleteMany\(` sin filter de org
- `organization\.findFirst\(\)` sin filter
- `const ORG_ID = env \|\| "hardcoded"`
- Hardcoded IDs literales del cliente actual

El pase 2 típicamente descubre **~50% más bugs** que el pase 1. Si no se hace, esos bugs llegan a producción.

**Regla adicional — branch preview pre-merge**: para cambios críticos, usar branch + preview URL de Vercel + validación user antes de merge a main. NO es violación de la "solo main" rule si el user lo autoriza explícitamente.

**Señal de alarma**: si pensaste "ya está todo cubierto, mergeo" tras el primer pase → hacé el pase 2 igual. Toma 30 minutos extra, previene data leak silencioso en producción.

---

## Error #S51-SCHEDULE-EVERY-OPEN — Schedules disparaban cada apertura de /alertas

**Cuándo pasó**: Sesión 51, mientras leía `engine.ts` para implementar el cron `/api/cron/alerts-scheduler`. Descubrí que la función `evaluateRule` para reglas type=schedule llamaba `primitive.evaluate()` y actualizaba `lastFiredAt` cada vez que se ejecutaba — sin chequear si `nextFireAt` ya había llegado. Resultado: **cada vez que el user abría `/alertas`, todas las schedules disparaban de nuevo**, generando "alertas múltiples" silenciosamente. El bug existía desde la implementación original del rules engine en S50 (commit `59e7879`) y nunca se detectó por QA visual porque el síntoma era "alerta aparece" (correcto en superficie, multiplicado en realidad).

### Causa raíz
- La logica original chequeaba cooldown solo para `type='condition'`, pero para `type='schedule'` ejecutaba sin guardas.
- Solo se actualizaba `lastFiredAt`, nunca se actualizaba `nextFireAt` después de disparar — entonces el campo quedaba "huérfano" y el motor no tenía forma de saber cuándo volver a disparar.
- QA visual no detectaba el bug porque la UI agrupaba o deduplicaba alertas similares al renderizar.
- El bug solo se hacía visible si: (a) abrías `/alertas` 10 veces seguidas y mirabas DB; o (b) tenías email activo y te llegaban N emails por apertura.

### Regla
**Para cualquier feature que tenga "ejecutar en horarios programados" (schedules, cron jobs, scheduled emails, etc.), el motor DEBE chequear:**
1. **dueNow**: ¿`nextFireAt` ya llegó o nunca disparó?
2. **recentlyFired**: ¿está dentro de la ventana de visibilidad (ej: 24h) para mostrar el último resultado sin re-ejecutar?
3. **silencio**: si no es ni A ni B, NO ejecutar.

Y al disparar, **actualizar TANTO `lastFiredAt` COMO `nextFireAt = compute(schedule)`** — nunca uno sin el otro.

```ts
// ✅ BIEN
if (rule.type === "schedule") {
  const dueNow = !nextFireAt || nextFireAt <= now;
  const recentlyFired = lastFiredAt && now - lastFiredAt < 24 * 3600 * 1000;
  if (dueNow) { /* fire + update both timestamps */ }
  else if (recentlyFired) { /* show without re-firing */ }
  else return null; // silencio
}
```

**Antipatrón**:
```ts
// ❌ MAL — dispara cada vez sin chequear nextFireAt
const result = await primitive.evaluate(...);
await prisma.$executeRaw`UPDATE alert_rules SET lastFiredAt = NOW() WHERE id = ${rule.id}`;
// nextFireAt nunca se actualiza
```

**Conexión con #S24-L2-METASYNC**: cuando tocás un sistema existente para agregar features nuevas, REVISAR la lógica existente. El QA visual no detecta bugs sutiles de comportamiento — solo bugs visibles. Si vas a tocar el motor para agregar el cron, primero verificá que el motor actual hace lo que DEBE hacer.

**Detección preventiva**: cuando agregues un campo "schedule" o "nextFireAt" al schema, agregar un test mental: "si llamo evaluateRule 2 veces seguidas, ¿lastFiredAt cambia solo la primera vez?".

---

## Error #S51-MAX-TOKENS-TRUNCATION — Tool exitosa pero reply truncado sin fallback informativo

**Cuándo pasó**: Sesión 51. Tomy probó crear una regla desde el FloatingAurum (bubble lateral, modelo Haiku con `max_tokens=600`). La tool `create_alert_rule` ejecutó correctamente y guardó la regla en DB, pero Haiku se quedó sin tokens al generar el mensaje de cierre. El loop salió sin `finalReply` y el código mostraba el fallback genérico "No pude generar una respuesta. Probá de nuevo." — engañando al user a creer que la regla NO se había creado, cuando en realidad SÍ. Tomy intentó de nuevo y el dedupe saltó: "ya tenés una regla así". Solo ahí supo que la primera había funcionado.

### Causa raíz
- `max_tokens=600` en `/api/aurum/section-insight` era suficiente para insight inicial / pregunta puntual, pero NO para tool-use loop con tool inputs largos + texto de cierre.
- El loop salía con `finalReply = ""` y caía al fallback `"No pude generar una respuesta"` que no diferenciaba entre "el modelo no genero nada" y "el modelo ejecuto una tool con éxito pero no pudo generar el mensaje de cierre".
- El usuario creía que el sistema fallaba cuando en realidad la operación se había completado exitosamente.

### Regla
**Para cualquier tool-use loop con riesgo de truncation por max_tokens, implementar dos defensas combinadas:**

1. **Subir max_tokens** a un margen suficiente (1500+ para Haiku con tools complejas, 4000+ para Sonnet).
2. **Tracking de "última tool exitosa"** durante el loop — si el modelo se queda sin tokens al final, generar el reply manualmente basado en qué tool ejecutó:

```ts
let lastSuccessfulTool: { name: string; resultText: string } | null = null;

for (let round = 0; round < MAX_ROUNDS; round++) {
  // ... ejecutar tools ...
  for (const tool of toolUseBlocks) {
    const result = await executeTool(tool.name, tool.input, ctx);
    if (result.startsWith("OK ")) {
      lastSuccessfulTool = { name: tool.name, resultText: result };
    }
  }
}

// Fallback inteligente:
if (!finalReply && lastSuccessfulTool) {
  if (lastSuccessfulTool.name === "create_xxx") {
    finalReply = "✓ Listo, X creada con éxito.";
  }
  // ... otros casos por tool
}
```

**Antipatrón**:
```ts
// ❌ MAL — fallback genérico que engaña al user
if (!finalReply) finalReply = "No pude generar una respuesta. Probá de nuevo.";
```

**Señal de alarma**: si el user reporta que "intenté X 2 veces y la segunda dijo que ya existía", probablemente la primera ejecución exitosa quedó "tapada" por un fallback genérico.

**Conexión con #S49-SILENT-FETCH-FAIL**: ambos errores son la misma familia — el sistema hace algo correctamente pero la capa de presentación no comunica el resultado real al user. Lesson general: **el feedback al user debe reflejar el estado real del sistema, no el estado de "completé bien la generación de texto"**.

---

## Error #S51-DESCARTAR-COMO-REDUNDANTE — Descartar feature sin evaluar costos operativos reales

**Cuándo pasó**: Sesión 51. Yo había marcado la **Fase 8g-3c (Wizard de creación de reglas desde formulario)** como "redundante con Aurum chat — bajo valor" en mi planificación. Razonamiento: "si Aurum chat ya hace lo mismo y mejor, ¿para qué duplicar?". Tomy lo pidió expresamente más tarde con dos razones que yo no había considerado:
1. **Costo operativo de tokens**: cada creación via Aurum gasta ~3K tokens (descubrimiento + propuesta + creación). Wizard form gasta 0 tokens.
2. **Preferencia UX**: muchos users prefieren forms guiados sobre chat, especialmente para configuración previsible.

### Causa raíz
Yo evalué solo 1 dimensión: **costo de implementación duplicado** ("ya tenemos esto en Aurum, no hace falta hacerlo dos veces"). Ignoré:
- **Costo operativo**: cada feature delegada solo a Aurum tiene un costo recurrente en tokens que escala con uso.
- **Preferencia UX por segmento**: no todos los users prefieren chat. Hay perfiles operativos no técnicos que prefieren forms.
- **Costo de mantenimiento futuro**: el wizard reusa subcomponentes del EditDrawer (Field/Section/ParamField/etc) — implementarlo realmente costó pocas líneas extra.

### Regla
**Cuando descarte una feature como "redundante", evaluar 4 dimensiones antes de marcarla como bajo valor:**

1. **Costo de implementación**: ¿cuántas líneas, cuánto reuso?
2. **Costo operativo recurrente**: ¿la otra forma tiene costo por uso (tokens, llamadas API, etc.)?
3. **Preferencia UX por segmento**: ¿hay users que prefieren la otra modalidad?
4. **Costo de mantenimiento**: ¿la duplicación realmente lo es, o son features complementarias que comparten core?

Si dudás en alguna, **preguntar al user antes de descartar**. La pregunta más útil es: "veo que esto es similar a X que ya tenemos. ¿Te parece valioso tener ambos o lo dejamos solo X?".

**Antipatrón**:
```
"8g-3c Wizard crear desde UI: redundante con Aurum chat. BAJO valor."
```

**Patrón correcto**:
```
"8g-3c Wizard crear desde UI: complementa a Aurum chat con form previsible
+ ahorra ~3K tokens por creación. Trade-off: preguntarle a Tomy si valora
estos beneficios sobre el costo de implementación (~1-2 hs)."
```

**Señal de alarma**: si Tomy te pide algo que ya habías marcado como "redundante / bajo valor", reflexioná sobre qué dimensión te perdiste. Casi siempre es una de las 4 de arriba.

---

## Error #S49-JWT-STALE-TOKEN — Confiar en session.user.id sin fallback por email

**Cuándo pasó**: Sesión 49, Fase 8e Alertas. Creé `/api/alerts/read` POST/DELETE + `/api/alerts/favorite` POST/DELETE usando `(session?.user as any)?.id ?? null` para obtener el userId. El user marcaba alertas como leídas pero al refrescar volvían como no leídas + el badge externo no bajaba. Diagnostico: visitando GET `/api/alerts/read` devolvia `{"error":"No autenticado","userId":null}`. Causa: el JWT de Tomy fue emitido antes de que se agregara `token.id = user.id` en el callback de NextAuth en sesiones anteriores. Los tokens JWT viejos no se actualizan hasta logout+login explicito, asi que `session.user.id` venia undefined para ese user aun estando logueado.

### Causa raíz
- Cuando se agrega un campo nuevo al token JWT callback, los usuarios con sesiones activas mantienen sus tokens viejos sin ese campo hasta logout.
- Confie en `session.user.id` como si fuera siempre truthy, sin considerar el escenario JWT stale.
- El fallo era silencioso: el POST devolvia 401 pero el client ignoraba `res.ok`, haciendo optimistic UI local que parecia funcionar pero nada persistia en DB.
- `getUserReads()` en alert-hub recibia `userId=null` y devolvia Set vacio, asi que el GET `/api/alerts` tampoco marcaba ninguna alerta como leida → estado inconsistente multi-capa.

### Regla
**Nunca confiar en `session.user.id` directo. Usar siempre el patron "email-first con lookup en DB" que usa `permission-guard.ts` (ya probado productivo)**:

```ts
export async function getSessionUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  // 1. Preferir session.user.id si existe (mas rapido)
  const idFromSession = (session?.user as any)?.id;
  if (idFromSession) return idFromSession;
  // 2. Fallback por email (SIEMPRE expuesto por NextAuth)
  const email = session?.user?.email;
  if (!email) return null;
  const user = await prisma.user.findUnique({
    where: { email }, select: { id: true },
  });
  return user?.id ?? null;
}
```

Este helper vive en `src/lib/alerts/get-user-id.ts` y debe usarse en cualquier endpoint nuevo que resuelva userId desde sesion.

**Antipatrón**:
```ts
// ❌ MAL — falla para tokens viejos
async function getUserId() {
  const session = await getServerSession(authOptions);
  return (session?.user as any)?.id ?? null;
}
```

**Señal de alarma**: si un feature "funciona en la sesion pero no persiste al refrescar" o "funciona en test nuevo pero no en user viejo", chequear primero si el endpoint depende de `session.user.id`. Probablemente JWT stale.

---

## Error #S49-SILENT-FETCH-FAIL — Client-side fetch sin check de res.ok silencia bugs criticos

**Cuándo pasó**: Sesión 49. En `setAlertRead` del page.tsx use `try { await fetch(...) } catch { rollback }`. El try/catch solo captura errores de red (fetch rejected). Si el servidor devolvia 401 o 500, `fetch` resolvia OK y el codigo continuaba como si el write hubiera exitoso. Resultado: optimistic UI local funcionaba pero nada persistia en DB, y el user no tenia forma de saberlo (solo al refrescar veia que volvia todo atras). Tomy reporto el problema 2 veces antes de que identificaramos el root cause.

### Causa raíz
- `fetch` solo rechaza en errores de red/CORS. Status codes 4xx/5xx NO hacen reject.
- El try/catch daba sensacion de estar manejando errores cuando en realidad solo capturaba una fraccion.
- Sin surfacing visible al user (console.error a secas no le sirve a un user no-tecnico) los 401/500 pasaban desapercibidos.

### Regla
**En cualquier fetch client-side con efectos de DB persistentes (POST/PUT/DELETE), chequear SIEMPRE `res.ok` y mostrar banner/toast visible al user cuando falla**:

```ts
// ✅ BIEN
const res = await fetch("/api/x", { method: "POST", ... });
if (!res.ok) {
  const errText = await res.text().catch(() => "");
  console.error(`[feature] fallo (${res.status})`, errText);
  setWarning(`No se pudo guardar (HTTP ${res.status}). ${errText.slice(0, 200)}`);
  // rollback del optimistic UI
  return;
}
// ok: pingBadgeRefresh o lo que corresponda
```

**Antipatrón**:
```ts
// ❌ MAL — el servidor puede devolver 401/500 y el catch no se entera
try {
  await fetch("/api/x", { method: "POST" });
  // continua como si exitoso
} catch {
  // rollback solo si red fallo
}
```

**Regla adicional — banner transitorio**: cuando falla un write, mostrar un banner rojo con el HTTP status exacto + primeros 200 chars del body del error. Auto-dismiss 8s. Esto:
- Surfacea inmediatamente el bug al user no-tecnico (no hace falta devtools).
- Permite diagnosticar HTTP status: 401 = autenticacion, 403 = permisos, 500 = server error.
- Si el user reporta "tal cosa no persiste", pedirle que nos mande el banner.

**GET de diagnostico**: para features multi-capa (client → API → DB), crear un endpoint GET de diagnostico que devuelve el estado actual en DB del user logueado (ej: `GET /api/alerts/read` devuelve `{userId, totalReads, recentReads}`). El user puede visitarlo desde el browser y mandarme el JSON, sin necesidad de saber devtools.

---

## Error #S30-AURUM-HALO — Asumir que entendi el feedback visual sin verificar con el usuario

**Cuándo pasó**: Sesión 30. Tomy comparte screenshot del orb Aurum con anillo Saturno y dice _"la aurora alrededor de la bola está mal diseñada porque se ve la parte que no se debería ver"_. Yo interpreto que habla del halo EXTERIOR de la burbuja y arreglo eso (reemplazo blur div por box-shadow + overflow:hidden). Tomy vuelve con el MISMO screenshot: _"no es que el halo está por fuera de la parte oscura, sino que el halo no da el efecto de que está alrededor del círculo, porque la parte de atrás del halo está por delante del círculo dorado. Fijate bien profundamente"_. Recién ahí entendí que hablaba del anillo Saturno y su oclusión 3D (la mitad de atrás del anillo tenía que pasar detrás de la esfera, no en frente).

### Causa raíz
- Palabra ambigua ("aurora" / "halo") tiene varios candidatos visuales en la UI (halo exterior de la burbuja, anillo del orb, glow interno). Elegí el primero que se me ocurrió sin preguntar.
- No le pedí a Tomy que señalara o describiera más específico antes de hacer el cambio.

### Regla
**Cuando el feedback visual es ambiguo y hay múltiples candidatos en la imagen, NO asumir: pedir clarificación.** Preguntas válidas: "¿te referís al halo exterior de la burbuja, al anillo alrededor del orb, o al glow interno?". O mandar una anotación pidiendo que marque en el screenshot.

**Señal de alarma**: si Tomy comparte el MISMO screenshot dos veces, casi siempre es porque no entendí el feedback la primera vez.

---

## Error #S27-REBUILD — Rediseñar seccion entera sin pedido explicito

**Cuándo pasó**: Sesión 27. En el marco de rebuilding `/campaigns/google` (que SÍ estaba pedido), tambien reescribi el **Overview** de `/campaigns` desde cero con una estructura nueva (cards + jerarquia distinta). Tomy reaccionó: _"restauralo tal cual estaba"_ → commit `4e43d4f` de revert.

### Causa raíz
- Scope creep: estaba "en zona" tocando `/campaigns` y decidí que el Overview "tambien podía mejorar". Tomy no lo pidió.
- Confundí "rebuild de /campaigns/google" (pedido explícito) con "rebuild de /campaigns entero" (no pedido).

### Regla
**Cambios estructurales / rewrites de secciones existentes requieren pedido EXPLICITO.** Si estoy tocando una seccion y veo algo "que se podría mejorar" afuera del scope pedido, **primero preguntar** antes de tocarlo. Un commit revertido es peor que un commit no escrito.

**Antipatrón**: "ya que estoy acá, aprovecho y mejoro también X". Casi siempre termina en revert.

---

## Error #S25-CRONS-PREMATUROS — Agregar crons multi-tenant cuando no hace falta

**Cuándo pasó**: Sesión 25. Agregué crons horarios/diarios multi-tenant para syncar Meta y Google Ads de todas las orgs activas. A la hora volví a revertir a on-demand porque:
- Hay 1 org activa (no es multi-tenant real todavía).
- Los crons consumían API quota de Meta y Google sin beneficio (el usuario abre `/campaigns/*` y el sync on-demand dispara con `waitUntil` via `useSyncStatus`).
- CLAUDE.md ya indicaba sync on-demand para ads (modelo decidido en S17+).

### Causa raíz
- No consulté CLAUDE.md antes de meter mano en la arquitectura de sync (la tabla del modelo de sync ya decía "on-demand" para Meta/Google).
- Asumí que "mejor fresco" era universalmente bueno, sin evaluar costo (API quota) ni beneficio real (¿quién necesita datos frescos a las 3am si nadie está mirando?).

### Regla
**Antes de cambiar la arquitectura de sync, leer la tabla en CLAUDE.md ("Modelo de sync de datos").** Si ya hay una decisión documentada y quiero cambiarla, preguntarle a Tomy PRIMERO con la justificación.

**Criterio para crons vs on-demand**:
- Usuario abre la pagina y necesita datos → on-demand.
- Hay multi-tenant real y los datos tienen que estar frescos aunque nadie mire → crons.
- Hoy (1 org): on-demand gana siempre.

---

## Error #S23-META-VIDEO-FIELDS — Pedir fields en el endpoint equivocado de Meta

**Cuándo pasó**: Sesión 23. Para resolver el video de un creative Meta, pedí `effective_object_story_id` como campo del `/ads` endpoint de Meta Marketing API. Meta devolvía error: ese campo solo vive en `/adcreatives`, no en `/ads`. Además intentaba leer `video_source.source_url` con el user access token, que Meta rechaza — solo `META_PAGE_ACCESS_TOKEN` (el token de la page owner del video) tiene permiso para ese campo.

### Causa raíz
- Mezclé fields de entidades distintas en Meta (Ad vs AdCreative vs Video). Cada entidad tiene su propio set de fields válidos.
- Usé el token por default (user token) sin chequear qué token requiere cada campo específico.

### Regla
**Cuando un call a Meta Marketing API falla por campo inválido**:
1. Primero confirmar en qué entidad vive ese campo (`/ads`, `/adcreatives`, `/videos`, `/adsets`, `/adaccounts`).
2. Chequear qué token-scope requiere el campo (user token vs page token vs system user).
3. `video_source.source_url` en particular: SIEMPRE requiere `META_PAGE_ACCESS_TOKEN` de la page que posee el video.

**Patron de fallback util**: permalink embed de Facebook (`https://www.facebook.com/.../videos/{id}`) funciona siempre sin requerir source_url → siempre tenerlo como backup confiable cuando el source_url es opcional.

---

## Error #S24-L2-METASYNC — Debuggear en UI lo que en realidad era bug en la ingesta

**Cuándo pasó**: Sesión 24. El drilldown L2 (AdSet detail) del Creativos Lab venía vacío para muchos adsets. Invertí 8+ commits intentando fixes en la UI / query / fallbacks:
- Fetch dedicado por adSet (`165bfbd`)
- Endpoint `/by-adset` (`4ff2d51`)
- Fallback a galleryCreatives filtrado (`abdd9d2`)
- Debug logging (`6697e57`)
- Fallback a campaña padre (`e694d0b`)
- No duplicar con multi-adsets (`50c97d9`)

Recién en el commit `188749a` identifiqué el **root cause real**: el sync de Meta **no estaba linkeando** `AdCreative -> AdSet` al upsertear. Sin ese link, cualquier query "creativos por adSet" iba a devolver vacío, no importa qué fallback tuviera.

### Causa raíz
- Cuando algo viene vacío de la DB, mi primer instinto fue "hagamos más fallbacks en el read path" en vez de "verifiquemos que la ingesta esté guardando el link correctamente".
- No corrí una query directa a Prisma tipo `AdCreative.findMany({ where: { adSetId: { not: null } } })` para ver si el campo estaba poblado. Si lo hubiera hecho, hubiera visto en 30 segundos que `adSetId` estaba null en casi todos los records.

### Regla
**Cuando un drilldown / filtro / relación venga vacío, el paso #1 es verificar que el DATO EXISTE en la DB con la relación esperada.** Query directa:
```ts
await prisma.adCreative.findMany({ where: { adSetId: { not: null } }, take: 5 })
```

**Si la relación no existe en la DB, arreglar la INGESTA primero. Después pensar en fallbacks del read-path.**

**Antipatrón**: agregar capas de fallback en el read-path para compensar un bug de la ingesta. Se vuelve código zombi imposible de mantener.

**Conexion con Error #S22-A**: misma regla. Siempre arreglar en la fuente de los datos primero.

---

## Error #NUEVO-S22-F — Pasar comandos con paths placeholder + asumir binarios locales

**Cuándo pasó**: Sesión 22 (Fase 1 de /campaigns). Le pasé a Tomy dos versiones del mismo flujo de git:

1. **Versión encadenada con `&&`**:
```
cd ~/path/a/nitrosales && git checkout main && git pull origin main && ./node_modules/.bin/tsc --noEmit && git add 'src/app/(app)/campaigns/page.tsx' && git commit -m "..." && git push origin main
```

2. **Versión multilínea** (los mismos comandos uno por uno).

**Qué pasó**: la encadenada falló en el primer paso (`cd: no such file or directory: /Users/tomylapidus/path/a/nitrosales`). El `&&` cortó toda la cadena → no se ejecutó nada más. La multilínea "funcionó" porque Tomy ya estaba en el directorio correcto, así que el `cd` falló de manera silenciosa pero los siguientes comandos corrieron en el cwd actual igual.

Además, `./node_modules/.bin/tsc` también tiró `zsh: no such file or directory` — ese binario no existe en su setup. En la encadenada hubiera cortado todo; en la multilínea pasó al siguiente comando sin drama.

**Reacción de Tomy**: identificó que mi explicación inicial sobre por qué falló estaba mal y me hizo revisarlo. Tenía razón.

### Causa raíz de mi error
- Usé un path **placeholder** (`~/path/a/nitrosales`) en un comando que el usuario iba a pegar literal. Para un usuario no técnico, "reemplazá esto" es fricción innecesaria y fuente de errores.
- Asumí que `./node_modules/.bin/tsc` existía en su máquina sin verificarlo (en sesiones anteriores ya había aprendido que `npx tsc` instala el paquete equivocado, pero no documenté cuál es la alternativa segura).
- Al combinar ambos errores en un comando con `&&`, el primer fallo cortó todo y el comando se volvió inútil.

### Regla
**Comandos para que Tomy pegue en su terminal:**
1. **NO usar paths placeholder** (`~/path/a/...`, `~/proyecto/...`). Si el path real no es conocido, **omitir el `cd`** y asumir que está en el repo. En el peor caso, decirle "asegurate de estar en el repo antes de pegar esto".
2. **NO referenciar binarios locales con paths como `./node_modules/.bin/tsc`** sin haber confirmado que existen. Alternativa segura: si Vercel valida el build, **saltar el `tsc --noEmit` local** y confiar en el build de Vercel para el deploy preview.
3. **Por defecto: comandos multilínea** (uno por línea, sin `&&`). Son más tolerantes a fallos parciales y permiten al usuario ver qué pasó en cada paso.
4. **Solo usar `&&`** cuando esté 100% seguro de que cada paso va a funcionar (rara vez).
5. **Quotear paths con paréntesis con comillas simples**: `'src/app/(app)/campaigns/page.tsx'` en lugar de `src/app/\(app\)/campaigns/page.tsx`. Más legible y robusto en zsh.

### Comando estándar de push (locked) para futuras sesiones
```
git status
git diff --stat 'src/app/(app)/campaigns/page.tsx'
git add 'src/app/(app)/campaigns/page.tsx'
git commit -m "mensaje"
git push origin main
```
Sin `cd`, sin `tsc` local, sin `&&`. Asumir que Tomy está en el repo. La validación de TS la hace Vercel en el deploy.

---

## Error #NUEVO-S22-A — Proponer backfill cuando el problema está en la ingesta

**Cuándo pasó**: Sesión 22. Tomy notó que productos en Stock Muerto mostraban el placeholder "MO" (iniciales) en vez de foto. Armé un endpoint `/api/backfill/product-images` que iba a VTEX/MELI a traer imágenes para productos con `imageUrl=NULL`.

**Reacción de Tomy (verbatim)**: _"No quiero resolverlo con syncs, me parece inescalable los syncs. Las imagenes tienen que tomarse bien de la plataforma"_.

**Causa raíz de mi error**: Tomé el camino fácil (backfill reactivo) en vez de arreglar el bug de ingesta. El webhook de órdenes VTEX creaba productos con `imageUrl: null` cuando el payload no la traía, y eso quedaba así para siempre.

### Regla
**Si un dato está mal o falta en la DB, primero investigar DÓNDE se está capturando en la ingesta y arreglarlo ahí.** Los backfills son un parche reactivo que hay que correr de por vida. El fix correcto va en webhooks y syncs — que tomen el dato completo de la fuente en el momento en que entra al sistema.

**Antipatrón**: `/api/backfill/X` para completar datos que deberían haber entrado bien desde el principio.
**Patrón correcto**: modificar el webhook/sync para que, si un campo crítico viene vacío, lo pida a la API de la plataforma en el mismo flujo de ingesta.

**Ejemplo aplicado**: webhook VTEX orders ahora llama a `/api/catalog_system/pvt/sku/stockkeepingunitbyid/{id}` si el payload no trae imageUrl → captura la imagen en la fuente.

---

## Error #NUEVO-S22-B — Tablas oscuras para analizar datos

**Cuándo pasó**: Sesión 22. Para dar "look premium" a las tablas de Stock Muerto y Alerta de Quiebre, las diseñé con tema oscuro (slate-900 gradiente, amber/gold accents).

**Reacción de Tomy (verbatim)**: _"No me gustó que hayas hecho las tablas en oscuro. Para analizar datos me gusta siempre claro. Yo me refería a poner algun icono de alerta animado que luzca bien premium. Y mantener la tabla clara."_

### Regla
**Las tablas de análisis de datos (números, precios, stocks, KPIs) SIEMPRE van en tema LIGHT** (blanco/gris). Oscuro es para dashboards de monitoreo o contenido de bajo análisis.
**El "premium feel" en tablas claras se logra con:**
- Iconos animados (`animate-ping` sobre un badge de color)
- Tipografía cuidada (tracking, tamaños)
- Micro-interacciones (hover, ring, shadow)
- NO con fondos oscuros.

---

## Error #NUEVO-S22-C — Tablas infinitas sin scroll interno

**Cuándo pasó**: Sesión 22. Tablas con 5000+ rows paginadas a 15 por página seguían siendo "muy largas" porque la página scrolleaba mucho.

**Reacción de Tomy (verbatim)**: _"achicarlas un poco y ponerles scroll interno. Sino siento que se hacen muy largas."_

### Regla
**Tablas de detalle en secciones que comparten página con otras tablas DEBEN tener `max-h-[Npx] overflow-auto` + `sticky top-0 z-10` en el `<thead>`.** Esto mantiene filtros, header y otros bloques accesibles sin scroll gigante.

Valores de referencia NitroSales: `max-h-[420px]` para tablas secundarias (Alerta de Quiebre), `max-h-[480px]` para tablas primarias (Stock Muerto).

---

## Error #NUEVO-S22-D — Alerta de Quiebre mostraba todos los stock=0

**Cuándo pasó**: Sesión 22. La "Alerta de Quiebre de Stock" listaba todos los productos con stock=0, incluidos los que nunca se vendían. Tomy: _"Ahí me gustaría que aparezcan productos que se estan vendiendo bien los ultimos días"_.

### Regla
**Alertas de quiebre deben filtrar por velocidad de venta, no solo por stock=0.** Sin velocity, la alerta se llena de ruido (productos descontinuados, errores de catálogo).

**Criterio correcto aplicado**:
```ts
velocity >= 0.2 uds/dia && (
  (stock === 0 && daysSinceSale <= 30) ||  // quiebre reciente con demanda
  (stock > 0 && daysOfStock < 14)          // inminente quiebre
)
```

---

## Error #NUEVO-S22-E — `npx tsc --noEmit` sin typescript local ⇒ instala paquete equivocado

**Cuándo pasó**: Sesión 22. Le pasé a Tomy el comando `npx tsc --noEmit`. `npx` no encontró `tsc` en node_modules y ofreció instalar `tsc@2.0.4` (legacy compiler, NO es TypeScript). Tomy: "Me apareció esto" (con prompt "Ok to proceed? (y)").

### Regla
**Nunca sugerir `npx tsc` sin ser explícito sobre el binario correcto.** Opciones seguras:
- `npx --no-install tsc --noEmit` (falla si no está instalado, pero no instala basura)
- `./node_modules/.bin/tsc --noEmit`
- `npx typescript --noEmit`
- `npm exec -- tsc --noEmit`

Si aparece el prompt "Ok to proceed? (y)" sugiriendo `tsc@2.0.4`, avisar INMEDIATAMENTE que hay que decir **n** — ese paquete es un compilador viejo de CoffeeScript-ish, no es TypeScript.

---

## Error #1 — Field mismatch entre API y frontend

**Cuándo pasó**: Sesión 18, deploy de Phase 2 Analytics
**Síntoma**: Página en blanco (client-side exception)
**Causa raíz**: El API devolvía `device` pero el frontend esperaba `deviceType`. Lo mismo con `url`/`pageUrl` y `pageViews`/`views`.

### Regla
**Antes de consumir datos de un endpoint en el frontend, verificar los nombres EXACTOS de los campos que devuelve la query SQL.** No asumir que el campo se llama como el type de TypeScript. Abrir el endpoint, leer la query, confirmar el alias SQL, y usar ese nombre (o mapearlo explícitamente con fallback).

**Patrón correcto**:
```ts
const devices = rawDevices.map((d: any) => ({
  deviceType: d.deviceType || d.device || "unknown",  // ← fallback explícito
  count: Number(d.count) || 0,
}));
```

---

## Error #2 — Zona nueva sin try-catch crashea toda la página

**Cuándo pasó**: Sesión 18, deploy de Phase 2 Analytics
**Síntoma**: Página en blanco por un error en una sola zona nueva
**Causa raíz**: Las 3 zonas nuevas no tenían try-catch. Un error en una zona mataba todo el render.

### Regla
**Cada zona del dashboard DEBE estar envuelta en un IIFE con try-catch** que retorne `null` en caso de error. Nunca agregar una zona "suelta" al JSX.

**Patrón correcto**:
```tsx
{(() => {
  try {
    // ... zona completa ...
    return <div>...</div>;
  } catch {
    return null;
  }
})()}
```

---

## Error #3 — COUNT(*) en vez de COUNT(DISTINCT) para métricas de páginas

**Cuándo pasó**: Sesión 18, query de Top Pages
**Síntoma**: Checkout aparecía con más "visitas" que Home (imposible)
**Causa raíz**: `COUNT(*)` cuenta eventos, no visitantes. Checkout tiene múltiples eventos por usuario (pasos del checkout), inflando el número.

### Regla
**Para métricas de "páginas visitadas" o "tráfico por página", siempre usar `COUNT(DISTINCT visitorId)`.** `COUNT(*)` solo es correcto cuando queremos contar eventos totales explícitamente.

---

## Error #4 — regexp_replace con backslash en Prisma template literals

**Cuándo pasó**: Sesión 18, rewrite de query Top Pages
**Síntoma**: HTTP 500 al llamar al API
**Causa raíz**: `regexp_replace(url, '\?.*', '')` — JavaScript consume el `\` en el template literal antes de que llegue a PostgreSQL. PostgreSQL recibe `?.*` sin escape, regex inválida.

### Regla
**NUNCA usar `regexp_replace` con caracteres escapados dentro de `Prisma.$queryRaw` con template literals.** Usar alternativas que no requieran regex:

```sql
-- ❌ ROTO en Prisma template literals
regexp_replace(pe."pageUrl", '\?.*', '')

-- ✅ CORRECTO — sin regex
SPLIT_PART(pe."pageUrl", '?', 1)
```

Si absolutamente necesitás regex en Prisma, usar `Prisma.sql` con `Prisma.raw()` para el string de regex (y testearlo).

---

## Error #5 — SQL LIMIT bajo + agrupación en frontend = pocos resultados

**Cuándo pasó**: Sesión 18, Top Pages mostraba solo 4 resultados
**Síntoma**: Solo aparecían 4 páginas en vez de 5-6
**Causa raíz**: SQL tenía `LIMIT 10`, pero el frontend agrupaba URLs por label simplificado (ej: `/producto/123?color=azul` y `/producto/123?color=rojo` → misma label). 10 rows SQL se colapsaban a 4 labels.

### Regla
**Si el frontend agrupa/simplifica resultados del SQL, el LIMIT del SQL debe ser significativamente mayor** que la cantidad final deseada. Regla de pulgar: `LIMIT` = 3x a 5x del número final esperado.

---

## Error #6 — URLs encoded sin decodificar en la UI

**Cuándo pasó**: Sesión 18, Top Pages
**Síntoma**: Paths mostraban `1%20a%203%20a%C3%B1os` en vez de `1 A 3 Años`
**Causa raíz**: Las URLs en la DB están URL-encoded. El frontend las mostraba raw.

### Regla
**Siempre aplicar `decodeURIComponent()` (envuelto en try-catch) antes de mostrar cualquier URL o path al usuario.** Los datos de la DB vienen encoded.

```ts
try { path = decodeURIComponent(path); } catch { /* usar raw */ }
```

---

## Error #7 — Mostrar product IDs numéricos como nombre de página

**Cuándo pasó**: Sesión 18, Top Pages
**Síntoma**: Aparecía "726" como nombre de página
**Causa raíz**: Paths como `/726` son IDs de producto en VTEX. Sin tratamiento, el número aparece como label.

### Regla
**Paths que son solo dígitos (`/^\d+$/`) son IDs de producto.** Mostrarlos como `Producto #726` o filtrarlos si no aportan valor.

---

## Error #8 — Checkout como "página de contenido" en métricas de tráfico

**Cuándo pasó**: Sesión 18, Top Pages
**Síntoma**: `/checkout` aparecía como top page, con más eventos que Home
**Causa raíz**: Checkout es transaccional (múltiples eventos por visita), no es una "página de contenido" que el usuario browseó.

### Regla
**Excluir `/checkout%` de queries de "top pages" y "páginas más visitadas".** Checkout es un flujo transaccional, no content. Incluirlo distorsiona las métricas de navegación.

```sql
AND pe."pageUrl" NOT LIKE '%/checkout%'
```

---

## Error #9 — Fix atrapado en staging, nunca llegó a main (histórico)

**Cuándo pasó**: Sesiones 9-10
**Síntoma**: Pérdida de 1,600 órdenes MELI durante 6 días
**Causa raíz**: El fix del webhook estaba en staging pero main seguía con el código roto. El modelo de branches era innecesariamente complejo.

### Regla
**Todo va directo a `main`. No existen branches extra** (ver CLAUDE.md, modelo vigente desde sesión 11).

---

## Error #10 — Query con JOIN a tabla grande + CAST en columna mixta

**Cuándo pasó**: Sesión 16, query de provincias
**Síntoma**: Timeout de la API → página en blanco
**Causa raíz**: `LEFT JOIN customers` sobre 60K+ orders + `CAST(LEFT(postalCode,4) AS int)` sobre postalCodes que pueden ser alfanuméricos (`B1754BCD`).

### Regla
**NO hacer JOIN a tablas grandes en queries analíticas. NO usar CAST sobre columnas que pueden tener datos mixtos.** Si necesitás datos de otra tabla, usar query separada y cruzar en JS. Comparaciones de texto para postalCode.

---

## Error #11 — Payment gateway aparece como canal de tráfico

**Cuándo pasó**: Sesión 17-18, gocuotas en analytics
**Síntoma**: "gocuotas" aparecía como fuente de tráfico con revenue atribuido
**Causa raíz**: El referrer del pixel capturaba `gocuotas.com` como fuente cuando el usuario volvía del gateway de pago. Estos no son canales de adquisición.

### Regla
**Mantener y expandir la lista PAYMENT_GATEWAY_SOURCES** para filtrar gateways de pago de los datos de atribución. Filtrar en el response del API, no en las queries (para no perder datos históricos).

```ts
const PAYMENT_GATEWAY_SOURCES = [
  "gocuotas", "mercadopago", "payway", "decidir", "mobbex",
  "todopago", "paypal", "stripe", /* ... */
];
```

---

## Error #12 — Tarea programada de Claude Desktop olvidada

**Cuándo pasó**: Sesiones previas
**Síntoma**: Pestañas del navegador se abrían solas mostrando JSON crudo de endpoints de sync
**Causa raíz**: Una tarea programada de Claude Desktop ("Inventory sync runner", cron `*/5`) creada para completar el sync inicial nunca se desactivó.

### Regla
**Cuando aparezcan comportamientos inexplicables en el navegador, verificar PRIMERO `list_scheduled_tasks`** antes de buscar bugs en el código. Y cuando se cree una tarea temporal, documentar y planificar su desactivación.

---

## Error #13 — Agregar un campo al schema.prisma ANTES de crear la columna en la DB

**Cuándo pasó**: Sesión 20, intento inicial de agregar `categoryPath` al modelo Product.
**Síntoma potencial**: Prisma genera queries con `SELECT ... "categoryPath" ...` contra una columna que no existe → **TODAS las páginas que leen productos rompen con error SQL** (`column "categoryPath" does not exist`). Se detectó a tiempo y se revirtió antes del push.
**Causa raíz**: Prisma 5 genera SELECTs EXPLÍCITOS con todas las columnas del modelo. Si el schema declara un campo que la DB no tiene, cada read del modelo explota.

### Regla
**El orden OBLIGATORIO para agregar una columna nueva es:**
1. Crear un endpoint admin idempotente con `ADD COLUMN IF NOT EXISTS` y auth-key.
2. Ejecutar ese endpoint en producción y confirmar `columnExistsNow: true`.
3. RECIÉN DESPUÉS agregar el campo al `schema.prisma`.
4. Desplegar el código que usa el campo.

Nunca alterar el orden. Nunca agregar el campo al schema "preventivamente" confiando en que el deploy va a sincronizar.

---

## Error #14 — Duplicar productos en la UI porque el mismo SKU vive en 2 rows distintos (VTEX + MELI)

**Cuándo pasó**: Sesión 20, tabla de productos en /rentabilidad.
**Síntoma**: Mismo SKU aparecía dos veces en la tabla — una con imagen (VTEX) y otra sin imagen (MELI). Además las ventas se "partían" entre los dos rows.
**Causa raíz**: La DB guarda un row `Product` por canal (mismo SKU, distinto `externalId`). La query agrupaba por `productId` en vez de por SKU, tratando a los dos rows como productos distintos. El frontend mostraba ambos.

### Regla
**En queries analíticas multi-canal, agrupar por SKU (el identificador del negocio), no por `productId` (el identificador del row DB).** El patrón correcto es un CTE `master_products` que elige UN row por SKU con `DISTINCT ON (sku)` y un CTE `sales_by_sku` que suma ventas JOIN-eando por `p.sku`.

**Priority order para elegir el master** (ya probado en producción):
```sql
ORDER BY sku,
  CASE WHEN "imageUrl" IS NOT NULL AND "imageUrl" != '' THEN 0 ELSE 1 END,
  CASE WHEN "categoryPath" IS NOT NULL AND "categoryPath" != '' THEN 0 ELSE 1 END,
  CASE WHEN "costPrice" IS NOT NULL THEN 0 ELSE 1 END,
  "createdAt" ASC
```

**Nunca** resolver el problema a nivel UI con un "fallback de imagen" o deduplicacion JS — el cliente no tiene que ver que existe el problema. La fuente de verdad tiene que devolver 1 row por SKU.

---

## Error #15 — URL de producción incorrecta en CLAUDE.md

**Cuándo pasó**: Arrastre histórico. Detectado por Tomy en sesión 20.
**Síntoma**: CLAUDE.md afirmaba que el URL de producción era `app.nitrosales.io`, cuando el real es `https://nitrosales.vercel.app`. Claude lo repetía en respuestas, generando confusión.
**Causa raíz**: CLAUDE.md quedó con un URL aspiracional/histórico que nunca se actualizó al URL real del deploy.

### Regla
**El URL de producción real es `https://nitrosales.vercel.app`** (Vercel deploy de la rama `main`). Si CLAUDE.md u otro doc mencionan otro URL, está desactualizado — corregirlo en la misma sesión. Nunca repetir URLs de docs sin verificarlos contra la realidad.

---

## Error #16 — Tomar arbitrariamente unos datos de MELI y otros de VTEX en vez de definir un master

**Cuándo pasó**: Sesión 20, pipeline inicial de la tabla de productos.
**Síntoma**: Para el mismo SKU, la tabla mostraba la imagen desde el row que viniera primero (a veces VTEX, a veces MELI), pero las ventas eran del row específico del canal. Resultado: data inconsistente y dependiente del orden de inserción.
**Causa raíz**: No existía un criterio explícito de "¿cuál es la fuente de verdad de la metadata del producto?". Cada query tomaba lo que le quedaba más cerca.

### Regla
**Definir explícitamente el "master" para cada entidad multi-canal y elegir TODOS los campos de metadata desde ese master.** Para productos en NitroSales: VTEX es master del catálogo (imagen, brand, category, categoryPath, costPrice). MELI aporta SOLO ventas. Este principio debe aplicarse en cualquier query/pipeline que una datos de más de un canal (ej. clientes, ordenes cross-canal).

**Patrón**: CTE `master_<entidad>` con priority explícito → JOIN por business-key (SKU, email, document id) en lugar de por ID interno.

---

## Error #17 — No documentar deploys/errores al cierre de una sesión

**Cuándo pasó**: Sesiones 19-20. Pasaron fixes al repo sin actualizar `CLAUDE_STATE.md` ni `ERRORES_CLAUDE_NO_REPETIR.md`. Tomy lo detectó explícitamente y pidió documentar.
**Síntoma**: Claude de la próxima sesión empieza sin saber qué está en producción, qué hay pendiente, y qué errores ya se cometieron. Riesgo de repetirlos.
**Causa raíz**: Falta de ritual de cierre. Claude priorizaba mandar los commits y "moverse rápido" por sobre dejar el estado claro.

### Regla
**Antes de cerrar cualquier sesión que haya deployado código, actualizar EN EL MISMO COMMIT (o en un commit dedicado):**
1. `CLAUDE_STATE.md`: agregar sección `## Sesion N — fecha: titulo` con resumen ejecutivo, archivos modificados, commits, estado final, y pendientes.
2. `ERRORES_CLAUDE_NO_REPETIR.md`: agregar Error #X por cada error cometido (aunque se haya detectado y corregido dentro de la misma sesión).
3. Si se descubre algo desactualizado en `CLAUDE.md` (URLs, reglas, etc.), fixearlo en la misma sesión.

La documentación no es opcional. Es parte del trabajo.

---

## Error #18 — Bajar `maxDuration` sin razón concreta

**Cuándo pasó**: Sesión 20. Después de optimizar el bulk backfill para correr en 277ms, propuse revertir `maxDuration = 300` a default (60s) "porque ya no se necesita". Tomy lo cuestionó.
**Síntoma potencial**: Otras acciones del mismo endpoint (fix-vtex, fix-categories, fix-category-paths) SÍ pueden pasar los 60s porque hacen llamadas a VTEX por producto. Bajarle el techo las habría matado.
**Causa raíz**: Confundí `maxDuration` con un costo. No es un costo, es un techo. La función no consume más recursos si termina rápido — solo le da aire si alguna vez lo necesita.

### Regla
**`maxDuration` es un techo, no un target.** Subirlo no cuesta nada si las funciones terminan rápido. Bajarlo sí puede romper acciones que ocasionalmente tardan más. Nunca bajar `maxDuration` "por prolijidad" o "por las dudas" — solo bajarlo si hay una razón concreta (ej: forzar que una función no loopee infinitamente por un bug).

**Pregunta previa antes de bajar maxDuration**: "¿Existe ALGUNA acción/branch de código que podría tardar más de X segundos?" Si la respuesta no es un NO rotundo, no bajarlo.

---

## Error #S36-SCHEMA-SIN-MIGRACION — Pushear schema.prisma con columnas nuevas sin migrar la DB

**Cuándo pasó**: Sesión 35-36. Se agregaron `isAlwaysOn` (InfluencerCampaign) y `excludeFromCommission` (InfluencerDeal) al schema de Prisma, se hizo commit y push a main. Vercel deployó. Pero la DB de producción no tenía esas columnas. Resultado: **la página de detalle de cada creador se rompió completamente** ("No pudimos cargar el creador") porque Prisma generaba `SELECT ... "isAlwaysOn" ...` contra una columna inexistente.

### Causa raíz
- El build de Vercel corre `prisma generate && next build`, **NO** `prisma db push` ni `prisma migrate deploy`. Prisma generate solo genera el client JS; no toca la DB.
- Se intentó correr `prisma db push` en el sandbox de Claude pero falló porque `DATABASE_URL_UNPOOLED` no estaba disponible. Se ignoró el error y se siguió adelante con el push.
- **Se violó el Error #13** que ya estaba documentado: "El orden OBLIGATORIO para agregar una columna nueva es: 1) endpoint admin, 2) ejecutar en prod, 3) RECIÉN agregar al schema." Se hizo exactamente al revés.

### Regla (refuerzo del Error #13 con lección nueva)
**El orden sigue siendo el mismo de siempre:**
1. Crear endpoint admin idempotente (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`).
2. Deployar el endpoint (push sin tocar el schema aún).
3. Ejecutar el endpoint en producción → columna existe.
4. RECIÉN agregar el campo al `schema.prisma` + el código que lo usa.
5. Pushear.

**Adición nueva**: Si `prisma db push` falla en el sandbox y el schema ya tiene las columnas, **NO pushear**. Revertir el campo del schema, pushear sin él, migrar primero, y después agregar el campo.

**Señal de alarma**: si ves `The column X does not exist in the current database` en producción, es casi seguro que se rompió esta regla.

---

## Error #S36-IGNORAR-FALLA-DB-PUSH — Ignorar que `prisma db push` falló y continuar con el deploy

**Cuándo pasó**: Sesión 35. `prisma db push` falló en el sandbox por falta de `DATABASE_URL_UNPOOLED`. En vez de detenerse y buscar cómo migrar la DB antes de pushear, el flujo continuó: `tsc --noEmit` pasó, se commiteó y se pusheó a main. La DB nunca se migró → página rota en producción.

### Causa raíz
- TypeScript check (`tsc --noEmit`) no valida contra la DB real — solo valida tipos. Que TypeScript pase no significa que la DB esté sincronizada.
- Se priorizó "el código compila" sobre "la DB tiene las columnas".

### Regla
**Si `prisma db push` falla, es un BLOCKER.** No se puede pushear código que referencia columnas nuevas hasta que la DB las tenga. Opciones válidas:
1. Migrar la DB por otro medio (endpoint admin + curl).
2. Sacar los campos del schema y del código, pushear sin ellos, migrar, y después re-agregar.
3. NO pushear y reportar el bloqueo.

**`tsc --noEmit` pasando ≠ DB sincronizada.** Son validaciones distintas. Ambas deben pasar antes de pushear schema changes.

---

## Error #S40-MODELO-SIN-BARANDAS — Exponer salidas crudas de modelo estadistico sin rails de sanidad

**Cuándo pasó**: Sesión 40, al cierre del rediseño `/bondly/ltv`. Tomy abre la tabla "Top clientes por pLTV predicho" y ve al cliente Ariel Lizárraga con **2 compras en 4 días** ($157k total) proyectado a **pLTV 365d = $4.874.306** con 54% de confianza. El modelo BG/NBD + Gamma-Gamma es matemáticamente correcto dado el input, pero el input es inadecuado: `x = 2 compras, T = 4 días` → frecuencia estimada = 0,5 compras/día → extrapolada a 365 días = ~182 compras/año × $78k ticket promedio = absurdo. El problema no es el modelo — es la falta de **rails de sanidad** alrededor del modelo. La UI está mostrando predicciones indefendibles que destruyen la credibilidad del producto entero.

### Causa raíz
- En la Sesión 40 el compromiso explícito fue "no tocar BG/NBD" para acotar el alcance del rediseño a UI + endpoints de lectura. Se respetó, pero nadie agregó rails de sanidad alrededor del modelo.
- **BG/NBD fue diseñado por Fader & Hardie (Wharton) para clientes con meses/años de historia.** Con T < 30 días y n ≤ 2, el prior bayesiano no aplana los extremos suficiente. El modelo devuelve lo que le pediste, pero lo que le pediste no tiene sentido.
- Se mostró el "punto estimado" directamente en la tabla sin bandas de confianza visibles en el ranking ni caps duros. El badge de 54% de confianza no alcanza para compensar un número que es 30x más alto que el gasto real.
- No se implementó un piso de antigüedad mínima (T ≥ 30 días) para activar BG/NBD vs. caer a segmento.

### Regla
**Cualquier modelo estadístico o ML expuesto en UI de producto necesita 3 capas de defensa obligatorias:**

1. **Piso de aplicabilidad**: criterios mínimos para que el modelo se active. Debajo de esos mínimos, fallback a método simple (promedio de segmento). Para BG/NBD de LTV: `T ≥ 30 días` y `n ≥ 2 compras` como mínimo. Si no cumple, usar segmento.
2. **Cap duro de sanidad**: ningún output del modelo puede exceder un techo razonable calculado independientemente. Para pLTV 365d: `cap = avgTicket × freqP95_segmento × 365`. El modelo puede decir $4.8M, pero nunca se expone más de lo que el cap permite.
3. **Confianza recalibrada al contexto**: un 54% de confianza con 4 días de historia es mentira matemática. Regla: `confianza_máxima = min(modelo_confianza, f(T))` donde `f(T)` crece con la antigüedad (ej: T<30d → 20%, T<90d → 50%, T<180d → 75%).

**Además**: cuando se fallback a segmento, mostrarlo explícitamente en la UI ("Historia insuficiente · promedio del segmento") para que quien mira sepa que no es una predicción personal.

**Señal de alarma**: si un cliente no-técnico (ej: Tomy) ve el output del modelo y dice "eso es imposible", es porque faltan rails. El modelo puede tener razón matemáticamente y estar mal expuesto.

**Antipatrón**: "el modelo dice X, entonces mostramos X". Correcto: "el modelo dice X, los rails dicen min(X, cap, sanity_check), eso es lo que mostramos".

---

## Error #S48-RBAC-MAPPING-INCOMPLETO — Sistema de permisos con rutas "no mapeadas = visibles"

**Cuándo pasó**: Sesión 48, commit `60b1112`. Diseñé `hrefToSection(href)` mapeando solo las secciones "principales" (finanzas, bondly, aura, campaigns, etc.). Las secciones sin mapeo (`/rentabilidad`, `/dashboard`, `/seo`, `/nitropixel`, `/chat`, `/sinapsis`, `/boveda`, `/pixel`, `/memory`) las dejé como `return null` con comentario "no mapeadas, siempre visibles". Tomy prueba con user custom "Contador de prueba" (permiso solo Fiscal) y ve Rentabilidad, SEO, NitroPixel, Centro de Control en el sidebar — secciones que NO debería ver. Fix en `e76ac77`.

### Causa raíz
- Asumí que "no mapeado = público" era default seguro. En RBAC es lo opuesto: **principle of least privilege** → todo bloqueado salvo lo explícitamente permitido.
- No hice inventario exhaustivo de rutas antes de diseñar.
- El comentario "no mapeadas, siempre visibles" es bomba de tiempo: cada feature nueva sin agregar al mapping crea agujero de seguridad.

### Regla
**Al diseñar RBAC, listar el 100% de las rutas navegables desde el principio.** No existe "público dentro de la app autenticada" — toda ruta detrás del login tiene que estar bajo alguna sección.

**Checklist al crear/actualizar `hrefToSection()`**:
1. `grep -n 'href: "/' layout.tsx` para listar TODOS los items del sidebar.
2. Cada `href` debe corresponder a una `Section` del enum.
3. Idealmente usar `satisfies Record<Href, Section>` de TS para garantizar completitud.
4. Los defaults por rol (`DEFAULT_PERMISSIONS`) cubren la nueva sección con nivel razonable.

**Señal de alarma**: si un user custom con permisos estrictos ve cosas que no debería — primer chequeo es `hrefToSection()`.

---

## Error #S48-ENFORCEMENT-SOLO-UI — Implementar enforcement a nivel UI sin proteger pages ni APIs

**Cuándo pasó**: Sesión 48, commit `60b1112`. Implementé `NavItemGate` que oculta items del sidebar. El user no ve el tab "Rentabilidad". **PERO** si pega `nitrosales.vercel.app/rentabilidad` en el navegador, ve toda la data igual. Las APIs `/api/metrics/*`, `/api/finance/*` tampoco validaban. Enforcement cosmético. Fix en `e76ac77` con `PathnameGuard` + quedaron APIs como deuda.

### Causa raíz
- Mezclar "UI-level hide" con "enforcement real". Son cosas distintas.
- Asumir "si no ve el botón, no puede llegar" = falso. Usuarios pegan URLs, usan extensiones, hacen bookmark.

### Regla
**Enforcement de permisos debe aplicarse en 3 niveles independientes**:

1. **UI-level (sidebar)**: `NavItemGate` + `NavGroupGate`. Previene ruido visual.
2. **Page-level (client)**: `PathnameGuard` o `useRequirePermission` redirigen a `/unauthorized`.
3. **API-level (server)**: `requirePermission(section, level)` devuelve 403 incluso si atacante modifica el JS.

Los 3 niveles son redundantes por diseño (defense-in-depth). Solo UI-level = 0 seguridad real.

**Antipatrón**: "por ahora solo escondo el tab, después agrego los guards". Los 3 niveles se agregan juntos o ninguno.

---

## Error #S48-NAVITEM-PADRE-HREF-ESTATICO — Ocultar grupo cuando el href del padre no es accesible pero los hijos sí

**Cuándo pasó**: Sesión 48. En el sidebar, item padre "Finanzas" tiene `href: "/finanzas/pulso"`. `NavItemGate` verificaba `pulso` y si no tenía acceso, ocultaba el grupo entero. El Contador tenía acceso solo a **Fiscal** (hijo de Finanzas). Resultado: no veía "Finanzas" aunque tenía un hijo accesible.

### Causa raíz
- Tratar items padres como items simples. El padre de un grupo es agrupador cuya visibilidad depende de los hijos, no del href default.
- El `href` del padre es shortcut de navegación, no requisito de permiso.

### Regla
**En sidebars jerárquicos, items padres deben chequear así**:

1. Si padre tiene section Y es accesible → mostrar.
2. Si padre tiene children → mostrar si al menos **un child** es accesible.
3. Al clickear padre, navegar al primer child accesible (no al href default).

Implementación: `NavItemGate` acepta `childHrefs?: string[]`. Ver commit `e76ac77`.

**Corolario**: headers de categoría (ej "MARKETING DIGITAL") también deben ocultarse si ningún item del grupo es visible. Usar `NavGroupGate`.

---

## Error #S48-LOADING-DEFAULT-TRUE — Durante loading retornar `true` en canAccess causa flash de items

**Cuándo pasó**: Sesión 48. Tomy reportó "cuando entro, aparecen todas las secciones por 1-2s y después desaparecen las que no tengo permiso". Causa: `canAccess(section, level)` durante `loading=true` devolvía `true` por default. Eso causaba flash de items que después se ocultaban. Fix en commit `4ef1a52`.

### Causa raíz
- Asumir que "mostrar de más" durante loading es mejor que "mostrar de menos". Depende del caso.
- Flash de contracción ("tenías esto, ya no") es psicológicamente peor que flash de expansión.

### Regla
**Durante loading de permisos, default = NO renderizar.** El sidebar arranca vacío y aparece con items filtrados cuando carga.

Implementación: `NavItemGate` retorna `null` si `loading === true`.

**Regla general**: para permisos/auth/roles, default durante estado incierto = "deny"/"hide". Para data/metrics/UI content, default = "skeleton"/"placeholder".

---

## Error #S48-PAGINA-ERROR-CON-CTA-REBOTADOR — CTAs en página de error que linkean a rutas protegidas

**Cuándo pasó**: Sesión 48. Página `/unauthorized` tenía "Volver al inicio" → `/` (que redirige a `/dashboard`) y "Ver mi rol actual" → `/settings/team` (solo admin). Si user tenía permiso solo para Fiscal, ambos botones lo rebotaban a `/unauthorized`. **Loop infinito**. Fix en commit `9fa2b83`.

### Causa raíz
- Al diseñar páginas de error, asumí que los CTAs eran "siempre accesibles" porque son navegación básica. Falso — `/dashboard` y `/settings/team` requieren permisos.
- No testé con user de bajos permisos.

### Regla
**Páginas de error (`/unauthorized`, `/404`, `/500`) deben tener CTAs que NO asuman permisos.** Opciones válidas:

1. **Calcular primera ruta accesible dinámicamente**: fetch `/api/me/permissions` + iterar `HOME_PRIORITY` hasta encontrar una con level !== "none".
2. **Solo CTAs universales**: "Cerrar sesión" (siempre accesible), "Contactar admin" (mailto).
3. **NO linkear a rutas protegidas** (settings/team, dashboard, admin panels).

**Antipatrón**: página de error que rebota al user al mismo error por CTAs que requieren el permiso que no tiene.

---

## Error #S48-EMAIL-PROVIDER-SANDBOX-SILENCIOSO — Asumir que los emails se envían cuando el proveedor está en sandbox mode

**Cuándo pasó**: Sesión 48. Implementé envío de invitaciones con Resend (reusando `sendEmail()` que usaba Aura). Aura había estado usándolo "hace meses". Probé: el email a mi propio email llegaba, pero a `tomylapidus1999@gmail.com` daba `Resend 403: You can only send testing emails to your own email address`. Aura había estado en el mismo limbo — todos sus emails iban a Tomy, nunca a creadores reales, sin que nadie lo notara hasta ahora.

### Causa raíz
- Resend/Postmark/SendGrid tienen **sandbox mode** inicial donde solo permiten mandar al email del dueño de la cuenta hasta verificar un dominio propio. No se anuncia explícitamente — silenciosamente falla con emails externos.
- `RESEND_FROM` default apuntaba a dominio no verificado (`nitrosales.com`).
- Nunca se había testeado con email externo real.

### Regla
**Al integrar proveedor de email transaccional, antes de asumir que funciona, verificar 3 cosas**:

1. **Dominio FROM verificado**: entrar al panel del proveedor, confirmar status "Verified". Configurar DKIM + SPF + MX + DMARC en el DNS provider.
2. **Probar envío a email externo** (NO al dueño de la cuenta). Si hay sandbox mode, falla con error 403 explícito.
3. **Loggear resultado del envío**: `console.log/warn` con status + errorMessage, devolver `emailSent: bool` en la response.

**Código defensivo mínimo**:

```ts
const hasApiKey = Boolean(process.env.RESEND_API_KEY);
if (!hasApiKey) return { ok: false, error: "API key not configured" };
const result = await provider.send(...);
if (!result.ok) console.warn("Email failed:", result.error);
return { ok: result.ok, error: result.error };
```

**Antipatrón**: "el email salió sin error en la respuesta = se envió". Falso con proveedores en sandbox. Verificar status del dominio Y probar con email externo real.

---

## Error #S57-ARGS-ORDER-SILENT-NOOP — Invertir orden de args en función helper → no-op silencioso sin excepción

**Cuándo pasó**: Sesión 57 (2026-04-24). El backfill VTEX del cliente MdJ completó con `processedCount=12298` y `status=COMPLETED`, pero `order_items=0, products=0, customers=0`. Cabeceras de órdenes OK, detalle CERO.

Causa raíz: en `src/lib/backfill/processors/vtex-processor.ts` y en 2 endpoints nuevos (`catalog-refresh`, `vtex-reenrich`), la llamada a `withConcurrency` tenía los argumentos **invertidos**:

```ts
// Firma real: withConcurrency(limit: number, tasks: Task[])
// Llamada incorrecta:
await withConcurrency(
  upsertedOrders.map(o => async () => {...}),   // array como "limit"
  ENRICH_CONCURRENCY,                            // número 8 como "tasks"
);
```

### Causa raíz (comportamiento en JS)
- `limit = array` → `limit <= 0` → `NaN <= 0` → `false` (coerción de array vacío = 0, no vacío = NaN), pasa validación.
- `tasks = 8` → `tasks.length` = `undefined`.
- `Math.min(array, undefined)` → `NaN`.
- `Array.from({ length: NaN })` → `[]` (NaN coerciona a 0).
- **Se lanzan CERO workers**. La función retorna inmediatamente sin ejecutar ninguna tarea, sin throw.
- El código que sigue interpreta que "funcionó", sigue de largo.

Resultado: el processor upserteaba cabeceras de órdenes (paso 1) pero la sección de enrichment (paso 2) era un no-op invisible. El backfill marcaba COMPLETED porque nada tiraba error.

### Regla
**Cuando una función helper toma 2 o más parámetros del mismo "dominio" (números + arrays, strings + strings), nombrar o validar los args para que invertirlos sea un error de tipo.**

Opciones:
1. **Usar objeto en vez de args posicionales**:
   ```ts
   withConcurrency({ limit: 8, tasks })
   ```
2. **Validación runtime del primer arg**:
   ```ts
   if (typeof limit !== "number") throw new Error("withConcurrency: limit debe ser number");
   ```
3. **Consistencia API-wide**: si TODOS los helpers de sync reciben `(limit, ...)` o `(items, limit)`, siempre igual. Mixto = bug garantizado.

### Prevención
- Al crear endpoints nuevos que usan helpers existentes, **leer la signature del helper primero**. No asumir por analogía con otras llamadas.
- Agregar un smoke test runtime rápido: después de escribir un endpoint nuevo, llamarlo con data real y verificar side effects esperados (ej: "debe crear >0 OrderItems"). No confiar solo en tsc + build.
- **Símptoma típico de este bug**: "corrió pero no hizo nada, sin error". Si un proceso largo reporta 0 side effects, sospechar helper mal invocado antes que causa lógica.

### Lecciones de proceso de esta sesión (S57)
- Tomy detectó el bug porque **verificó que el feature prometido realmente había sucedido** (tabla `order_items` vacía en la UI). Si no hubiera entrado al producto, el bug habría pasado a prod silenciosamente.
- Yo tardé mucho en identificar la causa raíz porque seguí asumiendo causas externas (rate limit de VTEX, timeouts) en vez de releer el código del processor **con la hipótesis de que el helper podía estar mal llamado**. Revisar SIEMPRE firmas de funciones cuando un proceso corre sin errores pero sin side effects.

---

---

## Error #S59-EXT2-NO-CONTRASTAR-CON-REALIDAD — Sacar conclusiones sobre datos sin contrastar con la fuente real

**Cuándo pasó**: Sesión 59 EXTENDIDA #2 (2026-04-30). Tomy preguntó por qué la atribución del pixel TVC funcionaba mal. Yo conté customers únicos VTEX con email y reporté **"39% con email"**, comparándolo con EMDJ que tenía **"98%"**. De ahí saqué hipótesis tras hipótesis (clientes recurrentes vs guest, App Key sin permisos, Master Data CL vacía...). Cada una falsa.

La métrica que realmente importaba era **% de orders web con email**, no customers únicos. Y el número real era **84%** (no 39%). Tomy lo detectó cuando me dijo "yo veo emails en el dashboard de pedidos, ¿cómo puede ser?".

Cuando finalmente miré la realidad (orders web con email leyendo desde la misma query del dashboard), TVC era 84% — comparable a EMDJ y completamente normal. Los 16% sin email eran principalmente **órdenes de Frávega y Banco Provincia** (marketplaces externos publicados via VTEX), no un bug.

### Causa raíz
- Conté **customers únicos** y comparé con **% que ve el dashboard** (que muestra orders, no customers únicos). Mezcla de unidades de medida → conclusión completamente errónea.
- No contrasté la metric con lo que Tomy veía en el dashboard real ANTES de armar hipótesis.
- Encadené hipótesis basadas en la métrica mala: pensé "guests sin email → permisos faltantes → Master Data CL → recovery endpoint" sin nunca verificar el supuesto base.

Resultado: 4-5 commits inútiles (`vtex-recover-customer-emails`, `test-vtex-masterdata-cl`, etc.) y horas de tiempo perdido. Tomy frustrado.

### Regla
**Cuando voy a reportar un % o una métrica al usuario, validar PRIMERO que coincida con lo que el usuario ve en su dashboard.** Si la app tiene una página que muestra esa info, leer la query exacta de esa página y replicarla, no inventar una mía.

```
Antes de afirmar "TVC tiene 39% emails":
1. Leer el código de la página del dashboard que Tomy ve (`/api/metrics/orders/route.ts`).
2. Replicar la MISMA query con los MISMOS filtros.
3. Comparar mi resultado con lo que el dashboard muestra (Tomy puede confirmarlo).
4. Solo entonces afirmar el %.
```

### Prevención
- Si tengo acceso a un endpoint que muestra la data al usuario (ej: `/api/metrics/orders`), USARLO como referencia, no inventar mi propia query.
- Antes de armar hipótesis sobre "por qué falla X", primero confirmar que X realmente falla. Pedir un dato concreto del usuario o de su dashboard ("dame 5 ordenes que vos veas, vamos a ver caso por caso").
- Si una métrica suena rara comparada con otra org (39% vs 98%), **pausar y verificar la metric antes de teorizar**.

---

## Error #S59-EXT2-NO-LEER-CLAUDE-MD-AL-ARRANCAR — Empezar a editar sin leer la documentación obligatoria

**Cuándo pasó**: Sesión 59 EXTENDIDA #2. Continué la sesión post-compactación sin leer `CLAUDE_STATE.md`, `ERRORES_CLAUDE_NO_REPETIR.md`, `BACKLOG_PENDIENTES.md`, ni `CLAUDE.md`. La regla está documentada explícitamente en `CLAUDE.md` REGLA #2.

Si hubiera leído `ERRORES_CLAUDE_NO_REPETIR.md`, hubiera visto el Error #S57-ARGS-ORDER-SILENT-NOOP que enseña: "**Símptoma típico de bugs de queries: corrió pero no hizo nada. Sospechar de filtros mal puestos antes que causa lógica.**" Eso me hubiera ahorrado horas — la cobertura del pixel daba 1% no por bug profundo sino porque el filtro de marketplace no contemplaba FVG/BPR.

### Causa raíz
- Asumí que post-compactación, el resumen de la sesión previa era suficiente.
- No abrí los archivos de proceso al empezar a programar.
- Tomy tuvo que explícitamente pedirme que los lea al final de la sesión.

### Regla
**El ritual de arranque de `CLAUDE.md` REGLA #2 NO es opcional ni se puede saltear**. Antes de cualquier edit:

```
1. cd <repo>
2. git fetch origin --prune && git pull origin main
3. Read CLAUDE_STATE.md (estado actual del proyecto)
4. Read ERRORES_CLAUDE_NO_REPETIR.md (errores que NO debo repetir)
5. Read BACKLOG_PENDIENTES.md (pendientes priorizados)
6. Read CLAUDE.md (reglas de proceso)
```

Esto es válido tanto para sesión nueva como para continuación post-compactación.

### Prevención
- Cuando arranco una sesión nueva o continúo post-compactación, lo PRIMERO que hago es ese ritual. No editar NADA hasta tenerlo hecho.
- En la primera respuesta al usuario, mencionar explícitamente: "leí CLAUDE_STATE, ERRORES_NO_REPETIR, BACKLOG y CLAUDE.md. Estado actual: X. Errores conocidos a evitar: Y."
- Si Tomy me pregunta algo específico de un cliente o feature, primero veo si está documentado en CLAUDE_STATE (puede tener contexto crítico que no me dijo).

---

## Error #S59-EXT2-IMPROVISAR-DEBUG-ENDPOINTS — Crear cadena de endpoints debug en vez de leer el código existente

**Cuándo pasó**: Sesión 59 EXTENDIDA #2. Para diagnosticar por qué la cobertura del pixel TVC daba 1%, creé 6+ endpoints debug en cascada: `debug-pixel-attribution`, `compare-orgs-pixel`, `sample-customers`, `debug-vtex-raw-emails`, `compare-vtex-orders-profile`, `debug-orders-emails-shown`, `debug-vtex-emails-by-channel`, `test-vtex-masterdata-cl`, `debug-orders-attribution-detail`.

La causa raíz real (FVG/BPR contados como web) hubiera salido en 5 minutos si:
1. Hubiera leído primero `src/app/api/metrics/pixel/route.ts` (la query de la métrica que daba 1%)
2. Hubiera mirado los filtros que usa para `webOrders` y comparado con la realidad de TVC

En vez de eso, asumí múltiples causas y armé tests para cada una. Tiempo perdido: horas. Endpoints inútiles deployeados a prod.

### Causa raíz
- Reflejo de "diagnosticar = más datos" en vez de "diagnosticar = leer la lógica primero".
- No tenía un mapa mental de "esta página → este endpoint → esta query". Cada vez que Tomy mostraba un número raro, asumía bug en la data en vez de bug en la query.
- No usé los Agent (Explore) para mapear el flow del dashboard pixel ANTES de programar.

### Regla
**Cuando un dashboard muestra un número raro, el orden correcto es**:

```
1. Read del código de la página del dashboard (qué API consume).
2. Read del API endpoint (qué query SQL hace).
3. Read del schema de tablas que toca (qué columnas y filtros tiene).
4. Buscar el bug en la lógica de la query, NO en la data subyacente.
5. Solo si la lógica está OK, recién entonces investigar la data con endpoints debug.
```

Inversión total del orden que tuve esta sesión.

### Prevención
- Pre-flight check antes de crear cualquier endpoint debug nuevo: "¿Ya leí el código de la página/query que produce este número raro?". Si la respuesta es no → leer primero.
- Si después de leer la query encuentro un filtro sospechoso (ej: el filtro de marketplace solo cubre MELI pero olvida FVG/BPR), ese es el bug. No necesito endpoints debug para confirmarlo.
- Si necesito un endpoint debug, máximo UNO por hipótesis. Si la primera hipótesis es falsa, leer más código antes de crear el segundo endpoint.

---

## Error #S59-EXT2-MARKETPLACES-NO-MARCADOS — VTEX marketplaces (Frávega, Banco Provincia) contados como web propia

**Cuándo pasó**: Sesión 59 EXTENDIDA #2. El dashboard NitroPixel de TVC mostraba "Cobertura del pixel: 1%". Causa raíz: la query de cobertura excluía solo MercadoLibre (`source = 'MELI'` y `channel = 'marketplace'`), pero no excluía órdenes VTEX que vienen de marketplaces externos publicados via VTEX (Frávega, Banco Provincia, etc.).

Síntoma: TVC tenía 33,987 orders VTEX, de las cuales 8,611 eran de marketplaces (FVG- + BPR-) que jamás pueden tener atribución del pixel propio (la sesión del comprador está en Frávega.com, no en la web de TVC). Esos 8,611 inflaban el denominador → cobertura aparece en 1%.

Lo identifiqué SOLO cuando Tomy me dijo "FVG es Frávega, BPR es Banco Provincia". Yo lo había estado tratando como "tipos especiales misteriosos" hasta entonces.

### Causa raíz
- VTEX permite a un seller publicar sus productos en múltiples marketplaces externos. Esas órdenes vienen al endpoint OMS del seller con prefijo en el `externalId` que identifica el marketplace (`FVG-`, `BPR-`, etc.).
- El enrichment de VTEX no marcaba esas órdenes con `channel = 'marketplace'` o `trafficSource = 'Marketplace'` automáticamente.
- La query de cobertura del pixel asumía que solo MELI era marketplace → contaba FVG/BPR como web propia.
- El pixel NUNCA puede atribuir esas órdenes (la sesión está en otra web).

### Regla
**Para clientes VTEX en Argentina, si tienen prefijos de marketplace en `externalId`, marcarlos automáticamente al ingestar**:

```ts
const isMarketplaceOrder = externalId.startsWith("FVG-")    // Frávega
                        || externalId.startsWith("BPR-");   // Banco Provincia
// (Otros prefijos posibles a investigar: COTO-, otros marketplaces argentinos)

if (isMarketplaceOrder) {
  channel = "marketplace";
  trafficSource = "Marketplace";
}
```

Toda query de KPIs del pixel (cobertura, atribución, ROAS) debe excluir orders con `channel = 'marketplace'` Y `trafficSource = 'Marketplace'` Y `source = 'MELI'`.

### Prevención
- Cuando un cliente VTEX activa, preguntarle qué marketplaces externos vende (Frávega, Banco Provincia, COTO, etc.) y agregar el prefijo al pattern matcher si hace falta.
- En la primera revisión del onboarding, correr el endpoint `debug-vtex-emails-by-channel` para ver la distribución de canales del cliente. Si aparecen prefijos no contemplados, agregarlos.
- **Pattern de detección de bug similar en el futuro**: si la "cobertura del pixel" da números muy bajos (< 10%) cuando el pixel está pegado y los eventos llegan, sospechar primero del filtro de marketplaces ANTES que de la captura de email del visitor.

### Endpoints relevantes (para referencia futura)
- `mark-vtex-marketplace-orders` (`/api/admin/...`) — one-shot reparativo para marcar orders FVG/BPR de un cliente legacy.
- `vtex-enrichment.ts` (línea ~265) — marca automáticamente desde S59 EXT2 commit `e44db86`.
- `pixel/route.ts` línea ~470 (`webOrders`) y ~580 (`perDayCoverage`) — queries que excluyen FVG/BPR.

---

## Error #S60-WIZARD-NO-AUTOMATIZA-PASO-CRITICO — Onboarding requiere accion manual del founder por cliente, rompiendo multi-tenant

**Cuándo pasó**: Sesión 60 (2026-04-30). TVC quedo con 0/8 ordenes web atribuidas porque el wizard del onboarding NO automatiza la creacion del afiliado VTEX (mecanismo "Afiliados" del admin de VTEX). Para EMDJ se hizo a mano en S53 — para TVC nadie lo hizo, y se rompio. Para Arredo y los proximos clientes va a romper IGUAL si no se arregla.

### Causa raíz
- El wizard de NitroSales pide al cliente: nombre de cuenta + App Key + App Token. Despues lo aprueba como "completo".
- Pero VTEX requiere un paso adicional: registrar un afiliado en VTEX Admin → Configuracion tienda → Pedidos → Configuracion → tab "Afiliados" — donde el cliente carga el endpoint del webhook de NitroSales por politica comercial. Sin esto, VTEX nunca manda webhooks al server, y la atribucion de ordenes nunca corre.
- Este paso era **conocimiento implicito del founder** (Tomy lo sabia hacer manualmente porque lo hizo para EMDJ). Pero un cliente nuevo no tiene como saber que existe.
- El wizard no lo expone, no genera la URL automatica, no marca el paso como obligatorio. Resultado: cada cliente nuevo es una bomba de tiempo silenciosa.

### Regla
**Cualquier paso del onboarding de un cliente que requiera intervencion manual del founder rompe el modelo multi-tenant. Si un cliente nuevo va a romper un comportamiento del producto sin que el founder se de cuenta, hay un bug grave de wizard, no un bug puntual de ese cliente.**

Pattern de revision: cuando se onboardea un cliente nuevo, antes de aprobarlo, hacerse esta pregunta: **"Si el founder no estuviera presente, ¿el cliente podria llegar a un estado funcional 100% por su cuenta solo siguiendo el wizard?"**. Si la respuesta es NO, hay que arreglar el wizard antes de aceptar mas clientes.

### Prevención
- Auditar el onboarding flow completo (wizard → aprobacion admin → backfill → activacion) para identificar TODOS los pasos manuales fuera del wizard. Documentarlos. Decidir cuales se pueden automatizar (preferido) y cuales hay que exponer al cliente como instrucciones explicitas con assets visuales (capturas, screencasts) y validaciones empiricas.
- Para cada cliente nuevo, antes de aprobar el onboarding, **correr una checklist de verificacion** que confirme que todos los webhooks/integraciones criticas estan configuradas en su sistema externo (no solo en NitroSales).

### Patron similar a buscar en otras integraciones
- ¿El wizard configura el feed de Meta Ads correctamente del lado Meta? ¿Solo carga el token y se asume que el ad account esta listo?
- ¿El cron de GA4 funciona desde dia 1 sin que el cliente tenga que activar algo en GA4?
- ¿El feed de Google Merchant esta linkeado a Google Ads del cliente?
- ¿El sync de MercadoLibre funciona sin que el cliente tenga que activar el webhook en su panel ML?

Cada una de estas requiere auditoria. Si alguna requiere accion manual del founder, **es el mismo bug que TVC**.

### Endpoints / archivos relevantes
- `src/app/api/webhooks/vtex/orders/route.ts` — el endpoint que VTEX deberia llamar (configurado correctamente para EMDJ, faltaba para TVC).
- `src/app/(app)/wizard/...` — donde tiene que ir el sub-step del afiliado.
- BACKLOG_PENDIENTES.md → BP-S60-002 — fix concreto del bug.

---

## Error #S60-COMPARAR-FUNCIONAMIENTO-NO-RESULTADOS — Cuando un cliente A funciona y otro B no, comparar IMPLEMENTACION end-to-end, no porcentajes

**Cuándo pasó**: Sesión 60. Cuando le mostre a Tomy que TVC tenia 0% atribucion vs EMDJ 63/63, mi primer instinto fue empezar a teorizar hipotesis sobre por que la data de TVC podia ser distinta a la de EMDJ (formato emails, snippet capturando email o no, etc). Tomy me corrigio: **"no quiero que compares el porcentaje de atribucion, eso es comparar resultado. Tenes que comparar como esta hecho todo, cual es la logica, cual es el funcionamiento."**

Esa observacion fue clave. Cuando aplique el approach correcto (correr `debug-orders-attribution-detail` para EMDJ y compararlo orden por orden con el de TVC), la diferencia salto a la vista en 5 minutos: en EMDJ habia POSTs al webhook, en TVC no. De ahi la causa raiz (afiliado VTEX no configurado) en otros 5 minutos. Total: 10 minutos.

Si hubiera seguido por hipotesis, hubiera tirado 6 endpoints debug mas como en S59 EXT2, y capaz tardado horas o dias.

### Causa raíz del error de proceso
- Reflejo de "encontre una diferencia, voy a buscar por que la data difiere" en lugar de "voy a comparar la implementacion end-to-end y ver que esta haciendo cada lado".
- Foco en el sintoma (% bajo) en lugar del flujo completo (que dispara que cosa, en que orden, con que data).

### Regla
**Cuando dos clientes tienen el mismo stack pero comportamiento opuesto, antes de hipotetizar sobre por que la data difiere, comparar la implementacion completa end-to-end:**

1. ¿Que llega a cada cliente desde sus integraciones externas? (logs de webhooks, eventos del pixel, tickets de sync)
2. ¿Que registros tienen en DB? (no solo cuantos, sino que estructura)
3. ¿Que dispara que en cada lado? (sigue el flujo desde el evento hasta el resultado para 1 caso de cada cliente, en paralelo)
4. ¿Hay algo que el cliente A tenga (config externa, settings, registros, webhooks) que el cliente B no tenga, o viceversa?

El primer "diferencia clara" que encontremos en alguno de esos 4 puntos es muy probable que sea la causa raiz. Si encontramos varias, priorizar las que estan upstream del flow (mas cerca del evento que dispara la cadena).

### Prevención
- Cuando me dispongo a teorizar hipotesis sobre por que un cliente difiere de otro, parar y preguntarme: **"¿Ya compare la implementacion end-to-end de ambos?"** Si no, hacerlo primero. Las hipotesis pueden venir despues de tener data dura comparativa.
- Aprovechar endpoints comparativos existentes (`debug-orders-attribution-detail`, `compare-orgs-pixel`, `health-check`) en lugar de improvisar nuevos.

### Pattern relevante
Este error es contracara de #S57-ARGS-ORDER-SILENT-NOOP y #S59-EXT2-IMPROVISAR. La regla unificada: **antes de teorizar sobre causas, leer/comparar lo que esta pasando en la realidad**.

---

## Error #S60-EXT2-REPLACE_ALL-SIN-VERIFICAR-CONTEXTO — Romper queries por replace_all sobre patron presente en queries no compatibles

**Cuándo pasó**: Sesión 60 EXT-2. Para arreglar el bug del Revenue Intelligence (que filtraba por `pa."createdAt"` y mostraba data en fechas pre-pixel), use Edit con `replace_all=true` para cambiar `pa."createdAt"` por `o."orderDate"` en TODO el archivo discrepancy/route.ts. **El cambio rompio 5 queries** que NO tenian `JOIN orders o` en su FROM (solo `FROM pixel_attributions pa, jsonb_array_elements(...)`). Cuando esas queries ejecutaban, Postgres tiraba `column o.orderDate does not exist` → backend devolvia 500 → frontend mostraba "Sin datos de comparacion".

Tomy reporto el bug, debugue, y agregue `JOIN orders o ON o.id = pa."orderId"` a las 5 queries afectadas. Tiempo perdido: 30 min de debugging + commit de fix.

### Causa raíz
- Use `replace_all=true` asumiendo que el contexto era homogeneo en todas las apariciones del patron.
- No verifique que cada query que iba a tocar tuviera la tabla `orders` joineada (necesaria para usar `o."orderDate"`).
- Confianza excesiva en que el codigo seguia un patron consistente cuando en realidad mezclaba queries con y sin JOIN orders.

### Regla
**Antes de usar Edit con replace_all, verificar que TODAS las apariciones del patron tengan contexto compatible con el reemplazo.** Para SQL especificamente:

1. Si reemplazo es `tabla1.campo` → `tabla2.campo`, hacer grep de cada match con `-B 5 -A 0` para ver si la query del match tiene `JOIN tabla2` o `FROM tabla2`.
2. Si en algunos casos no esta joineada, hacer ediciones puntuales en cada query (con context) en lugar de replace_all.
3. Despues del cambio, correr `npx tsc --noEmit` Y, si es razonable, simular ejecucion de las queries (ej: postman o pegar a un endpoint debug que ejercite el path).

### Prevención
- Default mental: **replace_all es para texto donde el contexto NO importa** (ej: renombrar variable JS donde TS chequea, cambiar magic string en constantes). Para SQL, JSON, regex y otros lenguajes con sintaxis dependiente del contexto, **prefiero ediciones puntuales con context unico de cada match**.
- Cuando deba usar replace_all, hacer un grep PREVIO con context para listar todas las apariciones y revisar mentalmente que cada una sea compatible con el reemplazo.

### Pattern relevante
Conexion con #S57-ARGS-ORDER-SILENT-NOOP: ambos son "el cambio compilo pero no funciono". Para el de S57 era ARGS posicional vs nombrado; para este, dependencia de tabla joineada en SQL raw.

---

## Error #S60-EXT2-NO-VALIDAR-FLAGS-LEGACY-ANTES-DE-LIMPIAR — Casi borro 1.676 atribuciones legitimas por confiar en flag mal seteado

**Cuándo pasó**: Sesión 60 EXT-2. Tomy me pidio limpiar atribuciones falsas en ordenes marketplace. Identifique 1.771 atribuciones (95 reales FVG/BPR + 1.676 con `trafficSource=Marketplace`) y propuse borrar todas. Tomy me freno con "es imposible que EMDJ haya tenido 1.746 ventas marketplace" y forzo crear un audit endpoint antes.

El audit revelo: las 1.741 ordenes con `trafficSource=Marketplace` (que sumadas a 5 modelos = 1.676 atribuciones) eran ordenes web propias mal etiquetadas por bug del enrichment historico. Externalids numericos `1620521503842-01`, source=VTEX, channel=1 (web propia VTEX), todas anteriores al 27/03 (cuando se arreglo el enrichment). Si hubiera borrado, perdia 1.676 atribuciones legitimas de EMDJ.

### Causa raíz
- Confie en que los flags `trafficSource=Marketplace` reflejaban realidad sin validar.
- Cree el endpoint de cleanup asumiendo que cualquier orden con flag de marketplace era marketplace real.
- No anticipe que historicamente el enrichment podia tener bugs y haber marcado mal data legacy.

### Regla
**Antes de borrar/modificar data en bulk basado en flags, validar con un endpoint de audit que muestre samples y permita verificar visualmente que los flags reflejan realidad.** Pattern:

1. **Endpoint audit** (Tipo B): cuenta ordenes por flag + devuelve 10 samples con externalId/source/channel/trafficSource. Permite ver si los flags tienen sentido.
2. **Endpoint repair** (Tipo B): si los flags estan mal, repararlos primero. Reset al valor correcto.
3. **Endpoint cleanup** (Tipo B): borra solo lo que verdaderamente sea problema. Idempotente, soporta dryRun.

Orden: audit → repair → cleanup. Nunca cleanup directo.

### Prevención
- Default mental: **flag-based filtering en data legacy es sospechoso**. Verificar antes de tomar decisiones destructivas.
- Cuando cliente cuestiona un numero ("¿es posible que tenga X de eso?"), tomar la duda como señal de validar antes de proceder. Tomy detecto el bug. Yo iba a borrar la data legitima.

### Pattern relevante
Conexion con #S59-EXT2-NO-CONTRASTAR-CON-REALIDAD: ambos son "asumi que el flag/metric reflejaba realidad sin validar". La regla unificada: **siempre auditar antes de actuar sobre data en bulk**.

---

## Error #S60-EXT2-PEDIR-AL-USUARIO-PEGAR-URLS-EN-LUGAR-DE-USAR-WEBFETCH

**Cuándo pasó**: Sesión 60 EXT-2. Tomy reporto frustracion: "antes resolvias solo los problemas, ahora me dependes para pegar URLs". Tenia razon. Yo tenia disponible el tool `WebFetch` para invocar URLs publicas (incluyendo endpoints admin con `?key=...` que NO requieren sesion NextAuth), pero estaba pidiendo a Tomy que pegara las URLs en su navegador y me devolviera el JSON manualmente.

Resultado: dependencia innecesaria del usuario, perdida de velocidad, frustracion. Tomy debio empujarme a usar `WebFetch` cuando ya estaba disponible.

### Causa raíz
- Olvide que `WebFetch` puede pegarle a endpoints admin con auth via query param `?key=`.
- Asumi (sin verificar) que necesitaba la sesion del navegador del usuario para invocar endpoints admin.
- En sesiones anteriores (S57+), la dinamica era "armo URL → user pega → user me trae JSON". Quedo como habito.

### Regla
**Cuando un endpoint admin acepta auth via query param (`?key=...`), invocarlo YO con `WebFetch` en lugar de pedirle al user que lo pegue.** Patron:

```
WebFetch(`https://app.nitrosales.ai/api/admin/...?orgId=X&key=...`, "qué quiero del JSON")
```

Casos donde SI debo pedirle al user:
- Endpoints autenticados con sesion NextAuth (no aceptan `?key=`).
- Operaciones que requieren confirmacion explicita del user (cambios destructivos en prod).
- Cuando WebFetch tira timeout (>60s) y no puedo paginar el call.

### Prevención
- Default: **usar WebFetch primero**, pedir al user solo si falla.
- Si el endpoint es admin con `?key=`, lo invoco yo. Si requiere sesion, lo pego al user.
- Para endpoints lentos (timeout 60s), paginarlos: bajar `limit`/`max` y hacer N calls. Mejor que pedir al user que pegue 1 sola call de 5 minutos.

### Pattern relevante
Conexion con autonomia agentica. La regla general: **maximizar lo que puedo hacer YO sin involucrar al user**. El user esta para decisiones, no para ser un proxy de network requests.

---

## Error #S60-EXT2-GUARD-MARKETPLACE-USANDO-CAMPO-VTEX-AMBIGUO

**Cuándo pasó**: Sesión 60 EXT-2. Para evitar atribuir ordenes marketplace, agregue un guard al webhook VTEX:
```ts
const isMarketplaceOrder =
  orderId.startsWith("FVG-") || orderId.startsWith("BPR-") ||
  vtexOrder.origin === "Marketplace" || vtexOrder.origin === "Fulfillment";
```

Pero VTEX devuelve `origin: "Marketplace"` para TODAS las ordenes (incluso web propia). Es un detalle interno de VTEX que YA HABIAMOS DESCUBIERTO en S60 EXT-1 al diagnosticar el ingest, pero olvide al implementar el guard.

Resultado: el guard skipeaba atribucion para ordenes web propia tambien. Las ordenes se INSERTABAN OK pero quedaban sin attribution row.

### Causa raíz
- Olvide un descubrimiento de la misma sesion al implementar codigo nuevo.
- Confie en que el campo `origin` de VTEX significaba "marketplace en sentido comercial". No lo era.
- No hice cross-check con la captura del trigger-vtex-sync (commit de hace ~2 horas) que mostraba TODAS las ordenes con `origin: "Marketplace"` aunque eran web propia.

### Regla
**Antes de usar un campo de un sistema externo (VTEX, MELI, Meta, Google) como criterio de logica, verificar que su valor signifique lo que asumo.** Patron de check:

1. Buscar muestras del campo en data real (audit endpoint, query SQL).
2. Verificar que cubre solo el caso que quiero filtrar.
3. Si el campo es ambiguo, usar otra señal mas confiable (en este caso: prefijo del externalId, NO el campo `origin`).

### Prevención
- Cuando estoy por usar un campo de plataforma externa para logica destructiva (filtros, exclusiones, skips), pegar mentalmente: "¿este valor lo vi yo en data real? ¿en que sample?". Si no, agregar audit antes.
- Mantener un mental model de "fields de VTEX que son ambiguos" y revisarlos. Por ejemplo: `origin`, `salesChannel`, `trafficSource` (ya descubrimos que historicamente venia mal seteado).

### Pattern relevante
Conexion con #S60-EXT2-NO-VALIDAR-FLAGS-LEGACY: ambos son "asumi que un campo significa X cuando significa Y". Regla unificada: **antes de usar un flag/campo en logica, sample real**.

---

## Error #S60-EXT2-CRON-DIARIO-ES-INSUFICIENTE-COMO-RED-DE-SEGURIDAD

**Cuándo pasó**: Sesión 60 EXT-2. El sistema dependia del webhook VTEX (real-time) + cron diario `/api/sync` (3 AM) como respaldo. Los webhooks de VTEX tienen fallas intermitentes (perdida de eventos sin notificacion). El cron diario solo corria 1x/dia, asi que cualquier evento perdido por el webhook quedaba afuera hasta 24 hs despues. Resultado para TVC el 02/05: 24 ordenes faltantes en NitroSales DB.

### Causa raíz
- El cron `0 3 * * *` se diseno asumiendo que el webhook era confiable. No lo es.
- No habia metric/alerta cuando el webhook perdia eventos.
- Sin mas frecuencia de respaldo, gaps grandes silenciosos.

### Regla
**Para integraciones criticas via webhook con sistemas externos, NO depender solo del webhook. Tener un cron de respaldo frecuente (cada 30 min - 1 hr) que pegue a la API directamente y traiga las ultimas N horas, idempotente.**

Patron multi-tenant:
1. Cron `*/30 * * * *` que itera todas las orgs activas en la integracion.
2. Para cada org, pega a la API externa filtrando ultimas 24 hs.
3. Compara con DB y trae solo lo que falta (idempotente).
4. Devuelve resumen con `totalInserted` para monitoring.

Aplicado en S60 EXT-2: `/api/cron/vtex-sync-recent` cada 30 min.

### Prevención
- Cuando integro nueva plataforma via webhook (proximo: Arredo VTEX, etc), DEFAULT incluir cron de respaldo cada 30 min - 1 hr. No dejar para "despues".
- Pattern documentado: webhook (real-time) + cron 30min (red de seguridad) + cron diario (deep sync con consistency check). 3 capas.

### Pattern relevante
Conexion con #S52-VTEX-SYNC-FAIL-SILENTLY: ambos son "fallaba en silencio sin alertar". La regla unificada: **integracion critica = redundancia + monitoring activo**.

---

_Fin del archivo. Claude: si estás por cometer algo que se parece a uno de estos errores, PARÁ y releé la regla._
