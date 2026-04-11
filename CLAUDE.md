# CLAUDE.md — Reglas de proceso para Claude en este repo

> Este archivo existe para que Claude (yo) maneje el flow de git de forma
> prolija, simple y sin errores. Tomy es fundador no técnico y la simpleza
> del flujo es prioridad #1. Si estás leyendo esto como Claude en una
> sesión nueva, **tratá estas reglas como inmutables** salvo que Tomy
> explícitamente las cambie en el chat.

> **Última actualización: 2026-04-11 — Modelo simplificado: todo directo
> en `main`. Sin staging. Sin branches extra.**

---

## Modelo de branches: SOLO `main`, NADA MÁS

Este repo opera con **una sola branch: `main`**.

| Branch | Qué es | URL |
|---|---|---|
| `main` | Producción. Todo va acá directo. | `app.nitrosales.io` |

**No existen branches `staging`, `feat/*`, `hotfix/*`, ni nada más.**
Si Claude crea una branch nueva sin que Tomy la pida explícitamente,
está violando la regla.

**¿Por qué?** No hay clientes reales todavía. Mantener dos ambientes
separados (staging + main) generaba más problemas que soluciones:
fixes que se hacían en staging pero nunca llegaban a producción
(ejemplo: pérdida de 1600 órdenes MELI por 6 días porque el fix del
webhook estaba en staging pero main seguía con el código roto).

Cuando haya clientes reales, se puede volver a un modelo con staging.

---

## REGLA #1 — Claude trabaja SIEMPRE en `main`

Todo cambio (UI, backend, fix, refactor) se commitea y pushea directo
a `main`. Vercel deploya automáticamente.

**Flujo correcto (siempre el mismo):**

```
git checkout main
git pull origin main
# ... trabajo ...
git add <archivos>
git commit -m "..."
git push origin main
# → Vercel deploya automáticamente a app.nitrosales.io
# → Le aviso a Tomy: "listo, ya está en producción"
```

**Lo que NO se hace nunca:**
- ❌ `git checkout -b feat/<nombre>` — no se crean branches nuevas
- ❌ `git checkout -b staging` — no existe más staging
- ❌ Crear PRs o branches "por si acaso"

---

## REGLA #2 — Antes de cualquier edit, ritual de arranque obligatorio

Toda sesión nueva (o continuación post-compactación) empieza con:

```
cd <repo-dir>
git fetch origin --prune
git checkout main
git pull origin main
git status
git branch --show-current   # debe decir "main"
git log --oneline -5
```

Si `git branch --show-current` devuelve algo distinto de `main`,
**parar y reportar**. No editar nada.

Además, leer al inicio de toda sesión nueva:
- `CLAUDE_STATE.md`
- `ERRORES_CLAUDE_NO_REPETIR.md` (si existe)
- Este archivo (`CLAUDE.md`)

**Y si la tarea involucra UI/UX/visual/animaciones/componentes/estilos/layout, leer ADEMÁS (obligatorio):**
- `UI_VISION_NITROSALES.md` — la biblia visual de NitroSales.

---

## REGLA #3 — Validaciones obligatorias antes de pushear

Antes de cualquier `git push origin main`:
- [ ] `npx tsc --noEmit` pasa
- [ ] Si tocó UI o rutas, `npx next build` pasa local
- [ ] Los imports referenciados existen (ningún `@/lib/x` que falte)
- [ ] Las API routes nuevas tienen `export const dynamic = "force-dynamic"` si usan DB/cookies/fetch
- [ ] Las páginas client con `useSearchParams` están dentro de `<Suspense>`

### REGLA #3b — Queries SQL: checklist anti-página-en-blanco

La API `/api/metrics/orders` ejecuta ~25 queries en batches. Una query
lenta o que explota mata TODA la página (se queda en blanco).
Antes de pushear cambios a queries SQL:

- [ ] **NO hacer JOIN a tablas grandes** en queries de geography/segmentation
      (orders tiene 60K+ rows; sumarle JOIN a customers duplica el costo).
      Si necesitás datos de otra tabla, usar una query separada y cruzar en JS.
- [ ] **NO usar `CAST(... AS int)`** sobre columnas que pueden tener datos mixtos
      (ej: postalCode puede ser "1754" o "B1754BCD"). Usar comparaciones de texto.
- [ ] **NO agregar subqueries correlacionados** dentro de queries que ya son
      pesadas (ej: la query de profitability ya tiene un subquery por SKU, no
      agregar más).
- [ ] **Probar la query con rango chico** (1 día) después de pushear:
      `fetch('/api/metrics/orders?from=HOY&to=HOY&source=VTEX')` — si no
      responde en 15 segundos, la query está rota.
- [ ] **Pool de conexiones = 8**. Nunca más de 3 queries en paralelo por batch.

**Errores pasados:**
- Sesión 16: Query de provincias con `LEFT JOIN customers` + `CAST(LEFT(postalCode,4) AS int)`
  → timeout de la API → página en blanco. Fix: usar solo comparaciones de
  texto con `LEFT(postalCode, 1)` sin JOIN.

---

## REGLA #4 — Comunicación con Tomy en lenguaje simple

Tomy no es técnico. Cuando pasa algo de git/deploy, explicación en
lenguaje simple, sin jerga. Analogías:

- `main` / `app.nitrosales.io` = "la app en vivo"
- Commit + push = "subí los cambios, ya están en la app"
- Build fail = "los cambios no se pudieron publicar, lo arreglo"

---

## REGLA #5 — Cero excepciones a este modelo

Si Claude siente la tentación de crear una branch nueva "solo por esta
vez", **PARAR y preguntarle a Tomy en el chat primero**.

---

## Historial de modelos

1. **Sesiones 1-8**: Branch por feature → múltiples URLs, confusión
2. **Sesiones 9-10**: Modelo staging+main → fixes atrapados en staging
3. **Sesión 11+** (actual): Todo directo en main → máxima simplicidad

---

_Última actualización: 2026-04-11 — Modelo main-only._
