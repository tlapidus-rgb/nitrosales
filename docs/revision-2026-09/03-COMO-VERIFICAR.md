# Cómo verificar esto sin creerle a nadie

> Todo lo que afirman los demás documentos de esta carpeta se puede comprobar. Acá están los
> comandos.
>
> Si algo no se reproduce, **es un hallazgo**: quiere decir que uno de estos documentos afirma
> algo que el código no dice, que es exactamente el defecto que esta revisión vino a cazar.

---

## Lo básico

```bash
cd <repo>
git checkout fix/expansion-gate-e0

npx vitest run          # 1.440 passed, 7 skipped
npx tsc --noEmit        # sin salida = limpio
npx next build          # exit 0

# Los tres guards de build
node scripts/check-order-contract.mjs
node scripts/check-serve-gold-first.mjs
node scripts/check-ts-nocheck.mjs
```

⚠️ **`tsc` no alcanza como verificación.** Hay ~290 archivos con `// @ts-nocheck` en la línea
1; en esos, una variable inexistente o un import roto pasan limpio. **Sólo `next build` los
mira.** Eso ya produjo un error real en esta tanda (E-07 en `06-ERRORES-COMETIDOS.md`).

---

## Verificar que un arreglo hace lo que dice

El método que se usó en toda la tanda: **reintroducir el bug y confirmar que el test se pone
rojo**. Un test que no se vio rojo por el motivo correcto no prueba nada.

Ejemplo completo, con el fail-open de los crons (R-01):

```bash
# 1. Verde en limpio
npx vitest run src/__tests__/crons-fail-closed.test.ts

# 2. Volver al código de antes
cp src/app/api/cron/anomalies/route.ts /tmp/bak
# (reemplazar el gate por: if (syncKey !== process.env.SYNC_KEY) { ... })

# 3. Tiene que ponerse ROJO, y nombrar el archivo correcto
npx vitest run src/__tests__/crons-fail-closed.test.ts

# 4. Restaurar y confirmar verde
cp /tmp/bak src/app/api/cron/anomalies/route.ts
npx vitest run src/__tests__/crons-fail-closed.test.ts
```

**Las dos direcciones importan.** Que se ponga rojo con el bug no alcanza: hay que confirmar
que está **verde sobre el código sano**. Un guard demasiado amplio marca archivos correctos —
eso pasó y está en E-03.

---

## Comprobar los hallazgos puntuales

### El fail-open de los cinco crons (R-01)

```bash
node -e 'console.log(undefined !== undefined)'   # false  ← por eso entraba
node -e 'console.log(null !== undefined)'        # true   ← por eso NO aplica a otros
```

La diferencia importa: el bug necesita que la variable valga exactamente `undefined`, lo que
pasa cuando se arma con optional chaining (`headers.get("authorization")?.replace(…)`).
`searchParams.get()` devuelve `null`, que rechaza bien. Siete rutas que parecían tener el bug
**no lo tenían** (E-03).

### El typo del escáner de inyección SQL (R-30)

```bash
node -e 'console.log(/^s*[(<]/.test(" ("))'    # false ← el typo: no ve el espacio
node -e 'console.log(/^\s*[(<]/.test(" ("))'   # true  ← corregido
```

### El regex que no veía `BG/NBD` (R-33)

```bash
node -e 'console.log(/\bbgnbd\b/i.test("BG/NBD"))'        # false
node -e 'console.log(/BG\s*\/\s*NBD/i.test("BG/NBD"))'    # true
```

### El techo de organizaciones

La premisa que falló se comprueba en diez segundos:

```bash
grep -n "backfillDay(" src/lib/pixel/rollup-backfill.ts
# → backfillDay(cursor, orgs, table)   ← sin deadlineAt: la unidad es indivisible

grep -n "invocacionesPorDia" src/app/api/admin/techo-de-orgs/route.ts
# → suma todas las invocaciones del día como si el trabajo se repartiera
```

Y el input que también está mal:

```bash
grep -n "for i in" .github/workflows/keep-pixel-rollups-fresh.yml   # 2 hits por corrida
grep -n "porHoraGithub" src/app/api/admin/techo-de-orgs/route.ts    # dice 4, son 8
```

### La cobertura de la partición de la revisión

La afirmación "127 de 127 archivos asignados, cero sin asignar" se puede rehacer:

```bash
git diff --name-only origin/main...HEAD | grep -E '\.(ts|tsx|mjs)$' | grep -v '\.test\.' | wc -l
```

---

## Comprobar que un test sirve

Los seis falsos verdes que se encontraron tenían una forma en común: **una manera de pasar que
no depende del comportamiento**. Las preguntas que los detectan:

1. **¿La aserción puede satisfacerse con un comentario?** Buscar tests que lean el fuente sin
   filtrar comentarios. Pasó tres veces en este repo (`#S61`).
2. **¿El regex depende del formateo?** Un espacio literal en un regex sobre código formateado
   lo evade Prettier partiendo la línea. Pasó con "Recalibración semanal".
3. **¿El fixture se parece a producción?** Comparar cada `CREATE TABLE` de los tests contra la
   DDL real. Dos divergían, y una hacía inexpresable el bug de facturación.
4. **¿El nombre del test promete más que sus aserciones?** Leer el nombre y preguntarse si las
   aserciones lo sostienen. Dos casos decían "no está listo" sin verificar nunca `listo`.
5. **¿La lista de "señales" incluye algo que no es señal?** Contar `getOrganization` como auth
   dejaba pasar un endpoint sin ningún gate.
6. **¿Alguien consume lo que el test verifica?** Un `toContain("_degraded")` pasa aunque ningún
   componente lea ese campo.

---

## Lo que ya se verificó y **está bien**

Para no gastar tiempo dos veces. Todo esto se comprobó de forma independiente durante la
revisión:

- **El SQL de `metrics/orders` es byte a byte idéntico a producción.** Dos revisores expandieron
  los helpers y diffearon contra `origin/main`: cero diferencias en las 72 ocurrencias. Ninguna
  métrica de ventas cambia.
- **El pixel emite JavaScript byte-idéntico.** Verificado **por fuera del test**, carácter por
  carácter (62.471 = 62.471). El snapshot del test no sirve como evidencia: nació en el mismo
  commit que el cambio que debía proteger.
- **El webhook CORE de VTEX** cambió 2 líneas, y la validación nueva es equivalente a la
  anterior en las cuatro combinaciones posibles.
- **Las ~45 rutas de influencers no filtran contraseñas de creadores** — barrido de las 72
  rutas que tocan la tabla.
- **El cambio de secciones a capacidades no movió ningún acceso** — tabla completa de
  combinaciones, antes y después.
- **Las 110 fuentes nuevas de la branch no tienen un solo `@ts-nocheck`.** Los 21 archivos
  ciegos del diff son preexistentes que se modificaron.
- **No hay más bugs del tipo "variable inexistente en el `catch`"** — se escanearon los 290
  archivos ciegos.

---

## Higiene del repo que conviene saber

**Los archivos usan CRLF.** Un script que edite con `\n` deja finales de línea mezclados, y eso
ya invalidó una batería de mutación en silencio: el script reportaba "ok" sin haber cambiado
nada. Hay un chequeo de EOL que se corre antes de cada commit.

**Los scripts de edición no pasan por el shell.** Backslashes y backticks se los come, y eso
rompió tres archivos en esta tanda (E-04, E-05, E-09). Se escriben a un `.cjs` y se corren con
`node <archivo>`.
