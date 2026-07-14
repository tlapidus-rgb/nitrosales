# Fase 1.5 — Domainización: SPEC de implementación ejecutable

> Spec preciso y a prueba de fallos para la Fase 1.5 del `MIGRATION_PLAN.md`.
> Refactor de arquitectura interno (monolito modular microservices-ready). NO es feature.
> **Decidido, no re-litigar:** monolito modular es el target; extraer servicios SOLO por los 5 disparadores; NO 15 microservicios.
>
> **Regla de oro de este spec:** cada paso es un commit chico, verificable con un comando, reversible con `git revert`, y NO toca la DB ni prod. Se trabaja en branch aparte (`feat/domain-boundaries`), se prueba en preview de Vercel, y recién con OK explícito va a `main`.

## Realidad del repo (verificada 2026-07-14, sobre `main`)
- Next.js 14 App Router. **Los route handlers se quedan en `app/api/**`** — no se mueven a `domains/`. Patrón: la ruta hace HTTP+auth y **delega** a `domains/<x>`.
- Un solo Prisma client (`src/lib/db/client.ts`), 63 modelos, una DB Neon compartida (pool ~24). El build de Vercel es el gate de CI.
- Alias TS: `@/*` → `./src/*` (`tsconfig.json`). `src/domains/` **no existe** todavía.
- El contrato de órdenes se importa por `@/lib/metrics/orders` en **30 sitios**. Path único → relocate = find-replace mecánico.

## Comandos de verificación (el vocabulario del spec)
| Símbolo | Comando | Qué garantiza |
|---|---|---|
| `TSC` | `npx tsc --noEmit` | 0 errores de tipos (los imports resuelven) |
| `TEST` | `npm test` (vitest) | los 11 tests del contrato + resto pasan |
| `GUARD` | `node scripts/check-order-contract.mjs` | sin re-implementaciones nuevas del filtro de venta |
| `BUILD` | `npm run build` | Vercel buildearía OK (corre GUARD + next build) |
| `CRUISE` | `npx depcruise src --config .dependency-cruiser.js` | grafo de dependencias: ciclos + violaciones de frontera |

Un paso está **LISTO** solo si sus comandos de verificación pasan **todos**. Si uno falla → `git revert` del commit y re-evaluar. Nada avanza sobre un paso roto.

---

## ORDEN Y DEPENDENCIAS (el grafo del plan)

```
S0 guard [HECHO] ──> S1 medir (cruiser WARN) ──┬──> S2 relocate orders.ts
                                                │
                          (S1 da el grafo real) ├──> S4 romper ciclos ──> S5 ratchet a ERROR
                                                │         ▲
                     S3 barrels finanzas+audiences ───────┘ (S3 y S4 pueden ir en paralelo tras S1)
                                                                          │
                                                             S6 prisma schema por dominio (independiente)
```

**Dependencia dura:** `S5 (ratchet a error) NO puede ir antes que S4 (romper ciclos)`, o el build rompe día 1. `S1 (medir) va PRIMERO` porque su output define qué ciclos existen (el plan viejo asumía pixel⇄aura; hay que medir la dirección real). `S6` es independiente y puede ir cuando sea.

---

## S0 — Guard del contrato de órdenes ✅ HECHO
- **Estado:** implementado y pusheado en `feat/domain-boundaries` (`0fdc19e`). `scripts/check-order-contract.mjs`, cableado en `build`. Allowlist de 15, falla ante archivo nuevo.
- **Verificado:** GUARD pasa hoy; caza violación nueva con exit 1; BUILD lo corre.

---

## S1 — Medir: dependency-cruiser en modo WARN (inventario + grafo de ciclos)
- **Objetivo:** obtener el grafo REAL de dependencias antes de mover nada. Nada se mueve en este paso. Producir el inventario de violaciones cross-dominio y **la lista real de ciclos** (que S4 va a romper).
- **Archivos:** `+ .dependency-cruiser.js` (config), `+ package.json` (script `"cruise": "depcruise src --config .dependency-cruiser.js"`), `+ devDependency dependency-cruiser`.
- **Cómo:**
  1. `npm i -D dependency-cruiser`.
  2. Config con 2 reglas en **`severity: "warn"`** (no rompe build todavía): `no-circular` (detecta ciclos) y `no-cross-domain` (prohíbe `src/domains/A` → `src/domains/B` salvo vía barrel `index.ts`). Los `app/api/**` quedan exentos (pueden importar cualquier barrel de dominio).
  3. Correr `CRUISE` y **guardar el output** en `docs/domain-graph-baseline.txt` (commiteado — es la foto del punto de partida).
- **Verificación:** `CRUISE` corre sin crashear y emite el reporte. `TSC`/`TEST`/`BUILD` siguen pasando (solo agregamos config + dep, no tocamos código).
- **LISTO cuando:** el baseline está commiteado y sabemos (a) cuántas violaciones cross-dominio hay y (b) **la lista exacta de ciclos** (nombres de archivo). Esto reemplaza la suposición "el ciclo es pixel⇄aura" por el dato real.
- **Riesgo/rollback:** nulo (aditivo). Rollback = `git revert`.

---

## S2 — Relocalizar el contrato: `lib/metrics/orders.ts` → `domains/orders/`
- **Objetivo:** el contrato "venta válida" pasa a ser la API pública del dominio `orders`. Rename mecánico, cero cambio de lógica.
- **Archivos exactos:** `src/lib/metrics/orders.ts` → `src/domains/orders/index.ts`; `src/lib/metrics/orders.test.ts` → `src/domains/orders/index.test.ts`; **30 archivos** que hacen `from "@/lib/metrics/orders"`; `scripts/check-order-contract.mjs` (actualizar `CONTRACT_FILES`).
- **Cómo:**
  1. `git mv src/lib/metrics/orders.ts src/domains/orders/index.ts` y el `.test.ts` igual (preserva historia).
  2. Find-replace en `src/`: `@/lib/metrics/orders` → `@/domains/orders` (30 sitios, path único → sin ambigüedad).
  3. En el guard, cambiar `CONTRACT_FILES` a `src/domains/orders/index.ts` (+ dejar `src/lib/order-validation.ts`).
  4. Si algo más quedaba en `lib/metrics/`, no tocarlo; solo se mueve `orders.ts`.
- **Verificación:** `TSC` (los 30 imports resuelven) + `TEST` (11 tests del contrato verdes) + `GUARD` (0 nuevas; el contrato ya no se auto-flaggea) + `BUILD`.
- **LISTO cuando:** los 4 comandos pasan y `grep -r "@/lib/metrics/orders" src` da **0 resultados**.
- **Riesgo/rollback:** bajo (mecánico). Riesgo real = un import que se escapa del find-replace → lo caza `TSC`. Rollback = `git revert` (el `git mv` se revierte limpio).

---

## S3 — Barrels de los 2 dominios más limpios: `finanzas` y `audiences`
- **Objetivo:** establecer el patrón `domains/<x>/index.ts` (API pública) con los 2 dominios **sin edges entrantes** (nadie de otro dominio los importa → migración de bajo riesgo, valida el patrón).
- **Archivos:** `+ src/domains/finanzas/index.ts`, `+ src/domains/audiences/index.ts` (re-exportan lo que hoy vive en `lib/finance/*` y el módulo de audiences); los consumidores (rutas `app/api/finance/**`, etc.) pasan a importar del barrel.
- **Cómo:** crear el barrel que re-exporta la API pública actual; migrar los imports de los consumidores al barrel; **NO** mover todavía la implementación interna (eso puede ser un paso posterior) — primero el barrel como fachada. **Antes de elegir estos 2, confirmar con S1** que efectivamente no tienen edges entrantes (el baseline lo dice).
- **Verificación:** `TSC` + `TEST` + `BUILD` + `CRUISE` (estos 2 dominios: 0 violaciones cross-dominio en WARN).
- **LISTO cuando:** finanzas y audiences se consumen solo por su barrel y CRUISE no marca cross-imports hacia su interior.
- **Riesgo/rollback:** bajo. Rollback = `git revert`.

---

## S4 — Romper los 2 ciclos reales que reportó S1
- **Objetivo:** llevar los ciclos del grafo a **0**, para poder subir el lint a error sin romper el build.
- **Los ciclos REALES (medidos por S1, ver `docs/domain-graph-baseline.txt`) — NO son los que asumía el plan viejo:**
  1. `src/lib/onboarding/emails.ts ⇄ src/lib/onboarding/template-renderer.ts`
  2. `src/lib/alerts/alert-hub.ts ⇄ src/lib/alerts/engine.ts`
  - Ambos son **intra-dominio** (dentro de onboarding y de alerts). NO cruzan fronteras → bajo riesgo, y no bloquean la migración de otros dominios.
  - **El "ciclo pixel⇄aura" NO existe.** `influencer-attribution.ts` es un edge de una sola dirección (aura → pixel/influencer-attribution). Reubicarlo es una mejora de ownership opcional, **no** un corte de ciclo. No es requisito de S5.
- **Cómo:** por cada uno de los 2 ciclos, la corrección típica de ciclo intra-módulo: extraer lo compartido a un tercer archivo (`onboarding/email-types.ts` / `alerts/shared.ts`) que ambos importen, o invertir la dependencia (el "hub"/"engine" recibe la dep por parámetro en vez de importarla). Un ciclo por commit.
- **Verificación:** `CRUISE` reporta **0 ciclos** + `TSC` + `TEST` + `BUILD` tras cada corte.
- **LISTO cuando:** `CRUISE` = 0 ciclos.
- **Riesgo/rollback:** bajo (2 ciclos chicos, intra-módulo, no tocan atribución). Un ciclo por commit, `TEST` tras cada uno. Rollback = `git revert` del commit del ciclo.

---

## S5 — Ratchet: subir el lint de WARN a ERROR (por dominio ya migrado)
- **Objetivo:** hacer que las violaciones de frontera **rompan el build**, empezando SOLO por los dominios ya limpios (orders, finanzas, audiences). El resto sigue en warn hasta migrarse.
- **Archivos:** `.dependency-cruiser.js` (subir `severity` a `error` para reglas que aplican a los dominios migrados; dejar `warn` para el resto).
- **Cómo:** cambiar `severity: "warn"` → `"error"` solo en el scope de los dominios ya migrados. **Precondición dura: S4 en 0 ciclos** (si no, `no-circular` en error rompe el build).
- **Verificación:** `BUILD` pasa (estado limpio) **y** se prueba que rompe: introducir un import cross-dominio prohibido de prueba → `BUILD` falla con exit ≠ 0 → revertir la prueba. (Igual que se validó el GUARD en S0.)
- **LISTO cuando:** BUILD pasa limpio y falla ante una violación de prueba.
- **Riesgo/rollback:** medio (puede bloquear deploys si algo se cuela). Mitigación: scope acotado a dominios migrados. Rollback = bajar esa regla a `warn`.

---

## S6 — Schema Prisma por dominio (`prisma/schema/*.prisma`) — independiente
- **Objetivo:** ownership visible de los modelos por dominio, sin partir el Prisma client ni la DB.
- **Archivos:** `prisma/schema.prisma` → carpeta `prisma/schema/` con un `.prisma` por dominio (feature `prismaSchemaFolder`); `package.json`/config si hace falta el flag.
- **Cómo:** activar `prismaSchemaFolder`, dividir el schema por dominio (mismo datasource/generator). **La DB física NO cambia** — es solo organización de archivos.
- **Verificación:** `npx prisma validate` + `npx prisma generate` + `TSC` + `BUILD`. **No** correr `migrate`/`db push` (DB = prod).
- **LISTO cuando:** prisma valida y genera el mismo client; 0 cambios de DDL.
- **Riesgo/rollback:** bajo-medio (config de Prisma). Rollback = volver al `schema.prisma` único. **Nunca** aplicar migración desde acá.

---

## Checklist ejecutable (marcar al terminar cada paso)
- [x] **S0** guard del contrato — `0fdc19e`, GUARD+BUILD ok
- [x] **S1** dependency-cruiser WARN + baseline commiteado — 2 ciclos hallados (onboarding, alerts), 0 cross-dominio; `docs/domain-graph-baseline.txt`
- [x] **S2** relocate orders.ts → domains/orders — TSC=0, 107 tests ok, GUARD ok, CRUISE sin ciclos nuevos, `grep @/lib/metrics/orders`=0 (30 sitios migrados)
- [ ] **S3** barrels finanzas + audiences — TSC+TEST+BUILD+CRUISE ok
- [ ] **S4** romper ciclos de S1 — CRUISE 0 ciclos
- [ ] **S5** ratchet a ERROR (dominios migrados) — BUILD pasa limpio y falla ante violación de prueba
- [ ] **S6** prisma schema por dominio — prisma validate+generate ok, 0 DDL

## Invariantes (aplican a TODOS los pasos)
1. Un paso = un commit chico y reversible. Verificación pasa entera o `git revert`.
2. **Cero DB, cero prod.** Migraciones se dejan preparadas, nunca aplicadas (la corre el usuario en Neon).
3. Branch aparte → preview de Vercel → OK explícito del usuario → recién `main`.
4. Los route handlers se quedan en `app/api/**`; delegan a `domains/`.
