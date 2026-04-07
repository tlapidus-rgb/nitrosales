# CLAUDE.md — Reglas de proceso para Claude en este repo

> Este archivo existe para que Claude (yo) no vuelva a cometer errores de
> proceso que ya cometió antes. Tomy no es técnico y espera que yo maneje
> el flow de git de forma prolija sin que él tenga que pedirlo cada vez.
> Si estás leyendo esto como Claude en una sesión nueva, **tratá estas
> reglas como inmutables** salvo que Tomy explícitamente te las cambie.

---

## REGLA #1 — NUNCA commitear UI nueva directo a `main`

Toda UI nueva, feature nueva, o cambio visible para el cliente final
**va primero a una branch feature** (ej. `feat/<nombre-corto>`) que Vercel
convierte en preview URL. Tomy mira el preview, aprueba, y recién ahí
mergeamos a `main` (que es producción en `app.nitrosales.io`).

**Solo se puede pushear directo a `main` cuando:**
1. Tomy lo pidió explícitamente en la conversación ("dale, pusheá a main").
2. Es un fix de bug crítico que él ya aprobó específicamente.
3. Es un cambio de config (vercel.json, env vars) que él pidió explícitamente.

**Si dudás → branch feature + preview URL. Siempre.**

### Antipatrón histórico (ya pasó 3 veces)

> "Voy a trabajar en la UI nueva" → `git commit` → `git push origin main`
> → NitroScore sale directo a producción sin que Tomy lo haya visto en
> preview. Esto es lo que hay que evitar.

### Patrón correcto

```
git checkout main
git pull
git checkout -b feat/<nombre>
# ... trabajo ...
git push -u origin feat/<nombre>
# → Vercel genera preview URL automáticamente
# → Le paso el preview URL a Tomy
# → Tomy revisa, aprueba
# → Recién ahí: git checkout main && git merge --no-ff feat/<nombre> && git push
```

---

## REGLA #2 — Después de mergear a `main`, volver inmediatamente a una branch

Cuando Tomy autoriza un merge a `main` por un motivo específico (ej. "bajá
esto a producción"), ese merge **no es una licencia para seguir trabajando
en `main`**. Terminado el merge, lo siguiente tiene que ser:

```
git checkout -b feat/<siguiente-cosa>
```

Cualquier trabajo posterior va ahí, NO en `main`.

---

## REGLA #3 — El preview URL es un derecho de Tomy, no un lujo

Tomy es fundador no técnico y cada feature de UI la quiere ver en preview
antes de que toque `app.nitrosales.io`. El preview URL de Vercel es la
única forma que él tiene de validar visualmente antes de producción.

**Si le digo "ya está en producción" sin que él haya visto un preview,
le estoy sacando su capacidad de decidir.** Eso es desprolijo y él ya lo
marcó explícitamente como problema.

---

## REGLA #4 — Branches que Tomy conoce

- `main` → producción (app.nitrosales.io). Solo cosas aprobadas.
- `feat/nitropixel-asset` → branch histórica del trabajo de NitroPixel unicornio (mergeada).
- `feat/nitropixel-quality` → NitroScore (Calidad de Atribución) — UI para el NitroScore.
- Nuevas features → crear `feat/<nombre-corto>` siempre.

---

## REGLA #5 — Cómo manejar los commits "mixtos"

Si en una misma sesión Tomy aprueba algunos cambios para producción
(ej. fixes de bug) pero también quiere trabajar en UI nueva, separar en
dos branches:

1. Los fixes aprobados → commit en `main` (con su autorización explícita).
2. La UI nueva → commit en `feat/<nombre>`, push preview, esperar validación.

**Nunca mezclar ambas cosas en el mismo commit o en la misma branch.**

---

## REGLA #6 — Comunicación con Tomy sobre git/deploy

Tomy no es técnico. Cuando pasa algo relacionado con git/deploy, la
explicación tiene que ser en lenguaje simple, sin jerga. Analogías
útiles que ya funcionaron:

- Branch feature = "copia de prueba"
- Preview URL = "link de prueba"
- Producción (`main` → `app.nitrosales.io`) = "lo que ven tus clientes"
- Merge = "juntar los cambios de la copia con lo que ven los clientes"
- Revert = "sacar un cambio específico sin romper nada"

---

## Historial de errores cometidos (para no repetir)

### Error 1-3 (hasta 2026-04-07): pushes directos a `main` sin preview

**Qué pasó:** Después de mergear `feat/nitropixel-asset` a `main` (con
aprobación explícita de Tomy para bajar fixes de atribución), seguí
pusheando commits directo a `main`:
- `f65a63d` — vercel.json cron schedule (esto SÍ estaba aprobado)
- `fe4c540` — 3 audit fixes (esto SÍ estaba aprobado)
- `c119cbe` — **NitroScore UI entero** (esto NO estaba aprobado para producción)

El commit `c119cbe` era UI nueva y debería haber ido a una branch feature
con preview URL. En cambio salió directo a `app.nitrosales.io`.

**Fix aplicado:** `git revert c119cbe` en `main` + cherry-pick a
`feat/nitropixel-quality` + push, que es de donde Vercel genera el
preview URL para que Tomy lo apruebe.

**Cómo evitarlo la próxima vez:** seguir Regla #2. Después de cualquier
merge a `main`, lo primero es `git checkout -b feat/<siguiente>`.

---

_Última actualización: 2026-04-07_
