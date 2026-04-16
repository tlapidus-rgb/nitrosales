# ERRORES_CLAUDE_NO_REPETIR.md — Errores que Claude NO debe volver a cometer

> **Instrucción**: Claude DEBE leer este archivo al inicio de cada sesión.
> Cada error está documentado con causa raíz y la regla que lo previene.
> Si Claude comete un error que ya está acá, es una falla grave de proceso.

> **Última actualización: 2026-04-15 — Sesiones 23-36**

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

_Fin del archivo. Claude: si estás por cometer algo que se parece a uno de estos errores, PARÁ y releé la regla._
