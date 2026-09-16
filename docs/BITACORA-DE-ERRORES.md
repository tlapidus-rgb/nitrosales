# Bitácora de errores — tanda de arreglos post-revisión

> **Qué es esto.** Un registro **vivo** de los errores que cometo mientras arreglo los
> hallazgos de `docs/REVISION-MULTIAGENTE-2026-09-14.md`. Se escribe en el momento, no al
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
