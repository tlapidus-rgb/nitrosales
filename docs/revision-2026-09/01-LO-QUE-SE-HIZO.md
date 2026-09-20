# Lo que se arregló — 24 de 37 hallazgos

> 14 commits de código, todos en `fix/expansion-gate-e0`, **ninguno pusheado**.
>
> Cada arreglo está verificado por **mutación**: se reintroduce el bug y se confirma que el
> test se pone rojo. Ese paso frenó cuatro arreglos que ya estaban dados por buenos y eran
> cosméticos — están contados en `06-ERRORES-COMETIDOS.md`.
>
> Los códigos `R-NN` son los del informe original (`02-HALLAZGOS.md`).

---

## Seguridad — `540cf21e`

| | Qué pasaba |
|---|---|
| **R-01** | **Cinco crons se abrían mandando *nada*.** `if (syncKey !== process.env.SYNC_KEY)`: con la env sin setear, las dos puntas valen `undefined` y `undefined !== undefined` es **false**. Con una clave *incorrecta* devolvía 401, así que sólo se abría mandando nada — ningún escáner de claves lo encontraba. Se conseguía la lista de todas las organizaciones y el disparo de los mails de anomalías a todos los clientes. **Está en `main`**, no lo introdujo esta branch |
| **R-02** | **SQL injection** en `admin/validate-orders-count`: `?source=` entraba crudo a tres `$queryRawUnsafe`. Requería sesión de staff, pero convertía el set acotado de operaciones admin en lectura y escritura libre de toda la base |
| **R-03** | **`aura/creators/[id]/send-password` no autenticaba.** Único gate: `getOrganization()`, que sin sesión cae al fallback de organización única y devuelve la org igual. Un POST anónimo mandaba el link de set-password del creador a su casilla |
| **R-04** | **La clave del creador se podía romper a fuerza bruta.** El endpoint de verificación no tenía ningún límite |
| **R-05** | **Un preview podía filtrar `ADMIN_API_KEY`** a un host arbitrario: seis rutas pasaban el header `Origin` —que controla quien hace el request— a `selfFetchBaseUrl`, que en no-producción lo usa sin validar |

**Decisiones de diseño que vale revisar:**

- **R-01 no se arregló sólo cerrando el fail-open.** `vercel.json` les manda `ADMIN_API_KEY`,
  no `SYNC_KEY`, así que cerrarlo a secas dejaba a los cinco crons en 401 — y un cron que
  devuelve 401 no alerta a nadie. Se abrieron **dos puertas, las dos fail-closed**.
- **R-03 no se gateó con staff.** Lo llama la UI del **cliente**; el gate correcto es
  `getOrganizationIdStrict()`, que tira si no hay sesión.
- **R-04 no copió el limitador del archivo de al lado**, que permite 1 request/segundo por IP
  = 86.400 intentos diarios. Se agregó `src/lib/rate-limit.ts` con 5 intentos por minuto
  contados por **(IP + código del creador)**: sin el código en la identidad, rotar IPs —que es
  gratis— evade el límite entero.

**Lo que R-04 NO arregla, y está dicho en el código:** el hash sigue siendo SHA-256 sin sal, y
`dashboardPasswordPlain` sigue guardando la contraseña del creador sin hashear en la base.

---

## Plata y datos del cliente — `30e9b2ff`, `6886e6b2`, `5585cf2c`, `e608cd80`

| | Qué pasaba |
|---|---|
| **R-12** | **La facturación contaba órdenes de más.** `COUNT(*)` donde todo el resto del repo usa `COUNT(DISTINCT COALESCE("packId","externalId"))` — el schema lo dice sobre la columna: varias órdenes de un carrito de MELI comparten `packId`. Es una de las seis dimensiones que se **facturan**, y salía más alta que la que el cliente ve en su dashboard |
| **R-11** | **El filtro de PII de la exportación tenía agujeros reales y cero tests.** `appKey` no matchea `/apikey/i` —y es el nombre literal de la credencial de VTEX acá— y `/\bhash\b/` es inerte contra camelCase, porque no hay bordes de palabra |
| **R-33** | **Dos promesas falsas sobrevivieron a E-26**: "Recalibración semanal" en pantalla, y `modelo BG/NBD` **dentro del prompt del asistente** (o sea, se lo afirmaba al cliente). Los dos tests que tenían que cazarlas estaban verdes |
| **R-35** | **Las dos pantallas del margen decían cosas distintas.** Con 0 % de costos cargados, el mismo cliente veía "no podemos calcular tu margen" en una y **"Margen 100 % — Excelente"** en la otra |
| **R-15** | **Aurum opinaba del margen sin saber la cobertura**: el snapshot que se le publica dejaba esos campos afuera |
| **R-10** | **`SE_CONSERVAN` era configuración muerta.** Filtraba contra tablas con `organizationId`, y las cuatro que lista no la tienen → siempre `[]`. `email_log` y `leads` sobrevivían al borrado sin mencionarse en ninguna respuesta |

**Por qué los tests no veían R-33:** uno pedía un **espacio literal** entre dos palabras y
Prettier había partido la frase en dos líneas; el otro usaba `\b(bgnbd|bg_nbd)\b`, que **no
matchea `BG/NBD`** porque la barra ya es un borde de palabra.

**Por qué el test no veía R-12:** la tabla `orders` del fixture de PGlite no tenía columna
`packId`, así que el escenario era **inexpresable**.

---

## Trabajo que se perdía — `571f3cd0`, `0a4ab8d4`, `def18a17`, `a0773431`

| | Qué pasaba |
|---|---|
| **R-19a** | **Tres crons descartaban `persiste`.** `arranqueDeLaVuelta` devuelve `{desde, persiste}` justamente para que una corrida manual no mueva el cursor del incremental. Un `?orgCursor=` a mano sobre `digest` dejaba a las orgs de atrás sin su mail esa semana |
| **R-19b** | **`refresh-gold-attribution-channel` sin aislamiento por org.** `guardarCorte` vive después del loop y dentro del mismo `try`, así que una excepción se lo salteaba: el cursor quedaba clavado y **las orgs anteriores dejaban de refrescarse** |
| **R-20** | **El cupo de backfills no era atómico.** `SKIP LOCKED` evita que dos invocaciones tomen el mismo job, pero hace lo contrario para el cupo: la segunda se lleva **otra**. Dos backfills en paralelo con `maxConcurrentes = 1` — el escenario que E-08 dice haber cerrado |
| **R-21** | **`ml-processor` descartaba órdenes** pasado el offset 1000 de MELI, en silencio. La ventana de 7 días sólo "esquiva el límite" bajo ~142 órdenes/día; Arredo hace ~1.600 por semana |
| **R-28** | **`approve-backfill` escribía antes de poder abortar**: el 409 dejaba la org enrolada en la rotación de siete crons con el alta sin aprobar, y reaprobar no lo revertía |
| **R-18** | **El chequeo de frescura era ciego al cliente recién firmado**: enumeraba con un `GROUP BY` sobre la tabla vigilada, así que una org **sin una sola fila** no aparecía, no se medía, no alertaba |

⚠️ **Efecto lateral de R-21, avisado y aceptado:** los backfills de clientes grandes van a
tardar más y hacer más requests contra la API de MercadoLibre. La alternativa era seguir
perdiendo órdenes sin avisar.

---

## Errores que se reportaban como éxito — `a33b804c`, `decbaa3f`

| | Qué devolvía |
|---|---|
| **R-17a** | Fallo total de rollups → `ok: true` + HTTP 200, con cero filas escritas. Antes del aislamiento por org era un 500 |
| **R-17b** | `evaluarChecklist` → `listo: true` sin haber podido verificar un solo paso. El comentario decía que "no-se-sabe" no cuenta ni como pendiente ni como listo; el código lo contaba **como listo** |
| **R-17c** | `post-backfill-finalize` → `ok: true` con los cuatro pasos fallados |
| **R-34** | El purgado de caché devolvía `0` tanto al fallar como al no hacer nada, y el llamador sólo loguea si es mayor a cero. `api_cache` podía crecer en silencio — el bug que E-04 vino a arreglar |

---

## Tests que no podían ponerse rojos — `5483d249`

Seis falsos verdes, cada uno confirmado por mutación.

| | La mutación que quedaba en verde |
|---|---|
| **R-30** | Una inyección SQL escrita con un espacio antes del paréntesis. El escáner tenía un typo: `/^s*[(<]/` en vez de `/^\s*[(<]/` — `s*` matchea la letra ese |
| **R-31** | Borrar `if (key !== KEY) return 403` de una ruta admin, dejando el import. La lista de señales incluía dos **nombres de variable**. 38 rutas dependían sólo de eso |
| **R-32a** | Cambiar `if (!allowed) notFound()` por `void allowed` en el layout de admin |
| **R-32b** | Ponerle autenticación real al `GET` del webhook de VTEX — la única aserción era que existiera un **comentario** |
| **R-32c** | Sacar `BACKFILLING` del SQL de `checkStuckOnboardings`: el `toContain` corría sobre el archivo entero |
| **R-32d** | Reemplazar `crypto.timingSafeEqual` por `a === b` |

**El del escáner de inyección es el más serio:** es un guard de seguridad que se salteaba
llamadas en silencio, y como saltearlas sólo bajaba un contador, el `toBeGreaterThan(0)` seguía
pasando. Ahora el conteo está fijado.

---

## Encabezados que describían otra cosa que el código — `280e6459`

Siete. El defecto recurrente de la branch, en su forma más barata de arreglar y más cara de
dejar: un comentario que manda a alguien al lugar equivocado.

- `techo-de-orgs` decía `Auth: staff o ?key=` y 55 líneas después el código es staff-only.
- `meli-status` decía "seis copias, familia B de 2 archivos". Eran **siete**, 4 y 3.
- `domains/orders` decía "18 veces repetido" y, cuatro líneas abajo, "las 29 copias". Son 30.
- `backfill/vtex` describía dos factores de auth; el chequeo de la clave **se eliminó**.
- `reconcile` y `reattribute` documentaban `?key=ADMIN_SECRET`, que es otra variable y no está
  seteada en ningún lado.
- **`alerts-scheduler` describía como abierto un bug que esta misma branch cerró**, con
  referencias de línea que ya no apuntaban a nada.

Ese último, al reescribirlo, **destapó un hueco real**: el arreglo cubría "evaluó y no
disparó" pero no el camino de excepción. Una regla cuya query está rota seguía `dueNow` para
siempre y tapando la cola. Arreglado, con dos casos nuevos.

---

## Los 14 commits de código

```
decbaa3f  fix(cache): el purgado devolvía 0 tanto al fallar como al no hacer nada (R-34)
def18a17  fix(backfill): el cupo de concurrencia se verifica dentro del claim (R-20)
280e6459  fix(claims): siete encabezados que describían otra cosa que el código (R-37)
a0773431  fix(alertas): el chequeo de frescura era ciego al cliente recién firmado (R-18)
e608cd80  fix(borrado): la lista de lo que se conserva era configuración muerta (R-10)
0a4ab8d4  fix(backfill): dos que perdían trabajo en silencio (R-21, R-28)
f9878fe7  fix(alta): un timeout de VTEX dejaba al cliente rehaciendo credenciales sanas (R-25)
5585cf2c  fix(ui): dos lugares donde la pantalla afirma más de lo que sabe (R-15, R-27a)
6886e6b2  fix(pii): el filtro de la exportación tenía agujeros reales y cero tests (R-11)
571f3cd0  fix(crons): el cursor deja de pisarse, y una org rota deja de secuestrar la vuelta (R-19)
a33b804c  fix(honestidad): tres lugares que reportaban éxito sobre un fallo (R-17)
5483d249  fix(tests): los seis falsos verdes, cada uno verificado por mutación
30e9b2ff  fix(datos): la facturación no infla, y las dos promesas falsas que quedaban (R-12, R-33, R-35)
540cf21e  fix(seguridad): cerrar los cinco hallazgos de seguridad de la revisión (R-01..R-05)
```

Cada mensaje de commit explica **qué rompía** y **por qué el arreglo es ése y no otro**. Son
largos a propósito: el `git log` es el único lugar donde queda el razonamiento cuando el
código ya cambió.

---

## Módulos nuevos que aparecieron en el camino

| Archivo | Por qué |
|---|---|
| `src/lib/rate-limit.ts` | Limitador por identidad compuesta, con su propio test. El del archivo de al lado era demasiado permisivo para un oráculo de contraseña |
| `src/__tests__/crons-fail-closed.test.ts` | Guard: ninguna ruta compara contra una env sin verificar que exista |
| `src/lib/api-cache-shared.test.ts` | El módulo no tenía ninguno |
| `src/lib/comparacion-segura.test.ts` | Idem — y es la primitiva que decide si entra un request al webhook de VTEX y a todo endpoint admin |
