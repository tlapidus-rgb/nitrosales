# Bitácora de errores — tanda de arreglos post-revisión

> **Qué es esto.** Un registro **vivo** de los errores que cometo mientras arreglo los
> hallazgos de `docs/revision-2026-09/02-HALLAZGOS.md`. Se escribe en el momento, no al
> final: un error que se documenta tres horas después ya perdió el detalle que lo hacía
> útil.
>
> **En qué se diferencia de `ERRORES_CLAUDE_NO_REPETIR.md`.** Aquel archivo guarda
> **patrones** destilados, con regla y prevención, y se lee al empezar cada sesión. Éste
> guarda **incidentes** de esta tanda, incluidos los chicos y los que no llegan a patrón.
> Cuando un incidente de acá se repite o resulta general, se promueve allá con su ficha
> completa.
>
> **Regla de escritura:** un error entra acá **apenas se detecta**, aunque se arregle en el
> mismo minuto. Los que se arreglan solos en treinta segundos son justamente los que después
> nadie recuerda y vuelven.

---

## Formato

```
### E-NN · Título corto
**Cuándo:** fecha · **Lo detectó:** yo / un test / un revisor / el usuario
**Qué hice mal:** …
**Cómo se manifestó:** …
**Por qué pasó:** …
**Qué hago distinto:** …
```

---

## Incidentes

### E-01 · Escribí la entrada sobre finales de línea mezclados con finales de línea mezclados

**Cuándo:** 2026-09-14 · **Lo detectó:** mi propio verificador de EOL, antes de commitear

**Qué hice mal:** el script que insertó la ficha `#S62` en `ERRORES_CLAUDE_NO_REPETIR.md`
dejó 122 líneas con LF dentro de un archivo que es CRLF.

**Cómo se manifestó:** el chequeo de EOL que corro antes de cada commit lo marcó. No llegó
al commit.

**Por qué pasó:** convertí el texto nuevo con `.replace(/\r?\n/g, fdl)`, pero el archivo de
origen en el scratchpad se leyó después de calcular `fdl`, y la conversión se aplicó sobre
un buffer que ya tenía otra forma. El detalle exacto importa menos que esto: **lo hice mal
en el commit que documenta ese error**.

**Qué hago distinto:** el chequeo de EOL deja de ser algo que corro cuando me acuerdo y pasa
a ser parte del cierre de toda tanda de edición por script, junto con `tsc` y la suite. Ya
está incorporado a la rutina desde este commit.

---

### E-02 · Di por cierta la lista de "módulos sin tests" de un revisor

**Cuándo:** 2026-09-14 · **Lo detectó:** otro revisor, no yo

**Qué hice mal:** copié al documento consolidado una lista de cinco módulos "sin tests" que
venía en un informe. Tres de los cinco **sí tenían tests**, buenos y agregados por la misma
branch.

**Cómo se manifestó:** el auditor de tests lo corrigió en su informe. El documento ya estaba
entregado.

**Por qué pasó:** apliqué escrutinio a los hallazgos graves y lo bajé para los que sonaban
administrativos. Una lista de archivos parece inventario, no una afirmación — pero es igual
de falseable y costaba un `ls`.

**Qué hago distinto:** las afirmaciones baratas de comprobar (existe / no existe, cuántas
líneas, si un símbolo aparece) se comprueban **siempre**. Y en los documentos, marcar con
`✔` lo verificado por mí y dejar lo demás atribuido al revisor.

Promovido a `ERRORES_CLAUDE_NO_REPETIR.md` → `#S62-TOME-POR-CIERTO-EL-INFORME-DE-UN-SUBAGENTE`.

---

### E-03 · Escribí un guard que marcó siete archivos sanos, y casi los "arreglo"

**Cuándo:** 2026-09-15 · **Lo detectó:** yo, al verificar antes de editar

**Qué hice mal:** el primer guard de R-01 marcaba cualquier
`if (x !== process.env.Y)` sin verificación de existencia de la env. Señaló siete rutas
(`health`, `sync/chain`, `sync`, `sync/reconcile`, `sync/fix-prices`, `sync/vtex-stock`,
`analyze/creative`) **que no tienen el bug**.

**Cómo se manifestó:** el test falló en estado limpio con siete archivos listados. Mi primer
impulso fue leerlo como "el guard encontró más casos reales" y arreglarlos.

**Por qué pasó:** copié la **forma sintáctica** del bug en vez de su **condición**. El
fail-open necesita que la variable valga exactamente `undefined`:

```
undefined !== undefined  →  false   ← entra
null      !== undefined  →  true    ← 401, correcto
""        !== undefined  →  true    ← 401, correcto
```

`searchParams.get("key")` devuelve `null`, nunca `undefined`. Lo que produce `undefined` es
el **optional chaining** (`headers.get("authorization")?.replace(…)`), que es justo lo que
tenían los cinco crons rotos y no tenían las siete sanas.

Lo salvó una costumbre, no un proceso: antes de editar siete archivos fui a ver **contra qué
env** comparaban, y ahí apareció que la forma de leer la clave era distinta.

**Qué hago distinto:** un guard nuevo se prueba en las dos direcciones, no en una. Que se
ponga rojo con el bug puesto **no alcanza**: hay que confirmar que esté verde sobre el código
sano. Si falla en limpio, la primera hipótesis es **que el guard está mal**, no que encontró
más casos — sobre todo cuando encuentra muchos de golpe.

Es una variante de `#EL-TEST-ESTABA-MAL-NO-EL-CODIGO`, con el agravante de que el desenlace
habría sido *modificar código correcto* en siete archivos de auth.

---

### E-04 · Rompí un archivo de tests usando `node -e` con backslashes, sabiendo que no se puede

**Cuándo:** 2026-09-15 · **Lo detectó:** el propio test, que pasó a reportar "no tests"

**Qué hice mal:** inserté un bloque en `self-fetch-entorno.test.ts` con `node -e '...'` desde
bash. El shell se comió **todos** los backslashes: `/\r?\n/` quedó como un regex con un salto
de línea real adentro, y `/selfFetchBaseUrl\s*\(/` quedó como `/selfFetchBaseUrls*(/`. El
archivo dejó de parsear.

**Cómo se manifestó:** la suite no dijo "falló", dijo **"no tests"** — y las tres corridas de
mi propia batería de mutación imprimieron `Tests  no tests` sin que ninguna fallara. Si no
hubiera mirado el número, habría leído las tres líneas iguales como "el guard no distingue" en
vez de "el archivo no compila".

**Por qué pasó:** es un hazard que ya estaba documentado en esta misma sesión y que ya me
había mordido antes. Lo hice igual porque el bloque parecía corto.

**Qué hago distinto:** **ningún script con backslashes pasa por el shell.** Se escribe a un
`.cjs` en el scratchpad con la herramienta de escritura y se corre con `node <archivo>`. Sin
excepción por "esto es corto".

Y una segunda lección, del diagnóstico: `Tests no tests` **no es un resultado**, es un archivo
que no compila. Cuando una batería de mutación devuelve tres veces lo mismo, la primera
hipótesis es que no está corriendo nada.

(Reparación: `git checkout` del archivo y rehacer el cambio con un `.cjs`. No quedó nada del
intento fallido.)

---

### E-05 · Rompí dos archivos más escribiendo prosa que cierra su propio contenedor

**Cuándo:** 2026-09-15 · **Lo detectó:** el parser, las dos veces

**Qué hice mal:** dos veces seguidas, en archivos distintos, escribí un comentario cuyo
**texto** termina el bloque que lo contiene:

1. En `promesas-del-producto.test.ts` quise explicar, dentro de un JSDoc, que el problema eran
   los comentarios JSX de bloque. Para escribir la secuencia de cierre sin cerrarlo, la partí
   en dos strings concatenados — que al escribirse al archivo se **reunieron** y lo cerraron
   igual.
2. En `consumo-por-cliente-sql.test.ts` escribí un comentario SQL que citaba código entre
   backticks, adentro de un template literal de TypeScript. El primer backtick cerró el
   template.

**Cómo se manifestó:** las dos veces, `Tests  no tests`. Ninguna dijo "falló".

**Por qué pasó:** escribí la prosa pensando en el lector y no en el parser. El detalle
irónico del primero: el error fue *al explicar exactamente ese tipo de error*.

**Qué hago distinto:** dentro de un comentario de bloque o de un template literal, la prosa
**no cita sintaxis**. Se describe en palabras ("un comentario JSX de bloque", "el conteo de a
una fila") en vez de mostrar los caracteres. Si hay que mostrarlos sí o sí, van en un
comentario de línea afuera del bloque.

Y la señal de diagnóstico, que ya vale para los tres casos de hoy: **`Tests no tests` es un
archivo que no compila**, no un resultado.

---

### E-06 · Escribí `base()` donde el helper se llama `db()`

**Cuándo:** 2026-09-15 · **Lo detectó:** el test, al correrlo

**Qué hice mal:** los dos casos nuevos que agregué a `consumo-por-cliente-sql.test.ts`
llamaban a `base()`. El helper de ese archivo se llama `db()`.

**Cómo se manifestó:** `ReferenceError: base is not defined`. Y de paso apareció un segundo
descuido: mi regex para completar los `INSERT` existentes con las columnas nuevas no cubrió
uno que estaba escrito en una sola línea, así que ese test rompió por número de columnas.

**Por qué pasó:** escribí los casos nuevos de memoria, copiando la forma de otros tests que
había leído hacía rato, sin volver a mirar el archivo.

**Qué hago distinto:** al agregar un caso a un archivo de tests existente, releer los helpers
de **ese** archivo antes de escribir, no después de que falle. Cuesta un `grep` y evita dos
vueltas.

Es menor y se arregló en un minuto — entra igual, porque los que se arreglan en un minuto son
los que vuelven.

---

### E-07 · Casi dejo una página rota en runtime: mi script leyó sus propios comentarios

**Cuándo:** 2026-09-15 · **Lo detectó:** yo, al no ver el `ok [import]` que esperaba

**Qué hice mal:** el script que arregló `/finanzas/estado` agregaba el import sólo si el
archivo no mencionaba ya el módulo:

```js
if (!s.includes("confianza-del-margen")) { …agregar el import… }
```

Para cuando corría ese chequeo, el script **ya había insertado tres comentarios** que
mencionan `confianza-del-margen.ts` explicando el arreglo. Así que el chequeo dio falso y el
import **nunca se agregó**, mientras el código nuevo llamaba a `confianzaDelMargen()` en
cuatro lugares.

**Cómo se manifestó:** casi no se manifiesta. `npx tsc --noEmit` **pasó limpio**, porque el
archivo tiene `// @ts-nocheck` en la línea 1. La página habría explotado recién en el
navegador, con `confianzaDelMargen is not defined`, en la pantalla de finanzas de un cliente.

Lo agarré porque el script no imprimió el `ok [import]` que yo esperaba ver. Un paso de log
que puse por costumbre, no por diseño.

**Por qué pasó:** dos causas que se combinaron:

1. **El chequeo leyó mi propia prosa.** Es el `#S61` de siempre —el test que lee sus
   comentarios— pero esta vez del lado del script de edición, y con el agravante de que el
   script **crea** el texto que después confunde a su propio chequeo. El orden de las
   operaciones lo garantizaba.
2. **`tsc` es ciego en 290 archivos de este repo.** Ya lo sabía, está escrito en todos los
   briefs que le di a los revisores, y aun así corrí `tsc` y canté "OK".

**Qué hago distinto:**

- Un chequeo de "¿ya existe este import?" mira **líneas que empiezan con `import`**, nunca el
  archivo entero:
  ```js
  lineas.some(l => l.startsWith("import ") && l.includes("<módulo>"))
  ```
- Y al tocar un archivo con `@ts-nocheck`, `tsc` no cuenta como verificación: hay que correr
  `next build`, que es lo único que los mira.

---

### E-08 · Mi primer arreglo de un falso verde era, otra vez, un falso verde

**Cuándo:** 2026-09-15 · **Lo detectó:** la mutación, no yo

**Qué hice mal:** el test de `checkStuckOnboardings` verificaba
`expect(CHECKS).toContain("BACKFILLING")` sobre el **archivo entero**. Lo "arreglé" recortando
al cuerpo de la función.

No alcanzaba: adentro de esa función vive `BACKFILLING_HORAS`, así que
`toContain("BACKFILLING")` seguía pasando aunque el SQL dejara de mirar ese estado. Arreglé la
forma del bug y no su causa.

**Cómo se manifestó:** la mutación —cambiar el literal del `IN (...)`— quedó **verde**.

**Por qué pasó:** apunté al síntoma reportado ("mira el archivo entero") en vez de a la
propiedad ("¿el SQL filtra por ese estado?"). Recortar el alcance es una mejora, pero la
aserción seguía siendo una búsqueda de texto que otra cosa podía satisfacer.

**Qué hago distinto:** al arreglar un test flojo, la pregunta no es "¿achico el alcance?" sino
**"¿qué otra cosa del archivo puede satisfacer esta aserción?"**. Acá la respuesta era una
constante con el mismo prefijo, y se resuelve pidiendo el literal SQL con sus comillas
(`'BACKFILLING'`) en vez del nombre suelto.

Y lo que lo agarró fue la mutación, que ya es política: **un arreglo de test no está terminado
hasta que la mutación correspondiente se pone roja.** Sin ese paso, hoy habría tres arreglos
cosméticos más en el repo, con la tranquilidad de haberlos "cerrado".

---

### E-09 · Cuarta vez en el día con `node -e` y escapes

**Cuándo:** 2026-09-15 · **Lo detectó:** el parser de node

**Qué hice mal:** volví a pasar un script con `\n` dentro de strings por `node -e '...'`. El
shell se comió los escapes y dejó saltos de línea reales dentro de un string literal.

**Por qué pasó:** ya lo tenía escrito como regla en E-04, de hoy mismo. La rompí tres veces
más el mismo día, siempre con el mismo razonamiento: *"este es cortito"*.

**Qué hago distinto:** la regla pasa a ser mecánica, sin juicio de tamaño. **Si el texto lleva
un backslash, no va por el shell.** Y para editar un archivo del scratchpad ya escrito, la
herramienta de edición directa es más rápida que volver a generarlo.

---

### E-10 · Tres intentos para escribir un guard que distinguiera algo

**Cuándo:** 2026-09-15 · **Lo detectó:** la mutación, las tres veces

**Qué hice mal:** el guard de "una org rota no secuestra la vuelta de las demás" (R-19) me
llevó tres versiones, y cada una falló por un motivo distinto:

1. **Regex con distancia fija.** `/for\s*\([\s\S]{0,400}?\btry\s*\{/` — marcó en rojo un cron
   **correcto**, porque entre el `for` y el `try` había más de 400 caracteres. El largo del
   cuerpo de un loop no es una propiedad que valga la pena clavar en un test.
2. **Regex atada a nombres de variable.** Pedía `fallos|failures|console.error`, y
   `refresh-silver-orders` anota en `results.push({ org: id, ok: false })`. Volví a marcar en
   rojo código correcto — y es **exactamente el error que acabo de arreglar en otros seis
   tests** (R-31: atarse al nombre en vez de a la propiedad).
3. **Criterio demasiado laxo.** "Hay un catch en el loop" pasaba igual sin el aislamiento,
   porque ese archivo tiene **otro** try/catch más arriba, para las reglas de canal, que hace
   un fallback silencioso.

La versión que quedó pide que algún catch **registre qué organización falló**: un catch que no
lo sabe no sirve para operar, y el fallback de las reglas de canal no lo menciona.

**Por qué pasó:** las tres veces escribí el regex mirando **el archivo que tenía adelante** en
vez de la propiedad que quería afirmar. La 1 y la 2 lo sobre-ajustaron a la forma de un
archivo; la 3 se quedó con algo que cualquier archivo satisface.

**Qué hago distinto:** antes de escribir un guard estructural, contestar por escrito dos
preguntas:

- *"¿qué código correcto podría marcar en rojo?"* (mató a las versiones 1 y 2)
- *"¿qué código incorrecto podría dejar en verde?"* (mató a la 3)

Y probarlo **en las dos direcciones**, siempre: verde sobre todos los archivos sanos, rojo
sobre el bug. Con una sola dirección no alcanza, y esto ya me pasó en E-03.

**Lo que salvó las tres veces fue la mutación, no yo.** Es la única razón por la que no quedó
un guard cosmético en el repo — y también la razón por la que esta entrada existe en vez de
un commit que dice "guard agregado".

---

### E-11 · Escribí un test que saltea la función que estoy arreglando

**Cuándo:** 2026-09-15 · **Lo detectó:** la mutación

**Qué hice mal:** el arreglo de R-25 es que un timeout de VTEX deje de
presentársele al cliente como "tus credenciales están mal". La conversión ocurre en una línea:

```ts
ok: x.ok ? true : esTransitoria(x.detail) ? null : false
```

Escribí los tests construyendo el resultado **a mano**, con `ok: null` ya puesto. O sea que
probaban que `mensajeParaElCliente` ignora los nulos — cierto, y completamente al lado de lo
que estaba arreglando.

**Cómo se manifestó:** vaciar `SEÑALES_DE_FALLA_TRANSITORIA` —el corazón del arreglo— dejaba
mis dos casos **en verde**. Los que se pusieron rojos fueron los tests viejos del archivo.

**Por qué pasó:** armé el input en el formato que la función *devuelve* en vez del que
*recibe*. Es más cómodo: no hay que mockear nada. Y produce un test que nunca toca el código
en discusión.

**Qué hago distinto:** antes de escribir el caso, ubicar **la línea exacta** que implementa el
arreglo y preguntarme por dónde tiene que entrar el input para pasar por ahí. Si el caso no
atraviesa esa línea, no prueba el arreglo — por más que el nombre diga que sí.

Los casos de al lado en ese mismo archivo ya lo hacían bien (mockean el tester y llaman a
`validarCredenciales`). No los miré antes de escribir los míos, que es el mismo descuido de
E-06.

---

### E-12 · Puse un número de tests en un commit sin mirarlo

**Cuándo:** 2026-09-15 · **Lo detectó:** la salida del comando, justo después

**Qué hice mal:** el mensaje del commit `6886e6b2` dice "1409 tests en verde". Eran **1420**.
Escribí el número de memoria mientras redactaba, y la verificación que corrí un segundo
después lo desmintió.

**Por qué importa aunque sea chico:** es exactamente el patrón que vengo documentando y
arreglando toda la sesión — un número afirmado sin comprobar, en un lugar donde alguien lo va
a leer como dato. Que sea de un mensaje de commit y no de un endpoint no lo cambia.

**Qué hago distinto:** el número va **copiado de la salida**, no escrito. Si estoy redactando
el commit antes de correr la verificación final, va sin número.

---

### E-13 · Mi chequeo de "¿ya lo hice?" volvió a leer el texto que yo había escrito

**Cuándo:** 2026-09-15 · **Lo detectó:** el script, que dijo "ya estaba" sobre algo que no
existía

**Qué hice mal:** el script que agrega los tests de R-18 arrancaba con
`if (crudo.includes("R-18")) { console.log("ya estaba"); exit }`. Un paso antes, otro script
**mío** había insertado en ese mismo archivo un comentario que dice `(R-18)`. Así que el
chequeo dio verdadero y los tests no se agregaron.

**Cómo se manifestó:** el script imprimió "ya estaba" y la suite siguió con los mismos 13
tests de antes. Lo agarré porque el número no se movió.

**Por qué pasó:** es **E-07 otra vez**, y E-07 es de esta misma sesión. Un chequeo de
idempotencia que busca una cadena corta y genérica en un archivo que yo mismo acabo de editar
con esa cadena adentro.

**Qué hago distinto:** el centinela de idempotencia no puede ser el código del hallazgo —
`R-18`, `#S62`, etc.— porque eso aparece en todos los comentarios que escribo. Tiene que ser
algo que **sólo existe si el cambio se aplicó**: el nombre del `describe`, la firma de la
función, el identificador nuevo.

Tres apariciones del mismo patrón en un día (E-07, E-11 en su forma de "leer el formato
equivocado", y ésta) dicen que no es distracción: es que **escribo el chequeo mirando lo que
quiero encontrar en vez de lo que distingue los dos estados**.

---

### E-14 · Mi script y el de un subagente tenían el mismo nombre en el scratchpad

**Cuándo:** 2026-09-30 · **Lo detectó:** yo, porque la salida no tenía el formato de siempre

**Qué hice mal:** usé `crlf.cjs` en el scratchpad, que es compartido con los subagentes. Un
subagente escribió **su** `crlf.cjs`, con la ruta de **su** checkout fija adentro, y pisó el
mío. Mi siguiente llamada normalizó un archivo del checkout del subagente en vez del mío.

**Cómo se manifestó:** la salida decía "bytes 1566 LF sueltos 0" en vez de "CRLF n / LF n".
Revisé: mi archivo estaba entero y el del subagente no cambió de contenido (sólo finales de
línea que ya estaban bien). Pudo haber sido peor: un script de edición con el mismo nombre
habría escrito en el directorio equivocado sin avisar.

**Qué hago distinto:** los scripts del scratchpad llevan prefijo propio (`claude-…`), y a los
subagentes les indico un prefijo distinto. Y si una salida no tiene el formato que espero,
paro antes de seguir.

---

### E-15 · Usé `information_schema` para preguntar si una tabla existe

**Cuándo:** 2026-09-30 · **Lo detectó:** el revisor independiente, reproduciéndolo en PGlite
con un rol sin permisos

**Qué hice mal:** el checklist de merge preguntaba si existían las migraciones mirando
`information_schema`. Esas vistas **sólo muestran lo que el rol actual puede ver**: una tabla
creada desde la consola con otro rol, y sin GRANT a la app, aparece como inexistente.

**Cómo se habría manifestado:** el checklist habría dicho "falta, corré la migración", y
correrla no cambia nada (`IF NOT EXISTS`). Un paso rojo para siempre, con la instrucción
equivocada. Además miraba permisos en una sola de las tres tablas nuevas, con un comentario
que justificaba eso y era falso.

**Por qué pasó:** mis tests corrían como superusuario, donde todo es visible y todo está
permitido. El fixture no se parecía a producción en lo único que importaba: el rol.

**Qué hago distinto:** existencia por catálogo (`to_regclass`, `pg_attribute`), permisos por
separado, y un test con `CREATE ROLE` + `SET ROLE`. Cuando algo depende de permisos, el test
corre con un rol que no los tiene.

---

### E-16 · Un test que no creaba la condición que decía probar

**Cuándo:** 2026-09-30 · **Lo detectó:** la mutación

**Qué hice mal:** el test "la memoria no revive a un usuario que la base ya dijo que no
existe" arrancaba sin ninguna verificación previa. Con o sin el arreglo, el resultado era el
mismo: bloqueado. La mutación que sacaba el arreglo lo dejó verde.

**Qué hago distinto:** el escenario tiene que tener el estado que el bug aprovecharía: acá,
un usuario verificado antes, borrado después, y recién ahí el corte. Es la forma E-11 de
nuevo: el test tiene que poder distinguir los dos mundos.

---

### E-17 · Puse en el informe final un hallazgo de un revisor sin verificarlo

**Cuándo:** 2026-09-30 · **Lo detectó:** yo, al ir a arreglarlo

**Qué hice mal:** `07-ESTADO-FINAL.md` listaba como riesgo R4 ("la verificación del afiliado
VTEX exige la ruta de órdenes y está mal"). Lo reportó un revisor citando `CLAUDE.md`, y lo
copié. Al ir a arreglarlo, el código dice lo contrario: la propia app le indica al cliente
que configure el afiliado apuntando a `/api/webhooks/vtex/orders`
(`/api/me/vtex-affiliate-info`, el onboarding). La verificación de Codex era correcta; lo
desactualizado era `CLAUDE.md`, y yo lo había copiado a la versión nueva.

**Qué hago distinto:** en un informe, cada hallazgo dice si lo verifiqué yo. Los que no,
van marcados como "reportado", y no los arreglo ni los doy por ciertos sin leer el código.
Un documento del repo no es evidencia de cómo funciona el código.

---

### E-18 · Escribí en el informe una consecuencia que no verifiqué

**Cuándo:** 2026-09-30 · **Lo detectó:** yo, al ir a repetirla en el documento para Tomy

**Qué hice mal:** en la decisión D1 del informe 07 escribí que con el secreto filtrado se
podían "cargar órdenes falsas en otro cliente" por el webhook de VTEX. Lo deduje de que el
webhook acepta la clave con cualquier `org`. No lo leí: el webhook no confía en el payload,
va a buscar la orden a VTEX con las credenciales de esa organización. Lo peor que se logra es
que vuelva a leer una orden real.

**Cómo se manifestó:** nada todavía, porque lo verifiqué antes de mandárselo a Tomy. Al
verificarlo encontré lo que sí pasa, que es más grave (datos de compradores de cualquier
organización por las rutas de `/api/admin` que aceptan la clave).

**Qué hago distinto:** es E-17 de nuevo, ahora con una deducción propia en vez de una ajena.
La consecuencia concreta de un hallazgo de seguridad ("qué consigue alguien con esto") se
escribe después de leer el camino completo, nunca por analogía con la forma de la entrada.

---
