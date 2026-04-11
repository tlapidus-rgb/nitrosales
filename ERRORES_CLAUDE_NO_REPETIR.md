# Errores de Claude — NO repetir

> Lista de errores que Claude cometió y que NO deben volver a pasar.
> Leer al inicio de cada sesión.

---

## 1. Query pesada → página en blanco (Sesión 16, 2026-04-11)

**Qué pasó:** Se modificó la query de geografía (#24) para mapear códigos
postales a provincias. Se usó `LEFT JOIN customers` + `CAST(LEFT(...) AS int)`.
La query era demasiado pesada para el pool de conexiones → la API no respondía
→ la página quedaba en blanco.

**Regla:** NUNCA agregar JOINs a tablas grandes en queries existentes del
endpoint `/api/metrics/orders`. Ese endpoint ya usa casi todo el pool.
Si necesitás cruzar datos, hacerlo en JavaScript después de la query, o
en una query separada y liviana.

**Regla 2:** NUNCA usar `CAST(... AS int)` sobre columnas de texto que pueden
tener formatos mixtos. Los códigos postales argentinos pueden ser "1754"
(numérico viejo) o "B1754BCD" (CPA). Usar comparaciones de texto (`LEFT`, `BETWEEN`).

**Regla 3:** Después de pushear cambios a queries SQL, SIEMPRE verificar que
la API responde: `fetch('/api/metrics/orders?from=HOY&to=HOY&source=VTEX')`.
Si no responde en 15 segundos, revertir inmediatamente.

---

## 2. Pestañas de sync abiertas = DB colapsada (Sesiones 15-16)

**Qué pasó:** Tomy tenía pestañas de `/api/sync/inventory` abiertas que
consumían conexiones del pool (pool = 8 conexiones). Eso hacía que las
queries del dashboard no pudieran ejecutarse → página en blanco o timeouts.

**Regla:** Siempre verificar si hay pestañas de sync abiertas al diagnosticar
páginas en blanco. Pedirle a Tomy que las cierre antes de seguir debuggeando.

---

## 3. Git pack corruption → no se puede pushear (Sesión 15-16)

**Qué pasó:** El archivo `.git/objects/pack/pack-...pack` del repo local
se corrompió. `git commit`, `git pull` y `git push` fallaban con
"error reading from .git/objects/pack" o "unable to read tree".

**Workaround:** Clonar un repo fresh con credenciales:
```
git clone "https://USER:TOKEN@github.com/USER/REPO.git" fresh-clone
```
Copiar los archivos modificados al fresh clone, commitear y pushear desde ahí.
El repo local de `/mnt/nitrosales` sigue corrupto — no intentar fixearlo,
simplemente usar clones frescos.

---

_Última actualización: 2026-04-11_
