# NEXT_SESSION_PROMPT.md — S58 arranque (2026-04-25)

> Tomy: copia/pega el bloque "PROMPT A PEGAR" más abajo en la próxima sesión.
> Esto es para que el próximo Claude arranque con TODO el contexto y no pierda eficiencia.

---

## 📋 Estado al cierre de S57 (2026-04-24)

### Qué se hizo hoy
1. **Deep test de credenciales VTEX/MELI** con validación área por área (no solo "conecta sí/no"). 9 iteraciones hasta lograr un test robusto con 5 SKUs reales de ventas.
2. **Descubrimiento VTEX Simulation API**: única fuente de precio confiable (los otros 2 endpoints devuelven valores sin política comercial).
3. **Catalog refresh automático post-backfill**: endpoint que actualiza `Product.price / compareAtPrice / costPrice` usando Simulation, disparado solo al completar el backfill de VTEX.
4. **BUG CRÍTICO encontrado y fixeado**: args invertidos en `withConcurrency(...)` del processor VTEX causaban que el enrichment (customer + items + products) fuera un no-op silencioso. El backfill marcaba COMPLETED pero la DB quedaba con 0 items/products/customers.

### Commits pusheados a `main` (12, todos verificados con `tsc --noEmit`)
- `547dc51` muestra 5 SKUs en test (antes 1)
- `f4864ae` validar presencia de campos, no juzgar valores
- `3da5c8f` samplear SKUs con `fq=isAvailable:true`
- `ee967de` samplear SKUs de VENTAS reales (no del catálogo)
- `83d9bce` mostrar raw JSON por SKU (debug)
- `eaf0b81` usar Catalog Search para precio
- `45ae07a` **BREAKTHROUGH**: Simulation API como fuente primaria
- `7f183ae` catalog-refresh automático post-backfill VTEX
- `a7877e0` catalog-refresh usa Simulation
- `786d694` endpoint `/api/admin/debug-vtex-enrichment` (diagnóstico paso a paso con dry-run rollback)
- `8d84fc5` endpoint `/api/admin/vtex-reenrich` (enrichment de orders existentes sin re-backfill)
- `407d5a6` **FIX CRÍTICO** args invertidos `withConcurrency` en 3 archivos

### DB actual de Tomy (test con MdJ, orgId `cmocep2vk000b1409iqylv7zg`)
- 12.298 orders VTEX cargadas ✓ (matchean 1:1 con VTEX OMS)
- 0 items, 0 products, 0 customers ❌ (bug pre-fix — queda pendiente re-enriquecer)

### Pendiente operativo de Tomy ANTES de arrancar S58
1. Abrir `https://nitrosales.vercel.app/api/admin/vtex-reenrich?orgId=cmocep2vk000b1409iqylv7zg` **~7 veces** hasta que devuelva `"Todas las orders enriquecidas OK"`.
2. Abrir `https://nitrosales.vercel.app/api/sync/vtex/catalog-refresh?orgId=cmocep2vk000b1409iqylv7zg&key=nitrosales-secret-key-2024-production` **1 vez**.
3. Verificar con `https://nitrosales.vercel.app/api/admin/vtex-audit-all?orgId=cmocep2vk000b1409iqylv7zg` que `items.total`, `products.total`, `customers.total` están > 0.
4. Entrar al producto y confirmar visualmente: sección pedidos con detalle, sección productos con imágenes/precios/stock.

Si algo falla en estos pasos, S58 arranca debuggeando eso.

---

## 🎯 Objetivo de S58

**Mañana (2026-04-25) Tomy va a hacer el primer onboarding real de un cliente.** El backfill tiene que correr end-to-end automático, sin intervención manual, y el cliente debe entrar al producto con data completa.

### Qué tiene que funcionar sin tocar nada
- Form público → admin approve cuenta → email de bienvenida
- Wizard premium → cliente carga credenciales
- Admin approve backfill → dispara jobs por plataforma
- Backfill runner procesa en paralelo todas las plataformas
- VTEX: trae orders + enriquecimiento (customer + items + products) + catalog-refresh automático al final
- Email "tu data está lista" + overlay desbloqueado
- Cliente entra al producto con pedidos detallados, productos con precios reales

### Riesgos a mitigar en S58 antes del primer cliente
- **No volver a repetir el bug de args invertidos**: auditar que TODAS las llamadas a helpers en processors de sync tengan los args correctos. Releer signatures.
- **Smoke test runtime post-backfill**: asegurar que el bootstrap post-backfill verifique que hay side effects reales (>0 items, >0 products, >0 customers) y no solo "job completed". Si no hay side effects → alerta en admin.

---

## 🚨 PROMPT A PEGAR EN LA PRÓXIMA SESIÓN

```
Hola Claude, arrancamos S58. Estas son las instrucciones obligatorias:

1. RITUAL DE ARRANQUE (obligatorio, en este orden):
   - Leé: CLAUDE.md, CLAUDE_STATE.md (sección "Sesion 57" arriba),
     ERRORES_CLAUDE_NO_REPETIR.md (sobre todo error #S57-ARGS-ORDER-SILENT-NOOP),
     BACKLOG_PENDIENTES.md, NEXT_SESSION_PROMPT.md (este archivo).
   - Leé tu MEMORY.md en .claude/projects/.../memory/ — sobre todo los 2 patrones nuevos de S57
     (bug "proceso OK sin side effects" + VTEX 3 fuentes de precio).
   - Corré: git fetch origin --prune, git checkout main, git pull origin main,
     git status, git log --oneline -5.

2. PRIMERA INTERACCIÓN conmigo:
   - Preguntame: "¿Ejecutaste los 3 pasos pendientes del cierre S57
     (vtex-reenrich ~7 corridas, catalog-refresh 1 corrida, vtex-audit-all para verificar)?"
   - Si te digo que NO → ayudame a correrlos.
   - Si te digo que SÍ → pedime el output del audit para confirmar items/products/customers > 0
     antes de avanzar a cualquier otra cosa.

3. OBJETIVO DEL DÍA:
   - Hoy entra el primer cliente real (posiblemente Arredo o TV Compras).
   - El backfill tiene que correr end-to-end automático sin que yo toque URLs manuales.
   - Antes de que llegue el cliente, auditá que el processor de VTEX + los crons + el
     bootstrap post-backfill no tengan otros bugs del tipo "corre sin error pero sin side effects".
   - Específicamente: releé signatures de helpers en todos los processors (VTEX, ML, Meta,
     Google, GA4, GSC) y verificá que las llamadas tengan el orden correcto de args.

4. REGLAS CRÍTICAS QUE NO PODÉS OLVIDAR:
   - Hablame en español simple, sin jerga técnica. Soy founder no técnico.
   - Cuando diseñes un cambio grande, describime el plan en 4-5 líneas y esperá "dale"
     antes de codear. Refactors de >200 LOC sin confirmación = prohibido.
   - Si un proceso reporta "completed" con 0 side effects → **primera hipótesis = bug
     en llamada a helper (args invertidos, shape mal)**. NO perseguir causas externas.
   - Todo va directo a main. NO hay staging ni feature branches.
   - Antes de cada push: tsc --noEmit debe pasar. Si toca UI, next build también.
   - Valores en VTEX vienen en centavos. Simulation API es la UNICA fuente de precio
     real al cliente.

5. COMUNICACIÓN:
   - Respuestas breves y directas.
   - Analogías simples para explicarme bugs ("la función le pasamos los argumentos
     al revés, entonces no ejecutaba nada pero tampoco tiraba error").
   - Si hay 2 opciones técnicamente equivalentes, elegí vos y seguí. No me interrumpas
     para decisiones triviales.

6. SKILLS:
   - Tenés disponibles todos los anthropic-skills de NitroSales (vtex-master, marketplace-master,
     backend-api, etc.). Usalos cuando corresponda sin pedir permiso.

Arrancá con el ritual del punto 1 y después hacé el punto 2.
```

---

## 📎 Archivos clave para contexto técnico S58

**Si tenés que investigar algo en particular**:

| Tema | Archivo principal |
|---|---|
| Backfill orquestación | `src/app/api/cron/backfill-runner/route.ts` |
| VTEX backfill processor | `src/lib/backfill/processors/vtex-processor.ts` |
| VTEX enrichment helper | `src/lib/connectors/vtex-enrichment.ts` |
| Concurrency helper | `src/lib/sync/concurrency.ts` ← **firma: `withConcurrency(limit, tasks)`** |
| Test de credenciales | `src/lib/onboarding/credential-tests.ts` |
| Audit post-backfill | `src/app/api/admin/vtex-audit-all/route.ts` |
| Debug step-by-step | `src/app/api/admin/debug-vtex-enrichment/route.ts` |
| Re-enrich orders existentes | `src/app/api/admin/vtex-reenrich/route.ts` |
| Catalog refresh (precios) | `src/app/api/sync/vtex/catalog-refresh/route.ts` |
| ML processor | `src/lib/backfill/processors/ml-processor.ts` |

---

_Última actualización: 2026-04-24 ~04:30 ART (cierre S57)._
