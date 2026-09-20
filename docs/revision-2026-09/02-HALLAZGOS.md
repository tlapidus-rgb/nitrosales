# Revisión multiagente de `fix/expansion-gate-e0`

> **Estado: 9 de 11 revisiones completadas.** Quedan sin correr dos que usaban skills
> (`security-review`, `code-review`), que solapan con lo ya cubierto.
>
> **Nada de esto está arreglado todavía.** El documento existe para decidir qué se
> arregla, en qué orden, y qué se acepta como deuda conocida.

## Cómo se armó

El diff tiene 127 archivos no-test. Se repartieron en lotes **disjuntos y exhaustivos**
con un script, no a ojo, para poder demostrar la cobertura: **127 asignados, 0 sin
asignar**. Cada lote fue a un revisor independiente, en solo lectura.

Los hallazgos marcados ✔ los verifiqué yo a mano contra el código, no son palabra del
revisor.

---

# 0 · Esto no espera al merge: está en `main`

## 0.1 · Cinco crons se abren mandando *nada* ✔

`cron/{ads-utm-audit, anomalies, digest, exchange-rates, inflation-index}`

```js
if (syncKey !== process.env.SYNC_KEY) { return 401 }
```

Si `SYNC_KEY` **no está seteada en Vercel**, `process.env.SYNC_KEY` es `undefined`. Un
request sin `?key=` y sin header deja `syncKey` también en `undefined`. Y `undefined !==
undefined` es **false** → pasa.

Lo perverso: con una clave *incorrecta* devuelve 401. Se abre sólo mandando *nada*, así
que ningún escáner que pruebe claves lo encuentra.

Qué se obtiene con `curl https://app.nitrosales.ai/api/cron/anomalies`, sin nada:
enumeración cross-tenant de toda la cartera de clientes (`{orgId, orgName, anomalies}`),
más el disparo de los mails de anomalías y del digest a los OWNER/ADMIN de **todos** los
clientes, más el escaneo de 7 días de `pixel_events` por org con 800 s de presupuesto —
DoS barato contra Neon.

**Está en `origin/main`, no lo introdujo esta branch.** Los ~36 endpoints `migrate-*` sí
tienen el guard correcto (`if (!key || key !== …)`); estos cinco no. `SYNC_KEY` no figura
ni en `.env.example` ni en `vercel.json`.

**Cómo confirmarlo sin riesgo:** mirar si la variable `SYNC_KEY` existe en Vercel. Mandar
el request sin parámetros *ejecuta* el cron contra producción, y con una clave inválida no
se distingue (los dos casos dan 401).

**Arreglo:** agregar `!syncKey ||` al principio de la condición, en los cinco.

## 0.2 · Tres más de seguridad ✔

- **SQL injection en `admin/validate-orders-count:43`.** `?source=` entra crudo a tres
  `$queryRawUnsafe`. Requiere sesión de staff, pero convierte "lo que puede hacer un
  staff" en lectura y escritura libre de toda la base — incluidas
  `influencers.dashboardPasswordPlain` y `connections.credentials`. **Es el único
  parámetro crudo que queda**: el barrido de las 854 llamadas raw dio limpio salvo ésta.
- **`aura/creators/[id]/send-password` no autentica.** Único gate: `getOrganization(req)`,
  que no es auth. Es el hermano exacto de `admin/aura-resend-onboarding` —manda el mismo
  mail con la misma función— y quedó afuera del arreglo porque el test barre
  `/api/admin/**` y éste vive en `/api/aura/**`. Un POST anónimo manda el link de
  set-password del creador a su casilla, las veces que se quiera.
- **La clave del creador se puede romper a fuerza bruta.**
  `public/influencers/[slug]/[code]/verify` no tiene rate limit; su hermano sí (dos veces).
  El link es público, la clave la elige el creador, el hash es SHA-256 sin sal, y según
  nuestro propio código los creadores reusan esa clave en otros lados.

**Y un paso que le falta al plan de rotación:** `admin/debug-vtex-hook-config` y
`admin/vtex-configure-broadcaster` devuelven la URL del webhook de VTEX, que lleva
`?key=<NEXTAUTH_SECRET>` adentro, a quien tenga `ADMIN_API_KEY`. Hoy es circular porque
los dos secretos son el mismo literal — pero el día que se roten a valores distintos, quien
tenga uno sigue leyendo el otro desde acá. **La rotación no separa nada mientras estos dos
endpoints existan así.**

---

# 1 · Lo que bloquea el merge

## 1.1 · El techo de organizaciones está ~18× inflado ✔

`src/lib/pixel/techo-de-orgs.ts`

El cálculo divide el trabajo por un **presupuesto diario agregado** (`invocacionesPorDia
× 250 s` = 10 h). Eso supone que el trabajo se reparte entre todas las invocaciones del
día.

No se reparte. El runner llama `backfillDay(cursor, orgs, table)` **sin `deadlineAt`**
(`rollup-backfill.ts:684`), así que la unidad de trabajo es *(un día × una tabla × TODAS
las orgs)* y es **indivisible**: entra entera en una invocación de 250 s o no entra. No es
un descuido — está documentado como decisión, y hay un guard test que lo clava.

| | publicado | con la restricción real |
|---|---|---|
| Ocupación | 2,7 % | ~49 % |
| Techo tamaño Arredo | **44** | **≈2** |
| Techo mezcla actual | 146 | ≈8 |

**Este es el número que se iba a comunicar.** La medición estaba bien; el método para
convertirla en un techo estaba mal.

Defectos secundarios del mismo módulo:

- La fórmula es algebraicamente `N / ocupación`, así que **sumar una org que no hace
  trabajo sube el techo** (4 orgs → 146; agregando una org de 0 ms → 182).
- Mide sobre `prisma.organization.findMany()` (todas) pero el loop de producción itera
  `SELECT DISTINCT "organizationId" FROM pixel_visitor_first_source` (sólo las que tienen
  pixel). Es el mismo desfasaje de poblaciones que ya dio "327.272 orgs" en el primer
  intento.
- Usa `ROLLUP_TABLES.length` = 8; la rotación real excluye `channel` y son 7. ✔
- **El input también está mal, y en la otra dirección** ✔: `porHoraGithub = 4`, pero el
  workflow hace `for i in 1 2` — son **2 hits por corrida**, o sea 8 por hora. El mismo
  hecho está calculado **bien en `rollups-cadencia.test.ts:89`** (que parsea el `for i in`)
  y mal en el endpoint. Subestima capacidad ~40 %, así que empuja para el lado
  conservador — pero el commit que corona el número se llama *"el techo ahora está
  medido"*, y el punto entero era dejar de usar cifras no verificadas.
- El header del endpoint dice `// Auth: staff o ?key=` y 55 líneas después el código es
  staff-only, con un comentario que argumenta por qué `?key=` **no** alcanza. Dos
  afirmaciones opuestas sobre el mismo handler, en el mismo archivo.

## 1.2 · Un preview puede filtrar `ADMIN_API_KEY` a un host arbitrario ✔

Seis rutas pasan `selfFetchBaseUrl(req.headers.get("origin"))`. **`Origin` lo controla
quien hace el request**, y en no-producción `selfFetchBaseUrl` hace `if (origin) return
origin` sin validar nada.

Camino: staff logueado abre una página hostil → `fetch` con `credentials:'include'` a una
ruta admin del preview → el navegador manda `Origin: https://evil.com` → el server se
auto-invoca contra `evil.com/api/...?key=<ADMIN_API_KEY>`.

No aplica en producción (ahí gana `NEXTAUTH_URL` antes de mirar el origin) y requiere
sesión de staff. Pero **el arreglo era para preview**, así que cambió un problema por
otro. El JSDoc de la función documenta `req.nextUrl.origin` (que sí es confiable); seis de
los ocho call sites pasan otra cosa.

Rutas afectadas: `admin/fix-vtex-creds-retry`, `admin/onboardings/[id]/{add-backfill-platform,
approve-backfill, force-complete-job}`, `admin/vtex-recover-customer-emails`, `api/insights`.

## 1.3 · El borrado completo no borra la organización ✔

`admin/orgs/[orgId]/borrar-todo`

La fila de `organizations` **no tiene columna `organizationId`**, así que ningún mecanismo
de descubrimiento la alcanza. Queda en la base con `settings`, que guarda **API keys, roles
custom e invitaciones pendientes**.

`wipe-account` —el endpoint viejo que este reemplaza— **sí la borraba**
(`wipe-account/route.ts:181`). Es una regresión contra lo que ya había.

Lo mismo con **`onboarding_requests`**: sin `organizationId` y sin una sola `REFERENCES`,
invisible a los dos mecanismos. Sobreviven el CUIT, el mail, el teléfono y el WhatsApp del
cliente, más sus credenciales de VTEX y el access token de Meta. `wipe-account` también las
borraba.

## 1.4 · La promesa falsa del wizard volvió, con otra plataforma ✔

`listo-para-enviar.ts:39` · `submit-wizard/route.ts:38`

`NO_VIAJAN_AL_BACKEND` contiene sólo `NITROPIXEL`. El backend acepta cuatro plataformas y
**Search Console no está entre ellas**. Un cliente que elige únicamente Search Console ve
la barra al 100 % en verde, el botón habilitado y "esperando aprobación" — y se crean
**cero** conexiones. Cuando el admin va a aprobar, el sistema le dice "el cliente no
completó el wizard", que es falso.

Es exactamente la clase de bug que E-29 cerró, con otro disparador. Son dos listas en dos
archivos y nada las une.

## 1.5 · La captura de leads no-VTEX está rota

`submit-wizard/route.ts:143-159`

Un prospecto de Shopify/Tiendanube/Woo viaja como `{platform:"VTEX",
credentials:{provider:"shopify"}}`. La validación corre **antes** del código que contempla
ese caso y pide Account Name, App Key y App Token — campos que la pantalla nunca mostró y
que no existen para Shopify. **400 sin salida posible desde la interfaz**, el mismo modo de
falla que la validación dice haber arreglado. Arrastra a todo el alta: un cliente con
MercadoLibre + Shopify tampoco puede enviar.

---

# 2 · Plata y números del cliente

## 2.1 · La facturación cuenta órdenes de más ✔

`src/lib/costos/consultas.ts:19`

Usa `COUNT(*)`. Todo el resto del repo usa `COUNT(DISTINCT COALESCE("packId",
"externalId"))` porque —dice el schema— *"varias órdenes de 1 carrito comparten packId,
COUNT DISTINCT para no inflar"*.

"Órdenes/mes" es una de las seis dimensiones que se **facturan**. Sale más alta que la que
el cliente ve en su dashboard, y el que cobra de más es la factura.

El test no lo puede ver: la tabla `orders` del fixture de PGlite no tiene columna `packId`.

## 2.2 · El tope de gasto de Aurum puede no frenar nunca

`aurum/consumo-actual.ts:66` → `costos/consumo-por-cliente.ts:85`

La cuota se mide con `usdConocido`, que **excluye a propósito** las filas cuyo modelo no
está en la tabla de precios. Esa exclusión es correcta para el reporte (que publica
`modelosSinPrecio` al lado), pero el camino de la cuota **tira esa lista**.

Si alguien cambia el id de modelo en `chat/route.ts` sin agregarlo a
`precios-de-modelos.ts`, cada llamada cuesta **$0 contra el tope**: `usado >= tope` nunca
se cumple y nunca degrada. Y no cae en el fail-open documentado — la query tuvo éxito, así
que reporta `medicionDisponible: true` y un `$0,00` confiado.

El módulo hermano dice, sobre esto mismo: *"Un costo de cero es una mentira que además da
tranquilidad."*

## 2.3 · El piso de volumen de las anomalías está bajo por √2

`src/lib/anomaly/piso-de-volumen.ts:58`

`ruidoEsperadoPct(n) = 100/√n` es el desvío de **un** conteo Poisson. Lo que se evalúa es
la diferencia entre **dos** conteos, cuya varianza es la suma: el ruido real es √2 ≈ 1,41×
mayor. Con `SIGMAS = 2` la vara efectiva es ~1,41σ, no 2σ — el comentario promete 5 % de
falsos positivos y la cola real es ~7,9 %.

Se suma un segundo factor: **la facturación no es un conteo**, es una suma de tickets, así
que su desvío relativo es `√((1+CV²)/n)`. Con CV≈1 (normal en ecommerce) se agrega otro
1,41×.

Efecto: para cualquier cliente con **45+ órdenes en el período**, la corrección
estadística de `revenueDrop` es inerte y el umbral de −30 % queda en ~1σ del ruido real →
un HIGH *"Facturación cayó 30 %"* falso aproximadamente **una semana de cada seis**. Es el
modo de falla que el módulo existe para evitar, corrido a la franja de 45-100 órdenes.

Los tests sólo prueban n=7 y n=300. La zona de falla es n≈45-100.

Tres defectos hermanos, en el mismo archivo:

- `base = max(current, previous)` es correcto para las caídas y **equivocado para las
  subas** (ahí el denominador es `previous`). Un "Facturación subió 67 %" se dispara al
  pasar de 6 a 10 órdenes, que es ruido puro — y le dice a alguien que repita una campaña
  que no hizo nada.
- **CPA y ROAS están atados a `orders`**, pero su ruido viene del conteo de conversiones de
  la plataforma de ads, que es otro número. `previous.conversions` está disponible y no se
  pasa.
- **La regla de margen no tiene ninguna corrección**: sólo `base >= 5`. Y como
  `grossMargin` es `revenue > 0 ? … : 0`, un período sin ventas dispara *"el margen se
  comprimió 45 puntos"* encima del aviso de "0 pedidos". El margen no se comprimió: no hubo
  ventas.

## 2.4 · Aurum opina del margen sin saber la cobertura

`finanzas/pulso/page.tsx:93`

El snapshot que se le publica a la IA reconstruye los datos con una whitelist de cuatro
campos y deja afuera `cogsCoverage` y `avisoDeCostos`. La **tarjeta** sí muestra el aviso
"⚠ sólo 25 % de los productos"; **Aurum no lo recibe** y contesta "tu margen es 78 %, muy
sano" sin un matiz. `tsc` no lo ve porque los dos campos son opcionales.

---

# 3 · Telemetría que no vigila

## 3.1 · E-20 no cubre el cron que motivó E-20 ✔

29 crons en `vercel.json`. **7 llaman `registrarLatido`.** Y `refresh-pixel-first-source`
—el que estuvo cinco semanas desagendado, el incidente entero por el que se construyó la
telemetría— **no late ni una vez**.

Si vuelve a salir de `vercel.json`, el detector sigue diciendo `"nunca-latió"`, igual que
antes. Sin transición de estado no hay señal.

Y los 22 restantes aparecen en rojo como `nunca-latió` **en cada mail, cada 6 horas, para
siempre** — la avalancha que el propio módulo dice querer evitar.

El test que faltaba es de una línea: cruzar `schedulesDeVercel()` real contra la lista de
routes que efectivamente laten.

## 3.2 · El guard de "no sé nada todavía" se desarma solo

`control/checks.ts:390` corta si `latidos.length === 0`. Pero `leerLatidos()` hace `SELECT
… FROM cron_cursors` **sin filtrar `last_run_at IS NOT NULL`**, y `guardarCursor` escribe
en esa misma tabla. Apenas un cron que **no late** guarde un cursor, el guard se desarma y
empieza la avalancha del punto anterior.

## 3.3 · Más defectos del latido

- **`control-alerts` no late en el camino feliz**: el `registrarLatido` está después del
  return temprano de "no hay problemas". El cron de salud sólo deja constancia cuando
  encuentra algo.
- Y late `ok: true` **después** de `sendEmail`, que nunca tira. Con Resend caído, el latido
  dice que todo salió bien mientras el único canal de salida está muerto.
- **Tres crons laten `ok: true` aunque todas las orgs hayan fallado**
  (`anomalies`, `digest`, `ads-utm-audit`): el JSON dice `ok:false` y el latido dice que
  sí. `motivo: "ultima-fallo"` nunca se dispara para esos tres.
- **`alertas-clientes` no late en su camino de falla más probable** (dos returns 502), así
  que se reporta como "atrasado" en vez de "falló", que es lo accionable.
- **`ml-reconcile` está dos veces en `vercel.json`** y las dos colapsan a la misma clave;
  gana la última (diaria). Si se cae el incremental de cada 2 h, el aviso tarda **3 días**.

---

# 4 · Cursores y trabajo que se pierde

- **Tres crons ignoran `persiste`** (`anomalies`, `digest`, `ads-utm-audit`) y guardan el
  cursor siempre. Una corrida manual con `?orgCursor=` pisa el cursor del incremental: el
  domingo siguiente el digest arranca donde quedó la corrida a mano y **las orgs de atrás no
  reciben su mail esa semana**. Es el bug que el módulo documenta como corregido.
- **`guardarCorte` sólo corre si la lambda vuelve.** Tres crons tienen 45 s de presupuesto
  y 60 s de `maxDuration`, o sea 15 s para una iteración completa — que en `digest` incluye
  una llamada a la API de Anthropic **sin timeout**. Si se pasa, Vercel mata la función, el
  cursor no avanza, y la próxima corrida muere en la misma org. Resultado idéntico al bug
  pre-E-11.
- **`refresh-gold-attribution-channel` no tiene try/catch por org.** Una org que falle
  siempre deja el cursor clavado y **las orgs anteriores dejan de refrescarse por
  completo** — regresión contra el estado previo, donde al menos esas se hacían. Su hermano
  `refresh-silver-orders` sí tiene el aislamiento.
- **El control de admisión del backfill no es atómico.** `contarJobsActivos` y
  `reclamarProximoJob` no comparten lock, y `FOR UPDATE SKIP LOCKED` hace lo contrario de
  lo que hace falta: la segunda invocación saltea la fila lockeada y se lleva **otra**. Dos
  invocaciones simultáneas salen con dos jobs en paralelo, con `maxConcurrentes = 1`. Es el
  escenario que E-08 describe como el que vino a cerrar.
- **`ml-processor` descarta órdenes en silencio pasado el offset 1000.** La ventana de 7
  días "esquiva el límite de MELI" sólo si el vendedor factura menos de ~142 órdenes/día;
  Arredo hace ~1.600 por semana. El chunk devuelve `error: undefined`, el job avanza y
  termina `COMPLETED`.

---

# 5 · Errores que se reportan como éxito

- **Fallo total de rollups → `ok: true` + HTTP 200.** Si fallan las 8 orgs, `backfillDay`
  devuelve cero filas escritas y el cron responde OK. Antes del aislamiento por org era un
  500. La única señal es un `console.error`. En el mismo archivo, la incoherencia **manda
  mail** precisamente porque "antes sólo lo logueaba y moría en los logs".
- **Una org nueva cuyos rollups fallan desde el día uno nunca alerta**: el chequeo de
  frescura enumera desde la **tabla de salida**, así que sin filas no aparece en el `GROUP
  BY` y no se mide. Es el escenario de "el recién firmado abre la app y la ve vacía".
- **`post-backfill-finalize` devuelve `ok: true`** aunque los cuatro pasos fallen. El daño
  que describe su propio comentario: cliente nuevo con costos en null, rentabilidad y P&L
  en cero, "con toda la pinta de estar bien", y nada lo reintenta.
- **`que-queda` y `borrar-todo` degradan en silencio**: si la query de dependencias falla,
  un `.catch(() => [])` deja las seis tablas indirectas sin contar ni borrar, y `que-queda`
  puede decir **"no queda ningún dato"** con tablas llenas. ✔
- **`evaluarChecklist` da `listo: true` cuando no sabe nada**: el comentario dice que
  "no-se-sabe" no cuenta ni como pendiente ni como listo, pero el código es `listo:
  pendientes === 0` y `pendientes` sólo cuenta `falta`/`mal`.
- **`reattribute` perdió la mitad del trabajo** ✔: `take: 2000` sin `skip`, sin cursor, sin
  `orderBy` y sin `hasMore`. El comentario dice "el caller repite"; repetir devuelve las
  mismas 2.000. Responde `success: true`. Antes procesaba todo.

---

# 6 · Promesas que el código no cumple

El defecto recurrente de la branch, ahora medido.

| Dónde | Qué promete | Qué pasa |
|---|---|---|
| `bondly/ltv/page.tsx:1123` ✔ | "Recalibración semanal contra conversiones reales" | No existe. **Y el test escrito para matarla está verde**: su regex pide un espacio literal y Prettier partió la frase en dos líneas |
| `lib/intelligence/handlers.ts:451` ✔ | Le manda al asistente `PREDICCIONES LTV (modelo BG/NBD)` | **La cuarta promesa falsa sobrevivió en el prompt.** Se sacó de la UI y quedó acá, así que el asistente se lo dice al cliente. El test no la ve por dos motivos: su regex busca `\b(bgnbd\|bg_nbd\|…)\b`, que **no matchea `BG/NBD`** por la barra, y el barrido sólo mira `.tsx` bajo `src/app` y `src/components` |
| `finanzas/confianza-del-margen.ts:24` ✔ | "Separado de las dos pantallas **para que digan lo mismo**" | **Sólo `/finanzas/pulso` lo usa.** `/finanzas/estado` sigue con `cogsCoverage < 50` escrito a mano en dos lugares. Con 0 % de costos cargados, el mismo cliente ve "no podemos calcular el margen" en una pantalla y **"Margen 100 % — Excelente"** en la otra. Es exactamente la divergencia que el módulo dice cerrar |
| `borrado.ts:36` | "Por eso el simulacro muestra `plan.orden` entero: quien lo corra tiene que reconocer lo que hay ahí adentro" | `plan.orden` **no contiene las tablas indirectas**. Se calculan aparte y se borran primero, pero no aparecen en el plan que revisa quien aprueba. `login_events` de esa org se van sin haber estado en la lista |
| `admin-key.ts:71` vs `webhook-key.ts:52` | Las dos mitades del mismo mecanismo de rotación | `webhook-key` lee `process.env` **en cada llamada** y explica con énfasis por qué leerla al importar estaría mal; `admin-key` la lee al importar. Criterios opuestos, y el que eligió el estricto explica por qué el otro está mal |
| `borrado.ts` + `que-queda` ✔ | "wipe-account borra 9 tablas; estas 8 ni aparecen en su código" | Nombra 38 tablas y 7 de las 8 sí están. Peor: `QUE_BORRA_HOY` está hardcodeado con esa lista, así que **el número que el endpoint produce está inflado** |
| `borrar-todo:61` ✔ | El simulacro muestra lo que queda afuera | `TODAS_LAS_TABLAS` es código muerto: nunca se calcula |
| `borrado.ts` `SE_CONSERVAN` | Cuatro tablas se conservan y se informan | Filtra sobre tablas que por construcción tienen `organizationId`; las cuatro no la tienen → **siempre `[]`**. `email_log` y `leads` sobreviven sin mencionarse en ninguna respuesta |
| `exportar:127` | "El orden por `id` hace que la paginación sea estable" | `LIMIT/OFFSET` no es estable con escrituras concurrentes. Y `estaCompleta` compara **totales**, así que un salteo compensado por una inserción da `completa: true` |
| `metrics/pixel:1684` | "El front puede decir 'no se pudo cargar' en vez de mostrar $0" | Ningún componente lee `_degraded`. Las cuatro páginas siguen mostrando $0 |
| commit `705799cd` ✔ | El snapshot del pixel se congeló **antes** del split | Snapshot, test y split entraron en el **mismo commit**. La evidencia es circular — *aunque la byte-identidad se verificó por afuera y **sí se cumple*** |
| `backfill/vtex:636` | "La clave deja de alcanzar por sí sola" (2 factores) | El chequeo de la clave se eliminó entero. Queda 1 factor (la sesión, que es más fuerte) |
| `alerts-scheduler:36` | Documenta un agujero "que no se arregla acá" | Esta misma branch lo arregló en `engine.ts:140`, con tests. Las referencias de línea ya no apuntan a nada |
| `repair-first-source:18` | "Auth: staff, y el middleware gatea /api/admin/*" | Acepta `?key=`, y el middleware devuelve `next()` para anónimos *(ya corregido)* |
| `meli-status.ts:14` | "seis copias, familia A 4 / familia B 2" | Son **siete**, 4 y 3. El test del mismo commit las lista bien y contradice al encabezado |
| `domains/orders:275` | "18 veces repetido" … `:279` "las 29 copias" | Son 30. Dos conteos contradictorios separados por cuatro líneas |
| `suspension` | `ok: true` al suspender | Nadie lee el estado; el cliente sigue entrando *(ya documentado con `seAplica: false`)* |

---

# 7 · Onboarding: lo que ve el cliente

- **Un timeout de VTEX se presenta como credenciales inválidas.** La guarda de "error
  transitorio" busca las palabras "timeout"/"error de red" en el detalle de nivel superior,
  pero cuando falla una de las seis áreas el detalle es `"⚠️ Parcial: 5/6 áreas OK"`. El
  cliente con credenciales correctas va a rehacerlas. El test que "pinea el acoplamiento"
  mockea un string que el productor nunca emite.
- **Problemas de calidad de datos bloquean el alta.** Falta el rol Pricing, un SKU sin
  marca, un depósito sin nombre → el alta no se puede enviar. Y `readiness.ts` dice, sobre
  el mismo dato, que la falta de costos **no bloquea** y se carga después. Las dos puntas
  dicen lo opuesto.
- **El semáforo da verde sin el Orders Broadcaster**, que es el paso que su propio archivo
  describe en mayúsculas como el que más duele olvidar ("ya rompió a TeVe Compras entero").
  El test que cubre ese caso se llama *"tener sólo uno de los dos no es estar listo"* y
  **nunca asserta `listo`**, que es `true`.
- **El semáforo no lo llama nadie**: no hay UI, y el botón de habilitar no lo consulta.
- **En el semáforo, "no sé" se convirtió en "está mal"**: un timeout de la plataforma
  colapsa a `false` y sale como *"pedirle al cliente las credenciales de nuevo"*. La rama
  que devuelve `null` es inalcanzable en producción.
- **El tilde del pixel se puede clickear a mano** y al hacerlo la UI dice **"Verificado: ya
  recibimos datos tuyos"** sin que haya llegado un evento. Antes decía "ya pegué el
  snippet", que era una afirmación del cliente; ahora miente con más autoridad.
- **La verificación del pixel depende del reloj del navegador del visitante** (el
  `timestamp` entra sin clamp). Un visitante con la hora corrida da "no llegó nada" con el
  pixel andando. Y la rama "recibió antes" da verde con **cualquier** evento histórico: si
  un deploy borra el snippet, sigue diciendo "el pixel está instalado".
- **`approve-backfill` escribe antes de abortar**: pone las conexiones en ACTIVE y después
  puede cortar con 409. La org queda enrolada en la rotación de siete crons sin que el alta
  esté aprobada, y reaprobar no lo revierte.
- **`force-complete-job` puede dejar estado inconsistente** de tres formas, incluida una
  que **le saca el producto a un cliente activo** (lo manda a `READY_FOR_REVIEW` → pantalla
  bloqueada). Y `completeJob` borra el `lastError` que el mensaje al admin le acaba de
  pedir mirar.
- **El wizard pide rango histórico de Meta Ads y Google Ads** con ETAs ("3-6 hs"), lo
  clampea y lo persiste. No existe ningún backfill para esas dos plataformas: el cliente
  elige "2 años" y no se trae una sola fila.

---

# 8 · Lo que se verificó y está bien

Para que nadie lo revise de nuevo:

- **El SQL de `metrics/orders` es byte a byte idéntico a producción.** Dos revisores
  independientes expandieron los helpers y diffearon contra `origin/main`: cero diferencias
  en las 72 ocurrencias. Ninguna métrica de ventas cambia.
- **El pixel emite JavaScript byte-idéntico.** Verificado por fuera del test, contra
  `origin/main`, carácter por carácter (62.471 = 62.471). Los tres puntos de corte son
  exactos y las dos interpolaciones viven en el tramo que recibe los parámetros.
  `attribution.ts` no se tocó en toda la branch.
- **El webhook CORE de VTEX cambió 2 líneas** y la nueva validación es **exactamente
  equivalente** a la anterior en las cuatro combinaciones posibles, salvo la diferencia
  intencional (acepta también la clave vieja durante una rotación).
- **`guardarCursor(null)` usa UPDATE y el latido sobrevive**; los tres crons que hacen las
  dos cosas llaman en el orden correcto.
- **`indiceDespuesDe` es correcto** en los cuatro bordes: org que desaparece, org que entra
  en el medio, cursor que ya no existe, presupuesto agotado en la primera org.
- **El total del mail de salud coincide** con lo que se renderiza: seis categorías contadas,
  seis mostradas.
- **Ningún presupuesto de tiempo cambió de valor** al pasar de literal a constante.
- **`grossMarginYTD: number | null`**: los tres consumidores manejan el `null`. No hay
  ningún lugar donde se pinte como 0 %.
- **Los precios de modelos de IA son correctos y están fechados**, con aviso a los 90 días.
- **Ninguna columna sensible se escapa hoy** de las 10 tablas que se exportan (revisadas
  columna por columna contra el schema). El riesgo es de regresión futura, no un leak
  activo — pero `esColumnaSensible` y `limpiarFila` **no tienen un solo test**.
- **No hay más bugs del tipo "variable inexistente en el `catch`"**: se escanearon los 290
  archivos con `@ts-nocheck` y el de `warm-cache` era el único.

---

# 9 · Cobertura de tests

## 9.1 · Corrección a una versión anterior de este documento ✔

Una versión previa listaba cinco módulos "sin tests". **Era incorrecto en tres de los
cinco**, y el error fue mío: lo tomé del informe de un revisor sin comprobarlo, que es
exactamente lo que le pedí a los revisores que no hicieran.

Sí tienen tests, y buenos, agregados por esta misma branch: `pixel/techo-de-orgs.ts`
(143 líneas), `cache/warm-plan.ts` (162) y `pixel/first-source-repair.ts` (257, contra
PGlite real).

## 9.2 · Lo que de verdad no está cubierto ✔

| Módulo | Por qué importa |
|---|---|
| `exportacion.ts` → `esColumnaSensible` / `limpiarFila` | `exportacion.test.ts` existe pero **no los menciona ni una vez**. Son lo único que impide que una credencial salga en la exportación que se le entrega al cliente |
| `api-cache-shared.ts` | Sin tests |
| `runRollupBackfill` (la capa de arriba de `backfillDay`) | Es la que decide `ok`, avanza el cursor y arma el `resume`. No se puede testear hoy: necesita Prisma. Ahí vive el hallazgo del §5 |
| El `GET` del webhook de VTEX | Ningún test lo ejecuta. Es de lo que depende que VTEX pueda dar de alta el hook de un cliente nuevo |
| `metrics/orders/route.ts` | 1.772 líneas, `@ts-nocheck`, cero tests. La ruta más importante del producto |

**Agujeros concretos de `PATRONES_SENSIBLES`, sin testear:** `appKey` no matchea
`/apikey/i` — y es el nombre literal de la credencial de VTEX en este repo. Tampoco están
`salt` ni `clave`, y `/\bhash\b/i` no matchea `pwdHash`.

---

# 9bis · Tests que están verdes y no deberían

Verificados **por mutación**: se reintrodujo el bug y el test siguió pasando.

| Test | Mutación aplicada | Resultado |
|---|---|---|
| `webhook-vtex-clave-rotable:51` | Se le puso auth real al `GET` del webhook | **verde 8/8** — la única aserción es `toContain("Allow GET without key…")`, que es **un comentario** |
| `admin-rutas-gateadas:52` | `if (!allowed) notFound()` → `void allowed` | **verde 18/18** — al guard le alcanza con *aparecer* en el archivo |
| `gates-conectados:103` | Se borró `if (key !== KEY) return 403` de un admin, dejando el import | **verde 31/31** — `SEÑALES_DE_AUTH` incluye `"NEXTAUTH_SECRET"` y `"ADMIN_API_KEY"`, que son **nombres de variable, no gates**. 38 rutas admin dependen hoy sólo de esas dos señales, incluidas 25 `migrate-*` que corren DDL sobre producción |
| `observabilidad-altas:42` | Se sacó `BACKFILLING` del SQL de `checkStuckOnboardings` | **verde 12/12** — el `toContain` corre sobre el archivo entero y lo satisfacen otras menciones |
| `backfill-vtex-hardening:56` | Inyección SQL con un espacio antes del paréntesis | **verde 12/12** — el escáner tiene un **typo**: `/^s*[(<]/` en vez de `/^\s*[(<]/`. `s*` matchea la letra `s`, no espacios. La misma inyección sin espacio sí da rojo |
| `comparacion-segura` + `admin-key` + `webhook-key` | `crypto.timingSafeEqual(ha,hb)` → `a === b` | **verde 15+12+15** — los bloques se llaman *"no filtra el secreto"* y sólo assertean el booleano, que `===` también acierta |

El del escáner de inyección es el más serio: es un guard de seguridad que se saltea
llamadas en silencio, y como al saltearlas sólo baja el contador, el
`expect(encontradas).toBeGreaterThan(0)` sigue pasando.

Y el de `gates-conectados` es doblemente incómodo: el docblock del propio test advierte
que *"una lista de señales que incluye algo que parece auth convierte al test en un sello
de goma"* — y después incluye dos.

---

# 10 · Lo que también se verificó y está bien

Además de lo del §8, de las tres últimas revisiones:

- **Las ~45 rutas de influencers NO filtran contraseñas de creadores.** Se barrieron las
  72 rutas y libs que tocan la tabla: cero `SELECT *`, cero escrituras de
  `dashboardPasswordPlain`, y los 14 `include` anidados tienen `select:` acotado. Están
  limpias **no** por el helper que escribimos (lo usan 2 archivos) sino porque todas usan
  `select:` explícito.
- **El cambio de secciones a capacidades no movió nada.** Con la tabla completa de
  combinaciones VTEX × MELI, antes y después son idénticas. Y es UX, no autorización:
  ningún endpoint de datos consulta el estado de sección para decidir si responde.
- **Las 110 fuentes nuevas de la branch no tienen un solo `@ts-nocheck`.** Los 21 archivos
  ciegos del diff son todos preexistentes que se modificaron. Eso acota mucho el riesgo.
- **Los 53 `WHERE "organizationId" = '${ORG_ID}'` de `metrics/orders` están cerrados**: la
  validación de formato se aplica en los cuatro lugares que el módulo dice.
- **El bypass por `user-agent: vercel-cron`** (spoofeable) se removió de las 8 rutas que lo
  tenían. Sobreviven sólo comentarios desactualizados que lo siguen anunciando.
- **Las DDL de los fixtures de `backfill_jobs`** son idénticas a la migración real.
- **No hay secretos en respuestas de error**: ningún endpoint devuelve un valor de
  credencial.

---

# 11 · Pendiente

- Dos revisiones con skills (`security-review`, `code-review`) que quedaron sin correr.
  Solapan con lo ya cubierto.
- **Confirmar si `SYNC_KEY` existe en Vercel** (§0.1). Es lo único de esta lista que puede
  estar abierto ahora mismo.
- El orden de arreglo, que se decide con este documento en la mano.
