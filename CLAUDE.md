# CLAUDE.md — Reglas de proceso para Claude en este repo

> Este archivo existe para que Claude (yo) maneje el flow de git de forma
> prolija, simple y sin errores. Tomy es fundador no técnico y la simpleza
> del flujo es prioridad #1: cuanto menos branches y URLs tenga que
> recordar, mejor. Si estás leyendo esto como Claude en una sesión nueva,
> **tratá estas reglas como inmutables** salvo que Tomy explícitamente
> las cambie en el chat.

> **Última actualización: 2026-04-07 noche — Sesión 9. Modelo simplificado
> de 2 branches (`main` + `staging`) reemplaza el modelo anterior de
> branches por feature.**

---

## Modelo de branches: SOLO 2 BRANCHES, NUNCA MÁS

Este repo opera con **exactamente dos branches permanentes**:

| Branch | Qué es | URL |
|---|---|---|
| `main` | Producción. Lo que ven los clientes. | `app.nitrosales.io` |
| `staging` | Entorno de prueba permanente. Donde Claude trabaja siempre. | preview URL fijo de Vercel |

**No existen branches `feat/*`, ni `hotfix/*`, ni nada más.** Si Claude
crea una branch nueva sin que Tomy la pida explícitamente, está
violando la regla.

---

## REGLA #1 — Claude trabaja SIEMPRE en `staging`. Nunca en `main`. Nunca en branches nuevas.

Todo cambio que Claude haga (UI, backend, fix, refactor, lo que sea)
se commitea y pushea a `staging`. Tomy mira el preview URL fijo de
staging, valida visualmente, y recién entonces autoriza el merge a
`main`.

**Flujo correcto (siempre el mismo):**

```
git checkout staging
git pull origin staging
# ... trabajo ...
git add <archivos>
git commit -m "..."
git push origin staging
# → Vercel actualiza el preview URL fijo de staging
# → Le aviso a Tomy: "listo, mirá en el preview"
# → Tomy revisa, aprueba
# → SOLO entonces mergeo a main (ver Regla #2)
```

**Lo que NO se hace nunca:**
- ❌ `git checkout -b feat/<nombre>` — no se crean branches nuevas
- ❌ `git push origin main` directo — main solo se actualiza vía merge desde staging
- ❌ Trabajar en `main` "porque es un fix rápido"

---

## REGLA #2 — Merge a `main` solo con confirmación EXPLÍCITA de Tomy en el chat

`main` = producción. Solo se actualiza cuando Tomy escribe en el chat
algo equivalente a "dale, pasalo a producción" / "mergealo a main" /
"bajalo a prod". Sin esa confirmación explícita, **`main` no se toca
jamás**.

**Flujo correcto del merge:**

```
# 1. Verificar que staging está sano
cd /tmp/nitrosales-fresh
git checkout staging
git pull origin staging
npx next build              # OBLIGATORIO. No solo tsc --noEmit.

# 2. Verificar la diferencia con main
git fetch origin main
git diff origin/main...HEAD --stat

# 3. Mergear (no fast-forward para tener commit de merge claro)
git checkout main
git pull origin main
git merge --no-ff staging -m "merge: <descripción>"
git push origin main

# 4. Esperar Vercel deploy success ANTES de declarar terminado
curl -s -H "Authorization: token $GH_TOKEN" \
  https://api.github.com/repos/tlapidus-rgb/nitrosales/commits/<sha>/status

# 5. Volver a staging para seguir trabajando
git checkout staging
```

**Después del merge, Claude vuelve automáticamente a `staging`. No se
queda en `main`.**

---

## REGLA #3 — Tomy ve siempre el mismo preview URL

Tomy bookmarkea **una sola URL** y siempre mira ahí. Esa URL es el
preview de la branch `staging` que Vercel genera automáticamente. Como
la branch nunca cambia de nombre, la URL nunca cambia.

URL del preview de staging:
`https://nitrosales-git-staging-tlapidus-rgbs-projects.vercel.app`

(Si en algún momento se configura un alias custom como
`staging.nitrosales.io`, esto se actualiza acá.)

---

## REGLA #4 — Antes de cualquier edit, ritual de arranque obligatorio

Toda sesión nueva (o continuación post-compactación) empieza con:

```
cd /tmp/nitrosales-fresh
git fetch origin --prune
git checkout staging
git pull origin staging
git status
git branch --show-current   # debe decir "staging"
git log --oneline -5
```

Si `git branch --show-current` devuelve algo distinto de `staging`,
**parar y reportar**. No editar nada.

Además, leer al inicio de toda sesión nueva:
- `/sessions/peaceful-nifty-meitner/mnt/nitrosales/CLAUDE_STATE.md`
- `/sessions/peaceful-nifty-meitner/mnt/NitroSales IA/ERRORES_CLAUDE_NO_REPETIR.md`
- Este archivo (`CLAUDE.md`)

**Y si la tarea involucra UI/UX/visual/animaciones/componentes/estilos/layout, leer ADEMÁS (obligatorio):**
- `/sessions/peaceful-nifty-meitner/mnt/nitrosales/UI_VISION_NITROSALES.md` — la biblia visual de NitroSales con la ambición Linear/Stripe/Vercel-grade, criterio light vs dark, animaciones permitidas, anti-patrones prohibidos y traducción del vocabulario visual de Tomy. Sin leer este archivo, cualquier cambio de UI viola la visión del fundador.

---

## REGLA #5 — Validaciones obligatorias antes de pushear

Antes de cualquier `git push origin staging`:
- [ ] `npx tsc --noEmit` pasa
- [ ] Si tocó UI o rutas, `npx next build` pasa local
- [ ] Los imports referenciados existen en la branch (ningún `@/lib/x` que falte)
- [ ] Las API routes nuevas tienen `export const dynamic = "force-dynamic"` si usan DB/cookies/fetch
- [ ] Las páginas client con `useSearchParams` están dentro de `<Suspense>`

Antes de cualquier `git merge staging → main`:
- Todo lo de arriba +
- [ ] `npx next build` completo (no solo tsc) pasa local
- [ ] `git diff origin/main...HEAD --stat` revisado
- [ ] Confirmación EXPLÍCITA de Tomy en el chat
- [ ] Después del push: esperar Vercel deploy success vía GitHub commit status API

---

## REGLA #6 — Comunicación con Tomy en lenguaje simple

Tomy no es técnico. Cuando pasa algo de git/deploy, explicación en
lenguaje simple, sin jerga. Analogías que ya funcionaron:

- `staging` = "tu copia de prueba"
- Preview URL = "el link donde mirás antes de que lo vean los clientes"
- `main` / `app.nitrosales.io` = "lo que ven tus clientes"
- Merge a main = "pasar lo aprobado de la copia de prueba a producción"

---

## REGLA #7 — Cero excepciones a este modelo

Si Claude siente la tentación de crear una branch nueva "solo por esta
vez" (ej. para un experimento, para aislar un cambio raro, para no
romper staging), **PARAR y preguntarle a Tomy en el chat primero**.
Las excepciones se autorizan caso por caso, jamás unilateralmente.

---

## Historial: por qué cambiamos al modelo `staging` único

Hasta sesión 9 (7 abril 2026), el modelo era "una branch feature por
cada cambio de UI", lo que generaba:
- Múltiples preview URLs cambiantes (Tomy nunca sabía cuál mirar)
- Confusión sobre en qué branch estaba Claude
- Errores 51, 55 del log de errores: pushes a main por confusión de branch
- Overhead mental para Tomy de recordar nombres de branches

Tomy explícitamente pidió simplificar el flujo. La nueva regla es:
**1 sola branch de trabajo (`staging`), 1 sola URL de preview, 1 sola
branch de producción (`main`)**. Punto.

---

_Última actualización: 2026-04-07 (Sesión 9 noche) — Modelo staging único._
