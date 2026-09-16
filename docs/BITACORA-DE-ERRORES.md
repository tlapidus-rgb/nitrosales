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
