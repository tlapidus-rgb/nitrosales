# Revisión de `fix/expansion-gate-e0` — carpeta completa

> **Para quien revise esto sin haber estado.** Acá está todo: qué se revisó, qué se encontró,
> qué se arregló, qué falta, y los errores que cometí en el camino. Los documentos están
> numerados en orden de lectura.

---

## En una página

**El proyecto.** NitroSales: analítica de e-commerce multi-tenant (Next.js en Vercel, Postgres
en Neon, Prisma). Hoy tiene 4 clientes; el objetivo es sumar más, y por eso se armó un plan de
33 tareas (`PLAN_EXPANSION.md`) para levantar los techos técnicos antes de vender.

**La branch.** `fix/expansion-gate-e0`, **126 commits por delante de `origin/main`**, 136
archivos de código no-test modificados. **Nada de esto está en producción.** La decisión fue
explícita: todo el plan entra en una sola branch, se prueba y se revisa entero, y recién ahí se
mergea.

**Qué pasó en esta revisión.** Antes de mergear se hizo una revisión completa con **nueve
revisores independientes en paralelo**, cada uno con un lote disjunto de archivos (la partición
se hizo con un script para poder demostrar la cobertura: 127 de 127 archivos asignados, cero
sin asignar). Encontraron **37 hallazgos**.

De esos 37: **24 arreglados** (18 commits), **12 esperando una decisión de negocio**, **1
pausado** porque su arreglo depende de una de esas decisiones.

**Estado hoy:** 1.440 tests en verde, `tsc --noEmit` limpio, `next build` OK, los tres guards
de build OK. Sin pushear, sin mergear.

---

## Los documentos, en orden

| # | Archivo | Qué es |
|---|---|---|
| 01 | `01-LO-QUE-SE-HIZO.md` | Los 24 hallazgos arreglados, agrupados por tipo, con el commit de cada uno y qué rompía en concreto |
| 02 | `02-HALLAZGOS.md` | **El informe original de la revisión.** Los 37 hallazgos con `archivo:línea` y escenario de falla. Incluye una sección de lo que se verificó **y está bien** |
| 03 | `03-COMO-VERIFICAR.md` | Cómo reproducir cualquier afirmación de estos documentos sin creerle a nadie |
| 04 | `04-DECISIONES-TECNICAS.md` | Las 12 decisiones pendientes, con el detalle técnico y mi recomendación |
| 05 | `05-DECISIONES-PARA-TOMY.md` | Las mismas 12, escritas para el fundador no técnico: qué pasa, qué se pierde, qué recomiendo |
| 06 | `06-ERRORES-COMETIDOS.md` | Los 13 errores que cometí durante los arreglos, escritos en el momento |

---

## Lo que más conviene mirar con ojo crítico

Si el tiempo es limitado, estas son las partes donde una segunda opinión vale más:

### 1. Lo que puede estar abierto en producción ahora

`02-HALLAZGOS.md` § 0.1 — cinco crons con `if (x !== process.env.SYNC_KEY)`. Si la variable no
está seteada, las dos puntas valen `undefined`, la comparación da `false`, y **entra un request
que no manda nada**. Con una clave *incorrecta* devuelve 401, así que sólo se abre mandando
nada.

**Está en `main`, no lo introdujo esta branch.** El arreglo está en la branch y la branch no
está mergeada, así que producción sigue con el código viejo. Falta confirmar si `SYNC_KEY`
existe en Vercel — es lo único de toda la lista que corre contra el reloj.

### 2. El número que se retiró

Circulaba que el pipeline aguantaba **44 organizaciones** tamaño Arredo. Estaba mal: el cálculo
dividía por un presupuesto diario agregado, suponiendo que el trabajo se reparte entre las
invocaciones del día. No se reparte — la unidad *(día × tabla × todas las orgs)* es
indivisible y tiene que entrar en **una** invocación de 250 s.

El número honesto es **≈2**. Un factor de 18×. Está retirado de todos los documentos
(`PLAN_EXPANSION.md`, `CLAUDE_STATE.md`) con la corrección explicada, y la ficha del error está
en `ERRORES_CLAUDE_NO_REPETIR.md` → `#S62-VERIFIQUE-LA-ARITMETICA-Y-NO-LA-PREMISA`.

**Vale re-verificar la cuenta nueva.** La medición era real; lo que falló fue el modelo que la
convertía en conclusión, y ese tipo de error se repite fácil.

### 3. Los tests que estaban verdes y no podían ponerse rojos

Se encontraron **seis**, confirmados por mutación. Dos de seguridad:

- El escáner de inyección SQL tenía un typo: `/^s*[(<]/` en vez de `/^\s*[(<]/`. `s*` matchea
  la **letra ese**, no espacios, así que una inyección escrita con un espacio pasaba.
- La lista de "señales de auth" incluía dos **nombres de variable** (`"NEXTAUTH_SECRET"`,
  `"ADMIN_API_KEY"`): borrar la comparación y dejar el import dejaba el test verde. 38 rutas
  admin dependían sólo de eso.

**El patrón general vale más que los casos**: un test escrito en el mismo movimiento que el
arreglo nunca vio el bug, así que su verde no prueba nada.

### 4. Los arreglos que yo mismo hice mal primero

En `06-ERRORES-COMETIDOS.md`. Los tres que más vale mirar:

- **E-03**: escribí un guard que marcó siete archivos **sanos** y casi los "arreglo". Copié la
  forma sintáctica del bug en vez de su condición.
- **E-07**: un script chequeaba si un import ya existía con un `includes` sobre el archivo
  entero — y para entonces ya había insertado comentarios que mencionan el módulo. El import
  nunca se agregó, `tsc` pasó limpio porque ese archivo tiene `@ts-nocheck`, y la página habría
  explotado en el navegador de un cliente.
- **E-08**: mi primer arreglo de un falso verde era, otra vez, un falso verde. Lo detectó la
  mutación, no yo.

---

## Contexto que hace falta para leer esto

**`tsc` es ciego en este repo.** Hay ~290 archivos con `// @ts-nocheck` en la línea 1. En esos,
una variable inexistente, un `await` faltante o un import roto **no los caza nadie** — sólo
`next build`. Varios hallazgos viven ahí.

**Las dos claves son el mismo literal.** `ADMIN_API_KEY` y `NEXTAUTH_SECRET` tienen hoy el
mismo valor, y ese valor está escrito en `vercel.json`, que está versionado en el repo. Con él
se puede forjar una sesión de staff. **Se decidió no rotar por ahora**, así que los gates de
esta branch no son una frontera de seguridad hasta que se rote — cubren al usuario logueado,
que es el caso real. No hace falta reportarlo como hallazgo: está asumido.

**La base de producción no se toca desde acá.** Regla del repo (`docs/HANDOFF.md`): todo el SQL
lo corre el dueño en la consola de Neon.

**El idioma.** El código y los comentarios están en castellano, a propósito. Los comentarios
son largos porque explican *por qué* una decisión es como es, no *qué* hace el código.

---

## Preguntas que me gustaría que contestes

Si vas a revisar esto, lo más útil que podés hacer es atacar estas cinco:

1. **¿Algún arreglo de los 24 introdujo un problema nuevo?** Ya pasó una vez en esta misma
   historia: el arreglo del incidente del 2026-09-06 abrió la fuga de `ADMIN_API_KEY` que se
   cerró en esta tanda (R-05).

2. **¿Alguno de los tests nuevos es un falso verde?** Se verificaron por mutación uno por uno,
   pero la mutación la elegí yo, y una mutación mal elegida no prueba nada — me pasó tres veces
   seguidas con el mismo guard (E-10).

3. **¿Las 12 decisiones están bien planteadas?** Me interesa sobre todo si alguna que marqué
   como "decisión" en realidad tiene una respuesta obvia que no vi, o al revés: si algo que
   arreglé por mi cuenta debería haber sido consultado.

4. **¿Queda algo del informe original sin atender que no debería?** Los 13 que no se
   arreglaron están justificados en `04-DECISIONES-TECNICAS.md`, pero la justificación es mía.

5. **¿Esta branch está lista para mergear?** Con 126 commits y 136 archivos, la pregunta de
   fondo es si el riesgo del merge es menor que el de seguir acumulando.

---

## Dónde está el resto del contexto (fuera de esta carpeta)

| Archivo | Qué tiene |
|---|---|
| `PLAN_EXPANSION.md` | Las 33 tareas del plan, con su estado y la corrección del techo |
| `BACKLOG_PENDIENTES.md` → `BP-REVISION-0914` | Los 37 hallazgos como entradas de backlog, con los resueltos tachados y su commit |
| `docs/ESTADO-BRANCH-INTEGRACION.md` | El estado completo de la branch, incluido todo lo anterior a esta revisión |
| `ERRORES_CLAUDE_NO_REPETIR.md` | Patrones de error destilados del repo entero, no sólo de esta tanda |
| `CLAUDE.md` | Reglas de proceso del repo (git, validaciones, dominios) |
